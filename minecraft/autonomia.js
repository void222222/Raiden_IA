/**
 * 🧠 AUTONOMIA — RAIDEN MINECRAFT
 *
 * Cérebro de execução da Raiden.
 *
 * Fluxo:
 *
 * objetivo
 *   ↓
 * etapa
 *   ↓
 * ação
 *   ↓
 * resultado
 *   ↓
 * verificar estado
 *   ↓
 * próxima etapa / replanejar
 *
 * IMPORTANTE:
 * - Não escolhe coordenadas aleatórias.
 * - Não executa movimento diretamente.
 * - Usa o módulo de ações.
 * - Usa inventário/percepção/navegação para decidir.
 */

function criarAutonomia(contexto) {
    const {
        bot,
        percepcao,
        inventario,
        mundo,
        navegacao,
        enviarEvento
    } = contexto;

    const CONFIG = {
        intervaloDecisao: 2000,
        distanciaPerigo: 8,
        tempoParadoMaximo: 6000,
        distanciaChegada: 3,
        raioBuscaMadeira: 12,
        distanciaQuebra: 5,
        madeiraMinima: 25,
        tabuasMinimas: 100,
        limiteFalhasAcao: 3,
        cooldownFalha: 8000
    };

    let ativa = false;
    let intervalo = null;

    let estado = "parada";
    let motivo = null;

    let objetivoAtual = {
        id: "primeiro_abrigo",
        nome: "Construir um abrigo",
        descricao:
            "Encontrar recursos e construir um abrigo simples.",
        etapa: 0
    };

    let iniciadoEm = null;
    let ultimaDecisao = null;

    let ultimaPosicao = null;
    let ultimoMovimento = null;

    let acaoAtual = null;
    let acaoExecutando = false;

    let bloqueandoDecisao = false;
    let ultimaAcaoFalha = null;
    let falhasConsecutivas = 0;
    let bloqueioAte = 0;

    /*
     * Etapas do primeiro objetivo real.
     *
     * Não estamos tentando fazer Minecraft inteiro
     * de uma vez.
     *
     * Primeiro fazemos o cérebro conseguir executar
     * uma cadeia coerente de decisões.
     */
    const ETAPAS_ABRIGO = [
        {
            id: "madeira",
            nome: "Conseguir madeira",
            descricao:
                "Encontrar árvores e conseguir madeira.",
        },

        {
            id: "recursos_basicos",
            nome: "Conseguir recursos básicos",
            descricao:
                "Transformar madeira em tábuas e criar recursos básicos.",
        },

        {
            id: "local",
            nome: "Encontrar local para abrigo",
            descricao:
                "Encontrar um local seguro para construir.",
        },

        {
            id: "abrigo",
            nome: "Construir abrigo",
            descricao:
                "Construir um abrigo simples.",
        }
    ];

    function emitir(tipo, dados = {}) {
        if (typeof enviarEvento !== "function") {
            return;
        }

        try {
            enviarEvento(
                `minecraft_autonomia_${tipo}`,
                dados
            );
        } catch (_) {
            // Evento nunca pode derrubar a autonomia.
        }
    }

    function obterPosicao() {
        if (
            !bot ||
            !bot.entity ||
            !bot.entity.position
        ) {
            return null;
        }

        const pos = bot.entity.position;

        return {
            x: Number(pos.x),
            y: Number(pos.y),
            z: Number(pos.z)
        };
    }

    function distancia(a, b) {
        if (!a || !b) {
            return Infinity;
        }

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        return Math.sqrt(
            dx * dx +
            dy * dy +
            dz * dz
        );
    }

    function obterPerigos() {
        if (!percepcao) {
            return [];
        }

        try {
            if (
                typeof percepcao.obterPerigos ===
                "function"
            ) {
                return (
                    percepcao.obterPerigos() ||
                    []
                );
            }

            if (
                typeof percepcao.obterInimigosProximos ===
                "function"
            ) {
                return (
                    percepcao.obterInimigosProximos() ||
                    []
                );
            }
        } catch (_) {
            return [];
        }

        return [];
    }

    function existePerigo() {
        const perigos = obterPerigos();

        if (!Array.isArray(perigos)) {
            return false;
        }

        const origem = obterPosicao();

        return perigos.some(perigo => {
            const pos =
                perigo?.posicao ||
                perigo?.position;

            if (!pos) {
                return true;
            }

            return (
                distancia(origem, pos) <=
                CONFIG.distanciaPerigo
            );
        });
    }

    function obterEtapaAtual() {
        if (
            !objetivoAtual ||
            objetivoAtual.etapa >=
                ETAPAS_ABRIGO.length
        ) {
            return null;
        }

        return ETAPAS_ABRIGO[
            objetivoAtual.etapa
        ];
    }

    function contarItem(nome) {
        if (
            !inventario ||
            typeof inventario.contarItem !==
                "function"
        ) {
            return 0;
        }

        try {
            return Number(
                inventario.contarItem(nome) || 0
            );
        } catch (_) {
            return 0;
        }
    }

    function possuiItem(
        nome,
        quantidade = 1
    ) {
        return (
            contarItem(nome) >=
            quantidade
        );
    }

    function contarQualquerItem(nomes) {
        return nomes.reduce(
            (total, nome) => total + contarItem(nome),
            0
        );
    }

    const TIPOS_MADEIRA = [
        "oak_log",
        "birch_log",
        "spruce_log",
        "jungle_log",
        "acacia_log",
        "dark_oak_log",
        "mangrove_log",
        "cherry_log"
    ];

    const MAPA_TABUAS = {
        oak_log: "oak_planks",
        birch_log: "birch_planks",
        spruce_log: "spruce_planks",
        jungle_log: "jungle_planks",
        acacia_log: "acacia_planks",
        dark_oak_log: "dark_oak_planks",
        mangrove_log: "mangrove_planks",
        cherry_log: "cherry_planks"
    };

    function quantidadeMadeira() {
        return contarQualquerItem(TIPOS_MADEIRA);
    }

    function possuiMadeira(quantidade = 1) {
        return quantidadeMadeira() >= quantidade;
    }

    function quantidadeTabuas() {
        return contarQualquerItem(
            Object.values(MAPA_TABUAS)
        );
    }

    function possuiTabuas(quantidade = 1) {
        return quantidadeTabuas() >= quantidade;
    }

    function obterTipoMadeira() {
        return TIPOS_MADEIRA.find(
            madeira => possuiItem(madeira, 1)
        ) || null;
    }

    function obterTipoTabua() {
        const madeira = obterTipoMadeira();

        if (madeira && MAPA_TABUAS[madeira]) {
            return MAPA_TABUAS[madeira];
        }

        return Object.keys(MAPA_TABUAS)
            .map(madeira => MAPA_TABUAS[madeira])
            .find(tabua => possuiItem(tabua, 1)) || null;
    }

    function obterRecursosObjetivo() {
        return {
            madeira: quantidadeMadeira(),
            tabuas: quantidadeTabuas(),
            madeiraNecessaria: CONFIG.madeiraMinima,
            tabuasNecessarias: CONFIG.tabuasMinimas
        };
    }

    function limparAcao() {
        acaoAtual = null;
        acaoExecutando = false;
    }

    function registrarAcao(
        nome,
        parametros = {}
    ) {
        acaoAtual = {
            nome,
            parametros,
            iniciadaEm: Date.now()
        };

        acaoExecutando = true;
    }

    function registrarFalhaAcao(nome, resultado) {
        const agora = Date.now();

        ultimaAcaoFalha = {
            nome,
            erro: resultado?.erro || "falha",
            em: agora
        };

        falhasConsecutivas += 1;

        bloqueioAte =
            agora +
            CONFIG.cooldownFalha;

        emitir("acao_falhou", {
            acao: nome,
            resultado,
            falhasConsecutivas,
            bloqueioAte
        });
    }

    function podeTentarAcao(nome) {
        if (
            !ultimaAcaoFalha ||
            ultimaAcaoFalha.nome !== nome
        ) {
            return true;
        }

        return Date.now() >= bloqueioAte;
    }

    function acaoPermitidaNaEtapa(nome) {
        const etapa = obterEtapaAtual();

        if (!etapa) {
            return false;
        }

        const permitidas = {
            madeira: [
                "ir_para_bloco",
                "quebrar"
            ],

            recursos_basicos: [
                "craftar"
            ],

            local: [
                "ir_para_bloco"
            ],

            abrigo: [
                "construir"
            ]
        };

        return (
            permitidas[etapa.id] || []
        ).includes(nome);
    }

    function obterPlanoEtapa() {
        const etapa = obterEtapaAtual();

        if (!etapa) {
            return null;
        }

        const planos = {
            madeira: {
                acaoPrincipal: "quebrar",

                acoesPermitidas: [
                    "ir_para_bloco",
                    "quebrar"
                ],

                precondicao:
                    "Encontrar madeira e quebrar troncos até atingir a quantidade necessária."
            },

            recursos_basicos: {
                acaoPrincipal: "craftar",

                acoesPermitidas: [
                    "craftar"
                ],

                precondicao:
                    `Possuir pelo menos ${CONFIG.madeiraMinima} troncos e transformar em ${CONFIG.tabuasMinimas} tábuas.`
            },

            local: {
                acaoPrincipal: "ir_para_bloco",

                acoesPermitidas: [
                    "ir_para_bloco"
                ],

                precondicao:
                    "Escolher um local seguro e livre para o abrigo."
            },

            abrigo: {
                acaoPrincipal: "construir",

                acoesPermitidas: [
                    "construir"
                ],

                precondicao:
                    `Possuir pelo menos ${CONFIG.tabuasMinimas} tábuas antes de construir.`
            }
        };

        return {
            ...planos[etapa.id],
            recursos: obterRecursosObjetivo()
        };
    }

    async function executarAcao(
        nome,
        parametros = {}
    ) {
        if (!acaoPermitidaNaEtapa(nome)) {
            const resultado = {
                sucesso: false,
                erro:
                    `Ação "${nome}" não permitida na etapa "${obterEtapaAtual()?.id || "desconhecida"}".`
            };

            emitir("acao_bloqueada_etapa", {
                acao: nome,
                resultado,
                plano: obterPlanoEtapa()
            });

            return resultado;
        }

        if (!podeTentarAcao(nome)) {
            return {
                sucesso: false,
                erro:
                    `Ação "${nome}" em cooldown após falha anterior.`
            };
        }

        /*
         * O contexto recebe a referência real
         * depois que bot.js inicializa o módulo.
         */
        const acoes = contexto.acoes;

        if (
            !acoes ||
            typeof acoes.executar !==
                "function"
        ) {
            estado = "erro";

            motivo =
                "sistema_acoes_indisponivel";

            emitir("erro", {
                erro:
                    "Sistema de ações indisponível."
            });

            return {
                sucesso: false,
                erro:
                    "Sistema de ações indisponível."
            };
        }

        registrarAcao(
            nome,
            parametros
        );

        emitir("acao", {
            acao: nome,
            parametros,
            objetivo: objetivoAtual,
            etapa: obterEtapaAtual()
        });

        try {
            const resultado =
                await acoes.executar(
                    nome,
                    parametros
                );

            limparAcao();

            const resultadoFinal =
                resultado || {
                    sucesso: false,
                    erro:
                        "Ação não retornou resultado."
                };

            if (resultadoFinal.sucesso) {
                ultimaAcaoFalha = null;
                falhasConsecutivas = 0;
                bloqueioAte = 0;
            } else {
                registrarFalhaAcao(
                    nome,
                    resultadoFinal
                );
            }

            emitir(
                "acao_resultado",
                {
                    acao: nome,
                    parametros,
                    resultado: resultadoFinal,
                    objetivo:
                        objetivoAtual,
                    etapa:
                        obterEtapaAtual(),
                    plano:
                        obterPlanoEtapa()
                }
            );

            return resultadoFinal;

        } catch (erro) {
            limparAcao();

            const resultado = {
                sucesso: false,
                erro:
                    erro?.message ||
                    String(erro)
            };

            registrarFalhaAcao(
                nome,
                resultado
            );

            emitir(
                "acao_resultado",
                {
                    acao: nome,
                    parametros,
                    resultado
                }
            );

            return resultado;
        }
    }

    function avancarEtapa() {
        if (!objetivoAtual) {
            return;
        }

        const etapaAnterior =
            obterEtapaAtual();

        objetivoAtual.etapa += 1;

        const novaEtapa =
            obterEtapaAtual();

        emitir(
            "etapa_concluida",
            {
                objetivo:
                    objetivoAtual,
                etapaAnterior,
                novaEtapa
            }
        );

        if (!novaEtapa) {
            estado =
                "objetivo_concluido";

            motivo =
                "abrigo_finalizado";

            emitir(
                "objetivo_concluido",
                {
                    objetivo:
                        objetivoAtual
                }
            );

            return;
        }

        estado =
            "replanejando";

        motivo =
            "proxima_etapa";
    }

    async function executarEtapaMadeira() {
        if (possuiMadeira(CONFIG.madeiraMinima)) {
            avancarEtapa();
            return true;
        }

        estado = "procurando_madeira";
        motivo = "madeira_necessaria";

        const plano = obterPlanoEtapa();

        emitir("objetivo", {
            objetivo: objetivoAtual,
            etapa: obterEtapaAtual(),
            plano,
            recursos: obterRecursosObjetivo()
        });

        if (
            !mundo ||
            typeof mundo.encontrarBlocos !== "function"
        ) {
            motivo =
                "sistema_mundo_indisponivel";

            return false;
        }

        const encontrados =
            mundo.encontrarBlocos(
                "oak_log",
                CONFIG.raioBuscaMadeira,
                1
            );

        const todos = [];

        const nomesRestantes =
            TIPOS_MADEIRA.filter(
                nome => nome !== "oak_log"
            );

        if (Array.isArray(encontrados)) {
            todos.push(...encontrados);
        }

        for (const nome of nomesRestantes) {
            if (todos.length) {
                break;
            }

            const blocos =
                mundo.encontrarBlocos(
                    nome,
                    CONFIG.raioBuscaMadeira,
                    1
                );

            if (Array.isArray(blocos)) {
                todos.push(...blocos);
            }
        }

        const alvo = todos[0];

        if (!alvo) {
            motivo =
                "nenhuma_madeira_proxima";

            emitir("procurando_recurso", {
                recurso: "madeira",
                raio:
                    CONFIG.raioBuscaMadeira,
                posicao:
                    obterPosicao()
            });

            return false;
        }

        const posicao =
            obterPosicao();

        if (
            posicao &&
            distancia(
                posicao,
                alvo.posicao
            ) <=
                CONFIG.distanciaQuebra
        ) {
            const resultado =
                await executarAcao(
                    "quebrar",
                    {
                        x: alvo.posicao.x,
                        y: alvo.posicao.y,
                        z: alvo.posicao.z
                    }
                );

            if (resultado?.sucesso) {
                motivo =
                    "madeira_coletada";

                return true;
            }

            motivo =
                "falha_quebrar_madeira";

            return false;
        }

        if (
            navegacao &&
            typeof navegacao.irParaBloco ===
                "function"
        ) {
            const iniciou =
                navegacao.irParaBloco(
                    alvo.posicao.x,
                    alvo.posicao.y,
                    alvo.posicao.z,
                    3
                );

            if (iniciou === false) {
                motivo =
                    "falha_navegacao_madeira";

                return false;
            }

            estado =
                "navegando_madeira";

            motivo =
                "indo_ate_madeira";

            emitir("objetivo", {
                objetivo:
                    alvo.posicao,
                motivo,
                etapa:
                    obterEtapaAtual(),
                plano
            });

            return true;
        }

        motivo =
            "navegacao_indisponivel";

        return false;
    }

    async function executarEtapaRecursos() {
        if (
            possuiTabuas(
                CONFIG.tabuasMinimas
            )
        ) {
            avancarEtapa();
            return true;
        }

        const madeira =
            obterTipoMadeira();

        if (!madeira) {
            objetivoAtual.etapa = 0;

            estado =
                "replanejando";

            motivo =
                "madeira_insuficiente";

            return false;
        }

        const tabua =
            MAPA_TABUAS[madeira];

        if (!tabua) {
            estado = "erro";

            motivo =
                "tipo_madeira_sem_tabua";

            return false;
        }

        const quantidadeNecessaria =
            Math.max(
                1,
                Math.ceil(
                    (
                        CONFIG.tabuasMinimas -
                        quantidadeTabuas()
                    ) / 4
                )
            );

        estado =
            "craftando";

        motivo =
            "transformar_madeira_em_tabuas";

        const resultado =
            await executarAcao(
                "craftar",
                {
                    nome: tabua,
                    quantidade:
                        quantidadeNecessaria
                }
            );

        if (resultado?.sucesso) {
            if (
                possuiTabuas(
                    CONFIG.tabuasMinimas
                )
            ) {
                avancarEtapa();
            }

            return true;
        }

        estado =
            "replanejando";

        motivo =
            "falha_craft";

        return false;
    }

    async function executarEtapaLocal() {
        /*
         * Por enquanto usamos a posição atual
         * como local inicial.
         *
         * A etapa será refinada depois com:
         * - terreno
         * - segurança
         * - espaço
         * - água/lava
         * - distância de perigos
         */
        const posicao =
            obterPosicao();

        if (!posicao) {
            estado =
                "aguardando_posicao";

            return false;
        }

        objetivoAtual.local = {
            x: Math.floor(posicao.x),
            y: Math.floor(posicao.y),
            z: Math.floor(posicao.z)
        };

        emitir(
            "local_escolhido",
            {
                local:
                    objetivoAtual.local,
                etapa:
                    obterEtapaAtual(),
                plano:
                    obterPlanoEtapa()
            }
        );

        avancarEtapa();

        return true;
    }

    async function executarEtapaAbrigo() {
        const local =
            objetivoAtual.local ||
            obterPosicao();

        if (!local) {
            estado = "erro";

            motivo =
                "local_indisponivel";

            return false;
        }

        /*
         * O abrigo atual usa:
         * piso 5x5 + 4 paredes 5x3 + teto 5x5.
         * Portanto precisamos de aproximadamente
         * 100 tábuas. Não tenta construir com
         * 1 ou 4 tábuas e depois fica repetindo.
         */
        if (
            !possuiTabuas(
                CONFIG.tabuasMinimas
            )
        ) {
            objetivoAtual.etapa = 1;

            estado =
                "replanejando";

            motivo =
                "tabuas_insuficientes";

            return false;
        }

        const item =
            obterTipoTabua() ||
            "oak_planks";

        estado =
            "construindo";

        motivo =
            "construir_abrigo";

        const resultado =
            await executarAcao(
                "construir",
                {
                    tipo:
                        "abrigo_simples",
                    x:
                        local.x,
                    y:
                        local.y,
                    z:
                        local.z,
                    item
                }
            );

        if (resultado?.sucesso) {
            avancarEtapa();
            return true;
        }

        /*
         * Construção falhou: não tenta novamente
         * a cada 2 segundos. Dá tempo para replanejar.
         */
        estado =
            "replanejando";

        motivo =
            resultado?.erro ||
            "falha_construcao";

        return false;
    }

    async function executarEtapaAtual() {
        const etapa =
            obterEtapaAtual();

        if (!etapa) {
            estado =
                "objetivo_concluido";

            return;
        }

        switch (etapa.id) {
            case "madeira":
                return executarEtapaMadeira();

            case "recursos_basicos":
                return executarEtapaRecursos();

            case "local":
                return executarEtapaLocal();

            case "abrigo":
                return executarEtapaAbrigo();

            default:
                estado = "erro";

                motivo =
                    `etapa_desconhecida:${etapa.id}`;
        }
    }

    function verificarProgresso() {
        const atual =
            obterPosicao();

        if (!atual) {
            return;
        }

        if (!ultimaPosicao) {
            ultimaPosicao =
                atual;

            ultimoMovimento =
                Date.now();

            return;
        }

        const deslocamento =
            distancia(
                atual,
                ultimaPosicao
            );

        if (
            deslocamento >= 0.4
        ) {
            ultimaPosicao =
                atual;

            ultimoMovimento =
                Date.now();

            return;
        }

        if (
            ultimoMovimento &&
            Date.now() -
                ultimoMovimento >=
                CONFIG.tempoParadoMaximo
        ) {
            emitir(
                "travado",
                {
                    objetivo:
                        objetivoAtual,
                    acao:
                        acaoAtual,
                    posicao:
                        atual
                }
            );

            try {
                if (
                    navegacao &&
                    typeof navegacao.parar ===
                        "function"
                ) {
                    navegacao.parar();
                }
            } catch (_) {}

            estado =
                "replanejando";

            motivo =
                "sem_progresso";

            /*
             * Se travou durante busca de madeira,
             * a próxima decisão procura outro tronco.
             */
            if (
                objetivoAtual?.etapa === 0
            ) {
                ultimaAcaoFalha =
                    null;

                bloqueioAte =
                    0;
            }

            ultimoMovimento =
                Date.now();

            ultimaPosicao =
                atual;
        }
    }

    function chegouAoObjetivo() {
        if (
            !objetivoAtual ||
            !objetivoAtual.local
        ) {
            return false;
        }

        const posicao =
            obterPosicao();

        if (!posicao) {
            return false;
        }

        return (
            distancia(
                posicao,
                objetivoAtual.local
            ) <=
            CONFIG.distanciaChegada
        );
    }

    async function decidir() {
        if (!ativa) {
            return;
        }

        if (bloqueandoDecisao) {
            return;
        }

        if (
            !bot ||
            !bot.entity
        ) {
            return;
        }

        if (acaoExecutando) {
            return;
        }

        bloqueandoDecisao =
            true;

        ultimaDecisao =
            Date.now();

        try {
            /*
             * O estado atual sempre carrega o plano da etapa.
             * Isso impede a IA externa de receber apenas
             * "construir abrigo" sem as pré-condições.
             */
            emitir("estado", {
                objetivo:
                    objetivoAtual,
                etapa:
                    obterEtapaAtual(),
                plano:
                    obterPlanoEtapa(),
                recursos:
                    obterRecursosObjetivo()
            });

            /*
             * 1. PERIGO TEM PRIORIDADE.
             */
            if (existePerigo()) {
                estado =
                    "perigo";

                motivo =
                    "perigo_proximo";

                emitir(
                    "perigo",
                    {
                        objetivo:
                            objetivoAtual
                    }
                );

                try {
                    if (
                        navegacao &&
                        typeof navegacao.parar ===
                            "function"
                    ) {
                        navegacao.parar();
                    }
                } catch (_) {}

                /*
                 * Não destrói o objetivo.
                 * Apenas espera o próximo ciclo.
                 */
                return;
            }

            /*
             * 2. Verifica travamento.
             */
            verificarProgresso();

            /*
             * 3. Se terminou tudo,
             * não fica inventando outro objetivo.
             */
            if (
                estado ===
                "objetivo_concluido"
            ) {
                return;
            }

            /*
             * 4. Se está navegando,
             * deixa a navegação trabalhar.
             */
            const navegando =
                navegacao &&
                typeof navegacao.estaNavegando ===
                    "function"
                    ? navegacao.estaNavegando()
                    : false;

            if (navegando) {
                estado =
                    "navegando";

                return;
            }

            /*
             * 5. Executa a etapa atual.
             */
            await executarEtapaAtual();

        } catch (erro) {
            estado =
                "erro";

            motivo =
                erro?.message ||
                String(erro);

            emitir(
                "erro",
                {
                    erro:
                        motivo,
                    objetivo:
                        objetivoAtual,
                    etapa:
                        obterEtapaAtual()
                }
            );

        } finally {
            bloqueandoDecisao =
                false;
        }
    }

    function iniciar() {
        if (ativa) {
            return true;
        }

        ativa = true;

        estado =
            "iniciando";

        motivo =
            "ativada";

        iniciadoEm =
            Date.now();

        ultimoMovimento =
            Date.now();

        ultimaPosicao =
            obterPosicao();

        emitir(
            "iniciada",
            {
                objetivo:
                    objetivoAtual,
                etapa:
                    obterEtapaAtual()
            }
        );

        intervalo =
            setInterval(
                decidir,
                CONFIG.intervaloDecisao
            );

        decidir();

        return true;
    }

    function parar(
        motivoParada = "manual"
    ) {
        if (
            !ativa &&
            !intervalo
        ) {
            return true;
        }

        ativa = false;

        estado =
            "parada";

        motivo =
            motivoParada;

        acaoExecutando =
            false;

        acaoAtual =
            null;

        if (intervalo) {
            clearInterval(
                intervalo
            );

            intervalo =
                null;
        }

        try {
            if (
                navegacao &&
                typeof navegacao.parar ===
                    "function"
            ) {
                navegacao.parar();
            }
        } catch (_) {}

        emitir(
            "parada",
            {
                motivo:
                    motivoParada
            }
        );

        return true;
    }

    function reiniciar() {
        parar("reinicio");

        /*
         * Reinicia o objetivo do começo.
         */
        ultimaAcaoFalha =
            null;

        falhasConsecutivas =
            0;

        bloqueioAte =
            0;

        objetivoAtual = {
            id:
                "primeiro_abrigo",

            nome:
                "Construir um abrigo",

            descricao:
                "Encontrar recursos e construir um abrigo simples.",

            etapa:
                0
        };

        return iniciar();
    }

    function definirObjetivo(objetivo) {
        if (
            !objetivo ||
            typeof objetivo !==
                "object"
        ) {
            return false;
        }

        ultimaAcaoFalha =
            null;

        falhasConsecutivas =
            0;

        bloqueioAte =
            0;

        objetivoAtual = {
            id:
                objetivo.id ||
                "objetivo_customizado",

            nome:
                objetivo.nome ||
                "Objetivo Minecraft",

            descricao:
                objetivo.descricao ||
                "",

            etapa:
                Number(
                    objetivo.etapa ||
                    0
                )
        };

        estado =
            "replanejando";

        motivo =
            "novo_objetivo";

        emitir(
            "novo_objetivo",
            {
                objetivo:
                    objetivoAtual
            }
        );

        return true;
    }

    function estaAtiva() {
        return ativa;
    }

    function obterEstado() {
        return {
            ativa,

            estado,

            motivo,

            objetivoAtual,

            etapaAtual:
                obterEtapaAtual(),

            acaoAtual,

            acaoExecutando,

            iniciadoEm,

            ultimaDecisao,

            planoEtapa:
                obterPlanoEtapa(),

            recursos:
                obterRecursosObjetivo(),

            ultimaAcaoFalha,

            falhasConsecutivas,

            bloqueioAte,

            navegando:
                navegacao &&
                typeof navegacao.estaNavegando ===
                    "function"
                    ? navegacao.estaNavegando()
                    : false
        };
    }

    return {
        iniciar,
        parar,
        reiniciar,
        decidir,
        estaAtiva,
        obterEstado,
        definirObjetivo
    };
}

module.exports = {
    criarAutonomia
};