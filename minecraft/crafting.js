const { Vec3 } = require("vec3");

function criarCrafting(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    // =========================================================
    // 📦 REGISTRY HELPERS
    // =========================================================

    function obterItem(nome) {
        if (!nome) {
            console.warn("🔨 [REGISTRY] Nome de item vazio.");
            return null;
        }

        const item = bot.registry.itemsByName[nome] || null;

        console.log(
            `🔨 [REGISTRY] item="${nome}" encontrado=${!!item}` +
            (item ? ` id=${item.id}` : "")
        );

        return item;
    }

    function obterIdItem(nome) {
        const item = obterItem(nome);
        const id = item ? item.id : null;

        console.log(
            `🔨 [REGISTRY] ID de "${nome}" = ${id}`
        );

        return id;
    }

    function obterNomeItemPorId(id) {
        if (id === null || id === undefined) return null;

        const nome = bot.registry.items[id]?.name || null;

        console.log(
            `🔨 [REGISTRY] ID ${id} -> "${nome}"`
        );

        return nome;
    }

    // =========================================================
    // 🔍 BUSCA DE RECEITAS
    // =========================================================

    function procurarReceitas(nomeItem, quantidade = 1, mesaBlock = null) {
        console.log(
            `🔍 [RECEITA] Procurando receita:` +
            ` item="${nomeItem}"` +
            ` quantidade=${quantidade}` +
            ` mesa=${!!mesaBlock}`
        );

        const id = obterIdItem(nomeItem);

        if (id === null) {
            console.warn(
                `❌ [RECEITA] Item "${nomeItem}" não existe no registry.`
            );

            return [];
        }

        try {
            const receitas = bot.recipesFor(
                id,
                null,
                quantidade,
                mesaBlock
            );

            console.log(
                `🔍 [RECEITA] Resultado:` +
                ` item="${nomeItem}"` +
                ` id=${id}` +
                ` receitas=${receitas.length}`
            );

            if (receitas.length > 0) {
                receitas.forEach((receita, index) => {
                    console.log(
                        `🔍 [RECEITA ${index + 1}]` +
                        ` requiresTable=${!!receita.requiresTable}` +
                        ` result=${receita.result?.name || "?"}` +
                        ` resultCount=${receita.result?.count || "?"}`
                    );

                    if (Array.isArray(receita.delta)) {
                        console.log(
                            "🔍 [RECEITA] delta:",
                            receita.delta
                        );
                    }

                    if (Array.isArray(receita.ingredients)) {
                        console.log(
                            "🔍 [RECEITA] ingredients:",
                            receita.ingredients
                        );
                    }
                });
            } else {
                console.warn(
                    `⚠️ [RECEITA] Nenhuma receita encontrada para "${nomeItem}".`
                );
            }

            return receitas;
        } catch (erro) {
            console.error(
                `❌ [RECEITA] Erro em bot.recipesFor("${nomeItem}"):` ,
                erro
            );

            return [];
        }
    }

    function procurarReceita(nomeItem) {
        console.log(
            `🔍 [RECEITA ÚNICA] Procurando "${nomeItem}"`
        );

        return procurarReceitas(nomeItem, 1)[0] || null;
    }

    function obterReceitas(nomeItem) {
        console.log(
            `🔍 [OBTER RECEITAS] "${nomeItem}"`
        );

        const receitas = procurarReceitas(nomeItem, 1);

        console.log(
            `🔍 [OBTER RECEITAS] "${nomeItem}" -> ${receitas.length} receita(s)`
        );

        return receitas;
    }

    // =========================================================
    // 🧪 MATERIAIS DE UMA RECEITA
    // =========================================================

    function obterMateriais(receita) {
        if (!receita) {
            console.warn(
                "⚠️ [MATERIAIS] Receita inexistente."
            );
            return [];
        }

        const materiais = [];

        if (Array.isArray(receita.delta)) {
            console.log(
                "🧪 [MATERIAIS] Lendo receita.delta"
            );

            for (const item of receita.delta) {
                if (!item) continue;

                const count = Number(item.count || 0);

                if (count >= 0) continue;

                const material = {
                    id: item.id,
                    quantidade: Math.abs(count),
                    nome: obterNomeItemPorId(item.id)
                };

                materiais.push(material);

                console.log(
                    "🧪 [MATERIAL]",
                    material
                );
            }
        }

        if (!materiais.length && Array.isArray(receita.ingredients)) {
            console.log(
                "🧪 [MATERIAIS] Usando receita.ingredients"
            );

            for (const item of receita.ingredients) {
                if (!item?.id) continue;

                const material = {
                    id: item.id,
                    quantidade: Number(item.count || 1),
                    nome: obterNomeItemPorId(item.id)
                };

                materiais.push(material);

                console.log(
                    "🧪 [MATERIAL]",
                    material
                );
            }
        }

        console.log(
            `🧪 [MATERIAIS] Total encontrado: ${materiais.length}`
        );

        return materiais;
    }

    // =========================================================
    // ✅ VERIFICAÇÕES
    // =========================================================

    function podeCraftar(nomeItem, quantidade = 1) {
        quantidade = Math.max(
            1,
            Math.floor(Number(quantidade) || 1)
        );

        console.log(
            `✅ [PODE CRAFTAR] "${nomeItem}" x${quantidade}`
        );

        const receitas = procurarReceitas(
            nomeItem,
            quantidade
        );

        const resultado = receitas.length > 0;

        console.log(
            `✅ [PODE CRAFTAR] resultado=${resultado}`
        );

        return resultado;
    }

    function possuiMateriais(nomeItem, quantidade = 1) {
        quantidade = Math.max(
            1,
            Math.floor(Number(quantidade) || 1)
        );

        console.log(
            `📦 [MATERIAIS] Verificando estoque para "${nomeItem}" x${quantidade}`
        );

        const receitas = procurarReceitas(
            nomeItem,
            quantidade
        );

        if (!receitas.length) {
            console.warn(
                `⚠️ [MATERIAIS] Sem receita para "${nomeItem}".`
            );
            return false;
        }

        if (
            !inventario ||
            typeof inventario.contarItem !== "function"
        ) {
            console.warn(
                "⚠️ [MATERIAIS] Inventário indisponível. Assumindo true."
            );
            return true;
        }

        const receita = receitas[0];
        const materiais = obterMateriais(receita);

        if (!materiais.length) {
            console.warn(
                `⚠️ [MATERIAIS] Receita de "${nomeItem}" não possui materiais identificáveis.`
            );
            return true;
        }

        return materiais.every(material => {
            if (!material.nome) return true;

            const necessario =
                material.quantidade * quantidade;

            const possui =
                inventario.contarItem(material.nome);

            console.log(
                `📦 [ESTOQUE] ${material.nome}:` +
                ` possui=${possui}` +
                ` necessario=${necessario}`
            );

            return possui >= necessario;
        });
    }

    function possuiIngredientes(nomeItem, quantidade = 1) {
        return possuiMateriais(nomeItem, quantidade);
    }

    function obterQuantidadeCraftavel(nomeItem) {
        console.log(
            `📊 [CRAFTÁVEL] Calculando quantidade de "${nomeItem}"`
        );

        const receitas = procurarReceitas(nomeItem, 1);

        if (!receitas.length) {
            console.warn(
                `⚠️ [CRAFTÁVEL] Sem receita para "${nomeItem}".`
            );
            return 0;
        }

        if (
            !inventario ||
            typeof inventario.contarItem !== "function"
        ) {
            console.warn(
                "⚠️ [CRAFTÁVEL] Inventário indisponível."
            );
            return 0;
        }

        const receita = receitas[0];
        const materiais = obterMateriais(receita);

        if (!materiais.length) return 0;

        const qtdPorCraft =
            Number(receita.result?.count || 1) || 1;

        let minCrafts = Infinity;

        for (const material of materiais) {
            if (!material.nome) continue;

            const tem =
                inventario.contarItem(material.nome);

            const custo = material.quantidade;

            if (custo <= 0) continue;

            const craftsPossiveis =
                Math.floor(tem / custo);

            console.log(
                `📊 [CRAFTÁVEL] ${material.nome}:` +
                ` estoque=${tem}` +
                ` custo=${custo}` +
                ` crafts=${craftsPossiveis}`
            );

            if (craftsPossiveis < minCrafts) {
                minCrafts = craftsPossiveis;
            }
        }

        if (!Number.isFinite(minCrafts) || minCrafts < 0) {
            return 0;
        }

        const resultado =
            minCrafts * qtdPorCraft;

        console.log(
            `📊 [CRAFTÁVEL] "${nomeItem}" -> ${resultado}`
        );

        return resultado;
    }

    function precisaMesaCrafting(nomeItem) {
        console.log(
            `🪑 [MESA] Verificando necessidade de mesa para "${nomeItem}"`
        );

        const receitas = procurarReceitas(nomeItem, 1);

        if (!receitas.length) {
            console.warn(
                `⚠️ [MESA] Sem receita para "${nomeItem}".`
            );
            return false;
        }

        const precisa = !!receitas[0].requiresTable;

        console.log(
            `🪑 [MESA] "${nomeItem}" requiresTable=${precisa}`
        );

        return precisa;
    }

    // =========================================================
    // 🪑 MESA DE CRAFTING
    // =========================================================

    function encontrarMesaCrafting(distancia = 6) {
        console.log(
            `🪑 [MESA] Procurando crafting_table até ${distancia} blocos.`
        );

        if (!bot.entity?.position) {
            console.warn(
                "⚠️ [MESA] Posição do bot indisponível."
            );
            return null;
        }

        const idMesa =
            bot.registry.blocksByName.crafting_table?.id;

        if (idMesa === undefined || idMesa === null) {
            console.warn(
                "❌ [MESA] crafting_table não existe no registry."
            );
            return null;
        }

        const blocos = bot.findBlocks({
            matching: idMesa,
            maxDistance: distancia,
            count: 1
        });

        if (!Array.isArray(blocos) || !blocos.length) {
            console.log(
                "🪑 [MESA] Nenhuma crafting_table encontrada."
            );
            return null;
        }

        const posicao = blocos[0];

        const resultado = {
            x: posicao.x,
            y: posicao.y,
            z: posicao.z,
            distancia: bot.entity.position.distanceTo(posicao)
        };

        console.log(
            "🪑 [MESA] Encontrada:",
            resultado
        );

        return resultado;
    }

    function obterBlocoMesa(mesa) {
        console.log(
            "🪑 [MESA] Obtendo Block:",
            mesa
        );

        if (!mesa || !bot.blockAt) {
            console.warn(
                "⚠️ [MESA] Dados da mesa ou bot.blockAt indisponíveis."
            );
            return null;
        }

        try {
            const bloco = bot.blockAt(
                new Vec3(
                    mesa.x,
                    mesa.y,
                    mesa.z
                )
            );

            console.log(
                `🪑 [MESA] Block encontrado=${!!bloco}`,
                bloco?.name || ""
            );

            return bloco;
        } catch (erro) {
            console.error(
                "❌ [MESA] Erro ao obter Block:",
                erro
            );

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

        console.log(
            `🚀 [CRAFT] INICIANDO "${nomeItem}" x${quantidade}`
        );

        let feitos = 0;
        let ultimoErro = null;

        while (feitos < quantidade) {
            console.log(
                `🔨 [CRAFT] Tentativa ${feitos + 1}/${quantidade}`
            );

            const receitas =
                procurarReceitas(nomeItem, 1);

            if (!receitas.length) {
                ultimoErro =
                    `Sem receita disponível para ${nomeItem}`;

                console.error(
                    `❌ [CRAFT] ${ultimoErro}`
                );

                break;
            }

            const receita = receitas[0];

            console.log(
                `🔨 [CRAFT] Receita selecionada para "${nomeItem}"`,
                {
                    requiresTable: !!receita.requiresTable,
                    result: receita.result,
                    delta: receita.delta,
                    ingredients: receita.ingredients
                }
            );

            let mesaBlock = null;

            if (receita.requiresTable) {
                console.log(
                    `🪑 [CRAFT] "${nomeItem}" exige mesa.`
                );

                const mesa =
                    encontrarMesaCrafting();

                if (!mesa) {
                    ultimoErro =
                        `Receita exige mesa, mas nenhuma foi encontrada (${nomeItem})`;

                    console.error(
                        `❌ [CRAFT] ${ultimoErro}`
                    );

                    break;
                }

                mesaBlock =
                    obterBlocoMesa(mesa);

                if (!mesaBlock) {
                    ultimoErro =
                        "Não foi possível resolver o bloco da mesa";

                    console.error(
                        `❌ [CRAFT] ${ultimoErro}`
                    );

                    break;
                }
            }

            try {
                console.log(
                    `🔨 [CRAFT] Executando bot.craft()` +
                    ` item="${nomeItem}"` +
                    ` mesa=${!!mesaBlock}`
                );

                await bot.craft(
                    receita,
                    1,
                    mesaBlock
                );

                feitos++;

                console.log(
                    `✅ [CRAFT] Sucesso: "${nomeItem}"` +
                    ` feito=${feitos}/${quantidade}`
                );

            } catch (erro) {
                ultimoErro =
                    erro.message || String(erro);

                console.error(
                    `❌ [CRAFT] bot.craft() falhou para "${nomeItem}":`,
                    erro
                );

                break;
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

        console.log(
            `🏁 [CRAFT] FINALIZADO "${nomeItem}"`,
            resultado
        );

        return resultado;
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterEstado() {
        return {
            disponivel: true,
            mesaCraftingProxima:
                encontrarMesaCrafting()
        };
    }

    return {
        procurarReceita,
        procurarReceitas,
        obterMateriais,
        podeCraftar,
        obterReceitas,
        obterQuantidadeCraftavel,
        possuiMateriais,
        possuiIngredientes,
        precisaMesaCrafting,
        encontrarMesaCrafting,
        craftar,
        obterEstado
    };
}

module.exports = {
    criarCrafting
};