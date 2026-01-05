const readline = require("readline");
const { saveConfig, loadConfig } = require("./config");
const { processar } = require("./routers/processar");
const { connection } = require("./db");
let TIME = 1000;
const { version } = require("./package.json");

// Cores ANSI
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};

// Lista de bancos disponíveis
const listDb = async () => {
    const db = await connection();
    try {
        const [rows] = await db.query(`SHOW DATABASES LIKE 'db%'`);
        if (!rows.length) {
            console.log(colors.red + "Nenhum banco encontrado" + colors.reset);
            return [];
        }
        return rows.map(row => Object.values(row)[0]);
    } catch (err) {
        console.error(colors.red + "Erro ao listar bancos:", err, colors.reset);
        return [];
    } finally {
        await db.end();
    }
};

async function promptConfig(app) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const bancos = await listDb();

    console.log(colors.magenta + "\n╔════════════════════════════════════════════╗" + colors.reset);
    console.log(colors.magenta + "║         CONFIGURAÇÃO INICIAL               ║" + colors.reset);
    console.log(colors.magenta + "╚════════════════════════════════════════════╝\n" + colors.reset);

    console.log(colors.cyan + "Escolha o Banco de Dados:" + colors.reset);

    bancos.forEach((db, index) => {
        console.log(colors.yellow + `  [${index + 1}] ${db}` + colors.reset);
    });

    console.log(colors.dim + `  [Enter] para usar padrão: ${bancos[0]}` + colors.reset + "\n");

    rl.question(colors.bright + "Opção: " + colors.reset, (dbOption) => {
        rl.close();
        const selectedIndex = parseInt(dbOption) - 1;
        const selectedDB = bancos[selectedIndex] || bancos[0];

        const config = {
            DB_DATABASE: selectedDB,
            LOGIN: "admin",
            PASSWORD: "admin",
            PORT: 5000
        };

        saveConfig(config);
        console.log(colors.green + "\n✓ Configuração salva com sucesso!" + colors.reset);
        console.log(`Banco selecionado: ${colors.yellow}${config.DB_DATABASE}${colors.reset}\n`);

        // Aguarda 1 segundo e inicia o servidor automaticamente
        setTimeout(() => {
            startServer(app);
        }, 1000);
    });
}

function startServer(app) {
    const config = loadConfig();
    let PORT = config.PORT;

    app.listen(PORT, () => {
        console.clear();
        console.log(colors.cyan + "╔════════════════════════════════════════════╗" + colors.reset);
        console.log(colors.cyan + `║       MONITOR FACIAL IDFACE - v${version}       ║` + colors.reset);
        console.log(colors.cyan + "╚════════════════════════════════════════════╝\n" + colors.reset);
        console.log(colors.green + "   Servidor iniciado com sucesso!\n" + colors.reset);
        console.log(`   Porta: ${colors.yellow}${PORT}${colors.reset}`);
        console.log(`   Database: ${colors.yellow}${config.DB_DATABASE}${colors.reset}`);
        console.log(`   Login: ${colors.cyan}${config.LOGIN}${colors.reset}`);
        console.log(`   Processamento: a cada ${TIME * 5}ms\n`);
        console.log(colors.dim + "   Pressione Ctrl+C para encerrar\n" + colors.reset);

        setInterval(processar, 5 * TIME);
    });
}

async function autoStart(app) {
    console.clear();
    console.log(colors.cyan + "╔════════════════════════════════════════════╗" + colors.reset);
    console.log(colors.cyan + `║       MONITOR FACIAL IDFACE - v${version}       ║` + colors.reset);
    console.log(colors.cyan + "╚════════════════════════════════════════════╝\n" + colors.reset);

    try {
        const config = loadConfig();
        
        if (config && config.DB_DATABASE && config.LOGIN && config.PASSWORD && config.PORT) {
            console.log(colors.green + "    Configuração encontrada!\n" + colors.reset);
            console.log(`   Database: ${colors.yellow}${config.DB_DATABASE}${colors.reset}`);
            console.log(`   Login: ${colors.cyan}${config.LOGIN}${colors.reset}`);
            console.log(`   Porta: ${colors.cyan}${config.PORT}${colors.reset}\n`);
            console.log(colors.dim + "   Iniciando servidor..." + colors.reset);
            
            setTimeout(() => {
                startServer(app);
            }, 1500);
        } else {
            throw new Error("Configuração incompleta");
        }
    } catch (error) {
        // Se não encontrar configuração ou estiver incompleta
        console.log(colors.yellow + "   Nenhuma configuração encontrada\n" + colors.reset);
        console.log(colors.dim + "   Iniciando configuração inicial...\n" + colors.reset);
        
        setTimeout(async () => {
            await promptConfig(app);
        }, 1000);
    }
}

module.exports = { autoStart, startServer };