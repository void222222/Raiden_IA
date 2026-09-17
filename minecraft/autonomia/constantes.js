/**
 * ⚙️ CONSTANTES — AUTONOMIA
 *
 * Tudo que é config, mapa estático ou lista fixa.
 *
 * Sem lógica. Sem estado. Sem dependências.
 *
 * ⚠️ NOVO NESTA VERSÃO:
 *
 * 1. FERRAMENTA_PARA_BLOCO  — qual ferramenta quebra cada bloco
 * 2. NIVEL_FERRAMENTA       — hierarquia wooden < stone < iron...
 * 3. KIT_MINIMO             — kit básico que Raiden deve ter
 * 4. RECEITAS_FERRAMENTA    — materiais de cada ferramenta
 *
 * 5. ⚠️ FASE 3 — BIOMAS
 *    BIOMAS é a tabela de biomas conhecidos.
 *
 * 6. ⚠️ CORREÇÃO — RECEITAS_FERRAMENTA
 *    Agora usa `materiais: [...]` com variantes.
 *    Antes, era `material: "oak_planks"` fixo, e o
 *    planejador não conseguia usar birch_planks, etc.
 */

// =========================================================
// ⚙️ CONFIG
// =========================================================

const CONFIG = {
    intervaloDecisao: 2000,
    distanciaPerigo: 8,
    tempoParadoMaximo: 6000,
    distanciaChegada: 3,
    distanciaQuebra: 5,
    raioBuscaPadrao: 64,
    cacheBuscaMs: 5000,
    falhasAntesDeReplanejar: 3,
    cooldownFalha: 8000
};

// =========================================================
// 🎯 META PADRÃO
// =========================================================

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
// 🌳 VARIANTES DE BLOCO
// =========================================================
//
// ⚠️ CORREÇÃO: adicionado cherry e mangrove

const VARIANTES_BLOCO = {
    oak_log: [
        "birch_log",
        "spruce_log",
        "jungle_log",
        "acacia_log",
        "dark_oak_log",
        "cherry_log",
        "mangrove_log"
    ],
    stone: ["cobblestone", "andesite", "diorite", "granite"],
    cobblestone: ["stone"],
    oak_planks: [
        "birch_planks",
        "spruce_planks",
        "jungle_planks",
        "acacia_planks",
        "dark_oak_planks",
        "cherry_planks",
        "mangrove_planks"
    ]
};

// =========================================================
// 🐷 MOBS QUE DROPAM ITENS
// =========================================================

