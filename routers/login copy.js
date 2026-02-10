const { connection } = require("../db");
const axios = require('axios'); // use o caminho do axios que você já tem
const { loadConfig } = require("../config");

const config = loadConfig();
const internalCache = new Map();

async function renovarTodosLogins() {
    const conn = await connection(config?.DB_DATABASE);
    if (!conn) return;

    try {
        // Busca todos os IPs únicos que têm comandos pendentes ou que estão no sistema
        const [equipamentos] = await conn.query(`SELECT DISTINCT NR_IP FROM equipamento WHERE NR_IP IS NOT NULL`);

        for (const equip of equipamentos) {
            const IP = equip.NR_IP;
            try {
                const response = await axios.post(`http://${IP}/login.fcgi`, 
                    { login: config.LOGIN, password: config.PASSWORD },
                    { timeout: 5000 }
                );

                if (response.data.session) {
                    const token = response.data.session;
                    
                    // Atualiza Memória
                    internalCache.set(IP, token);
                    global.sessionsMap.set(IP, token);

                    // Atualiza Banco
                    await conn.query(`UPDATE equipamento SET GUI_FACIAL=? WHERE NR_IP=?`, [token, IP]);
                    console.log(`[LOGIN] IP: ${IP} - Token Renovado`);
                }
            } catch (err) {
                // Se falhar (offline), limpa o token
                internalCache.delete(IP);
                global.sessionsMap.delete(IP);
                await conn.query(`UPDATE equipamento SET GUI_FACIAL=NULL WHERE NR_IP=?`, [IP]).catch(() => {});
                console.error(`[LOGIN] IP: ${IP} - Equipamento Offline`);
            }
        }
    } finally {
        // Se sua conexão exigir fechar manual: await conn.end();
    }
}

// Função simples para o getSession usar
function getCachedToken(IP) {
    return internalCache.get(IP) || null;
}

module.exports = { renovarTodosLogins, getCachedToken };