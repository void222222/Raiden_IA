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
 *
 * ⚠️ CORREÇÕES DESTA VERSÃO:
 *
 * 1. `quebrar` tem TIMEOUT. Se o bot.dig travar,
 *    considera falha, chama bot.stopDigging() e retorna.
 *    Se o bloco já sumiu (aborted / not found), considera
 *    SUCESSO.
 *
 * 2. `colocar` agora VALIDA que `nomeItem` é BLOCO antes
 *    de tentar colocar. Antes, tentava colocar
 *    `wooden_pickaxe` como bloco e o servidor recusava.
 *
 * 3. `colocar` agora VALIDA que `inventario` existe no
 *    contexto, e loga quando a referência está fora de
 *    alcance (facilita debug).
 *
 * 4. Exporta `obterBlocoReferencia` e `distanciaDoBot`
 *    para o módulo de construção poder usar.
 *
 * 5. ⚠️ NOVO v2: EQUIPAMENTO ANTES DE QUEBRAR.
 *    O `quebrar` agora chama `equipamento.equiparParaBloco()`
 *    antes de `bot.dig`, pra usar machado em madeira,
 *    picareta em pedra, etc.
 *
 *    O equipamento é injetado via `registrarEquipamento()`
 *    (chamado pelo `bot.js` depois de criar os módulos).
 *    Isso evita dependência circular no require.
 *
 * 6. ⚠️ FIX v3: `timeoutQuebraMs` reduzido de 8000 → 5000.
 *
 *    POR QUÊ:
 *      8s na mão é demais. Se o `bot.dig` travou por 8
 *      segundos, algo está errado (ferramenta errada,
 *      bloco longe, servidor travado). É melhor falhar
 *      rápido e replanejar do que segurar o executor.
 *
 *      Com machado/picareta, um bloco normal quebra em
 *      ~0.5-2s. Se passou de 5s, é problema.
 *
 *      E combinado com o FIX v2 do `equipamento.js`
 *      (que agora loga "sem ferramenta"), fica fácil
 *      ver quando o problema é equipamento faltando.
 */

const { Vec3 } = require("vec3");

