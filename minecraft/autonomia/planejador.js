/**
 * 🧠 PLANEJADOR — AUTONOMIA
 *
 * ⚠️ CORREÇÃO CRÍTICA DESTA VERSÃO (v2 — FIX DO LOOP):
 *
 * 1. ESTOQUES SEPARADOS POR SEÇÃO
 *    Cada seção (kit mínimo, bioma, meta) tem seu
 *    PRÓPRIO estoque simulado. Evita que o kit
 *    "vaze" pra meta.
 *
 * 2. MARGEM DE SEGURANÇA NO `expandirItem`
 *    O inventário do Mineflayer tem delay de sync
 *    (100-500ms). Quando o planejador calcula
 *    "falta = 17 - 15 = 2", pode ser que o bot
 *    já tenha gasto parte desses 15 antes do
 *    craft acontecer. Resultado: craft falha,
 *    replaneja, loop.
 *
 *    Agora o `falta` tem margem de +2.
 *
 * 3. ⚠️ FIX CRÍTICO — SEMÂNTICA DE `obter_bloco`
 *
 *    ANTES (v1):
 *      `obter_bloco` recebia `quantidade = falta`
 *      (ex: "obtenha 10").
 *
 *      O handler de `obter_bloco` fazia:
 *        if (contarItem(bloco) >= quantidade) concluida
 *
 *      Se o bot tem 15 e a tarefa pede 10, ele
 *      concluía → pulava a tarefa → craft seguinte
 *      falhava por falta de material → replanejava →
 *      loop infinito.
 *
 *    AGORA (v2):
 *      `obter_bloco` recebe `quantidade = jaTemos + falta`
 *      (ex: "tenha 25 no total").
 *
 *      O handler faz:
 *        if (contarItem(bloco) >= 25) concluida
 *
 *      Bot tem 15 → 15 >= 25 é FALSO → minera até 25.
 *      Aí sim conclui. O craft seguinte encontra 25
 *      oak_log disponíveis. ✅
 *
 * 4. LOG COMPLETO DO PLANO
 *    O `planejar()` agora loga TODAS as tarefas
 *    geradas (não só o bioma). Facilita debug.
 *
 * 5. `resolverNomeReal` NÃO é mais chamado quando
 *    o item não existe — devolve o nome canônico.
 */

const {
    META_PADRAO_ABRIGO,
    REGRAS_INFERENCIA_ETAPA,
    FERRAMENTA_PARA_BLOCO,
    NIVEL_FERRAMENTA,
    KIT_MINIMO,
    RECEITAS_FERRAMENTA,
    BIOMAS,
    VARIANTES_BLOCO
} = require("./constantes");

const DEBUG = process.env.PLANEJADOR_DEBUG === "1";

// ⚠️ Margem de segurança pra compensar delay de
// sync do inventário.
const MARGEM_SEGURANCA = 2;

function log(...args) {
    if (DEBUG) console.log("🧠 [PLANEJADOR]", ...args);
}

