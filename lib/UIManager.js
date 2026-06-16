const chalk = require('chalk');
const readline = require('readline');

class UIManager {
    constructor(authManager, sessionManager) {
        this.authManager = authManager;
        this.sessionManager = sessionManager;
        this.statusLines = 2;
        this.setupTerminal();
    }

    setupTerminal() {
        // Clear screen and set scroll region
        process.stdout.write('\x1b[2J\x1b[H');
        const height = process.stdout.rows;
        // Set scrolling region: 1 to (height - statusLines)
        process.stdout.write(`\x1b[1;${height - this.statusLines}r`);
        // Move cursor to top
        process.stdout.write('\x1b[H');

        // Periodically update the status line
        setInterval(() => this.updateStatus(), 1000);

        // Handle terminal resize
        process.stdout.on('resize', () => {
            const newHeight = process.stdout.rows;
            process.stdout.write(`\x1b[1;${newHeight - this.statusLines}r`);
            this.updateStatus();
        });
    }

    updateStatus() {
        const height = process.stdout.rows;
        const width = process.stdout.columns;
        let remaining = this.authManager.getRemainingTime();
        
        // Auto-refresh PIN if expired
        if (remaining <= 0) {
            this.authManager.generatePin();
            remaining = this.authManager.getRemainingTime();
        }

        const pin = this.authManager.pin;
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Save cursor position
        process.stdout.write('\x1b[s');

        // Move to the status area (last two lines)
        process.stdout.write(`\x1b[${height - 1};1H`);
        process.stdout.write(chalk.bgBlue.white(''.padEnd(width, ' ')));
        process.stdout.write(`\x1b[${height - 1};1H`);
        
        const activeSession = this.sessionManager.getSession(this.sessionManager.activeLocalSessionId);
        const sessionTitle = activeSession ? activeSession.title : 'None';
        process.stdout.write(chalk.bgBlue.white(` [STATUS] Active: ${chalk.bold(sessionTitle)} (${global.activeSessions || 0} total) | Connected: ${global.connectedClients || 0} `));

        process.stdout.write(`\x1b[${height};1H`);
        process.stdout.write(chalk.bgWhite.black(''.padEnd(width, ' ')));
        process.stdout.write(`\x1b[${height};1H`);
        const pinText = ` [AUTH] PIN: ${chalk.bold(pin)} (${timeStr}) | Ctrl+R: New PIN | Ctrl+T: New Session | Ctrl+S: Switch | Ctrl+Q: Stop `;
        process.stdout.write(chalk.bgWhite.black(pinText.substring(0, width)));

        // Restore cursor position
        process.stdout.write('\x1b[u');
    }

    log(message) {
        // Normal console.log will work within the scrolling region
        console.log(message);
    }
}

module.exports = UIManager;
