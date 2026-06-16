let pty;
try {
    // Standard require for normal development (node server.js)
    pty = require('node-pty');
} catch (e) {
    // Fallback for Node.js SEA mode where standard require can't load from disk
    const { createRequire } = require('module');
    const requireFromDisk = createRequire(process.execPath);
    pty = requireFromDisk('node-pty');
}

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getLogsDir } = require('./Utils');

class SessionManager {
    constructor(broadcast, localOutput) {
        this.sessions = new Map();
        this.activeLocalSessionId = null;
        this.sessionCounter = 0;
        this.broadcast = broadcast;
        this.localOutput = (session, data) => {
            if (localOutput && session.id === this.activeLocalSessionId) {
                localOutput(this.filterTerminalSequences(data));
            }
        };
        this.logsDir = getLogsDir();
        this.maxLogSize = 5 * 1024 * 1024; // 5MB per file
        this.maxLogFiles = 5; // Keep up to 5 rotated files per session
        // Run cleanup asynchronously to avoid blocking startup
        this.cleanOldLogs().catch(console.error);
    }

    // Filter out sequences that should never be displayed or logged
    // These are fundamentally internal terminal-application handshakes
    cleanRawData(data) {
        if (data.indexOf('\x1b') === -1) return data;
        
        // Filter out terminal handshakes/reports from logs and local console.
        // These are responses to DA (c), DSR (R/n), XTMODKEYS (m), Kitty (u), etc.
        // We catch: CSI R (Position Report), CSI n (Status), CSI c (DA), etc.
        return data.replace(/\x1b\[[?>=]?[\d;]*[Rcmut]/g, (match) => {
            // Keep SGR (colors/styles) but filter XTMODKEYS responses
            if (match.endsWith('m') && !match.startsWith('\x1b[>')) return match;
            // Keep "Restore Cursor" (CSI u) but filter Kitty responses (CSI ? u)
            if (match.endsWith('u') && !match.includes('?')) return match;
            // Keep "Tab" or other simple 't' if any, but filter window reports (CSI digits t)
            if (match.endsWith('t') && !/\d/.test(match)) return match;
            // Filter all R, n, c
            return '';
        });
    }

    // Filter out sequences that interfere with the server's status line UI
    filterTerminalSequences(data) {
        // First clean raw internal handshakes to keep local terminal quiet
        const cleaned = this.cleanRawData(data);
        if (cleaned.indexOf('\x1b') === -1) return cleaned;
        
        // Remove OSC sequences (like window title setting) to prevent local flickering
        return cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    }

    // Extract metadata (Title)
    processMetadata(session, data) {
        if (data.indexOf('\x1b') === -1) return;

        // Handle Window Title (OSC 0/2)
        const titleMatch = data.match(/\x1b\][02];([^\x07\x1b]+)(?:\x07|\x1b\\)/);
        if (titleMatch) {
            let newTitle = titleMatch[1];
            if (!newTitle.includes(`#${session.index}`)) {
                newTitle = `${newTitle} (#${session.index})`;
            }
            if (newTitle !== session.title) {
                session.title = newTitle;
                this.broadcast({ type: 'TITLE', sessionId: session.id, title: session.title });
            }
        }
    }

