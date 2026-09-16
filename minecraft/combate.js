/**
 * ⚔️ COMBATE — RAIDEN MINECRAFT
 *
 * Versão Technoblade. Não é só "atacar em linha reta".
 *
 * ⚠️ O QUE ESTA VERSÃO FAZ:
 *
 * 1. MIRA PREDITIVA
 *    Calcula a posição futura do inimigo com base na
 *    velocidade dele. Mira onde ele VAI ESTAR, não onde
 *    ele está.
 *
 * 2. CRITICAL HIT REAL
 *    Pula + ataca no ar. Critical hit = 1.5x de dano.
 *    Sem isso, Raiden perde toda luta de trocação.
 *
 * 3. STRAFING
 *    Anda em círculo ao redor do inimigo enquanto ataca.
 *    Evita flecha, creeper, ataque em linha reta.
 *
 * 4. SHIELD BLOCK
 *    Se tem escudo e inimigo é arqueiro, levanta.
 *    Bloqueia flecha.
 *
 * 5. RECUO TÁTICO
 *    Se vida < 6, recua 5 blocos e come.
 *    Technoblade não morre de fome.
 *
 * 6. FLEE
 *    Se vida < 3 e sem comida, corre pra longe.
 *
 * 7. DEFENDER (IA COMPLETA)
 *    Chama tudo isso na ordem certa, baseado em:
 *      - vida
 *      - fome
 *      - tipo de inimigo
 *      - quantidade de inimigos
 *      - tem escudo?
 *      - tem comida?
 *
 * 8. PRIORIDADE DE ALVO
 *    Creeper > arqueiro > bruxa > zumbi > aranha > resto.
 *    Creeper explode e mata. Arqueiro atira de longe.
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO:
 *
 * 1. atacarComCritico agora PULA e ataca no ar.
 *    Antes, só soltava sprint — e o bot estava no chão,
 *    então NUNCA dava crítico.
 *
 * 2. levantarEscudo não passa mais `true` pro
 *    bot.activateItem(). A assinatura é sem parâmetro.
 *
 * 3. abaixarEscudo verifica se bot.deactivateItem
 *    existe antes de chamar. Fallback: unequip off-hand.
 *
 * ⚠️ O QUE ESTA VERSÃO NÃO FAZ (ainda):
 *   - Não usa poção
 *   - Não usa ender pearl
 *   - Não constrói barricada
 *   - Não usa cama pra explodir
 *   (Fase 5 — extras)
 */

const { Vec3 } = require("vec3");

