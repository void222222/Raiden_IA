/**
 * 🎁 COLETOR — RAIDEN MINECRAFT
 *
 * Vai atrás de itens dropados no chão.
 *
 * ⚠️ NOVO:
 *   O bot quebrava um bloco, o drop caía no chão,
 *   e ele IGNORAVA. Só pegava se o drop ficasse
 *   dentro do raio de coleta automática (1 bloco).
 *
 *   Agora: varre itens no chão (8 blocos), vai até
 *   o mais próximo, e espera a coleta automática.
 *
 * Chamado:
 *   - Pelo handler `obter_bloco` (antes de quebrar)
 *   - Pelo handler `obter_item` (antes de atacar)
 *   - Pelo executor (a cada ciclo, oportunista)
 */

function criarColetor(contexto) {
    const bot = contexto.bot;
    const percepcao = contexto.percepcao;
    const navegacao = contexto.navegacao;
    const mundo = contexto.mundo;

    const CONFIG = {
        raioDeteccao: 16,
        distanciaChegada: 1,
        tempoEsperaColeta: 800,
        intervaloMinimo: 500
    };

    let ultimaColeta = 0;

    // =========================================================
    // 🔍 DETECÇÃO
    // =========================================================

    function obterItensNoChao() {
        if (
            !percepcao ||
            typeof percepcao.obterItensNoChao !== "function"
        ) {
            return [];
        }

        try {
            return percepcao.obterItensNoChao(CONFIG.raioDeteccao) || [];
        } catch (_) {
            return [];
        }
    }

    function temItemNoChao() {
        return obterItensNoChao().length > 0;
    }

    // =========================================================
    // 🚶 IR BUSCAR
    // =========================================================

    async function irBuscarItemNoChao() {
        const itens = obterItensNoChao();

        if (!itens.length) {
            return false;
        }

        // Pega o mais próximo
        const maisPerto = itens[0];

        const pos = bot?.entity?.position;
        if (!pos) return false;

        const dx = maisPerto.posicao.x - pos.x;
        const dz = maisPerto.posicao.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Já tá em cima?
        if (dist <= CONFIG.distanciaChegada) {
            return true;
        }

        // Navega até o item
        if (
            navegacao &&
            typeof navegacao.irParaBloco === "function"
        ) {
            try {
                const iniciou = navegacao.irParaBloco(
                    maisPerto.posicao.x,
                    maisPerto.posicao.y,
                    maisPerto.posicao.z,
                    CONFIG.distanciaChegada
                );

                return iniciou !== false;
            } catch (_) {
                return false;
            }
        }

        return false;
    }

    /**
     * Roda uma coleta completa:
     *   1. Detecta item no chão
     *   2. Se tem, vai até ele
     *   3. Espera a coleta automática
     *
     * Retorna true se coletou algo (ou se não tinha nada).
     */
    async function coletar() {
        const agora = Date.now();

        if (agora - ultimaColeta < CONFIG.intervaloMinimo) {
            return false;
        }

        ultimaColeta = agora;

        const itens = obterItensNoChao();

        if (!itens.length) {
            return false;
        }

        console.log(
            `🎁 [coletor] ${itens.length} item(s) no chão. ` +
            `Indo pegar "${itens[0].nome || "?"}" em ` +
            `(${itens[0].posicao.x},${itens[0].posicao.y},${itens[0].posicao.z})`
        );

        await irBuscarItemNoChao();

        // Espera a coleta automática do Minecraft
        // (o bot coleta automaticamente quando tá perto)
        await new Promise(r =>
            setTimeout(r, CONFIG.tempoEsperaColeta)
        );

        return true;
    }

    function obterEstado() {
        return {
            itensNoChao: obterItensNoChao().length,
            ultimaColeta
        };
    }

    return {
        coletar,
        temItemNoChao,
        obterItensNoChao,
        obterEstado
    };
}

module.exports = { criarColetor };