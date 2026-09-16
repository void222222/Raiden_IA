const test = require("node:test");
const assert = require("node:assert/strict");

const { criarAutonomia } = require("../autonomia");

function criarContextoTeste() {
    const oakLog = {
        id: 134,
        name: "oak_log"
    };

    const oakPlanks = {
        id: 36,
        name: "oak_planks"
    };

    const receita = {
        result: {
            id: oakPlanks.id,
            count: 4
        },

        delta: [
            {
                id: oakLog.id,
                count: -1
            },
            {
                id: oakPlanks.id,
                count: 4
            }
        ],

        requiresTable: false
    };

    const bot = {
        entity: {
            position: {
                x: 0,
                y: 64,
                z: 0
            }
        },

        registry: {
            itemsByName: {
                oak_log: oakLog,
                oak_planks: oakPlanks
            },

            items: {
                [oakLog.id]: oakLog,
                [oakPlanks.id]: oakPlanks
            },

            blocksByName: {
                oak_log: {
                    id: 100
                },

                oak_planks: {
                    id: 101
                }
            }
        }
    };

    const inventario = {
        contarItem(nome) {
            return 0;
        }
    };

    const crafting = {
        obterReceitas(nome) {
            if (nome === "oak_planks") {
                return [receita];
            }

            return [];
        },

        obterMateriais() {
            return [
                {
                    id: oakLog.id,
                    nome: "oak_log",
                    quantidade: 1
                }
            ];
        }
    };

    return {
        bot,
        inventario,
        crafting
    };
}


test("autonomia.js: deve expandir oak_planks através da receita", () => {
    const contexto = criarContextoTeste();
    const autonomia = criarAutonomia(contexto);

    const sucesso = autonomia.definirMeta({
        id: "teste_oak_planks",
        nome: "Teste de tábuas",
        descricao: "Teste do planejador",

        itens_necessarios: {
            oak_planks: 100
        }
    });

    assert.equal(sucesso, true);

    const estado = autonomia.obterEstado();

    console.log("\n=== TESTE AUTONOMIA ===");
    console.log("Plano gerado:");
    console.log(JSON.stringify(estado.planoAtual, null, 2));

    assert.equal(estado.planoAtual.length, 2);

    assert.deepEqual(
        estado.planoAtual[0],
        {
            tipo: "obter_bloco",
            bloco: "oak_log",
            quantidade: 25
        }
    );

    assert.deepEqual(
        estado.planoAtual[1],
        {
            tipo: "craftar_item",
            item: "oak_planks",
            quantidade: 100,
            crafts: 25
        }
    );
});