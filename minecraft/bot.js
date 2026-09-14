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
const { criarAutonomia } = require("./autonomia");

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

const bot = mineflayer.createBot(MINECRAFT_CONFIG);

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
let autonomia = null;

function agora() {
    return new Date().toISOString();
}

function enviarMensagemRaiden(mensagem) {
    if (!conexao) {
        return false;
    }

    return conexao.enviar(mensagem);
}

function enviarEvento(evento, dados = {}) {
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
        const texto = String(mensagem);

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

// ============================================================
// 🧪 DIAGNÓSTICO DO MINECRAFT / CRAFTING
// ============================================================
//
// Este diagnóstico é temporário.
//
// Objetivo:
// descobrir por que:
//     bot.registry.itemsByName.oak_planks
// existe,
// mas:
//     bot.recipesFor(oak_planks.id)
// retorna 0 receitas.
//
// Não altera a lógica do bot.
// Apenas imprime informações no terminal.
// ============================================================

function diagnosticarReceitasMinecraft() {
    console.log("");
    console.log("════════════════════════════════════════════");
    console.log("🧪 DIAGNÓSTICO DO SISTEMA DE CRAFTING");
    console.log("════════════════════════════════════════════");

    // --------------------------------------------------------
    // 🎮 VERSÃO
    // --------------------------------------------------------

    console.log(
        "🧪 Versão Minecraft:",
        bot.version
    );

    console.log(
        "🧪 Versão do protocolo:",
        bot.protocolVersion
    );

    console.log(
        "🧪 Registry disponível:",
        !!bot.registry
    );

    if (!bot.registry) {
        console.error(
            "❌ Registry do Minecraft ainda não está disponível."
        );

        console.log(
            "════════════════════════════════════════════"
        );

        return;
    }

    // --------------------------------------------------------
    // 📦 REGISTRY
    // --------------------------------------------------------

    const oakLog =
        bot.registry.itemsByName.oak_log;

    const oakPlanks =
        bot.registry.itemsByName.oak_planks;

    const craftingTable =
        bot.registry.itemsByName.crafting_table;

    console.log(
        "🧪 oak_log:",
        oakLog
    );

    console.log(
        "🧪 oak_planks:",
        oakPlanks
    );

    console.log(
        "🧪 crafting_table:",
        craftingTable
    );

    // --------------------------------------------------------
    // 🌳 OAK LOG
    // --------------------------------------------------------

    if (oakLog) {
        try {
            const receitasLog =
                bot.recipesFor(
                    oakLog.id,
                    null,
                    1,
                    null
                );

            console.log(
                `🧪 oak_log → ${receitasLog.length} receita(s)`
            );

            receitasLog.forEach(
                (receita, index) => {
                    console.log(
                        `🧪 Receita oak_log #${index + 1}:`,
                        {
                            requiresTable:
                                receita.requiresTable,

                            result:
                                receita.result,

                            delta:
                                receita.delta,

                            ingredients:
                                receita.ingredients
                        }
                    );
                }
            );
        } catch (erro) {
            console.error(
                "❌ Erro testando receita de oak_log:",
                erro
            );
        }
    } else {
        console.warn(
            "⚠️ oak_log não existe no registry."
        );
    }

    // --------------------------------------------------------
    // 🪵 OAK PLANKS
    // --------------------------------------------------------

    if (!oakPlanks) {
        console.error(
            "❌ oak_planks NÃO existe no registry."
        );
    } else {
        try {
            const receitasPlanks =
                bot.recipesFor(
                    oakPlanks.id,
                    null,
                    1,
                    null
                );

            console.log(
                `🧪 oak_planks → ${receitasPlanks.length} receita(s)`
            );

            receitasPlanks.forEach(
                (receita, index) => {
                    console.log(
                        `🧪 Receita oak_planks #${index + 1}:`,
                        {
                            requiresTable:
                                receita.requiresTable,

                            result:
                                receita.result,

                            delta:
                                receita.delta,

                            ingredients:
                                receita.ingredients
                        }
                    );
                }
            );

            if (receitasPlanks.length === 0) {
                console.error("");
                console.error(
                    "❌ PROBLEMA CONFIRMADO:"
                );
                console.error(
                    "❌ oak_planks existe no registry,"
                );
                console.error(
                    "❌ mas bot.recipesFor() retornou ZERO receitas."
                );
                console.error("");
            }
        } catch (erro) {
            console.error(
                "❌ Erro testando receita de oak_planks:",
                erro
            );
        }
    }

    // --------------------------------------------------------
    // 🪑 CRAFTING TABLE
    // --------------------------------------------------------

    if (craftingTable) {
        console.log(
            "🧪 crafting_table ID:",
            craftingTable.id
        );
    } else {
        console.warn(
            "⚠️ crafting_table não existe no registry."
        );
    }

    // --------------------------------------------------------
    // 📚 INFORMAÇÕES DO REGISTRY
    // --------------------------------------------------------

    try {
        console.log(
            "🧪 Número de itens no registry:",
            Object.keys(
                bot.registry.itemsByName || {}
            ).length
        );

        console.log(
            "🧪 Número de blocos no registry:",
            Object.keys(
                bot.registry.blocksByName || {}
            ).length
        );
    } catch (erro) {
        console.warn(
            "⚠️ Não foi possível contar registry:",
            erro.message
        );
    }

    console.log(
        "════════════════════════════════════════════"
    );
    console.log("");
}

function criarEstado() {
    const estadoPercepcao =
        percepcao &&
        typeof percepcao.obterEstado === "function"
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
            typeof movimento.obterEstado === "function"
                ? movimento.obterEstado()
                : null,

        inventario:
            inventario &&
            typeof inventario.obterEstado === "function"
                ? inventario.obterEstado()
                : null,

        navegacao:
            navegacao &&
            typeof navegacao.obterEstado === "function"
                ? navegacao.obterEstado()
                : null,

        combate:
            combate &&
            typeof combate.obterEstado === "function"
                ? combate.obterEstado()
                : null,

        seguranca:
            seguranca &&
            typeof seguranca.obterEstado === "function"
                ? seguranca.obterEstado()
                : null,

        crafting:
            crafting &&
            typeof crafting.obterEstado === "function"
                ? crafting.obterEstado()
                : null,

        construcao:
            construcao &&
            typeof construcao.obterEstado === "function"
                ? construcao.obterEstado()
                : null,

        autonomia:
            autonomia &&
            typeof autonomia.obterEstado === "function"
                ? autonomia.obterEstado()
                : null,

        ultimaAcao:
            estadoBot.ultimaAcao,

        ultimoResultadoAcao:
            estadoBot.ultimoResultadoAcao,

        ultimoChat:
            estadoBot.ultimoChat
    };
}

