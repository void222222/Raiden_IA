const mineflayer = require("mineflayer");
const WebSocket = require("ws");


// ============================================================
// ⚙️ CONFIGURAÇÃO
// ============================================================

const MINECRAFT_CONFIG = {
    host: "127.0.0.1",
    port: 25565,
    username: "Raiden",
    version: false
};

const RAIDEN_WS_URL = "ws://127.0.0.1:8000/ws/minecraft";

const INTERVALO_ESTADO = 1000;
const INTERVALO_RECONEXAO = 3000;


// ============================================================
// ⛏ MINECRAFT
// ============================================================

const bot = mineflayer.createBot(MINECRAFT_CONFIG);


// ============================================================
// 🧠 ESTADO DA CONEXÃO
// ============================================================

let raidenWs = null;
let intervaloEstado = null;
let reconexaoAgendada = false;


// ============================================================
// 🎮 CONTROLE DE AÇÕES
// ============================================================

let acaoEmExecucao = false;


// ============================================================
// 🧠 CONEXÃO COM A RAÍDEN
// ============================================================

function conectarRaiden() {

    if (raidenWs) {
        return;
    }

    if (!bot.entity) {
        return;
    }

    if (reconexaoAgendada) {
        return;
    }

    console.log(
        "🧠 Conectando ao cérebro da Raiden..."
    );

    raidenWs = new WebSocket(RAIDEN_WS_URL);

    raidenWs.on("open", () => {

        console.log(
            "🧠 Conectado ao cérebro da Raiden!"
        );

        reconexaoAgendada = false;

        iniciarAtualizacaoEstado();

        enviarEstado();

        enviarMensagem({
            tipo: "conexao",
            status: "ok",
            mensagem:
                "Minecraft conectado à Raiden."
        });
    });


    raidenWs.on("message", (data) => {

        try {

            const mensagem =
                JSON.parse(data.toString());

            if (mensagem.tipo !== "ack") {

                console.log(
                    "🧠 Raiden → Minecraft:",
                    mensagem
                );
            }

            processarMensagemRaiden(mensagem);

        } catch (erro) {

            console.error(
                "❌ Mensagem inválida da Raiden:",
                erro.message
            );

        }

    });


    raidenWs.on("close", () => {

        console.log(
            "🔌 Conexão com a API da Raiden encerrada."
        );

        pararAtualizacaoEstado();

        raidenWs = null;

        agendarReconexao();

    });


    raidenWs.on("error", (erro) => {

        console.error(
            "❌ Erro WebSocket Raiden:",
            erro.message
        );

    });
}


// ============================================================
// 🔄 RECONEXÃO
// ============================================================

function agendarReconexao() {

    if (reconexaoAgendada) {
        return;
    }

    reconexaoAgendada = true;

    console.log(
        `🔄 Tentando reconectar em ${INTERVALO_RECONEXAO / 1000}s...`
    );

    setTimeout(() => {

        reconexaoAgendada = false;

        if (!raidenWs && bot.entity) {
            conectarRaiden();
        }

    }, INTERVALO_RECONEXAO);
}


// ============================================================
// 📡 ENVIO PARA A RAÍDEN
// ============================================================

function enviarMensagem(mensagem) {

    if (!raidenWs) {
        return false;
    }

    if (raidenWs.readyState !== WebSocket.OPEN) {
        return false;
    }

    try {

        raidenWs.send(
            JSON.stringify(mensagem)
        );

        return true;

    } catch (erro) {

        console.error(
            "❌ Erro ao enviar mensagem:",
            erro.message
        );

        return false;
    }
}


// ============================================================
// 📡 ESTADO DO MINECRAFT
// ============================================================

