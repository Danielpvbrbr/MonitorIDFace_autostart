const { getSession } = require("./getSession")
const { connection } = require("../db");
const { addUser } = require("./addUser")
const { deleteUser } = require("./deleteUser")
const { searchInativePeriod } = require("./searchInativePeriod")
const { loadConfig } = require("../config");
const config = loadConfig();
let DBName = config?.DB_DATABASE;
const { logger } = require("../logger");


/**
 * Lista de IPs que devem ser ignorados
 */
const BLOCKED_IPS = ['3.3.3.3', '6.6.6.6', '4.4.4.4', '5.5.5.5', '1.1.1.1'];

/**
 * Flag para controlar se já existe um processamento em andamento
 */
let isProcessing = false;

/**
 * Valida se o IP está no formato correto e não está na lista de bloqueio
 * @param {string} ip - Endereço IP para validar
 * @returns {boolean} - true se válido, false caso contrário
 */
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

/**
 * Marca registros como executados com erro
 */
async function marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, mensagem) {
    try {
        await conn.query(
            `UPDATE controle_equipamento 
             SET EXECUTADO='S', DATA_HORA=NOW(), LOG=? 
             WHERE ID_PESSOA=? AND IP_EQUIPAMENTO=? AND COMANDO=?`,
            [mensagem, ID_PESSOA, IP_EQUIPAMENTO, COMANDO]
        );
    } catch (err) {
        logger.error(`Erro ao marcar como erro:`, err.message);
    }
}

/**
 * Processa um único comando (inclusão ou exclusão de usuário)
 */
async function processarComando(conn, IP_EQUIPAMENTO, COMANDO, ID_PESSOA) {
    try {
        // INCLUIR USUÁRIO
        if (COMANDO === "inc_usuario") {
            logger.info(`Incluindo usuário ID: ${ID_PESSOA}`);

            const [rowsPessoa] = await conn.query(
                `SELECT NOME, FOTO_PESSOA FROM pessoa WHERE ID_PESSOA=?`,
                [ID_PESSOA]
            );

            if (!rowsPessoa.length) {
                logger.info(`Pessoa ${ID_PESSOA} não encontrada no banco`);
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
                //await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Error a adicionar');
                logger.info(`Usuário ${NOME} não foi confirmado pelo equipamento`);
                return false;
            }
        }

        // EXCLUIR USUÁRIO
        else if (COMANDO === "exc_usuario") {
            logger.info(`Excluindo usuário ID: ${ID_PESSOA}`);

            const [rowsPessoa] = await conn.query(
                `SELECT NOME FROM pessoa WHERE ID_PESSOA=?`,
                [ID_PESSOA]
            );

            const NOME = rowsPessoa.length ? rowsPessoa[0].NOME : `ID ${ID_PESSOA}`;

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
                logger.info(`Usuário ${NOME} excluído e confirmado`);
                return true;
            } else {
                await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Erro ao deletar');
                logger.info(`Usuário ${NOME} não foi confirmado pelo equipamento`);
                return false;
            }
        }

        // COMANDO DESCONHECIDO
        else {
            await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'Comando desconhecido');
            logger.info(`Comando desconhecido: ${COMANDO}`);
            return false;
        }

    } catch (err) {
        await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, `Err`);
        logger.error(`Erro ao processar comando ${COMANDO} para pessoa ${ID_PESSOA}:`, err.message);
        return false;
    }
}

/**
 * Processa um equipamento com todos seus comandos
 */
async function processarEquipamento(conn, IP_EQUIPAMENTO, comandos) {
    logger.info(`\n--- Processando equipamento ${IP_EQUIPAMENTO} (${comandos.length} comandos) ---`);

    try {
        const session = await getSession(IP_EQUIPAMENTO);

        if (!session) {
            logger.info(`${IP_EQUIPAMENTO} ESTA OFF NA REDE. Pulando...`);
            // Marca todos os comandos deste equipamento como erro
            for (const item of comandos) {
                await marcarComoErro(conn, IP_EQUIPAMENTO, item.ID_PESSOA, item.COMANDO, 'EQUIPAMENTO OFF NA REDE');
            }
            return;
        }

        for (const item of comandos) {
            const { COMANDO, ID_PESSOA } = item;
            await processarComando(conn, IP_EQUIPAMENTO, COMANDO, ID_PESSOA);
        }

    } catch (err) {
        logger.error(`Erro ao processar equipamento ${IP_EQUIPAMENTO}:`, err.message);
        // Marca todos os comandos deste equipamento como erro
        for (const item of comandos) {
            await marcarComoErro(conn, IP_EQUIPAMENTO, item.ID_PESSOA, item.COMANDO, 'EQUIPAMENTO OFF NA REDE');
        }
    }
}

/**
 * Função principal que processa comandos de inclusão e exclusão de usuários
 * Comandos possíveis: 'inc_usuario' ou 'exc_usuario'
 */
async function processar() {
    // Verifica se já existe um processamento em andamento
    if (isProcessing) {
        logger.warn('Processamento já em andamento. Aguardando conclusão...');
        return;
    }

    isProcessing = true;
    logger.info("\n=== Iniciando processamento ===");

    const conn = await connection(DBName);

    if (!conn) {
        console.warn('Processamento ignorado - banco indisponível');
        isProcessing = false;
        return;
    }

    try {
        // 1. Remove usuários com acesso expirado
        await searchInativePeriod();

        // 2. Marca IPs bloqueados como erro ANTES de processar
        await conn.query(
            `UPDATE controle_equipamento 
             SET EXECUTADO='S', DATA_HORA=NOW(), LOG='IP bloqueado'
             WHERE EXECUTADO='N' 
             AND IP_EQUIPAMENTO IN (?, ?, ?, ?, ?)`,
            BLOCKED_IPS
        );

        // 3. Busca comandos pendentes (já excluindo IPs bloqueados)
        const [rowsEquip] = await conn.query(
            `SELECT COMANDO, IP_EQUIPAMENTO, ID_PESSOA 
             FROM controle_equipamento 
             WHERE EXECUTADO='N' 
             AND IP_EQUIPAMENTO NOT IN (?, ?, ?, ?, ?)`,
            BLOCKED_IPS
        );

        if (rowsEquip.length == 0) {
            logger.info("Nenhum registro para executar");
            return;
        }

        // 4. Agrupa por equipamento
        const equipamentosMap = new Map();

        for (const line of rowsEquip) {
            const { COMANDO, IP_EQUIPAMENTO, ID_PESSOA } = line;

            if (!isValidIP(IP_EQUIPAMENTO)) {
                // Marca IP inválido como erro
                await marcarComoErro(conn, IP_EQUIPAMENTO, ID_PESSOA, COMANDO, 'IP inválido');
                continue;
            }

            if (!equipamentosMap.has(IP_EQUIPAMENTO)) {
                equipamentosMap.set(IP_EQUIPAMENTO, []);
            }
            equipamentosMap.get(IP_EQUIPAMENTO).push({ COMANDO, ID_PESSOA });
        }

        // 5. Processa cada equipamento sequencialmente (um por vez)
        for (const [IP_EQUIPAMENTO, comandos] of equipamentosMap) {
            await processarEquipamento(conn, IP_EQUIPAMENTO, comandos);
        }

    } catch (err) {
        logger.error("Erro no processamento geral:", err);
    } finally {
        await conn.end();
        isProcessing = false;
        logger.info("\n=== Processamento finalizado ===\n");
    }
}

module.exports = { processar, isValidIP, BLOCKED_IPS };