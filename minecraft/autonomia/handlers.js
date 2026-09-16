/**
 * 🔨 HANDLERS — AUTONOMIA
 *
 * Cada handler recebe uma tarefa + contexto e retorna
 * um RESULTADO padronizado:
 *
 *   { concluida, emProgresso, erro }
 *
 * Contrato:
 *   - concluida: true   → tarefa terminou com sucesso
 *   - emProgresso: true → ainda rodando, NÃO conta falha
 *   - erro: string      → falha real, conta para replanejamento
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO:
 *
 * 1. obterBloco:
 *    - ANTES de minerar, olha se já tem item no chão.
 *    - DEPOIS de quebrar, se drop não foi coletado,
 *      o próximo ciclo já vê o item no chão e vai.
 *
 * 2. obterItem:
 *    - ANTES de atacar mob, olha se já tem item no chão.
 *
 * 3. craftarItem:
 *    - ⚠️ CORREÇÃO CRÍTICA: agora usa
 *      crafting.escolherReceitaViavel() em vez de
 *      receitas[0] cego.
 *
 *      Antes, o planejador escolhia a receita de oak
 *      (porque o bot tem oak_planks), mas o handler
 *      REPEGAVA as receitas e usava receitas[0] = cherry.
 *      Resultado: "sem_material_para_wooden_pickaxe:
 *      cherry_planks (0/3)".
 *
 *      Agora os dois usam a MESMA função do crafting.
 *
 * 4. escolherLocal:
 *    - VARREDURA 5x5 procurando lugar PLANO.
 *
 * 5. defender (Fase 2):
 *    - Chama combate.defender() via ação "defender".
 */

const {
    CONFIG,
    VARIANTES_BLOCO,
    MOBS_QUE_DROPAM,
    RESULTADO
} = require("./constantes");

