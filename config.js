const fs = require("fs");
const path = require("path");

// MUDANÇA AQUI: Usa __dirname para salvar na mesma pasta do script
const CONFIG_PATH = path.join(__dirname, "config.json");

function saveConfig(config) {
    // Removemos a verificação de pasta, pois __dirname sempre existe
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function needsSetup() {
    return !fs.existsSync(CONFIG_PATH);
}

module.exports = { saveConfig, loadConfig, needsSetup };