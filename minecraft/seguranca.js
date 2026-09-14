function criarSeguranca(contexto) {
    const bot = contexto.bot;
    const percepcao = contexto.percepcao;
    const movimento = contexto.movimento;
    const combate = contexto.combate;
    const mundo = contexto.mundo;

    const CONFIG = {
        vidaCritica: 6,
        fomeCritica: 6,
        alturaMinimaVoid: 4,
        distanciaInimigo: 8,
        profundidadeVoid: 3
    };

    const BLOCOS_PERIGOSOS = new Set([
        "lava",
        "flowing_lava",
        "fire",
        "soul_fire",
        "cactus",
        "magma_block"
    ]);

    /*
     * Ações que a segurança bloqueia em perigo crítico.
     * Ir para algum lugar quando tem lava ao lado é
     * tão perigoso quanto andar.
     */
    const ACOES_MOVIMENTO = new Set([
        "andar",
        "ir_para",
        "ir_para_bloco",
        "ir_para_entidade",
        "seguir"
    ]);

    /*
     * Ações de ataque que a segurança bloqueia
     * com vida crítica.
     */
    const ACOES_ATAQUE = new Set([
        "atacar",
        "atacar_proximo"
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

    /*
     * Blocos adjacentes: em vez de "frente" fixo em +z,
     * checa os quatro lados do MUNDO. Mais honesto e
     * não perde um perigo por causa de rotação.
     */
    function verificarPerigosAmbientais() {
        const perigos = [];
        const posicao = obterPosicao();

        if (!posicao) {
            return perigos;
        }

        const px = Math.floor(posicao.x);
        const py = Math.floor(posicao.y);
        const pz = Math.floor(posicao.z);

        const referencias = [
            { nome: "atual", x: px, y: py, z: pz },
            { nome: "abaixo", x: px, y: py - 1, z: pz },
            { nome: "acima", x: px, y: py + 1, z: pz },
            { nome: "norte", x: px, y: py, z: pz - 1 },
            { nome: "sul", x: px, y: py, z: pz + 1 },
            { nome: "oeste", x: px - 1, y: py, z: pz },
            { nome: "leste", x: px + 1, y: py, z: pz }
        ];

        for (const referencia of referencias) {
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
                    String(bloco.nome || "").toLowerCase()
                )
            ) {
                perigos.push({
                    tipo: "bloco_perigoso",
                    bloco: bloco.nome,
                    direcao: referencia.nome,
                    posicao: {
                        x: referencia.x,
                        y: referencia.y,
                        z: referencia.z
                    }
                });
            }
        }

        return perigos;
    }

    function verificarVida() {
        if (obterVida() <= CONFIG.vidaCritica) {
            return {
                tipo: "vida_critica",
                valor: obterVida()
            };
        }

        return null;
    }

    function verificarFome() {
        if (obterFome() <= CONFIG.fomeCritica) {
            return {
                tipo: "fome_critica",
                valor: obterFome()
            };
        }

        return null;
    }

    /*
     * Só reporta risco_void se:
     * - y está abaixo do mínimo, E
     * - não há bloco sólido abaixo em N blocos.
     *
     * Evita falso positivo em cavernas com chão.
     */
    function verificarVoid() {
        const posicao = obterPosicao();

        if (!posicao) {
            return null;
        }

        if (posicao.y > CONFIG.alturaMinimaVoid) {
            return null;
        }

        const px = Math.floor(posicao.x);
        const py = Math.floor(posicao.y);
        const pz = Math.floor(posicao.z);

        for (
            let offset = 1;
            offset <= CONFIG.profundidadeVoid;
            offset++
        ) {
            const bloco = obterBloco(
                px,
                py - offset,
                pz
            );

            if (
                bloco &&
                bloco.solido === true
            ) {
                return null;
            }
        }

        return {
            tipo: "risco_void",
            altura: posicao.y
        };
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
        if (vida) perigos.push(vida);

        const fome = verificarFome();
        if (fome) perigos.push(fome);

        const voidPerigo = verificarVoid();
        if (voidPerigo) perigos.push(voidPerigo);

        perigos.push(...verificarPerigosAmbientais());
        perigos.push(...verificarInimigos());

        return perigos;
    }

    function temPerigoCritico() {
        return obterPerigos().some(perigo => {
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

    /*
     * Retorna:
     * - true                     → permitido
     * - { permitido: false, motivo } → bloqueado
     *
     * Assinatura alinhada com acoes.js:
     *   seguranca.podeExecutar(nomeAcao, args)
     */
    function podeExecutar(acao, parametros = {}) {
        if (!acao) {
            return {
                permitido: false,
                motivo: "Ação não informada."
            };
        }

        if (acao === "parar" || acao === "nenhuma") {
            return true;
        }

        /*
         * Bloqueia qualquer movimento em perigo crítico.
         * Inclui ir_para_bloco, ir_para, seguir, etc.
         */
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

        /*
         * Bloqueia ataque com vida crítica.
         */
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

    function limparMovimento() {
        if (movimento && typeof movimento.parar === "function") {
            movimento.parar();
        }

        return true;
    }

    function pararTudo() {
        limparMovimento();

        if (combate && typeof combate.parar === "function") {
            combate.parar();
        }

        return true;
    }

    function obterEstado() {
        return {
            vida: obterVida(),
            fome: obterFome(),
            posicao: obterPosicao(),
            emPerigo: estaEmPerigo(),
            perigoCritico: estaEmPerigoCritico(),
            perigos: obterPerigos()
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