function criarEstado() {

    if (!bot.entity) {
        return null;
    }

    const posicao = bot.entity.position;


    // --------------------------------------------------------
    // 👾 ENTIDADES
    // --------------------------------------------------------

    const entidades = Object.values(bot.entities)

        .filter(entidade =>
            entidade !== bot.entity &&
            entidade.position
        )

        .map(entidade => ({

            nome:
                entidade.username ||
                entidade.name ||
                entidade.displayName ||
                entidade.type,

            tipo: entidade.type,

            x: entidade.position.x,
            y: entidade.position.y,
            z: entidade.position.z,

            distancia:
                entidade.position.distanceTo(
                    bot.entity.position
                ),

            vida:
                typeof entidade.health === "number"
                    ? entidade.health
                    : null

        }));


    // --------------------------------------------------------
    // 🎒 INVENTÁRIO
    // --------------------------------------------------------

    const inventario =
        bot.inventory.items().map(item => ({

            nome: item.name,

            displayName:
                item.displayName || item.name,

            quantidade: item.count,

            slot: item.slot

        }));


    // --------------------------------------------------------
    // 🖐 ITEM NA MÃO
    // --------------------------------------------------------

    const itemNaMao =
        bot.heldItem
            ? {
                nome: bot.heldItem.name,
                displayName:
                    bot.heldItem.displayName ||
                    bot.heldItem.name,
                quantidade:
                    bot.heldItem.count
            }
            : null;


    // --------------------------------------------------------
    // 🌍 ESTADO
    // --------------------------------------------------------

    return {

        tipo: "estado",

        posicao: {

            x: posicao.x,
            y: posicao.y,
            z: posicao.z

        },

        rotacao: {

            yaw: bot.entity.yaw,
            pitch: bot.entity.pitch

        },

        velocidade: {

            x: bot.entity.velocity.x,
            y: bot.entity.velocity.y,
            z: bot.entity.velocity.z

        },

        no_chao:
            bot.entity.onGround,

        vida: bot.health,

        fome: bot.food,

        oxigenio:
            typeof bot.oxygenLevel === "number"
                ? bot.oxygenLevel
                : null,

        nivel_experiencia:
            bot.experience
                ? bot.experience.level
                : 0,

        item_na_mao: itemNaMao,

        inventario: inventario,

        entidades: entidades

    };
}


// ============================================================
// 📡 ENVIA ESTADO
// ============================================================

function enviarEstado() {

    const estado = criarEstado();

    if (!estado) {
        return;
    }

    enviarMensagem(estado);
}


// ============================================================
// ⏱ ATUALIZAÇÃO CONTÍNUA
// ============================================================

function iniciarAtualizacaoEstado() {

    if (intervaloEstado) {
        return;
    }

    console.log(
        "📡 Atualização contínua do estado iniciada."
    );

    intervaloEstado = setInterval(() => {

        enviarEstado();

    }, INTERVALO_ESTADO);
}


function pararAtualizacaoEstado() {

    if (!intervaloEstado) {
        return;
    }

    clearInterval(intervaloEstado);

    intervaloEstado = null;

    console.log(
        "📡 Atualização contínua do estado parada."
    );
}


// ============================================================
// 🧠 RECEBE COMANDOS DA RAÍDEN
// ============================================================

function processarMensagemRaiden(mensagem) {

    if (!mensagem ||
        typeof mensagem !== "object") {

        return;
    }


    const tipo = mensagem.tipo;


    // --------------------------------------------------------
    // 🔌 CONEXÃO
    // --------------------------------------------------------

    if (tipo === "conexao") {

        console.log(
            "✅ Minecraft conectado ao cérebro da Raiden."
        );

        return;
    }


    // --------------------------------------------------------
    // 🏓 PONG
    // --------------------------------------------------------

    if (tipo === "pong") {
        return;
    }


    // --------------------------------------------------------
    // ✅ ACK
    // --------------------------------------------------------

    if (tipo === "ack") {
        return;
    }


    // --------------------------------------------------------
    // 🎮 AÇÃO MINECRAFT
    // --------------------------------------------------------

    if (tipo === "minecraft_acao") {

        executarAcaoMinecraft(mensagem);

        return;
    }


    console.log(
        "⚠️ Tipo de mensagem não reconhecido:",
        mensagem
    );
}


// ============================================================
// 🎮 EXECUTOR DE AÇÕES
// ============================================================

