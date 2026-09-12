function criarInventario(contexto) {
    const bot = contexto.bot;

    function serializarItem(item) {
        if (!item) {
            return null;
        }

        return {
            slot: item.slot,
            nome: item.name,
            displayName: item.displayName,
            tipo: item.type,
            quantidade: item.count,
            stackable: item.stackSize,
            durabilidade: item.durabilityUsed ?? null,
            maxDurabilidade: item.maxDurability ?? null,
            nbt: item.nbt ?? null
        };
    }

    function obterItens() {
        return bot.inventory.items().map(serializarItem);
    }

    function procurarItem(nome) {
        if (!nome) {
            return null;
        }

        const nomeNormalizado = String(nome).toLowerCase();

        const item = bot.inventory
            .items()
            .find(itemAtual => {
                return (
                    itemAtual.name?.toLowerCase() ===
                        nomeNormalizado ||
                    itemAtual.displayName?.toLowerCase() ===
                        nomeNormalizado
                );
            });

        return item || null;
    }

    function procurarItens(nome) {
        if (!nome) {
            return [];
        }

        const nomeNormalizado = String(nome).toLowerCase();

        return bot.inventory
            .items()
            .filter(item => {
                return (
                    item.name?.toLowerCase() ===
                        nomeNormalizado ||
                    item.displayName?.toLowerCase() ===
                        nomeNormalizado
                );
            });
    }

    function contarItem(nome) {
        return procurarItens(nome)
            .reduce(
                (total, item) =>
                    total + (item.count || 0),
                0
            );
    }

    function possuiItem(nome, quantidade = 1) {
        return contarItem(nome) >= quantidade;
    }

    function obterItemNaMao() {
        return serializarItem(
            bot.heldItem
        );
    }

    function obterSlotOffHand() {
        if (
            typeof bot.getEquipmentDestSlot ===
            "function"
        ) {
            try {
                return bot.getEquipmentDestSlot(
                    "off-hand"
                );
            } catch (_) {
                return null;
            }
        }

        return null;
    }

    function obterItemOffHand() {
        const slotOffHand =
            obterSlotOffHand();

        if (slotOffHand === null) {
            return null;
        }

        const item = bot.inventory
            .slots[slotOffHand];

        return serializarItem(item);
    }

    function obterEquipamentos() {
        return {
            mao: obterItemNaMao(),
            offHand: obterItemOffHand()
        };
    }

    async function equipar(
        nome,
        destino = "hand"
    ) {
        const item = procurarItem(nome);

        if (!item) {
            return false;
        }

        if (
            destino !== "hand" &&
            destino !== "off-hand"
        ) {
            return false;
        }

        try {
            await bot.equip(
                item,
                destino
            );

            return true;
        } catch (erro) {
            console.error(
                "🎒 Erro ao equipar:",
                erro.message
            );

            return false;
        }
    }

    async function desequipar(
        destino = "hand"
    ) {
        if (
            destino !== "hand" &&
            destino !== "off-hand"
        ) {
            return false;
        }

        try {
            await bot.unequip(destino);
            return true;
        } catch (erro) {
            console.error(
                "🎒 Erro ao desequipar:",
                erro.message
            );

            return false;
        }
    }

    async function dropar(
        nome,
        quantidade = null
    ) {
        const itens = procurarItens(nome);

        if (!itens.length) {
            return false;
        }

        let restante =
            quantidade === null
                ? null
                : Math.max(
                    1,
                    Math.floor(
                        Number(quantidade)
                    )
                );

        try {
            for (const item of itens) {
                if (
                    restante !== null &&
                    restante <= 0
                ) {
                    break;
                }

                if (
                    restante === null
                ) {
                    await bot.tossStack(item);
                    continue;
                }

                const quantidadeDoItem =
                    Math.min(
                        item.count,
                        restante
                    );

                await bot.toss(
                    item.type,
                    item.metadata ?? null,
                    quantidadeDoItem
                );

                restante -=
                    quantidadeDoItem;
            }

            return (
                restante === null ||
                restante <= 0
            );
        } catch (erro) {
            console.error(
                "🎒 Erro ao dropar:",
                erro.message
            );

            return false;
        }
    }

    function obterSlotsLivres() {
        const slots = [];

        for (
            let i = 0;
            i < bot.inventory.slots.length;
            i++
        ) {
            if (
                bot.inventory.slots[i] ===
                null
            ) {
                slots.push(i);
            }
        }

        return slots;
    }

    function obterEstado() {
        return {
            itens: obterItens(),
            equipamentos:
                obterEquipamentos(),
            slotsLivres:
                obterSlotsLivres().length,
            possuiItens:
                bot.inventory.items().length >
                0
        };
    }

    return {
        obterItens,
        procurarItem,
        procurarItens,
        contarItem,
        possuiItem,
        obterItemNaMao,
        obterItemOffHand,
        obterEquipamentos,
        equipar,
        desequipar,
        dropar,
        obterSlotsLivres,
        obterEstado
    };
}

module.exports = {
    criarInventario
};