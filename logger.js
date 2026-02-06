// logger.js
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

const streams = [
    { stream: process.stdout }, // console
    { stream: pino.destination({ dest: logFile, sync: false }) } // arquivo
];

const logger = pino(
    {
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams)
);

module.exports = { logger };
