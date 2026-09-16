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

// ============================================================
// 🧪 DEBUG DO SISTEMA DE CRAFTING
// ============================================================

const DEBUG_CRAFTING = false;

// ============================================================
// 👁️ VIEWER — CONFIG (FASE 4)
// ============================================================
//
// ⚠️ DIAGNÓSTICO DO PROBLEMA DE CÂMERA:
//
// Sintomas:
//   - Monstros não aparecem de forma normal
//   - Folhas e algumas texturas ficam esquisitas
//   - No Minecraft real (você olhando), tá normal
//
// Causa provável:
//   1. viewDistance muito baixa (8) → chunks distantes
//      não carregam no viewer, folhas renderizam errado,
//      monstros distantes somem
//   2. firstPerson: true → a câmera vê pelas costas do
//      bot e pode bugar com o modelo dele
//   3. Versão do prismarine-viewer desatualizada em
//      relação ao protocolo do servidor
//
// Correção aplicada:
//   - viewDistance: 8 → 16
//   - firstPerson: false (câmera de fora, mais estável)
//   - fallback: se o viewer falhar, loga e continua sem
//
// ⚠️ NOVO: CÂMERA EM 3ª PESSOA DE VERDADE
//
// Antes, o `prismarine-viewer` mostrava o mundo pelo
// ponto de vista do bot, mas com o modelo dele atrapalhando.
//
// Agora, usamos `viewer.control` + `viewer.track` pra:
//   - Câmera orbitando ao redor do bot (3ª pessoa)
//   - Mouse pra rotacionar
//   - WASD pra mover a câmera (sem mexer no bot)
//   - Scroll pra zoom
//
// Se ainda ficar bugado, as alternativas são:
//   A) Rodar `npm install prismarine-viewer@latest`
//   B) Usar `mineflayer-web-inventory` + câmera própria
//   C) Rodar um cliente Minecraft real em spectator mode
//      na conta da Raiden (mais fiel, mais setup)

const VIEWER_CONFIG = {
    porta: 3007,

    // ⚠️ 3ª pessoa de verdade
    //   false = câmera ORBITANDO ao redor do bot (3ª pessoa)
    //   true  = primeira pessoa (buga com modelo do bot)
    primeiraPessoa: false,

    // 16 = 2x o padrão. Corrige folhas e monstros distantes.
    distanciaVisao: 16,

    // ⚠️ Câmera orbitando
    //   true  = câmera segue o bot automaticamente (3ª pessoa)
    //   false = câmera fixa (você controla manualmente)
    seguirBot: true,

    // ⚠️ Offset da câmera em relação ao bot
    //   x = esquerda/direita
    //   y = altura (cima/baixo)
    //   z = frente/trás
    offsetCamera: {
        x: 0,
        y: 3,
        z: -5
    },

    // Liga/desliga o viewer inteiro.
    // Se true e falhar, o bot continua rodando sem viewer.
    ativo: true
};

const MINECRAFT_CONFIG = {
    host: "127.0.0.1",
    port: 25565,
    username: "Raiden",
    version: false
};

const bot = mineflayer.createBot(MINECRAFT_CONFIG);

