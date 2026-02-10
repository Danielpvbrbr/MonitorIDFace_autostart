const axios = require('axios');
const sharp = require('sharp'); // Importar o sharp
const { logger } = require("./logger");

async function photo_(folderName, fileName) {
    const start = Date.now();

    try {
        console.log(`Buscando imagem: ${folderName}/${fileName}`);

        const response = await axios.get(
            `http://pontodisnibra.ddns.net:3009/${folderName}/${fileName}`,
            { responseType: 'arraybuffer', timeout: 10000 }
        );

        // --- INÍCIO DA OTIMIZAÇÃO ---
        
        // Processa o buffer original com o Sharp
        const optimizedBuffer = await sharp(response.data)
            .resize({ 
                width: 800,           // Reduz a largura para 800px
                withoutEnlargement: true // Não aumenta se a imagem já for pequena
            })
            .jpeg({ 
                quality: 70,          // Define qualidade em 70% (reduz muito o peso)
                progressive: true     // Melhora carregamento em conexões lentas
            })
            .toBuffer();

        // --- FIM DA OTIMIZAÇÃO ---

        const base64 = optimizedBuffer.toString('base64');

        const duration = Date.now() - start;
        // Calcula o tamanho da imagem JÁ otimizada
        const sizeKb = (optimizedBuffer.length / 1024).toFixed(2);
        
        // Opcional: Calcular quanto economizou (apenas para debug)
        const originalSizeKb = (response.data.length / 1024).toFixed(2);
        logger.info(`OK | ${folderName}/${fileName} | Otimizado: ${sizeKb} KB (Original: ${originalSizeKb} KB) | ${duration} ms`);

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