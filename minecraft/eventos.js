function criarEventos(contexto) {
    const bot = contexto.bot;

    const listeners = [];

    // --------------------------------------------------------
    // 👁️ BOLHA DE PERCEPÇÃO DA RAIDEN
    // --------------------------------------------------------

    const RAIO_PERCEPCAO = 30;
    const RAIO_PERCEPCAO_QUADRADO =
        RAIO_PERCEPCAO * RAIO_PERCEPCAO;

    // --------------------------------------------------------
    // 🔌 EMISSÃO
    // --------------------------------------------------------

    function emitir(
        evento,
        dados = {}
    ) {
        if (
            typeof contexto.enviarEvento !==
            "function"
        ) {
            return false;
        }

        return contexto.enviarEvento(
            evento,
            dados
        );
    }

    // --------------------------------------------------------
    // 🎧 REGISTRO GENÉRICO
    // --------------------------------------------------------

    function registrar(
        evento,
        callback
    ) {
        bot.on(
            evento,
            callback
        );

        listeners.push({
            evento,
            callback
        });
    }

    // --------------------------------------------------------
    // 🧰 HELPERS DE ESTADO
    // --------------------------------------------------------

    function posicaoParaJson(posicao) {
        if (!posicao) {
            return null;
        }

        return {
            x: posicao.x,
            y: posicao.y,
            z: posicao.z
        };
    }

    function entidadeParaJson(entidade) {
        if (!entidade) {
            return null;
        }

        return {
            id: entidade.id,
            nome: entidade.name || null,
            tipo: entidade.type || null,
            posicao: posicaoParaJson(
                entidade.position
            )
        };
    }

    // --------------------------------------------------------
    // 👁️ DISTÂNCIA DA BOLHA
    // --------------------------------------------------------

    function entidadeDentroDaBolha(
        entidade
    ) {
        if (!entidade) {
            return false;
        }

        const posicaoRaiden =
            bot.entity?.position;

        const posicaoEntidade =
            entidade.position;

        if (
            !posicaoRaiden ||
            !posicaoEntidade
        ) {
            return false;
        }

        const dx =
            posicaoEntidade.x -
            posicaoRaiden.x;

        const dy =
            posicaoEntidade.y -
            posicaoRaiden.y;

        const dz =
            posicaoEntidade.z -
            posicaoRaiden.z;

        const distanciaQuadrada =
            dx * dx +
            dy * dy +
            dz * dz;

        return (
            distanciaQuadrada <=
            RAIO_PERCEPCAO_QUADRADO
        );
    }

    // --------------------------------------------------------
    // 🎬 REGISTRO DE TODOS OS EVENTOS
    // --------------------------------------------------------

    function registrarTodos() {
        if (listeners.length > 0) {
            return false;
        }

        // ====================================================
        // 🌍 CICLO DE VIDA DO BOT
        // ====================================================

        registrar(
            "spawn",
            () => {
                emitir(
                    "spawn",
                    {
                        posicao:
                            posicaoParaJson(
                                bot.entity?.position
                            )
                    }
                );
            }
        );

        registrar(
            "death",
            () => {
                emitir("morte");
            }
        );

        registrar(
            "respawn",
            () => {
                emitir("respawn");
            }
        );

        registrar(
            "end",
            motivo => {
                emitir(
                    "desconectado",
                    {
                        motivo:
                            motivo || null
                    }
                );
            }
        );

        registrar(
            "kicked",
            (
                razao,
                mensagem,
                options
            ) => {
                emitir(
                    "expulso",
                    {
                        razao,
                        mensagem,
                        options
                    }
                );
            }
        );

        // ====================================================
        // 💬 COMUNICAÇÃO
        // ====================================================

        registrar(
            "chat",
            (
                username,
                mensagem
            ) => {
                emitir(
                    "chat",
                    {
                        jogador: username,
                        mensagem
                    }
                );
            }
        );

        registrar(
            "messagestr",
            mensagem => {
                emitir(
                    "mensagem",
                    {
                        mensagem
                    }
                );
            }
        );

        // ====================================================
        // ❤️ ESTADO DO CORPO
        // ====================================================

        registrar(
            "health",
            () => {
                emitir(
                    "vida",
                    {
                        vida: bot.health,
                        fome: bot.food,
                        saturacao:
                            bot.foodSaturation
                    }
                );
            }
        );

        registrar(
            "experience",
            experiencia => {
                emitir(
                    "experiencia",
                    {
                        nivel:
                            experiencia?.level ??
                            0,

                        experiencia:
                            experiencia?.progress ??
                            0,

                        pontos:
                            experiencia?.points ??
                            0
                    }
                );
            }
        );

        // ====================================================
        // 🧍 ENTIDADES
        // ====================================================
        //
        // A Raiden só recebe entidades dentro da bolha
        // de 30 blocos ao redor dela.
        //
        // O Mineflayer continua carregando entidades
        // normalmente. O filtro acontece somente na
        // comunicação com a Raiden.
        // ====================================================

        registrar(
            "entitySpawn",
            entidade => {
                if (!entidade) {
                    return;
                }

                if (
                    !entidadeDentroDaBolha(
                        entidade
                    )
                ) {
                    return;
                }

                emitir(
                    "entidade_spawn",
                    entidadeParaJson(
                        entidade
                    )
                );
            }
        );

        registrar(
            "entityGone",
            entidade => {
                if (!entidade) {
                    return;
                }

                if (
                    !entidadeDentroDaBolha(
                        entidade
                    )
                ) {
                    return;
                }

                emitir(
                    "entidade_saiu",
                    entidadeParaJson(
                        entidade
                    )
                );
            }
        );

        // ====================================================
        // 🎒 INVENTÁRIO / COLETA
        // ====================================================

        registrar(
            "playerCollect",
            (
                collector,
                collected
            ) => {
                emitir(
                    "item_coletado",
                    {
                        coletor:
                            collector?.username ||
                            null,

                        entidade:
                            entidadeParaJson(
                                collected
                            )
                    }
                );
            }
        );

        // ====================================================
        // ⛏️ MUNDO
        // ====================================================

        registrar(
            "diggingCompleted",
            bloco => {
                emitir(
                    "bloco_quebrado",
                    {
                        nome:
                            bloco?.name ||
                            null,

                        posicao:
                            posicaoParaJson(
                                bloco?.position
                            )
                    }
                );
            }
        );

        registrar(
            "rain",
            () => {
                emitir(
                    "chuva",
                    {
                        chovendo:
                            !!bot.isRaining
                    }
                );
            }
        );

        // ====================================================
        // ⚠️ ERROS
        // ====================================================

        registrar(
            "error",
            erro => {
                emitir(
                    "erro",
                    {
                        mensagem:
                            erro?.message ||
                            String(erro)
                    }
                );
            }
        );

        return true;
    }

    // --------------------------------------------------------
    // 🧹 DESTRUIR
    // --------------------------------------------------------

    function destruir() {
        for (
            const listener of listeners
        ) {
            bot.removeListener(
                listener.evento,
                listener.callback
            );
        }

        listeners.length = 0;

        return true;
    }

    // --------------------------------------------------------
    // 📋 INSPEÇÃO
    // --------------------------------------------------------

    function obterEventos() {
        return listeners.map(
            listener =>
                listener.evento
        );
    }

    function obterEstado() {
        return {
            listeners:
                listeners.length,

            eventos:
                obterEventos(),

            raioPercepcao:
                RAIO_PERCEPCAO
        };
    }

    // --------------------------------------------------------
    // 📦 API PÚBLICA
    // --------------------------------------------------------

    return {
        registrar: registrarTodos,
        destruir,
        emitir,
        obterEventos,
        obterEstado
    };
}

module.exports = {
    criarEventos
};