// ============================================================
// 🎮 RESULTADO DE AÇÃO
// ============================================================

function registrarResultadoAcao(
    acao,
    acaoId,
    parametros,
    resultado,
    origem = "api"
) {
    estadoBot.ultimaAcao = {
        acao,
        acaoId,
        parametros,
        origem,
        timestamp: agora()
    };

    estadoBot.ultimoResultadoAcao = {
        acao,
        acaoId,
        resultado,
        origem,
        timestamp: agora()
    };

    enviarMensagemRaiden({
        tipo: "minecraft_acao_resultado",

        acao,

        acao_id: acaoId,

        origem,

        sucesso: !!resultado?.sucesso,

        resultado,

        timestamp: agora()
    });
}

// ============================================================
// 🎮 EXECUTAR AÇÃO
// ============================================================

async function executarAcao(
    acao,
    acaoId = null,
    parametros = {},
    origem = "api"
) {
    if (!acoes) {
        const resultado = {
            sucesso: false,
            acao,
            erro:
                "Sistema de ações ainda não inicializado."
        };

        registrarResultadoAcao(
            acao,
            acaoId,
            parametros,
            resultado,
            origem
        );

        return resultado;
    }

    try {
        const resultado =
            await acoes.executar(
                acao,
                parametros
            );

        registrarResultadoAcao(
            acao,
            acaoId,
            parametros,
            resultado,
            origem
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
            acaoId,
            parametros,
            resultado,
            origem
        );

        return resultado;
    }
}

// ============================================================
// 🧠 CONTROLE DA AUTONOMIA
// ============================================================

async function processarControleAutonomia(
    acao,
    acaoId,
    parametros
) {
    if (!autonomia) {
        const resultado = {
            sucesso: false,
            acao,
            erro: "Módulo de autonomia indisponível."
        };

        registrarResultadoAcao(
            acao,
            acaoId,
            parametros,
            resultado,
            "api"
        );

        return resultado;
    }

    let resultado;

    try {
        switch (acao) {
            case "definir_objetivo": {
                const definiu =
                    autonomia.definirObjetivo({
                        id: parametros.id,
                        nome: parametros.nome,
                        descricao: parametros.descricao,
                        etapa: parametros.etapa,
                        etapas: parametros.etapas
                    });

                resultado = {
                    sucesso: !!definiu,
                    acao,
                    erro: definiu
                        ? null
                        : "Objetivo inválido."
                };

                break;
            }

            case "iniciar_autonomia": {
                const iniciou = autonomia.iniciar();

                resultado = {
                    sucesso: !!iniciou,
                    acao,
                    erro: iniciou
                        ? null
                        : "Falha ao iniciar autonomia."
                };

                break;
            }

            case "parar_autonomia": {
                const parou = autonomia.parar(
                    parametros.motivo || "api"
                );

                resultado = {
                    sucesso: !!parou,
                    acao
                };

                break;
            }

            case "reiniciar_autonomia": {
                const reiniciou = autonomia.reiniciar();

                resultado = {
                    sucesso: !!reiniciou,
                    acao,
                    erro: reiniciou
                        ? null
                        : "Falha ao reiniciar autonomia."
                };

                break;
            }

            default: {
                resultado = {
                    sucesso: false,
                    acao,
                    erro: `Ação de controle desconhecida: ${acao}`
                };
            }
        }
    } catch (erro) {
        resultado = {
            sucesso: false,
            acao,
            erro: erro?.message || String(erro)
        };
    }

    registrarResultadoAcao(
        acao,
        acaoId,
        parametros,
        resultado,
        "api"
    );

    if (
        resultado.sucesso &&
        typeof autonomia.obterEstado === "function"
    ) {
        enviarEvento(
            "minecraft_autonomia_estado",
            autonomia.obterEstado()
        );
    }

    return resultado;
}

