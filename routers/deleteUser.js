const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));

const { getSession } = require("./getSession")
const { logger } = require("../logger")

const deleteUser = async (data) => {
    const { IP, user_id } = data;

    if (!IP || !user_id) {
        throw new Error("IP e user_id são obrigatórios");
    }

    try {
        const session = await getSession(IP);

        if (!session) {
            throw new Error(`Sem sessão válida para ${IP}`);
        }

        const BASE_URL = `http://${IP}`;

        const payload = {
            object: "users",
            where: {
                users: {
                    id: Array.isArray(user_id) ? user_id : [user_id]
                }
            }
        };

        //  AGUARDA a resposta do equipamento
        const response = await axios.post(
            `${BASE_URL}/destroy_objects.fcgi?session=${session}`,
            payload,
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000
            }
        );

        // Verifica se houve erro na resposta
        if (response.data && response.data.error) {
            throw new Error(`Equipamento retornou erro: ${JSON.stringify(response.data)}`);
        }
        
        logger.info(`Usuário ${user_id} deletado com sucesso de ${IP}`);
        //  Retorna os dados apenas se tudo deu certo
        return response.data;

    } catch (err) {
        logger.error(`Erro ao deletar usuário ${user_id} de ${IP}:`, err.message);

        if (err.response) {
            throw new Error(JSON.stringify(err.response.data));
        } else {
            throw err;
        }
    }
};

module.exports = { deleteUser }