const { login } = require("./login");
/**
 * Obtém ou cria uma sessão para um equipamento
 * @param {string} IP - Endereço IP do equipamento
 * @returns {string|null} Token de sessão
 */
async function getSession(IP) {
  if (!global.sessionsMap.has(IP)) { //  usa global
    await login(IP);
  }
  return global.sessionsMap.get(IP); //  usa global
}

module.exports = { getSession };