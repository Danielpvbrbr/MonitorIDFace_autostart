const axios = require('axios');
const http = require('http'); // Necessário para o Agent

const { getSession } = require("./getSession");
const { logger } = require("../logger");

// CONFIGURAÇÃO DE PERFORMANCE (KEEPALIVE)
// Mantém a conexão aberta para evitar re-negociação TCP a cada request
const httpAgent = new http.Agent({ keepAlive: true });

// Instância do Axios otimizada
const client = axios.create({
    httpAgent: httpAgent,
    timeout: 10000,
    headers: { "Content-Type": "application/json" }
});

const addUser = async (IP, data) => {
    const { ID_PESSOA, NOME, FOTO_PESSOA } = data;
    const BASE_URL = `http://${IP}`;

    // Validação básica
    if (!ID_PESSOA || !NOME) {
        return { success: false, error: "Dados inválidos (ID ou Nome faltando)" };
    }

    // Tenta pegar sessão
    const session = await getSession(IP);
    if (!session) {
        throw new Error(`Sem sessão válida para ${IP}`);
    }

    const urlParams = `?session=${session}`;

    try {
        logger.info(`[${IP}] Iniciando envio: ${NOME} (${ID_PESSOA})`);
        const payloadUser = {
            object: "users",
            values: [{
                id: ID_PESSOA,
                name: NOME,
                registration: String(ID_PESSOA),
                password: "",
                salt: String(ID_PESSOA)
            }]
        };

        let userCreated = false;

        // Tenta criar direto (mais rápido para usuários novos)
        try {
            const createResponse = await client.post(
                `${BASE_URL}/create_objects.fcgi${urlParams}`,
                payloadUser
            );
            
            // Verifica se o device retornou erro lógico (ex: duplicate entry)
            if (createResponse.data && createResponse.data.error) {
                throw new Error("Erro lógico: " + JSON.stringify(createResponse.data));
            }
            userCreated = true;

        } catch (errCreate) {
            // Se falhou, assumimos que pode ser duplicidade.
            // Executa a limpeza (DELETE) e tenta criar novamente.
            
            // logger.warn(`[${IP}] Usuário ${ID_PESSOA} já existe ou erro, recriando...`); // Opcional

            // 1.1 Deletar
            try {
                await client.post(
                    `${BASE_URL}/destroy_objects.fcgi${urlParams}`,
                    {
                        object: "users",
                        where: { users: { id: [ID_PESSOA] } }
                    },
                    { timeout: 5000 }
                );
            } catch (ignore) { /* Ignora erro de delete se não existir */ }

            // 1.2 Tenta Criar Novamente (Força Bruta)
            const retryResponse = await client.post(
                `${BASE_URL}/create_objects.fcgi${urlParams}`,
                payloadUser
            );

            if (!retryResponse.data || retryResponse.data.error) {
                throw new Error(`Falha final ao criar usuário: ${JSON.stringify(retryResponse.data)}`);
            }
        }

        logger.info(`[${IP}] Dados de texto (User) OK.`);

        // =================================================================================
        // PASSO 2: PÓS-PROCESSAMENTO PARALELO (Foto + Grupo)
        // Executamos juntos para ganhar tempo
        // =================================================================================
        
        const postActions = [];

        // --- Ação A: Vínculo de Grupo ---
        const payloadUserGroup = {
            object: "user_groups",
            fields: ["user_id", "group_id"],
            values: [{ user_id: ID_PESSOA, group_id: 1 }]
        };
        
        // Adiciona à fila de execução
        postActions.push(
            client.post(`${BASE_URL}/create_objects.fcgi${urlParams}`, payloadUserGroup)
                .catch(err => {
                    // Loga o erro mas não impede o sucesso total se for algo menor
                    logger.error(`[${IP}] Erro ao vincular grupo: ${err.message}`);
                })
        );

        // --- Ação B: Envio da Foto (Se houver) ---
        if (FOTO_PESSOA) {
            const timestamp = Math.floor(Date.now() / 1000);
            const payloadPhoto = {
                match: true, // Importante para reconhecimento facial imediato
                user_images: [{
                    user_id: ID_PESSOA,
                    timestamp: timestamp,
                    image: FOTO_PESSOA
                }]
            };

            // Adiciona à fila de execução com timeout maior para fotos
            postActions.push(
                client.post(`${BASE_URL}/user_set_image_list.fcgi${urlParams}`, payloadPhoto, { timeout: 15000 })
                    .then(res => {
                         if (res.data && res.data.error) {
                             logger.error(`[${IP}] Erro retornado na FOTO: ${JSON.stringify(res.data)}`);
                         } else {
                             // logger.info(`[${IP}] FOTO enviada.`); // Comentei para reduzir spam no log
                         }
                    })
                    .catch(err => {
                        logger.error(`[${IP}] Falha envio FOTO: ${err.message}`);
                    })
            );
        }

        // Aguarda todas as ações secundárias terminarem juntas
        if (postActions.length > 0) {
            await Promise.all(postActions);
        }

        logger.info(`[${IP}] CADASTRO FINALIZADO: ${NOME}`);

        return {
            success: true,
            message: "Usuário processado com sucesso"
        };

    } catch (err) {
        // Tratamento de erro robusto
        const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        logger.error(`[${IP}] ERRO FATAL ${NOME}: ${errorMsg}`);
        
        return {
            success: false,
            error: errorMsg,
            data: err.response?.data || null
        };
    }
};

module.exports = { addUser };