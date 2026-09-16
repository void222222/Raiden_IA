/**
 * 🛡️ SEGURANÇA — RAIDEN MINECRAFT
 *
 * Decide se uma ação pode ser executada.
 *
 * ⚠️ ARQUITETURA DESTA VERSÃO:
 *
 * A detecção de perigos do MUNDO (lava, fogo, mobs)
 * agora é responsabilidade da `percepcao.js`. Isso
 * evita duplicação e divergência entre módulos.
 *
 * A `seguranca.js` cuida só do CORPO da Raiden:
 *   - vida crítica
 *   - fome crítica
 *   - risco de void
 *
 * E decide se uma ação pode rodar, juntando:
 *   - perigos do mundo (via percepcao)
 *   - perigos do corpo (via checagens locais)
 *
 * Contrato:
 *   podeExecutar(acao, args) →
 *     true                                → permitido
 *     { permitido: false, motivo: "..." } → bloqueado
 *
 * ⚠️ MUDANÇAS:
 *
 * 1. Removida a duplicação: não detecta mais lava,
 *    fogo ou magma por conta própria. Usa
 *    `percepcao.existePerigoCritico()`.
 *
 * 2. `verificarVoid()` agora usa Y < 0 (funciona em
 *    qualquer versão do Minecraft) em vez de Y < 4.
 *
 * 3. `pular` entrou em ACOES_MOVIMENTO — pular em
 *    perigo crítico pode jogar o bot na lava.
 *
 * 4. `obterPerigos()` local só reporta vida, fome
 *    e void. O resto vem da percepcao.
 *
 * 5. `obterEstado()` não recalcula tudo 3 vezes.
 */

