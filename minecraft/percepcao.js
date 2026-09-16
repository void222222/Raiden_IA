/**
 * 👁️ PERCEPÇÃO — RAIDEN MINECRAFT
 *
 * Camada de percepção do mundo.
 *
 * Não decide ações.
 * Não executa ações.
 * Apenas transforma o estado do Mineflayer
 * em informações úteis para os outros módulos.
 *
 * ⚠️ MUDANÇAS DESTA VERSÃO:
 *
 * 1. Perigos usam CAIXA (AABB) — raio configurável.
 * 2. Lava/fogo só perigo se PERTO.
 * 3. Inimigos: raio 8 blocos.
 * 4. Cache de 500ms para obterPerigos().
 * 5. obterPerigos() classifica gravidade.
 * 6. Flechas são perigos críticos.
 * 7. Esqueletos têm raio crítico maior (12 blocos).
 * 8. obterItensNoChao() — itens dropados no chão.
 * 9. obterProjeteisVindo(), obterInimigoMaisPerigoso(),
 *    obterAmeacaEmArea() — leitura de combate.
 * 10. obterBioma(), obterBiomasProximos() — leitura de bioma.
 *
 * ⚠️ CORREÇÃO DESTA VERSÃO:
 *
 * obterBioma() agora DESCE até 5 blocos até achar um
 * bloco que tenha biome. Antes, só olhava o Y atual
 * e o Y-1. Se o bot estivesse no ar (y=79), retornava
 * "desconhecido".
 *
 * Também tem fallback pra bot.world.getBiome().
 */

