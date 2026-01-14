const mysql = require('mysql2/promise');

let globalPool = null;
const pools = {};

const getGlobalPool = () => {
  if (!globalPool) {
    globalPool = mysql.createPool({
      host: 'pontodisnibra.ddns.net',
      // host: 'localhost',
      user: 'root',
      password: 'adr@3412',
      port: 3306,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log('[MYSQL] Pool global criado (sem database)');
  }

  return globalPool;
};

const getDatabasePool = (database) => {
  if (!database) {
    throw new Error('Database não informada');
  }

  if (!pools[database]) {
    pools[database] = mysql.createPool({
      host: 'pontodisnibra.ddns.net',
      // host: 'localhost',
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

const connection = (database = null) => {
  if (!database) {
    return getGlobalPool();
  }
  return getDatabasePool(database);
};

module.exports = { connection };