function criarSeguranca(contexto) {
    const bot = contexto.bot;
    const percepcao = contexto.percepcao;
    const movimento = contexto.movimento;
    const combate = contexto.combate;
    const mundo = contexto.mundo;

    // =========================================================
    // ⚙️ CONFIG
    // =========================================================

    const CONFIG = {
        vidaCritica: 6,
        fomeCritica: 6,
        voidY: 0,              // Y abaixo disso = possível void
        voidProfundidade: 3,   // blocos a checar abaixo
        distanciaInimigo: 8
    };

    // =========================================================
    // 🎯 AÇÕES
    // =========================================================

    /*
     * Ações de movimento bloqueadas em perigo crítico.
     *
     * Pular também: em perigo crítico pode jogar
     * o bot direto na lava.
     */
    const ACOES_MOVIMENTO = new Set([
        "andar",
        "pular",
        "ir_para",
        "ir_para_bloco",
        "ir_para_entidade",
        "seguir"
    ]);

    /*
     * Ações de ataque bloqueadas com vida crítica.
     */
    const ACOES_ATAQUE = new Set([
        "atacar",
        "atacar_proximo"
    ]);

    // =========================================================
    // 🧠 ESTADO DO CORPO
    // =========================================================

    function obterVida() {
        return Number(bot.health ?? 0);
    }

    function obterFome() {
        return Number(bot.food ?? 0);
    }

    function obterPosicao() {
        const pos = bot.entity?.position;
        if (!pos) return null;

        return {
            x: Number(pos.x),
            y: Number(pos.y),
            z: Number(pos.z)
        };
    }

    // =========================================================
    // 🧱 BLOCO (delegação)
    // =========================================================

    /*
     * Não tem lógica própria — delega para mundo/percepcao.
     * Só o verificarVoid usa isso.
     */
    function obterBloco(x, y, z) {
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {
            return null;
        }

        if (mundo && typeof mundo.obterBloco === "function") {
            try {
                return mundo.obterBloco(
                    Math.floor(x),
                    Math.floor(y),
                    Math.floor(z)
                );
            } catch (_) {}
        }

        if (
            percepcao &&
            typeof percepcao.obterBloco === "function"
        ) {
            try {
                return percepcao.obterBloco(
                    Math.floor(x),
                    Math.floor(y),
                    Math.floor(z)
                );
            } catch (_) {}
        }

        return null;
    }

    // =========================================================
    // ⚠️ PERIGOS DO CORPO
    // =========================================================

    function verificarVida() {
        const vida = obterVida();
        if (vida <= CONFIG.vidaCritica) {
            return {
                tipo: "vida_critica",
                gravidade: "critico",
                valor: vida
            };
        }
        return null;
    }

    function verificarFome() {
        const fome = obterFome();
        if (fome <= CONFIG.fomeCritica) {
            return {
                tipo: "fome_critica",
                gravidade: "alerta",
                valor: fome
            };
        }
        return null;
    }

    /*
     * Void: Y abaixo de 0 E sem bloco sólido abaixo.
     *
     * Antes usava Y < 4 (que nunca disparava no overworld).
     * Agora Y < 0 funciona em qualquer versão e dimensão.
     */
    function verificarVoid() {
        const posicao = obterPosicao();
        if (!posicao) return null;

        if (posicao.y >= CONFIG.voidY) {
            return null;
        }

        const px = Math.floor(posicao.x);
        const py = Math.floor(posicao.y);
        const pz = Math.floor(posicao.z);

        for (
            let offset = 1;
            offset <= CONFIG.voidProfundidade;
            offset++
        ) {
            const bloco = obterBloco(px, py - offset, pz);

            // Bloco sólido abaixo = chão. Não é void.
            if (
                bloco &&
                (
                    bloco.solido === true ||
                    bloco.colidivel === true
                )
            ) {
                return null;
            }
        }

        return {
            tipo: "risco_void",
            gravidade: "critico",
            altura: posicao.y
        };
    }

    /*
     * Perigos do CORPO: vida, fome, void.
     *
     * Perigos do MUNDO (lava, fogo, mobs) vêm da
     * percepcao.js — não duplicamos aqui.
     */
    function obterPerigosDoCorpo() {
        const perigos = [];

        const vida = verificarVida();
        if (vida) perigos.push(vida);

        const fome = verificarFome();
        if (fome) perigos.push(fome);

        const voidPerigo = verificarVoid();
        if (voidPerigo) perigos.push(voidPerigo);

        return perigos;
    }

    // =========================================================
    // ⚠️ PERIGOS DO MUNDO (delegação)
    // =========================================================

    /*
     * Pega da percepcao. Se ela não tiver, retorna [].
     * Não reimplementa detecção.
     */
    function obterPerigosDoMundo() {
        if (!percepcao) return [];

        try {
            if (typeof percepcao.obterPerigos === "function") {
                return percepcao.obterPerigos() || [];
            }
        } catch (_) {}

        return [];
    }

    /*
     * Existe algum perigo crítico?
     *
     * Junta:
     *   - perigos do corpo (vida, void)
     *   - perigos críticos do mundo (lava colada, mob colado)
     *
     * Fome crítica NÃO conta como crítico — só alerta.
     */
    function temPerigoCritico() {
        // -------- corpo --------
        const corpo = obterPerigosDoCorpo();

        if (corpo.some(p => p.gravidade === "critico")) {
            return true;
        }

        // -------- mundo --------
        if (
            percepcao &&
            typeof percepcao.existePerigoCritico === "function"
        ) {
            try {
                if (percepcao.existePerigoCritico() === true) {
                    return true;
                }
            } catch (_) {}
        }

        // Fallback: filtra da lista crua
        const mundo = obterPerigosDoMundo();

        return mundo.some(p => p.gravidade === "critico");
    }

    /*
     * Junta tudo (corpo + mundo) para diagnóstico.
     * NÃO é usado para decisão — só pra log/estado.
     */
    function obterTodosPerigos() {
        return [
            ...obterPerigosDoCorpo(),
            ...obterPerigosDoMundo()
        ];
    }

    function estaEmPerigo() {
        return obterTodosPerigos().length > 0;
    }

    function estaEmPerigoCritico() {
        return temPerigoCritico();
    }

    // =========================================================
    // 🚦 podeExecutar
    // =========================================================

    /*
     * Retorna:
     *   true                            → permitido
     *   { permitido: false, motivo }    → bloqueado
     *
     * É chamado pelo `acoes.js` antes de toda ação.
     *
     * Defesa em profundidade:
     *   - a autonomia já checa antes de decidir
     *   - aqui é a última linha antes do Mineflayer
     */
    function podeExecutar(acao, parametros = {}) {
        if (!acao) {
            return {
                permitido: false,
                motivo: "Ação não informada."
            };
        }

        // Ações de emergência sempre passam
        if (acao === "parar" || acao === "nenhuma") {
            return true;
        }

        // -------- movimento em perigo crítico --------
        if (
            ACOES_MOVIMENTO.has(acao) &&
            temPerigoCritico()
        ) {
            return {
                permitido: false,
                motivo:
                    "Movimento bloqueado em perigo crítico."
            };
        }

        // -------- ataque com vida crítica --------
        if (
            ACOES_ATAQUE.has(acao) &&
            obterVida() <= CONFIG.vidaCritica
        ) {
            return {
                permitido: false,
                motivo:
                    "Ataque bloqueado com vida crítica."
            };
        }

        return true;
    }

    // =========================================================
    // 🛑 PARAR TUDO
    // =========================================================

    function limparMovimento() {
        if (movimento && typeof movimento.parar === "function") {
            try {
                movimento.parar();
            } catch (_) {}
        }

        return true;
    }

    function pararTudo() {
        limparMovimento();

        if (combate && typeof combate.parar === "function") {
            try {
                combate.parar();
            } catch (_) {}
        }

        return true;
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterEstado() {
        // Calcula uma vez, reusa
        const perigosCorpo = obterPerigosDoCorpo();
        const perigosMundo = obterPerigosDoMundo();

        const criticos = [
            ...perigosCorpo.filter(p => p.gravidade === "critico"),
            ...perigosMundo.filter(p => p.gravidade === "critico")
        ];

        const todos = [...perigosCorpo, ...perigosMundo];

        return {
            vida: obterVida(),
            fome: obterFome(),
            posicao: obterPosicao(),

            emPerigo: todos.length > 0,
            perigoCritico: criticos.length > 0,

            perigos: todos,
            perigosCriticos: criticos,
            perigosCorpo,
            perigosMundo
        };
    }

    // =========================================================
    // 🔌 API
    // =========================================================

    return {
        // corpo
        obterVida,
        obterFome,
        obterPosicao,

        // checagens locais
        verificarVida,
        verificarFome,
        verificarVoid,

        // perigos (corpo + mundo)
        obterPerigos: obterTodosPerigos,
        obterPerigosDoCorpo,
        obterPerigosDoMundo,

        temPerigoCritico,
        estaEmPerigo,
        estaEmPerigoCritico,

        // decisão
        podeExecutar,

        // controle
        limparMovimento,
        pararTudo,

        // estado
        obterEstado
    };
}

module.exports = {
    criarSeguranca
};