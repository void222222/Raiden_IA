/**
 * 🚶 MOVIMENTO — RAIDEN MINECRAFT
 *
 * Movimento básico da Raiden.
 *
 * Não faz pathfinding.
 * Não decide destino.
 * Apenas controla o corpo do bot.
 */

function criarMovimento(contexto) {
    const bot = contexto.bot;

    const CONTROLES = new Set([
        "forward",
        "back",
        "left",
        "right",
        "jump",
        "sprint",
        "sneak"
    ]);

    let andando = false;
    let direcaoAtual = null;
    let temporizadorMovimento = null;

    function limparTemporizador() {
        if (
            temporizadorMovimento !== null
        ) {
            clearTimeout(
                temporizadorMovimento
            );

            temporizadorMovimento = null;
        }
    }

    function limparControles() {
        for (
            const controle
            of CONTROLES
        ) {
            try {
                bot.setControlState(
                    controle,
                    false
                );
            } catch (_) {}
        }
    }

    function normalizarDirecao(
        direcao
    ) {
        const valor =
            String(
                direcao || "frente"
            )
                .trim()
                .toLowerCase();

        const mapa = {
            frente: "forward",
            forward: "forward",

            tras: "back",
            trás: "back",
            back: "back",

            esquerda: "left",
            left: "left",

            direita: "right",
            right: "right"
        };

        return mapa[valor] || null;
    }

    function aplicarDirecao(
        controle
    ) {
        limparControles();

        if (!controle) {
            return false;
        }

        try {
            bot.setControlState(
                controle,
                true
            );

            return true;
        } catch (erro) {
            console.error(
                "🚶 Erro ao aplicar movimento:",
                erro.message
            );

            return false;
        }
    }

    function andar(
        direcao = "frente",
        duracao = 1
    ) {
        const controle =
            normalizarDirecao(
                direcao
            );

        if (!controle) {
            return false;
        }

        const tempo =
            Math.max(
                0.1,
                Math.min(
                    Number(duracao) || 1,
                    10
                )
            );

        limparTemporizador();

        const sucesso =
            aplicarDirecao(
                controle
            );

        if (!sucesso) {
            return false;
        }

        andando = true;
        direcaoAtual = controle;

        temporizadorMovimento =
            setTimeout(() => {
                parar();
            }, tempo * 1000);

        return true;
    }

    function parar() {
        limparTemporizador();
        limparControles();

        andando = false;
        direcaoAtual = null;

        return true;
    }

    function pular(
        duracao = 0.2
    ) {
        const tempo =
            Math.max(
                0.05,
                Math.min(
                    Number(duracao) || 0.2,
                    1
                )
            );

        try {
            bot.setControlState(
                "jump",
                true
            );

            setTimeout(() => {
                try {
                    bot.setControlState(
                        "jump",
                        false
                    );
                } catch (_) {}
            }, tempo * 1000);

            return true;
        } catch (erro) {
            console.error(
                "🦘 Erro ao pular:",
                erro.message
            );

            return false;
        }
    }

    async function olhar(
        yaw,
        pitch = 0
    ) {
        if (
            !Number.isFinite(
                Number(yaw)
            ) ||
            !Number.isFinite(
                Number(pitch)
            )
        ) {
            return false;
        }

        try {
            await bot.look(
                Number(yaw),
                Number(pitch),
                true
            );

            return true;
        } catch (erro) {
            console.error(
                "👀 Erro ao olhar:",
                erro.message
            );

            return false;
        }
    }

    async function olharPara(
        x,
        y,
        z
    ) {
        if (
            !Number.isFinite(
                Number(x)
            ) ||
            !Number.isFinite(
                Number(y)
            ) ||
            !Number.isFinite(
                Number(z)
            )
        ) {
            return false;
        }

        try {
            await bot.lookAt(
                {
                    x: Number(x),
                    y: Number(y),
                    z: Number(z)
                },
                true
            );

            return true;
        } catch (erro) {
            console.error(
                "👀 Erro ao olhar para posição:",
                erro.message
            );

            return false;
        }
    }

    async function olharDirecao(
        direcao
    ) {
        const valor =
            String(
                direcao || ""
            )
                .trim()
                .toLowerCase();

        const yawAtual =
            bot.entity?.yaw || 0;

        const pitchAtual =
            bot.entity?.pitch || 0;

        const doisPi =
            Math.PI * 2;

        const ajustes = {
            frente: 0,
            tras: Math.PI,
            esquerda: Math.PI / 2,
            direita: -Math.PI / 2,

            norte: Math.PI,
            sul: 0,
            leste: -Math.PI / 2,
            oeste: Math.PI / 2
        };

        if (
            ajustes[valor] === undefined
        ) {
            return false;
        }

        let yaw;

        if (
            valor === "norte" ||
            valor === "sul" ||
            valor === "leste" ||
            valor === "oeste"
        ) {
            yaw = ajustes[valor];
        } else {
            yaw =
                yawAtual +
                ajustes[valor];
        }

        yaw =
            ((yaw + Math.PI) %
                doisPi) -
            Math.PI;

        return olhar(
            yaw,
            pitchAtual
        );
    }

    function andarContinuo(
        direcao = "frente"
    ) {
        const controle =
            normalizarDirecao(
                direcao
            );

        if (!controle) {
            return false;
        }

        limparTemporizador();

        const sucesso =
            aplicarDirecao(
                controle
            );

        if (!sucesso) {
            return false;
        }

        andando = true;
        direcaoAtual = controle;

        return true;
    }

    function correr(
        ativo = true
    ) {
        try {
            bot.setControlState(
                "sprint",
                Boolean(ativo)
            );

            return true;
        } catch (erro) {
            console.error(
                "🏃 Erro ao controlar corrida:",
                erro.message
            );

            return false;
        }
    }

    function agachar(
        ativo = true
    ) {
        try {
            bot.setControlState(
                "sneak",
                Boolean(ativo)
            );

            return true;
        } catch (erro) {
            console.error(
                "🧎 Erro ao controlar agachamento:",
                erro.message
            );

            return false;
        }
    }

    function limparEstados() {
        limparTemporizador();
        limparControles();

        andando = false;
        direcaoAtual = null;

        return true;
    }

    function obterEstado() {
        const posicao =
            bot.entity?.position;

        const velocidade =
            bot.entity?.velocity;

        return {
            andando,
            direcao:
                direcaoAtual,

            posicao: posicao
                ? {
                    x: posicao.x,
                    y: posicao.y,
                    z: posicao.z
                }
                : null,

            rotacao:
                bot.entity
                    ? {
                        yaw:
                            bot.entity.yaw,
                        pitch:
                            bot.entity.pitch
                    }
                    : null,

            velocidade: velocidade
                ? {
                    x: velocidade.x,
                    y: velocidade.y,
                    z: velocidade.z
                }
                : null
        };
    }

    return {
        andar,
        andarContinuo,
        parar,
        pular,
        olhar,
        olharPara,
        olharDirecao,
        correr,
        agachar,
        limparEstados,
        obterEstado
    };
}

module.exports = {
    criarMovimento
};