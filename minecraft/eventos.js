function criarEventos(contexto) {
    const bot = contexto.bot;

    const listeners = [];

    function emitir(
        evento,
        dados = {}
    ) {
        if (
            typeof contexto.enviarEvento ===
            "function"
        ) {
            contexto.enviarEvento(
                evento,
                dados
            );
        }
    }

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

    function registrarTodos() {
        if (listeners.length > 0) {
            return false;
        }

        registrar(
            "spawn",
            () => {
                emitir(
                    "spawn",
                    {
                        posicao:
                            bot.entity?.position
                                ? {
                                    x: bot.entity.position.x,
                                    y: bot.entity.position.y,
                                    z: bot.entity.position.z
                                }
                                : null
                    }
                );
            }
        );

        registrar(
            "chat",
            (
                username,
                mensagem
            ) => {
                emitir(
                    "chat",
                    {
                        jogador:
                            username,
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

        registrar(
            "entitySpawn",
            entidade => {
                if (!entidade) {
                    return;
                }

                emitir(
                    "entidade_spawn",
                    {
                        id: entidade.id,
                        nome:
                            entidade.name ||
                            null,
                        tipo:
                            entidade.type ||
                            null,
                        posicao:
                            entidade.position
                                ? {
                                    x: entidade.position.x,
                                    y: entidade.position.y,
                                    z: entidade.position.z
                                }
                                : null
                    }
                );
            }
        );

        registrar(
            "entityGone",
            entidade => {
                if (!entidade) {
                    return;
                }

                emitir(
                    "entidade_saiu",
                    {
                        id: entidade.id,
                        nome:
                            entidade.name ||
                            null,
                        tipo:
                            entidade.type ||
                            null
                    }
                );
            }
        );

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
                            collected
                                ? {
                                    id:
                                        collected.id,
                                    nome:
                                        collected.name ||
                                        null,
                                    tipo:
                                        collected.type ||
                                        null
                                }
                                : null
                    }
                );
            }
        );

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
                            bloco?.position
                                ? {
                                    x:
                                        bloco.position.x,
                                    y:
                                        bloco.position.y,
                                    z:
                                        bloco.position.z
                                }
                                : null
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

        registrar(
            "end",
            motivo => {
                emitir(
                    "desconectado",
                    {
                        motivo:
                            motivo ||
                            null
                    }
                );
            }
        );

        return true;
    }

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
                obterEventos()
        };
    }

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