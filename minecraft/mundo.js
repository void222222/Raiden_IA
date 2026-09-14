/**
 * 🌍 MUNDO — RAIDEN MINECRAFT
 *
 * Responsável por interação direta com o mundo:
 * - consultar blocos
 * - procurar blocos (um ou vários nomes)
 * - quebrar blocos
 * - colocar blocos
 * - interagir com blocos
 * - usar itens
 *
 * Não decide o que fazer.
 */

const { Vec3 } = require("vec3");

function criarMundo(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    const CONFIG = {
        distanciaMaximaInteracao: 4.5,
        distanciaMaximaQuebra: 5,
        raioBuscaMaximo: 32,
        limiteBusca: 200
    };

    // =========================================================
    // 📍 GEOMETRIA
    // =========================================================

    function posicaoValida(x, y, z) {
        return (
            Number.isFinite(Number(x)) &&
            Number.isFinite(Number(y)) &&
            Number.isFinite(Number(z))
        );
    }

    function obterPosicaoBot() {
        return bot.entity?.position || null;
    }

    function distanciaDoBot(posicao) {
        const origem = obterPosicaoBot();

        if (!origem || !posicao) {
            return Infinity;
        }

        const dx = origem.x - posicao.x;
        const dy = origem.y - posicao.y;
        const dz = origem.z - posicao.z;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function estaAoAlcance(
        posicao,
        distanciaMaxima = CONFIG.distanciaMaximaInteracao
    ) {
        return distanciaDoBot(posicao) <= distanciaMaxima;
    }

    // =========================================================
    // 🧱 CONSULTA DE BLOCO
    // =========================================================

    function obterBloco(x, y, z) {
        if (!posicaoValida(x, y, z)) {
            return null;
        }

        try {
            const pos = new Vec3(
                Math.floor(Number(x)),
                Math.floor(Number(y)),
                Math.floor(Number(z))
            );

            return bot.blockAt(pos);
        } catch (erro) {
            console.error(
                "🌍 Erro ao obter bloco:",
                erro.message
            );

            return null;
        }
    }

    function serializarBloco(bloco) {
        if (!bloco) {
            return null;
        }

        return {
            id: bloco.type,
            nome: bloco.name,
            displayName: bloco.displayName,
            posicao: {
                x: bloco.position.x,
                y: bloco.position.y,
                z: bloco.position.z
            },
            solido: bloco.boundingBox === "block",
            diggavel: bloco.diggable !== false,
            transparente: bloco.transparent === true
        };
    }

    function obterBlocoEstado(x, y, z) {
        return serializarBloco(obterBloco(x, y, z));
    }

    // =========================================================
    // 🔍 NORMALIZAÇÃO DE NOMES
    // =========================================================

    /*
     * Aceita:
     *   "oak_log"              → { nomes: ["oak_log"], ids: [id] }
     *   ["oak_log", "birch"]   → múltiplos
     *
     * Filtra nomes desconhecidos do registry.
     */
    function normalizarNomes(nome) {
        let lista = [];

        if (Array.isArray(nome)) {
            lista = nome;
        } else if (typeof nome === "string") {
            lista = [nome];
        } else {
            return { nomes: [], ids: [] };
        }

        const nomes = [];
        const ids = [];

        for (const bruto of lista) {
            const limpo = String(bruto || "")
                .trim()
                .toLowerCase();

            if (!limpo) continue;

            const id = bot.registry?.blocksByName?.[limpo]?.id;

            if (id === undefined || id === null) {
                continue;
            }

            nomes.push(limpo);
            ids.push(id);
        }

        return { nomes, ids };
    }

    // =========================================================
    // 🔍 ENCONTRAR BLOCOS
    // =========================================================
    //
    // Aceita string OU array de strings.
    //
    // Retorna lista de blocos no formato:
    //   {
    //     id, nome, displayName,
    //     posicao: { x, y, z },
    //     distancia,
    //     nomeEncontrado   // qual dos nomes da lista casou
    //   }
    //
    // Ordenado por distância crescente.

    function encontrarBlocos(
        nome,
        distanciaMaxima = 16,
        limite = 20
    ) {
        const origem = obterPosicaoBot();

        if (!origem) {
            return [];
        }

        const { nomes, ids } = normalizarNomes(nome);

        if (!ids.length) {
            return [];
        }

        const raio = Math.min(
            Math.max(1, Math.floor(distanciaMaxima)),
            CONFIG.raioBuscaMaximo
        );

        const quantidade = Math.min(
            Math.max(1, Math.floor(limite)),
            CONFIG.limiteBusca
        );

        /*
         * bot.findBlocks aceita:
         *   matching: id | array de ids | função
         *
         * Usamos função pra confirmar que o id está na lista
         * que queremos. Isso evita falsos positivos se
         * `bot.findBlocks` fizer alguma normalização interna.
         */
        const idsSet = new Set(ids);

        let posicoes = [];

        try {
            posicoes = bot.findBlocks({
                matching: (bloco) => {
                    if (!bloco) return false;
                    if (typeof bloco === "number") {
                        return idsSet.has(bloco);
                    }
                    return idsSet.has(bloco.type);
                },
                maxDistance: raio,
                count: quantidade
            });
        } catch (erro) {
            /*
             * Fallback: versões antigas do Mineflayer não
             * aceitam função em `matching`. Passa o array
             * de ids direto.
             */
            try {
                posicoes = bot.findBlocks({
                    matching: ids,
                    maxDistance: raio,
                    count: quantidade
                });
            } catch (erro2) {
                console.error(
                    "🌍 Erro em bot.findBlocks:",
                    erro2.message
                );
                return [];
            }
        }

        if (!Array.isArray(posicoes) || !posicoes.length) {
            return [];
        }

        const encontrados = [];

        for (const pos of posicoes) {
            const bloco = bot.blockAt(pos);

            if (!bloco) continue;

            const nomeEncontrado = String(
                bloco.name || ""
            ).toLowerCase();

            // Aceita só se o nome está na lista pedida
            if (nomes.length && !nomes.includes(nomeEncontrado)) {
                continue;
            }

            encontrados.push({
                id: bloco.type,
                nome: bloco.name,
                displayName: bloco.displayName,
                nomeEncontrado,
                posicao: {
                    x: bloco.position.x,
                    y: bloco.position.y,
                    z: bloco.position.z
                },
                distancia: distanciaDoBot(bloco.position)
            });
        }

        encontrados.sort(
            (a, b) => a.distancia - b.distancia
        );

        return encontrados;
    }

    // =========================================================
    // 🎯 FACE / REFERÊNCIA
    // =========================================================

    function normalizarFace(face) {
        if (!face) {
            return { x: 0, y: 1, z: 0 };
        }

        return {
            x: Number(face.x) || 0,
            y: Number(face.y) || 0,
            z: Number(face.z) || 0
        };
    }

    function obterBlocoReferencia(x, y, z, face) {
        const normal = normalizarFace(face);

        return obterBloco(
            x - normal.x,
            y - normal.y,
            z - normal.z
        );
    }

    // =========================================================
    // ⛏ QUEBRAR
    // =========================================================

    async function quebrar(x, y, z) {
        const bloco = obterBloco(x, y, z);

        if (!bloco) {
            return false;
        }

        if (bloco.diggable === false) {
            return false;
        }

        if (
            !estaAoAlcance(
                bloco.position,
                CONFIG.distanciaMaximaQuebra
            )
        ) {
            return false;
        }

        try {
            if (bot.targetDigBlock !== bloco) {
                await bot.lookAt(
                    bloco.position.offset(0.5, 0.5, 0.5),
                    true
                );
            }

            await bot.dig(bloco, true);

            return true;
        } catch (erro) {
            console.error(
                "⛏️ Erro ao quebrar bloco:",
                erro.message
            );

            return false;
        }
    }

    // =========================================================
    // 🧱 COLOCAR
    // =========================================================

    async function colocar(
        nomeItem,
        x,
        y,
        z,
        face = { x: 0, y: 1, z: 0 }
    ) {
        if (!posicaoValida(x, y, z)) {
            return false;
        }

        const alvo = obterBloco(x, y, z);

        if (!alvo) {
            return false;
        }

        if (
            alvo.name !== "air" &&
            alvo.boundingBox !== "empty"
        ) {
            return false;
        }

        const referencia = obterBlocoReferencia(
            x,
            y,
            z,
            face
        );

        if (!referencia) {
            return false;
        }

        if (referencia.boundingBox === "empty") {
            return false;
        }

        if (!estaAoAlcance(referencia.position)) {
            return false;
        }

        const item = inventario.procurarItem(nomeItem);

        if (!item) {
            return false;
        }

        try {
            await bot.equip(item, "hand");

            await bot.lookAt(
                referencia.position.offset(0.5, 0.5, 0.5),
                true
            );

            await bot.placeBlock(
                referencia,
                normalizarFace(face)
            );

            return true;
        } catch (erro) {
            console.error(
                "🧱 Erro ao colocar bloco:",
                erro.message
            );

            return false;
        }
    }

    // =========================================================
    // 👆 INTERAGIR
    // =========================================================

    async function interagir(x, y, z) {
        const bloco = obterBloco(x, y, z);

        if (!bloco) {
            return false;
        }

        if (!estaAoAlcance(bloco.position)) {
            return false;
        }

        try {
            await bot.lookAt(
                bloco.position.offset(0.5, 0.5, 0.5),
                true
            );

            await bot.activateBlock(bloco);

            return true;
        } catch (erro) {
            console.error(
                "🌍 Erro ao interagir com bloco:",
                erro.message
            );

            return false;
        }
    }

    // =========================================================
    // 🖐️ USAR ITEM
    // =========================================================

    async function usarItem(nomeItem = null) {
        try {
            if (nomeItem) {
                const item = inventario.procurarItem(nomeItem);

                if (!item) {
                    return false;
                }

                await bot.equip(item, "hand");
            }

            bot.activateItem();

            return true;
        } catch (erro) {
            console.error(
                "🖐️ Erro ao usar item:",
                erro.message
            );

            return false;
        }
    }

    // =========================================================
    // 🧭 ADJACENTES
    // =========================================================

    function obterBlocoSob(x = null, y = null, z = null) {
        const posicao =
            x === null || y === null || z === null
                ? obterPosicaoBot()
                : { x, y, z };

        if (!posicao) {
            return null;
        }

        return obterBlocoEstado(
            Math.floor(posicao.x),
            Math.floor(posicao.y) - 1,
            Math.floor(posicao.z)
        );
    }

    function obterBlocosAoRedor(x = null, y = null, z = null) {
        const posicao =
            x === null || y === null || z === null
                ? obterPosicaoBot()
                : { x, y, z };

        if (!posicao) {
            return {};
        }

        const px = Math.floor(posicao.x);
        const py = Math.floor(posicao.y);
        const pz = Math.floor(posicao.z);

        return {
            atual: obterBlocoEstado(px, py, pz),
            abaixo: obterBlocoEstado(px, py - 1, pz),
            acima: obterBlocoEstado(px, py + 1, pz),
            norte: obterBlocoEstado(px, py, pz - 1),
            sul: obterBlocoEstado(px, py, pz + 1),
            oeste: obterBlocoEstado(px - 1, py, pz),
            leste: obterBlocoEstado(px + 1, py, pz)
        };
    }

    // =========================================================
    // ✅ CONSULTAS RÁPIDAS
    // =========================================================

    function estaLivre(x, y, z) {
        const bloco = obterBloco(x, y, z);

        if (!bloco) {
            return false;
        }

        return bloco.boundingBox === "empty";
    }

    function estaSolido(x, y, z) {
        const bloco = obterBloco(x, y, z);

        if (!bloco) {
            return false;
        }

        return bloco.boundingBox === "block";
    }

    // =========================================================
    // 📊 ESTADO
    // =========================================================

    function obterEstado() {
        const posicao = obterPosicaoBot();

        return {
            posicao: posicao
                ? { x: posicao.x, y: posicao.y, z: posicao.z }
                : null,

            blocoSob: obterBlocoSob(),

            blocosAoRedor: obterBlocosAoRedor()
        };
    }

    // =========================================================
    // 🔌 API PÚBLICA
    // =========================================================

    return {
        obterBloco,
        obterBlocoEstado,
        encontrarBlocos,
        quebrar,
        colocar,
        interagir,
        usarItem,
        obterBlocoSob,
        obterBlocosAoRedor,
        estaLivre,
        estaSolido,
        estaAoAlcance,
        obterEstado
    };
}

module.exports = {
    criarMundo
};