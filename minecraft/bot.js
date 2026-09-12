const mineflayer = require("mineflayer");
const viewer = require("prismarine-viewer").mineflayer;

const { criarConexao } = require("./conexao");
const { criarPercepcao } = require("./percepcao");
const { criarMovimento } = require("./movimento");
const { criarInventario } = require("./inventario");
const { criarMundo } = require("./mundo");
const { criarNavegacao } = require("./navegacao");
const { criarAcoes } = require("./acoes");
const { criarEventos } = require("./eventos");
const { criarCombate } = require("./combate");
const { criarSeguranca } = require("./seguranca");
const { criarCrafting } = require("./crafting");
const { criarConstrucao } = require("./construcao");


const MINECRAFT_CONFIG = {
    host: "127.0.0.1",
    port: 25565,
    username: "Raiden",
    version: false
};


const VIEWER_CONFIG = {
    porta: 3007,
    primeiraPessoa: true,
    distanciaVisao: 8
};


const bot = mineflayer.createBot(
    MINECRAFT_CONFIG
);


const estadoBot = {
    conectadoMinecraft: false,
    conectadoRaiden: false,
    ultimaAtualizacaoEstado: null,
    ultimaAcao: null,
    ultimoResultadoAcao: null,
    ultimoChat: null,
    viewerIniciado: false
};


let conexao = null;
let percepcao = null;
let movimento = null;
let inventario = null;
let mundo = null;
let navegacao = null;
let acoes = null;
let eventos = null;
let combate = null;
let seguranca = null;
let crafting = null;
let construcao = null;


function agora() {
    return new Date().toISOString();
}


function enviarMensagemRaiden(
    mensagem
) {
    if (!conexao) {
        return false;
    }

    return conexao.enviar(
        mensagem
    );
}


function enviarEvento(
    evento,
    dados = {}
) {
    return enviarMensagemRaiden({
        tipo: "minecraft_evento",
        evento,
        timestamp: agora(),
        ...dados
    });
}


function chat(mensagem) {
    if (!bot.player) {
        return false;
    }

    try {
        const texto =
            String(mensagem);

        bot.chat(texto);

        estadoBot.ultimoChat = {
            mensagem: texto,
            timestamp: agora()
        };

        return true;

    } catch (erro) {
        console.error(
            "❌ Erro ao enviar chat:",
            erro.message
        );

        return false;
    }
}


function criarEstado() {
    const estadoPercepcao =
        percepcao &&
        typeof percepcao.obterEstado ===
            "function"
            ? percepcao.obterEstado()
            : {};

    return {
        ...estadoPercepcao,

        conectadoMinecraft:
            estadoBot.conectadoMinecraft,

        conectadoRaiden:
            estadoBot.conectadoRaiden,

        ultimaAtualizacaoEstado:
            estadoBot.ultimaAtualizacaoEstado,

        movimento:
            movimento &&
            typeof movimento.obterEstado ===
                "function"
                ? movimento.obterEstado()
                : null,

        inventario:
            inventario &&
            typeof inventario.obterEstado ===
                "function"
                ? inventario.obterEstado()
                : null,

        navegacao:
            navegacao &&
            typeof navegacao.obterEstado ===
                "function"
                ? navegacao.obterEstado()
                : null,

        combate:
            combate &&
            typeof combate.obterEstado ===
                "function"
                ? combate.obterEstado()
                : null,

        seguranca:
            seguranca &&
            typeof seguranca.obterEstado ===
                "function"
                ? seguranca.obterEstado()
                : null,

        crafting:
            crafting &&
            typeof crafting.obterEstado ===
                "function"
                ? crafting.obterEstado()
                : null,

        construcao:
            construcao &&
            typeof construcao.obterEstado ===
                "function"
                ? construcao.obterEstado()
                : null,

        ultimaAcao:
            estadoBot.ultimaAcao,

        ultimoResultadoAcao:
            estadoBot.ultimoResultadoAcao,

        ultimoChat:
            estadoBot.ultimoChat
    };
}


