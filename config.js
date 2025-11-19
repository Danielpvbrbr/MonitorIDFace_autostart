const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.env.APPDATA || ".", "MonitorFacialIDFace", "config.json");

function saveConfig(config) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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