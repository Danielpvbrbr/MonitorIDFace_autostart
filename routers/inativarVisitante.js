const { logger } = require("../logger");
const { deleteUser } = require("./deleteUser");

const inativarVisitante = async ({ ID_PESSOA, ENT_SAI, conn, IP }) => {
    if (ENT_SAI !== 1) return false;

    try {
        const [rows] = await conn.query(
            `
            SELECT 
                TIPO_VISITA,
                NOME,
                ID_PESSOA_VISITADO
            FROM pessoa
            WHERE ID_PESSOA = ?
              AND ATIVO = 1
            `,
            [ID_PESSOA]
        );

        const pessoa = rows[0];
        if (!pessoa) return false;

        const { TIPO_VISITA, NOME, ID_PESSOA_VISITADO } = pessoa;

        logger.info(`Saída detectada — ${NOME} (ID ${ID_PESSOA})`);

        await conn.query(
            `UPDATE pessoa SET FIM_ACESSO = NOW() WHERE ID_PESSOA = ?`,
            [ID_PESSOA]
        );

        // Acompanhante
        if (TIPO_VISITA === "A") {
            await conn.query(
                `
                UPDATE pacientes_local
                SET QTD_ACOMPANHANTE = QTD_ACOMPANHANTE - 1
                WHERE ID_PACIENTE = ?
                  AND QTD_ACOMPANHANTE > 0
                `,
                [ID_PESSOA_VISITADO]
            );
        }

        // Visitante de paciente
        if (TIPO_VISITA === "P") {
            await conn.query(
                `
                UPDATE pacientes_local
                SET QTD_VISITANTE_ATUAL = QTD_VISITANTE_ATUAL - 1
                WHERE ID_PACIENTE = ?
                  AND QTD_VISITANTE_ATUAL > 0
                `,
                [ID_PESSOA_VISITADO]
            );
        }

        // Remove do equipamento
        await deleteUser({
            IP,
            user_id: ID_PESSOA
        });

        logger.info(`Visitante ${NOME} inativado com sucesso.`);
        return true;

    } catch (err) {
        logger.error(`Erro ao inativar visitante ${ID_PESSOA}: ${err.message}`);
        return false;
    }
};

module.exports = { inativarVisitante };

//QTD_VISITANTE_ATUAL = (P) Visita Paciente
//QTD_ACOMPANHANTE = (A) Visita Acompanhante