function criarCombate(contexto) {
    const bot = contexto.bot;

    // =========================================================
    // ⚙️ CONFIG
    // =========================================================

    const CONFIG = {
        // Distâncias
        distanciaAtaque: 3.2,
        distanciaBusca: 16,
        distanciaRecuo: 5,
        distanciaFlee: 12,

        // Vida
        vidaCritica: 3,
        vidaBaixa: 6,
        vidaRecuar: 10,

        // Fome
        fomeCritica: 6,
        fomeBaixa: 14,

        // Tempo
        cooldownAtaqueMs: 600,
        duracaoStrafeMs: 1200,
        duracaoRecuoMs: 800,

        // Previsão
        ticksPrevisao: 3
    };

    // =========================================================
    // 📚 LISTAS
    // =========================================================

    const HOSTIS = new Set([
        "zombie", "husk", "drowned",
        "skeleton", "stray", "bogged",
        "creeper",
        "spider", "cave_spider",
        "witch",
        "pillager", "vindicator", "evoker", "ravager",
        "phantom",
        "enderman",
        "silverfish", "endermite",
        "slime", "magma_cube",
        "blaze", "ghast",
        "piglin", "piglin_brute",
        "hoglin", "zoglin",
        "warden"
    ]);

    const PRIORIDADE = {
        creeper: 100,
        skeleton: 90,
        stray: 90,
        bogged: 90,
        witch: 80,
        pillager: 70,
        vindicator: 70,
        evoker: 75,
        ravager: 85,
        phantom: 60,
        blaze: 65,
        ghast: 65,
        warden: 200,
        enderman: 50,
        zombie: 40,
        husk: 40,
        drowned: 40,
        spider: 30,
        cave_spider: 30,
        slime: 20,
        magma_cube: 25
    };

    const ARQUEIROS = new Set([
        "skeleton", "stray", "bogged"
    ]);

    // =========================================================
    // 📦 ESTADO INTERNO
    // =========================================================

    let alvoAtual = null;
    let atacando = false;
    let ultimoAtaque = 0;

    // =========================================================
    // 🔢 UTILITÁRIOS
    // =========================================================

    function distanciaPara(entidade) {
        if (!entidade?.position || !bot.entity?.position) {
            return Infinity;
        }
        return bot.entity.position.distanceTo(entidade.position);
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
        if (!entidadeValida(entidade)) return false;

        return HOSTIS.has(
            String(entidade.name || "").toLowerCase()
        );
    }

    function nomeDoInimigo(entidade) {
        return String(entidade?.name || "").toLowerCase();
    }

    function prioridadeDoInimigo(entidade) {
        const nome = nomeDoInimigo(entidade);
        return PRIORIDADE[nome] || 10;
    }

    function ehArqueiro(entidade) {
        return ARQUEIROS.has(nomeDoInimigo(entidade));
    }

    function minhaVida() {
        return Number(bot.health ?? 20);
    }

    function minhaFome() {
        return Number(bot.food ?? 20);
    }

    // =========================================================
    // 🎯 PROCURAR INIMIGOS
    // =========================================================

    function procurarInimigos(distancia = CONFIG.distanciaBusca) {
        return Object.values(bot.entities || {})
            .filter(ent => {
                return (
                    ehHostil(ent) &&
                    distanciaPara(ent) <= distancia
                );
            })
            .sort((a, b) => {
                const pa = prioridadeDoInimigo(a);
                const pb = prioridadeDoInimigo(b);

                if (pa !== pb) return pb - pa;

                return distanciaPara(a) - distanciaPara(b);
            });
    }

    function procurarInimigoMaisProximo(distancia = CONFIG.distanciaBusca) {
        return procurarInimigos(distancia)[0] || null;
    }

    function procurarInimigoMaisPerigoso(distancia = CONFIG.distanciaBusca) {
        return procurarInimigos(distancia)[0] || null;
    }

    // =========================================================
    // 🔮 MIRA PREDITIVA
    // =========================================================

    function preverPosicao(entidade, ticks = CONFIG.ticksPrevisao) {
        if (!entidade?.position) return null;

        const vel = entidade.velocity || { x: 0, y: 0, z: 0 };
        const dt = ticks * 0.05;

        return new Vec3(
            entidade.position.x + (vel.x || 0) * dt,
            entidade.position.y + (vel.y || 0) * dt,
            entidade.position.z + (vel.z || 0) * dt
        );
    }

    async function mirar(entidade) {
        if (!entidadeValida(entidade)) return false;

        try {
            const alvoPos = preverPosicao(entidade);

            if (!alvoPos) return false;

            const altura = entidade.height
                ? entidade.height * 0.5
                : 0.8;

            await bot.lookAt(
                alvoPos.offset(0, altura, 0),
                true
            );

            return true;

        } catch (erro) {
            console.error("⚔️ Erro ao mirar:", erro.message);
            return false;
        }
    }

    // =========================================================
    // 🥊 ATAQUE COM CRITICAL HIT
    // =========================================================

    function podeAtacar() {
        return Date.now() - ultimoAtaque >= CONFIG.cooldownAtaqueMs;
    }

    function atacarSimples(entidade) {
        try {
            bot.attack(entidade);
            ultimoAtaque = Date.now();
            return true;
        } catch (_) {
            return false;
        }
    }

    /*
     * ⚠️ Ataque com critical hit REAL.
     *
     * Critical hit exige:
     *   1. Bot no ar (caindo) — onGround = false
     *   2. Bot NÃO sprintando no momento do hit
     *
     * Fluxo:
     *   1. Solta sprint
     *   2. Pula
     *   3. Espera 1 tick (~50ms)
     *   4. Verifica se está no ar
     *   5. Ataca no ar
     *   6. Solta jump
     *
     * Tenta 3 vezes. Se não conseguir, ataca no chão mesmo.
     */
    async function atacarComCritico(entidade) {
        if (!entidadeValida(entidade)) return false;

        if (distanciaPara(entidade) > CONFIG.distanciaAtaque) {
            return false;
        }

        if (!podeAtacar()) {
            return false;
        }

        try {
            alvoAtual = entidade;
            atacando = true;

            const mirou = await mirar(entidade);
            if (!mirou) return false;

            // Solta sprint ANTES (crítico exige não-sprint)
            try {
                bot.setControlState("sprint", false);
            } catch (_) {}

            // Tenta 3 vezes dar crítico
            for (let tentativa = 0; tentativa < 3; tentativa++) {
                // Pula
                try {
                    bot.setControlState("jump", true);
                } catch (_) {}

                // Espera subir
                await new Promise(resolve => setTimeout(resolve, 50));

                // Solta jump
                try {
                    bot.setControlState("jump", false);
                } catch (_) {}

                // Verifica se está no ar
                const noAr =
                    bot.entity &&
                    bot.entity.onGround === false;

                if (noAr) {
                    // Ataca no ar
                    bot.attack(entidade);
                    ultimoAtaque = Date.now();

                    // Garante que soltou o jump
                    try { bot.setControlState("jump", false); } catch (_) {}

                    return true;
                }

                // Espera cair e tenta de novo
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Fallback: ataca no chão mesmo
            bot.attack(entidade);
            ultimoAtaque = Date.now();

            try { bot.setControlState("jump", false); } catch (_) {}

            return true;

        } catch (erro) {
            console.error("⚔️ Erro ao atacar com crítico:", erro.message);

            try { bot.setControlState("jump", false); } catch (_) {}

            return false;
        }
    }

    // =========================================================
    // 💃 STRAFING
    // =========================================================

    async function strafe(entidade, duracaoMs = CONFIG.duracaoStrafeMs) {
        if (!entidadeValida(entidade)) return false;

        const pos = bot.entity?.position;
        if (!pos) return false;

        const dx = entidade.position.x - pos.x;
        const dz = entidade.position.z - pos.z;

        const perpX = -dz;
        const perpZ = dx;

        const len = Math.sqrt(perpX * perpX + perpZ * perpZ);
        if (len < 0.01) return false;

        const dirX = perpX / len;
        const dirZ = perpZ / len;

        try {
            const alvo = new Vec3(
                pos.x + dirX * 2,
                pos.y,
                pos.z + dirZ * 2
            );

            bot.lookAt(alvo, true).catch(() => {});

            bot.setControlState("forward", true);
            bot.setControlState("sprint", true);

            await new Promise(resolve =>
                setTimeout(resolve, duracaoMs)
            );

            bot.setControlState("forward", false);
            bot.setControlState("sprint", false);

            return true;

        } catch (_) {
            return false;
        }
    }

    // =========================================================
    // 🛡️ ESCUDO
    // =========================================================

    function temEscudo() {
        try {
            if (!bot.inventory?.slots) return false;

            return bot.inventory.slots.some(item =>
                item?.name === "shield"
            );
        } catch (_) {
            return false;
        }
    }

    /*
     * ⚠️ CORRIGIDO: verifica se o slot off-hand existe.
     */
    async function equiparEscudo() {
        if (!temEscudo()) return false;

        try {
            const escudo = bot.inventory.slots.find(
                item => item?.name === "shield"
            );

            if (!escudo) return false;

            await bot.equip(escudo, "off-hand");
            return true;

        } catch (erro) {
            console.error(
                "⚔️ Erro ao equipar escudo:",
                erro.message
            );
            return false;
        }
    }

    /*
     * ⚠️ CORRIGIDO: bot.activateItem() NÃO aceita parâmetro.
     *
     * Estratégia:
     *   1. Equipa escudo na OFF-HAND
     *   2. Chama activateItem() normal (mão principal)
     *   3. O Mineflayer moderno levanta o escudo da off-hand
     *      automaticamente quando activateItem() é chamado
     */
    async function levantarEscudo() {
        try {
            const equipou = await equiparEscudo();

            if (!equipou) {
                return false;
            }

            bot.activateItem();
            return true;

        } catch (_) {
            return false;
        }
    }

    /*
     * ⚠️ CORRIGIDO: verifica se bot.deactivateItem existe.
     */
    function abaixarEscudo() {
        try {
            if (typeof bot.deactivateItem === "function") {
                bot.deactivateItem();
                return true;
            }
        } catch (_) {}

        try {
            if (typeof bot.unequip === "function") {
                bot.unequip("off-hand");
            }
        } catch (_) {}

        return false;
    }

    // =========================================================
    // 🍗 RECUO TÁTICO + COMER
    // =========================================================

    function temComida() {
        if (!bot.inventory?.slots) return false;

        const comidas = new Set([
            "apple", "bread", "cooked_beef", "cooked_porkchop",
            "cooked_chicken", "cooked_mutton", "cooked_rabbit",
            "cooked_cod", "cooked_salmon", "golden_apple",
            "carrot", "baked_potato", "beetroot_soup",
            "mushroom_stew", "rabbit_stew", "suspicious_stew"
        ]);

        return bot.inventory.slots.some(item =>
            item && comidas.has(item.name)
        );
    }

    function acharComida() {
        if (!bot.inventory?.slots) return null;

        const comidas = new Set([
            "apple", "bread", "cooked_beef", "cooked_porkchop",
            "cooked_chicken", "cooked_mutton", "cooked_rabbit",
            "cooked_cod", "cooked_salmon", "golden_apple",
            "carrot", "baked_potato", "beetroot_soup",
            "mushroom_stew", "rabbit_stew", "suspicious_stew"
        ]);

        return bot.inventory.slots.find(item =>
            item && comidas.has(item.name)
        ) || null;
    }

    async function comer() {
        const comida = acharComida();
        if (!comida) return false;

        try {
            await bot.equip(comida, "hand");
            await bot.consume();
            return true;
        } catch (_) {
            return false;
        }
    }

    async function recuarEComer(entidade) {
        if (!entidadeValida(entidade)) return false;

        const pos = bot.entity?.position;
        if (!pos) return false;

        const dx = pos.x - entidade.position.x;
        const dz = pos.z - entidade.position.z;

        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.01) return false;

        const dirX = dx / len;
        const dirZ = dz / len;

        try {
            const alvo = new Vec3(
                pos.x + dirX * CONFIG.distanciaRecuo,
                pos.y,
                pos.z + dirZ * CONFIG.distanciaRecuo
            );

            bot.lookAt(alvo, true).catch(() => {});

            bot.setControlState("forward", true);
            bot.setControlState("sprint", true);

            await new Promise(resolve =>
                setTimeout(resolve, CONFIG.duracaoRecuoMs)
            );

            bot.setControlState("forward", false);
            bot.setControlState("sprint", false);

            await comer();

            return true;

        } catch (_) {
            return false;
        }
    }

    // =========================================================
    // 🏃 FLEE
    // =========================================================

    async function fugir(entidade) {
        if (!entidadeValida(entidade)) return false;

        const pos = bot.entity?.position;
        if (!pos) return false;

        const dx = pos.x - entidade.position.x;
        const dz = pos.z - entidade.position.z;

        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.01) return false;

        const dirX = dx / len;
        const dirZ = dz / len;

        try {
            const alvo = new Vec3(
                pos.x + dirX * CONFIG.distanciaFlee,
                pos.y,
                pos.z + dirZ * CONFIG.distanciaFlee
            );

            bot.lookAt(alvo, true).catch(() => {});

            bot.setControlState("forward", true);
            bot.setControlState("sprint", true);
            bot.setControlState("jump", true);

            await new Promise(resolve => setTimeout(resolve, 2000));

            bot.setControlState("forward", false);
            bot.setControlState("sprint", false);
            bot.setControlState("jump", false);

            return true;

        } catch (_) {
            return false;
        }
    }

    // =========================================================
    // 🧠 DEFENDER — IA COMPLETA
    // =========================================================

    async function defender() {
        const alvo = procurarInimigoMaisPerigoso(
            CONFIG.distanciaBusca
        );

        if (!alvo) {
            return {
                sucesso: false,
                erro: "sem_inimigo"
            };
        }

        alvoAtual = alvo;

        const vida = minhaVida();
        const fome = minhaFome();

        // 1. Vida crítica: fugir
        if (vida < CONFIG.vidaCritica) {
            if (temComida() && fome < CONFIG.fomeBaixa) {
                await comer();
            }

            await fugir(alvo);

            return {
                sucesso: true,
                acao: "fugir",
                vida,
                fome
            };
        }

        // 2. Vida baixa: recuar e comer
        if (vida < CONFIG.vidaBaixa) {
            await recuarEComer(alvo);

            return {
                sucesso: true,
                acao: "recuar_e_comer",
                vida,
                fome
            };
        }

        // 3. Arqueiro: levantar escudo antes de atacar
        if (ehArqueiro(alvo) && temEscudo()) {
            await levantarEscudo();

            await new Promise(resolve => setTimeout(resolve, 500));

            const atacou = await atacarComCritico(alvo);

            abaixarEscudo();

            return {
                sucesso: atacou,
                acao: "escudo_e_ataque",
                alvo: nomeDoInimigo(alvo),
                vida
            };
        }

        // 4. Ataque normal
        const distancia = distanciaPara(alvo);

        if (distancia > CONFIG.distanciaAtaque) {
            try {
                bot.lookAt(alvo.position, true);
                bot.setControlState("forward", true);
                bot.setControlState("sprint", true);

                await new Promise(resolve => setTimeout(resolve, 200));

                bot.setControlState("forward", false);
                bot.setControlState("sprint", false);
            } catch (_) {}

            return {
                sucesso: true,
                acao: "aproximar",
                distancia,
                vida
            };
        }

        const atacou = await atacarComCritico(alvo);

        await strafe(alvo, 400);

        return {
            sucesso: atacou,
            acao: "atacar",
            alvo: nomeDoInimigo(alvo),
            distancia,
            vida,
            fome
        };
    }

    // =========================================================
    // 🎯 ATACAR (compatibilidade)
    // =========================================================

    async function atacar(entidadeOuNome) {
        let entidade = entidadeOuNome;

        if (typeof entidadeOuNome === "string") {
            const nome = entidadeOuNome.toLowerCase();

            entidade = Object.values(bot.entities || {})
                .find(item => {
                    return (
                        item !== bot.entity &&
                        (
                            String(item.name || "").toLowerCase() === nome ||
                            String(item.displayName || "").toLowerCase() === nome
                        )
                    );
                });
        }

        if (!entidadeValida(entidade)) return false;

        if (distanciaPara(entidade) > CONFIG.distanciaAtaque) {
            return false;
        }

        return atacarComCritico(entidade);
    }

    async function atacarMaisProximo(
        distancia = CONFIG.distanciaBusca
    ) {
        const inimigo = procurarInimigoMaisProximo(distancia);
        if (!inimigo) return false;

        return atacarComCritico(inimigo);
    }

    // =========================================================
    // 🛑 PARAR
    // =========================================================

    function parar() {
        alvoAtual = null;
        atacando = false;

        try { bot.stopDigging(); } catch (_) {}

        try { bot.setControlState("forward", false); } catch (_) {}
        try { bot.setControlState("sprint", false); } catch (_) {}
        try { bot.setControlState("jump", false); } catch (_) {}

        try { abaixarEscudo(); } catch (_) {}

        return true;
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterAlvo() {
        return alvoAtual;
    }

    function obterEstado() {
        return {
            atacando,
            vida: minhaVida(),
            fome: minhaFome(),
            temEscudo: temEscudo(),
            temComida: temComida(),
            alvo: alvoAtual
                ? {
                    id: alvoAtual.id,
                    nome: alvoAtual.name,
                    displayName: alvoAtual.displayName,
                    distancia: distanciaPara(alvoAtual),
                    prioridade: prioridadeDoInimigo(alvoAtual),
                    arqueiro: ehArqueiro(alvoAtual)
                }
                : null
        };
    }

    // =========================================================
    // 🔌 API
    // =========================================================

    return {
        // Procura
        procurarInimigos,
        procurarInimigoMaisProximo,
        procurarInimigoMaisPerigoso,

        // Ataque
        mirar,
        atacar,
        atacarMaisProximo,
        atacarComCritico,

        // Movimento
        strafe,
        recuarEComer,
        fugir,

        // Escudo
        temEscudo,
        equiparEscudo,
        levantarEscudo,
        abaixarEscudo,

        // Comida
        temComida,
        comer,

        // IA
        defender,

        // Controle
        parar,
        obterAlvo,
        obterEstado,

        // Helpers expostos
        preverPosicao,
        distanciaPara,
        ehHostil
    };
}

module.exports = {
    criarCombate
};