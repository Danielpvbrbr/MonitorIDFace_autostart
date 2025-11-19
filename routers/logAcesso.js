const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));
const { loadConfig } = require("../config");
const { getSession } = require("./getSession");
const { logger } = require("../logger");
const { connection } = require("../db");
const config = loadConfig();
let DBName = config?.DB_DATABASE;

const logAcesso = async (IP, ID_EQUIPAMENTO) => {
    const BASE_URL = `http://${IP}`;
    const session = await getSession(IP);
    const conn = await connection(DBName);

    if (!session) {
        logger.info(`Sem sessão para ${IP}`);
        return;
    }

    try {
        const response = await axios.post(
            `${BASE_URL}/load_objects.fcgi?session=${session}`,
            { object: "access_logs" },
            { headers: { "Content-Type": "application/json" }, timeout: 10000 }
        );

        const logs = response.data?.access_logs;
        if (!logs || !Array.isArray(logs)) return;

        const hoje = new Date().toISOString().slice(0, 10);

        for (let i of logs) {
            // converte epoch -> yyyy-mm-dd hh:mm:ss
            const DATA_HORA = new Date(i.time * 1000).toISOString().slice(0, 19).replace('T', ' ');
            const diaEvento = DATA_HORA.slice(0, 10);

            if (diaEvento !== hoje) continue;

            const ID_PESSOA = i.user_id;
            const STATUS = i.event === 7 ? 1 : 0;

            if (STATUS !== 1) continue;

            const [existing] = await conn.query(
                `SELECT 1 FROM log_acesso WHERE ID_PESSOA=? AND ID_EQUIPAMENTO=? AND DATA_HORA=? LIMIT 1`,
                [ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA]
            );

            if (existing.length > 0) continue;

            await conn.query(
                `INSERT INTO log_acesso (ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA, STATUS) VALUES (?,?,?,?)`,
                [ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA, STATUS]
            );

            // logger.info({ ID_PESSOA, ID_EQUIPAMENTO, DATA_HORA, STATUS });
        }

    } catch (err) {
        logger.error(`Erro ao buscar logs de ${IP}: ${err.message}`);
    } finally {
        await conn.end();
    }
};

module.exports = { logAcesso };
