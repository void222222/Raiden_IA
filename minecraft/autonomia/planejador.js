/**
 * 🧠 PLANEJADOR — AUTONOMIA
 *
 * ⚠️ CORREÇÃO DESTA VERSÃO:
 *
 * 1. ÚNICA FONTE DE VERDADE
 *    escolherReceitaViavel, contarItemOuVariante e
 *    resolverNomeReal agora MORAM NO crafting.js.
 *
 * 2. Fallback local MÍNIMO (só se crafting não tiver).
 *
 * 3. expandirFerramenta usa RECEITAS_FERRAMENTA com
 *    estrutura `materiais: [...]` e variantes.
 *
 * 4. ⚠️ NOVO — GARANTIR MESA NO PLANO:
 *    Se a receita exige mesa e o bot não tem
 *    crafting_table nem no inventário nem no mundo,
 *    injeta `craftar_item crafting_table` antes.
 *
 *    Antes, o plano mandava craftar wooden_pickaxe
 *    mas não mandava craftar a mesa. O handler
 *    falhava com "receita exige mesa".
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
    // 🪑 MESA — NOVO
    // =========================================================

    /*
     * ⚠️ NOVO: verifica se o bot tem crafting_table
     * disponível (inventário OU mundo).
     *
     * Usado pra decidir se precisa injetar
     * `craftar_item crafting_table` no plano.
     */
    function temMesaDisponivel() {
        // No inventário?
        if (contarItem("crafting_table") > 0) {
            return true;
        }

        // No mundo (perto do bot)?
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

    /*
     * ⚠️ NOVO: gera as tarefas necessárias pra ter
     * uma crafting_table craftada (se o bot não tiver).
     *
     * Crafting_table = 4 planks (qualquer madeira).
     * Isso NÃO exige mesa (é 2x2).
     */
    function expandirMesaCrafting(estoque) {
        // Já tem?
        if (temMesaDisponivel()) {
            return [];
        }

        // Já foi simulado no estoque?
        if ((estoque["crafting_table"] || 0) > 0) {
            return [];
        }

        // Marca no estoque
        estoque["crafting_table"] =
            (estoque["crafting_table"] || 0) + 1;

        const tarefas = [];

        // 4 planks (qualquer variante)
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
    // 🛠️ FERRAMENTAS (FASE 1)
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

        // ⚠️ NOVO: se a ferramenta exige mesa, garante a mesa
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

    function expandirItem(nomeItem, qtdNecessaria, estoque) {
        const jaSimulado = estoque[nomeItem] || 0;
        const jaTemos = contarItem(nomeItem);
        const falta = qtdNecessaria - jaSimulado - jaTemos;

        if (falta <= 0) {
            return [];
        }

        estoque[nomeItem] = jaSimulado + falta;

        if (ehBloco(nomeItem)) {
            const ferramenta = ferramentaParaCraftar(nomeItem);

            if (ferramenta) {
                const tarefasFerramenta =
                    expandirFerramenta(ferramenta, estoque);

                tarefasFerramenta.push({
                    tipo: "obter_bloco",
                    bloco: nomeItem,
                    quantidade: falta
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
                quantidade: falta
            }];
        }

        return [{
            tipo: "obter_item",
            item: nomeItem,
            quantidade: falta
        }];
    }

    function expandirReceita(nomeItem, qtdNecessaria, receita, estoque) {
        const tarefas = [];

        // ⚠️ NOVO: se a receita exige mesa, garante a mesa
        // ANTES de tentar craftar o item.
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
    // 🛠️ FASE 1 — KIT MÍNIMO
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
    // 🛠️ FASE 1 — PROGRESSÃO DE TIER
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
    // 🌳 FASE 3 — BIOMAS
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

                tarefas.push({
                    tipo: "obter_bloco",
                    bloco: recurso,
                    quantidade: 8,
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
        const estoque = {};

        const tarefasKit = gerarKitMinimo(estoque);
        tarefas.push(...tarefasKit);

        const tarefasBioma = gerarTarefasDoBioma(estoque);
        tarefas.push(...tarefasBioma);

        const itens = meta.itens_necessarios || {};

        for (const [nomeItem, qtd] of Object.entries(itens)) {
            const subtarefas = expandirItem(
                nomeItem,
                Number(qtd) || 1,
                estoque
            );

            tarefas.push(...subtarefas);
        }

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

        return tarefas;
    }

    // =========================================================
    // 🔄 CONVERSOR (formato antigo)
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

    // =========================================================
    // 🎯 NORMALIZAR META
    // =========================================================

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

        // ⚠️ NOVO
        temMesaDisponivel,
        expandirMesaCrafting
    };
}

module.exports = { criarPlanejador };