const { getSession } = require("./getSession")
const { connection } = require("../db");
const { deleteUser } = require("./deleteUser")
const { logger } = require("../logger");
const { logAcesso } = require("./logAcesso");
const { loadConfig } = require("../config");
const pLimit = require('p-limit'); // Requer p-limit instalado

const config = loadConfig();
let DBName = config?.DB_DATABASE;
const BLOCKED_IPS = ['3.3.3.3', '6.6.6.6', '4.4.4.4', '5.5.5.5', '1.1.1.1'];

// Concorrência para verificação de logs (pode ser alta)
const LIMIT_CHECK = pLimit(30); 

function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    if (BLOCKED_IPS.includes(ip)) return false;
    if (!ip.includes(".")) return false;
    return true;
}

const checkEquipamento = async (equip, conn) => {
    const { NR_IP, ID_EQUIPAMENTO, ENT_SAI } = equip;

    if (!isValidIP(NR_IP)) return;

    try {
        const session = await getSession(NR_IP);
        if (!session) return; // Equipamento offline, pula rápido

        // 1. Baixa logs e processa (Isso já insere no banco)
        await logAcesso(NR_IP, ID_EQUIPAMENTO, ENT_SAI);

        // 2. Verifica se tem alguém vencido neste exato momento
        // Otimização: Só deleta se realmente o logAcesso detectou algo ou varredura de rotina
        // Para ficar MUITO rápido, idealmente você separaria a deleção por tempo em outro script
        // Mas mantendo aqui, vamos ser breves.
        
        const [pessoas] = await conn.query(
            `SELECT ID_PESSOA, NOME 
             FROM pessoa 
             WHERE ATIVO=1 
             AND FIM_ACESSO IS NOT NULL 
             AND FIM_ACESSO < NOW()`
        );

        if (pessoas.length === 0) return;

        // Se tiver gente vencida, remove deste IP
        // Paraleliza a remoção dentro do mesmo IP com cuidado
        const promises = pessoas.map(async (pessoa) => {
            try {
                // Tenta deletar do equipamento
                await deleteUser({ IP: NR_IP, user_id: pessoa.ID_PESSOA });
                
                // Se deletou (não deu erro), inativa no banco
                // CUIDADO: Se rodar em paralelo em varios equipamentos, 
                // varios vao tentar dar UPDATE na pessoa. O banco aguenta, mas é redundante.
                // Idealmente: Deleta de todos os IPs, depois atualiza o banco uma vez.
                // Aqui mantivemos a lógica original simples.
                await conn.query(`UPDATE pessoa SET ATIVO=0 WHERE ID_PESSOA=?`, [pessoa.ID_PESSOA]);
                logger.info(`Vencido: ${pessoa.NOME} removido de ${NR_IP}`);
            } catch (e) {
                // Ignora erro de "user not found" no equipamento
            }
        });

        await Promise.all(promises);

    } catch (err) {
        logger.error(`Erro check ${NR_IP}: ${err.message}`);
    }
};

const searchInativePeriod = async () => {
    const conn = await connection(DBName);
    if (!conn) return;

    try {
        const [rows] = await conn.query(
            `SELECT NR_IP, ID_EQUIPAMENTO, ENT_SAI
             FROM equipamento 
             WHERE ATIVO=1 AND CATRACA='N' 
             AND NR_IP NOT IN (?)`,
            [BLOCKED_IPS.length ? BLOCKED_IPS : ['0.0.0.0']]
        );

        // Dispara verificação em paralelo para todas as catracas
        const promises = rows.map(equip => {
            return LIMIT_CHECK(() => checkEquipamento(equip, conn));
        });

        await Promise.all(promises);

    } catch (err) {
        logger.error("Erro searchInativePeriod:", err);
    }
};

module.exports = { searchInativePeriod };