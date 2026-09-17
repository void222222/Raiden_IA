/**
 * 🧠 AUTONOMIA — ORQUESTRADOR
 *
 * Ponto de entrada do módulo de autonomia.
 *
 * Responsabilidades:
 * - montar as peças (estado, planejador, handlers, executor)
 * - expor API pública (iniciar, parar, reiniciar, definirMeta)
 * - gerenciar o setInterval
 *
 * Não contém lógica de planejamento nem de execução.
 *
 * ⚠️ CORREÇÃO:
 *    definirMeta() agora REATIVA o loop se a autonomia
 *    estava parada (ex: objetivo anterior concluído).
 *
 *    Sem isso, o bot ficava zumbi: quando o objetivo
 *    concluía, o loop parava, e a API não conseguia
 *    mandar um novo objetivo sem o bot reconectar o
 *    WebSocket.
 */

const { CONFIG, MOTIVO } = require("./constantes");
const { criarEstado } = require("./estado");
const { criarPlanejador } = require("./planejador");
const { criarHandlers } = require("./handlers");
const { criarExecutor } = require("./executor");

function criarAutonomia(contexto) {
    // =========================================================
    // 🧩 MONTAGEM
    // =========================================================

    const estado = criarEstado();
    const planejador = criarPlanejador(contexto);

    /*
     * O executor precisa de "handlers", mas handlers
     * precisam de funções do executor (executarAcao,
     * contarItem, etc.). Resolvemos com um objeto
     * intermediário que é preenchido depois.
     */
    const executorRef = {};

    const handlers = criarHandlers({
        mundo: contexto.mundo,
        navegacao: contexto.navegacao,
        percepcao: contexto.percepcao,
        inventario: contexto.inventario,
        crafting: contexto.crafting,

        executarAcao: (...args) =>
            executorRef.executor.executarAcao(...args),
        obterPosicao: () =>
            executorRef.executor.obterPosicao(),
        distancia: (...args) =>
            executorRef.executor.distancia(...args),
        contarItem: (...args) =>
            executorRef.executor.contarItem(...args),
        buscarComCache: (...args) =>
            executorRef.executor.buscarComCache(...args),
        invalidarCache: (...args) =>
            executorRef.executor.invalidarCache(...args),
        registrarAcao: (...args) =>
            executorRef.executor.registrarAcao(...args),
        limparAcao: (...args) =>
            executorRef.executor.limparAcao(...args),

        obterLocalMeta: () => estado.obter().metaAtual?.local,
        definirLocalMeta: (local) => {
            const meta = estado.obter().metaAtual;
            if (meta) meta.local = local;
        }
    });

    /*
     * ⚠️ O contextoComParada ainda existe pra
     * compatibilidade, mas o executor NÃO usa mais
     * `pararAutonomia` ao concluir objetivo.
     *
     * Mantemos aqui caso algum handler futuro queira
     * chamar parada explícita.
     */
    const contextoComParada = {
        ...contexto,
        pararAutonomia: (motivo) => parar(motivo)
    };

    const executor = criarExecutor(contextoComParada, {
        planejador,
        handlers,
        estado
    });

    executorRef.executor = executor;

    // =========================================================
    // 🎯 API — DEFINIR META
    // =========================================================

    function definirMeta(entrada) {
        const meta = planejador.normalizarMeta(entrada);

        if (!meta) {
            executor.emitir("erro", {
                erro: "Meta inválida: sem itens nem etapas.",
                entrada
            });
            return false;
        }

        estado.resetar();
        executor.invalidarCache();

        estado.definirMeta(meta);
        estado.definirPlano(planejador.planejar(meta));
        estado.reiniciarIndiceTarefa();

        estado.definirEstado("replanejando");
        estado.definirMotivo(MOTIVO.NOVA_META);

        executor.emitir("novo_objetivo", {
            objetivo: meta,
            plano: estado.obter().planoAtual
        });

        // ⚠️ FIX: se a autonomia estava parada
        // (ex: objetivo anterior concluído), reinicia
        // o loop pra executar o novo plano.
        //
        // Sem isso, o bot recebia definir_objetivo mas
        // o setInterval continuava morto — ficava zumbi
        // até reconectar o WebSocket.
        if (!estado.estaAtiva()) {
            console.log(
                "🔄 [AUTONOMIA] Reativando loop por novo objetivo."
            );
            iniciar();
        }

        return true;
    }

    // =========================================================
    // 🎮 CONTROLE
    // =========================================================

    function iniciar() {
        if (estado.estaAtiva()) return true;

        estado.definirAtiva(true);
        estado.definirEstado("iniciando");
        estado.definirMotivo("ativada");
        estado.definirIniciadoEm(Date.now());
        estado.definirUltimoMovimento(Date.now());
        estado.definirUltimaPosicao(executor.obterPosicao());

        executor.emitir("iniciada", {
            meta: estado.obter().metaAtual,
            plano: estado.obter().planoAtual
        });

        const intervalo = setInterval(
            executor.decidir,
            CONFIG.intervaloDecisao
        );

        estado.definirIntervalo(intervalo);

        executor.decidir();

        return true;
    }

    function parar(motivoParada = "manual") {
        if (!estado.estaAtiva() && !estado.obterIntervalo()) {
            return true;
        }

        estado.definirAtiva(false);
        estado.definirEstado("parada");
        estado.definirMotivo(motivoParada);

        estado.limparAcao();

        const intervalo = estado.obterIntervalo();
        if (intervalo) {
            clearInterval(intervalo);
            estado.definirIntervalo(null);
        }

        try {
            if (
                contexto.navegacao &&
                typeof contexto.navegacao.parar === "function"
            ) {
                contexto.navegacao.parar();
            }
        } catch (_) {}

        executor.emitir("parada", { motivo: motivoParada });

        return true;
    }

    function reiniciar() {
        parar("reinicio");

        estado.resetar();
        executor.invalidarCache();

        const meta = estado.obter().metaAtual;

        if (meta) {
            estado.definirPlano(planejador.planejar(meta));
            estado.reiniciarIndiceTarefa();

            if (meta.local) delete meta.local;
        }

        return iniciar();
    }

    // =========================================================
    // 🔍 ESTADO PÚBLICO
    // =========================================================

    function estaAtiva() {
        return estado.estaAtiva();
    }

    function obterEstado() {
        const st = estado.obter();

        const contar = (nome) => planejador.contarItem(nome);

        return {
            ...st,

            navegando:
                contexto.navegacao &&
                typeof contexto.navegacao.estaNavegando ===
                    "function"
                    ? contexto.navegacao.estaNavegando()
                    : false,

            objetivoAtual: st.metaAtual,
            etapaAtual: st.tarefaAtual,

            recursos: {
                madeira:
                    contar("oak_log") +
                    contar("birch_log") +
                    contar("spruce_log") +
                    contar("jungle_log"),
                tabuas:
                    contar("oak_planks") +
                    contar("birch_planks") +
                    contar("spruce_planks") +
                    contar("jungle_planks")
            }
        };
    }

    // =========================================================
    // 🔌 API
    // =========================================================

    return {
        iniciar,
        parar,
        reiniciar,
        decidir: executor.decidir,
        estaAtiva,
        obterEstado,
        definirObjetivo: definirMeta,
        definirMeta
    };
}

module.exports = { criarAutonomia };