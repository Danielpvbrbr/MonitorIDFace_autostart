const mysql = require('mysql2/promise');

const pools = {};

const connection = async (database) => {
  if (!database) {
    throw new Error('Database não informada');
  }

  // cria o pool uma única vez por database
  if (!pools[database]) {
    pools[database] = mysql.createPool({
      host: 'pontodisnibra.ddns.net',
      user: 'root',
      password: 'adr@3412',
      port: 3306,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log(`[MYSQL] Pool criado para database: ${database}`);
  }

  return pools[database];
};

module.exports = { connection };
