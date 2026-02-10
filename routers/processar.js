const { getSession } = require("./getSession");
const { connection } = require("../db");
const { addUser } = require("./addUser");
const { deleteUser } = require("./deleteUser");
const { searchInativePeriod } = require("./searchInativePeriod");
const { loadConfig } = require("../config");
const { logger } = require("../logger");
const { photo_ } = require("../getPhoto")

const pLimit = require('p-limit');

const config = loadConfig();
let DBName = config?.DB_DATABASE;

const CONCURRENCY_EQUIPAMENTOS = 50;
const CONCURRENCY_COMANDOS_POR_EQUIP = 5;
const BLOCKED_IPS = ['3.3.3.3', '6.6.6.6', '4.4.4.4', '5.5.5.5', '1.1.1.1'];
let isProcessing = false;

function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    if (BLOCKED_IPS.includes(ip)) return false;
    if (!ip.includes(".")) return false;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipRegex.test(ip);
}

async function marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, mensagem) {
    try {
        await conn.query(
            `UPDATE controle_equipamento 
             SET EXECUTADO='S', DATA_HORA=NOW(), LOG=? 
             WHERE ID_PESSOA=? AND IP_EQUIPAMENTO=? AND COMANDO=?`,
            [mensagem, ID_PESSOA, IP_EQUIPAMENTO, COMANDO]
        );
    } catch (err) {
        logger.error(`Erro ao marcar como erro: ${err.message}`);
    }
}

async function processarComando(conn, IP_EQUIPAMENTO, COMANDO, ID_PESSOA) {
    try {
        if (COMANDO === "inc_usuario") {
            const [rowsPessoa] = await conn.query(
                `SELECT NOME FROM pessoa WHERE ID_PESSOA=?`,
                [ID_PESSOA]
            );
            const folderName = config?.DB_DATABASE.split("db")[1];
            const FOTO_PESSOA = await photo_(folderName, ID_PESSOA);

            if (!rowsPessoa.length) {
                await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Pessoa não encontrada');
                return false;
            }

            const { NOME } = rowsPessoa[0];
            // addUser já está otimizado e com logs visuais
            const resultado = await addUser(IP_EQUIPAMENTO, {
                ID_PESSOA,
                NOME,
                FOTO_PESSOA
            });

            if (resultado && resultado.success) {
                await conn.query(
                    `UPDATE controle_equipamento 
                     SET EXECUTADO='S', DATA_HORA=NOW(), LOG='OK'
                     WHERE ID_PESSOA=? AND IP_EQUIPAMENTO=? AND COMANDO=?`,
                    [ID_PESSOA, IP_EQUIPAMENTO, COMANDO]
                );
                return true;
            }
            return false;
        }
        else if (COMANDO === "exc_usuario") {
            const resultado = await deleteUser({
                IP: IP_EQUIPAMENTO,
                user_id: ID_PESSOA
            });

            if (resultado) {
                await conn.query(
                    `UPDATE controle_equipamento 
                     SET EXECUTADO='S', DATA_HORA=NOW(), LOG='OK'
                     WHERE ID_PESSOA=? AND IP_EQUIPAMENTO=? AND COMANDO=?`,
                    [ID_PESSOA, IP_EQUIPAMENTO, COMANDO]
                );
                return true;
            }
            return false;
        }
    } catch (err) {
        await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, `Err: ${err.message}`);
        return false;
    }
}

async function processarEquipamento(conn, IP_EQUIPAMENTO, comandos) {
    const session = await getSession(IP_EQUIPAMENTO);

    if (!session) {
        const limitUpdate = pLimit(10);
        const updates = comandos.map(item =>
            limitUpdate(() => marcarComoErro(conn, IP_EQUIPAMENTO, item.ID_PESSOA, item.COMANDO, 'OFFLINE'))
        );
        await Promise.all(updates);
        return;
    }

    const limitCmd = pLimit(CONCURRENCY_COMANDOS_POR_EQUIP);
    const promises = comandos.map(item => {
        return limitCmd(() => processarComando(conn, IP_EQUIPAMENTO, item.COMANDO, item.ID_PESSOA));
    });

    await Promise.all(promises);
}

async function processar() {
    if (isProcessing) return;

    isProcessing = true;
    
    // --- INÍCIO DA MEDIÇÃO ---
    const inicio = Date.now(); 
    
    const conn = await connection(DBName);
    if (!conn) {
        isProcessing = false;
        return;
    }

    try {
        // 1. Limpeza de inativos
        await searchInativePeriod();

        // 2. Busca comandos pendentes
        const [rowsEquip] = await conn.query(
            `SELECT COMANDO, IP_EQUIPAMENTO, ID_PESSOA 
             FROM controle_equipamento 
             WHERE EXECUTADO='N' 
             AND IP_EQUIPAMENTO NOT IN (?)`,
            [BLOCKED_IPS.length ? BLOCKED_IPS : ['0.0.0.0']]
        );

        if (rowsEquip.length > 0) {
            console.log("\n" + "=".repeat(50));
            logger.info(`PROCESSANDO ${rowsEquip.length} COMANDOS...`);

            const equipamentosMap = new Map();
            for (const line of rowsEquip) {
                const { IP_EQUIPAMENTO } = line;
                if (!isValidIP(IP_EQUIPAMENTO)) continue;
                if (!equipamentosMap.has(IP_EQUIPAMENTO)) equipamentosMap.set(IP_EQUIPAMENTO, []);
                equipamentosMap.get(IP_EQUIPAMENTO).push(line);
            }

            const limitEquip = pLimit(CONCURRENCY_EQUIPAMENTOS);
            const promises = Array.from(equipamentosMap.entries()).map(([IP, cmds]) => {
                return limitEquip(() => processarEquipamento(conn, IP, cmds));
            });

            await Promise.all(promises);

            // --- FIM DA MEDIÇÃO E EXIBIÇÃO ---
            const fim = Date.now();
            const tempoTotal = ((fim - inicio) / 1000).toFixed(2);
            
            logger.info(`TUDO PROCESSADO EM: ${tempoTotal} segundos`);
            console.log("=".repeat(50) + "\n");
        }

    } catch (err) {
        logger.error("Erro fatal no loop:", err);
    } finally {
        isProcessing = false;
    }
}

module.exports = { processar, isValidIP, BLOCKED_IPS };