const MOBS_QUE_DROPAM = {
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

// =========================================================
// 🔤 INFERÊNCIA DE ETAPAS (formato antigo)
// =========================================================

const REGRAS_INFERENCIA_ETAPA = [
    {
        tipo: "coletar_madeira",
        termos: [
            "madeira",
            "tronco",
            "log",
            "coletar",
            "minerar"
        ]
    },
    {
        tipo: "craftar_tabuas",
        termos: [
            "tabua",
            "tábua",
            "craft",
            "recurso"
        ]
    },
    {
        tipo: "escolher_local",
        termos: [
            "local",
            "lugar",
            "escolher",
            "posicao",
            "posição"
        ]
    },
    {
        tipo: "construir_abrigo",
        termos: [
            "abrigo",
            "construir",
            "parede",
            "casa",
            "torre"
        ]
    }
];

// =========================================================
// 🔄 RÓTULOS DE MOTIVO
// =========================================================

const MOTIVO = {
    NENHUM: null,
    NOVA_META: "nova_meta",
    AGUARDANDO_API: "aguardando_api",
    PERIGO_PROXIMO: "perigo_proximo",
    META_FINALIZADA: "meta_finalizada",
    MUITAS_FALHAS: "muitas_falhas_na_tarefa",
    SEM_PROGRESSO: "sem_progresso",
    MUNDO_INDISPONIVEL: "mundo_indisponivel",
    NAVEGACAO_INDISPONIVEL: "navegacao_indisponivel",
    LOCAL_INDISPONIVEL: "local_indisponivel",
    SISTEMA_ACOES_INDISPONIVEL: "sistema_acoes_indisponivel",
    CANCELADA: "cancelada"
};

// =========================================================
// 📊 RESULTADO DE TAREFA
// =========================================================

const RESULTADO = {
    concluida: () => ({ concluida: true, emProgresso: false, erro: null }),
    emProgresso: () => ({ concluida: false, emProgresso: true, erro: null }),
    falha: (erro) => ({ concluida: false, emProgresso: false, erro: erro || "falha" })
};

// =========================================================
// 🛠️ FASE 1 — FERRAMENTAS
// =========================================================

const FERRAMENTA_PARA_BLOCO = {
    stone: "wooden_pickaxe",
    cobblestone: "wooden_pickaxe",
    andesite: "wooden_pickaxe",
    diorite: "wooden_pickaxe",
    granite: "wooden_pickaxe",
    deepslate: "wooden_pickaxe",
    tuff: "wooden_pickaxe",
    calcite: "wooden_pickaxe",

    coal_ore: "wooden_pickaxe",
    iron_ore: "stone_pickaxe",
    deepslate_iron_ore: "stone_pickaxe",
    copper_ore: "stone_pickaxe",
    lapis_ore: "stone_pickaxe",
    deepslate_lapis_ore: "stone_pickaxe",

    gold_ore: "iron_pickaxe",
    deepslate_gold_ore: "iron_pickaxe",
    redstone_ore: "iron_pickaxe",
    deepslate_redstone_ore: "iron_pickaxe",
    diamond_ore: "iron_pickaxe",
    deepslate_diamond_ore: "iron_pickaxe",
    emerald_ore: "iron_pickaxe",
    deepslate_emerald_ore: "iron_pickaxe",

    obsidian: "diamond_pickaxe",
    crying_obsidian: "diamond_pickaxe",
    ancient_debris: "diamond_pickaxe"
};

// =========================================================
// 🛠️ FASE 1 — NÍVEIS DE FERRAMENTA
// =========================================================

const NIVEL_FERRAMENTA = {
    wooden: 1,
    stone: 2,
    iron: 3,
    diamond: 4,
    netherite: 5
};

// =========================================================
// 🛠️ FASE 1 — KIT MÍNIMO
// =========================================================

const KIT_MINIMO = [
    { item: "wooden_pickaxe", quantidade: 1 },
    { item: "wooden_axe",     quantidade: 1 },
    { item: "wooden_sword",   quantidade: 1 }
];

// =========================================================
// 🛠️ FASE 1 — RECEITAS DE FERRAMENTA
// =========================================================
//
// ⚠️ CORREÇÃO: estrutura mudou.
//
// Antes:
//   material: "oak_planks" (fixo)
//
// Agora:
//   materiais: [
//     { nome: "oak_planks", quantidade: 3, variantes: [...] },
//     { nome: "stick", quantidade: 2, variantes: [] }
//   ]
//
// O planejador testa a variante se não tiver o principal.

const RECEITAS_FERRAMENTA = {
    wooden_pickaxe: {
        materiais: [
            {
                nome: "oak_planks",
                quantidade: 3,
                variantes: [
                    "birch_planks", "spruce_planks",
                    "jungle_planks", "acacia_planks",
                    "dark_oak_planks", "cherry_planks",
                    "mangrove_planks"
                ]
            },
            {
                nome: "stick",
                quantidade: 2,
                variantes: []
            }
        ],
        nivelMaterial: 1,
        precisaMesa: true
    },
    wooden_axe: {
        materiais: [
            {
                nome: "oak_planks",
                quantidade: 3,
                variantes: [
                    "birch_planks", "spruce_planks",
                    "jungle_planks", "acacia_planks",
                    "dark_oak_planks", "cherry_planks",
                    "mangrove_planks"
                ]
            },
            {
                nome: "stick",
                quantidade: 2,
                variantes: []
            }
        ],
        nivelMaterial: 1,
        precisaMesa: true
    },
    wooden_sword: {
        materiais: [
            {
                nome: "oak_planks",
                quantidade: 2,
                variantes: [
                    "birch_planks", "spruce_planks",
                    "jungle_planks", "acacia_planks",
                    "dark_oak_planks", "cherry_planks",
                    "mangrove_planks"
                ]
            },
            {
                nome: "stick",
                quantidade: 1,
                variantes: []
            }
        ],
        nivelMaterial: 1,
        precisaMesa: true
    },
    stone_pickaxe: {
        materiais: [
            { nome: "cobblestone", quantidade: 3, variantes: ["stone"] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 2,
        precisaMesa: true
    },
    stone_axe: {
        materiais: [
            { nome: "cobblestone", quantidade: 3, variantes: ["stone"] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 2,
        precisaMesa: true
    },
    stone_sword: {
        materiais: [
            { nome: "cobblestone", quantidade: 2, variantes: ["stone"] },
            { nome: "stick", quantidade: 1, variantes: [] }
        ],
        nivelMaterial: 2,
        precisaMesa: true
    },
    iron_pickaxe: {
        materiais: [
            { nome: "iron_ingot", quantidade: 3, variantes: [] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 3,
        precisaMesa: true
    },
    iron_axe: {
        materiais: [
            { nome: "iron_ingot", quantidade: 3, variantes: [] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 3,
        precisaMesa: true
    },
    iron_sword: {
        materiais: [
            { nome: "iron_ingot", quantidade: 2, variantes: [] },
            { nome: "stick", quantidade: 1, variantes: [] }
        ],
        nivelMaterial: 3,
        precisaMesa: true
    },
    diamond_pickaxe: {
        materiais: [
            { nome: "diamond", quantidade: 3, variantes: [] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 4,
        precisaMesa: true
    },
    diamond_axe: {
        materiais: [
            { nome: "diamond", quantidade: 3, variantes: [] },
            { nome: "stick", quantidade: 2, variantes: [] }
        ],
        nivelMaterial: 4,
        precisaMesa: true
    },
    diamond_sword: {
        materiais: [
            { nome: "diamond", quantidade: 2, variantes: [] },
            { nome: "stick", quantidade: 1, variantes: [] }
        ],
        nivelMaterial: 4,
        precisaMesa: true
    }
};

// =========================================================
// 🌳 FASE 3 — BIOMAS
// =========================================================

const BIOMAS = {
    jungle: {
        perigos: ["creeper", "skeleton", "spider"],
        recursos: ["jungle_log", "bamboo", "cocoa", "melon", "vine"],
        caracteristicas: [
            "arvores_altas",
            "cipo",
            "umidade",
            "folhagem_densa"
        ],
        mobs_comuns: ["parrot", "ocelot", "panda", "chicken"],
        dificuldade_navegacao: "alta"
    },
    forest: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["oak_log", "birch_log", "apple", "mushroom"],
        caracteristicas: ["arvores_medias", "grama", "flores"],
        mobs_comuns: ["cow", "pig", "sheep", "chicken", "wolf"],
        dificuldade_navegacao: "baixa"
    },
    birch_forest: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["birch_log", "mushroom"],
        caracteristicas: ["arvores_claras", "grama"],
        mobs_comuns: ["cow", "pig", "sheep", "chicken"],
        dificuldade_navegacao: "baixa"
    },
    dark_forest: {
        perigos: ["zombie", "skeleton", "spider", "creeper", "witch"],
        recursos: ["dark_oak_log", "mushroom", "red_mushroom"],
        caracteristicas: ["arvores_escuras", "folhagem_densa"],
        mobs_comuns: ["cow", "pig", "sheep"],
        dificuldade_navegacao: "media"
    },
    desert: {
        perigos: ["husk", "creeper", "skeleton"],
        recursos: ["sand", "cactus", "dead_bush", "sandstone"],
        caracteristicas: ["sem_agua", "calor", "planicie"],
        mobs_comuns: ["rabbit", "camel"],
        dificuldade_navegacao: "baixa"
    },
    plains: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["oak_log", "wheat", "grass", "flower"],
        caracteristicas: ["plano", "grama_alta", "poucas_arvores"],
        mobs_comuns: ["cow", "pig", "sheep", "chicken", "horse"],
        dificuldade_navegacao: "baixa"
    },
    sunflower_plains: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["oak_log", "sunflower", "wheat"],
        caracteristicas: ["plano", "flores"],
        mobs_comuns: ["cow", "pig", "sheep", "chicken"],
        dificuldade_navegacao: "baixa"
    },
    savanna: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["acacia_log", "grass", "tall_grass"],
        caracteristicas: ["arvores_retorcidas", "grama_seca"],
        mobs_comuns: ["cow", "sheep", "horse", "llama"],
        dificuldade_navegacao: "baixa"
    },
    mountains: {
        perigos: ["zombie", "skeleton", "spider", "creeper", "goat"],
        recursos: ["stone", "cobblestone", "coal_ore", "iron_ore", "emerald_ore"],
        caracteristicas: ["relevo_acentuado", "rocha_exposta"],
        mobs_comuns: ["goat", "sheep"],
        dificuldade_navegacao: "alta"
    },
    snowy_plains: {
        perigos: ["zombie", "skeleton", "stray", "creeper"],
        recursos: ["snow", "ice", "spruce_log", "sweet_berries"],
        caracteristicas: ["frio", "neve", "agua_congelada"],
        mobs_comuns: ["rabbit", "polar_bear", "fox"],
        dificuldade_navegacao: "media"
    },
    snowy_taiga: {
        perigos: ["zombie", "skeleton", "stray", "creeper", "wolf"],
        recursos: ["spruce_log", "snow", "sweet_berries"],
        caracteristicas: ["frio", "arvores_escuras"],
        mobs_comuns: ["wolf", "fox", "rabbit"],
        dificuldade_navegacao: "media"
    },
    taiga: {
        perigos: ["zombie", "skeleton", "spider", "creeper", "wolf"],
        recursos: ["spruce_log", "fern", "sweet_berries"],
        caracteristicas: ["arvores_escuras", "frio_moderado"],
        mobs_comuns: ["wolf", "fox", "rabbit"],
        dificuldade_navegacao: "media"
    },
    beach: {
        perigos: ["zombie", "drowned", "creeper"],
        recursos: ["sand", "sandstone", "sugar_cane"],
        caracteristicas: ["areia", "proximo_ao_mar"],
        mobs_comuns: ["turtle"],
        dificuldade_navegacao: "baixa"
    },
    ocean: {
        perigos: ["drowned", "guardian"],
        recursos: ["prismarine", "sea_lantern", "kelp"],
        caracteristicas: ["agua", "submerso"],
        mobs_comuns: ["fish", "squid", "dolphin"],
        dificuldade_navegacao: "alta"
    },
    swamp: {
        perigos: ["zombie", "skeleton", "spider", "slime", "witch"],
        recursos: ["mangrove_log", "lily_pad", "sugar_cane", "vine"],
        caracteristicas: ["agua", "lama", "folhagem_densa"],
        mobs_comuns: ["frog", "slime"],
        dificuldade_navegacao: "alta"
    },
    bamboo_jungle: {
        perigos: ["creeper", "skeleton", "spider", "panda"],
        recursos: ["bamboo", "jungle_log", "cocoa"],
        caracteristicas: ["bambu_alto", "folhagem_densa"],
        mobs_comuns: ["panda", "parrot", "ocelot"],
        dificuldade_navegacao: "alta"
    },
    dripstone_caves: {
        perigos: ["zombie", "skeleton", "creeper", "spider", "bat"],
        recursos: ["dripstone_block", "pointed_dripstone", "copper_ore"],
        caracteristicas: ["subterraneo", "estalactites"],
        mobs_comuns: ["bat", "glow_squid"],
        dificuldade_navegacao: "alta"
    },
    lush_caves: {
        perigos: ["zombie", "skeleton", "creeper", "spider"],
        recursos: ["moss_block", "azalea", "glow_berries", "clay"],
        caracteristicas: ["subterraneo", "vegetacao"],
        mobs_comuns: ["axolotl", "glow_squid", "bat"],
        dificuldade_navegacao: "media"
    },
    nether_wastes: {
        perigos: ["zombified_piglin", "piglin", "hoglin", "ghast", "magma_cube"],
        recursos: ["netherrack", "quartz_ore", "gold_ore"],
        caracteristicas: ["fogo", "lava", "calor_extremo"],
        mobs_comuns: ["piglin", "hoglin"],
        dificuldade_navegacao: "alta"
    },
    the_end: {
        perigos: ["enderman", "shulker", "endermite"],
        recursos: ["end_stone", "chorus_fruit", "obsidian"],
        caracteristicas: ["vazio", "ilhas_flutuantes"],
        mobs_comuns: ["enderman"],
        dificuldade_navegacao: "alta"
    },
    desconhecido: {
        perigos: ["zombie", "skeleton", "spider", "creeper"],
        recursos: ["oak_log", "stone", "dirt"],
        caracteristicas: ["desconhecido"],
        mobs_comuns: ["cow", "pig", "sheep"],
        dificuldade_navegacao: "media"
    }
};

module.exports = {
    CONFIG,
    META_PADRAO_ABRIGO,
    VARIANTES_BLOCO,
    MOBS_QUE_DROPAM,
    REGRAS_INFERENCIA_ETAPA,
    MOTIVO,
    RESULTADO,

    FERRAMENTA_PARA_BLOCO,
    NIVEL_FERRAMENTA,
    KIT_MINIMO,
    RECEITAS_FERRAMENTA,

    BIOMAS
};