function criarHandlers(ctx) {
    const {
        executarAcao,
        obterPosicao,
        distancia,
        contarItem,
        buscarComCache,
        invalidarCache,
        definirLocalMeta
    } = ctx;

    // =========================================================
    // 🎁 HELPER — IR BUSCAR ITEM NO CHÃO
    // =========================================================

    async function irBuscarItemNoChao(alvo) {
        const resultado = await executarAcao("ir_para_bloco", {
            x: alvo.posicao.x,
            y: alvo.posicao.y,
            z: alvo.posicao.z,
            distancia: 1
        });

        return resultado;
    }

    function temItensNoChao(distanciaMaxima = 12) {
        if (
            !ctx.percepcao ||
            typeof ctx.percepcao.obterItensNoChao !== "function"
        ) {
            return [];
        }

        try {
            return ctx.percepcao.obterItensNoChao(distanciaMaxima) || [];
        } catch (_) {
            return [];
        }
    }

    // =========================================================
    // 📦 OBTER BLOCO
    // =========================================================

    async function obterBloco(tarefa) {
        const { bloco, quantidade } = tarefa;

        if (contarItem(bloco) >= quantidade) {
            return RESULTADO.concluida();
        }

        if (
            !ctx.mundo ||
            typeof ctx.mundo.encontrarBlocos !== "function"
        ) {
            return RESULTADO.falha("mundo_indisponivel");
        }

        const itensPerto = temItensNoChao(8);

        if (itensPerto.length > 0) {
            const maisPerto = itensPerto[0];
            await irBuscarItemNoChao(maisPerto);
            return RESULTADO.emProgresso();
        }

        const encontrados = buscarComCache(bloco);

        if (!encontrados.length) {
            return RESULTADO.falha(`nao_encontrado:${bloco}`);
        }

        const alvo = encontrados[0];
        const posicao = obterPosicao();

        if (
            posicao &&
            distancia(posicao, alvo.posicao) <=
                CONFIG.distanciaQuebra
        ) {
            const resultado = await executarAcao("quebrar", {
                x: alvo.posicao.x,
                y: alvo.posicao.y,
                z: alvo.posicao.z
            });

            if (!resultado?.sucesso) {
                return RESULTADO.falha(
                    `falha_quebrar_${bloco}`
                );
            }

            invalidarCache();

            if (contarItem(bloco) >= quantidade) {
                return RESULTADO.concluida();
            }

            return RESULTADO.emProgresso();
        }

        if (
            ctx.navegacao &&
            typeof ctx.navegacao.irParaBloco === "function"
        ) {
            const iniciou = ctx.navegacao.irParaBloco(
                alvo.posicao.x,
                alvo.posicao.y,
                alvo.posicao.z,
                3
            );

            if (iniciou === false) {
                return RESULTADO.falha("falha_navegacao");
            }

            return RESULTADO.emProgresso();
        }

        return RESULTADO.falha("navegacao_indisponivel");
    }

    // =========================================================
    // 🧩 OBTER ITEM
    // =========================================================

    async function obterItem(tarefa) {
        const { item, quantidade } = tarefa;

        if (contarItem(item) >= quantidade) {
            return RESULTADO.concluida();
        }

        const itensPerto = temItensNoChao(12);

        if (itensPerto.length > 0) {
            const maisPerto = itensPerto[0];
            await irBuscarItemNoChao(maisPerto);
            return RESULTADO.emProgresso();
        }

        const mobs = MOBS_QUE_DROPAM[item] || [];

        if (!mobs.length) {
            return RESULTADO.falha(
                `sem_origem_conhecida:${item}`
            );
        }

        if (
            !ctx.percepcao ||
            typeof ctx.percepcao.obterEntidadesProximas !==
                "function"
        ) {
            return RESULTADO.falha("percepcao_indisponivel");
        }

        const entidades =
            ctx.percepcao.obterEntidadesProximas(16) || [];

        const alvo = entidades.find(e =>
            mobs.includes(
                String(e.nome || "").toLowerCase()
            )
        );

        if (!alvo) {
            return RESULTADO.emProgresso();
        }

        const resultado = await executarAcao("atacar", {
            nome: alvo.nome
        });

        if (!resultado?.sucesso) {
            return RESULTADO.falha(
                `falha_atacar_${alvo.nome}`
            );
        }

        if (contarItem(item) >= quantidade) {
            return RESULTADO.concluida();
        }

        return RESULTADO.emProgresso();
    }

    // =========================================================
    // 🔨 CRAFTAR ITEM — CORRIGIDO
    // =========================================================

    /*
     * ⚠️ CORREÇÃO CRÍTICA:
     *
     * ANTES:
     *   const receitas = ctx.crafting.obterReceitas(item);
     *   const receita = receitas[0];  // cego
     *
     * DEPOIS:
     *   const receitas = ctx.crafting.obterReceitas(item);
     *   const receita = ctx.crafting.escolherReceitaViavel(receitas);
     *
     * Agora planejador e handler usam a MESMA função
     * do crafting. Zero divergência.
     */
    async function craftarItem(tarefa) {
        const { item, quantidade } = tarefa;

        if (contarItem(item) >= quantidade) {
            return RESULTADO.concluida();
        }

        if (
            ctx.crafting &&
            typeof ctx.crafting.obterReceitas === "function" &&
            typeof ctx.crafting.escolherReceitaViavel === "function"
        ) {
            const receitas = ctx.crafting.obterReceitas(item) || [];

            if (receitas.length > 0) {
                // ⚠️ CRÍTICO: escolhe receita VIÁVEL
                const receita =
                    ctx.crafting.escolherReceitaViavel(receitas);

                if (!receita) {
                    return RESULTADO.falha(
                        `sem_receita_viavel_${item}`
                    );
                }

                // ⚠️ Pega materiais já com nome REAL resolvido
                const materiais =
                    typeof ctx.crafting.obterMateriaisResolvidos === "function"
                        ? ctx.crafting.obterMateriaisResolvidos(receita) || []
                        : ctx.crafting.obterMateriais(receita) || [];

                const faltaMaterial = materiais.some(mat => {
                    if (!mat.nome) return false;

                    // Usa nomeReal se existir (resolvido)
                    const nomeParaContar =
                        mat.nomeReal || mat.nome;

                    // Conta considerando variante
                    const tenho =
                        typeof ctx.crafting.contarItemOuVariante === "function"
                            ? ctx.crafting.contarItemOuVariante(
                                nomeParaContar,
                                mat.quantidade
                            )
                            : contarItem(nomeParaContar);

                    return tenho < mat.quantidade;
                });

                if (faltaMaterial) {
                    const faltando = materiais
                        .filter(mat => {
                            if (!mat.nome) return false;

                            const nomeParaContar =
                                mat.nomeReal || mat.nome;

                            const tenho =
                                typeof ctx.crafting.contarItemOuVariante === "function"
                                    ? ctx.crafting.contarItemOuVariante(
                                        nomeParaContar,
                                        mat.quantidade
                                    )
                                    : contarItem(nomeParaContar);

                            return tenho < mat.quantidade;
                        })
                        .map(mat => {
                            const nomeParaContar =
                                mat.nomeReal || mat.nome;

                            const tenho =
                                typeof ctx.crafting.contarItemOuVariante === "function"
                                    ? ctx.crafting.contarItemOuVariante(
                                        nomeParaContar,
                                        mat.quantidade
                                    )
                                    : contarItem(nomeParaContar);

                            return `${nomeParaContar} (${tenho}/${mat.quantidade})`;
                        })
                        .join(", ");

                    return RESULTADO.falha(
                        `sem_material_para_${item}: ${faltando}`
                    );
                }
            }
        }

        const falta = quantidade - contarItem(item);

        const resultado = await executarAcao("craftar", {
            nome: item,
            quantidade: falta
        });

        if (!resultado?.sucesso) {
            return RESULTADO.falha(`falha_craftar_${item}`);
        }

        if (contarItem(item) >= quantidade) {
            return RESULTADO.concluida();
        }

        return RESULTADO.emProgresso();
    }

    // =========================================================
    // 📍 ESCOLHER LOCAL
    // =========================================================

    const LARGURA_PISO = 5;
    const COMPRIMENTO_PISO = 5;

    function ehChaoSolido(x, y, z) {
        if (!ctx.mundo || typeof ctx.mundo.obterBloco !== "function") {
            return false;
        }

        try {
            const bloco = ctx.mundo.obterBloco(x, y, z);
            if (!bloco) return false;

            return bloco.solido === true || bloco.colidivel === true;
        } catch (_) {
            return false;
        }
    }

    function lugarEhPlano(baseX, baseY, baseZ) {
        for (let dx = 0; dx < LARGURA_PISO; dx++) {
            for (let dz = 0; dz < COMPRIMENTO_PISO; dz++) {
                const px = baseX + dx;
                const py = baseY - 1;
                const pz = baseZ + dz;

                if (!ehChaoSolido(px, py, pz)) {
                    return false;
                }

                if (ctx.mundo && typeof ctx.mundo.obterBloco === "function") {
                    const alvo = ctx.mundo.obterBloco(px, py + 1, pz);
                    if (
                        alvo &&
                        alvo.nome !== "air" &&
                        alvo.boundingBox !== "empty"
                    ) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    function procurarLugarPlano(baseX, baseY, baseZ) {
        if (lugarEhPlano(baseX, baseY, baseZ)) {
            return { x: baseX, y: baseY, z: baseZ };
        }

        const raios = [2, 4, 6, 8];

        for (const raio of raios) {
            for (let dx = -raio; dx <= raio; dx++) {
                for (let dz = -raio; dz <= raio; dz++) {
                    if (
                        Math.abs(dx) !== raio &&
                        Math.abs(dz) !== raio
                    ) {
                        continue;
                    }

                    const px = baseX + dx;
                    const pz = baseZ + dz;

                    for (const dy of [0, 1, -1]) {
                        const py = baseY + dy;

                        if (lugarEhPlano(px, py, pz)) {
                            return { x: px, y: py, z: pz };
                        }
                    }
                }
            }
        }

        return { x: baseX, y: baseY, z: baseZ };
    }

    async function escolherLocal() {
        const posicao = obterPosicao();

        if (!posicao) {
            return RESULTADO.emProgresso();
        }

        const baseX = Math.floor(posicao.x);
        const baseY = Math.floor(posicao.y);
        const baseZ = Math.floor(posicao.z);

        const lugar = procurarLugarPlano(baseX, baseY, baseZ);

        const achouPlano =
            lugar.x !== baseX ||
            lugar.y !== baseY ||
            lugar.z !== baseZ;

        if (achouPlano) {
            console.log(
                `📍 [escolherLocal] Lugar plano encontrado em ` +
                `(${lugar.x},${lugar.y},${lugar.z}) ` +
                `(base era ${baseX},${baseY},${baseZ})`
            );
        } else {
            console.log(
                `📍 [escolherLocal] Nenhum lugar plano em volta. ` +
                `Usando posição atual (${baseX},${baseY},${baseZ}).`
            );
        }

        definirLocalMeta({
            x: lugar.x,
            y: lugar.y,
            z: lugar.z
        });

        return RESULTADO.concluida();
    }

    // =========================================================
    // 🏠 CONSTRUIR ESTRUTURA
    // =========================================================

    async function construirEstrutura(tarefa) {
        const local =
            ctx.obterLocalMeta() || obterPosicao();

        if (!local) {
            return RESULTADO.falha("local_indisponivel");
        }

        const resultado = await executarAcao("construir", {
            tipo: tarefa.estrutura,
            x: local.x,
            y: local.y,
            z: local.z
        });

        if (!resultado?.sucesso) {
            return RESULTADO.falha(
                `falha_construir_${tarefa.estrutura}`
            );
        }

        return RESULTADO.concluida();
    }

    // =========================================================
    // ⚔️ DEFENDER — NOVO (FASE 2)
    // =========================================================

    async function defender(tarefa) {
        const ameaca =
            ctx.percepcao &&
            typeof ctx.percepcao.obterAmeacaEmArea === "function"
                ? ctx.percepcao.obterAmeacaEmArea(12)
                : null;

        if (!ameaca || ameaca.total === 0) {
            return RESULTADO.concluida();
        }

        const resultado = await executarAcao("defender", {});

        if (!resultado?.sucesso) {
            return RESULTADO.falha(
                resultado?.erro || "falha_defender"
            );
        }

        const ameacaDepois =
            ctx.percepcao &&
            typeof ctx.percepcao.obterAmeacaEmArea === "function"
                ? ctx.percepcao.obterAmeacaEmArea(12)
                : null;

        if (ameacaDepois && ameacaDepois.total > 0) {
            return RESULTADO.emProgresso();
        }

        return RESULTADO.concluida();
    }

    // =========================================================
    // 📋 MAPA
    // =========================================================

    return {
        obter_bloco: obterBloco,
        obter_item: obterItem,
        craftar_item: craftarItem,
        escolher_local: escolherLocal,
        construir_estrutura: construirEstrutura,

        defender
    };
}

module.exports = { criarHandlers };