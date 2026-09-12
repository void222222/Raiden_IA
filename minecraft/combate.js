function criarCombate(contexto) {
    const bot = contexto.bot;

    let alvoAtual = null;
    let atacando = false;

    const DISTANCIA_ATAQUE = 3.2;
    const DISTANCIA_BUSCA = 16;

    const HOSTIS = new Set([
        "zombie",
        "husk",
        "drowned",
        "skeleton",
        "stray",
        "bogged",
        "creeper",
        "spider",
        "cave_spider",
        "witch",
        "pillager",
        "vindicator",
        "evoker",
        "ravager",
        "phantom",
        "enderman",
        "silverfish",
        "endermite",
        "slime",
        "magma_cube",
        "blaze",
        "ghast",
        "piglin",
        "piglin_brute",
        "hoglin",
        "zoglin",
        "warden"
    ]);


    function distanciaPara(entidade) {
        if (
            !entidade?.position ||
            !bot.entity?.position
        ) {
            return Infinity;
        }

        return bot.entity.position.distanceTo(
            entidade.position
        );
    }


    function entidadeValida(entidade) {
        return !!(
            entidade &&
            entidade !== bot.entity &&
            entidade.position &&
            entidade.isValid !== false
        );
    }


    function ehHostil(entidade) {
        if (!entidadeValida(entidade)) {
            return false;
        }

        return HOSTIS.has(
            String(
                entidade.name || ""
            ).toLowerCase()
        );
    }


    function procurarInimigos(
        distancia = DISTANCIA_BUSCA
    ) {
        return Object.values(
            bot.entities
        )
            .filter(entidade => {
                return (
                    ehHostil(entidade) &&
                    distanciaPara(entidade) <=
                        distancia
                );
            })
            .sort(
                (a, b) =>
                    distanciaPara(a) -
                    distanciaPara(b)
            );
    }


    function procurarInimigoMaisProximo(
        distancia = DISTANCIA_BUSCA
    ) {
        return (
            procurarInimigos(distancia)[0] ||
            null
        );
    }


    async function mirar(entidade) {
        if (!entidadeValida(entidade)) {
            return false;
        }

        try {
            const altura =
                entidade.height
                    ? entidade.height * 0.5
                    : 0.8;

            await bot.lookAt(
                entidade.position.offset(
                    0,
                    altura,
                    0
                ),
                true
            );

            return true;

        } catch (erro) {
            console.error(
                "⚔️ Erro ao mirar:",
                erro.message
            );

            return false;
        }
    }


    async function atacar(entidadeOuNome) {
        let entidade = entidadeOuNome;

        if (
            typeof entidadeOuNome ===
            "string"
        ) {
            const nome =
                entidadeOuNome.toLowerCase();

            entidade =
                Object.values(
                    bot.entities
                ).find(item => {
                    return (
                        item !== bot.entity &&
                        (
                            String(
                                item.name || ""
                            ).toLowerCase() ===
                                nome ||
                            String(
                                item.displayName ||
                                ""
                            ).toLowerCase() ===
                                nome
                        )
                    );
                });
        }

        if (!entidadeValida(entidade)) {
            return false;
        }

        if (
            distanciaPara(entidade) >
            DISTANCIA_ATAQUE
        ) {
            return false;
        }

        try {
            alvoAtual = entidade;
            atacando = true;

            const mirou =
                await mirar(entidade);

            if (!mirou) {
                return false;
            }

            bot.attack(entidade);

            return true;

        } catch (erro) {
            console.error(
                "⚔️ Erro ao atacar:",
                erro.message
            );

            return false;
        }
    }


    async function atacarMaisProximo(
        distancia = DISTANCIA_BUSCA
    ) {
        const inimigo =
            procurarInimigoMaisProximo(
                distancia
            );

        if (!inimigo) {
            return false;
        }

        return atacar(inimigo);
    }


    function parar() {
        alvoAtual = null;
        atacando = false;

        try {
            bot.stopDigging();
        } catch (_) {}

        return true;
    }


    function obterAlvo() {
        return alvoAtual;
    }


    function obterEstado() {
        return {
            atacando,
            alvo: alvoAtual
                ? {
                    id: alvoAtual.id,
                    nome: alvoAtual.name,
                    displayName:
                        alvoAtual.displayName,
                    distancia:
                        distanciaPara(
                            alvoAtual
                        )
                }
                : null
        };
    }


    return {
        procurarInimigos,
        procurarInimigoMaisProximo,
        mirar,
        atacar,
        atacarMaisProximo,
        parar,
        obterAlvo,
        obterEstado
    };
}


module.exports = {
    criarCombate
};