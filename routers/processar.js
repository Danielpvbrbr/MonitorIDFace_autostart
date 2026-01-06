const path = require('path');
const { getSession } = require("./getSession");
const { connection } = require("../db");
const { addUser } = require("./addUser");
const { deleteUser } = require("./deleteUser");
const { searchInativePeriod } = require("./searchInativePeriod");
const { loadConfig } = require("../config");
const { logger } = require("../logger");

// Importa o p-limit (certifique-se de ter instalado: npm install p-limit)
const pLimit = require('p-limit');

const config = loadConfig();
let DBName = config?.DB_DATABASE;

// --- CONFIGURAÇÕES DE PERFORMANCE ---
// Quantos equipamentos processar SIMULTANEAMENTE (Ex: 50 equipamentos ao mesmo tempo)
const CONCURRENCY_EQUIPAMENTOS = 50; 

// Quantos comandos enviar SIMULTANEAMENTE para o MESMO equipamento (Cuidado: Hardware embarcado é fraco)
// 2 é um número seguro. Se aumentar muito, o equipamento pode travar.
const CONCURRENCY_COMANDOS_POR_EQUIP = 2; 

const BLOCKED_IPS = ['3.3.3.3', '6.6.6.6', '4.4.4.4', '5.5.5.5', '1.1.1.1'];
let isProcessing = false;

function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    if (BLOCKED_IPS.includes(ip)) return false;
    if (!ip.includes(".")) return false;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;
    return true;
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
                `SELECT NOME, FOTO_PESSOA FROM pessoa WHERE ID_PESSOA=?`,
                [ID_PESSOA]
            );

            if (!rowsPessoa.length) {
                await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Pessoa não encontrada');
                return false;
            }

            const { NOME, FOTO_PESSOA } = rowsPessoa[0];
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
            } else {
                logger.info(`Usuário ${NOME} falha ao adicionar no ${IP_EQUIPAMENTO}`);
                return false;
            }
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
            } else {
                await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Erro ao deletar');
                return false;
            }
        } 
        else {
            await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Comando desconhecido');
            return false;
        }
    } catch (err) {
        await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, `Err: ${err.message}`);
        logger.error(`Erro comando ${COMANDO} pessoa ${ID_PESSOA}: ${err.message}`);
        return false;
    }
}

async function processarEquipamento(conn, IP_EQUIPAMENTO, comandos) {
    // Tenta obter sessão antes de iniciar os comandos para validar conexão
    const session = await getSession(IP_EQUIPAMENTO);
    
    if (!session) {
        // Se não conecta, marca tudo como erro rapidamente e aborta
        // Usamos Promise.all para marcar no banco rápido em paralelo
        const limitUpdate = pLimit(10); 
        const updates = comandos.map(item => 
            limitUpdate(() => marcarComoErro(conn, IP_EQUIPAMENTO, item.ID_PESSOA, item.COMANDO, 'OFFLINE'))
        );
        await Promise.all(updates);
        return;
    }

    // Limitador para não afogar O MESMO equipamento com requisições HTTP
    const limitCmd = pLimit(CONCURRENCY_COMANDOS_POR_EQUIP);

    const promises = comandos.map(item => {
        return limitCmd(() => processarComando(conn, IP_EQUIPAMENTO, item.COMANDO, item.ID_PESSOA));
    });

    await Promise.all(promises);
}

async function processar() {
    if (isProcessing) {
        console.log('Skip: Processamento anterior ainda rodando...');
        return;
    }

    isProcessing = true;
    const conn = await connection(DBName);

    if (!conn) {
        isProcessing = false;
        return;
    }

    try {
        // 1. Executa limpeza de inativos (sem await para não bloquear o fluxo de entrada se quiser extrema velocidade, 
        // mas é mais seguro manter o await se o banco for o gargalo. Vamos manter await por segurança dos dados).
        await searchInativePeriod();

        // 2. Limpa bloqueados
        if (BLOCKED_IPS.length > 0) {
             await conn.query(
                `UPDATE controle_equipamento 
                 SET EXECUTADO='S', DATA_HORA=NOW(), LOG='IP bloqueado'
                 WHERE EXECUTADO='N' 
                 AND IP_EQUIPAMENTO IN (?)`,
                [BLOCKED_IPS]
            );
        }

        // 3. Busca comandos pendentes
        // DICA: Adicione um LIMIT se a tabela for monstruosa, mas se for fluxo contínuo, ok.
        const [rowsEquip] = await conn.query(
            `SELECT COMANDO, IP_EQUIPAMENTO, ID_PESSOA 
             FROM controle_equipamento 
             WHERE EXECUTADO='N' 
             AND IP_EQUIPAMENTO NOT IN (?)`,
            [BLOCKED_IPS.length ? BLOCKED_IPS : ['0.0.0.0']]
        );

        if (rowsEquip.length === 0) {
            isProcessing = false;
            return;
        }

        logger.info(`Processando ${rowsEquip.length} comandos pendentes...`);

        // 4. Agrupa por IP
        const equipamentosMap = new Map();
        for (const line of rowsEquip) {
            const { IP_EQUIPAMENTO } = line;
            if (!isValidIP(IP_EQUIPAMENTO)) continue;

            if (!equipamentosMap.has(IP_EQUIPAMENTO)) {
                equipamentosMap.set(IP_EQUIPAMENTO, []);
            }
            equipamentosMap.get(IP_EQUIPAMENTO).push(line);
        }

        // 5. PROCESSAMENTO PARALELO DE EQUIPAMENTOS
        // Aqui está a mágica da velocidade. Atacamos vários IPs ao mesmo tempo.
        const limitEquip = pLimit(CONCURRENCY_EQUIPAMENTOS);
        
        const promises = Array.from(equipamentosMap.entries()).map(([IP, cmds]) => {
            return limitEquip(() => processarEquipamento(conn, IP, cmds));
        });

        await Promise.all(promises);

    } catch (err) {
        logger.error("Erro fatal no loop de processamento:", err);
    } finally {
        isProcessing = false;
    }
}

module.exports = { processar, isValidIP, BLOCKED_IPS };