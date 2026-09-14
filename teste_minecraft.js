const WebSocket = require("ws");

const WS_URL = "ws://127.0.0.1:8000/ws/minecraft";

const testes = [
    {
        nome: "PULAR",
        mensagem: {
            tipo: "minecraft_acao",
            acao: "pular"
        }
    },
    {
        nome: "ANDAR",
        mensagem: {
            tipo: "minecraft_acao",
            acao: "andar",
            direcao: "frente",
            duracao: 1
        }
    },
    {
        nome: "OLHAR",
        mensagem: {
            tipo: "minecraft_acao",
            acao: "olhar",
            x: 10,
            y: 95,
            z: -20
        }
    },
    {
        nome: "CHAT",
        mensagem: {
            tipo: "minecraft_acao",
            acao: "chat",
            mensagem: "🧪 Teste do módulo Minecraft da Raiden!"
        }
    }
];

const ws = new WebSocket(WS_URL);

let indice = 0;

ws.on("open", () => {
    console.log("");
    console.log("========================================");
    console.log("🧪 TESTE DO MÓDULO MINECRAFT");
    console.log("========================================");
    console.log("✅ Conectado à API da Raiden");
    console.log("");

    executarProximo();
});

ws.on("message", (data) => {
    try {
        const mensagem = JSON.parse(data.toString());

        if (mensagem.tipo === "minecraft_acao_resultado") {
            console.log("📥 Resultado:");
            console.log(mensagem);
            console.log("");

            if (mensagem.sucesso) {
                console.log("✅ TESTE PASSOU");
            } else {
                console.log("❌ TESTE FALHOU");
            }

            console.log("----------------------------------------");
            indice++;

            setTimeout(executarProximo, 1000);
        }
    } catch (erro) {
        console.error("❌ Resposta inválida:", erro.message);
    }
});

ws.on("error", (erro) => {
    console.error("");
    console.error("❌ Erro ao conectar:", erro.message);
    console.error("");
    console.error("Verifique se a API da Raiden está rodando.");
    process.exit(1);
});

ws.on("close", () => {
    console.log("");
    console.log("🔌 Teste encerrado.");
});

function executarProximo() {
    if (indice >= testes.length) {
        console.log("");
        console.log("========================================");
        console.log("🎉 TESTES BÁSICOS CONCLUÍDOS");
        console.log("========================================");
        console.log("");
        ws.close();
        return;
    }

    const teste = testes[indice];

    console.log(
        `🧪 [${indice + 1}/${testes.length}] ${teste.nome}`
    );

    console.log("📤 Enviando:", teste.mensagem);

    ws.send(JSON.stringify(teste.mensagem));
}
