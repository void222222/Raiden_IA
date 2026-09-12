function criarSeguranca(contexto) {
    const bot = contexto.bot;
    const percepcao = contexto.percepcao;
    const movimento = contexto.movimento;
    const combate = contexto.combate;

    const CONFIG = {
        vidaCritica: 6,
        fomeCritica: 6,
        alturaMinimaVoid: 4,
        distanciaInimigo: 8
    };

    const BLOCOS_PERIGOSOS = new Set([
        "lava",
        "flowing_lava",
        "fire",
        "soul_fire",
        "cactus",
        "magma_block"
    ]);

    function obterVida() {
        return Number(bot.health ?? 0);
    }

    function obterFome() {
        return Number(bot.food ?? 0);
    }

    function obterPosicao() {
        if (!bot.entity?.position) {
            return null;
        }

        return {
            x: bot.entity.position.x,
            y: bot.entity.position.y,
            z: bot.entity.position.z
        };
    }

    function obterBloco(x, y, z) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            return null;
        }

        try {
            return percepcao.obterBloco(
                Math.floor(x),
                Math.floor(y),
                Math.floor(z)
            );
        } catch (_) {
            return null;
        }
    }

    function verificarPerigosAmbientais() {
        const perigos = [];
        const posicao = obterPosicao();

        if (!posicao) {
            return perigos;
        }

        const blocos = [
            {
                nome: "atual",
                x: posicao.x,
                y: posicao.y,
                z: posicao.z
            },
            {
                nome: "abaixo",
                x: posicao.x,
                y: posicao.y - 1,
                z: posicao.z
            },
            {
                nome: "frente",
                x: posicao.x,
                y: posicao.y,
                z: posicao.z + 1
            }
        ];

        for (const referencia of blocos) {
            const bloco = obterBloco(
                referencia.x,
                referencia.y,
                referencia.z
            );

            if (!bloco) {
                continue;
            }

            if (
                BLOCOS_PERIGOSOS.has(
                    String(bloco.nome || "")
                        .toLowerCase()
                )
            ) {
                perigos.push({
                    tipo: "bloco_perigoso",
                    bloco: bloco.nome,
                    posicao: {
                        x: Math.floor(referencia.x),
                        y: Math.floor(referencia.y),
                        z: Math.floor(referencia.z)
                    }
                });
            }
        }

        return perigos;
    }

    function verificarVida() {
        if (
            obterVida() <= CONFIG.vidaCritica
        ) {
            return {
                tipo: "vida_critica",
                valor: obterVida()
            };
        }

        return null;
    }

    function verificarFome() {
        if (
            obterFome() <= CONFIG.fomeCritica
        ) {
            return {
                tipo: "fome_critica",
                valor: obterFome()
            };
        }

        return null;
    }

    function verificarVoid() {
        const posicao = obterPosicao();

        if (!posicao) {
            return null;
        }

        if (
            posicao.y <=
            CONFIG.alturaMinimaVoid
        ) {
            return {
                tipo: "risco_void",
                altura: posicao.y
            };
        }

        return null;
    }

    function verificarInimigos() {
        if (!percepcao) {
            return [];
        }

        const entidades =
            percepcao.obterEntidadesProximas(
                CONFIG.distanciaInimigo
            ) || [];

        return entidades
            .filter(entidade => entidade.hostil)
            .map(entidade => ({
                tipo: "inimigo",
                id: entidade.id,
                nome: entidade.nome,
                distancia: entidade.distancia
            }));
    }

    function obterPerigos() {
        const perigos = [];

        const vida = verificarVida();

        if (vida) {
            perigos.push(vida);
        }

        const fome = verificarFome();

        if (fome) {
            perigos.push(fome);
        }

        const voidPerigo = verificarVoid();

        if (voidPerigo) {
            perigos.push(voidPerigo);
        }

        perigos.push(
            ...verificarPerigosAmbientais()
        );

        perigos.push(
            ...verificarInimigos()
        );

        return perigos;
    }

    function temPerigoCritico() {
        const perigos =
            obterPerigos();

        return perigos.some(perigo => {
            return [
                "vida_critica",
                "risco_void",
                "bloco_perigoso"
            ].includes(perigo.tipo);
        });
    }

    function estaEmPerigo() {
        return obterPerigos().length > 0;
    }

    function estaEmPerigoCritico() {
        return temPerigoCritico();
    }

    function podeExecutar(acao) {
        if (!acao) {
            return false;
        }

        if (
            acao === "parar" ||
            acao === "nenhuma"
        ) {
            return true;
        }

        if (
            acao === "andar" &&
            temPerigoCritico()
        ) {
            return false;
        }

        if (
            acao === "atacar" &&
            obterVida() <= CONFIG.vidaCritica
        ) {
            return false;
        }

        return true;
    }

    function limparMovimento() {
        if (
            movimento &&
            typeof movimento.parar ===
                "function"
        ) {
            movimento.parar();
        }

        return true;
    }

    function pararTudo() {
        limparMovimento();

        if (
            combate &&
            typeof combate.parar ===
                "function"
        ) {
            combate.parar();
        }

        return true;
    }

    function obterEstado() {
        return {
            vida: obterVida(),
            fome: obterFome(),
            posicao: obterPosicao(),
            emPerigo:
                estaEmPerigo(),
            perigoCritico:
                estaEmPerigoCritico(),
            perigos:
                obterPerigos()
        };
    }

    return {
        obterVida,
        obterFome,
        obterPosicao,

        verificarPerigosAmbientais,
        verificarVida,
        verificarFome,
        verificarVoid,
        verificarInimigos,

        obterPerigos,
        temPerigoCritico,
        estaEmPerigo,
        estaEmPerigoCritico,

        podeExecutar,

        limparMovimento,
        pararTudo,

        obterEstado
    };
}

module.exports = {
    criarSeguranca
};