/**
 * 🛠️ EQUIPAMENTO — RAIDEN MINECRAFT
 *
 * Escolhe a ferramenta correta pra cada ação.
 *
 * ⚠️ NOVO v1:
 *   - Antes de `mundo.quebrar`, equipa a ferramenta certa.
 *   - Antes de `combate.atacar`, equipa a arma.
 *
 * Sem isso, o bot quebra madeira com espada,
 * pedra com machado, etc.
 *
 * Mapeamento:
 *   - Blocos de madeira (log) → machado
 *   - Blocos de pedra/minério → picareta
 *   - Blocos de terra/areia → pá
 *   - Combate → espada
 *   - Comida → qualquer coisa (não equipa)
 *
 * ⚠️ FIX v2 (CRÍTICO):
 *   `equiparParaBloco` agora LOGA quando o bot
 *   NÃO TEM a ferramenta do tipo necessário.
 *
 *   ANTES:
 *     Se não tinha machado, retornava `true` em
 *     silêncio. O bot tentava quebrar na mão.
 *     Alguns blocos (jungle_log, etc) demoram
 *     >5s na mão → `bot.dig excedeu timeout` →
 *     handler retornava falha → loop de 280
 *     travamentos.
 *
 *   AGORA:
 *     Loga "⚠️ [equipamento] Sem machado pra quebrar
 *     oak_log. Tentando com a mão." E avisa o
 *     operador que o bot está despreparado.
 *
 *   Também loga quando NÃO TEM ESPADA em combate,
 *   pelo mesmo motivo.
 */

const FERRAMENTAS = {
    // ⚔️ Armas
    espada: [
        "netherite_sword",
        "diamond_sword",
        "iron_sword",
        "stone_sword",
        "wooden_sword"
    ],

    // ⛏ Picaretas
    picareta: [
        "netherite_pickaxe",
        "diamond_pickaxe",
        "iron_pickaxe",
        "stone_pickaxe",
        "wooden_pickaxe"
    ],

    // 🪓 Machados
    machado: [
        "netherite_axe",
        "diamond_axe",
        "iron_axe",
        "stone_axe",
        "wooden_axe"
    ],

    // 🧹 Pás
    pa: [
        "netherite_shovel",
        "diamond_shovel",
        "iron_shovel",
        "stone_shovel",
        "wooden_shovel"
    ],

    // 🪓 Enxadas
    enxada: [
        "netherite_hoe",
        "diamond_hoe",
        "iron_hoe",
        "stone_hoe",
        "wooden_hoe"
    ]
};

// ⚠️ Mapa de blocos → tipo de ferramenta.
const FERRAMENTA_PARA_BLOCO = {
    // ── Madeiras → machado ──
    oak_log: "machado",
    birch_log: "machado",
    spruce_log: "machado",
    jungle_log: "machado",
    acacia_log: "machado",
    dark_oak_log: "machado",
    cherry_log: "machado",
    mangrove_log: "machado",
    oak_planks: "machado",
    birch_planks: "machado",
    crafting_table: "machado",

    // ── Pedras/minérios → picareta ──
    stone: "picareta",
    cobblestone: "picareta",
    andesite: "picareta",
    diorite: "picareta",
    granite: "picareta",
    deepslate: "picareta",
    coal_ore: "picareta",
    iron_ore: "picareta",
    gold_ore: "picareta",
    diamond_ore: "picareta",
    redstone_ore: "picareta",
    lapis_ore: "picareta",
    emerald_ore: "picareta",
    netherrack: "picareta",
    obsidian: "picareta",
    deepslate_iron_ore: "picareta",
    deepslate_gold_ore: "picareta",
    deepslate_diamond_ore: "picareta",
    deepslate_redstone_ore: "picareta",
    deepslate_lapis_ore: "picareta",
    deepslate_emerald_ore: "picareta",
    stone_bricks: "picareta",
    cobbled_deepslate: "picareta",

    // ── Terras/areias → pá ──
    dirt: "pa",
    grass_block: "pa",
    sand: "pa",
    gravel: "pa",
    clay: "pa",
    soul_sand: "pa",
    soul_soil: "pa",

    // ── Folhas/plantas → qualquer coisa, mas pá é bom ──
    oak_leaves: "pa",
    birch_leaves: "pa",
    spruce_leaves: "pa"
};

