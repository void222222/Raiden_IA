/**
 * 🧠 AUTONOMIA — RAIDEN MINECRAFT
 *
 * Motor genérico de execução de objetivos.
 *
 * Fluxo:
 *
 * meta (do Python/API)
 *   ↓
 * planejador (expande em tarefas)
 *   ↓
 * executor de tarefas
 *   ↓
 * handlers genéricos (obter_bloco, craftar_item, ...)
 *   ↓
 * acoes.executar()
 *   ↓
 * Mineflayer
 *
 * IMPORTANTE:
 * - Não escolhe coordenadas aleatórias.
 * - Não executa movimento diretamente.
 * - Usa o módulo de ações (via contexto.executarAcaoPublica).
 * - Usa inventário/percepção/navegação para decidir.
 *
 * ARQUITETURA:
 * - A meta é uma árvore de itens necessários + ação final.
 * - O planejador expande a meta em tarefas concretas usando
 *   bot.registry e bot.recipesFor.
 * - O executor roda uma tarefa por ciclo.
 * - Cada tipo de tarefa tem um handler genérico.
 *
 * COMPATIBILIDADE:
 * - Aceita o formato antigo `{ id, nome, descricao, etapas }`.
 * - Converte cada etapa em uma tarefa.
 * - O bot.js e o api_raiden.py não precisam mudar.
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

    const crafting = contexto.crafting;

    // =========================================================
    // ⚙️ CONFIG
    // =========================================================

    const CONFIG = {
        intervaloDecisao: 2000,
        distanciaPerigo: 8,
        tempoParadoMaximo: 6000,
        distanciaChegada: 3,
        distanciaQuebra: 5,
        raioBuscaPadrao: 24,
        cacheBuscaMs: 5000,
        falhasAntesDeReplanejar: 3,
        cooldownFalha: 8000
    };

    // =========================================================
    // 🧠 ESTADO
    // =========================================================

    let ativa = false;
    let intervalo = null;

    let estado = "parada";
    let motivo = null;

    /*
     * Meta atual (declarativa).
     *
     * Estrutura:
     * {
     *   id, nome, descricao,
     *   itens_necessarios: { "item": qtd, ... },
     *   construir: { tipo: "..." } | null,
     *   local: { x, y, z } | null,
     *   localEscolhido: bool
     * }
     */
    let metaAtual = null;

    /*
     * Plano atual (derivado da meta).
     *
     * Lista ordenada de tarefas:
     * [
     *   { tipo: "obter_bloco", bloco: "oak_log", quantidade: 25 },
     *   { tipo: "craftar_item", item: "oak_planks", quantidade: 100 },
     *   { tipo: "escolher_local" },
     *   { tipo: "construir_estrutura", estrutura: "abrigo_simples" }
     * ]
     */
    let planoAtual = [];

    let indiceTarefa = 0;

    /*
     * Estatísticas da meta atual, para debug e replanejamento.
     */
    let falhasNaTarefaAtual = 0;

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

    let cacheBusca = {
        em: 0,
        chave: null,
        blocos: []
    };

    // =========================================================
    // 🎯 META PADRÃO (compatibilidade com "primeiro_abrigo")
    // =========================================================
    //
    // Se a API mandar um objetivo com id "primeiro_abrigo" e
    // sem `itens_necessarios`, geramos a meta padrão.
    //
    // O motor novo sabe interpretar isso como árvore de itens.

    const META_PADRAO_ABRIGO = {
        id: "primeiro_abrigo",
        nome: "Construir um abrigo",
        descricao:
            "Encontrar recursos e construir um abrigo simples.",
        itens_necessarios: {
            oak_planks: 100
        },
        construir: { tipo: "abrigo_simples" }
    };

    // =========================================================
    // 📢 EMISSÃO DE EVENTOS
    // =========================================================

    function emitir(tipo, dados = {}) {
        if (typeof enviarEvento !== "function") {
            return;
        }

        try {
            enviarEvento(
                `minecraft_autonomia_${tipo}`,
                dados
            );
        } catch (_) {}
    }

    // =========================================================
    // 📍 GEOMETRIA
    // =========================================================

    function obterPosicao() {
        if (!bot || !bot.entity || !bot.entity.position) {
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

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // =========================================================
    // ⚠️ PERIGO
    // =========================================================

    function obterPerigos() {
        if (!percepcao) {
            return [];
        }

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
            const pos = perigo?.posicao || perigo?.position;

            if (!pos) {
                return true;
            }

            return (
                distancia(origem, pos) <=
                CONFIG.distanciaPerigo
            );
        });
    }

    // =========================================================
    // 🎒 INVENTÁRIO (HELPERS)
    // =========================================================

    function contarItem(nome) {
        if (
            !inventario ||
            typeof inventario.contarItem !== "function"
        ) {
            return 0;
        }

        try {
            return Number(inventario.contarItem(nome) || 0);
        } catch (_) {
            return 0;
        }
    }

    function possuiItem(nome, quantidade = 1) {
        return contarItem(nome) >= quantidade;
    }

    // =========================================================
    // 📦 REGISTRY HELPERS
    // =========================================================
    //
    // Acesso ao catálogo completo do Minecraft via Mineflayer.

    function obterItemRegistry(nome) {
        if (!nome) return null;
        return bot.registry.itemsByName[nome] || null;
    }

    function obterIdItem(nome) {
        const item = obterItemRegistry(nome);
        return item ? item.id : null;
    }

    function obterNomeItemPorId(id) {
        if (id === null || id === undefined) return null;
        return bot.registry.items[id]?.name || null;
    }

    function obterIdBloco(nome) {
        return bot.registry.blocksByName[nome]?.id ?? null;
    }

    function ehBloco(nome) {
        return obterIdBloco(nome) !== null;
    }

    // =========================================================
    // 🧪 RECEITA HELPERS
    // =========================================================
    //
    // Acessa receitas via crafting.js quando disponível,
    // com fallback direto ao bot.recipesFor.

    function obterReceitas(nomeItem) {
        if (
            crafting &&
            typeof crafting.obterReceitas === "function"
        ) {
            try {
                return crafting.obterReceitas(nomeItem) || [];
            } catch (_) {}
        }

        const id = obterIdItem(nomeItem);
        if (id === null) return [];

        try {
            return bot.recipesFor(id, null, 1, null) || [];
        } catch (_) {
            return [];
        }
    }

    function obterMateriaisDaReceita(receita) {
        if (
            crafting &&
            typeof crafting.obterMateriais === "function"
        ) {
            try {
                return crafting.obterMateriais(receita) || [];
            } catch (_) {}
        }

        // Fallback inline
        const materiais = [];

        if (Array.isArray(receita.delta)) {
            for (const item of receita.delta) {
                if (!item) continue;
                const count = Number(item.count || 0);
                if (count >= 0) continue;
                materiais.push({
                    id: item.id,
                    quantidade: Math.abs(count),
                    nome: obterNomeItemPorId(item.id)
                });
            }
        }

        return materiais;
    }

    // =========================================================
    // 🧠 PLANEJADOR
    // =========================================================
    //
    // Expande uma meta em uma lista ordenada de tarefas.
    //
    // Cada tarefa é atômica e genérica:
    //   - obter_bloco
    //   - obter_drop (drop de mob)
    //   - craftar_item
    //   - escolher_local
    //   - construir_estrutura
    //   - meta_concluida (não-op, marcação)

    function planejar(meta) {
        const tarefas = [];

        // Inventário simulado: começa com o que já temos.
        const estoque = {};

        // 1. Expandir cada item necessário
        const itens = meta.itens_necessarios || {};

        for (const [nomeItem, qtd] of Object.entries(itens)) {
            const subtarefas = expandirItem(
                nomeItem,
                Number(qtd) || 1,
                estoque
            );
            tarefas.push(...subtarefas);
        }

        // 2. Escolher local (se a meta pedir)
        if (meta.construir) {
            tarefas.push({
                tipo: "escolher_local"
            });

            // 3. Construir estrutura
            tarefas.push({
                tipo: "construir_estrutura",
                estrutura: meta.construir.tipo
            });
        }

        return tarefas;
    }

    /*
     * Expande "preciso N de X" em tarefas.
     *
     * Estratégia:
     * - Se já temos no inventário, subtrai.
     * - Se tem receita, expande recursivamente.
     * - Se é bloco, tarefa "obter_bloco".
     * - Se não é bloco, tarefa "obter_item_desconhecido".
     *
     * `estoque` simula o que será produzido, para não
     * pedir a mesma coisa duas vezes.
     */
    function expandirItem(nomeItem, qtdNecessaria, estoque) {
        const jaSimulado = estoque[nomeItem] || 0;
        const jaTemos = contarItem(nomeItem);
        const faltaSimulada = qtdNecessaria - jaSimulado - jaTemos;

        if (faltaSimulada <= 0) {
            return [];
        }

        // Marca como resolvido no estoque simulado
        estoque[nomeItem] = (estoque[nomeItem] || 0) + faltaSimulada;

        // 1. Tem receita? Expande em ingredientes.
        const receitas = obterReceitas(nomeItem);

        if (receitas.length) {
            return expandirReceita(
                nomeItem,
                faltaSimulada,
                receitas[0],
                estoque
            );
        }

        // 2. É bloco? Gera tarefa de obtenção.
        if (ehBloco(nomeItem)) {
            return [{
                tipo: "obter_bloco",
                bloco: nomeItem,
                quantidade: faltaSimulada
            }];
        }

        // 3. Fallback: tarefa genérica (o handler decide o que fazer)
        return [{
            tipo: "obter_item",
            item: nomeItem,
            quantidade: faltaSimulada
        }];
    }

    function expandirReceita(nomeItem, qtdNecessaria, receita, estoque) {
        const tarefas = [];

        const qtdPorCraft = Number(receita.result?.count || 1) || 1;
        const craftsNecessarios = Math.ceil(
            qtdNecessaria / qtdPorCraft
        );

        // Ingredientes
        const materiais = obterMateriaisDaReceita(receita);

        for (const material of materiais) {
            if (!material.nome) continue;

            const qtdIngrediente =
                material.quantidade * craftsNecessarios;

            const subtarefas = expandirItem(
                material.nome,
                qtdIngrediente,
                estoque
            );

            tarefas.push(...subtarefas);
        }

        // Depois de obter ingredientes, craftar
        tarefas.push({
            tipo: "craftar_item",
            item: nomeItem,
            quantidade: qtdNecessaria,
            crafts: craftsNecessarios
        });

        return tarefas;
    }

    // =========================================================
    // 🎯 API — DEFINIR META
    // =========================================================

    /*
     * Aceita tanto a meta declarativa nova quanto o
     * formato antigo com `etapas`.
     *
     * Formato novo:
     * {
     *   id, nome, descricao,
     *   itens_necessarios: { ... },
     *   construir: { tipo: "..." }
     * }
     *
     * Formato antigo:
     * {
     *   id, nome, descricao,
     *   etapas: [ { id, nome, tipo } | "string" ]
     * }
     */
    function definirMeta(entrada) {
        if (!entrada || typeof entrada !== "object") {
            return false;
        }

        // Formato novo?
        let meta;

        if (
            entrada.itens_necessarios &&
            typeof entrada.itens_necessarios === "object"
        ) {
            meta = {
                id: String(entrada.id || "meta_customizada"),
                nome: String(entrada.nome || "Meta Minecraft"),
                descricao: String(entrada.descricao || ""),
                itens_necessarios: entrada.itens_necessarios,
                construir: entrada.construir || null
            };
        } else if (Array.isArray(entrada.etapas)) {
            // Formato antigo: converte etapas em meta declarativa
            meta = converterEtapasEmMeta(entrada);
        } else if (
            String(entrada.id || "").toLowerCase() ===
            "primeiro_abrigo"
        ) {
            // Compatibilidade: abrigo padrão
            meta = {
                ...META_PADRAO_ABRIGO,
                nome: entrada.nome || META_PADRAO_ABRIGO.nome,
                descricao:
                    entrada.descricao ||
                    META_PADRAO_ABRIGO.descricao
            };
        } else {
            emitir("erro", {
                erro: "Meta inválida: sem itens nem etapas.",
                entrada
            });
            return false;
        }

        // Reset geral
        ultimaAcaoFalha = null;
        falhasConsecutivas = 0;
        falhasNaTarefaAtual = 0;
        bloqueioAte = 0;
        cacheBusca = { em: 0, chave: null, blocos: [] };

        metaAtual = meta;
        planoAtual = planejar(meta);
        indiceTarefa = 0;

        estado = "replanejando";
        motivo = "nova_meta";

        emitir("novo_objetivo", {
            objetivo: meta,
            plano: planoAtual
        });

        return true;
    }

    /*
     * Converte o formato antigo (etapas) em meta declarativa.
     *
     * Exemplos:
     *   "Conseguir madeira"      → oak_log: 25
     *   "Construir abrigo"       → construir: abrigo_simples
     *   "Encontrar local"        → nada (vai como escolher_local via construir)
     *   "Conseguir recursos"     → já vem do craftar
     *
     * Estratégia: infere itens a partir do nome da etapa.
     */
    function converterEtapasEmMeta(entrada) {
        const meta = {
            id: String(entrada.id || "meta_antiga"),
            nome: String(entrada.nome || "Meta antiga"),
            descricao: String(entrada.descricao || ""),
            itens_necessarios: {},
            construir: null
        };

        for (const etapa of entrada.etapas || []) {
            const nome = typeof etapa === "string"
                ? etapa
                : String(etapa?.nome || etapa?.id || "");

            const tipo = inferirTipoEtapa(nome);

            switch (tipo) {
                case "coletar_madeira":
                    // 25 troncos são suficientes para 100 tábuas
                    if (!meta.itens_necessarios.oak_log) {
                        meta.itens_necessarios.oak_log = 25;
                    }
                    break;

                case "construir_abrigo":
                    if (!meta.construir) {
                        meta.construir = { tipo: "abrigo_simples" };
                    }
                    if (!meta.itens_necessarios.oak_planks) {
                        meta.itens_necessarios.oak_planks = 100;
                    }
                    break;

                // craftar_tabuas e escolher_local são resolvidos
                // automaticamente pelo planejador via receita +
                // construir.
                default:
                    break;
            }
        }

        // Se nada foi inferido, usa abrigo padrão
        if (
            !Object.keys(meta.itens_necessarios).length &&
            !meta.construir
        ) {
            meta.itens_necessarios = {
                ...META_PADRAO_ABRIGO.itens_necessarios
            };
            meta.construir = {
                ...META_PADRAO_ABRIGO.construir
            };
        }

        return meta;
    }

    function inferirTipoEtapa(nome) {
        const n = String(nome || "").toLowerCase();

        if (
            n.includes("madeira") ||
            n.includes("tronco") ||
            n.includes("log") ||
            n.includes("coletar") ||
            n.includes("minerar")
        ) {
            return "coletar_madeira";
        }

        if (
            n.includes("tabua") ||
            n.includes("tábua") ||
            n.includes("craft") ||
            n.includes("recurso")
        ) {
            return "craftar_tabuas";
        }

        if (
            n.includes("local") ||
            n.includes("lugar") ||
            n.includes("escolher") ||
            n.includes("posicao") ||
            n.includes("posição")
        ) {
            return "escolher_local";
        }

        if (
            n.includes("abrigo") ||
            n.includes("construir") ||
            n.includes("parede") ||
            n.includes("casa") ||
            n.includes("torre")
        ) {
            return "construir_abrigo";
        }

        return "desconhecido";
    }

    // =========================================================
    // 🔨 EXECUTOR DE TAREFAS
    // =========================================================

    /*
     * Mapa: tipo de tarefa → handler.
     */
    const HANDLERS_TAREFA = {
        obter_bloco: tarefaObterBloco,
        obter_item: tarefaObterItem,
        craftar_item: tarefaCraftarItem,
        escolher_local: tarefaEscolherLocal,
        construir_estrutura: tarefaConstruirEstrutura
    };

    async function executarTarefa(tarefa) {
        const handler = HANDLERS_TAREFA[tarefa.tipo];

        if (typeof handler !== "function") {
            estado = "erro";
            motivo = `tipo_tarefa_desconhecido:${tarefa.tipo}`;

            emitir("erro", {
                erro: motivo,
                tarefa
            });

            return false;
        }

        return handler(tarefa);
    }

    // =========================================================
    // 📦 HANDLER — OBTER BLOCO
    // =========================================================

    /*
     * Genérico: procura um bloco no mundo e quebra.
     *
     * Funciona para qualquer bloco registrado no Minecraft:
     *   oak_log, stone, coal_ore, iron_ore, diamond_ore, ...
     *
     * ⚠️ IMPORTANTE:
     *
     * A tarefa NÃO é concluída apenas por:
     *   - navegar até o bloco
     *   - quebrar um bloco
     *
     * A tarefa só é concluída quando o inventário
     * comprova que a quantidade solicitada foi obtida.
     */
    async function tarefaObterBloco(tarefa) {
        const { bloco, quantidade } = tarefa;

        // Já temos o suficiente?
        if (contarItem(bloco) >= quantidade) {
            return true;
        }

        if (
            !mundo ||
            typeof mundo.encontrarBlocos !== "function"
        ) {
            estado = "erro";
            motivo = "mundo_indisponivel";
            return false;
        }

        estado = "procurando";
        motivo = `procurando_${bloco}`;

        const encontrados = buscarComCache(bloco);

        if (!encontrados.length) {
            estado = "replanejando";
            motivo = `nao_encontrado:${bloco}`;

            emitir("procurando_recurso", {
                recurso: bloco,
                raio: CONFIG.raioBuscaPadrao,
                posicao: obterPosicao()
            });

            return false;
        }

        const alvo = encontrados[0];
        const posicao = obterPosicao();

        // Está ao alcance?
        if (
            posicao &&
            distancia(posicao, alvo.posicao) <=
                CONFIG.distanciaQuebra
        ) {
            const resultado = await executarAcao("quebrar", {
                x: alvo.posicao.x,
                y: alvo.posicao.y,
                z: alvo.posicao.z
            });

            if (resultado?.sucesso) {
                invalidarCache();

                // ⚠️ Só conclui se já temos a quantidade pedida.
                // Quebrar UM bloco não conclui uma tarefa de 25.
                if (contarItem(bloco) >= quantidade) {
                    motivo = `${bloco}_coletado`;
                    return true;
                }

                motivo = `coletando_${bloco}`;
                return false;
            }

            motivo = `falha_quebrar_${bloco}`;
            return false;
        }

        // Navega até o alvo
        if (
            navegacao &&
            typeof navegacao.irParaBloco === "function"
        ) {
            registrarAcao("ir_para_bloco", {
                x: alvo.posicao.x,
                y: alvo.posicao.y,
                z: alvo.posicao.z,
                distancia: 3
            });

            const iniciou = navegacao.irParaBloco(
                alvo.posicao.x,
                alvo.posicao.y,
                alvo.posicao.z,
                3
            );

            if (iniciou === false) {
                limparAcao();
                motivo = "falha_navegacao";
                return false;
            }

            // ⚠️ Navegar NÃO conclui a tarefa.
            // Só avança o estado. No próximo ciclo o
            // handler verifica se o bot já chegou.
            estado = "navegando";
            motivo = `indo_para_${bloco}`;
            return false;
        }

        motivo = "navegacao_indisponivel";
        return false;
    }

    // =========================================================
    // 🧩 HANDLER — OBTER ITEM (fallback genérico)
    // =========================================================

    /*
     * Usado quando o item não tem receita nem é bloco.
     * Provavelmente é drop de mob (rotten_flesh, bone, ...).
     */
    async function tarefaObterItem(tarefa) {
        const { item, quantidade } = tarefa;

        if (contarItem(item) >= quantidade) {
            return true;
        }

        estado = "procurando_item";
        motivo = `buscando_${item}`;

        // Tenta inferir o mob de origem
        const mobs = inferirMobsQueDropam(item);

        if (!mobs.length) {
            estado = "replanejando";
            motivo = `sem_origem_conhecida:${item}`;

            emitir("erro", {
                erro: `Não sei como obter ${item}`,
                item
            });

            return false;
        }

        // Procura mob próximo
        if (percepcao && typeof percepcao.obterEntidadesProximas === "function") {
            const entidades = percepcao.obterEntidadesProximas(16) || [];
            const alvo = entidades.find(e =>
                mobs.includes(String(e.nome || "").toLowerCase())
            );

            if (alvo) {
                const resultado = await executarAcao("atacar", {
                    nome: alvo.nome
                });

                return resultado?.sucesso === true;
            }
        }

        estado = "replanejando";
        motivo = `mob_nao_encontrado:${mobs.join("|")}`;
        return false;
    }

    function inferirMobsQueDropam(item) {
        // Pequeno mapa para casos comuns.
        // Poderia vir de minecraft-data no futuro.
        const mapa = {
            rotten_flesh: ["zombie", "husk", "drowned"],
            bone: ["skeleton", "stray", "bogged"],
            string: ["spider", "cave_spider"],
            gunpowder: ["creeper"],
            spider_eye: ["spider", "cave_spider"],
            feather: ["chicken", "parrot"],
            leather: ["cow", "horse", "donkey"],
            beef: ["cow"],
            porkchop: ["pig"],
            chicken: ["chicken"],
            mutton: ["sheep"],
            wool: ["sheep"],
            ender_pearl: ["enderman"],
            blaze_rod: ["blaze"],
            slime_ball: ["slime"],
            magma_cream: ["magma_cube"],
            ink_sac: ["squid"]
        };

        return mapa[item] || [];
    }

    // =========================================================
    // 🔨 HANDLER — CRAFTAR ITEM
    // =========================================================

    async function tarefaCraftarItem(tarefa) {
        const { item, quantidade } = tarefa;

        if (contarItem(item) >= quantidade) {
            return true;
        }

        // Calcula quanto ainda falta
        const falta = quantidade - contarItem(item);

        estado = "craftando";
        motivo = `craftando_${item}`;

        const resultado = await executarAcao("craftar", {
            nome: item,
            quantidade: falta
        });

        return resultado?.sucesso === true;
    }

    // =========================================================
    // 📍 HANDLER — ESCOLHER LOCAL
    // =========================================================

    async function tarefaEscolherLocal(tarefa) {
        const posicao = obterPosicao();

        if (!posicao) {
            estado = "aguardando_posicao";
            return false;
        }

        metaAtual.local = {
            x: Math.floor(posicao.x),
            y: Math.floor(posicao.y),
            z: Math.floor(posicao.z)
        };

        emitir("local_escolhido", {
            local: metaAtual.local,
            meta: metaAtual
        });

        return true;
    }

    // =========================================================
    // 🏠 HANDLER — CONSTRUIR ESTRUTURA
    // =========================================================

    async function tarefaConstruirEstrutura(tarefa) {
        const local = metaAtual.local || obterPosicao();

        if (!local) {
            estado = "erro";
            motivo = "local_indisponivel";
            return false;
        }

        estado = "construindo";
        motivo = `construindo_${tarefa.estrutura}`;

        const resultado = await executarAcao("construir", {
            tipo: tarefa.estrutura,
            x: local.x,
            y: local.y,
            z: local.z
        });

        return resultado?.sucesso === true;
    }

    // =========================================================
    // 🚀 EXECUTOR DE AÇÃO (ponto único)
    // =========================================================

    async function executarAcao(nome, parametros = {}) {
        if (!podeTentarAcao(nome)) {
            return {
                sucesso: false,
                erro:
                    `Ação "${nome}" em cooldown após falha anterior.`
            };
        }

        const executarAcaoPublica =
            contexto.executarAcaoPublica;

        if (typeof executarAcaoPublica !== "function") {
            estado = "erro";
            motivo = "sistema_acoes_indisponivel";

            emitir("erro", {
                erro: "Sistema de ações indisponível."
            });

            return {
                sucesso: false,
                erro: "Sistema de ações indisponível."
            };
        }

        registrarAcao(nome, parametros);

        emitir("acao", {
            acao: nome,
            parametros,
            meta: metaAtual,
            tarefa: planoAtual[indiceTarefa] || null
        });

        try {
            const resultado =
                await executarAcaoPublica(nome, parametros);

            limparAcao();

            const resultadoFinal =
                resultado || {
                    sucesso: false,
                    erro: "Ação não retornou resultado."
                };

            if (resultadoFinal.sucesso) {
                ultimaAcaoFalha = null;
                falhasConsecutivas = 0;
                bloqueioAte = 0;
            } else {
                registrarFalhaAcao(nome, resultadoFinal);
            }

            emitir("acao_resultado", {
                acao: nome,
                parametros,
                resultado: resultadoFinal,
                meta: metaAtual,
                tarefa: planoAtual[indiceTarefa] || null
            });

            return resultadoFinal;

        } catch (erro) {
            limparAcao();

            const resultado = {
                sucesso: false,
                erro: erro?.message || String(erro)
            };

            registrarFalhaAcao(nome, resultado);

            emitir("acao_resultado", {
                acao: nome,
                parametros,
                resultado
            });

            return resultado;
        }
    }

    // =========================================================
    // 🔧 ESTADO DE AÇÃO
    // =========================================================

    function limparAcao() {
        acaoAtual = null;
        acaoExecutando = false;
    }

    function registrarAcao(nome, parametros = {}) {
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

        bloqueioAte = agora + CONFIG.cooldownFalha;

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

    // =========================================================
    // 🗺️ CACHE DE BUSCA DE BLOCO
    // =========================================================

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
            encontrados = mundo.encontrarBlocos(
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

        // Fallback: se não achou este bloco específico,
        // tenta variantes equivalentes
        if (!encontrados.length) {
            const variantes = variantesDeBloco(nomeBloco);

            for (const v of variantes) {
                try {
                    const alt = mundo.encontrarBlocos(
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

        cacheBusca = {
            em: agora,
            chave: nomeBloco,
            blocos: encontrados
        };

        return encontrados;
    }

    function variantesDeBloco(nome) {
        // Mapa simples. Expansível.
        const mapa = {
            oak_log: [
                "birch_log",
                "spruce_log",
                "jungle_log",
                "acacia_log",
                "dark_oak_log"
            ],
            stone: ["cobblestone", "andesite", "diorite", "granite"],
            cobblestone: ["stone"],
            wheat: ["wheat"],
            carrot: ["carrots"],
            potato: ["potatoes"]
        };

        return mapa[nome] || [];
    }

    function invalidarCache() {
        cacheBusca = { em: 0, chave: null, blocos: [] };
    }

    // =========================================================
    // 🎯 LOOP DE DECISÃO
    // =========================================================

    async function decidir() {
        if (!ativa) return;
        if (bloqueandoDecisao) return;
        if (!bot || !bot.entity) return;
        if (acaoExecutando) return;

        bloqueandoDecisao = true;
        ultimaDecisao = Date.now();

        try {
            // Emite estado atual sempre
            emitir("estado", obterEstado());

            if (!metaAtual) {
                estado = "sem_objetivo";
                motivo = "aguardando_api";
                return;
            }

            // Perigo tem prioridade
            if (existePerigo()) {
                estado = "perigo";
                motivo = "perigo_proximo";

                emitir("perigo", {
                    meta: metaAtual,
                    tarefa: planoAtual[indiceTarefa] || null
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

            verificarProgresso();

            // Meta concluída?
            if (indiceTarefa >= planoAtual.length) {
                if (estado !== "objetivo_concluido") {
                    estado = "objetivo_concluido";
                    motivo = "meta_finalizada";

                    emitir("objetivo_concluido", {
                        meta: metaAtual,
                        plano: planoAtual
                    });
                }

                return;
            }

            // Está navegando? Deixa a navegação trabalhar.
            const navegando =
                navegacao &&
                typeof navegacao.estaNavegando === "function"
                    ? navegacao.estaNavegando()
                    : false;

            if (navegando) {
                estado = "navegando";
                return;
            }

            // Executa tarefa atual
            const tarefa = planoAtual[indiceTarefa];
            const sucesso = await executarTarefa(tarefa);

            if (sucesso) {
                falhasNaTarefaAtual = 0;
                indiceTarefa++;

                emitir("tarefa_concluida", {
                    tarefa,
                    proxima: planoAtual[indiceTarefa] || null,
                    indice: indiceTarefa,
                    total: planoAtual.length
                });
            } else {
                falhasNaTarefaAtual++;

                if (
                    falhasNaTarefaAtual >=
                    CONFIG.falhasAntesDeReplanejar
                ) {
                    estado = "replanejando";
                    motivo = "muitas_falhas_na_tarefa";

                    emitir("replanejando", {
                        tarefa,
                        falhas: falhasNaTarefaAtual
                    });

                    // Replaneja a meta do zero
                    planoAtual = planejar(metaAtual);
                    indiceTarefa = 0;
                    falhasNaTarefaAtual = 0;
                }
            }

        } catch (erro) {
            estado = "erro";
            motivo = erro?.message || String(erro);

            emitir("erro", {
                erro: motivo,
                meta: metaAtual,
                tarefa: planoAtual[indiceTarefa] || null
            });

        } finally {
            bloqueandoDecisao = false;
        }
    }

    // =========================================================
    // 📊 VERIFICAÇÃO DE PROGRESSO
    // =========================================================

    function verificarProgresso() {
        const atual = obterPosicao();
        if (!atual) return;

        if (!ultimaPosicao) {
            ultimaPosicao = atual;
            ultimoMovimento = Date.now();
            return;
        }

        const deslocamento = distancia(atual, ultimaPosicao);

        if (deslocamento >= 0.4) {
            ultimaPosicao = atual;
            ultimoMovimento = Date.now();
            return;
        }

        if (
            ultimoMovimento &&
            Date.now() - ultimoMovimento >=
                CONFIG.tempoParadoMaximo
        ) {
            emitir("travado", {
                meta: metaAtual,
                tarefa: planoAtual[indiceTarefa] || null,
                acao: acaoAtual,
                posicao: atual
            });

            try {
                if (
                    navegacao &&
                    typeof navegacao.parar === "function"
                ) {
                    navegacao.parar();
                }
            } catch (_) {}

            estado = "replanejando";
            motivo = "sem_progresso";

            // Se travou, reseta falhas e cache
            ultimaAcaoFalha = null;
            bloqueioAte = 0;
            invalidarCache();

            ultimoMovimento = Date.now();
            ultimaPosicao = atual;
        }
    }

    // =========================================================
    // 🎮 CONTROLE — INICIAR / PARAR / REINICIAR
    // =========================================================

    function iniciar() {
        if (ativa) return true;

        ativa = true;
        estado = "iniciando";
        motivo = "ativada";

        iniciadoEm = Date.now();
        ultimoMovimento = Date.now();
        ultimaPosicao = obterPosicao();

        emitir("iniciada", {
            meta: metaAtual,
            plano: planoAtual
        });

        intervalo = setInterval(
            decidir,
            CONFIG.intervaloDecisao
        );

        decidir();

        return true;
    }

    function parar(motivoParada = "manual") {
        if (!ativa && !intervalo) return true;

        ativa = false;
        estado = "parada";
        motivo = motivoParada;

        acaoExecutando = false;
        acaoAtual = null;

        if (intervalo) {
            clearInterval(intervalo);
            intervalo = null;
        }

        try {
            if (
                navegacao &&
                typeof navegacao.parar === "function"
            ) {
                navegacao.parar();
            }
        } catch (_) {}

        emitir("parada", {
            motivo: motivoParada
        });

        return true;
    }

    function reiniciar() {
        parar("reinicio");

        ultimaAcaoFalha = null;
        falhasConsecutivas = 0;
        falhasNaTarefaAtual = 0;
        bloqueioAte = 0;

        invalidarCache();

        if (metaAtual) {
            // Replaneja do zero
            planoAtual = planejar(metaAtual);
            indiceTarefa = 0;

            if (metaAtual.local) {
                delete metaAtual.local;
            }
        }

        return iniciar();
    }

    // =========================================================
    // 🔍 ESTADO PÚBLICO
    // =========================================================

    function estaAtiva() {
        return ativa;
    }

    function obterEstado() {
        return {
            ativa,
            estado,
            motivo,
            metaAtual,
            planoAtual,
            indiceTarefa,
            tarefaAtual: planoAtual[indiceTarefa] || null,
            totalTarefas: planoAtual.length,
            acaoAtual,
            acaoExecutando,
            iniciadoEm,
            ultimaDecisao,
            ultimaAcaoFalha,
            falhasConsecutivas,
            falhasNaTarefaAtual,
            bloqueioAte,
            navegando:
                navegacao &&
                typeof navegacao.estaNavegando === "function"
                    ? navegacao.estaNavegando()
                    : false,

            // Compatibilidade com o painel antigo
            objetivoAtual: metaAtual,
            etapaAtual: planoAtual[indiceTarefa] || null,
            recursos: {
                madeira: contarItem("oak_log")
                    + contarItem("birch_log")
                    + contarItem("spruce_log")
                    + contarItem("jungle_log"),
                tabuas: contarItem("oak_planks")
                    + contarItem("birch_planks")
                    + contarItem("spruce_planks")
                    + contarItem("jungle_planks")
            }
        };
    }

    // =========================================================
    // 🔌 API PÚBLICA
    // =========================================================
    //
    // `definirObjetivo` mantém o nome antigo para
    // compatibilidade com bot.js.

    return {
        iniciar,
        parar,
        reiniciar,
        decidir,
        estaAtiva,
        obterEstado,
        definirObjetivo: definirMeta,
        definirMeta
    };
}

module.exports = {
    criarAutonomia
};