const { Vec3 } = require("vec3");

/**
 * 🔨 CRAFTING — RAIDEN MINECRAFT
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO:
 *
 * 1. craftar() agora VALIDA material antes de chamar
 *    bot.craft().
 *
 * 2. Se o erro for "missing ingredient", NÃO tenta
 *    retry.
 *
 * 3. Loop SAI mais cedo quando o problema é falta
 *    de material.
 *
 * 4. Validação de material MULTIPLICA pela quantidade
 *    de crafts necessários.
 *
 * 5. ⚠️ CORREÇÃO CRÍTICA: escolherReceitaViavel()
 *
 * 6. contarItemOuVariante() e resolverNomeReal()
 *    tratam variantes.
 *
 * 7. ⚠️ ÚNICA FONTE DE VERDADE:
 *    planejador e handler chamam
 *    crafting.escolherReceitaViavel().
 *
 * 8. ⚠️ CORREÇÃO DE CAMINHO:
 *    constantes.js está em autonomia/.
 *
 * 9. ⚠️ NOVO — GARANTIR MESA:
 *    Antes, encontrarMesaCrafting() só procurava mesa
 *    NO MUNDO. Se o bot tinha crafting_table no
 *    inventário, não usava.
 *
 *    Agora, garantirMesa() faz:
 *      1. Tem mesa no mundo? → usa
 *      2. Tem crafting_table no inventário? →
 *         coloca no chão → usa
 *      3. Não tem? → crafta crafting_table (4 planks)
 *         → coloca no chão → usa
 */

const {
    VARIANTES_BLOCO
} = require("./autonomia/constantes");

const DEBUG = process.env.CRAFTING_DEBUG === "1";

function log(...args) {
    if (DEBUG) console.log(...args);
}

function warn(...args) {
    if (DEBUG) console.warn(...args);
}

function error(...args) {
    console.error(...args);
}

