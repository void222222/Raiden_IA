function criarConstrucao(contexto) {
    const bot = contexto.bot;
    const mundo = contexto.mundo;
    const navegacao = contexto.navegacao;

    // =========================================================
    // ⚙️ CONFIG
    // =========================================================

    const CONFIG = {
        larguraAbrigo: 5,
        comprimentoAbrigo: 5,
        alturaAbrigo: 3,
        materialPadrao: "oak_planks"
    };

    const FACE_PADRAO = { x: 0, y: 1, z: 0 };

    // =========================================================
    // 🏗️ BLUEPRINTS
    // =========================================================
    //
    // Um blueprint declara:
    //   material:  bloco padrão
    //   largura:   tamanho no eixo X
    //   profundidade: tamanho no eixo Z
    //   altura:    altura das paredes
    //   paredes:   true para construir 4 paredes
    //   piso:      true para construir piso
    //   teto:      true para construir teto
    //   porta:     true para abrir vão na frente
    //   janelas:   { lados: ["frente", "tras"], altura: 1 }
    //
    // O construtor genérico percorre isso.
    //
    // Pra adicionar "torre", "muralha", "casa_pedra" etc,
    // basta acrescentar uma entrada aqui.

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
            paredes: true,   // só 2 paredes porque profundidade=1
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

    function numeroValido(n, padrao = 0) {
        const v = Number(n);
        return Number.isFinite(v) ? v : padrao;
    }

    /*
     * Aceita objeto OU posicional.
     *
     * Aliases:
     * - nomeBloco / nomeItem / item / material
     * - comprimento / profundidade
     */
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
                x,
                y,
                z,
                largura,
                comprimento,
                altura,
                direcao,
                nomeBloco
            ] = args;

            p = {
                x,
                y,
                z,
                largura,
                comprimento,
                altura,
                direcao,
                nomeBloco
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
    // 🧱 COLOCAR BLOCO
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
            /*
             * CONTRATO: mundo.colocar(nomeItem, x, y, z, face)
             */
            return await mundo.colocar(
                nomeBloco,
                x,
                y,
                z,
                face
            );
        } catch (erro) {
            console.error(
                "🏠 Erro ao colocar bloco:",
                erro.message
            );
            return false;
        }
    }

    // =========================================================
    // 🧱 ESTRUTURAS PRIMITIVAS
    // =========================================================

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

                if (!sucesso) {
                    return false;
                }
            }
        }

        return true;
    }

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

        for (let dx = 0; dx < largura; dx++) {
            for (let dz = 0; dz < comprimento; dz++) {
                const sucesso = await colocarBloco(
                    x + dx,
                    y,
                    z + dz,
                    nomeBloco
                );

                if (!sucesso) {
                    return false;
                }
            }
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

        if (navegacao) {
            try { navegacao.parar(); } catch (_) {}
        }

        // ------------------------------------------------
        // 1. Piso
        // ------------------------------------------------
        if (bp.piso) {
            const piso = await construirPiso({
                x,
                y: y - 1,
                z,
                largura,
                comprimento,
                nomeBloco
            });

            if (!piso) return false;
        }

        // ------------------------------------------------
        // 2. Paredes
        // ------------------------------------------------
        if (bp.paredes) {
            // Frente (eixo X no z mínimo)
            const frente = await construirParede({
                x,
                y,
                z,
                largura,
                altura,
                direcao: "x",
                nomeBloco
            });
            if (!frente) return false;

            // Trás (eixo X no z máximo)
            if (comprimento > 1) {
                const tras = await construirParede({
                    x,
                    y,
                    z: z + comprimento - 1,
                    largura,
                    altura,
                    direcao: "x",
                    nomeBloco
                });
                if (!tras) return false;
            }

            // Esquerda (eixo Z no x mínimo)
            const esquerda = await construirParede({
                x,
                y,
                z,
                largura: comprimento,
                altura,
                direcao: "z",
                nomeBloco
            });
            if (!esquerda) return false;

            // Direita (eixo Z no x máximo)
            if (largura > 1) {
                const direita = await construirParede({
                    x: x + largura - 1,
                    y,
                    z,
                    largura: comprimento,
                    altura,
                    direcao: "z",
                    nomeBloco
                });
                if (!direita) return false;
            }

            // --------------------------------------------
            // 2.1 Porta
            // --------------------------------------------
            if (bp.porta) {
                const portaX = x + Math.floor(largura / 2);
                const portaZ = z;

                for (let nivel = 0; nivel < 2; nivel++) {
                    try {
                        const bloco =
                            typeof mundo.obterBloco === "function"
                                ? mundo.obterBloco(
                                      portaX,
                                      y + nivel,
                                      portaZ
                                  )
                                : null;

                        if (bloco && bloco.name !== "air") {
                            await mundo.quebrar(
                                portaX,
                                y + nivel,
                                portaZ
                            );
                        }
                    } catch (_) {}
                }
            }

            // --------------------------------------------
            // 2.2 Janelas (opcional)
            // --------------------------------------------
            if (bp.janelas && Array.isArray(bp.janelas.lados)) {
                const alturaJanela = bp.janelas.altura || 1;

                for (const lado of bp.janelas.lados) {
                    await construirJanela(
                        lado,
                        x, y, z,
                        largura, comprimento, altura,
                        alturaJanela
                    );
                }
            }
        }

        // ------------------------------------------------
        // 3. Teto
        // ------------------------------------------------
        if (bp.teto) {
            const teto = await construirTeto({
                x,
                y: y + altura,
                z,
                largura,
                comprimento,
                nomeBloco
            });

            if (!teto) return false;
        }

        return true;
    }

    async function construirJanela(
        lado,
        x, y, z,
        largura, comprimento, altura,
        alturaJanela
    ) {
        const nivelY = y + Math.floor(altura / 2);
        const meioX = x + Math.floor(largura / 2);
        const meioZ = z + Math.floor(comprimento / 2);

        const alvos = [];

        switch (lado) {
            case "frente":
                alvos.push({
                    x: meioX,
                    y: nivelY,
                    z: z
                });
                break;

            case "tras":
                alvos.push({
                    x: meioX,
                    y: nivelY,
                    z: z + comprimento - 1
                });
                break;

            case "esquerda":
                alvos.push({
                    x: x,
                    y: nivelY,
                    z: meioZ
                });
                break;

            case "direita":
                alvos.push({
                    x: x + largura - 1,
                    y: nivelY,
                    z: meioZ
                });
                break;
        }

        for (const alvo of alvos) {
            for (let d = 0; d < alturaJanela; d++) {
                try {
                    const bloco =
                        typeof mundo.obterBloco === "function"
                            ? mundo.obterBloco(
                                  alvo.x,
                                  alvo.y + d,
                                  alvo.z
                              )
                            : null;

                    if (bloco && bloco.name !== "air") {
                        await mundo.quebrar(
                            alvo.x,
                            alvo.y + d,
                            alvo.z
                        );
                    }
                } catch (_) {}
            }
        }
    }

    // =========================================================
    // 🔌 COMPATIBILIDADE: construirAbrigoSimples
    // =========================================================

    async function construirAbrigoSimples(...args) {
        const params = extrairParametros(args);
        return construirBlueprint("abrigo_simples", params);
    }

    // =========================================================
    // 🎯 API — CONSTRUIR
    // =========================================================

    async function construir(tipo, parametros = {}) {
        if (!tipo) {
            return false;
        }

        const tipoNormalizado = String(tipo)
            .trim()
            .toLowerCase();

        // Blueprints primeiro (mais genérico)
        if (BLUEPRINTS[tipoNormalizado]) {
            return construirBlueprint(
                tipoNormalizado,
                parametros
            );
        }

        // Primitivas específicas
        switch (tipoNormalizado) {
            case "parede":
                return construirParede(parametros);

            case "piso":
                return construirPiso(parametros);

            case "teto":
                return construirTeto(parametros);

            case "abrigo_simples":
                // Fallback se o blueprint for removido
                return construirAbrigoSimples(parametros);

            default:
                emitirErro(`Tipo desconhecido: ${tipo}`);
                return false;
        }
    }

    // =========================================================
    // 📢 EMISSÃO DE ERRO
    // =========================================================

    function emitirErro(mensagem) {
        console.error(`🏠 ${mensagem}`);
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

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

        // Exposição para uso externo
        BLUEPRINTS
    };
}

module.exports = {
    criarConstrucao
};