    createSession(command, args = []) {
        const id = uuidv4();
        const logFile = path.join(this.logsDir, `session_${id}.log`);
        
        // Use provided command, or env SHELL, or fallback to /bin/zsh
        const shell = command || process.env.SHELL || '/bin/zsh';
        
        // Clean environment to prevent inheriting terminal-specific behavior
        const env = { ...process.env };
        delete env.TERM_PROGRAM;
        delete env.TERM_PROGRAM_VERSION;
        delete env.TERM_SESSION_ID;
        env.PROMPT_EOL_MARK = '';
        env.TERM = 'xterm-256color';

        const index = ++this.sessionCounter;

        const ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.env.HOME || process.cwd(),
            env: env
        });

        const baseTitle = command || path.basename(shell);
        const session = {
            id,
            index,
            title: `${baseTitle} (#${index})`,
            process: ptyProcess,
            logFile,
            startTime: new Date()
        };

        this.sessions.set(id, session);
        if (!this.activeLocalSessionId) {
            this.activeLocalSessionId = id;
        }
        global.activeSessions = this.sessions.size;

        ptyProcess.onData((data) => {
            // Process metadata and handshakes (non-destructive check)
            // MUST be before any filtering
            this.processMetadata(session, data);

            // Output filtered data to local console to keep it clean
            // filterTerminalSequences already handles OSC and other noise
            if (this.localOutput) {
                this.localOutput(session, data);
            }
            
            // Process asynchronously for broadcast and logs
            setImmediate(() => {
                // Write RAW data to log for faithful playback
                this.writeToLog(logFile, data);
                
                // Broadcast RAW data to mobile app
                // The mobile terminal emulator (xterm) should handle raw escape sequences better
                this.broadcast({
                    type: 'DATA',
                    sessionId: id,
                    content: data
                });
            });
        });

        ptyProcess.onExit(() => {
            this.sessions.delete(id);
            if (this.activeLocalSessionId === id) {
                const remaining = Array.from(this.sessions.keys());
                this.activeLocalSessionId = remaining.length > 0 ? remaining[0] : null;
                
                // Clear screen and redraw history if switching
                if (this.activeLocalSessionId) {
                    process.stdout.write('\x1b[2J\x1b[H');
                    const newSession = this.sessions.get(this.activeLocalSessionId);
                    if (newSession && fs.existsSync(newSession.logFile)) {
                        const history = fs.readFileSync(newSession.logFile, 'utf8');
                        process.stdout.write(this.filterTerminalSequences(history));
                    }
                }
            }
            global.activeSessions = this.sessions.size;
            this.broadcast({
                type: 'SESSION_CLOSED',
                sessionId: id
            });
        });

        return session;
    }

    async writeToLog(logFile, data) {
        try {
            let stats;
            try {
                stats = await fs.promises.stat(logFile);
            } catch (e) {
                stats = null;
            }

            // Rotate if file exceeds max size
            if (stats && stats.size > this.maxLogSize) {
                await this.rotateLog(logFile);
            }
            await fs.promises.appendFile(logFile, data);
        } catch (e) {
            console.error('Failed to write log:', e);
        }
    }

    // Rotate log file: session_xxx.log -> session_xxx.log.1 -> .2 -> etc.
    async rotateLog(logFile) {
        try {
            // Remove oldest file if it exceeds max files
            const baseName = logFile;
            const oldestFile = `${baseName}.${this.maxLogFiles}`;
            try {
                await fs.promises.unlink(oldestFile);
            } catch (e) {
                // Ignore if doesn't exist
            }

            // Shift existing rotated files down
            for (let i = this.maxLogFiles - 1; i >= 1; i--) {
                const src = `${baseName}.${i}`;
                const dst = `${baseName}.${i + 1}`;
                try {
                    await fs.promises.rename(src, dst);
                } catch (e) {
                    // Ignore if doesn't exist
                }
            }

            // Rotate current file to .1
            await fs.promises.rename(logFile, `${logFile}.1`);
        } catch (e) {
            console.error('Failed to rotate log:', e);
        }
    }

    getSession(id) {
        return this.sessions.get(id);
    }

    resizeSession(id, cols, rows) {
        const session = this.sessions.get(id);
        if (session && session.process) {
            try {
                session.process.resize(cols, rows);
            } catch (e) {
                console.error(`Failed to resize session ${id}:`, e);
            }
        }
    }

    getAllSessions() {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            title: s.title
        }));
    }

    switchSession() {
        const ids = Array.from(this.sessions.keys());
        if (ids.length <= 1) return;

        const currentIndex = ids.indexOf(this.activeLocalSessionId);
        const nextIndex = (currentIndex + 1) % ids.length;
        this.activeLocalSessionId = ids[nextIndex];

        // Clear screen and redraw history of the new active session
        process.stdout.write('\x1b[2J\x1b[H');
        const newSession = this.sessions.get(this.activeLocalSessionId);
        if (newSession && fs.existsSync(newSession.logFile)) {
            const history = fs.readFileSync(newSession.logFile, 'utf8');
            process.stdout.write(this.filterTerminalSequences(history));
        }
        
        return newSession;
    }

    async cleanOldLogs() {
        // Clean logs older than 7 days (including rotated files)
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000;
        try {
            const files = await fs.promises.readdir(this.logsDir);
            for (const file of files) {
                // Match main log files and rotated files (session_*.log, session_*.log.1, etc.)
                if (!file.startsWith('session_') || !file.endsWith('.log')) continue;

                const filePath = path.join(this.logsDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (now - stats.mtimeMs > maxAge) {
                        await fs.promises.unlink(filePath);
                        console.log(`[SESSION] Cleaned old log: ${file}`);
                    }
                } catch (e) {
                    // File might have been deleted already
                }
            }
        } catch (e) {
            console.error('Failed to clean old logs:', e);
        }
    }
}

module.exports = SessionManager;
