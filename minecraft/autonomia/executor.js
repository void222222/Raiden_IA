/**
 * 🚀 EXECUTOR — AUTONOMIA
 *
 * Roda o ciclo de decisão:
 *   1. checa perigo
 *   2. checa progresso
 *   3. executa tarefa atual
 *   4. avança ou replaneja
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO:
 *
 * 1. NAVEGAÇÃO ANTES DE ACAOEXECUTANDO
 * 2. AUTO-DESTRAVAMENTO não destrava navegação
 * 3. TIMEOUT GLOBAL em executarAcao (12s)
 * 4. AUTO-DESTRAVAMENTO de 30s em outras ações
 *
 * 5. ⚠️ NOVO (Fase 2): PRIORIDADE DINÂMICA DE COMBATE
 *
 *    A cada ciclo, ANTES de executar a tarefa atual,
 *    o executor consulta `percepcao.obterAmeacaEmArea()`.
 *
 *    Se a sugestão for "lutar", "recuar" ou "fugir",
 *    ele injeta a tarefa `defender` no TOPO do plano.
 *
 *    Controle:
 *      - Se já tem um `defender` no topo, não injeta de novo.
 *      - Se o plano já é `defender`, não injeta de novo.
 *      - Se a ameaça desapareceu, a tarefa `defender`
 *        conclui sozinha e o plano volta ao normal.
 */

const {
    CONFIG,
    MOTIVO,
    RESULTADO
} = require("./constantes");

