const path = require('path');
const fs = require('fs');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));
const { loadConfig } = require("../config");
const { getSession } = require("./getSession");
const { logger } = require("../logger");
const { connection } = require("../db");
const { inativarVisitante } = require("./inativarVisitante")
const config = loadConfig();
const DBName = config?.DB_DATABASE;

// Função principal
const logAcesso = async (IP, ID_EQUIPAMENTO) => {
    const session = await getSession(IP);
    if (!session) {
        logger.info(`Sessão não disponível para ${IP}`);
        return;
    }

    const conn = await connection(DBName);

    if (!conn) {
        logger.info("Conexão com banco falhou");
        return;
    }

    try {
        // Busca logs do equipamento
        const response = await axios.post(
            `http://${IP}/load_objects.fcgi?session=${session}`,
            { object: "access_logs" },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000
            }
        );

        const logs = response.data?.access_logs;

        if (!logs?.length) {
            console.log("Nenhum log encontrado");
            return;
        }

        logger.info("VERIFICANDO SAIDA DE VISITANTE.....");
        
        for (const log of logs) {

            if (Number(log.user_id) == 0) {
                continue;
            }

            if (!isToday(log.time)) {
                continue;
            }

            const dataHora = new Date(log.time * 1000)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            const [EQUIP] = await conn.query(
                `SELECT ENT_SAI FROM equipamento WHERE ID_EQUIPAMENTO = ?`, [ID_EQUIPAMENTO]
            );

            const [existing] = await conn.query(
                `SELECT 1 FROM log_acesso 
                 WHERE ID_PESSOA = ? AND ID_EQUIPAMENTO = ? AND RECNOID = ?`,
                [log.user_id, ID_EQUIPAMENTO, log.id]
            );

            if (existing.length) {
                continue;
            }

            await inativarVisitante({
                ID_PESSOA: log.user_id,
                ENT_SAI: EQUIP[0].ENT_SAI,
                conn,
                IP,
                ID_EQUIPAMENTO
            })

            // Insere log se não existir
            const [res] = await conn.query(
                `INSERT INTO log_acesso (STATUS, ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA, RECNOID, ENT_SAI)
                 VALUES (1, ?, ?, ?, ?, ?)`,
                [log.user_id, ID_EQUIPAMENTO, dataHora, log.id, EQUIP[0].ENT_SAI]
            );

            logger.info("Inserido novo log:", res.insertId);
        }

    } catch (err) {
        console.error("ERRO:", err);
        logger.error(`Erro ao processar logs de ${IP}: ${err.message}`);
        logger.error(`Stack: ${err.stack}`);
    } finally {
        await conn.end();
    }
};

function isToday(timestampSeconds) {
    const date = new Date(timestampSeconds * 1000);
    const now = new Date();

    const isToday = (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
    );

    return isToday;
}

module.exports = { logAcesso };