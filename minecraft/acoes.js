/**
 * 🎮 AÇÕES — RAIDEN MINECRAFT
 *
 * Ponto central de execução das ações da Raiden.
 *
 * Responsabilidades:
 * - receber uma ação
 * - passar pela camada de segurança
 * - encaminhar para o módulo correto
 * - padronizar o resultado
 *
 * Não decide o objetivo da Raiden.
 * Não executa lógica de IA.
 */

function criarAcoes(contexto) {
    const movimento = contexto.movimento;
    const mundo = contexto.mundo;
    const inventario = contexto.inventario;
    const navegacao = contexto.navegacao;
    const combate = contexto.combate;
    const seguranca = contexto.seguranca;
    const crafting = contexto.crafting;
    const construcao = contexto.construcao;
    const bot = contexto.bot;

    function resultado(
        acao,
        sucesso,
        erro = null,
        dados = {}
    ) {
        return {
            sucesso: !!sucesso,
            acao,
            erro,
            ...dados
        };
    }

    async function executar(
        acao,
        parametros = {}
    ) {
        const nomeAcao = String(
            acao || ""
        )
            .trim()
            .toLowerCase();

        if (!nomeAcao) {
            return resultado(
                nomeAcao,
                false,
                "Ação não informada."
            );
        }

        const args =
            parametros &&
            typeof parametros === "object"
                ? parametros
                : {};

        if (nomeAcao === "nenhuma") {
            return resultado(
                nomeAcao,
                true
            );
        }

        if (
            nomeAcao !== "parar" &&
            seguranca
        ) {
            const verificacao =
                seguranca.podeExecutar(
                    nomeAcao,
                    args
                );

            if (!verificacao?.permitido) {
                return resultado(
                    nomeAcao,
                    false,
                    verificacao?.motivo ||
                        "Ação bloqueada pela segurança."
                );
            }
        }

        try {
            switch (nomeAcao) {
                case "andar":
                    return resultado(
                        nomeAcao,
                        await movimento.andar(
                            args.direcao ??
                                "frente",
                            args.duracao ?? 1
                        )
                    );

                case "pular":
                    return resultado(
                        nomeAcao,
                        await movimento.pular()
                    );

                case "parar":
                    return resultado(
                        nomeAcao,
                        movimento.parar()
                    );

                case "olhar":
                    return resultado(
                        nomeAcao,
                        await movimento.olhar(
                            Number(args.x),
                            Number(args.y),
                            Number(args.z)
                        )
                    );

                case "olhar_direcao":
                    return resultado(
                        nomeAcao,
                        await movimento.olharDirecao(
                            args.direcao
                        )
                    );

                case "atacar": {
                    let alvo =
                        args.alvo ??
                        args.nome ??
                        args.entidade;

                    if (!alvo) {
                        return resultado(
                            nomeAcao,
                            false,
                            "Alvo não informado."
                        );
                    }

                    return resultado(
                        nomeAcao,
                        await combate.atacar(
                            alvo
                        )
                    );
                }

                case "atacar_proximo":
                    return resultado(
                        nomeAcao,
                        await combate.atacarMaisProximo(
                            Number(
                                args.distancia ?? 16
                            )
                        )
                    );

                case "parar_combate":
                    return resultado(
                        nomeAcao,
                        combate.parar()
                    );

                case "quebrar":
                    return resultado(
                        nomeAcao,
                        await mundo.quebrar(
                            Number(args.x),
                            Number(args.y),
                            Number(args.z)
                        )
                    );

                case "colocar":
                    return resultado(
                        nomeAcao,
                        await mundo.colocar(
                            args.nomeItem ??
                                args.item,
                            Number(args.x),
                            Number(args.y),
                            Number(args.z),
                            args.face ?? {
                                x: 0,
                                y: 1,
                                z: 0
                            }
                        )
                    );

                case "interagir":
                    return resultado(
                        nomeAcao,
                        await mundo.interagir(
                            Number(args.x),
                            Number(args.y),
                            Number(args.z)
                        )
                    );

                case "usar":
                    return resultado(
                        nomeAcao,
                        await mundo.usarItem()
                    );

                case "equipar":
                    return resultado(
                        nomeAcao,
                        await inventario.equipar(
                            args.nome ??
                                args.item,
                            args.destino ??
                                "hand"
                        )
                    );

                case "desequipar":
                    return resultado(
                        nomeAcao,
                        await inventario.desequipar(
                            args.destino ??
                                "hand"
                        )
                    );

                case "dropar":
                    return resultado(
                        nomeAcao,
                        await inventario.dropar(
                            args.nome ??
                                args.item,
                            Number(
                                args.quantidade ?? 1
                            )
                        )
                    );

                case "ir_para":
                    return resultado(
                        nomeAcao,
                        await navegacao.irPara(
                            Number(args.x),
                            Number(args.y),
                            Number(args.z)
                        )
                    );

                case "ir_para_bloco":
                    return resultado(
                        nomeAcao,
                        await navegacao.irParaBloco(
                            Number(args.x),
                            Number(args.y),
                            Number(args.z),
                            Number(
                                args.distancia ?? 1
                            )
                        )
                    );

                case "ir_para_entidade":
                    return resultado(
                        nomeAcao,
                        await navegacao.irParaEntidade(
                            args.id ??
                                args.entidade
                        )
                    );

                case "seguir":
                    return resultado(
                        nomeAcao,
                        await navegacao.seguir(
                            args.id ??
                                args.entidade ??
                                args.nome
                        )
                    );

                case "parar_navegacao":
                    return resultado(
                        nomeAcao,
                        navegacao.parar()
                    );

                case "craftar":
                    return resultado(
                        nomeAcao,
                        await crafting.craftar(
                            args.nome ??
                                args.item,
                            Number(
                                args.quantidade ?? 1
                            )
                        )
                    );

                case "construir": {
                    const tipo =
                        String(
                            args.tipo ??
                                args.estrutura ??
                                "abrigo_simples"
                        )
                            .trim()
                            .toLowerCase();

                    if (
                        tipo ===
                        "abrigo_simples"
                    ) {
                        return resultado(
                            nomeAcao,
                            await construcao
                                .construirAbrigoSimples({
                                    x: Number(args.x),
                                    y: Number(args.y),
                                    z: Number(args.z),
                                    largura: Number(
                                        args.largura ?? 5
                                    ),
                                    profundidade: Number(
                                        args.profundidade ?? 5
                                    ),
                                    altura: Number(
                                        args.altura ?? 3
                                    ),
                                    nomeItem:
                                        args.nomeItem ??
                                        args.item ??
                                        "oak_planks"
                                })
                        );
                    }

                    if (
                        tipo === "parede"
                    ) {
                        return resultado(
                            nomeAcao,
                            await construcao
                                .construirParede({
                                    x: Number(args.x),
                                    y: Number(args.y),
                                    z: Number(args.z),
                                    largura: Number(
                                        args.largura
                                    ),
                                    altura: Number(
                                        args.altura
                                    ),
                                    nomeItem:
                                        args.nomeItem ??
                                        args.item
                                })
                        );
                    }

                    if (
                        tipo === "piso"
                    ) {
                        return resultado(
                            nomeAcao,
                            await construcao
                                .construirPiso({
                                    x: Number(args.x),
                                    y: Number(args.y),
                                    z: Number(args.z),
                                    largura: Number(
                                        args.largura
                                    ),
                                    profundidade: Number(
                                        args.profundidade
                                    ),
                                    nomeItem:
                                        args.nomeItem ??
                                        args.item
                                })
                        );
                    }

                    if (
                        tipo === "teto"
                    ) {
                        return resultado(
                            nomeAcao,
                            await construcao
                                .construirTeto({
                                    x: Number(args.x),
                                    y: Number(args.y),
                                    z: Number(args.z),
                                    largura: Number(
                                        args.largura
                                    ),
                                    profundidade: Number(
                                        args.profundidade
                                    ),
                                    nomeItem:
                                        args.nomeItem ??
                                        args.item
                                })
                        );
                    }

                    return resultado(
                        nomeAcao,
                        false,
                        `Tipo de construção desconhecido: ${tipo}`
                    );
                }

                case "chat": {
                    const mensagem =
                        String(
                            args.mensagem ??
                                args.texto ??
                                ""
                        ).trim();

                    if (!mensagem) {
                        return resultado(
                            nomeAcao,
                            false,
                            "Mensagem vazia."
                        );
                    }

                    if (
                        mensagem.length > 200
                    ) {
                        return resultado(
                            nomeAcao,
                            false,
                            "Mensagem excede 200 caracteres."
                        );
                    }

                    try {
                        bot.chat(
                            mensagem
                        );

                        return resultado(
                            nomeAcao,
                            true
                        );
                    } catch (erro) {
                        return resultado(
                            nomeAcao,
                            false,
                            erro.message
                        );
                    }
                }

                default:
                    return resultado(
                        nomeAcao,
                        false,
                        `Ação desconhecida: ${nomeAcao}`
                    );
            }
        } catch (erro) {
            console.error(
                `❌ Erro na ação "${nomeAcao}":`,
                erro
            );

            return resultado(
                nomeAcao,
                false,
                erro?.message ||
                    "Erro desconhecido ao executar ação."
            );
        }
    }

    return {
        executar
    };
}

module.exports = {
    criarAcoes
};