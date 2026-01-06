const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));

const { getSession } = require("./getSession")
const { logger } = require("../logger")

const addUser = async (IP, data) => {
    const { ID_PESSOA, NOME, FOTO_PESSOA } = data;
    const BASE_URL = `http://${IP}`;
    const session = await getSession(IP);

    if (!session) {
        throw new Error(`Sem sessão válida para ${IP}`);
    }

    try {
        // 1. Verifica se já existe o usuário
        const listResponse = await axios.post(
            `${BASE_URL}/load_objects.fcgi?session=${session}`,
            { object: "users" },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000
            }
        );

        const existingUser = listResponse.data?.users?.find(
            (u) => String(u.id) === String(ID_PESSOA)
        );

        if (existingUser) {
            logger.info(`Usuário ${ID_PESSOA} já existe, removendo...`);

            // 2. AGUARDA a exclusão do usuário existente
            const deleteResponse = await axios.post(
                `${BASE_URL}/destroy_objects.fcgi?session=${session}`,
                {
                    object: "users",
                    where: { users: { id: [ID_PESSOA] } }
                },
                {
                    headers: { "Content-Type": "application/json" },
                    timeout: 10000
                }
            );

            // Verifica se a exclusão foi bem-sucedida
            if (!deleteResponse.data || deleteResponse.data.error) {
                throw new Error(`Falha ao deletar usuário existente: ${JSON.stringify(deleteResponse.data)}`);
            }

            logger.info(`Usuário antigo removido`);
        }

        // 3. AGUARDA a criação do usuário
        const payloadUser = {
            object: "users",
            values: [
                {
                    id: ID_PESSOA,
                    name: NOME,
                    registration: String(ID_PESSOA),
                    password: "",
                    salt: String(ID_PESSOA)
                }
            ]
        };

        const createResponse = await axios.post(
            `${BASE_URL}/create_objects.fcgi?session=${session}`,
            payloadUser,
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000
            }
        );

        // Verifica se a criação foi bem-sucedida
        if (!createResponse.data || createResponse.data.error) {
            throw new Error(`Falha ao criar usuário: ${JSON.stringify(createResponse.data)}`);
        }

        // 4. Se tiver foto, AGUARDA o envio
        if (FOTO_PESSOA) {
            const imageBase64 = Buffer.from(FOTO_PESSOA).toString("base64");
            const timestamp = Math.floor(Date.now() / 1000);

            const payloadPhoto = {
                match: true,
                user_images: [
                    {
                        user_id: ID_PESSOA,
                        timestamp,
                        image: imageBase64
                    }
                ]
            };

            const photoResponse = await axios.post(
                `${BASE_URL}/user_set_image_list.fcgi?session=${session}`,
                payloadPhoto,
                {
                    headers: { "Content-Type": "application/json" },
                    timeout: 15000 // Mais tempo para upload de imagem
                }
            );

            // Verifica se o envio da foto foi bem-sucedido
            if (!photoResponse.data || photoResponse.data.error) {
                throw new Error(`Falha ao enviar foto: ${JSON.stringify(photoResponse.data)}`);
            }


            logger.info(`Foto enviada com sucesso`);
        }

        const payloadUserGroup = {
            object: "user_groups",
            fields: ["user_id", "group_id"],
            values: [
                {
                    user_id: ID_PESSOA,
                    group_id: 1
                }
            ]
        };

        await axios.post(
            `${BASE_URL}/create_objects.fcgi?session=${session}`,
            payloadUserGroup,
            {
                headers: { "Content-Type": "application/json" }
            }
        );

        logger.info(`Usuário adicionado com sucesso`);

        //  Retorna sucesso apenas se TUDO deu certo
        return {
            success: true,
            message: "Usuário adicionado com sucesso",
            data: createResponse.data
        };

    } catch (err) {
        //console.log(err)
        logger.error(`Erro ao adicionar usuário ${ID_PESSOA}:`, err.message);

        //  Retorna falha em caso de erro
        return {
            success: false,
            error: err.message,
            data: err.response?.data || null
        };
    }
}

module.exports = { addUser }