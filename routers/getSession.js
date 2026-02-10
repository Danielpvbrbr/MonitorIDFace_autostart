/**
 * Obtém o token da memória global.
 * Não faz requisições de rede. Quem alimenta isso é o cicloDeLogin.
 * @param {string} IP 
 * @returns {string|null}
 */
async function getSession(IP) {
    if (global.sessionsMap.has(IP)) {
        return global.sessionsMap.get(IP);
    }
    return null;
}

module.exports = { getSession };