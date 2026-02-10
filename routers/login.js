const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));
const { logger } = require("../logger");
const { loadConfig } = require("../config");
const { connection } = require("../db");

const config = loadConfig();
const DBName = config?.DB_DATABASE;
const LOGIN = config?.LOGIN;
const PASSWORD = config?.PASSWORD;

// Variável de controle para não rodar um ciclo em cima do outro
let isLoginRunning = false;

function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const cleanIp = ip.trim();
    if (/[a-zA-Z]/.test(cleanIp)) return false;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipRegex.test(cleanIp);
}

async function cicloDeLogin() {
    if (isLoginRunning) {
        console.log("[LOGIN MANAGER] Ciclo anterior ainda em andamento. Aguardando...");
        return;
    }

    isLoginRunning = true;
    const conn = await connection(DBName);

    if (!conn) {
        logger.error("[LOGIN MANAGER] Sem conexão com o banco de dados.");
        isLoginRunning = false;
        return;
    }

    try {
        console.log("\n[LOGIN MANAGER] Iniciando ciclo de renovação...");

        const [equipamentos] = await conn.query(
            `SELECT DISTINCT NR_IP FROM equipamento WHERE NR_IP IS NOT NULL AND NR_IP != ''`
        );

        const ipsValidos = equipamentos
            .map(e => e.NR_IP.trim())
            .filter(ip => isValidIP(ip));

        if (ipsValidos.length === 0) {
            console.log("[LOGIN MANAGER] Nenhum IP válido encontrado.");
            isLoginRunning = false;
            return;
        }

        for (const IP of ipsValidos) {
            const url = `http://${IP}/login.fcgi`;

            try {
                // 1. LOGIN
                const response = await axios.post(
                    url,
                    { login: LOGIN, password: PASSWORD },
                    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
                );

                if (response.data && response.data.session) {
                    const sessionToken = response.data.session;
                    global.sessionsMap.set(IP, sessionToken);

                    // 2. BUSCA USUÁRIOS SEM FOTO (Timestamp NULL ou 0)
                    const resSemFoto = await axios.post(
                        `http://${IP}/load_objects.fcgi?session=${sessionToken}`,
                        {
                            object: "users",
                            where: [
                                { object: "users", field: "image_timestamp", operator: "IS NULL", value: "", connector: "OR" },
                                { object: "users", field: "image_timestamp", operator: "=", value: 0 }
                            ]
                        },
                        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
                    );

                    // 3. BUSCA USUÁRIOS COM FOTO (Timestamp != 0)
                    const resComFoto = await axios.post(
                        `http://${IP}/load_objects.fcgi?session=${sessionToken}`,
                        {
                            object: "users",
                            where: [
                                { object: "users", field: "image_timestamp", operator: "!=", value: 0 }
                            ]
                        },
                        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
                    );

                    // CALCULA QUANTIDADES (Com proteção para array vazio)
                    const listaSemFoto = resSemFoto.data && resSemFoto.data.users ? resSemFoto.data.users : [];
                    const qtdSemFoto = listaSemFoto.length;

                    const listaComFoto = resComFoto.data && resComFoto.data.users ? resComFoto.data.users : [];
                    const qtdComFoto = listaComFoto.length;

                    console.log(`[${IP}] OK | Sem Foto: ${qtdSemFoto} | Com Foto: ${qtdComFoto}`);

                    // 4. ATUALIZA O BANCO COM TUDO DE UMA VEZ
                    // Mapeamento conforme seu pedido: QTD_USUARIO = Sem Foto, QTD_FACE = Com Foto
                    await conn.query(
                        `UPDATE equipamento SET GUI_FACIAL=?, QTD_USUARIO=?, QTD_FACE=? WHERE NR_IP=?`,
                        [sessionToken, qtdSemFoto, qtdComFoto, IP]
                    );
                }

            } catch (err) {
                // EM CASO DE ERRO (OFFLINE)
                global.sessionsMap.delete(IP);

                let msgErro = err.message;
                if (err.code === 'ECONNABORTED') msgErro = 'Timeout (Lento/Offline)';
                if (err.code === 'ENOTFOUND') msgErro = 'IP não encontrado';

                console.error(`[FALHA] ${IP} - ${msgErro}`);

                try {
                    // Se falhou, limpa o token. Não atualizamos as quantidades pois não sabemos.
                    await conn.query(
                        `UPDATE equipamento SET GUI_FACIAL=NULL WHERE NR_IP=?`,
                        [IP]
                    );
                } catch (dbErr) { /* ignora */ }
            }
        }

        console.log("[LOGIN MANAGER] Ciclo finalizado.\n");

    } catch (error) {
        logger.error(`[LOGIN MANAGER] Erro fatal: ${error.message}`);
    } finally {
        isLoginRunning = false;
    }
}

function getCachedToken(IP) {
    return global.sessionsMap.get(IP) || null;
}

module.exports = { cicloDeLogin, getCachedToken };