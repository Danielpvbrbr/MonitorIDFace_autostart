const path = require('path');
const axios = require(path.join(__dirname, '..', 'node_modules', 'axios', 'dist', 'node', 'axios.cjs'));

const { getSession } = require("./getSession")


const listTodos = async (IP) => {
    if (!IP) {
        throw new Error("IP é obrigatório");
    }

    try {
        const session = await getSession(IP);
        const BASE_URL = `http://${IP}`;

        const response = await axios.post(
            `${BASE_URL}/load_objects.fcgi?session=${session}`,
            { object: "users" },
            {
                headers: { "Content-Type": "application/json" },
                timeout: 10000
            }
        );

        return response.data;

    } catch (err) {
        if (err.response) {
            throw new Error(JSON.stringify(err.response.data));
        } else {
            throw err;
        }
    }
}

module.exports = { listTodos }