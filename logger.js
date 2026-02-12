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
        timestamp: () => {
            // Cria a data formatada para o fuso de Brasília
            const dataBrasilia = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo", // Define o fuso horário
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false // Formato 24h
            });
            
            // O Pino exige que se retorne a string com a chave "time"
            return `,"time":"${dataBrasilia}"`;
        },
    },
    pino.multistream(streams)
);

module.exports = { logger };