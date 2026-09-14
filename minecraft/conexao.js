function criarConexao(contexto) {
    const bot = contexto.bot;

    const CONFIG = {
        url:
            process.env.RAIDEN_MINECRAFT_WS ||
            "ws://127.0.0.1:8000/ws/minecraft",

        intervaloReconexao: 3000,
        intervaloEstado: 1000,
        intervaloPing: 10000
    };

    let ws = null;
    let conectada = false;

    /*
     * Impede dois sockets paralelos se conectar()
     * for chamada várias vezes em sequência.
     */
    let conectando = false;

    /*
     * Bloqueia reconexão automática depois de
     * desconectar() explícito (ex: no end do bot).
     */
    let desligando = false;

    let timerReconexao = null;
    let timerEstado = null;
    let timerPing = null;

    let callbackMensagem = null;
    let callbackAberta = null;
    let callbackFechada = null;
    let callbackErro = null;

    function definirCallback(tipo, callback) {
        if (typeof callback !== "function") {
            return false;
        }

        switch (tipo) {
            case "mensagem":
                callbackMensagem = callback;
                break;

            case "aberta":
                callbackAberta = callback;
                break;

            case "fechada":
                callbackFechada = callback;
                break;

            case "erro":
                callbackErro = callback;
                break;

            default:
                return false;
        }

        return true;
    }

    function enviar(dados) {
        if (!ws || ws.readyState !== 1) {
            return false;
        }

        try {
            ws.send(JSON.stringify(dados));

            return true;

        } catch (erro) {
            console.error(
                "📡 Erro ao enviar:",
                erro.message
            );

            return false;
        }
    }

    function enviarEstado() {
        if (typeof contexto.criarEstado !== "function") {
            return false;
        }

        /*
         * criarEstado() chama obterEstado() de vários
         * módulos. Se qualquer um lançar (ex: bot.entity
         * nulo logo após spawn), a exceção sobe e derruba
         * o setInterval de estado.
         */
        let estado;

        try {
            estado = contexto.criarEstado();
        } catch (erro) {
            console.error(
                "📡 Erro ao montar estado:",
                erro.message
            );

            return false;
        }

        return enviar({
            tipo: "estado",
            estado
        });
    }

    function enviarPing() {
        return enviar({
            tipo: "ping",
            timestamp: Date.now()
        });
    }

    function iniciarAtualizacaoEstado() {
        pararAtualizacaoEstado();

        timerEstado = setInterval(() => {
            if (conectada) {
                enviarEstado();
            }
        }, CONFIG.intervaloEstado);

        timerPing = setInterval(() => {
            if (conectada) {
                enviarPing();
            }
        }, CONFIG.intervaloPing);
    }

    function pararAtualizacaoEstado() {
        if (timerEstado) {
            clearInterval(timerEstado);
            timerEstado = null;
        }

        if (timerPing) {
            clearInterval(timerPing);
            timerPing = null;
        }
    }

    function agendarReconexao() {
        if (desligando) {
            return;
        }

        if (timerReconexao) {
            return;
        }

        timerReconexao = setTimeout(() => {
            timerReconexao = null;

            conectar();
        }, CONFIG.intervaloReconexao);
    }

    function conectar() {
        /*
         * Bloqueia se estamos desligando explicitamente.
         * Reativado por desconectar() → conectar() manual.
         */
        if (desligando) {
            return;
        }

        if (conectando) {
            return;
        }

        if (
            ws &&
            (ws.readyState === 0 || ws.readyState === 1)
        ) {
            return;
        }

        let novaConexao;

        try {
            novaConexao = new WebSocket(CONFIG.url);
        } catch (erro) {
            console.error(
                "📡 Erro ao criar WebSocket:",
                erro.message
            );

            conectada = false;

            if (typeof callbackErro === "function") {
                callbackErro(erro);
            }

            agendarReconexao();

            return;
        }

        conectando = true;
        ws = novaConexao;

        novaConexao.onopen = () => {
            if (ws !== novaConexao) {
                return;
            }

            conectando = false;
            conectada = true;

            console.log(
                "🧠 Conectado ao cérebro da Raiden."
            );

            iniciarAtualizacaoEstado();

            enviar({
                tipo: "conexao",
                status: "ok",
                mensagem:
                    "Minecraft conectado à Raiden."
            });

            enviarEstado();

            if (typeof callbackAberta === "function") {
                callbackAberta();
            }
        };

        novaConexao.onmessage = evento => {
            if (ws !== novaConexao) {
                return;
            }

            try {
                const dados = JSON.parse(evento.data);

                if (dados.tipo === "pong") {
                    return;
                }

                if (typeof callbackMensagem === "function") {
                    callbackMensagem(dados);
                }

            } catch (erro) {
                console.error(
                    "📡 Mensagem WebSocket inválida:",
                    erro.message
                );
            }
        };

        novaConexao.onerror = erro => {
            if (ws !== novaConexao) {
                return;
            }

            if (typeof callbackErro === "function") {
                callbackErro(erro);
            }
        };

        novaConexao.onclose = evento => {
            if (ws !== novaConexao) {
                return;
            }

            conectando = false;
            conectada = false;

            pararAtualizacaoEstado();

            ws = null;

            console.log(
                "📡 Conexão com a Raiden encerrada."
            );

            if (typeof callbackFechada === "function") {
                callbackFechada(evento);
            }

            agendarReconexao();
        };
    }

    function desconectar() {
        /*
         * Marca desligamento para impedir que o
         * onclose agende reconexão automática.
         */
        desligando = true;

        if (timerReconexao) {
            clearTimeout(timerReconexao);
            timerReconexao = null;
        }

        pararAtualizacaoEstado();

        const conexaoAtual = ws;

        ws = null;
        conectada = false;
        conectando = false;

        if (
            conexaoAtual &&
            (conexaoAtual.readyState === 0 ||
                conexaoAtual.readyState === 1)
        ) {
            try {
                conexaoAtual.close();
            } catch (_) {}
        }

        return true;
    }

    /*
     * Reabilita reconexão. Usado quando o bot
     * quer se reconectar explicitamente após
     * um desconectar() anterior.
     */
    function reabilitarReconexao() {
        desligando = false;

        return true;
    }

    function estaConectada() {
        return (
            conectada &&
            ws !== null &&
            ws.readyState === 1
        );
    }

    return {
        conectar,
        desconectar,
        reabilitarReconexao,
        enviar,
        enviarEstado,
        iniciarAtualizacaoEstado,
        pararAtualizacaoEstado,
        estaConectada,
        definirCallback,

        get conectada() {
            return estaConectada();
        }
    };
}

module.exports = {
    criarConexao
};