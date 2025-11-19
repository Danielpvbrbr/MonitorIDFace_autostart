const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));
const { logger } = require("../logger")
const { loadConfig } = require("../config");
const { connection } = require("../db");
const config = loadConfig();
let DBName = config?.DB_DATABASE;

const LOGIN = config?.LOGIN;
const PASSWORD = config?.PASSWORD;

/**
 * Faz login em um equipamento e obtém o token de sessão
 * @param {string} IP - Endereço IP do equipamento
 * @returns {string|null} Token de sessão ou null em caso de erro
 */
async function login(IP) {
    const url = `http://${IP}/login.fcgi`;
    const conn = await connection(DBName);

    if (!conn) {
        console.warn('Processamento ignorado - banco indisponível');
        return;
    }

    try {
        const response = await axios.post(
            url,
            {
                login: LOGIN,
                password: PASSWORD,
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000 // 10 segundos de timeout
            }
        );

        if (response.data.session) {
            const sessionToken = response.data.session;
            global.sessionsMap.set(IP, sessionToken);

            try {
                await conn.query(
                    `UPDATE equipamento SET GUI_FACIAL=? WHERE NR_IP=?`,
                    [sessionToken, IP]
                );
            } catch (err) {
                logger.error(`Erro ao atualizar token no banco: ${err.message}`);
                try {
                    await conn.query(
                        `UPDATE equipamento SET GUI_FACIAL=? WHERE NR_IP=?`,
                        ["", IP]
                    );
                } catch (err2) {
                    logger.error(`Erro ao limpar token no banco (fallback): ${err2.message}`);
                }
            }

            return sessionToken;
        }

        logger.error(`Login retornou sem token para ${IP}`);
        return null;
    } catch (err) {
        logger.error(`Erro ao fazer login em ${IP}:`, err.message);
        return null;
    }
}

module.exports = { login };