function criarPlanejador(contexto) {
    const {
        bot,
        inventario,
        crafting,
        percepcao
    } = contexto;

    // =========================================================
    // 📦 REGISTRY
    // =========================================================

    function temRegistry() {
        return !!(bot && bot.registry);
    }

    function obterIdItem(nome) {
        if (!temRegistry() || !nome) return null;
        const item = bot.registry.itemsByName[nome];
        return item ? item.id : null;
    }

    function obterNomeItemPorId(id) {
        if (!temRegistry() || id === null || id === undefined) {
            return null;
        }
        return bot.registry.items[id]?.name || null;
    }

    function obterIdBloco(nome) {
        if (!temRegistry() || !nome) return null;
        return bot.registry.blocksByName[nome]?.id ?? null;
    }

    function ehBloco(nome) {
        return obterIdBloco(nome) !== null;
    }

    // =========================================================
    // 🎒 INVENTÁRIO
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

    // =========================================================
    // 🧪 DELEGAÇÃO PRO CRAFTING
    // =========================================================

    function contarItemOuVariante(nome, quantidade = 1) {
        if (
            crafting &&
            typeof crafting.contarItemOuVariante === "function"
        ) {
            try {
                return crafting.contarItemOuVariante(
                    nome,
                    quantidade
                );
            } catch (_) {}
        }

        const direto = contarItem(nome);
        if (direto >= quantidade) return direto;

        const variantes = VARIANTES_BLOCO[nome] || [];
        for (const v of variantes) {
            const qtd = contarItem(v);
            if (qtd >= quantidade) return qtd;
        }

        return direto;
    }

    function resolverNomeReal(nome, quantidade = 1) {
        if (
            crafting &&
            typeof crafting.resolverNomeReal === "function"
        ) {
            try {
                return crafting.resolverNomeReal(
                    nome,
                    quantidade
                );
            } catch (_) {}
        }

        if (contarItem(nome) >= quantidade) return nome;

        const variantes = VARIANTES_BLOCO[nome] || [];
        for (const v of variantes) {
            if (contarItem(v) >= quantidade) return v;
        }

        return nome;
    }

    function escolherReceitaViavel(receitas) {
        if (
            crafting &&
            typeof crafting.escolherReceitaViavel === "function"
        ) {
            try {
                return crafting.escolherReceitaViavel(receitas);
            } catch (_) {}
        }

        return receitas?.[0] || null;
    }

    // =========================================================
    // 🧪 RECEITAS
    // =========================================================

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
            return bot.recipesAll(id, null, 1, null) || [];
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
    // 🪑 MESA DE CRAFTING
    // =========================================================

    function temMesaDisponivel() {
        if (contarItem("crafting_table") > 0) {
            return true;
        }

        if (
            crafting &&
            typeof crafting.encontrarMesaNoMundo === "function"
        ) {
            try {
                const mesa = crafting.encontrarMesaNoMundo(6);
                if (mesa) return true;
            } catch (_) {}
        }

        return false;
    }

    function expandirMesaCrafting(estoque) {
        if (temMesaDisponivel()) {
            return [];
        }

        if ((estoque["crafting_table"] || 0) > 0) {
            return [];
        }

        estoque["crafting_table"] =
            (estoque["crafting_table"] || 0) + 1;

        const tarefas = [];

        const material = resolverNomeReal("oak_planks", 4);

        const subtarefas = expandirItem(
            material,
            4,
            estoque
        );
        tarefas.push(...subtarefas);

        tarefas.push({
            tipo: "craftar_item",
            item: "crafting_table",
            quantidade: 1
        });

        return tarefas;
    }

    // =========================================================
    // 🛠️ FERRAMENTAS
    // =========================================================

    function ferramentaNecessaria(nomeBloco) {
        if (!nomeBloco) return null;
        return FERRAMENTA_PARA_BLOCO[nomeBloco] || null;
    }

    function nivelDaFerramenta(nomeFerramenta) {
        if (!nomeFerramenta) return 0;

        for (const [tipo, nivel] of Object.entries(NIVEL_FERRAMENTA)) {
            if (nomeFerramenta.includes(tipo)) {
                return nivel;
            }
        }

        return 0;
    }

    function temFerramentaDeNivel(nomeFerramenta) {
        if (!nomeFerramenta) return true;

        const nivelNecessario = nivelDaFerramenta(nomeFerramenta);
        if (nivelNecessario === 0) return true;

        for (const tipo of Object.keys(NIVEL_FERRAMENTA)) {
            const nivelAtual = NIVEL_FERRAMENTA[tipo];
            if (nivelAtual < nivelNecessario) continue;

            const sufixo = nomeFerramenta.replace(
                /^(wooden|stone|iron|diamond|netherite)_/,
                ""
            );

            const candidato = `${tipo}_${sufixo}`;

            if (contarItem(candidato) > 0) {
                return true;
            }
        }

        return false;
    }

    function expandirFerramenta(nomeFerramenta, estoque) {
        if (temFerramentaDeNivel(nomeFerramenta)) {
            return [];
        }

        const def = RECEITAS_FERRAMENTA[nomeFerramenta];
        if (!def) {
            return expandirItem(nomeFerramenta, 1, estoque);
        }

        const tarefas = [];

        if (def.precisaMesa) {
            const tarefasMesa = expandirMesaCrafting(estoque);
            tarefas.push(...tarefasMesa);
        }

        const materiais = def.materiais || [];

        for (const mat of materiais) {
            const nomeReal = resolverNomeReal(
                mat.nome,
                mat.quantidade
            );

            const subtarefas = expandirItem(
                nomeReal,
                mat.quantidade,
                estoque
            );
            tarefas.push(...subtarefas);
        }

        tarefas.push({
            tipo: "craftar_item",
            item: nomeFerramenta,
            quantidade: 1
        });

        return tarefas;
    }

    function ferramentaParaCraftar(nomeBloco) {
        const necessaria = ferramentaNecessaria(nomeBloco);
        if (!necessaria) return null;

        if (temFerramentaDeNivel(necessaria)) {
            return null;
        }

        return necessaria;
    }

    // =========================================================
    // 🧠 EXPANSÃO
    // =========================================================

    /**
     * ⚠️ FIX CRÍTICO — SEMÂNTICA DE `obter_bloco` / `obter_item`:
     *
     * O `quantidade` que mandamos pro handler precisa ser
     * o TOTAL que o bot deve TER depois da tarefa, não o
     * quanto falta obter.
     *
     * POR QUÊ:
     *   O handler de `obter_bloco` faz:
     *     if (contarItem(bloco) >= quantidade) concluida
     *
     *   Se mandarmos `falta` (ex: 10) e o bot tem 15,
     *   ele conclui imediatamente e PULA a tarefa.
     *
     *   Se mandarmos `jaTemos + falta` (ex: 25),
     *   ele só conclui quando tiver 25 no inventário.
     *
     *   O mesmo vale pra `obter_item`.
     */
    function expandirItem(nomeItem, qtdNecessaria, estoque) {
        const jaSimulado = estoque[nomeItem] || 0;
        const jaTemos = contarItem(nomeItem);

        // ⚠️ Margem: soma 2 na necessidade.
        const alvo = qtdNecessaria + MARGEM_SEGURANCA;
        const falta = alvo - jaSimulado - jaTemos;

        if (falta <= 0) {
            return [];
        }

        estoque[nomeItem] = jaSimulado + falta;

        // ⚠️ FIX: `quantidade` a ser mandada pro handler
        // é o TOTAL que o bot deve ter depois da tarefa.
        // Se o bot já tem 15 e a falta é 10, o handler
        // deve mirar 25.
        const quantidadeTotal = jaTemos + falta;

        log(
            `expandirItem(${nomeItem}, ${qtdNecessaria}) ` +
            `| simulado=${jaSimulado} real=${jaTemos} ` +
            `falta=${falta} (alvo=${alvo}) ` +
            `→ handler vai mirar TOTAL=${quantidadeTotal}`
        );

        if (ehBloco(nomeItem)) {
            const ferramenta = ferramentaParaCraftar(nomeItem);

            if (ferramenta) {
                const tarefasFerramenta =
                    expandirFerramenta(ferramenta, estoque);

                tarefasFerramenta.push({
                    tipo: "obter_bloco",
                    bloco: nomeItem,
                    quantidade: quantidadeTotal
                });

                return tarefasFerramenta;
            }
        }

        const receitas = obterReceitas(nomeItem);

        if (receitas.length) {
            const receitaEscolhida = escolherReceitaViavel(receitas);

            return expandirReceita(
                nomeItem,
                falta,
                receitaEscolhida,
                estoque
            );
        }

        if (ehBloco(nomeItem)) {
            return [{
                tipo: "obter_bloco",
                bloco: nomeItem,
                quantidade: quantidadeTotal
            }];
        }

        return [{
            tipo: "obter_item",
            item: nomeItem,
            quantidade: quantidadeTotal
        }];
    }

    function expandirReceita(nomeItem, qtdNecessaria, receita, estoque) {
        const tarefas = [];

        if (receita.requiresTable) {
            const tarefasMesa = expandirMesaCrafting(estoque);
            tarefas.push(...tarefasMesa);
        }

        const qtdPorCraft =
            Number(receita.result?.count || 1) || 1;

        const craftsNecessarios = Math.ceil(
            qtdNecessaria / qtdPorCraft
        );

        const materiais = obterMateriaisDaReceita(receita);

        for (const material of materiais) {
            if (!material.nome) continue;

            const qtdIngrediente =
                material.quantidade * craftsNecessarios;

            const nomeReal = resolverNomeReal(
                material.nome,
                qtdIngrediente
            );

            const subtarefas = expandirItem(
                nomeReal,
                qtdIngrediente,
                estoque
            );

            tarefas.push(...subtarefas);
        }

        tarefas.push({
            tipo: "craftar_item",
            item: nomeItem,
            quantidade: qtdNecessaria,
            crafts: craftsNecessarios
        });

        return tarefas;
    }

    // =========================================================
    // 🛠️ KIT MÍNIMO
    // =========================================================

    function gerarKitMinimo(estoque) {
        const tarefas = [];

        for (const item of KIT_MINIMO) {
            const tem = contarItem(item.item);
            const simulado = estoque[item.item] || 0;

            if (tem + simulado >= item.quantidade) {
                continue;
            }

            const falta = item.quantidade - tem - simulado;

            if (RECEITAS_FERRAMENTA[item.item]) {
                const subtarefas = expandirFerramenta(
                    item.item,
                    estoque
                );
                tarefas.push(...subtarefas);
            } else {
                const subtarefas = expandirItem(
                    item.item,
                    falta,
                    estoque
                );
                tarefas.push(...subtarefas);
            }
        }

        return tarefas;
    }

    // =========================================================
    // 🛠️ PROGRESSÃO DE TIER
    // =========================================================

    function proximoTier() {
        const tiers = ["wooden", "stone", "iron", "diamond"];

        for (const tipo of tiers) {
            const picareta = `${tipo}_pickaxe`;

            if (contarItem(picareta) === 0) {
                const def = RECEITAS_FERRAMENTA[picareta];
                if (!def) return null;

                const matPrincipal = def.materiais?.[0];
                if (!matPrincipal) return picareta;

                if (contarItem(matPrincipal.nome) > 0) {
                    return picareta;
                }

                return picareta;
            }
        }

        return null;
    }

    // =========================================================
    // 🌳 BIOMAS
    // =========================================================

    function obterBiomaAtual() {
        if (
            !percepcao ||
            typeof percepcao.obterBioma !== "function"
        ) {
            return {
                nome: "desconhecido",
                displayName: "Desconhecido",
                id: null
            };
        }

        try {
            return percepcao.obterBioma() || {
                nome: "desconhecido",
                displayName: "Desconhecido",
                id: null
            };
        } catch (_) {
            return {
                nome: "desconhecido",
                displayName: "Desconhecido",
                id: null
            };
        }
    }

    function obterDefinicaoBioma(nomeBioma) {
        if (!nomeBioma) return BIOMAS.desconhecido;

        const chave = String(nomeBioma).toLowerCase();

        if (BIOMAS[chave]) return BIOMAS[chave];

        for (const [nome, def] of Object.entries(BIOMAS)) {
            if (chave.includes(nome)) {
                return def;
            }
        }

        return BIOMAS.desconhecido;
    }

    function gerarTarefasDoBioma(estoque) {
        const tarefas = [];

        const bioma = obterBiomaAtual();
        const def = obterDefinicaoBioma(bioma.nome);

        const inventarioVazio =
            !inventario ||
            typeof inventario.obterItens !== "function" ||
            (inventario.obterItens() || []).length === 0;

        if (inventarioVazio && def.recursos.length > 0) {
            for (const recurso of def.recursos) {
                if (!ehBloco(recurso)) continue;

                // ⚠️ FIX: `quantidade` aqui também é TOTAL.
                // Como o inventário está vazio, é o mesmo
                // que "obtenha 8". Mas mantemos a semântica
                // consistente.
                const jaTemos = contarItem(recurso);

                tarefas.push({
                    tipo: "obter_bloco",
                    bloco: recurso,
                    quantidade: jaTemos + 8,
                    origem: "bioma",
                    bioma: bioma.nome
                });

                break;
            }
        }

        return tarefas;
    }

    // =========================================================
    // 🎯 PLANEJAR
    // =========================================================

    function planejar(meta) {
        const tarefas = [];

        // ── Kit mínimo: estoque próprio ──
        const estoqueKit = {};
        const tarefasKit = gerarKitMinimo(estoqueKit);
        tarefas.push(...tarefasKit);

        // ── Bioma: estoque próprio ──
        const estoqueBioma = {};
        const tarefasBioma = gerarTarefasDoBioma(estoqueBioma);
        tarefas.push(...tarefasBioma);

        // ── Meta: estoque próprio ──
        const estoqueMeta = {};
        const itens = meta.itens_necessarios || {};

        for (const [nomeItem, qtd] of Object.entries(itens)) {
            const subtarefas = expandirItem(
                nomeItem,
                Number(qtd) || 1,
                estoqueMeta
            );

            tarefas.push(...subtarefas);
        }

        // ── Construção ──
        if (meta.construir) {
            tarefas.push({ tipo: "escolher_local" });

            tarefas.push({
                tipo: "construir_estrutura",
                estrutura: meta.construir.tipo
            });
        }

        const bioma = obterBiomaAtual();
        const def = obterDefinicaoBioma(bioma.nome);

        console.log(
            `🌳 [PLANEJADOR] Bioma: ${bioma.nome} | ` +
            `recursos: ${def.recursos.slice(0, 3).join(", ")} | ` +
            `perigos: ${def.perigos.slice(0, 3).join(", ")}`
        );

        console.log(
            `🌳 [PLANEJADOR] Plano (${tarefas.length} tarefas):`
        );

        for (let i = 0; i < tarefas.length; i++) {
            console.log(
                `   [${i}] ${JSON.stringify(tarefas[i])}`
            );
        }

        log(
            `Plano gerado (${tarefas.length} tarefas)`
        );

        return tarefas;
    }

    // =========================================================
    // 🔄 CONVERSOR
    // =========================================================

    function inferirTipoEtapa(nome) {
        const n = String(nome || "").toLowerCase();

        for (const regra of REGRAS_INFERENCIA_ETAPA) {
            if (regra.termos.some(t => n.includes(t))) {
                return regra.tipo;
            }
        }

        return "desconhecido";
    }

    function converterEtapasEmMeta(entrada) {
        const meta = {
            id: String(entrada.id || "meta_antiga"),
            nome: String(entrada.nome || "Meta antiga"),
            descricao: String(entrada.descricao || ""),
            itens_necessarios: {},
            construir: entrada.construir || null
        };

        for (const etapa of entrada.etapas || []) {
            const tipoExplicito = etapa?.tipo;
            const nome = typeof etapa === "string"
                ? etapa
                : String(etapa?.nome || etapa?.id || "");

            const tipo = tipoExplicito || inferirTipoEtapa(nome);

            switch (tipo) {
                case "coletar_madeira":
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

                default:
                    break;
            }
        }

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

    function normalizarMeta(entrada) {
        if (!entrada || typeof entrada !== "object") {
            return null;
        }

        if (
            entrada.itens_necessarios &&
            typeof entrada.itens_necessarios === "object"
        ) {
            return {
                id: String(entrada.id || "meta_customizada"),
                nome: String(entrada.nome || "Meta Minecraft"),
                descricao: String(entrada.descricao || ""),
                itens_necessarios: entrada.itens_necessarios,
                construir: entrada.construir || null
            };
        }

        if (Array.isArray(entrada.etapas)) {
            return converterEtapasEmMeta(entrada);
        }

        if (
            String(entrada.id || "").toLowerCase() ===
            "primeiro_abrigo"
        ) {
            return {
                ...META_PADRAO_ABRIGO,
                nome: entrada.nome || META_PADRAO_ABRIGO.nome,
                descricao:
                    entrada.descricao ||
                    META_PADRAO_ABRIGO.descricao
            };
        }

        return null;
    }

    return {
        planejar,
        normalizarMeta,
        ehBloco,
        obterReceitas,
        obterMateriaisDaReceita,
        contarItem,

        ferramentaNecessaria,
        temFerramentaDeNivel,
        ferramentaParaCraftar,
        proximoTier,

        obterBiomaAtual,
        obterDefinicaoBioma,
        gerarTarefasDoBioma,

        escolherReceitaViavel,
        contarItemOuVariante,
        resolverNomeReal,

        temMesaDisponivel,
        expandirMesaCrafting
    };
}

module.exports = { criarPlanejador };