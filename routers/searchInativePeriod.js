const { getSession } = require("./getSession")
const { connection } = require("../db");
const { deleteUser } = require("../routers/deleteUser")
const { logger } = require("../logger");
const { logAcesso } = require("./logAcesso");
const { loadConfig } = require("../config");
const config = loadConfig();
let DBName = config?.DB_DATABASE;

const BLOCKED_IPS = ['3.3.3.3', '6.6.6.6', '4.4.4.4', '5.5.5.5', '1.1.1.1'];

function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') {
        return false;
    }

    if (BLOCKED_IPS.includes(ip)) {
        return false;
    }

    if (!ip.includes(".")) {
        return false;
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        return false;
    }

    const octetos = ip.split('.');
    for (const octeto of octetos) {
        const num = parseInt(octeto, 10);
        if (num < 0 || num > 255) {
            return false;
        }
    }

    return true;
}

const searchInativePeriod = async () => {
    logger.info("\n--- Verificando usuários com acesso expirado ---");
    const conn = await connection(DBName);

    if (!conn) {
        logger.warn('Processamento ignorado - banco indisponível');
        return;
    }

    try {
        // Busca equipamentos ativos, já filtrando IPs bloqueados
        const [rows] = await conn.query(
            `SELECT NR_IP, ID_EQUIPAMENTO 
             FROM equipamento 
             WHERE ATIVO=1 
             AND CATRACA='N' 
             AND NR_IP NOT IN (?, ?, ?)`,
            BLOCKED_IPS
        );

        // Processa cada equipamento sequencialmente
        for (let equip of rows) {
            const { NR_IP, ID_EQUIPAMENTO, ENT_SAI } = equip;

            // Valida formato do IP
            if (!isValidIP(NR_IP)) {
                logger.warn(`IP inválido ignorado: ${NR_IP}`);
                continue;
            }

            logger.info(`\nVerificando equipamento: ${NR_IP}`);

            try {
                const session = await getSession(NR_IP);

                if (!session) {
                    logger.info(`Não foi possível conectar em ${NR_IP}`);
                    continue;
                }

                await logAcesso(NR_IP, ID_EQUIPAMENTO, ENT_SAI)

                // Busca pessoas com acesso expirado
                const [pessoas] = await conn.query(
                    `SELECT FIM_ACESSO, ID_PESSOA, NOME 
                     FROM pessoa  
                     WHERE ATIVO=1 
                     AND FIM_ACESSO IS NOT NULL 
                     AND FIM_ACESSO < NOW()`
                );

                if (pessoas.length === 0) {
                    logger.info(`Equipamento ${NR_IP}: Nenhum usuário com acesso expirado`);
                    continue;
                }

                let deletados = 0;

                for (let pessoa of pessoas) {
                    const { FIM_ACESSO, ID_PESSOA, NOME } = pessoa;
                    const fim = new Date(FIM_ACESSO);

                    try {
                        logger.info(`Deletando ${NOME} (${ID_PESSOA}) - acesso expirou em ${fim.toLocaleDateString()}`);

                        const resultado = await deleteUser({ IP: NR_IP, user_id: ID_PESSOA });

                        if (resultado) {
                            try {
                                await conn.query(`UPDATE pessoa SET ATIVO=? WHERE ID_PESSOA=?`, [0, ID_PESSOA]);
                                logger.info(`Usuário ${NOME} removido e confirmado`);
                                deletados++;
                            } catch (err) {
                                logger.error(`Erro ao atualizar status da pessoa ${ID_PESSOA}:`, err.message);
                            }
                        }
                    } catch (err) {
                        logger.error(`Erro ao deletar ${ID_PESSOA}:`, err.message);
                    }
                }

                logger.info(`Equipamento ${NR_IP}: ${deletados} usuário(s) removido(s)`);

            } catch (err) {
                logger.error(`Erro ao processar equipamento ${NR_IP}:`, err.message);
            }
        }
    } catch (err) {
        logger.error("Erro em searchInativePeriod:", err);
    } finally {
        await conn.end();
    }
};

module.exports = { searchInativePeriod };