function criarMundo(contexto) {
    const bot = contexto.bot;
    const inventario = contexto.inventario;

    // ⚠️ NOVO v2: equipamento é injetado depois pelo bot.js
    let equipamento = null;

    function registrarEquipamento(eq) {
        equipamento = eq;
    }

    const CONFIG = {
        distanciaMaximaInteracao: 4.5,
        distanciaMaximaQuebra: 5,
        raioBuscaMaximo: 32,
        limiteBusca: 200,

        // ⚠️ TIMEOUTS
        //
        // ⚠️ FIX v3: `timeoutQuebraMs` de 8000 → 5000.
        //
        // Ver cabeçalho do arquivo pra justificativa.
        timeoutQuebraMs: 5000,
        timeoutColocarMs: 5000,
        timeoutInteragirMs: 5000,
        timeoutUsarMs: 3000
    };

    // =========================================================
    // ⏱️ TIMEOUT HELPER
    // =========================================================

    /*
     * Roda uma Promise com timeout.
     * Se a Promise não resolver em `ms`, lança erro.
     *
     * Também aceita uma função de limpeza opcional para
     * chamar quando o timeout dispara (ex: stopDigging).
     */
    async function comTimeout(
        promessa,
        ms,
        mensagemErro,
        aoExpirar = null
    ) {
        let timerId;

        const timerPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => {
                reject(
                    new Error(mensagemErro || `Timeout de ${ms}ms`)
                );
            }, ms);
        });

        try {
            const resultado = await Promise.race([
                promessa,
                timerPromise
            ]);

            clearTimeout(timerId);
            return resultado;

        } catch (erro) {
            clearTimeout(timerId);

            if (typeof aoExpirar === "function") {
                try { aoExpirar(); } catch (_) {}
            }

            throw erro;
        }
    }

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
    // ⛏ QUEBRAR — COM TIMEOUT + EQUIPAMENTO
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

        // ⚠️ NOVO v2: equipa a ferramenta certa antes de quebrar.
        // Machado pra madeira, picareta pra pedra, etc.
        if (
            equipamento &&
            typeof equipamento.equiparParaBloco === "function"
        ) {
            try {
                await equipamento.equiparParaBloco(bloco.name);
            } catch (erro) {
                console.error(
                    "🛠️ [mundo.quebrar] Erro ao equipar:",
                    erro.message
                );
            }
        }

        try {
            if (bot.targetDigBlock !== bloco) {
                await bot.lookAt(
                    bloco.position.offset(0.5, 0.5, 0.5),
                    true
                );
            }

            // ⚠️ TIMEOUT v3: 5s (era 8s).
            // Se passar disso, algo está errado.
            await comTimeout(
                bot.dig(bloco, true),
                CONFIG.timeoutQuebraMs,
                "bot.dig excedeu timeout",
                () => {
                    try { bot.stopDigging(); } catch (_) {}
                }
            );

            return true;

        } catch (erro) {
            // Garante que o bot pare de digitar em qualquer erro
            try { bot.stopDigging(); } catch (_) {}

            // ⚠️ Bloco já não existe? Considera sucesso.
            // "Digging aborted" e "Block not found" significam
            // que o bloco sumiu entre o obterBloco() e o dig().
            const mensagem = String(erro?.message || "").toLowerCase();

            const jaFoi =
                mensagem.includes("aborted") ||
                mensagem.includes("block not found") ||
                mensagem.includes("não existe") ||
                !obterBloco(x, y, z);   // <- checagem final

            if (jaFoi) {
                return true;
            }

            console.error(
                "⛏️ Erro ao quebrar bloco:",
                erro.message
            );

            return false;
        }
    }

    // =========================================================
    // 🧱 COLOCAR — CORRIGIDO
    // =========================================================

    /*
     * ⚠️ CORREÇÃO:
     *
     * 1. Valida que `nomeItem` é BLOCO, não item qualquer.
     *    Antes, tentava colocar `wooden_pickaxe` como bloco.
     *
     * 2. Se o bot não está ao alcance da referência,
     *    retorna false direto (sem tentar).
     *
     * 3. Valida que `inventario` existe no contexto.
     *
     * 4. Log detalhado pra debug.
     */
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

        // ⚠️ 1. O item tem que ser BLOCO
        const idBloco =
            bot.registry?.blocksByName?.[nomeItem]?.id;

        if (idBloco === undefined || idBloco === null) {
            console.error(
                `🧱 [colocar] "${nomeItem}" NÃO é bloco ` +
                `(ou não existe no registry).`
            );
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
            console.error(
                `🧱 [colocar] Referência fora de alcance ` +
                `(dist=${distanciaDoBot(referencia.position).toFixed(2)}).`
            );
            return false;
        }

        // ⚠️ 2. Procura o item de BLOCO no inventário
        if (
            !inventario ||
            typeof inventario.procurarItem !== "function"
        ) {
            console.error(
                "🧱 [colocar] inventario indisponível no contexto."
            );
            return false;
        }

        const item = inventario.procurarItem(nomeItem);

        if (!item) {
            console.error(
                `🧱 [colocar] Sem "${nomeItem}" no inventário.`
            );
            return false;
        }

        try {
            await bot.equip(item, "hand");

            await bot.lookAt(
                referencia.position.offset(0.5, 0.5, 0.5),
                true
            );

            await comTimeout(
                bot.placeBlock(
                    referencia,
                    normalizarFace(face)
                ),
                CONFIG.timeoutColocarMs,
                "bot.placeBlock excedeu timeout"
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
    // 👆 INTERAGIR — COM TIMEOUT
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

            await comTimeout(
                bot.activateBlock(bloco),
                CONFIG.timeoutInteragirMs,
                "bot.activateBlock excedeu timeout"
            );

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
                if (
                    !inventario ||
                    typeof inventario.procurarItem !== "function"
                ) {
                    return false;
                }

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
        // ⚠️ NOVO v2: registro de equipamento
        registrarEquipamento,

        // Consulta
        obterBloco,
        obterBlocoEstado,
        obterBlocoReferencia,
        encontrarBlocos,

        // Ações
        quebrar,
        colocar,
        interagir,
        usarItem,

        // Adjacentes
        obterBlocoSob,
        obterBlocosAoRedor,

        // Consultas rápidas
        estaLivre,
        estaSolido,
        estaAoAlcance,

        distanciaDoBot,

        // Estado
        obterEstado
    };
}

module.exports = {
    criarMundo
};