function criarExecutor(contexto, deps) {
    const {
        bot,
        percepcao,
        navegacao,
        enviarEvento
    } = contexto;

    const {
        planejador,
        handlers,
        estado
    } = deps;

    // =========================================================
    // ⚙️ CONFIG LOCAL
    // =========================================================

    const LOCAL_CONFIG = {
        timeoutAcaoMs: 12000,
        autoDestravarMs: 30000
    };

    const ACOES_NAVEGACAO = new Set([
        "ir_para_bloco",
        "ir_para",
        "ir_para_entidade",
        "seguir"
    ]);

    // ⚠️ NOVO: tipos de tarefa que são de combate.
    // Se já tem uma dessas no topo, não injeta outra.
    const TAREFAS_COMBATE = new Set(["defender"]);

    // =========================================================
    // 📢 EMISSÃO
    // =========================================================

    function emitir(tipo, dados = {}) {
        if (typeof enviarEvento !== "function") return;

        try {
            enviarEvento(`minecraft_autonomia_${tipo}`, dados);
        } catch (_) {}
    }

    // =========================================================
    // 📍 GEOMETRIA
    // =========================================================

    function obterPosicao() {
        const pos = bot?.entity?.position;
        if (!pos) return null;

        return {
            x: Number(pos.x),
            y: Number(pos.y),
            z: Number(pos.z)
        };
    }

    function distancia(a, b) {
        if (!a || !b) return Infinity;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // =========================================================
    // ⚠️ PERIGO
    // =========================================================

    function obterPerigos() {
        if (!percepcao) return [];

        try {
            if (typeof percepcao.obterPerigos === "function") {
                return percepcao.obterPerigos() || [];
            }
            if (
                typeof percepcao.obterInimigosProximos ===
                "function"
            ) {
                return percepcao.obterInimigosProximos() || [];
            }
        } catch (_) {}

        return [];
    }

    function obterPerigosCriticos() {
        const perigos = obterPerigos();

        return perigos.filter(p => {
            if (p.gravidade) {
                return p.gravidade === "critico";
            }

            const pos = p?.posicao || p?.position;
            if (!pos) return false;

            const origem = obterPosicao();
            if (!origem) return false;

            return (
                distancia(origem, pos) <=
                CONFIG.distanciaPerigo
            );
        });
    }

    function existePerigoCritico() {
        if (
            percepcao &&
            typeof percepcao.existePerigoCritico === "function"
        ) {
            try {
                return percepcao.existePerigoCritico() === true;
            } catch (_) {}
        }

        return obterPerigosCriticos().length > 0;
    }

    function existeAlgumPerigo() {
        return obterPerigos().length > 0;
    }

    // =========================================================
    // 🎒 INVENTÁRIO
    // =========================================================

    function contarItem(nome) {
        return planejador.contarItem(nome);
    }

    function snapshotInventario() {
        if (
            !contexto.inventario ||
            typeof contexto.inventario.obterItens !== "function"
        ) {
            return "";
        }

        try {
            const itens = contexto.inventario.obterItens() || [];

            return itens
                .map(i => `${i.nome}:${i.quantidade}`)
                .sort()
                .join("|");
        } catch (_) {
            return "";
        }
    }

    // =========================================================
    // 🗺️ CACHE DE BUSCA
    // =========================================================

    const cacheBusca = {
        em: 0,
        chave: null,
        blocos: []
    };

    function buscarComCache(nomeBloco) {
        const agora = Date.now();

        if (
            cacheBusca.chave === nomeBloco &&
            cacheBusca.blocos.length &&
            agora - cacheBusca.em < CONFIG.cacheBuscaMs
        ) {
            return cacheBusca.blocos;
        }

        let encontrados = [];

        try {
            encontrados = contexto.mundo.encontrarBlocos(
                nomeBloco,
                CONFIG.raioBuscaPadrao,
                1
            );
        } catch (_) {
            encontrados = [];
        }

        if (!Array.isArray(encontrados)) {
            encontrados = [];
        }

        if (!encontrados.length) {
            const { VARIANTES_BLOCO } = require("./constantes");

            const variantes =
                VARIANTES_BLOCO[nomeBloco] || [];

            for (const v of variantes) {
                try {
                    const alt =
                        contexto.mundo.encontrarBlocos(
                            v,
                            CONFIG.raioBuscaPadrao,
                            1
                        );

                    if (Array.isArray(alt) && alt.length) {
                        encontrados = alt;
                        break;
                    }
                } catch (_) {}
            }
        }

        cacheBusca.em = agora;
        cacheBusca.chave = nomeBloco;
        cacheBusca.blocos = encontrados;

        return encontrados;
    }

    function invalidarCache() {
        cacheBusca.em = 0;
        cacheBusca.chave = null;
        cacheBusca.blocos = [];
    }

    // =========================================================
    // 🎬 EXECUTAR AÇÃO
    // =========================================================

    function podeTentarAcao(nome) {
        const st = estado.obter();

        if (
            !st.ultimaAcaoFalha ||
            st.ultimaAcaoFalha.nome !== nome
        ) {
            return true;
        }

        return Date.now() >= st.bloqueioAte;
    }

    function registrarAcao(nome, parametros) {
        estado.registrarAcao({
            nome,
            parametros,
            iniciadaEm: Date.now()
        });
    }

    function limparAcao() {
        estado.limparAcao();
    }

    function registrarFalhaAcao(nome, resultado) {
        const agora = Date.now();

        estado.registrarFalha({
            nome,
            erro: resultado?.erro || "falha",
            em: agora
        });

        estado.incrementarFalhasConsecutivas();

        estado.definirBloqueioAte(
            agora + CONFIG.cooldownFalha
        );

        emitir("acao_falhou", {
            acao: nome,
            resultado,
            falhasConsecutivas:
                estado.obter().falhasConsecutivas,
            bloqueioAte: estado.obter().bloqueioAte
        });
    }

    function marcarProgresso() {
        estado.definirUltimoMovimento(Date.now());
    }

    async function executarAcao(nome, parametros = {}) {
        if (!podeTentarAcao(nome)) {
            return {
                sucesso: false,
                erro: `Ação "${nome}" em cooldown.`
            };
        }

        const executarAcaoPublica =
            contexto.executarAcaoPublica;

        if (typeof executarAcaoPublica !== "function") {
            return {
                sucesso: false,
                erro: "Sistema de ações indisponível."
            };
        }

        registrarAcao(nome, parametros);

        emitir("acao", {
            acao: nome,
            parametros,
            meta: estado.obter().metaAtual,
            tarefa: estado.tarefaAtual()
        });

        let timerId;

        const timeoutPromise = new Promise((resolve) => {
            timerId = setTimeout(() => {
                console.error(
                    `⏱️ [AUTONOMIA] Ação "${nome}" excedeu ` +
                    `${LOCAL_CONFIG.timeoutAcaoMs}ms. Forçando limpeza.`
                );

                resolve({
                    sucesso: false,
                    erro: `Timeout de ação (${LOCAL_CONFIG.timeoutAcaoMs}ms)`
                });
            }, LOCAL_CONFIG.timeoutAcaoMs);
        });

        try {
            const resultado = await Promise.race([
                executarAcaoPublica(nome, parametros),
                timeoutPromise
            ]);

            clearTimeout(timerId);
            limparAcao();

            const final = resultado || {
                sucesso: false,
                erro: "Ação não retornou resultado."
            };

            if (final.sucesso) {
                estado.limparFalhas();
                marcarProgresso();
            } else {
                registrarFalhaAcao(nome, final);
            }

            emitir("acao_resultado", {
                acao: nome,
                parametros,
                resultado: final,
                meta: estado.obter().metaAtual,
                tarefa: estado.tarefaAtual()
            });

            return final;

        } catch (erro) {
            clearTimeout(timerId);
            limparAcao();

            const final = {
                sucesso: false,
                erro: erro?.message || String(erro)
            };

            registrarFalhaAcao(nome, final);

            emitir("acao_resultado", {
                acao: nome,
                parametros,
                resultado: final
            });

            return final;
        }
    }

    // =========================================================
    // 📊 VERIFICAÇÃO DE PROGRESSO
    // =========================================================

    let travamentosConsecutivos = 0;
    const TRAVAMENTOS_ANTES_DE_ESCALAR = 3;

    function verificarProgresso() {
        const atual = obterPosicao();
        if (!atual) return;

        const st = estado.obter();
        const agora = Date.now();

        if (!st.ultimaPosicao) {
            estado.definirUltimaPosicao(atual);
            estado.definirUltimoMovimento(agora);

            estado.definirUltimoInventario?.(
                snapshotInventario()
            );
            return;
        }

        const deslocamento = distancia(
            atual,
            st.ultimaPosicao
        );

        if (deslocamento >= 0.4) {
            estado.definirUltimaPosicao(atual);
            estado.definirUltimoMovimento(agora);
            travamentosConsecutivos = 0;
            return;
        }

        const invAtual = snapshotInventario();
        const invAnterior =
            st.ultimoInventario ??
            estado.obter().ultimoInventario ??
            null;

        if (invAnterior !== null && invAtual !== invAnterior) {
            estado.definirUltimoMovimento(agora);
            estado.definirUltimoInventario?.(invAtual);
            travamentosConsecutivos = 0;
            return;
        }

        estado.definirUltimoInventario?.(invAtual);

        if (
            st.ultimoMovimento &&
            agora - st.ultimoMovimento >=
                CONFIG.tempoParadoMaximo
        ) {
            travamentosConsecutivos++;

            const escalou =
                travamentosConsecutivos >=
                TRAVAMENTOS_ANTES_DE_ESCALAR;

            emitir("travado", {
                meta: st.metaAtual,
                tarefa: estado.tarefaAtual(),
                acao: st.acaoAtual,
                posicao: atual,
                travamentosConsecutivos,
                escalado: escalou
            });

            if (escalou) {
                console.error(
                    `🚨 [AUTONOMIA] Travamento persistente ` +
                    `(${travamentosConsecutivos}x). ` +
                    `Tarefa: ${estado.tarefaAtual()?.tipo}`
                );

                emitir("travamento_persistente", {
                    meta: st.metaAtual,
                    tarefa: estado.tarefaAtual(),
                    posicao: atual,
                    travamentos: travamentosConsecutivos
                });
            }

            try {
                if (
                    navegacao &&
                    typeof navegacao.parar === "function"
                ) {
                    navegacao.parar();
                }
            } catch (_) {}

            estado.definirEstado("replanejando");
            estado.definirMotivo(MOTIVO.SEM_PROGRESSO);

            estado.limparFalhas();
            invalidarCache();

            estado.definirUltimoMovimento(agora);
            estado.definirUltimaPosicao(atual);
        }
    }

    // =========================================================
    // 🔨 EXECUTAR TAREFA
    // =========================================================

    async function executarTarefa(tarefa) {
        const handler = handlers[tarefa.tipo];

        if (typeof handler !== "function") {
            return RESULTADO.falha(
                `tipo_tarefa_desconhecido:${tarefa.tipo}`
            );
        }

        try {
            return await handler(tarefa);
        } catch (erro) {
            return RESULTADO.falha(
                erro?.message || String(erro)
            );
        }
    }

    // =========================================================
    // 🚨 AUTO-DESTRAVAMENTO
    // =========================================================

    function verificarAutoDestravamento() {
        const st = estado.obter();

        if (!st.acaoExecutando) return;
        if (!st.acaoAtual?.iniciadaEm) return;

        if (
            st.acaoAtual.nome &&
            ACOES_NAVEGACAO.has(st.acaoAtual.nome)
        ) {
            return;
        }

        const tempoTravado = Date.now() - st.acaoAtual.iniciadaEm;

        if (tempoTravado <= LOCAL_CONFIG.autoDestravarMs) {
            return;
        }

        console.error(
            `🚨 [AUTONOMIA] Ação "${st.acaoAtual.nome}" ` +
            `travada há ${Math.round(tempoTravado / 1000)}s. ` +
            `Destravando na força.`
        );

        try { bot.stopDigging(); } catch (_) {}

        limparAcao();

        emitir("auto_destravamento", {
            acao: st.acaoAtual.nome,
            tempoTravado,
            posicao: obterPosicao()
        });
    }

    // =========================================================
    // ⚔️ PRIORIDADE DINÂMICA DE COMBATE — NOVO (FASE 2)
    // =========================================================

    /*
     * Consulta a percepção e, se houver ameaça,
     * injeta `defender` no topo do plano.
     *
     * Regras:
     *   1. Não injeta se já tem `defender` no topo.
     *   2. Não injeta se a ameaça é "seguro".
     *   3. Em "lutar", "recuar" ou "fugir", injeta.
     *   4. Não injeta se o estado está em perigo crítico
     *      (o bloco de perigo crítico já tratou).
     *
     * A tarefa `defender` conclui sozinha quando
     * a ameaça desaparece.
     */
    function injetarPrioridadeCombate() {
        if (!percepcao) return false;
        if (typeof percepcao.obterAmeacaEmArea !== "function") {
            return false;
        }

        let ameaca;

        try {
            ameaca = percepcao.obterAmeacaEmArea(8);
        } catch (_) {
            return false;
        }

        if (!ameaca || ameaca.total === 0) return false;
        if (ameaca.sugestao === "seguro") return false;

        const tarefaAtual = estado.tarefaAtual();

        // Já está defendendo? Não injeta de novo.
        if (
            tarefaAtual &&
            TAREFAS_COMBATE.has(tarefaAtual.tipo)
        ) {
            return false;
        }

        // Verifica o plano atual pra não duplicar
        const st = estado.obter();
        const plano = st.planoAtual || [];
        const indice = st.indiceTarefa || 0;

        // Olha as próximas 3 tarefas
        const proximas = plano.slice(indice, indice + 3);

        const jaTemDefender = proximas.some(t =>
            TAREFAS_COMBATE.has(t.tipo)
        );

        if (jaTemDefender) return false;

        // Injeta no topo (antes do índice atual)
        try {
            plano.splice(indice, 0, {
                tipo: "defender",
                motivo: ameaca.sugestao,
                ameaca: {
                    total: ameaca.total,
                    criticos: ameaca.criticos,
                    arqueiros: ameaca.arqueiros,
                    creepers: ameaca.creepers,
                    sugestao: ameaca.sugestao,
                    maisPerigoso: ameaca.maisPerigoso?.nome || null
                }
            });

            estado.definirPlano(plano);
        } catch (erro) {
            console.error(
                "⚠️ [AUTONOMIA] Falha ao injetar defender:",
                erro.message
            );
            return false;
        }

        console.log(
            `⚔️ [AUTONOMIA] Ameaça detectada ` +
            `(total=${ameaca.total}, ` +
            `sugestão=${ameaca.sugestao}). ` +
            `Injetando defender no topo do plano.`
        );

        emitir("prioridade_combate", {
            total: ameaca.total,
            criticos: ameaca.criticos,
            arqueiros: ameaca.arqueiros,
            creepers: ameaca.creepers,
            sugestao: ameaca.sugestao,
            maisPerigoso: ameaca.maisPerigoso?.nome || null,
            posicao: obterPosicao()
        });

        return true;
    }

    // =========================================================
    // 🎯 LOOP DE DECISÃO
    // =========================================================

    async function decidir() {
        verificarAutoDestravamento();

        if (!estado.estaAtiva()) return;
        if (estado.estaBloqueandoDecisao()) return;
        if (!bot?.entity) return;

        const navegando =
            navegacao &&
            typeof navegacao.estaNavegando === "function"
                ? navegacao.estaNavegando()
                : false;

        if (navegando) {
            const st = estado.obter();

            if (
                st.acaoAtual?.nome &&
                ACOES_NAVEGACAO.has(st.acaoAtual.nome)
            ) {
                limparAcao();
            }

            estado.definirEstado("navegando");
            return;
        }

        const stAgora = estado.obter();

        if (
            stAgora.acaoAtual?.nome &&
            ACOES_NAVEGACAO.has(stAgora.acaoAtual.nome)
        ) {
            limparAcao();
        }

        if (estado.temAcaoExecutando()) return;

        estado.definirBloqueandoDecisao(true);
        estado.definirUltimaDecisao(Date.now());

        try {
            emitir("estado", estado.obter());

            const meta = estado.obter().metaAtual;

            if (!meta) {
                estado.definirEstado("sem_objetivo");
                estado.definirMotivo(MOTIVO.AGUARDANDO_API);
                return;
            }

            const perigos = obterPerigos();
            const criticos = obterPerigosCriticos();

            if (criticos.length > 0) {
                estado.definirEstado("perigo");
                estado.definirMotivo(MOTIVO.PERIGO_PROXIMO);

                emitir("perigo", {
                    meta,
                    tarefa: estado.tarefaAtual(),
                    perigos,
                    criticos,
                    posicao: obterPosicao()
                });

                try {
                    if (
                        navegacao &&
                        typeof navegacao.parar === "function"
                    ) {
                        navegacao.parar();
                    }
                } catch (_) {}

                return;
            }

            if (perigos.length > 0) {
                emitir("alerta", {
                    meta,
                    tarefa: estado.tarefaAtual(),
                    perigos,
                    posicao: obterPosicao()
                });
            }

            verificarProgresso();

            // ⚠️ NOVO (Fase 2): prioridade de combate
            // Roda DEPOIS do perigo crítico e ANTES
            // de checar se a meta foi concluída.
            //
            // Assim, se a Raiden tem um inimigo perto,
            // ela larga o que está fazendo e luta.
            injetarPrioridadeCombate();

            const st = estado.obter();

            if (st.indiceTarefa >= st.planoAtual.length) {
                if (st.estado !== "objetivo_concluido") {
                    estado.definirEstado("objetivo_concluido");
                    estado.definirMotivo(MOTIVO.META_FINALIZADA);

                    console.log(
                        `✅ [AUTONOMIA] Objetivo ` +
                        `"${st.metaAtual?.nome}" concluído. ` +
                        `Parando execução pra aguardar nova meta.`
                    );

                    emitir("objetivo_concluido", {
                        meta: st.metaAtual,
                        plano: st.planoAtual
                    });

                    // ⚠️ NOVO: para o setInterval pra não
                    // ficar em loop de "travamento persistente"
                    if (
                        contexto &&
                        typeof contexto.pararAutonomia === "function"
                    ) {
                        try {
                            contexto.pararAutonomia(
                                "objetivo_concluido"
                            );
                        } catch (_) {}
                    }
                }
                return;
            }
            const tarefa = estado.tarefaAtual();
            const resultado = await executarTarefa(tarefa);

            if (resultado.concluida) {
                estado.resetarFalhasTarefa();
                estado.avancarTarefa();

                marcarProgresso();
                travamentosConsecutivos = 0;

                emitir("tarefa_concluida", {
                    tarefa,
                    proxima: estado.tarefaAtual(),
                    indice: estado.obter().indiceTarefa,
                    total: estado.obter().planoAtual.length
                });
                return;
            }

            if (resultado.emProgresso) {
                estado.resetarFalhasTarefa();
                return;
            }

            estado.incrementarFalhasTarefa();

            if (
                estado.obter().falhasNaTarefaAtual >=
                CONFIG.falhasAntesDeReplanejar
            ) {
                estado.definirEstado("replanejando");
                estado.definirMotivo(MOTIVO.MUITAS_FALHAS);

                emitir("replanejando", {
                    tarefa,
                    falhas: estado.obter().falhasNaTarefaAtual,
                    erro: resultado.erro
                });

                const novoPlano = planejador.planejar(meta);

                estado.definirPlano(novoPlano);
                estado.reiniciarIndiceTarefa();
                estado.resetarFalhasTarefa();
            }

        } catch (erro) {
            estado.definirEstado("erro");
            estado.definirMotivo(
                erro?.message || String(erro)
            );

            emitir("erro", {
                erro: estado.obter().motivo,
                meta: estado.obter().metaAtual,
                tarefa: estado.tarefaAtual()
            });

        } finally {
            estado.definirBloqueandoDecisao(false);
        }
    }

    return {
        decidir,
        emitir,
        obterPosicao,
        distancia,
        contarItem,
        buscarComCache,
        invalidarCache,
        executarAcao,
        registrarAcao,
        limparAcao,
        obterPerigos,
        obterPerigosCriticos,
        existePerigoCritico,
        existeAlgumPerigo,

        // ⚠️ NOVO (Fase 2)
        injetarPrioridadeCombate
    };
}

module.exports = { criarExecutor };