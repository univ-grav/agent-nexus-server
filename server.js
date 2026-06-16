const WebSocket = require('ws');
const { Bonjour } = require('bonjour-service');
const bonjour = new Bonjour();
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const authManager = require('./lib/AuthManager');
const UIManager = require('./lib/UIManager');
const SessionManager = require('./lib/SessionManager');
const Utils = require('./lib/Utils');

// Parse command line arguments
const args = process.argv.slice(2);
let PORT = 8080;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
        PORT = parseInt(args[i + 1], 10);
        if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
            console.error('Invalid port number. Must be between 1 and 65535.');
            process.exit(1);
        }
        i++;
    }
}

// PID file management
const pidFile = path.join(Utils.getUserDataDir(), 'server.pid');

function cleanupPidFile() {
    try {
        if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) {
            fs.unlinkSync(pidFile);
        }
    } catch (e) {
        // Ignore errors during cleanup
    }
}

function checkAndWritePidFile() {
    try {
        // Use exclusive mode 'wx' - atomic operation, fails if file exists
        const fd = fs.openSync(pidFile, 'wx');
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
    } catch (e) {
        if (e.code === 'EEXIST') {
            // File exists - check if process is still running
            try {
                const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
                process.kill(oldPid, 0);
                console.error('Server is already running (PID: ' + oldPid + ').');
                console.error('Only one instance of agent-nexus is allowed.');
                process.exit(1);
            } catch (e2) {
                // Stale PID file - delete and retry
                fs.unlinkSync(pidFile);
                checkAndWritePidFile();
                return;
            }
        } else {
            console.error('Failed to write PID file: ' + e.message);
            process.exit(1);
        }
    }
}

function shutdown() {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    cleanupPidFile();
    process.exit(0);
}

// Register cleanup handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
process.on('uncaughtException', (e) => {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    cleanupPidFile();
    throw e;
});
process.on('exit', () => {
    cleanupPidFile();
});

// Check for existing instance
checkAndWritePidFile();

// Global state for UI
global.activeSessions = 0;
global.connectedClients = 0;

const sessionManager = new SessionManager(broadcast, (data) => {
    process.stdout.write(data);
});

const ui = new UIManager(authManager, sessionManager);

// Broadcast helper
function broadcast(data) {
    // Skip broadcast if no clients connected
    if (global.connectedClients === 0) return;
    
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.isAuthorized) {
            client.send(payload);
        }
    });
}
const wss = new WebSocket.Server({ port: PORT });

// Heartbeat: Keep connections alive
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
        }
    });
}, 15000); // Every 15 seconds

// Helper to update global status and UI
function updateStatus() {
    global.connectedClients = Array.from(wss.clients).filter(c => c.isAuthorized).length;
    ui.updateStatus();
}

wss.on('connection', (ws, req) => {
    ws.isAuthorized = false;
    ws.deviceId = null;
    updateStatus();

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            // Authentication: Initial Pairing
            if (msg.type === 'AUTH') {
                const { pin, deviceId, publicKey } = msg;
                if (authManager.isPinValid(pin)) {
                    ws.isAuthorized = true;
                    ws.deviceId = deviceId;
                    authManager.addTrustedDevice(deviceId, publicKey);
                    ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                    
                    ws.send(JSON.stringify({
                        type: 'SESSION_LIST',
                        sessions: sessionManager.getAllSessions()
                    }));
                    updateStatus();
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Invalid or expired PIN' }));
                }
                return;
            }

            // Authentication: Reconnect (Challenge-Response)
            if (msg.type === 'AUTH_RECONNECT') {
                const { deviceId } = msg;
                if (authManager.getDevicePublicKey(deviceId)) {
                    const challenge = authManager.generateChallenge(ws);
                    ws.send(JSON.stringify({ type: 'CHALLENGE', challenge }));
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Device not recognized. Please pair again.' }));
                }
                return;
            }

            if (msg.type === 'AUTH_SIGNATURE') {
                const { deviceId, signature } = msg;
                if (authManager.verifySignature(ws, deviceId, signature)) {
                    ws.isAuthorized = true;
                    ws.deviceId = deviceId;
                    ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                    
                    ws.send(JSON.stringify({
                        type: 'SESSION_LIST',
                        sessions: sessionManager.getAllSessions()
                    }));
                    updateStatus();
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED', message: 'Signature verification failed' }));
                }
                return;
            }

            // Guard for unauthorized clients
            if (!ws.isAuthorized) return;

            // Session actions
            if (msg.type === 'NEW_SESSION') {
                sessionManager.createSession();
                broadcast({ type: 'SESSION_LIST', sessions: sessionManager.getAllSessions() });
                ui.updateStatus(); // Update for new session
            } else if (msg.type === 'ATTACH') {
                const session = sessionManager.getSession(msg.sessionId);
                if (session && fs.existsSync(session.logFile)) {
                    const content = fs.readFileSync(session.logFile, 'utf8');
                    ws.send(JSON.stringify({
                        type: 'HISTORY',
                        sessionId: msg.sessionId,
                        content: content
                    }));
                }
            } else if (msg.type === 'INPUT') {
                const session = sessionManager.getSession(msg.sessionId);
                if (session) {
                    session.process.write(msg.content);
                }
            } else if (msg.type === 'RESIZE') {
                sessionManager.resizeSession(msg.sessionId, msg.cols, msg.rows);
            }
        } catch (e) {
            ui.log('Error processing message: ' + e.message);
        }
    });

    ws.on('close', () => {
        updateStatus();
    });
});

// mDNS Discovery
bonjour.publish({ name: 'AgentNexus', type: 'agent-nexus', port: PORT });

// Handle local keyboard input using raw data to support terminal handshakes
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

process.stdin.on('data', (data) => {
    // Check for system shortcuts (single byte controls)
    if (data.length === 1) {
        const char = data[0];
        
        // Ctrl+Q: Exit
        if (char === 0x11) {
            shutdown();
        }
        
        // Ctrl+R: Refresh PIN
        if (char === 0x12) {
            authManager.generatePin();
            ui.updateStatus();
            return;
        }
        
        // Ctrl+T: New Session
        if (char === 0x14) {
            const session = sessionManager.createSession();
            sessionManager.activeLocalSessionId = session.id;
            process.stdout.write('\x1b[2J\x1b[H');
            broadcast({ type: 'SESSION_LIST', sessions: sessionManager.getAllSessions() });
            ui.updateStatus();
            return;
        }
        
        // Ctrl+S: Switch Session
        if (char === 0x13) {
            sessionManager.switchSession();
            ui.updateStatus();
            return;
        }
    }

    // Pass all other raw data (including multi-byte escape sequences from terminal) to the PTY
    const activeSession = sessionManager.getSession(sessionManager.activeLocalSessionId);
    if (activeSession) {
        activeSession.process.write(data);
    }
});

// Create a default session to start
sessionManager.createSession();

ui.log('Server started on port ' + PORT);
ui.log('Use local keyboard to operate the terminal');
ui.log('Ctrl+R: refresh PIN | Ctrl+T: new session | Ctrl+S: switch | Ctrl+Q: stop');
