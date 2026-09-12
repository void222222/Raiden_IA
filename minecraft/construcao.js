function criarConstrucao(contexto) {
    const bot = contexto.bot;
    const mundo = contexto.mundo;
    const navegacao = contexto.navegacao;

    const CONFIG = {
        larguraAbrigo: 5,
        comprimentoAbrigo: 5,
        alturaAbrigo: 3
    };

    function obterPosicaoBase() {
        if (!bot.entity?.position) {
            return null;
        }

        return {
            x: Math.floor(
                bot.entity.position.x
            ),
            y: Math.floor(
                bot.entity.position.y
            ),
            z: Math.floor(
                bot.entity.position.z
            )
        };
    }

    async function colocarBloco(
        x,
        y,
        z,
        nomeBloco
    ) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z) ||
            !nomeBloco
        ) {
            return false;
        }

        if (!mundo) {
            return false;
        }

        try {
            return await mundo.colocar(
                x,
                y,
                z,
                nomeBloco
            );
        } catch (erro) {
            console.error(
                "🏠 Erro ao colocar bloco:",
                erro.message
            );

            return false;
        }
    }

    async function construirParede(
        x,
        y,
        z,
        largura,
        altura,
        direcao = "x",
        nomeBloco = "oak_planks"
    ) {
        if (
            largura < 1 ||
            altura < 1
        ) {
            return false;
        }

        for (
            let nivel = 0;
            nivel < altura;
            nivel++
        ) {
            for (
                let indice = 0;
                indice < largura;
                indice++
            ) {
                let blocoX = x;
                let blocoY =
                    y + nivel;
                let blocoZ = z;

                if (direcao === "x") {
                    blocoX += indice;
                } else {
                    blocoZ += indice;
                }

                const sucesso =
                    await colocarBloco(
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

    async function construirPiso(
        x,
        y,
        z,
        largura,
        comprimento,
        nomeBloco = "oak_planks"
    ) {
        for (
            let dx = 0;
            dx < largura;
            dx++
        ) {
            for (
                let dz = 0;
                dz < comprimento;
                dz++
            ) {
                const sucesso =
                    await colocarBloco(
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

    async function construirTeto(
        x,
        y,
        z,
        largura,
        comprimento,
        nomeBloco = "oak_planks"
    ) {
        return construirPiso(
            x,
            y,
            z,
            largura,
            comprimento,
            nomeBloco
        );
    }

    async function construirAbrigoSimples(
        x = null,
        y = null,
        z = null,
        nomeBloco = "oak_planks"
    ) {
        const base =
            obterPosicaoBase();

        if (!base) {
            return false;
        }

        if (x === null) {
            x = base.x;
        }

        if (y === null) {
            y = base.y;
        }

        if (z === null) {
            z = base.z;
        }

        const largura =
            CONFIG.larguraAbrigo;

        const comprimento =
            CONFIG.comprimentoAbrigo;

        const altura =
            CONFIG.alturaAbrigo;

        if (navegacao) {
            try {
                navegacao.parar();
            } catch (_) {}
        }

        const piso =
            await construirPiso(
                x,
                y - 1,
                z,
                largura,
                comprimento,
                nomeBloco
            );

        if (!piso) {
            return false;
        }

        const paredeFrente =
            await construirParede(
                x,
                y,
                z,
                largura,
                altura,
                "x",
                nomeBloco
            );

        if (!paredeFrente) {
            return false;
        }

        const paredeTras =
            await construirParede(
                x,
                y,
                z + comprimento - 1,
                largura,
                altura,
                "x",
                nomeBloco
            );

        if (!paredeTras) {
            return false;
        }

        const paredeEsquerda =
            await construirParede(
                x,
                y,
                z,
                comprimento,
                altura,
                "z",
                nomeBloco
            );

        if (!paredeEsquerda) {
            return false;
        }

        const paredeDireita =
            await construirParede(
                x + largura - 1,
                y,
                z,
                comprimento,
                altura,
                "z",
                nomeBloco
            );

        if (!paredeDireita) {
            return false;
        }

        const portaX =
            x +
            Math.floor(
                largura / 2
            );

        for (
            let nivel = 0;
            nivel < 2;
            nivel++
        ) {
            const bloco =
                mundo.obterBloco(
                    portaX,
                    y + nivel,
                    z
                );

            if (
                bloco &&
                bloco.name !== "air"
            ) {
                try {
                    await mundo.quebrar(
                        portaX,
                        y + nivel,
                        z
                    );
                } catch (_) {}
            }
        }

        const teto =
            await construirTeto(
                x,
                y + altura,
                z,
                largura,
                comprimento,
                nomeBloco
            );

        if (!teto) {
            return false;
        }

        return true;
    }

    async function construir(
        tipo,
        parametros = {}
    ) {
        if (!tipo) {
            return false;
        }

        switch (tipo) {
            case "parede":
                return construirParede(
                    parametros.x,
                    parametros.y,
                    parametros.z,
                    parametros.largura,
                    parametros.altura,
                    parametros.direcao,
                    parametros.nomeBloco ||
                        "oak_planks"
                );

            case "piso":
                return construirPiso(
                    parametros.x,
                    parametros.y,
                    parametros.z,
                    parametros.largura,
                    parametros.comprimento,
                    parametros.nomeBloco ||
                        "oak_planks"
                );

            case "teto":
                return construirTeto(
                    parametros.x,
                    parametros.y,
                    parametros.z,
                    parametros.largura,
                    parametros.comprimento,
                    parametros.nomeBloco ||
                        "oak_planks"
                );

            case "abrigo_simples":
                return construirAbrigoSimples(
                    parametros.x,
                    parametros.y,
                    parametros.z,
                    parametros.nomeBloco ||
                        "oak_planks"
                );

            default:
                return false;
        }
    }

    function obterEstado() {
        return {
            disponivel: true,
            configuracao: {
                larguraAbrigo:
                    CONFIG.larguraAbrigo,
                comprimentoAbrigo:
                    CONFIG.comprimentoAbrigo,
                alturaAbrigo:
                    CONFIG.alturaAbrigo
            }
        };
    }

    return {
        colocarBloco,
        construirParede,
        construirPiso,
        construirTeto,
        construirAbrigoSimples,
        construir,
        obterEstado
    };
}

module.exports = {
    criarConstrucao
};