function registrarResultadoAcao(
    acao,
    parametros,
    resultado
) {
    estadoBot.ultimaAcao = {
        acao,
        parametros,
        timestamp: agora()
    };

    estadoBot.ultimoResultadoAcao = {
        acao,
        resultado,
        timestamp: agora()
    };

    enviarMensagemRaiden({
        tipo:
            "minecraft_acao_resultado",

        acao,

        sucesso:
            !!resultado?.sucesso,

        resultado,

        timestamp: agora()
    });
}


async function executarAcao(
    acao,
    parametros = {}
) {
    if (!acoes) {
        return {
            sucesso: false,
            acao,
            erro:
                "Sistema de ações ainda não inicializado."
        };
    }

    try {
        const resultado =
            await acoes.executar(
                acao,
                parametros
            );

        registrarResultadoAcao(
            acao,
            parametros,
            resultado
        );

        return resultado;

    } catch (erro) {
        const resultado = {
            sucesso: false,
            acao,
            erro:
                erro?.message ||
                String(erro)
        };

        registrarResultadoAcao(
            acao,
            parametros,
            resultado
        );

        return resultado;
    }
}


function processarMensagemRaiden(
    mensagem
) {
    if (
        !mensagem ||
        typeof mensagem !== "object"
    ) {
        return;
    }

    switch (mensagem.tipo) {
        case "ping":
            enviarMensagemRaiden({
                tipo: "pong",
                timestamp: agora()
            });
            break;


        case "estado_solicitar":
            if (conexao) {
                conexao.enviarEstado();
            }
            break;


        case "minecraft_acao":
            executarAcao(
                mensagem.acao,
                mensagem.parametros || {}
            );
            break;


        case "cancelar_acao":
            executarAcao(
                "parar",
                {}
            );
            break;


        case "parar_tudo":
            if (seguranca) {
                seguranca.pararTudo();
            } else if (movimento) {
                movimento.parar();
            }

            enviarMensagemRaiden({
                tipo: "ack",
                origem: "minecraft",
                evento: "parar_tudo",
                timestamp: agora()
            });

            break;


        default:
            enviarMensagemRaiden({
                tipo: "ack",
                origem: "minecraft",
                evento:
                    "mensagem_recebida",
                mensagem:
                    mensagem.tipo || null,
                timestamp: agora()
            });

            break;
    }
}


const contexto = {
    bot,

    config:
        MINECRAFT_CONFIG,

    estado:
        estadoBot,

    enviarMensagem:
        enviarMensagemRaiden,

    enviarEvento,

    criarEstado,

    chat,

    percepcao: null,
    movimento: null,
    inventario: null,
    mundo: null,
    navegacao: null,
    acoes: null,
    eventos: null,
    combate: null,
    seguranca: null,
    crafting: null,
    construcao: null,
    conexao: null
};


percepcao =
    criarPercepcao(
        contexto
    );

contexto.percepcao =
    percepcao;


movimento =
    criarMovimento(
        contexto
    );

contexto.movimento =
    movimento;


inventario =
    criarInventario(
        contexto
    );

contexto.inventario =
    inventario;


mundo =
    criarMundo(
        contexto
    );

contexto.mundo =
    mundo;


navegacao =
    criarNavegacao(
        contexto
    );

contexto.navegacao =
    navegacao;


combate =
    criarCombate(
        contexto
    );

contexto.combate =
    combate;


seguranca =
    criarSeguranca(
        contexto
    );

contexto.seguranca =
    seguranca;


crafting =
    criarCrafting(
        contexto
    );

contexto.crafting =
    crafting;


construcao =
    criarConstrucao(
        contexto
    );

contexto.construcao =
    construcao;


acoes =
    criarAcoes(
        contexto
    );

contexto.acoes =
    acoes;


eventos =
    criarEventos(
        contexto
    );

contexto.eventos =
    eventos;


