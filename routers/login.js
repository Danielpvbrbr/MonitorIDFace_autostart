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

/**
 * Valida se é um IP puro (ex: 192.168.0.1)
 * Ignora se tiver letras (números de série como AYTK...)
 */
function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // Remove espaços vazios antes e depois
    const cleanIp = ip.trim();

    // Se tiver qualquer letra de A-Z, já reprova (filtra os seriais)
    if (/[a-zA-Z]/.test(cleanIp)) return false;

    // Verifica formato numérico x.x.x.x
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipRegex.test(cleanIp);
}

async function cicloDeLogin() {
    // SE JÁ ESTIVER RODANDO, CANCELA A NOVA EXECUÇÃO PARA NÃO ACUMULAR
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

        // Filtra apenas IPs válidos (remove AYTK e afins)
        const ipsValidos = equipamentos
            .map(e => e.NR_IP.trim()) // Limpa espaços
            .filter(ip => isValidIP(ip)); // Remove letras/seriais

        if (ipsValidos.length === 0) {
            console.log("[LOGIN MANAGER] Nenhum IP válido encontrado para logar.");
            isLoginRunning = false;
            return;
        }

        // console.log(`[LOGIN MANAGER] Processando ${ipsValidos.length} equipamentos válidos...`);

        for (const IP of ipsValidos) {
            const url = `http://${IP}/login.fcgi`;

            try {
                const response = await axios.post(
                    url,
                    { login: LOGIN, password: PASSWORD },
                    { 
                        headers: { "Content-Type": "application/json" },
                        // AUMENTADO PARA 15 SEGUNDOS (Dispositivos lentos não darão mais erro)
                        timeout: 15000 
                    }
                );

                if (response.data && response.data.session) {
                    const sessionToken = response.data.session;

                    // Atualiza memória
                    global.sessionsMap.set(IP, sessionToken);

                    // Atualiza banco
                    await conn.query(
                        `UPDATE equipamento SET GUI_FACIAL=? WHERE NR_IP=?`,
                        [sessionToken, IP]
                    );
                    
                    // Sucesso silencioso (descomente se quiser ver)
                    // console.log(`[OK] ${IP}`);
                } 

            } catch (err) {
                // Remove da memória pois falhou
                global.sessionsMap.delete(IP);

                // Só marca como NULL no banco se for um erro de conexão real
                // Se for timeout, as vezes o aparelho só está lento, mas deixamos NULL para forçar novo login depois
                let msgErro = err.message;
                if (err.code === 'ECONNABORTED') msgErro = 'Timeout (Lento/Offline)';
                if (err.code === 'ENOTFOUND') msgErro = 'IP não encontrado na rede';

                console.error(`[FALHA] ${IP} - ${msgErro}`);

                try {
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
        // LIBERA A TRAVA PARA A PRÓXIMA RODADA
        isLoginRunning = false;
    }
}

function getCachedToken(IP) {
    return global.sessionsMap.get(IP) || null;
}

module.exports = { cicloDeLogin, getCachedToken };