async function executarAcaoMinecraft(mensagem) {

    if (acaoEmExecucao) {

        enviarMensagem({

            tipo: "minecraft_acao_resultado",

            sucesso: false,

            erro:
                "Outra ação já está sendo executada."

        });

        return;
    }


    const acao = mensagem.acao;


    if (!acao) {

        enviarMensagem({

            tipo: "minecraft_acao_resultado",

            sucesso: false,

            erro:
                "Ação Minecraft não especificada."

        });

        return;
    }


    acaoEmExecucao = true;


    try {

        let resultado;


        switch (acao) {

            // =================================================
            // 🚶 MOVIMENTO
            // =================================================

            case "andar":

                resultado =
                    await executarAndar(mensagem);

                break;


            // =================================================
            // 🦘 PULAR
            // =================================================

            case "pular":

                resultado =
                    await executarPular();

                break;


            // =================================================
            // 🛑 PARAR
            // =================================================

            case "parar":

                resultado =
                    executarParar();

                break;


            // =================================================
            // 👀 OLHAR
            // =================================================

            case "olhar":

                resultado =
                    await executarOlhar(mensagem);

                break;


            // =================================================
            // ⚔️ ATACAR
            // =================================================

            case "atacar":

                resultado =
                    await executarAtacar(mensagem);

                break;


            // =================================================
            // ⛏️ QUEBRAR BLOCO
            // =================================================

            case "quebrar":

                resultado =
                    await executarQuebrar(mensagem);

                break;


            // =================================================
            // 🎒 EQUIPAR
            // =================================================

            case "equipar":

                resultado =
                    await executarEquipar(mensagem);

                break;


            // =================================================
            // 🖐️ USAR ITEM
            // =================================================

            case "usar":

                resultado =
                    await executarUsar();

                break;


            // =================================================
            // 🗑️ JOGAR ITEM FORA
            // =================================================

            case "dropar":

                resultado =
                    await executarDropar(mensagem);

                break;


            // =================================================
            // 💬 CHAT
            // =================================================

            case "chat":

                resultado =
                    executarChat(mensagem);

                break;


            // =================================================
            // ❌ DESCONHECIDA
            // =================================================

            default:

                resultado = {

                    sucesso: false,

                    erro:
                        `Ação desconhecida: ${acao}`

                };

        }


        enviarMensagem({

            tipo: "minecraft_acao_resultado",

            acao: acao,

            ...resultado

        });


    } catch (erro) {

        console.error(
            `❌ Erro executando ação "${acao}":`,
            erro
        );


        enviarMensagem({

            tipo: "minecraft_acao_resultado",

            acao: acao,

            sucesso: false,

            erro: erro.message

        });


    } finally {

        acaoEmExecucao = false;

    }
}


// ============================================================
// 🚶 ANDAR
// ============================================================

async function executarAndar(mensagem) {

    const direcao =
        mensagem.direcao || "frente";

    const duracao =
        limitarNumero(
            mensagem.duracao || 1,
            0.1,
            10
        );


    const controles = {

        frente: {
            forward: true
        },

        tras: {
            back: true
        },

        esquerda: {
            left: true
        },

        direita: {
            right: true
        }

    };


    const controle =
        controles[direcao];


    if (!controle) {

        return {

            sucesso: false,

            erro:
                `Direção inválida: ${direcao}`

        };

    }


    limparControles();


    for (const [nome, valor]
        of Object.entries(controle)) {

        bot.setControlState(
            nome,
            valor
        );
    }


    await esperar(
        duracao * 1000
    );


    limparControles();


    return {

        sucesso: true,

        direcao: direcao,

        duracao: duracao

    };
}


// ============================================================
// 🦘 PULAR
// ============================================================

async function executarPular() {

    bot.setControlState(
        "jump",
        true
    );

    await esperar(250);

    bot.setControlState(
        "jump",
        false
    );


    return {

        sucesso: true

    };
}


// ============================================================
// 🛑 PARAR
// ============================================================

function executarParar() {

    limparControles();


    return {

        sucesso: true

    };
}


// ============================================================
// 🧹 LIMPAR CONTROLES
// ============================================================

