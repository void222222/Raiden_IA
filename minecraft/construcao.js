function criarConstrucao(contexto) {
    const bot = contexto.bot;
    const mundo = contexto.mundo;
    const navegacao = contexto.navegacao;

    const CONFIG = {
        larguraAbrigo: 5,
        comprimentoAbrigo: 5,
        alturaAbrigo: 3,
        materialPadrao: "oak_planks"
    };

    const FACE_PADRAO = { x: 0, y: 1, z: 0 };

    const FACES_CANDIDATAS = [
        { x: 0, y: 1, z: 0 },    // abaixo (chão)
        { x: 0, y: 0, z: 1 },    // norte
        { x: 0, y: 0, z: -1 },   // sul
        { x: 1, y: 0, z: 0 },    // oeste
        { x: -1, y: 0, z: 0 },   // leste
        { x: 0, y: -1, z: 0 }    // acima
    ];

    const BLUEPRINTS = {
        abrigo_simples: {
            material: "oak_planks",
            largura: 5,
            profundidade: 5,
            altura: 3,
            paredes: true,
            piso: true,
            teto: true,
            porta: true
        },
        torre_pedra: {
            material: "stone",
            largura: 3,
            profundidade: 3,
            altura: 6,
            paredes: true,
            piso: true,
            teto: true,
            porta: true
        },
        casa_pedra: {
            material: "stone",
            largura: 7,
            profundidade: 7,
            altura: 4,
            paredes: true,
            piso: true,
            teto: true,
            porta: true
        },
        muralha: {
            material: "stone",
            largura: 10,
            profundidade: 1,
            altura: 3,
            paredes: true,
            piso: false,
            teto: false,
            porta: false
        }
    };

    // =========================================================
    // 📍 POSIÇÃO BASE
    // =========================================================

    function obterPosicaoBase() {
        if (!bot.entity?.position) {
            return null;
        }

        return {
            x: Math.floor(bot.entity.position.x),
            y: Math.floor(bot.entity.position.y),
            z: Math.floor(bot.entity.position.z)
        };
    }

    function obterPosicaoBot() {
        const p = bot.entity?.position;
        if (!p) return null;
        return { x: p.x, y: p.y, z: p.z };
    }

    // =========================================================
    // 🚶 SAIR DE DENTRO DA CONSTRUÇÃO
    // =========================================================

    /*
     * ⚠️ Move o bot pra FORA do bounding box da construção
     * antes de começar a colocar blocos.
     *
     * Sem isso, o bot fica preso dentro da parede que
     * tá construindo, e o servidor recusa o placeBlock.
     *
     * ⚠️ CORREÇÃO: `await` no `navegacao.irPara` (funciona
     * tanto se for async quanto síncrono) + espera curta
     * pra física assentar.
     */
    async function sairDaArea(x, y, z, largura, comprimento) {
        const pos = obterPosicaoBot();
        if (!pos) return false;

        // Bounding box da construção
        const dentroX =
            pos.x >= x - 0.5 && pos.x <= x + largura + 0.5;
        const dentroZ =
            pos.z >= z - 0.5 && pos.z <= z + comprimento + 0.5;
        const dentroY =
            pos.y >= y - 1.5 && pos.y <= y + 4.5;

        if (!dentroX || !dentroZ || !dentroY) {
            // Já está fora
            return true;
        }

        console.log(
            `🚶 [construcao] Bot está DENTRO da área. ` +
            `Movendo pra fora...`
        );

        // Alvo: 2 blocos além da margem leste
        const alvoX = x + largura + 2;
        const alvoZ = z + Math.floor(comprimento / 2);

        try {
            if (
                navegacao &&
                typeof navegacao.irPara === "function"
            ) {
                await navegacao.irPara(alvoX, y, alvoZ, 1);
            } else {
                // Fallback: anda pra frente
                bot.setControlState("forward", true);
                await new Promise(r => setTimeout(r, 1500));
                bot.setControlState("forward", false);
            }

            // Espera curta pra física assentar
            await new Promise(r => setTimeout(r, 500));

            return true;

        } catch (erro) {
            console.error(
                "🚶 [construcao] Erro ao sair da área:",
                erro.message
            );
            return false;
        }
    }

    // =========================================================
    // 🔧 NORMALIZAÇÃO
    // =========================================================

    function normalizarNomeBloco(nome) {
        if (typeof nome !== "string") {
            return null;
        }

        const limpo = nome.trim();
        return limpo.length ? limpo : null;
    }

    function extrairParametros(args) {
        let p;

        if (
            args.length === 1 &&
            args[0] &&
            typeof args[0] === "object"
        ) {
            p = args[0];
        } else {
            const [
                x, y, z,
                largura, comprimento, altura,
                direcao, nomeBloco
            ] = args;

            p = {
                x, y, z,
                largura, comprimento, altura,
                direcao, nomeBloco
            };
        }

        return {
            x: p.x === undefined || p.x === null ? null : Number(p.x),
            y: p.y === undefined || p.y === null ? null : Number(p.y),
            z: p.z === undefined || p.z === null ? null : Number(p.z),
            largura: p.largura === undefined ? null : Number(p.largura),
            comprimento: p.comprimento !== undefined
                ? Number(p.comprimento)
                : (p.profundidade !== undefined
                    ? Number(p.profundidade)
                    : null),
            altura: p.altura === undefined ? null : Number(p.altura),
            direcao: p.direcao,
            nomeBloco: normalizarNomeBloco(
                p.nomeBloco ??
                    p.nomeItem ??
                    p.item ??
                    p.material ??
                    CONFIG.materialPadrao
            )
        };
    }

    // =========================================================
    // 🧱 COLOCAR BLOCO — VERSÃO MULTI-FACE
    // =========================================================

    async function colocarBloco(
        x,
        y,
        z,
        nomeBloco,
        face = FACE_PADRAO
    ) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z) ||
            !nomeBloco
        ) {
            return false;
        }

        if (!mundo || typeof mundo.colocar !== "function") {
            return false;
        }

        try {
            // 1. Se o alvo já tem bloco, considera OK
            const blocoAtual =
                typeof mundo.obterBloco === "function"
                    ? mundo.obterBloco(x, y, z)
                    : null;

            if (
                blocoAtual &&
                blocoAtual.name !== "air" &&
                blocoAtual.boundingBox !== "empty"
            ) {
                return true;
            }

            // 2. Tenta a face pedida primeiro
            let sucesso = await tentarColocar(
                x, y, z, nomeBloco, face
            );

            if (sucesso) return true;

            // 3. Tenta TODAS as outras faces
            for (const f of FACES_CANDIDATAS) {
                if (
                    f.x === face.x &&
                    f.y === face.y &&
                    f.z === face.z
                ) {
                    continue;
                }

                sucesso = await tentarColocar(
                    x, y, z, nomeBloco, f
                );

                if (sucesso) return true;
            }

            return false;

        } catch (erro) {
            return false;
        }
    }

    async function tentarColocar(x, y, z, nomeBloco, face) {
        try {
            const sucesso = await mundo.colocar(
                nomeBloco,
                x,
                y,
                z,
                face
            );

            return sucesso === true;
        } catch (_) {
            return false;
        }
    }

    // =========================================================
    // 🧱 ESTRUTURAS PRIMITIVAS
    // =========================================================

    /*
     * ⚠️ CORREÇÃO: agora tolera falhas parciais.
     * Se pelo menos 60% dos blocos forem colocados,
     * considera a parede OK. Isso evita que UMA falha
     * (servidor recusou um bloco específico) derrube
     * a construção inteira.
     */
    async function construirParede(...args) {
        const {
            x, y, z,
            largura, altura,
            direcao = "x",
            nomeBloco
        } = extrairParametros(args);

        if (
            x === null || y === null || z === null ||
            largura === null || altura === null ||
            largura < 1 || altura < 1
        ) {
            return false;
        }

        let colocados = 0;
        let falharam = 0;
        const total = largura * altura;

        for (let nivel = 0; nivel < altura; nivel++) {
            for (let indice = 0; indice < largura; indice++) {
                let blocoX = x;
                let blocoY = y + nivel;
                let blocoZ = z;

                if (direcao === "x") {
                    blocoX += indice;
                } else {
                    blocoZ += indice;
                }

                const sucesso = await colocarBloco(
                    blocoX,
                    blocoY,
                    blocoZ,
                    nomeBloco
                );

                if (sucesso) {
                    colocados++;
                } else {
                    falharam++;
                }
            }
        }

        const taxa = colocados / total;

        if (taxa < 0.6) {
            console.error(
                `🏠 Parede ${direcao}: só ${colocados}/${total} ` +
                `(${Math.round(taxa * 100)}%). FALHOU.`
            );
            return false;
        }

        if (falharam > 0) {
            console.log(
                `🏠 Parede ${direcao}: ${colocados}/${total} OK ` +
                `(${falharam} falharam, mas segue).`
            );
        }

        return true;
    }

    /*
     * ⚠️ CORREÇÃO: agora tolera falhas parciais.
     * Se pelo menos 60% dos blocos forem colocados,
     * considera o piso OK.
     */
    async function construirPiso(...args) {
        const {
            x, y, z,
            largura, comprimento,
            nomeBloco
        } = extrairParametros(args);

        if (
            x === null || y === null || z === null ||
            largura === null || comprimento === null ||
            largura < 1 || comprimento < 1
        ) {
            return false;
        }

        let colocados = 0;
        let falharam = 0;
        const total = largura * comprimento;

        for (let dx = 0; dx < largura; dx++) {
            for (let dz = 0; dz < comprimento; dz++) {
                const sucesso = await colocarBloco(
                    x + dx,
                    y,
                    z + dz,
                    nomeBloco
                );

                if (sucesso) {
                    colocados++;
                } else {
                    falharam++;
                }
            }
        }

        const taxa = colocados / total;

        if (taxa < 0.6) {
            console.error(
                `🏠 Piso: só ${colocados}/${total} ` +
                `(${Math.round(taxa * 100)}%). FALHOU.`
            );
            return false;
        }

        if (falharam > 0) {
            console.log(
                `🏠 Piso: ${colocados}/${total} OK ` +
                `(${falharam} falharam, mas segue).`
            );
        }

        return true;
    }

    async function construirTeto(...args) {
        return construirPiso(...args);
    }

    // =========================================================
    // 🏠 CONSTRUTOR GENÉRICO DE BLUEPRINT
    // =========================================================

    async function construirBlueprint(nomeBlueprint, parametros = {}) {
        const bp = BLUEPRINTS[nomeBlueprint];

        if (!bp) {
            emitirErro(`Blueprint desconhecido: ${nomeBlueprint}`);
            return false;
        }

        const params = extrairParametros([parametros]);
        const base = obterPosicaoBase();

        if (!base) {
            return false;
        }

        const x = params.x !== null ? params.x : base.x;
        const y = params.y !== null ? params.y : base.y;
        const z = params.z !== null ? params.z : base.z;

        const largura = (params.largura !== null && params.largura > 0)
            ? params.largura
            : bp.largura;

        const comprimento = (
            params.comprimento !== null &&
            params.comprimento > 0
        )
            ? params.comprimento
            : bp.profundidade;

        const altura = (params.altura !== null && params.altura > 0)
            ? params.altura
            : bp.altura;

        const nomeBloco = params.nomeBloco || bp.material;

        console.log(
            `🏠 Iniciando construção "${nomeBlueprint}" ` +
            `em (${x},${y},${z}) | ` +
            `L=${largura} C=${comprimento} A=${altura} | ` +
            `material=${nomeBloco}`
        );

        if (navegacao) {
            try { navegacao.parar(); } catch (_) {}
        }

        // ⚠️ Sai de dentro da área antes de construir
        await sairDaArea(x, y, z, largura, comprimento);

        // ⚠️ NOVO: garante bloco de apoio em Y-2 antes do piso.
        // Sem isso, o piso flutua no ar e o servidor recusa.
        const blocoAbaixo = mundo.obterBloco(x, y - 1, z);
        const chaoEhAr = !blocoAbaixo ||
            blocoAbaixo.name === "air" ||
            blocoAbaixo.boundingBox === "empty";

        if (chaoEhAr) {
            console.log(
                `🏠 Chão em Y=${y - 1} é ar. ` +
                `Colocando bloco de apoio em Y=${y - 2}...`
            );

            const apoio = await colocarBloco(
                x,
                y - 2,
                z,
                nomeBloco
            );

            if (!apoio) {
                console.log(
                    `🏠 Sem apoio. Construindo piso "no ar" ` +
                    `(vai falhar se o servidor recusar).`
                );
            }
        }

        let yBase = y;

        // Piso
        if (bp.piso) {
            console.log("🏠 [1/3] Construindo PISO...");

            const piso = await construirPiso({
                x,
                y: yBase - 1,
                z,
                largura,
                comprimento,
                nomeBloco
            });

            if (!piso) {
                console.error("🏠 FALHOU: PISO");
                return false;
            }

            console.log("🏠 [1/3] PISO OK");
        }

        // Paredes
        if (bp.paredes) {
            console.log("🏠 [2/3] Construindo PAREDES...");

            const frente = await construirParede({
                x,
                y: yBase,
                z,
                largura,
                altura,
                direcao: "x",
                nomeBloco
            });
            if (!frente) {
                console.error("🏠 FALHOU: PAREDE FRENTE");
                return false;
            }
            console.log("🏠 PAREDE FRENTE OK");

            if (comprimento > 1) {
                const tras = await construirParede({
                    x,
                    y: yBase,
                    z: z + comprimento - 1,
                    largura,
                    altura,
                    direcao: "x",
                    nomeBloco
                });
                if (!tras) {
                    console.error("🏠 FALHOU: PAREDE TRÁS");
                    return false;
                }
                console.log("🏠 PAREDE TRÁS OK");
            }

            const esquerda = await construirParede({
                x,
                y: yBase,
                z,
                largura: comprimento,
                altura,
                direcao: "z",
                nomeBloco
            });
            if (!esquerda) {
                console.error("🏠 FALHOU: PAREDE ESQUERDA");
                return false;
            }
            console.log("🏠 PAREDE ESQUERDA OK");

            if (largura > 1) {
                const direita = await construirParede({
                    x: x + largura - 1,
                    y: yBase,
                    z,
                    largura: comprimento,
                    altura,
                    direcao: "z",
                    nomeBloco
                });
                if (!direita) {
                    console.error("🏠 FALHOU: PAREDE DIREITA");
                    return false;
                }
                console.log("🏠 PAREDE DIREITA OK");
            }

            if (bp.porta) {
                console.log("🏠 [2.1] Abrindo PORTA...");

                const portaX = x + Math.floor(largura / 2);
                const portaZ = z;

                for (let nivel = 0; nivel < 2; nivel++) {
                    try {
                        const bloco =
                            typeof mundo.obterBloco === "function"
                                ? mundo.obterBloco(
                                      portaX,
                                      yBase + nivel,
                                      portaZ
                                  )
                                : null;

                        if (bloco && bloco.name !== "air") {
                            await mundo.quebrar(
                                portaX,
                                yBase + nivel,
                                portaZ
                            );
                        }
                    } catch (_) {}
                }

                console.log("🏠 [2.1] PORTA OK");
            }

            console.log("🏠 [2/3] PAREDES OK");
        }

        // Teto
        if (bp.teto) {
            console.log("🏠 [3/3] Construindo TETO...");

            const teto = await construirTeto({
                x,
                y: yBase + altura,
                z,
                largura,
                comprimento,
                nomeBloco
            });

            if (!teto) {
                console.error("🏠 FALHOU: TETO");
                return false;
            }

            console.log("🏠 [3/3] TETO OK");
        }

        console.log("🏠 Construção CONCLUÍDA!");
        return true;
    }

    // =========================================================
    // 🔌 COMPATIBILIDADE
    // =========================================================

    async function construirAbrigoSimples(...args) {
        const params = extrairParametros(args);
        return construirBlueprint("abrigo_simples", params);
    }

    // =========================================================
    // 🎯 API
    // =========================================================

    async function construir(tipo, parametros = {}) {
        if (!tipo) return false;

        const tipoNormalizado = String(tipo).trim().toLowerCase();

        if (BLUEPRINTS[tipoNormalizado]) {
            return construirBlueprint(tipoNormalizado, parametros);
        }

        switch (tipoNormalizado) {
            case "parede":
                return construirParede(parametros);
            case "piso":
                return construirPiso(parametros);
            case "teto":
                return construirTeto(parametros);
            case "abrigo_simples":
                return construirAbrigoSimples(parametros);
            default:
                emitirErro(`Tipo desconhecido: ${tipo}`);
                return false;
        }
    }

    function emitirErro(mensagem) {
        console.error(`🏠 ${mensagem}`);
    }

    function obterEstado() {
        return {
            disponivel: true,
            configuracao: {
                larguraAbrigo: CONFIG.larguraAbrigo,
                comprimentoAbrigo: CONFIG.comprimentoAbrigo,
                alturaAbrigo: CONFIG.alturaAbrigo
            },
            blueprints: Object.keys(BLUEPRINTS)
        };
    }

    return {
        colocarBloco,
        construirParede,
        construirPiso,
        construirTeto,
        construirAbrigoSimples,
        construirBlueprint,
        construir,
        obterEstado,
        BLUEPRINTS,
        sairDaArea
    };
}

module.exports = {
    criarConstrucao
};