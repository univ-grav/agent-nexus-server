const fs = require('fs');
const path = require('path');

/**
 * Get user data directory (~/.agent-nexus)
 */
function getUserDataDir() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const userDataDir = path.join(homeDir, '.agent-nexus');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }
    return userDataDir;
}

/**
 * Get logs directory (~/.agent-nexus/logs)
 */
function getLogsDir() {
    const logsDir = path.join(getUserDataDir(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
}

module.exports = {
    getUserDataDir,
    getLogsDir
};