function limparControles() {

    const controles = [

        "forward",
        "back",
        "left",
        "right",
        "jump",
        "sprint",
        "sneak"

    ];


    for (const controle of controles) {

        bot.setControlState(
            controle,
            false
        );

    }
}


// ============================================================
// 👀 OLHAR
// ============================================================

async function executarOlhar(mensagem) {

    if (
        typeof mensagem.yaw === "number" &&
        typeof mensagem.pitch === "number"
    ) {

        await bot.look(
            mensagem.yaw,
            mensagem.pitch,
            true
        );


        return {

            sucesso: true,

            modo: "rotacao"

        };
    }


    if (
        typeof mensagem.x === "number" &&
        typeof mensagem.y === "number" &&
        typeof mensagem.z === "number"
    ) {

        const alvo = bot.vec3(
            mensagem.x,
            mensagem.y,
            mensagem.z
        );


        await bot.lookAt(
            alvo,
            true
        );


        return {

            sucesso: true,

            modo: "posicao"

        };
    }


    return {

        sucesso: false,

        erro:
            "Informe yaw/pitch ou x/y/z."

    };
}


// ============================================================
// ⚔️ ATACAR
// ============================================================

async function executarAtacar(mensagem) {

    let entidade = null;


    // --------------------------------------------------------
    // ID DA ENTIDADE
    // --------------------------------------------------------

    if (mensagem.id !== undefined) {

        entidade =
            bot.entities[mensagem.id];

    }


    // --------------------------------------------------------
    // NOME DA ENTIDADE
    // --------------------------------------------------------

    if (!entidade &&
        mensagem.nome) {

        entidade =
            Object.values(bot.entities)
                .find(e => {

                    const nome =
                        e.username ||
                        e.name ||
                        e.displayName;

                    return nome === mensagem.nome;

                });

    }


    if (!entidade) {

        return {

            sucesso: false,

            erro:
                "Entidade não encontrada."

        };

    }


    if (!entidade.position) {

        return {

            sucesso: false,

            erro:
                "Entidade não possui posição."

        };

    }


    const distancia =
        entidade.position.distanceTo(
            bot.entity.position
        );


    if (distancia > 4) {

        return {

            sucesso: false,

            erro:
                `Entidade está a ${distancia.toFixed(2)} blocos.`

        };

    }


    await bot.lookAt(
        entidade.position.offset(
            0,
            entidade.height
                ? entidade.height * 0.5
                : 0.5,
            0
        ),
        true
    );


    bot.attack(entidade);


    return {

        sucesso: true,

        entidade:
            entidade.username ||
            entidade.name ||
            entidade.displayName ||
            entidade.type

    };
}


// ============================================================
// ⛏️ QUEBRAR BLOCO
// ============================================================

async function executarQuebrar(mensagem) {

    if (
        typeof mensagem.x !== "number" ||
        typeof mensagem.y !== "number" ||
        typeof mensagem.z !== "number"
    ) {

        return {

            sucesso: false,

            erro:
                "Informe x, y e z do bloco."

        };

    }


    const posicao = bot.vec3(
        mensagem.x,
        mensagem.y,
        mensagem.z
    );


    const bloco =
        bot.blockAt(posicao);


    if (!bloco) {

        return {

            sucesso: false,

            erro:
                "Não foi possível encontrar o bloco."

        };

    }


    if (bloco.name === "air") {

        return {

            sucesso: false,

            erro:
                "O bloco já é ar."

        };

    }


    if (!bot.canDigBlock(bloco)) {

        return {

            sucesso: false,

            erro:
                `Não posso quebrar ${bloco.name}.`

        };

    }


    await bot.lookAt(
        bloco.position.offset(
            0.5,
            0.5,
            0.5
        ),
        true
    );


    await bot.dig(bloco);


    return {

        sucesso: true,

        bloco: bloco.name,

        x: bloco.position.x,
        y: bloco.position.y,
        z: bloco.position.z

    };
}


// ============================================================
// 🎒 EQUIPAR
// ============================================================

