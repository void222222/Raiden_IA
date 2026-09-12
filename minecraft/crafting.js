function criarCrafting(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    function obterItem(nome) {
        if (!nome) {
            return null;
        }

        return (
            bot.registry.itemsByName[nome] ||
            null
        );
    }

    function obterIdItem(nome) {
        const item = obterItem(nome);

        return item ? item.id : null;
    }

    function procurarReceitas(
        nomeItem,
        quantidade = 1
    ) {
        const id = obterIdItem(nomeItem);

        if (id === null) {
            return [];
        }

        try {
            return bot.recipesFor(
                id,
                null,
                quantidade,
                null
            );
        } catch (erro) {
            console.error(
                "🔨 Erro ao procurar receita:",
                erro.message
            );

            return [];
        }
    }

    function procurarReceita(
        nomeItem
    ) {
        return (
            procurarReceitas(
                nomeItem,
                1
            )[0] || null
        );
    }

    function obterMateriais(
        receita
    ) {
        if (!receita) {
            return [];
        }

        const materiais = [];

        if (
            Array.isArray(
                receita.delta
            )
        ) {
            for (const item of receita.delta) {
                if (!item) {
                    continue;
                }

                materiais.push({
                    id: item.id,
                    quantidade:
                        Math.abs(
                            item.count || 0
                        ),
                    nome:
                        bot.registry
                            .items[
                                item.id
                            ]?.name || null
                });
            }
        }

        return materiais;
    }

    function podeCraftar(
        nomeItem,
        quantidade = 1
    ) {
        quantidade = Math.max(
            1,
            Math.floor(
                Number(quantidade) || 1
            )
        );

        return (
            procurarReceitas(
                nomeItem,
                quantidade
            ).length > 0
        );
    }

    function obterReceitas(
        nomeItem
    ) {
        return procurarReceitas(
            nomeItem,
            1
        );
    }

    function obterQuantidadeCraftavel(
        nomeItem
    ) {
        const receitas =
            procurarReceitas(
                nomeItem,
                1
            );

        if (!receitas.length) {
            return 0;
        }

        const receita = receitas[0];

        if (
            typeof receita.getShape !==
            "function"
        ) {
            return 1;
        }

        return 1;
    }

    async function craftar(
        nomeItem,
        quantidade = 1
    ) {
        quantidade = Math.max(
            1,
            Math.floor(
                Number(quantidade) || 1
            )
        );

        const receitas =
            procurarReceitas(
                nomeItem,
                quantidade
            );

        if (!receitas.length) {
            return false;
        }

        const receita = receitas[0];

        try {
            await bot.craft(
                receita,
                quantidade,
                null
            );

            return true;

        } catch (erro) {
            console.error(
                "🔨 Erro ao craftar:",
                erro.message
            );

            return false;
        }
    }

    function possuiMateriais(
        nomeItem,
        quantidade = 1
    ) {
        const receitas =
            procurarReceitas(
                nomeItem,
                quantidade
            );

        if (!receitas.length) {
            return false;
        }

        if (
            !inventario ||
            typeof inventario.contarItem !==
                "function"
        ) {
            return true;
        }

        const receita = receitas[0];
        const materiais =
            obterMateriais(receita);

        if (!materiais.length) {
            return true;
        }

        return materiais.every(
            material => {
                if (!material.nome) {
                    return true;
                }

                return (
                    inventario.contarItem(
                        material.nome
                    ) >=
                    material.quantidade
                );
            }
        );
    }

    function precisaMesaCrafting(
        nomeItem
    ) {
        const receitas =
            procurarReceitas(
                nomeItem,
                1
            );

        if (!receitas.length) {
            return false;
        }

        const receita = receitas[0];

        return !!receita.requiresTable;
    }

    function obterEstado() {
        return {
            disponivel: true,
            mesaCraftingProxima:
                encontrarMesaCrafting()
        };
    }

    function encontrarMesaCrafting(
        distancia = 6
    ) {
        if (!bot.entity?.position) {
            return null;
        }

        const blocos =
            bot.findBlocks({
                matching:
                    bot.registry
                        .blocksByName
                        .crafting_table?.id,
                maxDistance: distancia,
                count: 1
            });

        if (
            !Array.isArray(blocos) ||
            !blocos.length
        ) {
            return null;
        }

        const posicao = blocos[0];

        return {
            x: posicao.x,
            y: posicao.y,
            z: posicao.z,
            distancia:
                bot.entity.position.distanceTo(
                    posicao
                )
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
        precisaMesaCrafting,
        encontrarMesaCrafting,
        craftar,
        obterEstado
    };
}

module.exports = {
    criarCrafting
};