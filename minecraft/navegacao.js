const {
    pathfinder,
    Movements,
    goals
} = require("mineflayer-pathfinder");

const minecraftData = require("minecraft-data");

const {
    GoalBlock,
    GoalNear,
    GoalFollow
} = goals;


function criarNavegacao(contexto) {
    const bot = contexto.bot;

    let inicializado = false;
    let eventosRegistrados = false;
    let navegando = false;
    let destinoAtual = null;
    let seguindo = null;

    const CONFIG = {
        canDig: true,
        allow1by1towers: false,
        allowParkour: true,
        allowSprinting: true,
        maxDropDown: 3
    };


    function inicializar() {
        if (inicializado) {
            return true;
        }

        try {
            bot.loadPlugin(pathfinder);

            const mcData = minecraftData(bot.version);

            const movimentos = new Movements(
                bot,
                mcData
            );

            movimentos.canDig = CONFIG.canDig;
            movimentos.allow1by1towers = CONFIG.allow1by1towers;
            movimentos.allowParkour = CONFIG.allowParkour;
            movimentos.allowSprinting = CONFIG.allowSprinting;
            movimentos.maxDropDown = CONFIG.maxDropDown;

            bot.pathfinder.setMovements(movimentos);

            inicializado = true;

            return true;

        } catch (erro) {
            console.error(
                "🧭 Erro ao inicializar navegação:",
                erro
            );

            return false;
        }
    }


    function parar() {
        if (!inicializado) {
            return true;
        }

        try {
            bot.pathfinder.setGoal(null);
        } catch (_) {
            // Ignora se não houver objetivo.
        }

        navegando = false;
        destinoAtual = null;
        seguindo = null;

        return true;
    }


    async function irPara(x, y, z) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            return false;
        }

        if (!inicializar()) {
            return false;
        }

        try {
            const objetivo = new GoalBlock(
                Math.floor(x),
                Math.floor(y),
                Math.floor(z)
            );

            destinoAtual = {
                tipo: "bloco",
                x: Math.floor(x),
                y: Math.floor(y),
                z: Math.floor(z)
            };

            seguindo = null;
            navegando = true;

            bot.pathfinder.setGoal(objetivo);

            return true;

        } catch (erro) {
            console.error(
                "🧭 Erro ao navegar:",
                erro.message
            );

            navegando = false;
            destinoAtual = null;

            return false;
        }
    }


    async function irParaBloco(x, y, z, distancia = 1) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            return false;
        }

        if (!Number.isFinite(distancia)) {
            distancia = 1;
        }

        distancia = Math.max(0, distancia);

        if (!inicializar()) {
            return false;
        }

        try {
            const objetivo = new GoalNear(
                Math.floor(x),
                Math.floor(y),
                Math.floor(z),
                distancia
            );

            destinoAtual = {
                tipo: "bloco",
                x: Math.floor(x),
                y: Math.floor(y),
                z: Math.floor(z),
                distancia
            };

            seguindo = null;
            navegando = true;

            bot.pathfinder.setGoal(objetivo);

            return true;

        } catch (erro) {
            console.error(
                "🧭 Erro ao navegar até bloco:",
                erro.message
            );

            navegando = false;
            destinoAtual = null;

            return false;
        }
    }


    function encontrarEntidade(identificador) {
        if (
            identificador === null ||
            identificador === undefined
        ) {
            return null;
        }

        if (typeof identificador === "number") {
            return bot.entities[identificador] || null;
        }

        const texto = String(identificador).toLowerCase();

        return (
            Object.values(bot.entities).find(entidade => {
                return (
                    String(entidade.id) === texto ||
                    String(entidade.name || "").toLowerCase() === texto ||
                    String(entidade.username || "").toLowerCase() === texto ||
                    String(entidade.displayName || "").toLowerCase() === texto
                );
            }) || null
        );
    }


    async function irParaEntidade(identificador, distancia = 2) {
        const entidade = encontrarEntidade(identificador);

        if (!entidade || !entidade.position) {
            return false;
        }

        if (!Number.isFinite(distancia)) {
            distancia = 2;
        }

        distancia = Math.max(0, distancia);

        if (!inicializar()) {
            return false;
        }

        try {
            const objetivo = new GoalNear(
                entidade.position.x,
                entidade.position.y,
                entidade.position.z,
                distancia
            );

            destinoAtual = {
                tipo: "entidade",
                id: entidade.id,
                nome: entidade.name || entidade.username || null,
                distancia
            };

            seguindo = null;
            navegando = true;

            bot.pathfinder.setGoal(objetivo);

            return true;

        } catch (erro) {
            console.error(
                "🧭 Erro ao navegar até entidade:",
                erro.message
            );

            navegando = false;
            destinoAtual = null;

            return false;
        }
    }


    async function irParaJogador(nome, distancia = 2) {
        if (!nome) {
            return false;
        }

        return irParaEntidade(nome, distancia);
    }


    async function seguir(identificador, distancia = 2) {
        const entidade = encontrarEntidade(identificador);

        if (!entidade || !entidade.position) {
            return false;
        }

        if (!Number.isFinite(distancia)) {
            distancia = 2;
        }

        distancia = Math.max(0, distancia);

        if (!inicializar()) {
            return false;
        }

        try {
            const objetivo = new GoalFollow(entidade, distancia);

            seguindo = {
                id: entidade.id,
                nome: entidade.name || entidade.username || null,
                distancia
            };

            destinoAtual = {
                tipo: "seguir",
                id: entidade.id,
                nome: entidade.name || entidade.username || null,
                distancia
            };

            navegando = true;

            bot.pathfinder.setGoal(objetivo, true);

            return true;

        } catch (erro) {
            console.error(
                "🧭 Erro ao seguir:",
                erro.message
            );

            navegando = false;
            destinoAtual = null;
            seguindo = null;

            return false;
        }
    }


    /*
     * IMPORTANTE:
     * estaNavegando() consulta bot.pathfinder.isMoving()
     * diretamente em vez de confiar no flag interno
     * `navegando`. Isso evita o estado "preso em navegando"
     * quando o pathfinder termina sem emitir goal_reached
     * (interrupção externa, morte, teleporte, etc.).
     */
    function estaNavegando() {
        if (!inicializado) {
            return false;
        }

        try {
            return bot.pathfinder.isMoving();
        } catch (_) {
            return false;
        }
    }


    function obterDestino() {
        return destinoAtual;
    }


    function registrarEventos() {
        if (eventosRegistrados) {
            return false;
        }

        eventosRegistrados = true;

        bot.on(
            "goal_reached",
            objetivo => {
                navegando = false;
                destinoAtual = null;
                seguindo = null;

                if (
                    typeof contexto.enviarEvento ===
                    "function"
                ) {
                    contexto.enviarEvento(
                        "navegacao_concluida",
                        {
                            objetivo: objetivo
                                ? {
                                    x: objetivo.x ?? null,
                                    y: objetivo.y ?? null,
                                    z: objetivo.z ?? null
                                }
                                : null
                        }
                    );
                }
            }
        );

        bot.on(
            "path_update",
            resultado => {
                if (
                    resultado &&
                    resultado.status === "noPath"
                ) {
                    /*
                     * Limpa o destino para forçar a
                     * autonomia a replanejar. Sem isso,
                     * o próximo ciclo tenta o mesmo
                     * caminho inalcançável de novo.
                     */
                    navegando = false;
                    destinoAtual = null;
                    seguindo = null;

                    if (
                        typeof contexto.enviarEvento ===
                        "function"
                    ) {
                        contexto.enviarEvento(
                            "navegacao_bloqueada",
                            {
                                destino: null
                            }
                        );
                    }
                }
            }
        );

        return true;
    }


    function obterEstado() {
        return {
            inicializado,
            navegando: estaNavegando(),
            destino: destinoAtual,
            seguindo
        };
    }


    return {
        inicializar,
        parar,

        irPara,
        irParaBloco,
        irParaEntidade,
        irParaJogador,
        seguir,

        encontrarEntidade,

        estaNavegando,
        obterDestino,

        registrarEventos,
        obterEstado
    };
}


module.exports = {
    criarNavegacao
};