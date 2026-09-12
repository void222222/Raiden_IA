/**
 * 👁️ PERCEPÇÃO — RAIDEN MINECRAFT
 *
 * Camada de percepção do mundo.
 *
 * Não decide ações.
 * Não executa ações.
 * Apenas transforma o estado do Mineflayer
 * em informações úteis para os outros módulos.
 */

function criarPercepcao(contexto) {
    const bot = contexto.bot;

    const CONFIG = {
        distanciaEntidades: 16,
        distanciaPerigos: 8,
        quantidadeMaximaEntidades: 50
    };

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

    function numero(valor, padrao = 0) {
        const resultado =
            Number(valor);

        return Number.isFinite(resultado)
            ? resultado
            : padrao;
    }

    function distancia(a, b) {
        if (!a || !b) {
            return Infinity;
        }

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        return Math.sqrt(
            dx * dx +
            dy * dy +
            dz * dz
        );
    }

    function obterPosicao() {
        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return null;
        }

        return {
            x: numero(posicao.x),
            y: numero(posicao.y),
            z: numero(posicao.z)
        };
    }

    function obterRotacao() {
        if (!bot.entity) {
            return {
                yaw: 0,
                pitch: 0
            };
        }

        return {
            yaw: numero(
                bot.entity.yaw
            ),
            pitch: numero(
                bot.entity.pitch
            )
        };
    }

    function obterVelocidade() {
        const velocidade =
            bot.entity?.velocity;

        if (!velocidade) {
            return {
                x: 0,
                y: 0,
                z: 0
            };
        }

        return {
            x: numero(velocidade.x),
            y: numero(velocidade.y),
            z: numero(velocidade.z)
        };
    }

    function obterItemNaMao() {
        const item =
            bot.heldItem;

        if (!item) {
            return null;
        }

        return {
            slot: item.slot,
            id: item.type,
            nome: item.name,
            displayName:
                item.displayName,
            quantidade:
                item.count,
            durabilidade:
                item.durabilityUsed,
            durabilidadeMaxima:
                item.maxDurability
        };
    }

    function obterInventario() {
        if (!bot.inventory?.slots) {
            return [];
        }

        return bot.inventory.slots
            .filter(Boolean)
            .map(item => ({
                slot: item.slot,
                id: item.type,
                nome: item.name,
                displayName:
                    item.displayName,
                quantidade:
                    item.count,
                durabilidade:
                    item.durabilityUsed,
                durabilidadeMaxima:
                    item.maxDurability
            }));
    }

    function obterEntidadesProximas(
        distanciaMaxima =
            CONFIG.distanciaEntidades
    ) {
        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return [];
        }

        return Object.values(
            bot.entities || {}
        )
            .filter(entidade => {
                if (
                    !entidade ||
                    entidade === bot.entity ||
                    !entidade.position
                ) {
                    return false;
                }

                return (
                    distancia(
                        posicao,
                        entidade.position
                    ) <=
                    distanciaMaxima
                );
            })
            .map(entidade => {
                const nome =
                    String(
                        entidade.name ||
                        entidade.displayName ||
                        ""
                    ).toLowerCase();

                const ehJogador =
                    entidade.type ===
                    "player";

                return {
                    id: entidade.id,
                    tipo: entidade.type,
                    nome:
                        entidade.name ||
                        null,
                    displayName:
                        entidade.displayName ||
                        null,
                    distancia:
                        Number(
                            distancia(
                                posicao,
                                entidade.position
                            ).toFixed(2)
                        ),
                    posicao: {
                        x: numero(
                            entidade.position.x
                        ),
                        y: numero(
                            entidade.position.y
                        ),
                        z: numero(
                            entidade.position.z
                        )
                    },
                    vida:
                        entidade.health ??
                        null,
                    fome:
                        entidade.food ??
                        null,
                    jogador:
                        ehJogador,
                    hostil:
                        HOSTIS.has(nome)
                };
            })
            .sort(
                (a, b) =>
                    a.distancia -
                    b.distancia
            )
            .slice(
                0,
                CONFIG.quantidadeMaximaEntidades
            );
    }

    function obterJogadoresProximos(
        distanciaMaxima =
            CONFIG.distanciaEntidades
    ) {
        return obterEntidadesProximas(
            distanciaMaxima
        ).filter(
            entidade =>
                entidade.jogador
        );
    }

    function obterInimigosProximos(
        distanciaMaxima =
            CONFIG.distanciaEntidades
    ) {
        return obterEntidadesProximas(
            distanciaMaxima
        ).filter(
            entidade =>
                entidade.hostil
        );
    }

    function obterBloco(x, y, z) {
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
            return null;
        }

        try {
            const bloco =
                bot.blockAt({
                    x: Math.floor(x),
                    y: Math.floor(y),
                    z: Math.floor(z)
                });

            if (!bloco) {
                return null;
            }

            return {
                nome: bloco.name,
                displayName:
                    bloco.displayName,
                id: bloco.type,
                posicao: {
                    x: bloco.position.x,
                    y: bloco.position.y,
                    z: bloco.position.z
                },
                solido:
                    bloco.boundingBox ===
                    "block",
                transparente:
                    bloco.transparent === true,
                colidivel:
                    bloco.boundingBox !==
                    "empty",
                quebravel:
                    bloco.diggable !== false
            };
        } catch (_) {
            return null;
        }
    }

    function obterBlocoCompleto(
        x,
        y,
        z
    ) {
        try {
            return bot.blockAt({
                x: Math.floor(x),
                y: Math.floor(y),
                z: Math.floor(z)
            });
        } catch (_) {
            return null;
        }
    }

    function obterBlocoSob() {
        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return null;
        }

        return obterBloco(
            Math.floor(posicao.x),
            Math.floor(posicao.y) - 1,
            Math.floor(posicao.z)
        );
    }

    function obterBlocoFrente() {
        const posicao =
            bot.entity?.position;

        const yaw =
            bot.entity?.yaw;

        if (
            !posicao ||
            !Number.isFinite(yaw)
        ) {
            return null;
        }

        const x =
            Math.floor(
                posicao.x -
                Math.sin(yaw)
            );

        const z =
            Math.floor(
                posicao.z -
                Math.cos(yaw)
            );

        return obterBloco(
            x,
            Math.floor(posicao.y),
            z
        );
    }

    function obterBlocoEsquerda() {
        const posicao =
            bot.entity?.position;

        const yaw =
            bot.entity?.yaw;

        if (
            !posicao ||
            !Number.isFinite(yaw)
        ) {
            return null;
        }

        const x =
            Math.floor(
                posicao.x -
                Math.cos(yaw)
            );

        const z =
            Math.floor(
                posicao.z +
                Math.sin(yaw)
            );

        return obterBloco(
            x,
            Math.floor(posicao.y),
            z
        );
    }

    function obterBlocoDireita() {
        const posicao =
            bot.entity?.position;

        const yaw =
            bot.entity?.yaw;

        if (
            !posicao ||
            !Number.isFinite(yaw)
        ) {
            return null;
        }

        const x =
            Math.floor(
                posicao.x +
                Math.cos(yaw)
            );

        const z =
            Math.floor(
                posicao.z -
                Math.sin(yaw)
            );

        return obterBloco(
            x,
            Math.floor(posicao.y),
            z
        );
    }

    function obterAmbiente() {
        const posicao =
            obterPosicao();

        return {
            tempo:
                bot.time?.time ?? null,

            hora:
                bot.time?.timeOfDay ??
                null,

            dia:
                bot.time?.day ??
                null,

            chuva:
                bot.isRaining === true,

            trovao:
                bot.thunderState > 0,

            dificuldade:
                bot.game?.difficulty ??
                null,

            modoJogo:
                bot.game?.gameMode ??
                null,

            nomeMundo:
                bot.game?.levelType ??
                null,

            posicao
        };
    }

    function obterAmbienteProximo() {
        const blocos = {};

        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return blocos;
        }

        const x =
            Math.floor(posicao.x);

        const y =
            Math.floor(posicao.y);

        const z =
            Math.floor(posicao.z);

        const offsets = {
            centro: [0, 0, 0],
            baixo: [0, -1, 0],
            cima: [0, 1, 0],
            frente: [0, 0, 1],
            tras: [0, 0, -1],
            esquerda: [-1, 0, 0],
            direita: [1, 0, 0]
        };

        for (
            const [nome, offset]
            of Object.entries(offsets)
        ) {
            blocos[nome] =
                obterBloco(
                    x + offset[0],
                    y + offset[1],
                    z + offset[2]
                );
        }

        return blocos;
    }

    function encontrarBlocos(
        nome,
        distanciaMaxima = 8,
        limite = 20
    ) {
        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return [];
        }

        const distanciaLimitada =
            Math.max(
                1,
                Math.min(
                    Math.floor(
                        distanciaMaxima
                    ),
                    16
                )
            );

        const resultados = [];
        const alvo =
            String(
                nome || ""
            ).toLowerCase();

        const origemX =
            Math.floor(posicao.x);

        const origemY =
            Math.floor(posicao.y);

        const origemZ =
            Math.floor(posicao.z);

        for (
            let x =
                origemX -
                distanciaLimitada;
            x <=
                origemX +
                distanciaLimitada;
            x++
        ) {
            for (
                let y =
                    origemY -
                    distanciaLimitada;
                y <=
                    origemY +
                    distanciaLimitada;
                y++
            ) {
                for (
                    let z =
                        origemZ -
                        distanciaLimitada;
                    z <=
                        origemZ +
                        distanciaLimitada;
                    z++
                ) {
                    const bloco =
                        obterBlocoCompleto(
                            x,
                            y,
                            z
                        );

                    if (
                        !bloco ||
                        bloco.name
                            ?.toLowerCase() !==
                            alvo
                    ) {
                        continue;
                    }

                    resultados.push({
                        nome: bloco.name,
                        displayName:
                            bloco.displayName,
                        id: bloco.type,
                        posicao: {
                            x,
                            y,
                            z
                        },
                        distancia:
                            Number(
                                distancia(
                                    posicao,
                                    {
                                        x,
                                        y,
                                        z
                                    }
                                ).toFixed(2)
                            )
                    });

                    if (
                        resultados.length >=
                        limite
                    ) {
                        return resultados;
                    }
                }
            }
        }

        return resultados.sort(
            (a, b) =>
                a.distancia -
                b.distancia
        );
    }

    function obterPerigos() {
        const perigos = [];

        const posicao =
            bot.entity?.position;

        if (!posicao) {
            return perigos;
        }

        const raio = 3;

        for (
            let x =
                Math.floor(posicao.x) -
                raio;
            x <=
                Math.floor(posicao.x) +
                raio;
            x++
        ) {
            for (
                let y =
                    Math.floor(posicao.y) -
                    1;
                y <=
                    Math.floor(posicao.y) +
                    2;
                y++
            ) {
                for (
                    let z =
                        Math.floor(posicao.z) -
                        raio;
                    z <=
                        Math.floor(posicao.z) +
                        raio;
                    z++
                ) {
                    const bloco =
                        obterBlocoCompleto(
                            x,
                            y,
                            z
                        );

                    if (!bloco) {
                        continue;
                    }

                    const nome =
                        String(
                            bloco.name || ""
                        ).toLowerCase();

                    if (
                        nome.includes(
                            "lava"
                        ) ||
                        nome ===
                            "fire" ||
                        nome ===
                            "soul_fire" ||
                        nome ===
                            "magma_block"
                    ) {
                        perigos.push({
                            tipo:
                                nome.includes(
                                    "lava"
                                )
                                    ? "lava"
                                    : "fogo",
                            nome,
                            posicao: {
                                x,
                                y,
                                z
                            },
                            distancia:
                                Number(
                                    distancia(
                                        posicao,
                                        {
                                            x,
                                            y,
                                            z
                                        }
                                    ).toFixed(2)
                                )
                        });
                    }
                }
            }
        }

        return perigos.sort(
            (a, b) =>
                a.distancia -
                b.distancia
        );
    }

    function obterEstado() {
        return {
            conectado:
                bot.player != null,

            posicao:
                obterPosicao(),

            rotacao:
                obterRotacao(),

            velocidade:
                obterVelocidade(),

            vida:
                numero(
                    bot.health,
                    20
                ),

            fome:
                numero(
                    bot.food,
                    20
                ),

            experiencia: {
                nivel:
                    bot.experience?.level ??
                    0,

                pontos:
                    bot.experience?.points ??
                    0,

                progresso:
                    bot.experience?.progress ??
                    0
            },

            itemNaMao:
                obterItemNaMao(),

            inventario:
                obterInventario(),

            entidades:
                obterEntidadesProximas(),

            jogadores:
                obterJogadoresProximos(),

            inimigos:
                obterInimigosProximos(),

            ambiente:
                obterAmbiente(),

            ambienteProximo:
                obterAmbienteProximo(),

            perigos:
                obterPerigos(),

            blocoSob:
                obterBlocoSob(),

            blocoFrente:
                obterBlocoFrente()
        };
    }

    return {
        obterPosicao,
        obterRotacao,
        obterVelocidade,
        obterInventario,
        obterItemNaMao,
        obterEntidadesProximas,
        obterJogadoresProximos,
        obterInimigosProximos,
        obterBloco,
        obterBlocoCompleto,
        obterBlocoSob,
        obterBlocoFrente,
        obterBlocoEsquerda,
        obterBlocoDireita,
        obterAmbiente,
        obterAmbienteProximo,
        encontrarBlocos,
        obterPerigos,
        obterEstado
    };
}

module.exports = {
    criarPercepcao
};