async function executarEquipar(mensagem) {

    if (!mensagem.nome) {

        return {

            sucesso: false,

            erro:
                "Informe o nome do item."

        };

    }


    const item =
        bot.inventory.items()
            .find(item =>
                item.name === mensagem.nome
            );


    if (!item) {

        return {

            sucesso: false,

            erro:
                `Item "${mensagem.nome}" não encontrado.`

        };

    }


    const destino =
        mensagem.destino || "hand";


    await bot.equip(
        item,
        destino
    );


    return {

        sucesso: true,

        item: item.name,

        destino: destino

    };
}


// ============================================================
// 🖐️ USAR ITEM
// ============================================================

async function executarUsar() {

    bot.activateItem();

    await esperar(500);

    bot.deactivateItem();


    return {

        sucesso: true

    };
}


// ============================================================
// 🗑️ DROPAR ITEM
// ============================================================

async function executarDropar(mensagem) {

    if (!mensagem.nome) {

        return {

            sucesso: false,

            erro:
                "Informe o nome do item."

        };

    }


    const item =
        bot.inventory.items()
            .find(item =>
                item.name === mensagem.nome
            );


    if (!item) {

        return {

            sucesso: false,

            erro:
                `Item "${mensagem.nome}" não encontrado.`

        };

    }


    const quantidade =
        limitarNumero(
            mensagem.quantidade ||
            item.count,
            1,
            item.count
        );


    if (quantidade === item.count) {

        await bot.tossStack(item);

    } else {

        await bot.toss(
            item.type,
            null,
            quantidade
        );

    }


    return {

        sucesso: true,

        item: item.name,

        quantidade: quantidade

    };
}


// ============================================================
// 💬 CHAT
// ============================================================

function executarChat(mensagem) {

    if (!mensagem.mensagem) {

        return {

            sucesso: false,

            erro:
                "Mensagem de chat vazia."

        };

    }


    bot.chat(
        String(mensagem.mensagem)
    );


    return {

        sucesso: true

    };
}


// ============================================================
// 🔢 LIMITADOR
// ============================================================

function limitarNumero(
    valor,
    minimo,
    maximo
) {

    const numero =
        Number(valor);


    if (!Number.isFinite(numero)) {
        return minimo;
    }


    return Math.min(
        Math.max(
            numero,
            minimo
        ),
        maximo
    );
}


// ============================================================
// ⏳ ESPERA
// ============================================================

function esperar(ms) {

    return new Promise(resolve => {

        setTimeout(
            resolve,
            ms
        );

    });
}


// ============================================================
// ⛏ SPAWN
// ============================================================

bot.once("spawn", () => {

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


    conectarRaiden();

});


// ============================================================
// 💬 CHAT
// ============================================================

bot.on(
    "chat",
    (username, message) => {

        console.log(
            `💬 ${username}: ${message}`
        );

        enviarMensagem({

            tipo: "minecraft_chat",

            usuario: username,

            mensagem: message

        });

    }
);


// ============================================================
// 🧭 EVENTOS DE MOVIMENTO
// ============================================================

bot.on("move", () => {

    // O estado completo é enviado
    // pelo intervalo principal.

});


// ============================================================
// ❤️ VIDA
// ============================================================

bot.on("health", () => {

    enviarEstado();

});


// ============================================================
// 🎒 INVENTÁRIO
// ============================================================

bot.on("windowUpdate", () => {

    enviarEstado();

});


// ============================================================
// ❌ KICK
// ============================================================

bot.on(
    "kicked",
    (reason) => {

        console.log(
            "❌ Bot expulso:",
            reason
        );

    }
);


// ============================================================
// ❌ ERROS
// ============================================================

bot.on(
    "error",
    (error) => {

        console.error(
            "❌ Erro Mineflayer:",
            error.message
        );

    }
);


// ============================================================
// 🔌 ENCERRAMENTO
// ============================================================

bot.on("end", () => {

    console.log(
        "🔌 Raiden saiu do Minecraft."
    );


    pararAtualizacaoEstado();


    if (raidenWs) {

        try {
            raidenWs.close();
        } catch (erro) {
            // Ignora erro de fechamento.
        }

        raidenWs = null;

    }

});