function criarEquipamento(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    // =========================================================
    // 🎒 HELPERS
    // =========================================================

    function temItem(nome) {
        if (!inventario || typeof inventario.contarItem !== "function") {
            return 0;
        }
        try {
            return Number(inventario.contarItem(nome) || 0);
        } catch (_) {
            return 0;
        }
    }

    function itemNaMao() {
        return bot?.heldItem?.name || null;
    }

    function estaSegurando(nome) {
        return itemNaMao() === nome;
    }

    // =========================================================
    // 🎯 ESCOLHER MELHOR FERRAMENTA
    // =========================================================

    /**
     * Dado um tipo ("picareta", "machado", ...),
     * devolve o nome do melhor item que o bot TEM.
     */
    function escolherMelhor(tipo) {
        const lista = FERRAMENTAS[tipo];

        if (!lista) return null;

        for (const nome of lista) {
            if (temItem(nome) > 0) {
                return nome;
            }
        }

        return null;
    }

    /**
     * Dado um bloco, devolve o tipo de ferramenta ideal.
     */
    function tipoParaBloco(nomeBloco) {
        if (!nomeBloco) return null;
        return FERRAMENTA_PARA_BLOCO[nomeBloco] || null;
    }

    /**
     * Equipa a melhor ferramenta pra quebrar o bloco.
     *
     * Retorna:
     *   - true  → equipou (ou já estava com a certa)
     *   - false → não conseguiu equipar
     *
     * ⚠️ FIX v2: loga quando NÃO TEM ferramenta.
     * Antes, retornava true em silêncio e o bot
     * quebrava na mão (timeout).
     */
    async function equiparParaBloco(nomeBloco) {
        const tipo = tipoParaBloco(nomeBloco);

        if (!tipo) {
            // Bloco sem ferramenta específica (terra, etc).
            // Não equipa nada.
            return true;
        }

        const melhor = escolherMelhor(tipo);

        if (!melhor) {
            // ⚠️ FIX v2: LOGA que não tem ferramenta.
            // Isso é crucial pra debug. Se você ver essa
            // linha no log, é porque o kit mínimo ainda
            // não foi craftado OU o bot perdeu a ferramenta
            // (drop no chão, morreu, etc).
            console.log(
                `⚠️ [equipamento] Sem ${tipo} pra quebrar ${nomeBloco}. ` +
                `Tentando com a mão.`
            );
            return true;
        }

        if (estaSegurando(melhor)) {
            return true;
        }

        try {
            const item = inventario.procurarItem(melhor);

            if (!item) return false;

            await bot.equip(item, "hand");

            console.log(
                `🛠️ [equipamento] Equipou ${melhor} pra quebrar ${nomeBloco}`
            );

            return true;

        } catch (erro) {
            console.error(
                `🛠️ [equipamento] Erro ao equipar ${melhor}:`,
                erro.message
            );
            return false;
        }
    }

    /**
     * Equipa a melhor espada pro combate.
     *
     * ⚠️ FIX v2: loga quando NÃO TEM espada.
     * Antes, retornava true em silêncio e o bot
     * combatia com o que tava na mão.
     */
    async function equiparArma() {
        const melhor = escolherMelhor("espada");

        if (!melhor) {
            console.log(
                `⚠️ [equipamento] Sem espada. Combatendo com o que tem.`
            );
            return true;
        }

        if (estaSegurando(melhor)) return true;

        try {
            const item = inventario.procurarItem(melhor);
            if (!item) return false;

            await bot.equip(item, "hand");

            console.log(`🛠️ [equipamento] Equipou ${melhor} pra combate`);
            return true;

        } catch (erro) {
            console.error(
                `🛠️ [equipamento] Erro ao equipar arma:`,
                erro.message
            );
            return false;
        }
    }

    function obterEstado() {
        return {
            naMao: itemNaMao(),
            melhorEspada: escolherMelhor("espada"),
            melhorPicareta: escolherMelhor("picareta"),
            melhorMachado: escolherMelhor("machado"),
            melhorPa: escolherMelhor("pa")
        };
    }

    return {
        equiparParaBloco,
        equiparArma,
        escolherMelhor,
        tipoParaBloco,
        obterEstado
    };
}

module.exports = { criarEquipamento };