function processarMensagemRaiden(mensagem) {
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

        case "minecraft_acao": {
            const acao = String(
                mensagem.acao || ""
            )
                .trim()
                .toLowerCase();

            const controlesAutonomia = new Set([
                "definir_objetivo",
                "iniciar_autonomia",
                "parar_autonomia",
                "reiniciar_autonomia"
            ]);

            if (controlesAutonomia.has(acao)) {
                processarControleAutonomia(
                    acao,
                    mensagem.acao_id || null,
                    mensagem.parametros || {}
                );
                break;
            }

            executarAcao(
                mensagem.acao,
                mensagem.acao_id || null,
                mensagem.parametros || {},
                "api"
            );

            break;
        }

        case "cancelar_acao":
            executarAcao(
                "parar",
                null,
                {},
                "sistema"
            );
            break;

        case "parar_tudo":
            if (autonomia) {
                autonomia.parar("parar_tudo");
            }

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
            break;
    }
}

// ============================================================
// 🧠 FUNÇÃO PÚBLICA PARA A AUTONOMIA
// ============================================================

async function executarAcaoDaAutonomia(
    acao,
    parametros = {}
) {
    return executarAcao(
        acao,
        null,
        parametros,
        "autonomia"
    );
}

const contexto = {
    bot,

    config: MINECRAFT_CONFIG,

    estado: estadoBot,

    enviarMensagem: enviarMensagemRaiden,

    enviarEvento,

    criarEstado,

    executarAcaoPublica: executarAcaoDaAutonomia,

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
    autonomia: null,
    conexao: null
};

percepcao = criarPercepcao(contexto);
contexto.percepcao = percepcao;

movimento = criarMovimento(contexto);
contexto.movimento = movimento;

inventario = criarInventario(contexto);
contexto.inventario = inventario;

mundo = criarMundo(contexto);
contexto.mundo = mundo;

navegacao = criarNavegacao(contexto);
contexto.navegacao = navegacao;

combate = criarCombate(contexto);
contexto.combate = combate;

seguranca = criarSeguranca(contexto);
contexto.seguranca = seguranca;

crafting = criarCrafting(contexto);
contexto.crafting = crafting;

construcao = criarConstrucao(contexto);
contexto.construcao = construcao;

autonomia = criarAutonomia(contexto);
contexto.autonomia = autonomia;

acoes = criarAcoes(contexto);
contexto.acoes = acoes;

eventos = criarEventos(contexto);
contexto.eventos = eventos;

conexao = criarConexao(contexto);
contexto.conexao = conexao;

conexao.definirCallback(
    "mensagem",
    processarMensagemRaiden
);

conexao.definirCallback(
    "aberta",
    () => {
        estadoBot.conectadoRaiden = true;

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
        estadoBot.conectadoRaiden = false;

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
        estadoBot.conectadoMinecraft = true;

        console.log(
            "⛏️ RAÍDEN ENTROU NO MINECRAFT!"
        );

        console.log(
            "📍 Posição inicial:",
            {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            }
        );

        // ====================================================
        // 🧪 DIAGNÓSTICO TEMPORÁRIO
        // ====================================================
        //
        // Executa depois do spawn, quando o registry,
        // versão e dados do Minecraft já estão disponíveis.
        //

        diagnosticarReceitasMinecraft();

        if (!estadoBot.viewerIniciado) {
            try {
                viewer(
                    bot,
                    {
                        port: VIEWER_CONFIG.porta,
                        firstPerson:
                            VIEWER_CONFIG.primeiraPessoa,
                        viewDistance:
                            VIEWER_CONFIG.distanciaVisao
                    }
                );

                estadoBot.viewerIniciado = true;

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

        console.log(
            "🧠 Autonomia em modo passivo. " +
            "Aguardando ordem da API para iniciar."
        );

        if (
            typeof conexao.reabilitarReconexao ===
            "function"
        ) {
            conexao.reabilitarReconexao();
        }

        conexao.conectar();
    }
);

bot.on(
    "physicsTick",
    () => {
        if (!estadoBot.conectadoMinecraft) {
            return;
        }

        estadoBot.ultimaAtualizacaoEstado =
            agora();
    }
);

bot.on(
    "end",
    () => {
        estadoBot.conectadoMinecraft = false;
        estadoBot.conectadoRaiden = false;

        try {
            autonomia.parar(
                "minecraft_desconectado"
            );
        } catch (_) {}

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
        autonomia.parar("desligamento");
    } catch (_) {}

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
        bot.quit("Raiden encerrando.");
    } catch (_) {
        process.exit(0);
    }
}

process.once("SIGINT", desligar);
process.once("SIGTERM", desligar);

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
    autonomia,
    conexao,

    executarAcao,
    criarEstado
};