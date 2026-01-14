// logger.js
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// garante a pasta de logs
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

const logger = pino(
    {
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({
        dest: logFile,
        sync: false // melhor performance
    })
);

module.exports = { logger };
