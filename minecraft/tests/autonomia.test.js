const test = require("node:test");
const assert = require("node:assert/strict");

const { criarAutonomia } = require("../autonomia");

function criarContextoTeste(opcoes = {}) {
    const inventario = {
        itens: { ...(opcoes.itens || {}) },

        contarItem(nome) {
            return this.itens[nome] || 0;
        }
    };

    const eventos = [];
    const acoes = [];

    const receitas = {
        oak_planks: [{
            result: { id: 36, count: 4 },
            delta: [
                { id: 134, count: -1 },
                { id: 36, count: 4 }
            ],
            ingredients: [
                { id: 134, count: -1 }
            ],
            requiresTable: false
        }]
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
                oak_log: { id: 134, name: "oak_log" },
                oak_planks: { id: 36, name: "oak_planks" },
                stone: { id: 1, name: "stone" },
                crafting_table: { id: 320, name: "crafting_table" }
            },

            items: {
                134: { id: 134, name: "oak_log" },
                36: { id: 36, name: "oak_planks" },
                1: { id: 1, name: "stone" },
                320: { id: 320, name: "crafting_table" }
            },

            blocksByName: {
                oak_log: { id: 134, name: "oak_log" },
                stone: { id: 1, name: "stone" },
                crafting_table: { id: 320, name: "crafting_table" }
            }
        }
    };

    const percepcao = {
        perigo: opcoes.perigo || false,

        obterPerigos() {
            return this.perigo
                ? [{
                    posicao: {
                        x: 1,
                        y: 64,
                        z: 1
                    }
                }]
                : [];
        },

        obterEntidadesProximas() {
            return opcoes.entidades || [];
        }
    };

    const mundo = {
        encontrarBlocos(nome, raio, quantidade) {
            if (opcoes.blocos && opcoes.blocos[nome]) {
                return opcoes.blocos[nome];
            }

            return [];
        }
    };

    const navegacao = {
        navegando: false,
        parou: false,
        destinos: [],

        irParaBloco(x, y, z, distancia) {
            this.destinos.push({ x, y, z, distancia });
            this.navegando = true;
            return true;
        },

        estaNavegando() {
            return this.navegando;
        },

        parar() {
            this.navegando = false;
            this.parou = true;
        }
    };

    const crafting = {
        obterReceitas(nomeItem) {
            return receitas[nomeItem] || [];
        },

        obterMateriais(receita) {
            if (!receita || !Array.isArray(receita.delta)) {
                return [];
            }

            return receita.delta
                .filter(item => Number(item.count || 0) < 0)
                .map(item => ({
                    id: item.id,
                    quantidade: Math.abs(Number(item.count)),
                    nome: bot.registry.items[item.id]?.name || null
                }));
        },

        async craftar(nomeItem, quantidade) {
            acoes.push({
                nome: "craftar",
                parametros: {
                    nome: nomeItem,
                    quantidade
                }
            });

            if (opcoes.falharCraft) {
                return {
                    sucesso: false,
                    erro: "falha_mock_craft"
                };
            }

            return {
                sucesso: true,
                feitos: quantidade
            };
        }
    };

    const construir = {
        async construir() {
            acoes.push({
                nome: "construir"
            });

            return {
                sucesso: true
            };
        }
    };

    const executarAcaoPublica = async (nome, parametros) => {
        acoes.push({
            nome,
            parametros
        });

        if (opcoes.falharAcao === nome) {
            return {
                sucesso: false,
                erro: `falha_mock_${nome}`
            };
        }

        if (nome === "craftar") {
            return {
                sucesso: true,
                feitos: parametros.quantidade
            };
        }

        if (nome === "construir") {
            return {
                sucesso: true
            };
        }

        if (nome === "atacar") {
            return {
                sucesso: true
            };
        }

        if (nome === "obter_bloco") {
            return {
                sucesso: true
            };
        }

        return {
            sucesso: true
        };
    };

    const contexto = {
        bot,
        inventario,
        percepcao,
        mundo,
        navegacao,
        crafting,
        construir,
        executarAcaoPublica,

        enviarEvento(evento, dados) {
            eventos.push({
                evento,
                dados
            });
        }
    };

    return {
        contexto,
        inventario,
        eventos,
        acoes,
        navegacao,
        bot
    };
}

