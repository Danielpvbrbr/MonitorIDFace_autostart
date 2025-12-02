const { logger } = require("../logger");
const { deleteUser } = require('./deleteUser');

const inativarVisitante = async ({ ID_PESSOA, ENT_SAI, conn, IP, ID_EQUIPAMENTO }) => {
    if (ENT_SAI !== 1) return false;

    try {
        const [rows] = await conn.query(
            `SELECT ID_PESSOA, TIPO_VISITA, NOME FROM pessoa WHERE ID_PESSOA=? AND ATIVO=1`,
            [ID_PESSOA]
        );

        const pessoa = rows[0];
        if (!pessoa) return false;

        const { TIPO_VISITA, NOME } = pessoa;

        if (!["C", "P"].includes(TIPO_VISITA)) return false;

        logger.info(`Removendo visitante ${NOME} (ID ${ID_PESSOA}) do equipamento ${IP} — Saída detectada`);

        const resultado = await deleteUser({ IP, user_id: ID_PESSOA });
        if (!resultado) return false;

        await conn.query(`UPDATE pessoa SET ATIVO=0 WHERE ID_PESSOA=?`, [ID_PESSOA]);
        logger.info(`Visitante ${NOME} removido e inativado com sucesso.`);
        return true;

    } catch (err) {
        logger.error(`Erro ao inativar visitante ${ID_PESSOA}: ${err.message}`);
        return false;
    }
};

module.exports = { inativarVisitante };