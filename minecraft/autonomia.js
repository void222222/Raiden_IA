/**
 * 🧠 AUTONOMIA — RAIDEN MINECRAFT
 *
 * Camada de decisão autônoma do bot.
 *
 * Responsabilidades:
 * - iniciar e parar a autonomia
 * - escolher destinos de exploração
 * - acompanhar navegação
 * - detectar chegada
 * - detectar falta de progresso
 * - reagir a perigos próximos
 * - escolher novos objetivos
 *
 * Não controla movimento diretamente.
 * Usa percepção + navegação.
 */

function criarAutonomia(contexto) {
    const {
        bot,
        percepcao,
        navegacao,
        enviarEvento
    } = contexto;

    const CONFIG = {
        intervaloDecisao: 2000,

        distanciaExploracaoMinima: 8,
        distanciaExploracaoMaxima: 24,

        tempoParadoMaximo: 6000,

        distanciaPerigo: 8
    };

    let ativa = false;
    let intervalo = null;

    let objetivoAtual = null;

    let estado = "parada";
    let motivo = null;

    let iniciadoEm = null;
    let ultimaDecisao = null;

    let ultimaPosicao = null;
    let ultimoMovimento = null;

    let bloqueandoDecisao = false;

    function emitir(tipo, dados = {}) {
        if (typeof enviarEvento !== "function") {
            return;
        }

        try {
            enviarEvento({
                tipo: `minecraft_autonomia_${tipo}`,
                ...dados
            });
        } catch (_) {
            // Eventos não podem derrubar a autonomia.
        }
    }

    function obterPosicao() {
        if (!bot || !bot.entity || !bot.entity.position) {
            return null;
        }

        const pos = bot.entity.position;

        return {
            x: Number(pos.x),
            y: Number(pos.y),
            z: Number(pos.z)
        };
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

    /**
     * Escolhe um ponto aleatório próximo
     * para a Raiden explorar.
     */
    function gerarDestinoExploracao() {
        const origem = obterPosicao();

        if (!origem) {
            return null;
        }

        const distanciaDestino =
            CONFIG.distanciaExploracaoMinima +
            Math.random() *
                (
                    CONFIG.distanciaExploracaoMaxima -
                    CONFIG.distanciaExploracaoMinima
                );

        const angulo =
            Math.random() * Math.PI * 2;

        return {
            x: Math.floor(
                origem.x +
                Math.cos(angulo) *
                distanciaDestino
            ),

            y: Math.floor(origem.y),

            z: Math.floor(
                origem.z +
                Math.sin(angulo) *
                distanciaDestino
            )
        };
    }

    /**
     * Obtém os perigos detectados pela percepção.
     */
    function obterPerigos() {
        if (!percepcao) {
            return [];
        }

        try {
            if (
                typeof percepcao.obterPerigos ===
                "function"
            ) {
                return (
                    percepcao.obterPerigos() ||
                    []
                );
            }

            if (
                typeof percepcao.obterInimigosProximos ===
                "function"
            ) {
                return (
                    percepcao.obterInimigosProximos() ||
                    []
                );
            }
        } catch (_) {
            return [];
        }

        return [];
    }

    /**
     * Verifica se existe perigo próximo.
     */
    function existePerigo() {
        const perigos = obterPerigos();

        if (!Array.isArray(perigos)) {
            return false;
        }

        const origem = obterPosicao();

        return perigos.some(perigo => {
            const pos =
                perigo?.posicao ||
                perigo?.position;

            /*
             * Se o módulo de percepção informou
             * um perigo mas não informou posição,
             * consideramos perigo detectado.
             */
            if (!pos) {
                return true;
            }

            return (
                distancia(origem, pos) <=
                CONFIG.distanciaPerigo
            );
        });
    }

    /**
     * Cancela o objetivo atual.
     */
    function limparObjetivo() {
        objetivoAtual = null;

        try {
            if (
                navegacao &&
                typeof navegacao.parar ===
                "function"
            ) {
                navegacao.parar();
            }
        } catch (_) {
            // Segurança.
        }
    }

    /**
     * Escolhe e executa um novo objetivo.
     */
    function escolherNovoObjetivo() {
        const destino =
            gerarDestinoExploracao();

        if (!destino) {
            estado = "aguardando_posicao";
            return false;
        }

        objetivoAtual = destino;

        estado = "navegando";
        motivo = "exploracao";

        ultimaDecisao = Date.now();

        ultimoMovimento = Date.now();
        ultimaPosicao = obterPosicao();

        emitir("objetivo", {
            objetivo: destino,
            motivo: "exploracao"
        });

        /*
         * Preferimos irParaBloco porque permite
         * chegar próximo do bloco em vez de exigir
         * precisão absoluta.
         */
        if (
            navegacao &&
            typeof navegacao.irParaBloco ===
            "function"
        ) {
            const iniciou =
                navegacao.irParaBloco(
                    destino.x,
                    destino.y,
                    destino.z,
                    2
                );

            if (iniciou === false) {
                objetivoAtual = null;

                estado = "replanejando";
                motivo = "falha_navegacao";

                return false;
            }

            return true;
        }

        /*
         * Fallback para irPara.
         */
        if (
            navegacao &&
            typeof navegacao.irPara ===
            "function"
        ) {
            const iniciou =
                navegacao.irPara(
                    destino.x,
                    destino.y,
                    destino.z
                );

            if (iniciou === false) {
                objetivoAtual = null;

                estado = "replanejando";
                motivo = "falha_navegacao";

                return false;
            }

            return true;
        }

        objetivoAtual = null;

        estado = "erro";
        motivo = "navegacao_indisponivel";

        return false;
    }

    /**
     * Verifica se a Raiden chegou perto
     * do objetivo.
     */
    function chegouAoObjetivo() {
        if (!objetivoAtual) {
            return false;
        }

        const posicao =
            obterPosicao();

        if (!posicao) {
            return false;
        }

        return (
            distancia(
                posicao,
                objetivoAtual
            ) <= 3
        );
    }

    /**
     * Detecta se a Raiden está parada
     * durante tempo demais.
     */
    function verificarProgresso() {
        const atual =
            obterPosicao();

        if (!atual) {
            return;
        }

        if (!ultimaPosicao) {
            ultimaPosicao = atual;
            ultimoMovimento = Date.now();

            return;
        }

        const deslocamento =
            distancia(
                atual,
                ultimaPosicao
            );

        /*
         * Se andou pelo menos 0.4 bloco,
         * consideramos que houve progresso.
         */
        if (deslocamento >= 0.4) {
            ultimaPosicao = atual;
            ultimoMovimento = Date.now();

            return;
        }

        /*
         * Ficou parada por tempo demais.
         */
        if (
            ultimoMovimento &&
            Date.now() -
                ultimoMovimento >=
                CONFIG.tempoParadoMaximo
        ) {
            emitir("travado", {
                objetivo: objetivoAtual,
                posicao: atual
            });

            try {
                if (
                    navegacao &&
                    typeof navegacao.parar ===
                    "function"
                ) {
                    navegacao.parar();
                }
            } catch (_) {}

            objetivoAtual = null;

            estado = "replanejando";
            motivo = "sem_progresso";

            ultimoMovimento = Date.now();
            ultimaPosicao = atual;
        }
    }

    /**
     * 🧠 PRINCIPAL LOOP DE DECISÃO
     */
    function decidir() {
        if (!ativa) {
            return;
        }

        if (bloqueandoDecisao) {
            return;
        }

        if (!bot || !bot.entity) {
            return;
        }

        bloqueandoDecisao = true;

        try {
            /*
             * 1. Verifica perigo.
             */
            if (existePerigo()) {
                emitir("perigo", {
                    objetivo: objetivoAtual
                });

                limparObjetivo();

                estado = "replanejando";
                motivo = "perigo";
            }

            /*
             * 2. Verifica se está travada.
             */
            verificarProgresso();

            /*
             * 3. Verifica chegada.
             */
            if (chegouAoObjetivo()) {
                emitir(
                    "objetivo_concluido",
                    {
                        objetivo:
                            objetivoAtual
                    }
                );

                limparObjetivo();

                estado =
                    "aguardando_objetivo";

                motivo =
                    "objetivo_concluido";
            }

            /*
             * 4. Descobre se a navegação
             * ainda está acontecendo.
             */
            const navegando =
                navegacao &&
                typeof navegacao.estaNavegando ===
                "function"
                    ? navegacao.estaNavegando()
                    : false;

            /*
             * Ainda está executando o objetivo.
             */
            if (
                objetivoAtual &&
                navegando
            ) {
                estado = "navegando";

                return;
            }

            /*
             * Tinha objetivo, mas a navegação
             * acabou sem concluir.
             */
            if (
                objetivoAtual &&
                !navegando
            ) {
                objetivoAtual = null;

                estado = "replanejando";
                motivo =
                    "navegacao_encerrada";
            }

            /*
             * 5. Escolhe novo objetivo.
             */
            escolherNovoObjetivo();

        } finally {
            bloqueandoDecisao = false;
        }
    }

    /**
     * Liga a autonomia.
     */
    function iniciar() {
        if (ativa) {
            return true;
        }

        ativa = true;

        estado = "iniciando";
        motivo = "ativada";

        iniciadoEm = Date.now();

        ultimoMovimento = Date.now();
        ultimaPosicao = obterPosicao();

        emitir("iniciada");

        intervalo =
            setInterval(
                decidir,
                CONFIG.intervaloDecisao
            );

        /*
         * Faz uma decisão imediatamente,
         * sem esperar os primeiros 2 segundos.
         */
        decidir();

        return true;
    }

    /**
     * Desliga a autonomia.
     */
    function parar(
        motivoParada = "manual"
    ) {
        if (
            !ativa &&
            !intervalo
        ) {
            return true;
        }

        ativa = false;

        estado = "parada";
        motivo = motivoParada;

        objetivoAtual = null;

        if (intervalo) {
            clearInterval(intervalo);

            intervalo = null;
        }

        try {
            if (
                navegacao &&
                typeof navegacao.parar ===
                "function"
            ) {
                navegacao.parar();
            }
        } catch (_) {}

        emitir("parada", {
            motivo: motivoParada
        });

        return true;
    }

    /**
     * Reinicia a autonomia.
     */
    function reiniciar() {
        parar("reinicio");

        return iniciar();
    }

    function estaAtiva() {
        return ativa;
    }

    /**
     * Estado público da autonomia.
     */
    function obterEstado() {
        return {
            ativa,

            estado,

            motivo,

            objetivoAtual,

            iniciadoEm,

            ultimaDecisao,

            navegando:
                navegacao &&
                typeof navegacao.estaNavegando ===
                "function"
                    ? navegacao.estaNavegando()
                    : false
        };
    }

    return {
        iniciar,
        parar,
        reiniciar,

        estaAtiva,

        decidir,

        obterEstado
    };
}

module.exports = {
    criarAutonomia
};