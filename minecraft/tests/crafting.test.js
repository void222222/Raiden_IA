const test = require("node:test");
const assert = require("node:assert/strict");

const { criarCrafting } = require("../crafting");

function criarContextoTeste() {
    const oakLog = { id: 134, name: "oak_log" };
    const oakPlanks = { id: 36, name: "oak_planks" };

    const receita = {
        result: {
            id: oakPlanks.id,
            count: 4
        },
        ingredients: [
            {
                id: oakLog.id,
                count: -1
            }
        ],
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
        registry: {
            itemsByName: {
                oak_log: oakLog,
                oak_planks: oakPlanks
            },
            items: {
                [oakLog.id]: oakLog,
                [oakPlanks.id]: oakPlanks
            },
            blocksByName: {}
        },

        recipesFor() {
            return [];
        },

        recipesAll() {
            return [receita];
        }
    };

    const inventario = {
        contarItem(nome) {
            if (nome === "oak_log") return 10;
            return 0;
        }
    };

    return {
        bot,
        inventario
    };
}

test("crafting.js: deve reconhecer receita de oak_planks", () => {
    const contexto = criarContextoTeste();
    const crafting = criarCrafting(contexto);

    const receitas = crafting.obterReceitas("oak_planks");

    console.log("\n=== TESTE 1 ===");
    console.log("Receitas encontradas:", receitas.length);

    assert.equal(
        receitas.length,
        1,
        "Deveria encontrar a receita de oak_planks"
    );
});

test("crafting.js: deve identificar oak_log como material necessário", () => {
    const contexto = criarContextoTeste();
    const crafting = criarCrafting(contexto);

    const receita = crafting.procurarReceita("oak_planks");
    const materiais = crafting.obterMateriais(receita);

    console.log("\n=== TESTE 2 ===");
    console.log("Materiais:", materiais);

    assert.equal(materiais.length, 1);
    assert.equal(materiais[0].nome, "oak_log");
    assert.equal(materiais[0].quantidade, 1);
});

test("crafting.js: deve calcular quantidade de oak_planks craftável", () => {
    const contexto = criarContextoTeste();
    const crafting = criarCrafting(contexto);

    const quantidade = crafting.obterQuantidadeCraftavel("oak_planks");

    console.log("\n=== TESTE 3 ===");
    console.log("Oak logs disponíveis: 10");
    console.log("Oak planks craftáveis:", quantidade);

    assert.equal(
        quantidade,
        40,
        "10 oak_logs deveriam produzir 40 oak_planks"
    );
});

test("crafting.js: deve executar 25 crafts de oak_planks", async () => {
    const contexto = criarContextoTeste();

    let craftsExecutados = 0;

    contexto.bot.craft = async (receita, quantidade, mesa) => {
        assert.equal(receita.result.id, 36);
        assert.equal(quantidade, 1);
        assert.equal(mesa, null);

        craftsExecutados++;
    };

    const crafting = criarCrafting(contexto);

    const resultado = await crafting.craftar("oak_planks", 25);

    console.log("\n=== TESTE 4 ===");
    console.log("Crafts executados:", craftsExecutados);
    console.log("Resultado:", resultado);

    assert.equal(
        craftsExecutados,
        25,
        "Deveria executar exatamente 25 crafts"
    );

    assert.equal(resultado.sucesso, true);
    assert.equal(resultado.feitos, 25);
    assert.equal(resultado.faltou, 0);
});