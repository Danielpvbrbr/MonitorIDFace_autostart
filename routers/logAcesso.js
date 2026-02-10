const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));
const { loadConfig } = require("../config");
const { getSession } = require("./getSession");
const { logger } = require("../logger");
const { connection } = require("../db");
const { inativarVisitante } = require("./inativarVisitante")
const config = loadConfig();
const DBName = config?.DB_DATABASE;

const logAcesso = async (IP, ID_EQUIPAMENTO) => {
    const session = await getSession(IP);
    if (!session) return;

    const conn = await connection(DBName);
    if (!conn) return;

    try {
        const response = await axios.post(
            `http://${IP}/load_objects.fcgi?session=${session}`,
            { object: "access_logs" },
            { headers: { "Content-Type": "application/json" }, timeout: 5000 }
        );

        const logs = response.data?.access_logs;
        if (!logs?.length) return;

        // Pega apenas os 3 últimos registros e não avisa no console (trabalha em silêncio)
        const logsParaProcessar = logs.reverse().slice(0, 3); 

        const [rowsEquip] = await conn.query(
            `SELECT E.ENT_SAI, N.ID_NIVEL_ACESSO FROM equipamento E
             LEFT JOIN equipamento_nivel_acesso N ON E.ID_EQUIPAMENTO = N.ID_EQUIPAMENTO
             WHERE E.ID_EQUIPAMENTO = ?`, [ID_EQUIPAMENTO]
        );

        if (!rowsEquip.length) return;

        const ENT_SAI_CACHE = rowsEquip[0].ENT_SAI;
        const ID_NIVEL_CACHE = rowsEquip[0].ID_NIVEL_ACESSO || 0;

        for (const log of logsParaProcessar) {
            if (Number(log.user_id) == 0 || !isToday(log.time)) continue;

            // Verifica se já existe no banco antes de tentar qualquer coisa
            const [existing] = await conn.query(
                `SELECT 1 FROM log_acesso WHERE ID_PESSOA = ? AND ID_EQUIPAMENTO = ? AND RECNOID = ? LIMIT 1`,
                [log.user_id, ID_EQUIPAMENTO, log.id]
            );

            if (existing.length) continue;

            if (ENT_SAI_CACHE === 1) { 
                 await inativarVisitante({ ID_PESSOA: log.user_id, ENT_SAI: ENT_SAI_CACHE, conn, IP, ID_EQUIPAMENTO });
            }

            await conn.query(
                `INSERT INTO log_acesso (STATUS, ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA, RECNOID, ENT_SAI, ID_NIVEL_ACESSO)
                 VALUES (1, ?, ?, ?, ?, ?, ?)`,
                [log.user_id, ID_EQUIPAMENTO, new Date(log.time * 1000).toISOString().slice(0, 19).replace('T', ' '), log.id, ENT_SAI_CACHE, ID_NIVEL_CACHE]
            );
            
            // Opcional: só logar se quiser ver os acessos em tempo real
            // logger.info(`[${IP}] Acesso registrado: ID ${log.user_id}`);
        }

    } catch (err) {
        // Erros de conexão a gente guarda no log, mas não precisa "gritar" no console se for só timeout
    }
};

function isToday(timestampSeconds) {
    const date = new Date(timestampSeconds * 1000);
    const now = new Date();
    return (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear());
}

module.exports = { logAcesso };