function aguardarDecisaoInicial() {
    return new Promise(resolve => setImmediate(resolve));
}


// ============================================================
// 1. PLANEJAMENTO
// ============================================================

test("autonomia: deve criar plano oak_log -> oak_planks", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    const resultado = autonomia.definirMeta({
        id: "abrigo",
        nome: "Construir abrigo",
        descricao: "Teste",
        itens_necessarios: {
            oak_planks: 100
        },
        construir: null
    });

    assert.equal(resultado, true);

    const estado = autonomia.obterEstado();

    assert.equal(estado.planoAtual.length, 2);

    assert.deepEqual(estado.planoAtual[0], {
        tipo: "obter_bloco",
        bloco: "oak_log",
        quantidade: 25
    });

    assert.deepEqual(estado.planoAtual[1], {
        tipo: "craftar_item",
        item: "oak_planks",
        quantidade: 100,
        crafts: 25
    });
});


// ============================================================
// 2. INVENTÁRIO
// ============================================================

test("autonomia: deve reduzir o plano quando já possui oak_log", () => {
    const { contexto } = criarContextoTeste({
        itens: {
            oak_log: 25
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "teste",
        nome: "Teste",
        itens_necessarios: {
            oak_planks: 100
        }
    });

    const estado = autonomia.obterEstado();

    const obterLogs = estado.planoAtual.find(
        tarefa => tarefa.tipo === "obter_bloco"
    );

    assert.equal(obterLogs, undefined);
});


// ============================================================
// 3. ITEM DESCONHECIDO
// ============================================================

test("autonomia: deve criar fallback para item desconhecido", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "teste",
        nome: "Teste",
        itens_necessarios: {
            pedra_magica_inexistente: 1
        }
    });

    const estado = autonomia.obterEstado();

    assert.ok(Array.isArray(estado.planoAtual));
});


// ============================================================
// 4. DEFINIR OBJETIVO — COMPATIBILIDADE
// ============================================================

test("autonomia: definirObjetivo deve continuar funcionando", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    const resultado = autonomia.definirObjetivo({
        id: "compatibilidade",
        nome: "Teste compatibilidade",
        itens_necessarios: {}
    });

    assert.equal(resultado, true);

    const estado = autonomia.obterEstado();

    assert.equal(
        estado.metaAtual.id,
        "compatibilidade"
    );
});


// ============================================================
// 5. EXECUÇÃO DE CRAFT
// ============================================================