conexao =
    criarConexao(
        contexto
    );

contexto.conexao =
    conexao;


conexao.definirCallback(
    "mensagem",
    processarMensagemRaiden
);


conexao.definirCallback(
    "aberta",
    () => {
        estadoBot.conectadoRaiden =
            true;

        console.log(
            "🧠 Conectado ao cérebro da Raiden!"
        );

        enviarMensagemRaiden({
            tipo: "minecraft_status",
            status: "conectado",
            timestamp: agora()
        });
    }
);


conexao.definirCallback(
    "fechada",
    () => {
        estadoBot.conectadoRaiden =
            false;

        console.log(
            "🔌 Conexão com a API da Raiden encerrada."
        );
    }
);


conexao.definirCallback(
    "erro",
    erro => {
        console.error(
            "❌ Erro na conexão com a API:",
            erro?.message || erro
        );
    }
);


eventos.registrar();

navegacao.registrarEventos();


bot.once(
    "spawn",
    () => {
        estadoBot.conectadoMinecraft =
            true;

        console.log(
            "⛏️ RAÍDEN ENTROU NO MINECRAFT!"
        );

        console.log(
            "📍 Posição inicial:",
            {
                x:
                    bot.entity.position.x,

                y:
                    bot.entity.position.y,

                z:
                    bot.entity.position.z
            }
        );


        if (
            !estadoBot.viewerIniciado
        ) {
            try {
                viewer(
                    bot,
                    {
                        port:
                            VIEWER_CONFIG.porta,

                        firstPerson:
                            VIEWER_CONFIG.primeiraPessoa,

                        viewDistance:
                            VIEWER_CONFIG.distanciaVisao
                    }
                );

                estadoBot.viewerIniciado =
                    true;

                console.log(
                    `👁️ Viewer iniciado em http://127.0.0.1:${VIEWER_CONFIG.porta}`
                );

            } catch (erro) {
                console.error(
                    "❌ Erro ao iniciar viewer:",
                    erro.message
                );
            }
        }


        try {
            navegacao.inicializar();

            console.log(
                "🧭 Navegação inicializada."
            );

        } catch (erro) {
            console.error(
                "❌ Erro ao inicializar navegação:",
                erro.message
            );
        }


        conexao.conectar();
    }
);


bot.on(
    "physicsTick",
    () => {
        if (
            !estadoBot.conectadoMinecraft
        ) {
            return;
        }

        estadoBot.ultimaAtualizacaoEstado =
            agora();
    }
);


bot.on(
    "end",
    () => {
        estadoBot.conectadoMinecraft =
            false;

        estadoBot.conectadoRaiden =
            false;

        try {
            navegacao.parar();
        } catch (_) {}

        try {
            combate.parar();
        } catch (_) {}

        try {
            movimento.parar();
        } catch (_) {}

        try {
            conexao.desconectar();
        } catch (_) {}

        console.log(
            "🔌 Raiden saiu do Minecraft."
        );
    }
);


bot.on(
    "error",
    erro => {
        console.error(
            "❌ Erro Mineflayer:",
            erro.message
        );
    }
);


function desligar() {
    console.log(
        "\n🛑 Encerrando Raiden Minecraft..."
    );

    try {
        seguranca.pararTudo();
    } catch (_) {}

    try {
        eventos.destruir();
    } catch (_) {}

    try {
        conexao.desconectar();
    } catch (_) {}

    try {
        bot.quit(
            "Raiden encerrando."
        );
    } catch (_) {
        process.exit(0);
    }
}


process.once(
    "SIGINT",
    desligar
);

process.once(
    "SIGTERM",
    desligar
);


module.exports = {
    bot,
    contexto,
    estadoBot,

    percepcao,
    movimento,
    inventario,
    mundo,
    navegacao,
    acoes,
    eventos,
    combate,
    seguranca,
    crafting,
    construcao,
    conexao,

    executarAcao,
    criarEstado
};