const estadoBot = {
    conectadoMinecraft: false,
    conectadoRaiden: false,
    ultimaAtualizacaoEstado: null,
    ultimaAcao: null,
    ultimoResultadoAcao: null,
    ultimoChat: null,
    viewerIniciado: false,

    inventarioInicial: null,
    inventarioInicialEm: null
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

let timerMorte = null;

function agora() {
    return new Date().toISOString();
}

function cancelarTimerMorte() {
    if (timerMorte) {
        clearTimeout(timerMorte);
        timerMorte = null;
        return true;
    }
    return false;
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
// 👁️ VIEWER — INICIALIZAÇÃO (FASE 4)
// ============================================================
//
// ⚠️ 3ª pessoa de verdade
//
// Além de iniciar o viewer, agora:
//   1. Chama `viewer.control` pra habilitar mouse + WASD
//   2. Chama `viewer.track` pra câmera seguir o bot
//   3. Loga instruções de uso

function iniciarViewer() {
    if (!VIEWER_CONFIG.ativo) {
        console.log(
            "👁️ Viewer DESLIGADO (VIEWER_CONFIG.ativo = false)."
        );
        return false;
    }

    if (estadoBot.viewerIniciado) {
        return true;
    }

    try {
        // 1. Inicia o viewer
        viewer(bot, {
            port: VIEWER_CONFIG.porta,
            firstPerson: VIEWER_CONFIG.primeiraPessoa,
            viewDistance: VIEWER_CONFIG.distanciaVisao
        });

        estadoBot.viewerIniciado = true;

        console.log(
            `👁️ Viewer iniciado em ` +
            `http://127.0.0.1:${VIEWER_CONFIG.porta} ` +
            `(viewDistance=${VIEWER_CONFIG.distanciaVisao}, ` +
            `firstPerson=${VIEWER_CONFIG.primeiraPessoa})`
        );

        // 2. ⚠️ 3ª pessoa de verdade
        //    Espera um pouco pra câmera inicializar, depois
        //    ativa o modo "seguir o bot" com offset.
        setTimeout(() => {
            try {
                const viewerModule =
                    require("prismarine-viewer");

                // Tenta ativar o controle (mouse + WASD)
                if (
                    viewerModule &&
                    viewerModule.mineflayer &&
                    typeof viewerModule.mineflayer.control === "function"
                ) {
                    try {
                        viewerModule.mineflayer.control(bot);
                        console.log(
                            "🎥 Controles ativados (mouse + WASD)"
                        );
                    } catch (_) {}
                }

                // Tenta ativar o track (câmera segue o bot)
                if (
                    viewerModule &&
                    typeof viewerModule.track === "function"
                ) {
                    viewerModule.track(
                        bot,
                        bot.entity,
                        {
                            y: VIEWER_CONFIG.offsetCamera.y,
                            z: VIEWER_CONFIG.offsetCamera.z,
                            x: VIEWER_CONFIG.offsetCamera.x
                        }
                    );

                    console.log(
                        `🎥 Câmera em 3ª pessoa ` +
                        `(offset: y=${VIEWER_CONFIG.offsetCamera.y}, ` +
                        `z=${VIEWER_CONFIG.offsetCamera.z})`
                    );
                } else {
                    console.log(
                        "⚠️ viewer.track não disponível. " +
                        "Câmera padrão."
                    );
                }
            } catch (erro) {
                console.error(
                    "⚠️ Erro ao ativar 3ª pessoa:",
                    erro.message
                );
            }
        }, 2000);

        // 3. Log de instruções
        console.log("");
        console.log("🎥 INSTRUÇÕES DA CÂMERA:");
        console.log("   - Mouse: rotaciona");
        console.log("   - WASD: move a câmera (sem mexer no bot)");
        console.log("   - Scroll: zoom");
        console.log("   - Q/E: sobe/desce");
        console.log("   - Botão direito: órbita ao redor do bot");
        console.log("");

        return true;

    } catch (erro) {
        console.error(
            "❌ Erro ao iniciar viewer:",
            erro.message
        );

        console.error(
            "⚠️ Bot vai continuar SEM viewer. " +
            "Pra corrigir:"
        );

        console.error(
            "   1. npm install prismarine-viewer@latest"
        );

        console.error(
            "   2. Ou mude VIEWER_CONFIG.ativo = false"
        );

        estadoBot.viewerIniciado = false;
        return false;
    }
}

// ============================================================
// 🎒 INVENTÁRIO
// ============================================================

function lerInventarioAtual() {
    if (
        !inventario ||
        typeof inventario.obterItens !== "function"
    ) {
        return null;
    }

    try {
        const itens = inventario.obterItens() || [];

        const agrupado = {};

        for (const item of itens) {
            if (!item?.nome) continue;

            const nome = item.nome;
            const qtd = Number(item.quantidade || 0);

            if (!agrupado[nome]) {
                agrupado[nome] = 0;
            }

            agrupado[nome] += qtd;
        }

        return agrupado;

    } catch (erro) {
        console.error(
            "🎒 Erro ao ler inventário:",
            erro.message
        );

        return null;
    }
}

function logarInventario(inventarioObj, contexto = "entrou com") {
    if (
        !inventarioObj ||
        Object.keys(inventarioObj).length === 0
    ) {
        console.log(
            `🎒 Raiden ${contexto} SEM itens no inventário.`
        );

        return;
    }

    const lista = Object.entries(inventarioObj)
        .map(([nome, qtd]) => `${nome} x${qtd}`)
        .join(", ");

    console.log(
        `🎒 Raiden ${contexto}: ${lista}`
    );
}

// ============================================================
// 🧪 DIAGNÓSTICO DO MINECRAFT / CRAFTING
// ============================================================

function diagnosticarReceitasMinecraft() {
    console.log("");
    console.log("════════════════════════════════════════════");
    console.log("🧪 DIAGNÓSTICO DO SISTEMA DE CRAFTING");
    console.log("════════════════════════════════════════════");

    console.log("🧪 Versão Minecraft:", bot.version);
    console.log("🧪 Versão do protocolo:", bot.protocolVersion);
    console.log("🧪 Registry disponível:", !!bot.registry);

    if (!bot.registry) {
        console.error(
            "❌ Registry do Minecraft ainda não está disponível."
        );
        console.log(
            "════════════════════════════════════════════"
        );
        return;
    }

    const oakLog = bot.registry.itemsByName.oak_log;
    const oakPlanks = bot.registry.itemsByName.oak_planks;
    const craftingTable = bot.registry.itemsByName.crafting_table;

    console.log("🧪 oak_log:", oakLog);
    console.log("🧪 oak_planks:", oakPlanks);
    console.log("🧪 crafting_table:", craftingTable);

    if (oakLog) {
        try {
            const receitasLog =
                bot.recipesFor(oakLog.id, null, 1, null);
            console.log(
                `🧪 oak_log → ${receitasLog.length} receita(s)`
            );
        } catch (erro) {
            console.error(
                "❌ Erro testando receita de oak_log:",
                erro
            );
        }
    }

    if (!oakPlanks) {
        console.error("❌ oak_planks NÃO existe no registry.");
    } else {
        try {
            const receitasPlanks =
                bot.recipesFor(oakPlanks.id, null, 1, null);
            console.log(
                `🧪 oak_planks → ${receitasPlanks.length} receita(s)`
            );
        } catch (erro) {
            console.error(
                "❌ Erro testando receita de oak_planks:",
                erro
            );
        }
    }

    if (craftingTable) {
        console.log("🧪 crafting_table ID:", craftingTable.id);
    }

    try {
        console.log(
            "🧪 Número de itens no registry:",
            Object.keys(bot.registry.itemsByName || {}).length
        );
        console.log(
            "🧪 Número de blocos no registry:",
            Object.keys(bot.registry.blocksByName || {}).length
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

        conectadoMinecraft: estadoBot.conectadoMinecraft,
        conectadoRaiden: estadoBot.conectadoRaiden,
        ultimaAtualizacaoEstado: estadoBot.ultimaAtualizacaoEstado,

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

        ultimaAcao: estadoBot.ultimaAcao,
        ultimoResultadoAcao: estadoBot.ultimoResultadoAcao,
        ultimoChat: estadoBot.ultimoChat,

        inventarioInicial: estadoBot.inventarioInicial,
        inventarioInicialEm: estadoBot.inventarioInicialEm
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
            erro: "Sistema de ações ainda não inicializado."
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
            await acoes.executar(acao, parametros);

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
            erro: erro?.message || String(erro)
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
                        etapas: parametros.etapas,
                        itens_necessarios:
                            parametros.itens_necessarios,
                        construir: parametros.construir
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
                cancelarTimerMorte();

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
            const acao = String(mensagem.acao || "")
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
            executarAcao("parar", null, {}, "sistema");
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

        console.log("🧠 Conectado ao cérebro da Raiden!");

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
        console.log("🔌 Conexão com a API da Raiden encerrada.");
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

// ============================================================
// 🌅 SPAWN
// ============================================================

bot.once("spawn", () => {
    estadoBot.conectadoMinecraft = true;

    console.log("⛏️ RAÍDEN ENTROU NO MINECRAFT!");

    console.log("📍 Posição inicial:", {
        x: bot.entity.position.x,
        y: bot.entity.position.y,
        z: bot.entity.position.z
    });

    setTimeout(() => {
        const invInicial = lerInventarioAtual();

        estadoBot.inventarioInicial = invInicial;
        estadoBot.inventarioInicialEm = agora();

        logarInventario(invInicial, "entrou com");

        enviarEvento("minecraft_inventario_inicial", {
            inventario: invInicial,
            posicao: {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            }
        });
    }, 1500);

    if (DEBUG_CRAFTING) {
        diagnosticarReceitasMinecraft();
    }

    // ⚠️ FASE 4: viewer isolado, com fallback
    iniciarViewer();

    try {
        navegacao.inicializar();
        console.log("🧭 Navegação inicializada.");
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
        typeof conexao.reabilitarReconexao === "function"
    ) {
        conexao.reabilitarReconexao();
    }

    conexao.conectar();
});

// ============================================================
// ☠️ MORTE DA RAIDEN
// ============================================================

bot.on("death", () => {
    console.error("☠️ Raiden morreu!");

    const posicaoMorte = bot.entity?.position
        ? {
            x: bot.entity.position.x,
            y: bot.entity.position.y,
            z: bot.entity.position.z
        }
        : null;

    const inventarioAntesDeMorrer = lerInventarioAtual();

    console.log(
        "🎒 Inventário antes de morrer:",
        inventarioAntesDeMorrer
    );

    enviarEvento("minecraft_morreu", {
        posicao: posicaoMorte,
        inventario: inventarioAntesDeMorrer
    });

    if (timerMorte) {
        clearTimeout(timerMorte);
    }

    timerMorte = setTimeout(() => {
        console.log(
            "🔄 Reiniciando plano automaticamente após morte..."
        );

        try {
            if (autonomia) {
                autonomia.reiniciar();
            }
        } catch (erro) {
            console.error(
                "❌ Erro ao reiniciar autonomia:",
                erro.message
            );
        }

        timerMorte = null;
    }, 3000);
});

bot.on("respawn", () => {
    console.log(
        "🌅 Raiden respawnou em:",
        bot.entity?.position
    );

    if (timerMorte) {
        clearTimeout(timerMorte);
        timerMorte = null;

        console.log(
            "⏳ Aguardando API decidir (recuperar drop ou reiniciar)..."
        );

        timerMorte = setTimeout(() => {
            console.log(
                "🔄 Reiniciando plano após respawn (API não respondeu)."
            );

            try {
                if (autonomia) {
                    autonomia.reiniciar();
                }
            } catch (erro) {
                console.error(
                    "❌ Erro ao reiniciar autonomia:",
                    erro.message
                );
            }

            timerMorte = null;
        }, 5000);
    }
});

bot.on(
    "physicsTick",
    () => {
        if (!estadoBot.conectadoMinecraft) {
            return;
        }

        estadoBot.ultimaAtualizacaoEstado = agora();
    }
);

bot.on(
    "end",
    () => {
        estadoBot.conectadoMinecraft = false;
        estadoBot.conectadoRaiden = false;

        if (timerMorte) {
            clearTimeout(timerMorte);
            timerMorte = null;
        }

        try {
            autonomia.parar("minecraft_desconectado");
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

        console.log("🔌 Raiden saiu do Minecraft.");
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
    console.log("\n🛑 Encerrando Raiden Minecraft...");

    if (timerMorte) {
        clearTimeout(timerMorte);
        timerMorte = null;
    }

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
    criarEstado,

    cancelarTimerMorte
};