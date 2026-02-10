const readline = require("readline");
const { saveConfig, loadConfig } = require("./config");
const { processar } = require("./routers/processar");
const { connection } = require("./db");
const { version } = require("./package.json");
const { cicloDeLogin } = require("./routers/login");

let TIME = 1000;

// Cores ANSI (Mantidas para quando rodar manual)
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

        // Aguarda 1 segundo e inicia o servidor
        setTimeout(() => {
            startServer(app);
        }, 1000);
    });
}

function startServer(app) {
    const config = loadConfig();

    // 1. Proteção: Verifica config ANTES de tentar usar
    if (!config) {
        console.error(colors.red + "Erro: Tentativa de iniciar servidor sem configuração." + colors.reset);
        return;
    }

    let PORT = config.PORT;

    // Inicia o servidor Express
    app.listen(PORT, () => {
        // --- LOGS DE INICIALIZAÇÃO ---
        console.log(colors.cyan + "\n╔════════════════════════════════════════════╗" + colors.reset);
        console.log(colors.cyan + `║       MONITOR FACIAL IDFACE - v${version}       ║` + colors.reset);
        console.log(colors.cyan + "╚════════════════════════════════════════════╝\n" + colors.reset);

        console.log(colors.green + "   Servidor iniciado com sucesso!\n" + colors.reset);
        console.log(`   Porta: ${colors.yellow}${PORT}${colors.reset}`);
        console.log(`   Database: ${colors.yellow}${config.DB_DATABASE}${colors.reset}`);
        console.log(`   Login Equipamentos: ${colors.cyan}${config.LOGIN}${colors.reset}`);
        console.log(`   Processamento Comandos: a cada ${5 * TIME}ms`);
        console.log(`   Renovação de Tokens: a cada 1 minuto\n`);

        // 1. Loop Rápido (Comandos): Roda a cada 5 segundos
        // Atenção: Só chame isso UMA vez aqui dentro
        setInterval(processar, 2 * TIME);

        // 2. Loop Lento (Logins): Roda a cada 60 segundos (1 minuto)
        setInterval(cicloDeLogin, 60000);

        // 3. Executa o login imediatamente ao ligar (para não esperar 1 min na primeira vez)
        cicloDeLogin();
    });
}

async function autoStart(app) {
    // Removido console.clear()
    console.log(colors.cyan + `\nIniciando Monitor Facial IDFace - v${version}` + colors.reset);

    try {
        const config = loadConfig();

        if (config && config.DB_DATABASE && config.LOGIN && config.PASSWORD && config.PORT) {
            console.log(colors.green + "   Configuração encontrada!" + colors.reset);
            console.log(`   Database: ${colors.yellow}${config.DB_DATABASE}${colors.reset}`);

            console.log(colors.dim + "   Iniciando servidor..." + colors.reset);

            setTimeout(() => {
                startServer(app);
            }, 1500);
        } else {
            throw new Error("Configuração incompleta");
        }
    } catch (error) {
        // --- LÓGICA DE PROTEÇÃO DO SERVIÇO ---

        // Verifica se existe um terminal interativo (Você rodando node index.js na mão)
        if (process.stdout.isTTY) {
            console.log(colors.yellow + "   Nenhuma configuração encontrada\n" + colors.reset);
            console.log(colors.dim + "   Iniciando menu de configuração...\n" + colors.reset);

            setTimeout(async () => {
                await promptConfig(app);
            }, 1000);
        } else {
            // Se cair aqui, é o SERVIÇO DO WINDOWS rodando.
            // O serviço não tem teclado, então não pode chamar o promptConfig.
            console.error("ERRO CRÍTICO (Modo Serviço):");
            console.error("O arquivo 'config.json' não foi encontrado ou está inválido.");
            console.error("O serviço não pode abrir o menu interativo.");
            console.error("SOLUÇÃO: Pare o serviço, rode 'node index.js' manualmente para configurar e depois inicie o serviço.");

            // Encerra com código de erro para o Windows saber que falhou
            process.exit(1);
        }
    }
}

module.exports = { autoStart, startServer };