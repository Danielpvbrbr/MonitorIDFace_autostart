const axios = require('axios');
const { logger } = require("./logger")

async function photo_(folderName, fileName) {
    const start = Date.now();

    try {
        console.log(`Buscando imagem: ${folderName}/${fileName}`);

        const response = await axios.get(
            `http://pontodisnibra.ddns.net:3009/${folderName}/${fileName}`,
            { responseType: 'arraybuffer', timeout: 10000 }
        );

        const base64 = Buffer.from(response.data, 'binary').toString('base64');

        const duration = Date.now() - start;
        const sizeKb = (response.data.length / 1024).toFixed(2);

        logger.info(`OK | ${folderName}/${fileName} | ${sizeKb} KB | ${duration} ms`);

        return base64;

    } catch (err) {
        const duration = Date.now() - start;

        if (err.response) {
            logger.error(`ERRO ${err.response.status} | ${folderName}/${fileName} | ${duration} ms`);
        } else {
             logger.error(`ERRO CONEXÃO | ${folderName}/${fileName} | ${duration} ms`);
        }

        throw err;
    }
}

module.exports = { photo_ };