function criarPercepcao(contexto) {
    const bot = contexto.bot;

    // =========================================================
    // ⚙️ CONFIG
    // =========================================================

    const CONFIG = {
        distanciaEntidades: 16,
        quantidadeMaximaEntidades: 50,
        distanciaInimigo: 8,

        perigo: {
            horizontal: 10,
            acima: 5,
            abaixo: 3
        },

        distanciaLava: 3,
        distanciaFogo: 2,
        distanciaArqueiro: 12,

        cachePerigosMs: 500,

        distanciaItensChao: 16,

        raioBiomas: 3
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

    const TIPOS_IGNORADOS = new Set([
        "object",
        "other",
        "orb"
    ]);

    const BLOCOS_PERIGOSOS = {
        lava: {
            termos: ["lava"],
            distanciaCritica: CONFIG.distanciaLava
        },
        fogo: {
            termos: ["fire", "soul_fire"],
            distanciaCritica: CONFIG.distanciaFogo
        },
        magma: {
            termos: ["magma_block"],
            distanciaCritica: CONFIG.distanciaFogo
        }
    };

    const PRIORIDADE_INIMIGO = {
        warden: 200,
        creeper: 100,
        skeleton: 90,
        stray: 90,
        bogged: 90,
        ravager: 85,
        witch: 80,
        evoker: 75,
        pillager: 70,
        vindicator: 70,
        blaze: 65,
        ghast: 65,
        phantom: 60,
        enderman: 50,
        zombie: 40,
        husk: 40,
        drowned: 40,
        spider: 30,
        cave_spider: 30,
        magma_cube: 25,
        slime: 20,
        silverfish: 15,
        endermite: 15
    };

    const ARQUEIROS = new Set([
        "skeleton", "stray", "bogged"
    ]);

    // =========================================================
    // 🔢 UTILITÁRIOS
    // =========================================================

    function numero(valor, padrao = 0) {
        const r = Number(valor);
        return Number.isFinite(r) ? r : padrao;
    }

    function distancia(a, b) {
        if (!a || !b) return Infinity;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // =========================================================
    // 📍 POSIÇÃO / ROTAÇÃO / VELOCIDADE
    // =========================================================

    function obterPosicao() {
        const posicao = bot.entity?.position;
        if (!posicao) return null;

        return {
            x: numero(posicao.x),
            y: numero(posicao.y),
            z: numero(posicao.z)
        };
    }

    function obterRotacao() {
        if (!bot.entity) {
            return { yaw: 0, pitch: 0 };
        }

        return {
            yaw: numero(bot.entity.yaw),
            pitch: numero(bot.entity.pitch)
        };
    }

    function obterVelocidade() {
        const v = bot.entity?.velocity;
        if (!v) return { x: 0, y: 0, z: 0 };

        return {
            x: numero(v.x),
            y: numero(v.y),
            z: numero(v.z)
        };
    }

    // =========================================================
    // 🎒 INVENTÁRIO
    // =========================================================

    function obterItemNaMao() {
        const item = bot.heldItem;
        if (!item) return null;

        return {
            slot: item.slot,
            id: item.type,
            nome: item.name,
            displayName: item.displayName,
            quantidade: item.count,
            durabilidade: item.durabilityUsed,
            durabilidadeMaxima: item.maxDurability
        };
    }

    function obterInventario() {
        if (!bot.inventory?.slots) return [];

        return bot.inventory.slots
            .filter(Boolean)
            .map(item => ({
                slot: item.slot,
                id: item.type,
                nome: item.name,
                displayName: item.displayName,
                quantidade: item.count,
                durabilidade: item.durabilityUsed,
                durabilidadeMaxima: item.maxDurability
            }));
    }

    // =========================================================
    // 👥 ENTIDADES
    // =========================================================

    function obterEntidadesProximas(
        distanciaMaxima = CONFIG.distanciaEntidades
    ) {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        return Object.values(bot.entities || {})
            .filter(entidade => {
                if (
                    !entidade ||
                    entidade === bot.entity ||
                    !entidade.position
                ) {
                    return false;
                }

                const tipo = String(
                    entidade.type || ""
                ).toLowerCase();

                if (TIPOS_IGNORADOS.has(tipo)) {
                    return false;
                }

                return (
                    distancia(posicao, entidade.position) <=
                    distanciaMaxima
                );
            })
            .map(entidade => {
                const nome = String(
                    entidade.name ||
                        entidade.displayName ||
                        ""
                ).toLowerCase();

                const ehJogador = entidade.type === "player";
                const ehProjetil = entidade.type === "projectile";

                const perigoProjetil =
                    ehProjetil && nome === "arrow";

                return {
                    id: entidade.id,
                    tipo: entidade.type,
                    nome: entidade.name || null,
                    displayName: entidade.displayName || null,
                    distancia: Number(
                        distancia(
                            posicao,
                            entidade.position
                        ).toFixed(2)
                    ),
                    posicao: {
                        x: numero(entidade.position.x),
                        y: numero(entidade.position.y),
                        z: numero(entidade.position.z)
                    },
                    velocidade: {
                        x: numero(entidade.velocity?.x),
                        y: numero(entidade.velocity?.y),
                        z: numero(entidade.velocity?.z)
                    },
                    vida: entidade.health ?? null,
                    fome: entidade.food ?? null,
                    jogador: ehJogador,
                    hostil: HOSTIS.has(nome),
                    perigoProjetil
                };
            })
            .sort((a, b) => a.distancia - b.distancia)
            .slice(0, CONFIG.quantidadeMaximaEntidades);
    }

    function obterJogadoresProximos(
        distanciaMaxima = CONFIG.distanciaEntidades
    ) {
        return obterEntidadesProximas(distanciaMaxima)
            .filter(e => e.jogador);
    }

    function obterInimigosProximos(
        distanciaMaxima = CONFIG.distanciaEntidades
    ) {
        return obterEntidadesProximas(distanciaMaxima)
            .filter(e => e.hostil || e.perigoProjetil);
    }

    // =========================================================
    // ⚔️ LEITURA DE COMBATE (FASE 2)
    // =========================================================

    function prioridadeDoInimigo(entidade) {
        const nome = String(entidade?.nome || "").toLowerCase();
        return PRIORIDADE_INIMIGO[nome] || 10;
    }

    function ehArqueiro(entidade) {
        const nome = String(entidade?.nome || "").toLowerCase();
        return ARQUEIROS.has(nome);
    }

    function obterInimigoMaisPerigoso(
        distanciaMaxima = CONFIG.distanciaEntidades
    ) {
        const inimigos = obterInimigosProximos(distanciaMaxima);

        if (!inimigos.length) return null;

        return inimigos
            .slice()
            .sort((a, b) => {
                const pa = prioridadeDoInimigo(a);
                const pb = prioridadeDoInimigo(b);

                if (pa !== pb) return pb - pa;

                return a.distancia - b.distancia;
            })[0];
    }

    function obterProjeteisVindo(
        distanciaMaxima = CONFIG.distanciaEntidades,
        raioAngular = 0.5
    ) {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        const flechas = Object.values(bot.entities || {})
            .filter(ent => {
                if (!ent || !ent.position) return false;
                if (ent.type !== "projectile") return false;

                const nome = String(ent.name || "").toLowerCase();
                if (nome !== "arrow") return false;

                return (
                    distancia(posicao, ent.position) <=
                    distanciaMaxima
                );
            });

        const vindo = [];

        for (const flecha of flechas) {
            const vel = flecha.velocity || {};
            const vx = numero(vel.x);
            const vy = numero(vel.y);
            const vz = numero(vel.z);

            const velMag = Math.sqrt(vx * vx + vy * vy + vz * vz);

            if (velMag < 0.05) continue;

            const dx = posicao.x - flecha.position.x;
            const dy = posicao.y - flecha.position.y;
            const dz = posicao.z - flecha.position.z;

            const distMag = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distMag < 0.01) continue;

            const dot =
                (vx * dx + vy * dy + vz * dz) /
                (velMag * distMag);

            if (dot >= 1 - raioAngular) {
                vindo.push({
                    id: flecha.id,
                    nome: "arrow",
                    posicao: {
                        x: numero(flecha.position.x),
                        y: numero(flecha.position.y),
                        z: numero(flecha.position.z)
                    },
                    velocidade: { x: vx, y: vy, z: vz },
                    distancia: Number(distMag.toFixed(2)),
                    cosseno: Number(dot.toFixed(3))
                });
            }
        }

        return vindo.sort((a, b) => a.distancia - b.distancia);
    }

    function obterAmeacaEmArea(distanciaMaxima = 8) {
        const inimigos = obterInimigosProximos(distanciaMaxima);

        const projeteisVindo = obterProjeteisVindo(
            distanciaMaxima,
            0.5
        );

        const criticos = inimigos.filter(
            i => i.distancia <= 3
        );

        const arqueiros = inimigos.filter(i => ehArqueiro(i));

        const creepers = inimigos.filter(i => {
            const nome = String(i.nome || "").toLowerCase();
            return nome === "creeper";
        });

        const vida = numero(bot.health, 20);

        const maisPerigoso = obterInimigoMaisPerigoso(distanciaMaxima);

        let sugestao = "seguro";

        if (inimigos.length === 0) {
            sugestao = "seguro";
        } else if (vida < 6) {
            sugestao = "fugir";
        } else if (creepers.length > 0 && creepers[0].distancia < 5) {
            sugestao = "fugir";
        } else if (vida < 14 || inimigos.length >= 4) {
            sugestao = "recuar";
        } else if (
            projeteisVindo.length > 0 &&
            projeteisVindo[0].distancia < 4
        ) {
            sugestao = "recuar";
        } else {
            sugestao = "lutar";
        }

        return {
            total: inimigos.length,
            criticos: criticos.length,
            arqueiros: arqueiros.length,
            creepers: creepers.length,
            maisPerigoso,
            projeteisVindo,
            sugestao,
            vida
        };
    }

    // =========================================================
    // 🌳 LEITURA DE BIOMA (FASE 3)
    // =========================================================

    /*
     * ⚠️ CORRIGIDO: desce até 5 blocos até achar um bloco
     * que tenha biome.
     *
     * Antes, só olhava Y atual e Y-1. Se o bot estivesse
     * no ar (y=79), retornava "desconhecido".
     *
     * Fallback: bot.world.getBiome() se existir.
     */
    function obterBioma() {
        const posicao = bot.entity?.position;
        if (!posicao) return null;

        try {
            // Desce até 5 blocos procurando bloco com biome
            for (let dy = 0; dy >= -5; dy--) {
                const alvo = posicao.offset(0, dy, 0);
                let bloco;

                try {
                    bloco = bot.blockAt(alvo);
                } catch (_) {
                    continue;
                }

                if (!bloco) continue;

                if (bloco.biome) {
                    const nome = String(
                        bloco.biome.name || ""
                    ).toLowerCase();

                    if (nome) {
                        return {
                            nome,
                            displayName:
                                bloco.biome.displayName ||
                                nome,
                            id: bloco.biome.id ?? null
                        };
                    }
                }
            }

            // Fallback: bot.world.getBiome
            if (
                bot.world &&
                typeof bot.world.getBiome === "function"
            ) {
                try {
                    const bioma = bot.world.getBiome(posicao);

                    if (bioma) {
                        const nome = String(
                            bioma.name || ""
                        ).toLowerCase();

                        if (nome) {
                            return {
                                nome,
                                displayName:
                                    bioma.displayName || nome,
                                id: bioma.id ?? null
                            };
                        }
                    }
                } catch (_) {}
            }

            return {
                nome: "desconhecido",
                displayName: "Desconhecido",
                id: null
            };

        } catch (_) {
            return {
                nome: "desconhecido",
                displayName: "Desconhecido",
                id: null
            };
        }
    }

    /*
     * Biomas próximos (varredura em grade).
     *
     * ⚠️ CORRIGIDO: também desce até achar bloco com biome.
     */
    function obterBiomasProximos(
        raio = CONFIG.raioBiomas
    ) {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        const passo = 8;
        const vistos = new Map();

        for (let dx = -raio; dx <= raio; dx++) {
            for (let dz = -raio; dz <= raio; dz++) {
                // Tenta de Y-1 até Y-5
                for (let dy = -1; dy >= -5; dy--) {
                    const alvo = {
                        x: posicao.x + dx * passo,
                        y: posicao.y + dy,
                        z: posicao.z + dz * passo
                    };

                    let bloco;
                    try {
                        bloco = bot.blockAt(alvo);
                    } catch (_) {
                        continue;
                    }

                    if (!bloco || !bloco.biome) continue;

                    const nome = String(
                        bloco.biome.name || ""
                    ).toLowerCase();

                    if (!nome) continue;

                    if (!vistos.has(nome)) {
                        vistos.set(nome, {
                            nome,
                            displayName:
                                bloco.biome.displayName || nome,
                            id: bloco.biome.id ?? null,
                            distancia: Number(
                                distancia(posicao, alvo).toFixed(1)
                            ),
                            offset: {
                                dx: dx * passo,
                                dz: dz * passo
                            }
                        });
                    }

                    break; // achou biome nessa coluna
                }
            }
        }

        return Array.from(vistos.values())
            .sort((a, b) => a.distancia - b.distancia);
    }

    // =========================================================
    // 🎁 ITENS NO CHÃO
    // =========================================================

    function obterItensNoChao(
        distanciaMaxima = CONFIG.distanciaItensChao
    ) {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        return Object.values(bot.entities || {})
            .filter(ent => {
                if (!ent || !ent.position) return false;
                if (ent.type !== "object") return false;

                const nome = String(ent.name || "").toLowerCase();
                if (nome !== "item") return false;

                return (
                    distancia(posicao, ent.position) <=
                    distanciaMaxima
                );
            })
            .map(ent => {
                const itemName =
                    ent.displayName ||
                    ent.metadata?.[8]?.name ||
                    ent.metadata?.[7]?.name ||
                    null;

                return {
                    id: ent.id,
                    nome: itemName,
                    displayName: ent.displayName || null,
                    quantidade: 1,
                    posicao: {
                        x: numero(ent.position.x),
                        y: numero(ent.position.y),
                        z: numero(ent.position.z)
                    },
                    distancia: Number(
                        distancia(posicao, ent.position).toFixed(2)
                    )
                };
            })
            .sort((a, b) => a.distancia - b.distancia);
    }

    // =========================================================
    // 🧱 BLOCOS
    // =========================================================

    function obterBloco(x, y, z) {
        if (
            !Number.isFinite(Number(x)) ||
            !Number.isFinite(Number(y)) ||
            !Number.isFinite(Number(z))
        ) {
            return null;
        }

        try {
            const bloco = bot.blockAt({
                x: Math.floor(x),
                y: Math.floor(y),
                z: Math.floor(z)
            });

            if (!bloco) return null;

            return {
                nome: bloco.name,
                displayName: bloco.displayName,
                id: bloco.type,
                posicao: {
                    x: bloco.position.x,
                    y: bloco.position.y,
                    z: bloco.position.z
                },
                solido: bloco.boundingBox === "block",
                transparente: bloco.transparent === true,
                colidivel: bloco.boundingBox !== "empty",
                quebravel: bloco.diggable !== false
            };
        } catch (_) {
            return null;
        }
    }

    function obterBlocoCompleto(x, y, z) {
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
        const posicao = bot.entity?.position;
        if (!posicao) return null;

        return obterBloco(
            Math.floor(posicao.x),
            Math.floor(posicao.y) - 1,
            Math.floor(posicao.z)
        );
    }

    function obterBlocoFrente() {
        const posicao = bot.entity?.position;
        const yaw = bot.entity?.yaw;

        if (!posicao || !Number.isFinite(yaw)) return null;

        const x = Math.floor(posicao.x - Math.sin(yaw));
        const z = Math.floor(posicao.z - Math.cos(yaw));

        return obterBloco(x, Math.floor(posicao.y), z);
    }

    function obterBlocoEsquerda() {
        const posicao = bot.entity?.position;
        const yaw = bot.entity?.yaw;

        if (!posicao || !Number.isFinite(yaw)) return null;

        const x = Math.floor(posicao.x - Math.cos(yaw));
        const z = Math.floor(posicao.z + Math.sin(yaw));

        return obterBloco(x, Math.floor(posicao.y), z);
    }

    function obterBlocoDireita() {
        const posicao = bot.entity?.position;
        const yaw = bot.entity?.yaw;

        if (!posicao || !Number.isFinite(yaw)) return null;

        const x = Math.floor(posicao.x + Math.cos(yaw));
        const z = Math.floor(posicao.z - Math.sin(yaw));

        return obterBloco(x, Math.floor(posicao.y), z);
    }

    // =========================================================
    // 🌤️ AMBIENTE
    // =========================================================

    function obterAmbiente() {
        const posicao = obterPosicao();

        return {
            tempo: bot.time?.time ?? null,
            hora: bot.time?.timeOfDay ?? null,
            dia: bot.time?.day ?? null,
            chuva: bot.isRaining === true,
            trovao: bot.thunderState > 0,
            dificuldade: bot.game?.difficulty ?? null,
            modoJogo: bot.game?.gameMode ?? null,
            nomeMundo: bot.game?.levelType ?? null,
            posicao,

            bioma: obterBioma()
        };
    }

    function obterAmbienteProximo() {
        const blocos = {};
        const posicao = bot.entity?.position;
        if (!posicao) return blocos;

        const x = Math.floor(posicao.x);
        const y = Math.floor(posicao.y);
        const z = Math.floor(posicao.z);

        const offsets = {
            centro: [0, 0, 0],
            baixo: [0, -1, 0],
            cima: [0, 1, 0],
            norte: [0, 0, -1],
            sul: [0, 0, 1],
            oeste: [-1, 0, 0],
            leste: [1, 0, 0]
        };

        for (const [nome, offset] of Object.entries(offsets)) {
            blocos[nome] = obterBloco(
                x + offset[0],
                y + offset[1],
                z + offset[2]
            );
        }

        return blocos;
    }

    // =========================================================
    // 🔍 ENCONTRAR BLOCOS
    // =========================================================

    function encontrarBlocos(
        nome,
        distanciaMaxima = 8,
        limite = 20
    ) {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        const alvo = String(nome || "")
            .trim()
            .toLowerCase();

        if (!alvo) return [];

        const distanciaLimitada = Math.max(
            1,
            Math.min(Math.floor(distanciaMaxima), 16)
        );

        const limiteNumerico = Math.max(
            1,
            Math.floor(limite)
        );

        const idAlvo =
            bot.registry?.blocksByName?.[alvo]?.id;

        if (idAlvo === undefined) return [];

        let posicoes = [];

        try {
            posicoes = bot.findBlocks({
                matching: idAlvo,
                maxDistance: distanciaLimitada,
                count: limiteNumerico
            });
        } catch (_) {
            return [];
        }

        if (!Array.isArray(posicoes)) return [];

        return posicoes
            .map(pos => {
                const bloco = bot.blockAt(pos);
                if (!bloco) return null;

                return {
                    nome: bloco.name,
                    displayName: bloco.displayName,
                    id: bloco.type,
                    posicao: {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    },
                    distancia: Number(
                        distancia(posicao, pos).toFixed(2)
                    )
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.distancia - b.distancia);
    }

    // =========================================================
    // ⚠️ PERIGOS
    // =========================================================

    function classificarBlocoPerigoso(nomeBloco) {
        const nome = String(nomeBloco || "").toLowerCase();

        for (const [tipo, def] of Object.entries(BLOCOS_PERIGOSOS)) {
            for (const termo of def.termos) {
                if (nome.includes(termo)) {
                    return {
                        tipo,
                        termo,
                        distanciaCritica: def.distanciaCritica
                    };
                }
            }
        }

        return null;
    }

    function varrerBlocosPerigosos(posicao) {
        const perigos = [];

        const px = Math.floor(posicao.x);
        const py = Math.floor(posicao.y);
        const pz = Math.floor(posicao.z);

        const h = CONFIG.perigo.horizontal;
        const acima = CONFIG.perigo.acima;
        const abaixo = CONFIG.perigo.abaixo;

        for (let dx = -h; dx <= h; dx++) {
            for (let dz = -h; dz <= h; dz++) {
                for (let dy = -abaixo; dy <= acima; dy++) {
                    const x = px + dx;
                    const y = py + dy;
                    const z = pz + dz;

                    const bloco = obterBlocoCompleto(x, y, z);
                    if (!bloco) continue;

                    const classificado = classificarBlocoPerigoso(
                        bloco.name
                    );
                    if (!classificado) continue;

                    const dist = distancia(posicao, { x, y, z });

                    const critico =
                        dist <= classificado.distanciaCritica;

                    perigos.push({
                        tipo: classificado.tipo,
                        nome: bloco.name,
                        posicao: { x, y, z },
                        distancia: Number(dist.toFixed(2)),
                        gravidade: critico ? "critico" : "alerta",
                        distanciaCritica:
                            classificado.distanciaCritica
                    });
                }
            }
        }

        return perigos;
    }

    let cachePerigos = {
        em: 0,
        valor: [],
        posicao: null
    };

    function invalidarCachePerigos() {
        cachePerigos.em = 0;
        cachePerigos.valor = [];
        cachePerigos.posicao = null;
    }

    function obterPerigos() {
        const posicao = bot.entity?.position;
        if (!posicao) return [];

        const agora = Date.now();

        if (
            cachePerigos.em > 0 &&
            agora - cachePerigos.em < CONFIG.cachePerigosMs &&
            cachePerigos.posicao &&
            distancia(cachePerigos.posicao, posicao) < 0.5
        ) {
            return cachePerigos.valor;
        }

        const perigos = [];

        const inimigos = obterInimigosProximos(
            CONFIG.distanciaInimigo
        );

        for (const inimigo of inimigos) {
            const nome = String(inimigo.nome || "").toLowerCase();

            if (nome === "arrow") {
                perigos.push({
                    tipo: "projetil",
                    subtipo: "arrow",
                    nome: "arrow",
                    posicao: inimigo.posicao,
                    distancia: inimigo.distancia,
                    gravidade: "critico"
                });
                continue;
            }

            const ehArqueiroAtual =
                nome === "skeleton" ||
                nome === "stray" ||
                nome === "bogged";

            const raioCritico = ehArqueiroAtual
                ? CONFIG.distanciaArqueiro
                : 3;

            const critico = inimigo.distancia <= raioCritico;

            perigos.push({
                tipo: "entidade",
                subtipo: nome,
                nome: inimigo.nome,
                displayName: inimigo.displayName,
                id: inimigo.id,
                posicao: inimigo.posicao,
                distancia: inimigo.distancia,
                gravidade: critico ? "critico" : "alerta"
            });
        }

        const blocosPerigos = varrerBlocosPerigosos(posicao);
        perigos.push(...blocosPerigos);

        perigos.sort((a, b) => a.distancia - b.distancia);

        cachePerigos.em = agora;
        cachePerigos.valor = perigos;
        cachePerigos.posicao = {
            x: posicao.x,
            y: posicao.y,
            z: posicao.z
        };

        return perigos;
    }

    function existePerigoCritico() {
        return obterPerigos().some(
            p => p.gravidade === "critico"
        );
    }

    function existeAlgumPerigo() {
        return obterPerigos().length > 0;
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterEstado() {
        return {
            conectado: bot.player != null,

            posicao: obterPosicao(),
            rotacao: obterRotacao(),
            velocidade: obterVelocidade(),

            vida: numero(bot.health, 20),
            fome: numero(bot.food, 20),

            experiencia: {
                nivel: bot.experience?.level ?? 0,
                pontos: bot.experience?.points ?? 0,
                progresso: bot.experience?.progress ?? 0
            },

            itemNaMao: obterItemNaMao(),
            inventario: obterInventario(),

            entidades: obterEntidadesProximas(),
            jogadores: obterJogadoresProximos(),
            inimigos: obterInimigosProximos(),

            itensNoChao: obterItensNoChao(),

            ambiente: obterAmbiente(),
            ambienteProximo: obterAmbienteProximo(),

            perigos: obterPerigos(),

            ameaca: obterAmeacaEmArea(),

            bioma: obterBioma(),
            biomasProximos: obterBiomasProximos(),

            blocoSob: obterBlocoSob(),
            blocoFrente: obterBlocoFrente()
        };
    }

    // =========================================================
    // 🔌 API
    // =========================================================

    return {
        obterPosicao,
        obterRotacao,
        obterVelocidade,

        obterInventario,
        obterItemNaMao,

        obterEntidadesProximas,
        obterJogadoresProximos,
        obterInimigosProximos,

        obterItensNoChao,

        obterInimigoMaisPerigoso,
        obterProjeteisVindo,
        obterAmeacaEmArea,
        prioridadeDoInimigo,
        ehArqueiro,

        obterBioma,
        obterBiomasProximos,

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
        existePerigoCritico,
        existeAlgumPerigo,
        invalidarCachePerigos,

        obterEstado
    };
}

module.exports = {
    criarPercepcao
};