function criarCrafting(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    // =========================================================
    // 📊 CACHE DE MESA
    // =========================================================

    const CACHE_MESA_MS = 10000;

    const cacheMesa = {
        em: 0,
        valor: null
    };

    function invalidarCacheMesa() {
        cacheMesa.em = 0;
        cacheMesa.valor = null;
    }

    // =========================================================
    // 📦 REGISTRY HELPERS
    // =========================================================

    function obterItem(nome) {
        if (!nome) {
            warn("🔨 [REGISTRY] Nome de item vazio.");
            return null;
        }

        const item = bot.registry.itemsByName[nome] || null;

        log(
            `🔨 [REGISTRY] item="${nome}" encontrado=${!!item}` +
            (item ? ` id=${item.id}` : "")
        );

        return item;
    }

    function obterIdItem(nome) {
        const item = obterItem(nome);
        const id = item ? item.id : null;

        log(`🔨 [REGISTRY] ID de "${nome}" = ${id}`);

        return id;
    }

    function obterNomeItemPorId(id) {
        if (id === null || id === undefined) return null;

        const nome = bot.registry.items[id]?.name || null;

        log(`🔨 [REGISTRY] ID ${id} -> "${nome}"`);

        return nome;
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

    function contarItemOuVariante(nome, quantidade = 1) {
        const direto = contarItem(nome);

        if (direto >= quantidade) return direto;

        const variantes = VARIANTES_BLOCO[nome] || [];

        for (const v of variantes) {
            const qtd = contarItem(v);
            if (qtd >= quantidade) {
                return qtd;
            }
        }

        return direto;
    }

    function resolverNomeReal(nome, quantidade = 1) {
        if (contarItem(nome) >= quantidade) {
            return nome;
        }

        const variantes = VARIANTES_BLOCO[nome] || [];

        for (const v of variantes) {
            if (contarItem(v) >= quantidade) {
                return v;
            }
        }

        return nome;
    }

    // =========================================================
    // 🔍 BUSCA DE RECEITAS
    // =========================================================

    function procurarReceitas(
        nomeItem,
        quantidade = 1,
        mesaBlock = null
    ) {
        log(
            `🔍 [RECEITA] Procurando:` +
            ` item="${nomeItem}"` +
            ` quantidade=${quantidade}` +
            ` mesa=${!!mesaBlock}`
        );

        const id = obterIdItem(nomeItem);

        if (id === null) {
            warn(
                `❌ [RECEITA] Item "${nomeItem}" não existe no registry.`
            );
            return [];
        }

        try {
            const receitas = bot.recipesAll(
                id,
                null,
                1,
                mesaBlock
            );

            log(
                `🔍 [RECEITA] Resultado:` +
                ` item="${nomeItem}"` +
                ` id=${id}` +
                ` receitas=${receitas.length}`
            );

            return receitas;
        } catch (erro) {
            error(
                `❌ [RECEITA] Erro em bot.recipesAll("${nomeItem}"):`,
                erro.message || erro
            );
            return [];
        }
    }

    function procurarReceita(nomeItem) {
        return procurarReceitas(nomeItem, 1)[0] || null;
    }

    function obterReceitas(nomeItem) {
        return procurarReceitas(nomeItem, 1);
    }

    // =========================================================
    // 🧪 MATERIAIS DE UMA RECEITA
    // =========================================================

    function obterMateriais(receita) {
        if (!receita) {
            warn("⚠️ [MATERIAIS] Receita inexistente.");
            return [];
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

        if (!materiais.length && Array.isArray(receita.ingredients)) {
            for (const item of receita.ingredients) {
                if (!item?.id) continue;

                materiais.push({
                    id: item.id,
                    quantidade: Number(item.count || 1),
                    nome: obterNomeItemPorId(item.id)
                });
            }
        }

        log(
            `🧪 [MATERIAIS] Total encontrado: ${materiais.length}`
        );

        return materiais;
    }

    function obterMateriaisResolvidos(receita) {
        const materiais = obterMateriais(receita);

        return materiais.map(mat => {
            if (!mat.nome) return mat;

            const nomeReal = resolverNomeReal(
                mat.nome,
                mat.quantidade
            );

            return {
                ...mat,
                nomeOriginal: mat.nome,
                nomeReal
            };
        });
    }

    // =========================================================
    // 📖 ESCOLHER RECEITA VIÁVEL
    // =========================================================

    function escolherReceitaViavel(receitas) {
        if (!receitas || receitas.length === 0) {
            return null;
        }

        if (receitas.length === 1) {
            return receitas[0];
        }

        const avaliadas = receitas.map(receita => {
            const materiais = obterMateriais(receita);

            let faltando = 0;
            let materiaisConhecidos = 0;

            for (const mat of materiais) {
                if (!mat.nome) continue;
                materiaisConhecidos++;

                const tenho = contarItem(mat.nome);

                if (tenho >= mat.quantidade) continue;

                const variantes = VARIANTES_BLOCO[mat.nome] || [];
                const achouVariante = variantes.some(v =>
                    contarItem(v) >= mat.quantidade
                );

                if (achouVariante) continue;

                faltando++;
            }

            return {
                receita,
                faltando,
                materiaisConhecidos
            };
        });

        avaliadas.sort((a, b) => {
            if (a.faltando !== b.faltando) {
                return a.faltando - b.faltando;
            }
            return b.materiaisConhecidos - a.materiaisConhecidos;
        });

        return avaliadas[0]?.receita || receitas[0];
    }

    // =========================================================
    // ✅ VERIFICAÇÕES
    // =========================================================

    function podeCraftar(nomeItem, quantidade = 1) {
        quantidade = Math.max(
            1,
            Math.floor(Number(quantidade) || 1)
        );

        const receitas = procurarReceitas(nomeItem, quantidade);

        return receitas.length > 0;
    }

    function possuiMateriais(nomeItem, quantidade = 1) {
        quantidade = Math.max(
            1,
            Math.floor(Number(quantidade) || 1)
        );

        const receitas = procurarReceitas(nomeItem, quantidade);

        if (!receitas.length) return false;

        if (
            !inventario ||
            typeof inventario.contarItem !== "function"
        ) {
            return true;
        }

        const receita = escolherReceitaViavel(receitas);
        const materiais = obterMateriais(receita);

        if (!materiais.length) return true;

        return materiais.every(material => {
            if (!material.nome) return true;

            const necessario =
                material.quantidade * quantidade;
            const possui =
                contarItemOuVariante(material.nome, necessario);

            return possui >= necessario;
        });
    }

    function possuiIngredientes(nomeItem, quantidade = 1) {
        return possuiMateriais(nomeItem, quantidade);
    }

    function obterQuantidadeCraftavel(nomeItem) {
        const receitas = procurarReceitas(nomeItem, 1);

        if (!receitas.length) return 0;

        if (
            !inventario ||
            typeof inventario.contarItem !== "function"
        ) {
            return 0;
        }

        const receita = escolherReceitaViavel(receitas);
        const materiais = obterMateriais(receita);

        if (!materiais.length) return 0;

        const qtdPorCraft =
            Number(receita.result?.count || 1) || 1;

        let minCrafts = Infinity;

        for (const material of materiais) {
            if (!material.nome) continue;

            const tem = contarItemOuVariante(
                material.nome,
                material.quantidade
            );
            const custo = material.quantidade;

            if (custo <= 0) continue;

            const craftsPossiveis = Math.floor(tem / custo);

            if (craftsPossiveis < minCrafts) {
                minCrafts = craftsPossiveis;
            }
        }

        if (!Number.isFinite(minCrafts) || minCrafts < 0) {
            return 0;
        }

        return minCrafts * qtdPorCraft;
    }

    function precisaMesaCrafting(nomeItem) {
        const receitas = procurarReceitas(nomeItem, 1);

        if (!receitas.length) return false;

        const receita = escolherReceitaViavel(receitas);

        return !!receita.requiresTable;
    }

    // =========================================================
    // 🪑 MESA DE CRAFTING — NOVO
    // =========================================================

    /*
     * ⚠️ NOVO: procura mesa APENAS no mundo.
     *
     * (a versão antiga já fazia isso, mas agora separamos
     * a lógica "no mundo" da lógica "garantir")
     */
    function encontrarMesaNoMundo(distancia = 6) {
        const agora = Date.now();

        if (
            cacheMesa.valor !== null &&
            agora - cacheMesa.em < CACHE_MESA_MS
        ) {
            return cacheMesa.valor;
        }

        if (agora - cacheMesa.em < CACHE_MESA_MS) {
            return null;
        }

        log(
            `🪑 [MESA] Procurando crafting_table até ${distancia} blocos.`
        );

        if (!bot.entity?.position) {
            warn("⚠️ [MESA] Posição do bot indisponível.");
            cacheMesa.em = agora;
            cacheMesa.valor = null;
            return null;
        }

        const idMesa =
            bot.registry.blocksByName.crafting_table?.id;

        if (idMesa === undefined || idMesa === null) {
            warn("❌ [MESA] crafting_table não existe no registry.");
            cacheMesa.em = agora;
            cacheMesa.valor = null;
            return null;
        }

        let blocos;

        try {
            blocos = bot.findBlocks({
                matching: idMesa,
                maxDistance: distancia,
                count: 1
            });
        } catch (erro) {
            error("❌ [MESA] Erro em bot.findBlocks:", erro.message);
            cacheMesa.em = agora;
            cacheMesa.valor = null;
            return null;
        }

        if (!Array.isArray(blocos) || !blocos.length) {
            log("🪑 [MESA] Nenhuma crafting_table encontrada.");
            cacheMesa.em = agora;
            cacheMesa.valor = null;
            return null;
        }

        const posicao = blocos[0];

        const resultado = {
            x: posicao.x,
            y: posicao.y,
            z: posicao.z,
            distancia: bot.entity.position.distanceTo(posicao)
        };

        log("🪑 [MESA] Encontrada no mundo:", resultado);

        cacheMesa.em = agora;
        cacheMesa.valor = resultado;

        return resultado;
    }

    /*
     * ⚠️ NOVO: pega crafting_table do inventário e
     * coloca no chão perto do bot.
     *
     * Retorna a posição da mesa (ou null).
     */
    async function colocarMesaNoChao() {
        const temMesa = contarItem("crafting_table") > 0;

        if (!temMesa) {
            log("🪑 [MESA] Sem crafting_table no inventário.");
            return null;
        }

        const pos = bot.entity?.position;
        if (!pos) return null;

        // Tenta colocar na frente do bot, no chão
        const alvos = [
            { dx: 1, dy: -1, dz: 0 },
            { dx: -1, dy: -1, dz: 0 },
            { dx: 0, dy: -1, dz: 1 },
            { dx: 0, dy: -1, dz: -1 }
        ];

        // Acha um bloco sólido pra apoiar
        for (const alvo of alvos) {
            const apoioX = Math.floor(pos.x) + alvo.dx;
            const apoioY = Math.floor(pos.y) + alvo.dy;
            const apoioZ = Math.floor(pos.z) + alvo.dz;

            let blocoApoio;
            try {
                blocoApoio = bot.blockAt(
                    new Vec3(apoioX, apoioY, apoioZ)
                );
            } catch (_) {
                continue;
            }

            if (!blocoApoio) continue;
            if (blocoApoio.boundingBox === "empty") continue;

            // Bloco em cima do apoio precisa estar livre
            let blocoCima;
            try {
                blocoCima = bot.blockAt(
                    new Vec3(apoioX, apoioY + 1, apoioZ)
                );
            } catch (_) {
                continue;
            }

            if (
                blocoCima &&
                blocoCima.boundingBox !== "empty"
            ) {
                continue;
            }

            // Acha o item crafting_table no inventário
            const itemMesa = bot.inventory.slots.find(
                s => s && s.name === "crafting_table"
            );

            if (!itemMesa) {
                log("🪑 [MESA] crafting_table sumiu do inventário.");
                return null;
            }

            try {
                await bot.equip(itemMesa, "hand");

                await bot.lookAt(
                    blocoApoio.position.offset(0.5, 0.5, 0.5),
                    true
                );

                await bot.placeBlock(
                    blocoApoio,
                    new Vec3(0, 1, 0)
                );

                const posicaoMesa = {
                    x: apoioX,
                    y: apoioY + 1,
                    z: apoioZ,
                    distancia: 1
                };

                log("🪑 [MESA] Colocada no chão:", posicaoMesa);

                // Invalida cache pra próxima busca achar
                invalidarCacheMesa();

                return posicaoMesa;

            } catch (erro) {
                error(
                    "❌ [MESA] Erro ao colocar no chão:",
                    erro.message
                );
                return null;
            }
        }

        log("🪑 [MESA] Nenhum lugar viável pra colocar.");
        return null;
    }

    /*
     * ⚠️ NOVO: crafta crafting_table (4 planks).
     *
     * Chamada quando o bot PRECISA de mesa e não tem
     * nem no mundo nem no inventário.
     */
    async function craftarMesaCrafting() {
        // Já tem?
        if (contarItem("crafting_table") > 0) {
            return true;
        }

        // Tem material?
        const material = resolverNomeReal("oak_planks", 4);
        const temMaterial =
            contarItemOuVariante(material, 4) >= 4;

        if (!temMaterial) {
            log(
                "🪑 [MESA] Sem material pra craftar crafting_table " +
                "(precisa 4 planks)."
            );
            return false;
        }

        // Chama o próprio craftar recursivamente, mas
        // SEM mesa (crafting_table é craftável na mão)
        try {
            const receitas = procurarReceitas("crafting_table", 1);

            if (!receitas.length) {
                log("🪑 [MESA] Sem receita de crafting_table.");
                return false;
            }

            const receita = escolherReceitaViavel(receitas);

            if (!receita) {
                log("🪑 [MESA] Sem receita viável de crafting_table.");
                return false;
            }

            // crafting_table é 2x2, não precisa de mesa
            await bot.craft(receita, 1, null);

            log("🪑 [MESA] crafting_table craftada.");

            return true;

        } catch (erro) {
            error(
                "❌ [MESA] Erro ao craftar crafting_table:",
                erro.message
            );
            return false;
        }
    }

    /*
     * ⚠️ NOVO: garantir que tem mesa pra craftar.
     *
     * Ordem:
     *   1. Tem mesa NO MUNDO?      → usa
     *   2. Tem crafting_table INV? → coloca no chão → usa
     *   3. Não tem?                → crafta + coloca no chão
     *
     * Retorna a posição da mesa (ou null).
     */
    async function garantirMesa() {
        // 1. Tem no mundo?
        let mesa = encontrarMesaNoMundo();

        if (mesa) {
            log("🪑 [MESA] Já tem no mundo.");
            return mesa;
        }

        // 2. Tem no inventário?
        if (contarItem("crafting_table") > 0) {
            log("🪑 [MESA] Tem no inventário. Colocando no chão...");
            mesa = await colocarMesaNoChao();

            if (mesa) {
                return mesa;
            }
        }

        // 3. Não tem: crafta
        log("🪑 [MESA] Não tem. Craftando crafting_table...");
        const craftou = await craftarMesaCrafting();

        if (!craftou) {
            return null;
        }

        // Coloca no chão
        mesa = await colocarMesaNoChao();

        if (mesa) {
            return mesa;
        }

        return null;
    }

    function obterBlocoMesa(mesa) {
        if (!mesa || !bot.blockAt) {
            warn("⚠️ [MESA] Dados da mesa ou bot.blockAt indisponíveis.");
            return null;
        }

        try {
            return bot.blockAt(
                new Vec3(mesa.x, mesa.y, mesa.z)
            );
        } catch (erro) {
            error("❌ [MESA] Erro ao obter Block:", erro.message);
            return null;
        }
    }

    // =========================================================
    // 🔨 CRAFTAR
    // =========================================================

    async function craftar(nomeItem, quantidade = 1) {
        quantidade = Math.max(
            1,
            Math.floor(Number(quantidade) || 1)
        );

        log(`🚀 [CRAFT] INICIANDO "${nomeItem}" x${quantidade}`);

        let feitos = 0;
        let ultimoErro = null;

        const maxTentativas = quantidade * 2 + 10;

        for (
            let tentativa = 0;
            tentativa < maxTentativas && feitos < quantidade;
            tentativa++
        ) {
            log(
                `🔨 [CRAFT] Tentativa ${tentativa + 1}` +
                ` (feitos=${feitos}/${quantidade})`
            );

            const receitas = procurarReceitas(nomeItem, 1);

            if (!receitas.length) {
                ultimoErro =
                    `Sem receita disponível para ${nomeItem}`;
                error(`❌ [CRAFT] ${ultimoErro}`);
                break;
            }

            const receita = escolherReceitaViavel(receitas);

            if (!receita) {
                ultimoErro =
                    `Nenhuma receita viável para ${nomeItem}`;
                error(`❌ [CRAFT] ${ultimoErro}`);
                break;
            }

            // ⚠️ VALIDAÇÃO DE MATERIAL
            const qtdPorCraft =
                Number(receita.result?.count || 1) || 1;
            const craftsNecessarios = Math.ceil(
                (quantidade - feitos) / qtdPorCraft
            );

            const materiais = obterMateriaisResolvidos(receita);

            const faltaMaterial = materiais.some(mat => {
                if (!mat.nomeReal) return false;
                const tenho = contarItem(mat.nomeReal);
                const preciso =
                    mat.quantidade * craftsNecessarios;
                return tenho < preciso;
            });

            if (faltaMaterial) {
                const faltando = materiais
                    .filter(mat => {
                        if (!mat.nomeReal) return false;
                        const tenho = contarItem(mat.nomeReal);
                        const preciso =
                            mat.quantidade * craftsNecessarios;
                        return tenho < preciso;
                    })
                    .map(mat => {
                        const tenho = contarItem(mat.nomeReal);
                        const preciso =
                            mat.quantidade * craftsNecessarios;
                        return `${mat.nomeReal} (${tenho}/${preciso})`;
                    })
                    .join(", ");

                ultimoErro = `Faltam materiais: ${faltando}`;
                error(`❌ [CRAFT] ${ultimoErro}`);
                break;
            }

            let mesaBlock = null;

            if (receita.requiresTable) {
                // ⚠️ NOVO: garantirMesa() faz tudo
                const mesa = await garantirMesa();

                if (!mesa) {
                    ultimoErro =
                        `Receita exige mesa, mas não consegui ` +
                        `colocar/craftar uma (${nomeItem})`;
                    error(`❌ [CRAFT] ${ultimoErro}`);
                    break;
                }

                mesaBlock = obterBlocoMesa(mesa);

                if (!mesaBlock) {
                    ultimoErro =
                        "Não foi possível resolver o bloco da mesa";
                    error(`❌ [CRAFT] ${ultimoErro}`);
                    break;
                }
            }

            const restante = quantidade - feitos;

            try {
                log(
                    `🔨 [CRAFT] bot.craft()` +
                    ` item="${nomeItem}"` +
                    ` quantidade=${restante}` +
                    ` mesa=${!!mesaBlock}`
                );

                await bot.craft(
                    receita,
                    restante,
                    mesaBlock
                );

                feitos = quantidade;

                log(
                    `✅ [CRAFT] Sucesso: "${nomeItem}"` +
                    ` feito=${feitos}/${quantidade}`
                );

                break;

            } catch (erro) {
                ultimoErro = erro.message || String(erro);

                error(
                    `❌ [CRAFT] bot.craft() falhou para "${nomeItem}":`,
                    ultimoErro
                );

                if (
                    ultimoErro
                        .toLowerCase()
                        .includes("missing ingredient")
                ) {
                    error(
                        `❌ [CRAFT] Falta material. Abortando loop.`
                    );
                    break;
                }

                if (restante > 1) {
                    try {
                        await bot.craft(receita, 1, mesaBlock);
                        feitos++;
                        log(
                            `✅ [CRAFT] Craftou 1 unidade` +
                            ` (feitos=${feitos}/${quantidade})`
                        );
                        ultimoErro = null;
                    } catch (erro2) {
                        ultimoErro =
                            erro2.message || String(erro2);
                        error(
                            `❌ [CRAFT] Retry 1 unidade falhou:`,
                            ultimoErro
                        );
                        break;
                    }
                } else {
                    break;
                }
            }
        }

        const resultado = feitos === 0
            ? {
                sucesso: false,
                acao: "craftar",
                erro:
                    ultimoErro ||
                    "Craft falhou sem erro específico",
                feitos: 0
            }
            : {
                sucesso: true,
                acao: "craftar",
                erro: null,
                feitos,
                faltou: quantidade - feitos
            };

        log(
            `🏁 [CRAFT] FINALIZADO "${nomeItem}"`,
            resultado
        );

        invalidarCacheMesa();

        return resultado;
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterEstado() {
        return {
            disponivel: true,
            mesaCraftingProxima: encontrarMesaNoMundo(),
            temMesaNoInventario: contarItem("crafting_table") > 0
        };
    }

    return {
        procurarReceita,
        procurarReceitas,
        obterReceitas,
        obterMateriais,
        obterMateriaisResolvidos,

        escolherReceitaViavel,
        contarItemOuVariante,
        resolverNomeReal,

        podeCraftar,
        obterQuantidadeCraftavel,
        possuiMateriais,
        possuiIngredientes,
        precisaMesaCrafting,

        // Mesa
        encontrarMesaNoMundo,
        colocarMesaNoChao,
        craftarMesaCrafting,
        garantirMesa,
        encontrarMesaCrafting: encontrarMesaNoMundo,

        craftar,
        obterEstado,
        invalidarCacheMesa
    };
}

module.exports = {
    criarCrafting
};