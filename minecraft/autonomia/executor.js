/**
 * 🚀 EXECUTOR — AUTONOMIA
 *
 * Roda o ciclo de decisão:
 *   1. checa perigo
 *   2. checa progresso
 *   3. executa tarefa atual
 *   4. avança ou replaneja
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO (v3):
 *
 * 1. NAVEGAÇÃO ANTES DE ACAOEXECUTANDO
 * 2. AUTO-DESTRAVAMENTO não destrava navegação
 * 3. TIMEOUT GLOBAL em executarAcao (12s)
 * 4. AUTO-DESTRAVAMENTO de 30s em outras ações
 * 5. PRIORIDADE DINÂMICA DE COMBATE (Fase 2)
 * 6. FIX — NÃO PARAR AUTONOMIA AO CONCLUIR
 *
 * 7. ⚠️ FIX CRÍTICO — COLETOR OPORTUNISTA
 *
 * 8. ⚠️ FIX CRÍTICO — LIMITE DE TENTATIVAS
 *
 * 9. ⚠️ FIX CRÍTICO — COOLDOWN DO DEFENDER
 *
 * 10. ⚠️ FIX CRÍTICO v3 — BUSCA SEM VARIANTES
 *
 *     O `buscarComCache` procurava variantes quando
 *     não achava o bloco exato. Ex: pedia `oak_log`,
 *     não achava, pegava `jungle_log`.
 *
 *     O handler `obter_bloco` quebrava jungle_log, mas
 *     contava `contarItem("oak_log")` → SEMPRE 0.
 *
 *     Resultado: loop infinito de quebrar jungle_log
 *     sem nunca progredir.
 *
 *     AGORA: `buscarComCache` só retorna o bloco EXATO.
 *     Se não achar, retorna vazio. O handler decide se
 *     aceita variante (com contagem correta) ou não.
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
        autoDestravarMs: 30000,

        // ⚠️ FIX: limite de tentativas antes de pular tarefa
        maxFalhasNaTarefa: 10,

        // ⚠️ FIX: cooldown pra não re-injetar defender
        cooldownDefenderMs: 8000
    };

    const ACOES_NAVEGACAO = new Set([
        "ir_para_bloco",
        "ir_para",
        "ir_para_entidade",
        "seguir"
    ]);

    const TAREFAS_COMBATE = new Set(["defender"]);

    // ⚠️ FIX: cooldown do defender
    let ultimoDefenderInjetadoEm = 0;

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
    //
    // ⚠️ FIX v3: NÃO busca variantes.
    //
    // Antes, se não achava `oak_log`, procurava
    // `birch_log`, `spruce_log`, `jungle_log`, etc.
    //
    // Problema: o handler `obter_bloco` recebia a
    // tarefa com bloco=`oak_log`, quebrava `jungle_log`,
    // mas contava `contarItem("oak_log")` → sempre 0.
    //
    // Loop infinito de quebrar jungle_log sem progredir.
    //
    // AGORA: só retorna o bloco EXATO. Se não achar,
    // retorna [] e o handler decide o que fazer.
    //
    // O planejador é responsável por escolher variantes
    // quando apropriado (via `resolverNomeReal`).
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

        // ⚠️ FIX v3: NÃO buscar variantes aqui.
        // (ver cabeçalho do bloco acima)

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
    // 🎁 COLETOR OPORTUNISTA
    // =========================================================

    async function tentarColetarOportunista() {
        const coletor = contexto.coletor;

        if (!coletor) return false;

        if (typeof coletor.temItemNoChao !== "function") {
            return false;
        }

        let temItem = false;

        try {
            temItem = coletor.temItemNoChao() === true;
        } catch (_) {
            return false;
        }

        if (!temItem) return false;

        console.log(
            `🎁 [AUTONOMIA] Item no chão detectado. ` +
            `Coletando antes de continuar o plano.`
        );

        try {
            if (typeof coletor.coletar === "function") {
                await coletor.coletar();
            }

            await new Promise(r => setTimeout(r, 300));

            estado.definirUltimoMovimento(Date.now());

            return true;

        } catch (erro) {
            console.error(
                "🎁 [AUTONOMIA] Erro no coletor:",
                erro.message
            );
            return false;
        }
    }

    // =========================================================
    // ⚔️ PRIORIDADE DINÂMICA DE COMBATE
    // =========================================================

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

        if (
            tarefaAtual &&
            TAREFAS_COMBATE.has(tarefaAtual.tipo)
        ) {
            return false;
        }

        const agora = Date.now();

        if (
            agora - ultimoDefenderInjetadoEm <
            LOCAL_CONFIG.cooldownDefenderMs
        ) {
            return false;
        }

        const st = estado.obter();
        const plano = st.planoAtual || [];
        const indice = st.indiceTarefa || 0;

        const proximas = plano.slice(indice, indice + 3);

        const jaTemDefender = proximas.some(t =>
            TAREFAS_COMBATE.has(t.tipo)
        );

        if (jaTemDefender) return false;

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

        ultimoDefenderInjetadoEm = agora;

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

            injetarPrioridadeCombate();

            const coletou = await tentarColetarOportunista();

            if (coletou) {
                return;
            }

            const st = estado.obter();

            if (st.indiceTarefa >= st.planoAtual.length) {
                if (st.estado !== "objetivo_concluido") {
                    estado.definirEstado("objetivo_concluido");
                    estado.definirMotivo(MOTIVO.META_FINALIZADA);

                    console.log(
                        `✅ [AUTONOMIA] Objetivo ` +
                        `"${st.metaAtual?.nome}" concluído. ` +
                        `Aguardando nova meta da API.`
                    );

                    emitir("objetivo_concluido", {
                        meta: st.metaAtual,
                        plano: st.planoAtual
                    });
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

            const falhasAtuais =
                estado.obter().falhasNaTarefaAtual;

            if (falhasAtuais >= LOCAL_CONFIG.maxFalhasNaTarefa) {
                console.error(
                    `🚨 [AUTONOMIA] Tarefa "${tarefa.tipo}" ` +
                    `travou ${falhasAtuais}x seguidas. ` +
                    `PULANDO pra próxima.`
                );

                emitir("tarefa_pulada", {
                    tarefa,
                    falhas: falhasAtuais,
                    motivo: "max_falhas_atingido"
                });

                estado.resetarFalhasTarefa();
                estado.avancarTarefa();
                invalidarCache();
                return;
            }

            if (falhasAtuais >= CONFIG.falhasAntesDeReplanejar) {
                estado.definirEstado("replanejando");
                estado.definirMotivo(MOTIVO.MUITAS_FALHAS);

                emitir("replanejando", {
                    tarefa,
                    falhas: falhasAtuais,
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
        injetarPrioridadeCombate
    };
}

module.exports = { criarExecutor };