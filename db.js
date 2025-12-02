const mysql = require('mysql2/promise');

const connection = async (database) => {
  const config = {
    host: 'pontodisnibra.ddns.net',
    user: 'root',
    password: "adr@3412",
    connectTimeout: 10000, // Timeout de 10 segundos
  };
  // const config = {
  //   host: 'localhost',
  //   user: 'root',
  //   password: "adr@3412",
  //   connectTimeout: 10000, // Timeout de 10 segundos
  // };

  if (database) {
    config.database = database;
  }

  try {
    const conn = await mysql.createConnection(config);
    return conn;
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', {
      host: config.host,
      erro: error.message,
      codigo: error.code,
      timestamp: new Date().toISOString()
    });

    // Retorna null em vez de lançar erro
    return null;
  }
};

module.exports = { connection };