test("autonomia: deve executar tarefa de craft", async () => {
    const { contexto, acoes } = criarContextoTeste({
        itens: {
            oak_log: 1
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "craft",
        nome: "Craft",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    // O primeiro ciclo reconhece que já temos oak_log
    assert.equal(
        autonomia.obterEstado().indiceTarefa,
        1
    );

    // Agora o segundo ciclo deve executar o craft
    await autonomia.decidir();

    autonomia.parar("teste");

    const craft = acoes.find(
        acao => acao.nome === "craftar"
    );

    assert.ok(craft);
    assert.equal(craft.parametros.nome, "oak_planks");
    assert.equal(craft.parametros.quantidade, 4);
});


// ============================================================
// 6. AÇÃO COM SUCESSO DEVE AVANÇAR
// ============================================================

test("autonomia: tarefa concluída deve avançar índice", async () => {
    const { contexto } = criarContextoTeste({
        itens: {
            oak_log: 1
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "avanco",
        nome: "Avanço",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    assert.equal(
        autonomia.obterEstado().indiceTarefa,
        1
    );

    autonomia.parar("teste");
});


// ============================================================
// 7. META CONCLUÍDA
// ============================================================

test("autonomia: deve reconhecer objetivo concluído", async () => {
    const { contexto } = criarContextoTeste({
        itens: {
            oak_planks: 4
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "conclusao",
        nome: "Conclusão",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    const estado = autonomia.obterEstado();

    assert.equal(
        estado.estado,
        "objetivo_concluido"
    );

    autonomia.parar("teste");
});


// ============================================================
// 8. FALHA DE AÇÃO
// ============================================================

test("autonomia: deve registrar falha de ação", async () => {
    const { contexto, acoes } = criarContextoTeste({
        itens: {
            oak_log: 1
        },
        falharAcao: "craftar"
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "falha",
        nome: "Falha",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    const estado = autonomia.obterEstado();

    // A tarefa falhou, então o índice NÃO deve avançar.
    assert.equal(
        estado.indiceTarefa,
        0
    );

    assert.equal(
        acoes.filter(acao => acao.nome === "craftar").length,
        1
    );

    assert.equal(
        estado.falhasNaTarefaAtual,
        1
    );

    assert.ok(
        estado.ultimaAcaoFalha
    );

    autonomia.parar("teste");
});


// ============================================================
// 9. NÃO REPETIR AÇÃO IMEDIATAMENTE APÓS FALHA
// ============================================================

test("autonomia: deve bloquear repetição imediata após falha", async () => {
    const { contexto, acoes } = criarContextoTeste({
        itens: {
            oak_log: 1
        },
        falharAcao: "craftar"
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "bloqueio",
        nome: "Bloqueio",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    await autonomia.decidir();

    const quantidadeAntes = acoes.filter(
        acao => acao.nome === "craftar"
    ).length;

    await autonomia.decidir();

    const quantidadeDepois = acoes.filter(
        acao => acao.nome === "craftar"
    ).length;

    autonomia.parar("teste");

    assert.equal(quantidadeAntes, 1);
    assert.equal(quantidadeDepois, 1);
});


// ============================================================
// 10. ESTADO PÚBLICO
// ============================================================

test("autonomia: estado deve expor tarefa atual", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "estado",
        nome: "Estado",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    const estado = autonomia.obterEstado();

    assert.ok(estado.metaAtual);
    assert.ok(Array.isArray(estado.planoAtual));
    assert.ok(estado.tarefaAtual);
    assert.equal(
        estado.totalTarefas,
        estado.planoAtual.length
    );
});


// ============================================================
// 11. INICIAR
// ============================================================

test("autonomia: iniciar deve ativar autonomia", async () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "iniciar",
        nome: "Iniciar",
        itens_necessarios: {}
    });

    const resultado = autonomia.iniciar();

    assert.equal(resultado, true);
    assert.equal(autonomia.estaAtiva(), true);

    autonomia.parar("teste");
});


// ============================================================
// 12. PARAR
// ============================================================

test("autonomia: parar deve desativar autonomia", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.iniciar();

    const resultado = autonomia.parar("teste");

    assert.equal(resultado, true);
    assert.equal(autonomia.estaAtiva(), false);
});


// ============================================================
// 13. REINICIAR
// ============================================================

test("autonomia: reiniciar deve reativar com plano novo", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "reiniciar",
        nome: "Reiniciar",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    const resultado = autonomia.reiniciar();

    assert.equal(resultado, true);
    assert.equal(autonomia.estaAtiva(), true);

    const estado = autonomia.obterEstado();

    assert.ok(
        Array.isArray(estado.planoAtual)
    );

    autonomia.parar("teste");
});


// ============================================================
// 14. EVENTOS
// ============================================================

test("autonomia: deve emitir eventos durante execução", async () => {
    const { contexto, eventos } = criarContextoTeste({
        blocos: {
            oak_log: [
                {
                    posicao: {
                        x: 1,
                        y: 64,
                        z: 1
                    }
                }
            ]
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "eventos",
        nome: "Eventos",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    autonomia.parar("teste");

    const acao = eventos.find(
        evento => evento.evento === "minecraft_autonomia_acao"
    );

    assert.ok(acao);
    assert.equal(acao.dados.acao, "quebrar");
});


// ============================================================
// 15. PERIGO
// ============================================================

test("autonomia: perigo deve impedir execução normal", async () => {
    const { contexto, acoes } = criarContextoTeste({
        perigo: true
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "perigo",
        nome: "Perigo",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    const estado = autonomia.obterEstado();

    assert.equal(
        estado.estado,
        "perigo"
    );

    assert.equal(
        acoes.filter(
            acao => acao.nome === "craftar"
        ).length,
        0
    );

    autonomia.parar("teste");
});


// ============================================================
// 16. POSIÇÃO DO BOT
// ============================================================

test("autonomia: deve manter posição válida no estado", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "posicao",
        nome: "Posição",
        itens_necessarios: {}
    });

    const estado = autonomia.obterEstado();

    assert.ok(
        contexto.bot.entity.position
    );

    assert.equal(
        typeof contexto.bot.entity.position.x,
        "number"
    );
});


// ============================================================
// 17. NAVEGAÇÃO
// ============================================================

test("autonomia: deve possuir sistema de navegação disponível", () => {
    const { contexto, navegacao } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    assert.equal(
        typeof navegacao.irParaBloco,
        "function"
    );

    assert.equal(
        typeof navegacao.estaNavegando,
        "function"
    );

    assert.equal(
        typeof navegacao.parar,
        "function"
    );

    autonomia.parar("teste");
});


// ============================================================
// 18. PLANO VAZIO
// ============================================================

test("autonomia: meta sem itens deve gerar plano vazio ou concluível", () => {
    const { contexto } = criarContextoTeste();

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "vazio",
        nome: "Meta vazia",
        itens_necessarios: {}
    });

    const estado = autonomia.obterEstado();

    assert.ok(
        Array.isArray(estado.planoAtual)
    );
});


// ============================================================
// 19. RECURSOS NO ESTADO
// ============================================================

test("autonomia: deve expor recursos no estado", () => {
    const { contexto } = criarContextoTeste({
        itens: {
            oak_log: 10,
            oak_planks: 20
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "recursos",
        nome: "Recursos",
        itens_necessarios: {}
    });

    const estado = autonomia.obterEstado();

    assert.equal(
        estado.recursos.madeira,
        10
    );

    assert.equal(
        estado.recursos.tabuas,
        20
    );
});


// ============================================================
// 20. TESTE FINAL — FLUXO COMPLETO
// ============================================================

test("autonomia: fluxo completo de planejamento até conclusão", async () => {
    const { contexto, acoes } = criarContextoTeste({
        blocos: {
            oak_log: [
                {
                    posicao: {
                        x: 1,
                        y: 64,
                        z: 1
                    }
                }
            ]
        }
    });

    const autonomia = criarAutonomia(contexto);

    autonomia.definirMeta({
        id: "fluxo_completo",
        nome: "Abrigo completo",
        descricao: "Teste completo",
        itens_necessarios: {
            oak_planks: 4
        }
    });

    autonomia.iniciar();

    await aguardarDecisaoInicial();

    // ==========================================
    // ETAPA 1 — COLETAR OAK LOG
    // ==========================================

    assert.ok(
        acoes.some(acao => acao.nome === "quebrar")
    );

    // Simula o oak_log entrando no inventário.
    contexto.inventario.itens.oak_log = 1;

    // A autonomia precisa de um novo ciclo para
    // reconhecer que a coleta terminou.
    await autonomia.decidir();

    assert.equal(
        autonomia.obterEstado().indiceTarefa,
        1
    );

    // ==========================================
    // ETAPA 2 — CRAFTAR OAK PLANKS
    // ==========================================

    await autonomia.decidir();

    assert.ok(
        acoes.some(acao => acao.nome === "craftar")
    );

    assert.equal(
        autonomia.obterEstado().indiceTarefa,
        2
    );

    // Simula o resultado do craft.
    contexto.inventario.itens.oak_planks = 4;

    // ==========================================
    // ETAPA 3 — CONCLUIR OBJETIVO
    // ==========================================

    await autonomia.decidir();

    const estado = autonomia.obterEstado();

    assert.equal(
        estado.estado,
        "objetivo_concluido"
    );

    assert.equal(
        estado.indiceTarefa,
        2
    );

    console.log("\n=== BATERIA AUTONOMIA ===");

    console.log("Estado final:", {
        estado: estado.estado,
        motivo: estado.motivo,
        indice: estado.indiceTarefa,
        total: estado.totalTarefas
    });

    autonomia.parar("teste");
});