// ═══════════════════════════════════════════════════════════════════
// bot.js — Raiden Build Final (v3.5 — Trava Global Blindada)
//
// NOVIDADES DA v3.5:
// 1. 🔒 Flag global "ocupado" — loopPrincipal inteiro espera liberar
// 2. 🛡️ try/finally em TODAS as funções de explosão (nunca trava)
// 3. ⏱️ Timer de 5min só conta quando NADA tá rodando
// 4. ✅ Tudo da v3.4 mantido (comunicação blindada com drone)
// ═══════════════════════════════════════════════════════════════════

const mineflayer = require("mineflayer");
const { pathfinder, Movements } = require("mineflayer-pathfinder");
const { Vec3 } = require("vec3");
const minecraftData = require("minecraft-data");
const { Schematic } = require("prismarine-schematic");
const fs = require("fs");
const zlib = require("zlib");
const http = require("http");
const AdmZip = require("adm-zip");

const config = {
    host: "127.0.0.1",
    port: 25565,
    username: "Raiden",
    skin: "lloyd",
    pastaProjetos: "./projetos",
    espacamentoLateral: 6,
    ruaFrente: 4,
    margemFundo: 2,
    velocidadeBot: 40,
    droneNome: "DroneCam",
    yChaoFixo: -60,
    alturaTNT: 25,
    raioExplosao: 22,
    cooldownAposExplosao: 10 * 60 * 1000,
    portaWebhook: 3001,
    arquivoFilaDoacoes: './fila_doacoes.json',
    limiteDanoParaReparo: 100,
    nivelPadraoWebhook: "EXPLOSAO",
    tempoMaxEsperaDoacao: 5 * 60 * 1000,
    esperaPosExplosao: 3 * 60 * 1000
};

const idsProcessados = new Set();
const kokusenPendente = [];
let inicioEsperaDoacao = 0;

// ⚡ v3.5: FLAG GLOBAL — bloqueia o loopPrincipal inteiro
let ocupado = false;

function marcarOcupado(motivo) {
    if (ocupado) {
        console.log(`⚠️ [TRAVA] Já tava ocupado, sobrescrevendo. Motivo novo: ${motivo}`);
    }
    ocupado = true;
    console.log(`🔒 [TRAVA] Ocupado: ${motivo}`);
}

function liberarOcupado(motivo) {
    ocupado = false;
    console.log(`🔓 [TRAVA] Liberado: ${motivo}`);
}

const NIVEIS_DOACAO = {
    "TROPEÇO":  { efeito: "TNT_PEQUENA" },
    "EXPLOSAO": { efeito: "TNT_MEDIA" },
    "CAOS":     { efeito: "TNT_GRANDE" },
    "KOKUSEN":  { efeito: "KOKUSEN_PATROCINADO" }
};

function carregarFila() {
    if (!fs.existsSync(config.arquivoFilaDoacoes)) return [];
    try { return JSON.parse(fs.readFileSync(config.arquivoFilaDoacoes, "utf-8")); }
    catch (e) { return []; }
}
function salvarFila(fila) {
    try { fs.writeFileSync(config.arquivoFilaDoacoes, JSON.stringify(fila, null, 2)); }
    catch (e) {}
}
function enfileirarDoacao(dados) {
    const nivelNome = dados.nivel || config.nivelPadraoWebhook;
    const efeito = NIVEIS_DOACAO[nivelNome] ? NIVEIS_DOACAO[nivelNome].efeito : "TNT_MEDIA";
    const fila = carregarFila();
    fila.push({
        id: dados.id || Date.now(),
        doador: dados.doador || "Anônimo",
        valor: dados.valor || 0,
        mensagem: dados.mensagem || "",
        nivel: nivelNome,
        efeito,
        timestamp: Date.now()
    });
    salvarFila(fila);
    console.log(`💰 ${dados.doador || "Anônimo"} → [${nivelNome}] enfileirado`);
}

const servidorWebhook = http.createServer((req, res) => {
    if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Raiden webhook ativo");
        return;
    }
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }

    let corpo = "";
    req.on("data", (chunk) => { corpo += chunk; });
    req.on("end", () => {
        try {
            console.log(`📥 [WEBHOOK] Recebido: ${corpo.slice(0, 300)}`);
            const dados = JSON.parse(corpo);

            let idMsg, doador, valor, nivel;
            if (dados.resource && dados.resource.id) {
                idMsg = dados.resource.id;
                doador = "Doador";
                valor = 0;
                nivel = null;
            } else if (dados.doador || dados.valor) {
                idMsg = dados.id || Date.now();
                doador = dados.doador || "Anônimo";
                valor = dados.valor || 0;
                nivel = dados.nivel;
            } else {
                res.writeHead(200); res.end("OK"); return;
            }

            if (idsProcessados.has(idMsg)) { res.writeHead(200); res.end("OK"); return; }
            idsProcessados.add(idMsg);

            enfileirarDoacao({ id: idMsg, doador, valor, mensagem: "", nivel });
            res.writeHead(200); res.end("OK");
        } catch (e) {
            console.log(`❌ Webhook erro: ${e.message}`);
            res.writeHead(400); res.end("Bad Request");
        }
    });
});
servidorWebhook.listen(config.portaWebhook, () => {
    console.log(`🎙️ Webhook escutando na porta ${config.portaWebhook}`);
});

function pegarProximaDoacao() {
    const fila = carregarFila();
    if (fila.length === 0) return null;
    const d = fila.shift();
    salvarFila(fila);
    return d;
}
function filaTemDoacao() { return carregarFila().length > 0; }

function titulo(principal, subtitulo, cor = "gold", corSub = "gray") {
    try {
        bot.chat(`/title @a times 10 60 15`);
        bot.chat(`/title @a title {"text":"${principal}","color":"${cor}","bold":true}`);
        if (subtitulo) bot.chat(`/title @a subtitle {"text":"${subtitulo}","color":"${corSub}"}`);
        const chatMsg = subtitulo ? `[${principal}] ${subtitulo}` : `[${principal}]`;
        bot.chat(`/tellraw @a {"text":"${chatMsg}","color":"${cor}"}`);
    } catch (e) {}
}

function tituloAcao(texto, cor = "yellow") {
    try {
        bot.chat(`/title @a actionbar {"text":"${texto}","color":"${cor}"}`);
    } catch (e) {}
}

// ═══ 3.5. COMUNICAÇÃO COM O DRONE ═══
async function enviarComandoDrone(msg) {
    console.log(`📤 [DRONE] Enviando: ${msg}`);

    for (let i = 0; i < 3; i++) {
        try { bot.whisper(config.droneNome, msg); } catch (e) {}
        await dormir(400);
    }

    try {
        bot.chat(`/msg ${config.droneNome} ${msg}`);
    } catch (e) {}
    await dormir(200);

    try {
        bot.chat(`/tell ${config.droneNome} ${msg}`);
    } catch (e) {}
    await dormir(200);

    console.log(`✅ [DRONE] Comando enviado 5x (3 whisper + 2 chat)`);
}

function extrairZips() {
    try {
        if (!fs.existsSync(config.pastaProjetos)) fs.mkdirSync(config.pastaProjetos, { recursive: true });
        const zips = fs.readdirSync(config.pastaProjetos).filter(a => a.endsWith(".zip"));
        for (const z of zips) {
            try {
                const zip = new AdmZip(`${config.pastaProjetos}/${z}`);
                zip.extractAllTo(config.pastaProjetos, true);
                fs.unlinkSync(`${config.pastaProjetos}/${z}`);
                console.log(`📦 Extraído: ${z}`);
            } catch (e) { console.log(`❌ Falha ao extrair ${z}: ${e.message}`); }
        }
    } catch (e) {}
}

const bot = mineflayer.createBot({ host: config.host, port: config.port, username: config.username, version: false });
bot.loadPlugin(pathfinder);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const forcar = (promessa, ms = 2500) => Promise.race([
    promessa,
    dormir(ms).then(() => {
        try { bot.clearControlStates(); bot.stopDigging(); } catch (e) {}
        throw new Error("TimeoutForcado");
    })
]);

// ═══ 5.5. ESPERA PÓS-EXPLOSÃO ═══
async function esperarExplodirTudo(nomeEvento = "EXPLOSÃO") {
    console.log(`⏳ [${nomeEvento}] Aguardando 3 minutos pra tudo explodir...`);
    titulo(`💥 ${nomeEvento}!`, "Aguardando explosões...", "gold", "yellow");

    const totalSegundos = Math.floor(config.esperaPosExplosao / 1000);
    for (let s = totalSegundos; s > 0; s--) {
        const min = Math.floor(s / 60);
        const seg = s % 60;
        const tempoFormatado = `${min}:${String(seg).padStart(2, "0")}`;

        titulo(`💥 ${nomeEvento}!`, `Explodindo... ${tempoFormatado}`, "gold", "yellow");
        tituloAcao(`⏳ Aguardando explosões — ${tempoFormatado}`, "gold");

        await dormir(1000);
    }

    titulo("✅ LIMPO!", "Tudo explodiu", "green", "gray");
    console.log(`✅ [${nomeEvento}] Todas as TNT explodiram.`);
    await dormir(2000);
}

async function tituloEspera(texto, cor, segundos) {
    for (let s = segundos; s > 0; s--) {
        tituloAcao(`⏳ ${texto} — ${s}s`, cor);
        await dormir(1000);
    }
}

// ═══ 6. TNT POR DOAÇÃO (v3.5: try/finally) ═══
async function tntPequena(x, y, z) {
    marcarOcupado("TNT_PEQUENA");
    try {
        titulo("💥 TROPEÇO!", "Patrocinado — 90 TNT", "yellow", "gold");
        for (let i = 0; i < 90; i++) {
            const tx = x + Math.floor(Math.random() * 20) - 10;
            const tz = z + Math.floor(Math.random() * 20) - 10;
            const ty = y + Math.floor(Math.random() * 8) - 4;
            const fuse = 30 + (i % 30);
            bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);
            if (i % 10 === 0) tituloAcao(`💥 TNT ${i + 1}/90`, "yellow");
            await dormir(40);
        }
        await esperarExplodirTudo("TROPEÇO");
    } finally {
        liberarOcupado("TNT_PEQUENA");
    }
}

async function tntMedia(x, y, z) {
    marcarOcupado("TNT_MEDIA");
    try {
        titulo("💥 EXPLOSÃO!", "Patrocinado — 240 TNT", "gold", "yellow");
        const ondas = 3;
        const porOnda = 80;
        for (let onda = 0; onda < ondas; onda++) {
            for (let i = 0; i < porOnda; i++) {
                const tx = x + Math.floor(Math.random() * 30) - 15;
                const tz = z + Math.floor(Math.random() * 30) - 15;
                const ty = y + Math.floor(Math.random() * 12) - 6;
                const fuse = 30 + (i % 40);
                bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);
                if (i % 10 === 0) tituloAcao(`💥 Onda ${onda + 1}/${ondas} — TNT ${i + 1}/${porOnda}`, "gold");
                await dormir(35);
            }
            if (onda < ondas - 1) {
                await tituloEspera(`Onda ${onda + 1}/${ondas} explodindo...`, "gold", 30);
            }
        }
        await esperarExplodirTudo("EXPLOSÃO");
    } finally {
        liberarOcupado("TNT_MEDIA");
    }
}

async function tntGrande(x, y, z) {
    marcarOcupado("TNT_GRANDE");
    try {
        titulo("💥 CAOS!", "Patrocinado — 600 TNT", "red", "gold");
        const ondas = 4;
        const porOnda = 150;
        for (let onda = 0; onda < ondas; onda++) {
            for (let i = 0; i < porOnda; i++) {
                const tx = x + Math.floor(Math.random() * 40) - 20;
                const tz = z + Math.floor(Math.random() * 40) - 20;
                const ty = y + Math.floor(Math.random() * 15) - 7;
                const fuse = 30 + (i % 50);
                bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);
                if (i % 15 === 0) tituloAcao(`💥 Onda ${onda + 1}/${ondas} — TNT ${i + 1}/${porOnda}`, "red");
                await dormir(30);
            }
            if (onda < ondas - 1) {
                await tituloEspera(`Onda ${onda + 1}/${ondas} explodindo...`, "red", 30);
            }
        }
        await esperarExplodirTudo("CAOS");
    } finally {
        liberarOcupado("TNT_GRANDE");
    }
}

async function anunciarDoador(doador, valor, nivel) {
    const cores = { "TROPEÇO":"yellow", "EXPLOSAO":"gold", "CAOS":"red", "KOKUSEN":"dark_red" };
    const titulos = {
        "TROPEÇO": "💥 TROPEÇO PATROCINADO!",
        "EXPLOSAO": "💥 EXPLOSÃO PATROCINADA!",
        "CAOS": "💥 CAOS PATROCINADO!",
        "KOKUSEN": "💀 KOKUSEN PATROCINADO!"
    };
    const doadorLimpo = String(doador).replace(/["\\]/g, "").slice(0, 32);
    titulo(titulos[nivel], `Por ${doadorLimpo}`, cores[nivel], "gold");
    try { bot.chat(`/playsound minecraft:entity.ender_dragon.growl master @a`); } catch (e) {}
}

function centroDaObra() {
    const cx = progresso.xBaseGlobal + Math.floor(progresso.larguraAtual / 2);
    const cz = progresso.zBaseGlobal + Math.floor(progresso.profundidadeAtual / 2);
    const yTopo = progresso.yZeroGlobal + 30;
    return { cx, cz, yTopo };
}

// ═══ DOAÇÃO EM TEMPO REAL (v3.5) ═══
async function checarDoacaoNaConstrucao() {
    if (!filaTemDoacao()) return false;
    const d = pegarProximaDoacao();
    if (!d) return false;

    console.log(`\n💰 [DOAÇÃO EM TEMPO REAL] ${d.doador} [${d.nivel}]`);
    await anunciarDoador(d.doador, d.valor, d.nivel);
    await dormir(1200);

    const { cx, cz, yTopo } = centroDaObra();

    switch (d.efeito) {
        case "TNT_PEQUENA": await tntPequena(cx, yTopo, cz); break;
        case "TNT_MEDIA":   await tntMedia(cx, yTopo, cz); break;
        case "TNT_GRANDE":  await tntGrande(cx, yTopo, cz); break;
        case "KOKUSEN_PATROCINADO":
            console.log(`💀 KOKUSEN guardado — dispara ao final da obra`);
            kokusenPendente.push(d);
            break;
    }
    return true;
}

// ═══ 7. KOKUSEN (v3.5: try/finally) ═══
async function executarKokusen(cx, yZero, cz, larguraConstrucao = 0, profundidadeConstrucao = 0) {
    marcarOcupado("KOKUSEN");
    try {
        titulo("💀 KOKUSEN!", "Prepare a câmera!", "dark_red", "red");
        try { bot.chat(`/playsound minecraft:entity.ender_dragon.growl master @a`); } catch (e) {}

        await enviarComandoDrone(`KOKUSEN_INICIO ${cx} ${yZero} ${cz}`);

        try {
            bot.creative.startFlying();
            await forcar(bot.creative.flyTo(new Vec3(cx + 80, yZero + 40, cz + 80)), 3000);
        } catch (e) {}

        const maiorLado = Math.max(larguraConstrucao, profundidadeConstrucao);
        const raio = Math.max(22, Math.floor(maiorLado / 2) + 10);

        console.log(`📐 Tamanho da construção: ${larguraConstrucao}x${profundidadeConstrucao}`);
        console.log(`📐 Raio adaptativo do Kokusen: ${raio}`);

        const totalPassadasNormais = 11;
        const tntPorPassadaNormal = 375;
        const tntPassadaFinal = 3750;
        const lados = Math.ceil(Math.sqrt(tntPassadaFinal));
        const tempoAntes = 20;

        titulo("💀 KOKUSEN!", `Iniciando em ${tempoAntes}s`, "dark_red", "red");
        await dormir(tempoAntes * 1000);

        for (let p = 0; p < totalPassadasNormais; p++) {
            titulo(`💥 Passada ${p + 1}/${totalPassadasNormais + 1}`, `${tntPorPassadaNormal} TNT`, "red", "dark_red");

            for (let i = 0; i < tntPorPassadaNormal; i++) {
                let tx, ty, tz;

                if (p % 2 === 0) {
                    const posX = cx - raio + Math.floor((p / 2 + 0.5) * (raio * 2) / (totalPassadasNormais / 2));
                    tx = posX + Math.floor(Math.random() * 6) - 3;
                    ty = yZero + 2 + Math.floor(Math.random() * 6);
                    tz = cz - raio + Math.floor(i * (raio * 2) / tntPorPassadaNormal);
                } else {
                    const posZ = cz - raio + Math.floor(((p - 1) / 2 + 0.5) * (raio * 2) / (totalPassadasNormais / 2));
                    tx = cx - raio + Math.floor(i * (raio * 2) / tntPorPassadaNormal);
                    ty = yZero + 2 + Math.floor(Math.random() * 6);
                    tz = posZ + Math.floor(Math.random() * 6) - 3;
                }

                const fuse = 20 + (i % 60);
                bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);

                if (i % 30 === 0) {
                    tituloAcao(`💥 Passada ${p + 1}/${totalPassadasNormais + 1} — TNT ${i + 1}/${tntPorPassadaNormal}`, "red");
                }
                await dormir(20);
            }

            await esperarExplodirTudo(`PASSADA ${p + 1}/${totalPassadasNormais}`);
        }

        titulo(`💥 PASSADA FINAL ${totalPassadasNormais + 1}/${totalPassadasNormais + 1}`, `${tntPassadaFinal} TNT — ANIQUILANDO!`, "dark_red", "red");
        console.log(`💥 Última passada: ${tntPassadaFinal} TNT em grade ${lados}x${lados}`);

        await dormir(3000);

        let tntColocada = 0;
        for (let gx = 0; gx < lados; gx++) {
            for (let gz = 0; gz < lados; gz++) {
                const offsetX = Math.floor((gx / lados) * (raio * 2) - raio);
                const offsetZ = Math.floor((gz / lados) * (raio * 2) - raio);

                const tx = cx + offsetX + Math.floor(Math.random() * 4) - 2;
                const tz = cz + offsetZ + Math.floor(Math.random() * 4) - 2;
                const ty = yZero + 1 + Math.floor(Math.random() * 12);
                const fuse = 30 + Math.floor(Math.random() * 30);

                bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);
                tntColocada++;

                if (tntColocada % 100 === 0) {
                    tituloAcao(`💥💥 FINAL — ${tntColocada}/${tntPassadaFinal} TNT`, "dark_red");
                }
                await dormir(12);
            }

            if (gx % 8 === 7) {
                await dormir(500);
            }
        }

        console.log(`🔥 Passada final: ${tntColocada} TNT colocadas`);

        await esperarExplodirTudo("PASSADA FINAL");

        titulo("💀 KOKUSEN!", "Destruição completa", "dark_red", "red");
        await dormir(5000);
    } finally {
        liberarOcupado("KOKUSEN");
    }
}

// ═══ 7.5. ABERTURA COM CHUVA DE TNT (v3.5: try/finally) ═══
async function aberturaChuva(xCentro, yZero, zCentro, largura, profundidade) {
    marcarOcupado("ABERTURA");
    try {
        console.log(`🎆 [ABERTURA] Chuva de TNT pra limpar o terreno...`);
        titulo("🎆 ABERTURA!", "Limpando terreno com estilo", "gold", "yellow");
        try { bot.chat(`/playsound minecraft:entity.ender_dragon.growl master @a`); } catch (e) {}

        await enviarComandoDrone(`ABERTURA_INICIO ${xCentro} ${yZero} ${zCentro}`);

        try {
            bot.creative.startFlying();
            await forcar(bot.creative.flyTo(new Vec3(xCentro + 60, yZero + 35, zCentro + 60)), 3000);
        } catch (e) {}

        const raio = Math.max(30, Math.floor(Math.max(largura, profundidade) / 2) + 15);
        const totalOndas = 5;
        const tntPorOnda = 450;

        for (let i = 5; i > 0; i--) {
            titulo("🎆 ABERTURA!", `Em ${i}s...`, "gold", "yellow");
            await dormir(1000);
        }

        for (let onda = 0; onda < totalOndas; onda++) {
            titulo(`🎆 ONDA ${onda + 1}/${totalOndas}`, `${tntPorOnda} TNT`, "gold", "yellow");

            for (let i = 0; i < tntPorOnda; i++) {
                const tx = xCentro + Math.floor(Math.random() * raio * 2) - raio;
                const tz = zCentro + Math.floor(Math.random() * raio * 2) - raio;
                const ty = yZero + 2 + Math.floor(Math.random() * 12);
                const fuse = 30 + (i % 40);

                bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);

                if (i % 30 === 0) {
                    tituloAcao(`🎆 Onda ${onda + 1}/${totalOndas} — TNT ${i + 1}/${tntPorOnda}`, "gold");
                }
                await dormir(20);
            }

            if (onda < totalOndas - 1) {
                await esperarExplodirTudo(`ONDA ${onda + 1}/${totalOndas}`);
            }
        }

        titulo("🎆 CHUVA FINAL!", "Varrendo tudo!", "dark_red", "red");

        const totalChuvaFinal = 750;
        for (let i = 0; i < totalChuvaFinal; i++) {
            const tx = xCentro + Math.floor(Math.random() * largura) - Math.floor(largura / 2);
            const tz = zCentro + Math.floor(Math.random() * profundidade) - Math.floor(profundidade / 2);
            const ty = yZero + 1 + Math.floor(Math.random() * 8);
            const fuse = 20 + (i % 40);

            bot.chat(`/summon tnt ${tx} ${ty} ${tz} {Fuse:${fuse}}`);

            if (i % 50 === 0) {
                tituloAcao(`🎆 Chuva final — ${i + 1}/${totalChuvaFinal}`, "dark_red");
            }
            await dormir(15);
        }

        await esperarExplodirTudo("CHUVA FINAL");

        titulo("✅ TERRENO LIMPO!", "Preparando base...", "green", "gray");
        console.log(`✅ Abertura concluída.`);
        await dormir(2000);
    } finally {
        liberarOcupado("ABERTURA");
    }
}

// ═══ 8. POSICIONAMENTO ═══
async function acharChaoEmXZ(x, z, silencioso = false) {
    if (!silencioso) console.log(`🔎 Escaneando chão em X=${x} Z=${z}...`);
    bot.chat(`/tp ${x} 100 ${z}`);
    await dormir(1000);
    for (let y = 100; y >= -62; y--) {
        const b = bot.blockAt(new Vec3(x, y, z));
        if (b && b.boundingBox === "block" && b.name !== "bedrock" && !b.name.includes("leaves") && !b.name.includes("log")) {
            if (!silencioso) console.log(`   ✅ Chão achado em Y=${y} (${b.name})`);
            return y;
        }
    }
    if (!silencioso) console.log(`   ⚠️ Nada achado, usando fallback ${config.yChaoFixo}`);
    return config.yChaoFixo;
}

async function ajustarPosicaoInicial(force = false) {
    const pos = bot.entity.position;
    const xAtual = Math.floor(pos.x);
    const zAtual = Math.floor(pos.z);
    const yAtual = Math.floor(pos.y);

    console.log(`📍 Posição atual: X=${xAtual} Y=${yAtual} Z=${zAtual}`);

    if (!force && Math.abs(yAtual - config.yChaoFixo) <= 1) {
        const blocoAbaixo = bot.blockAt(new Vec3(xAtual, yAtual - 1, zAtual));
        if (blocoAbaixo && blocoAbaixo.boundingBox === "block" && blocoAbaixo.name !== "bedrock") {
            console.log(`✅ Já tá no chão certo (Y=${yAtual}, ${blocoAbaixo.name} embaixo).`);
            return true;
        }
    }

    console.log(`🔄 Teleportando pro Y=${config.yChaoFixo}...`);
    tituloAcao("🔄 Ajustando posição...", "aqua");

    bot.chat(`/tp ${xAtual} ${config.yChaoFixo} ${zAtual}`);
    await dormir(1500);

    const yFinal = Math.floor(bot.entity.position.y);
    console.log(`   Y após TP: ${yFinal}`);

    if (yFinal < config.yChaoFixo - 2) {
        console.log(`⚠️ Caiu pra Y=${yFinal}. Chão destruído, reconstruindo...`);
        tituloAcao("🧱 Reconstruindo chão...", "green");
        bot.chat(`/fill ${xAtual - 8} -63 ${zAtual - 8} ${xAtual + 8} ${config.yChaoFixo - 1} ${zAtual + 8} dirt replace air`);
        await dormir(300);
        bot.chat(`/fill ${xAtual - 8} ${config.yChaoFixo} ${zAtual - 8} ${xAtual + 8} ${config.yChaoFixo} ${zAtual + 8} grass_block replace air`);
        await dormir(300);
        bot.chat(`/tp ${xAtual} ${config.yChaoFixo} ${zAtual}`);
        await dormir(1500);
    }

    const yFinal2 = Math.floor(bot.entity.position.y);
    if (Math.abs(yFinal2 - config.yChaoFixo) > 3) {
        console.log(`⚠️ Ainda fora (Y=${yFinal2}). Procurando vizinhança...`);
        for (let dx = 1; dx <= 15; dx++) {
            for (const sign of [-1, 1]) {
                const novox = xAtual + dx * sign;
                const yTeste = await acharChaoEmXZ(novox, zAtual, true);
                bot.chat(`/tp ${novox} ${yTeste} ${zAtual}`);
                await dormir(800);
                const yT = Math.floor(bot.entity.position.y);
                if (Math.abs(yT - config.yChaoFixo) <= 3) {
                    console.log(`✅ Achou chão em X=${novox}, Y=${yT}`);
                    return true;
                }
            }
        }
    }

    console.log(`✅ Reposicionado. Y final: ${Math.floor(bot.entity.position.y)}`);
    return true;
}

// ═══ 9. PARSERS ═══
function descompactarBuffer(buffer) {
    const header = buffer.slice(0, 4).toString("hex");
    if (header.startsWith("1f8b")) return zlib.gunzipSync(buffer);
    if (header.startsWith("78")) return zlib.inflateSync(buffer);
    return buffer;
}

function sanitizarBloco(nome) {
    if (!nome) return null;
    nome = nome.replace("minecraft:", "");
    nome = nome.split("[")[0];
    const map = {
        "chain": "iron_bars",
        "cave_air": null,
        "void_air": null,
        "structure_void": null
    };
    if (map[nome] !== undefined) return map[nome];
    return nome;
}

async function descobrirBlueprints() {
    extrairZips();
    if (!fs.existsSync(config.pastaProjetos)) return [];
    const arquivos = fs.readdirSync(config.pastaProjetos)
        .filter(a => a.endsWith(".schem") || a.endsWith(".schematic") || a.endsWith(".nbt"));

    const validos = [];
    for (const arquivo of arquivos) {
        const caminho = `${config.pastaProjetos}/${arquivo}`;
        try {
            const buffer = fs.readFileSync(caminho);
            const dados = descompactarBuffer(buffer);
            let size = null;

            if (arquivo.endsWith(".schematic")) {
                try {
                    const nbt = require("prismarine-nbt");
                    const parsed = await nbt.parse(dados);
                    const root = parsed.parsed.value;
                    if (root.Width && root.Height && root.Length) {
                        size = { x: root.Width.value, y: root.Height.value, z: root.Length.value };
                    }
                } catch (e) {}
            }

            if (!size) {
                try {
                    const s = await Schematic.read(dados);
                    if (s && s.size) size = s.size;
                } catch (e) {}
            }

            if (!size) {
                try {
                    const nbt = require("prismarine-nbt");
                    const parsed = await nbt.parse(dados);
                    const root = parsed.parsed.value;
                    if (root.Schematic && root.Schematic.value) {
                        const r = root.Schematic.value;
                        if (r.Width && r.Height && r.Length) {
                            size = { x: r.Width.value, y: r.Height.value, z: r.Length.value };
                        }
                    } else if (root.Width && root.Height && root.Length) {
                        size = { x: root.Width.value, y: root.Height.value, z: root.Length.value };
                    }
                } catch (e) {}
            }
            if (!size) { console.log(`⏭️ ${arquivo}: formato não reconhecido.`); continue; }

            const volume = size.x * size.y * size.z;
            validos.push({ arquivo, caminho, volume, tamanhoX: size.x, tamanhoY: size.y, tamanhoZ: size.z });
            console.log(`✅ ${arquivo} (${size.x}x${size.y}x${size.z} = ${volume})`);
        } catch (e) { console.log(`❌ ${arquivo}: ${e.message}`); }
    }
    validos.sort((a, b) => a.volume - b.volume);
    return validos;
}

async function carregarBlueprint(item, xBase, yZero, zBase) {
    try {
        const buffer = fs.readFileSync(item.caminho);
        const dados = descompactarBuffer(buffer);

        if (item.arquivo.endsWith(".schematic")) {
            try {
                const nbt = require("prismarine-nbt");
                const parsed = await nbt.parse(dados);
                const root = parsed.parsed.value;
                if (root.Width && root.Blocks) {
                    console.log(`   🔧 Parser MCEdit forçado`);
                    return extrairMCEdit(root, xBase, yZero, zBase);
                }
            } catch (e) {}
        }

        let schem = null;
        try { schem = await Schematic.read(dados); } catch (e) {}

        if (schem && schem.size) {
            const blocos = [];
            const c = new Vec3(0, 0, 0);
            for (c.y = 0; c.y < schem.size.y; c.y++) {
                for (c.x = 0; c.x < schem.size.x; c.x++) {
                    for (c.z = 0; c.z < schem.size.z; c.z++) {
                        let b;
                        try { b = schem.getBlock(c); } catch (e) { continue; }
                        const tipo = sanitizarBloco(b && b.name);
                        if (tipo) blocos.push({ x: xBase + c.x, y: yZero + c.y, z: zBase + c.z, tipo });
                    }
                }
            }
            if (blocos.length > 0) return { blocos, tamanhoX: schem.size.x, tamanhoY: schem.size.y, tamanhoZ: schem.size.z };
            console.log(`   ⚠️ prismarine leu size mas 0 blocos. Tentando parser manual...`);
        }

        const nbt = require("prismarine-nbt");
        const parsed = await nbt.parse(dados);
        const root = parsed.parsed.value;

        if (root.Schematic && root.Schematic.value) {
            const s = root.Schematic.value;
            if (s.Version && s.Version.value === 3 && s.Blocks && s.Blocks.value && s.Blocks.value.Data && s.Blocks.value.Palette) {
                console.log(`   🟣 Sponge v3`);
                return extrairSpongeV3(s, xBase, yZero, zBase);
            }
            if (s.Palette && s.BlockData && s.Width) {
                console.log(`   🟢 Sponge v2`);
                return extrairSpongeV2(s, xBase, yZero, zBase);
            }
        }
        if (root.Width && root.Blocks) {
            console.log(`   🔵 MCEdit`);
            return extrairMCEdit(root, xBase, yZero, zBase);
        }
        return null;
    } catch (e) {
        console.log(`❌ carregarBlueprint: ${e.message}`);
        return null;
    }
}

function extrairSpongeV3(root, xBase, yZero, zBase) {
    const W = root.Width.value, H = root.Height.value, L = root.Length.value;
    const blocksCompound = root.Blocks.value;
    const palette = blocksCompound.Palette.value;
    const data = blocksCompound.Data.value;
    const indiceParaNome = {};
    for (const [nome, idx] of Object.entries(palette)) indiceParaNome[idx.value] = nome;

    console.log(`   🔍 v3: W=${W} H=${H} L=${L}, Palette=${Object.keys(palette).length}, Data=${data.length}`);

    const blocos = [];
    let i = 0;
    for (let y = 0; y < H; y++) {
        for (let z = 0; z < L; z++) {
            for (let x = 0; x < W; x++) {
                const idx = data[i++];
                const nome = indiceParaNome[idx];
                const tipo = sanitizarBloco(nome);
                if (tipo) blocos.push({ x: xBase + x, y: yZero + y, z: zBase + z, tipo });
            }
        }
    }
    console.log(`   ✅ ${blocos.length} blocos mapeados (Sponge v3).`);
    return { blocos, tamanhoX: W, tamanhoY: H, tamanhoZ: L };
}

function extrairSpongeV2(root, xBase, yZero, zBase) {
    const W = root.Width.value, H = root.Height.value, L = root.Length.value;
    const palette = root.Palette.value;
    const blockData = root.BlockData.value;
    const idParaNome = {};
    for (const [nome, tag] of Object.entries(palette)) idParaNome[tag.value] = nome;

    const blocos = [];
    let p = 0;
    for (let y = 0; y < H; y++) {
        for (let z = 0; z < L; z++) {
            for (let x = 0; x < W; x++) {
                let valor = 0, shift = 0;
                while (p < blockData.length) {
                    const byte = blockData[p++];
                    valor |= (byte & 0x7F) << shift;
                    if ((byte & 0x80) === 0) break;
                    shift += 7;
                }
                const nome = idParaNome[valor];
                const tipo = sanitizarBloco(nome);
                if (tipo) blocos.push({ x: xBase + x, y: yZero + y, z: zBase + z, tipo });
            }
        }
    }
    console.log(`   ✅ ${blocos.length} blocos mapeados (Sponge v2).`);
    return { blocos, tamanhoX: W, tamanhoY: H, tamanhoZ: L };
}

function extrairMCEdit(root, xBase, yZero, zBase) {
    const W = root.Width.value, H = root.Height.value, L = root.Length.value;
    const blocks = root.Blocks.value;
    const ID = {
        1:"stone",2:"grass_block",3:"dirt",4:"cobblestone",5:"oak_planks",
        6:"oak_sapling",7:"bedrock",12:"sand",13:"gravel",14:"gold_ore",
        15:"iron_ore",16:"coal_ore",17:"oak_log",18:"oak_leaves",20:"glass",
        21:"lapis_ore",22:"lapis_block",24:"sandstone",25:"note_block",
        35:"white_wool",41:"gold_block",42:"iron_block",43:"stone_slab",
        44:"stone_slab",45:"bricks",46:"tnt",47:"bookshelf",48:"mossy_cobblestone",
        49:"obsidian",50:"torch",52:"spawner",53:"oak_stairs",54:"chest",
        56:"diamond_ore",57:"diamond_block",58:"crafting_table",60:"farmland",
        61:"furnace",63:"oak_sign",64:"oak_door",65:"ladder",66:"rail",
        67:"cobblestone_stairs",69:"lever",71:"iron_door",78:"snow",79:"ice",
        80:"snow_block",81:"cactus",82:"clay",83:"sugar_cane",84:"jukebox",
        85:"oak_fence",86:"carved_pumpkin",87:"netherrack",88:"soul_sand",
        89:"glowstone",91:"carved_pumpkin",95:"white_stained_glass",
        96:"oak_trapdoor",98:"stone_bricks",101:"iron_bars",102:"glass_pane",
        103:"melon",106:"vine",107:"oak_fence_gate",108:"brick_stairs",
        109:"stone_brick_stairs",110:"mycelium",111:"lily_pad",112:"nether_bricks",
        113:"nether_brick_fence",114:"nether_brick_stairs",116:"enchanting_table",
        117:"brewing_stand",118:"cauldron",120:"end_portal_frame",121:"end_stone",
        122:"dragon_egg",123:"redstone_lamp",125:"oak_slab",126:"oak_slab",
        128:"sandstone_stairs",129:"emerald_ore",130:"ender_chest",
        133:"emerald_block",134:"spruce_stairs",135:"birch_stairs",
        136:"jungle_stairs",137:"command_block",138:"beacon",
        139:"cobblestone_wall",140:"flower_pot",145:"anvil",146:"trapped_chest",
        152:"redstone_block",153:"nether_quartz_ore",154:"hopper",
        155:"quartz_block",156:"quartz_stairs",158:"dropper",
        159:"white_terracotta",160:"white_stained_glass_pane",
        161:"acacia_leaves",162:"acacia_log",163:"acacia_stairs",
        164:"dark_oak_stairs",165:"slime_block",166:"barrier",
        167:"iron_trapdoor",168:"prismarine",169:"sea_lantern",170:"hay_block",
        172:"terracotta",173:"coal_block",174:"packed_ice",175:"sunflower",
        179:"red_sandstone",180:"red_sandstone_stairs",188:"spruce_fence",
        189:"birch_fence",190:"jungle_fence",191:"dark_oak_fence",
        192:"acacia_fence",193:"spruce_door",194:"birch_door",
        195:"jungle_door",196:"acacia_door",197:"dark_oak_door",
        201:"purpur_block",202:"purpur_pillar",203:"purpur_stairs",
        206:"end_stone_bricks",208:"grass_path",213:"magma_block",
        214:"nether_wart_block",215:"red_nether_bricks",216:"bone_block",
        218:"observer",221:"white_concrete",222:"white_concrete_powder"
    };

    const blocos = [];
    let idx = 0;
    for (let y = 0; y < H; y++) {
        for (let z = 0; z < L; z++) {
            for (let x = 0; x < W; x++) {
                const id = blocks[idx];
                if (id !== 0) {
                    const nome = ID[id];
                    const tipo = sanitizarBloco(nome);
                    if (tipo) blocos.push({ x: xBase + x, y: yZero + y, z: zBase + z, tipo });
                }
                idx++;
            }
        }
    }
    console.log(`   ✅ ${blocos.length} blocos mapeados (MCEdit).`);
    return { blocos, tamanhoX: W, tamanhoY: H, tamanhoZ: L };
}

// ═══ 10. INVENTÁRIO E ASSENTAMENTO ═══
async function garantirItem(nomeOriginal) {
    if (!nomeOriginal) return false;
    if (nomeOriginal.includes("water") || nomeOriginal.includes("lava") ||
        nomeOriginal === "air" || nomeOriginal.startsWith("potted_")) return false;

    if (bot.inventory.items().length >= 34) {
        bot.chat("/clear @s");
        await dormir(500);
    }

    let nome = nomeOriginal;
    const san = {
        "wall_torch":"torch","soul_wall_torch":"soul_torch","redstone_wall_torch":"redstone_torch",
        "oak_wall_sign":"oak_sign","spruce_wall_sign":"spruce_sign","birch_wall_sign":"birch_sign",
        "jungle_wall_sign":"jungle_sign","acacia_wall_sign":"acacia_sign",
        "dark_oak_wall_sign":"dark_oak_sign","crimson_wall_sign":"crimson_sign",
        "warped_wall_sign":"warped_sign","mangrove_wall_sign":"mangrove_sign",
        "bamboo_wall_sign":"bamboo_sign","cherry_wall_sign":"cherry_sign"
    };
    if (san[nomeOriginal]) nome = san[nomeOriginal];
    nome = nome.replace(/^wall_/, "").replace(/_wall_sign$/, "_sign")
               .replace(/_wall_banner$/, "_banner").replace(/_wall$/, "");

    if (bot.heldItem && bot.heldItem.name === nome) return true;

    let item = bot.inventory.items().find(i => i.name === nome);
    if (!item) {
        bot.chat(`/give @s ${nome} 64`);
        await dormir(300);
        item = bot.inventory.items().find(i => i.name === nome);
    }
    if (!item) {
        const limpo = nome.replace("minecraft:", "");
        bot.chat(`/give @s ${limpo} 64`);
        await dormir(300);
        item = bot.inventory.items().find(i => i.name === limpo);
    }

    if (item) {
        try { await forcar(bot.equip(item, "hand"), 1200); return true; } catch (e) {}
    }
    return false;
}

async function quebrarIntruso(pos) {
    const alvo = bot.blockAt(pos);
    if (!alvo || alvo.name === "air" || alvo.name === "cave_air") return;

    if (alvo.name.includes("water") || alvo.name.includes("lava")) {
        try {
            bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} air`);
            await dormir(50);
        } catch (e) {}
        return;
    }

    if (alvo.boundingBox === "block") {
        try {
            await forcar(bot.dig(alvo), 1500);
            await dormir(80);
            const depois = bot.blockAt(pos);
            if (depois && depois.name !== "air" && depois.name !== "cave_air") {
                bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} air`);
                await dormir(80);
            }
        } catch (e) {
            try {
                bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} air`);
                await dormir(80);
            } catch (e2) {}
        }
    }
}

async function posicionarPara(pos) {
    const dist = bot.entity.position.distanceTo(pos);
    if (dist >= 1.5 && dist <= 4.0) return;

    try {
        bot.creative.startFlying();
        await forcar(bot.creative.flyTo(pos.offset(1.0, 1.8, 1.0)), 1500);
        return;
    } catch (e) {
        try { bot.clearControlStates(); } catch (e) {}
    }

    const distAgora = bot.entity.position.distanceTo(pos);
    if (distAgora > 6 || distAgora < 1) {
        try {
            bot.chat(`/tp @s ${pos.x + 1} ${pos.y + 2} ${pos.z + 1}`);
            await dormir(300);
        } catch (e) {}
    }
}

async function tentarAssentar(pos) {
    await posicionarPara(pos);
    await quebrarIntruso(pos);

    const apoios = [
        new Vec3(0,-1,0), new Vec3(-1,0,0), new Vec3(1,0,0),
        new Vec3(0,0,-1), new Vec3(0,0,1), new Vec3(0,1,0)
    ];

    for (const off of apoios) {
        const coord = pos.plus(off);
        const bloco = bot.blockAt(coord);
        if (bloco && bloco.boundingBox === "block") {
            try {
                const face = new Vec3(-off.x, -off.y, -off.z);
                await bot.lookAt(coord.offset(0.5, 0.5, 0.5), true);
                await dormir(30);
                await forcar(bot.placeBlock(bloco, face), 1200);
                return true;
            } catch (e) {
                try { bot.clearControlStates(); bot.stopDigging(); } catch (e2) {}
                continue;
            }
        }
    }

    const direcoes = [new Vec3(0,-1,0), new Vec3(-1,0,0), new Vec3(1,0,0), new Vec3(0,0,-1), new Vec3(0,0,1)];
    for (const off of direcoes) {
        const coord = pos.plus(off);
        const bloco = bot.blockAt(coord);
        if (bloco && (bloco.name === "air" || bloco.name === "cave_air")) {
            try {
                const itemAlvo = bot.heldItem;
                if (!itemAlvo) continue;

                await garantirItem("cobblestone");
                const coord2 = pos.plus(off.x * 2, off.y * 2, off.z * 2);
                const bloco2 = bot.blockAt(coord2);
                if (bloco2 && bloco2.boundingBox === "block") {
                    const face2 = new Vec3(-off.x, -off.y, -off.z);
                    await bot.lookAt(coord2.offset(0.5, 0.5, 0.5), true);
                    await dormir(30);
                    await forcar(bot.placeBlock(bloco2, face2), 1200);
                    await dormir(100);
                }

                const blocoTramp = bot.blockAt(coord);
                if (blocoTramp && blocoTramp.boundingBox === "block") {
                    await garantirItem(itemAlvo.name);
                    const face = new Vec3(-off.x, -off.y, -off.z);
                    await bot.lookAt(coord.offset(0.5, 0.5, 0.5), true);
                    await dormir(30);
                    await forcar(bot.placeBlock(blocoTramp, face), 1200);
                    return true;
                }
            } catch (e) {
                try { bot.clearControlStates(); } catch (e2) {}
                continue;
            }
        }
    }

    try {
        const item = bot.heldItem;
        if (item) {
            bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} ${item.name}`);
            await dormir(60);
            return true;
        }
    } catch (e) {}

    return false;
}

// ═══ 11. CONSTRUÇÃO ═══
async function construirFase(blocos) {
    if (!blocos || blocos.length === 0) return;
    const camadas = [...new Set(blocos.map(b => b.y))].sort((a, b) => a - b);

    for (let idx = 0; idx < camadas.length; idx++) {
        const y = camadas[idx];
        let pendentes = blocos.filter(b => b.y === y);
        let tentativas = 3;

        tituloAcao(`🏗️ Camada ${idx + 1}/${camadas.length} (Y=${y})`, "gold");

        while (pendentes.length > 0 && tentativas > 0) {
            const falharam = [];
            for (let i = 0; i < pendentes.length; i++) {
                const b = pendentes[i];

                // ⚡ v3.5: espera ocupado liberar
                if (ocupado) {
                    console.log("🔒 [CONSTRUÇÃO] Esperando ocupado liberar...");
                    while (ocupado) {
                        tituloAcao("🔒 Aguardando explosões...", "red");
                        await dormir(500);
                    }
                    console.log("🔓 [CONSTRUÇÃO] Liberado, continuando.");
                }

                await checarDoacaoNaConstrucao();

                if (i % 20 === 0) {
                    const pct = Math.floor((i / pendentes.length) * 100);
                    tituloAcao(`🏗️ Camada ${idx + 1}/${camadas.length} — ${pct}%`, "gold");
                }

                const pos = new Vec3(b.x, b.y, b.z);
                const alvo = bot.blockAt(pos);
                if (alvo && alvo.name === b.tipo) continue;

                if (!await garantirItem(b.tipo)) { falharam.push(b); continue; }

                const ok = await tentarAssentar(pos);
                if (!ok) falharam.push(b);

                await dormir(config.velocidadeBot);
            }
            pendentes = falharam;
            tentativas--;
        }
    }
}

function classificarFases(planta) {
    const portas = [];
    const resto = [];
    for (const b of planta.blocos) {
        if (b.tipo.includes("door")) portas.push(b);
        else resto.push(b);
    }
    resto.sort((a, b) => a.y - b.y);
    return { portas, resto };
}

async function construirBlueprint(planta, isReparo = false) {
    console.log(`\n🏗️ Construindo ${planta.blocos.length} blocos...`);
    titulo("🏗️ CONSTRUINDO", `${planta.blocos.length} blocos`, "gold", "yellow");

    const { portas, resto } = classificarFases(planta);

    await construirFase(resto);

    if (portas.length > 0) {
        try { bot.creative.startFlying(); } catch (e) {}
        tituloAcao("🚪 Colocando portas...", "aqua");
        await construirFase(portas);
    }

    console.log("✅ Construção concluída.");
    titulo("✅ CONCLUÍDO!", "Obra pronta", "green", "gray");
}

// ═══ 12. VISTORIA E REPARO ═══
async function vistoriarEReparar(planta) {
    const destruidos = [];
    for (const b of planta.blocos) {
        const bloco = bot.blockAt(new Vec3(b.x, b.y, b.z));
        if (!bloco || bloco.name !== b.tipo) destruidos.push(b);
    }
    const dano = destruidos.length;
    console.log(`🔍 Vistoria: ${dano} blocos danificados.`);

    if (dano === 0) return "INTACTO";
    if (dano >= config.limiteDanoParaReparo) {
        titulo("💀 Dano Crítico!", "Reiniciando construção", "dark_red", "red");
        return "RESTART_TOTAL";
    }
    titulo("🔧 Reparando...", `${dano} blocos`, "yellow", "gold");
    bot.chat("/clear @s");
    await dormir(500);
    await construirBlueprint({ blocos: destruidos, tamanhoX: planta.tamanhoX, tamanhoY: planta.tamanhoY, tamanhoZ: planta.tamanhoZ }, true);
    return "REPARADO";
}

// ═══ 13. RECONSTRUÇÃO DO CHÃO ═══
async function reconstruirChao(xCentro, yZero, zCentro, largura, profundidade) {
    console.log(`\n🧱 [RECONSTRUÇÃO] Tapando crateras com terra + grama...`);
    titulo("🧱 Reconstruindo chão...", "Terra + grama", "green", "gray");

    const x1 = xCentro - Math.floor(largura / 2) - 5;
    const x2 = xCentro + Math.floor(largura / 2) + 5;
    const z1 = zCentro - Math.floor(profundidade / 2) - 5;
    const z2 = zCentro + Math.floor(profundidade / 2) + 5;
    const passo = 30;

    await forceloadArea(x1, z1, x2, z2);

    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            bot.chat(`/fill ${sx} -63 ${sz} ${Math.min(sx + passo - 1, x2)} ${yZero - 1} ${Math.min(sz + passo - 1, z2)} dirt replace air`);
            await dormir(150);
        }
    }
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            bot.chat(`/fill ${sx} ${yZero} ${sz} ${Math.min(sx + passo - 1, x2)} ${yZero} ${Math.min(sz + passo - 1, z2)} grass_block replace air`);
            await dormir(150);
        }
    }

    bot.chat(`/forceload remove all`);
    await dormir(300);

    console.log("✅ Chão reconstruído!");
    tituloAcao("✅ Chão pronto", "green");
}

// ═══ 14. FORCELOAD + PREPARAR LOTE ═══
async function forceloadArea(x1, z1, x2, z2) {
    const largura = Math.abs(x2 - x1);
    const comprimento = Math.abs(z2 - z1);
    console.log(`📦 [FORCELOAD] Carregando ${largura}x${comprimento}...`);
    try {
        if (largura > 120 || comprimento > 120) {
            for (let sx = Math.min(x1, x2); sx <= Math.max(x1, x2); sx += 100) {
                for (let sz = Math.min(z1, z2); sz <= Math.max(z1, z2); sz += 100) {
                    const ex = Math.min(sx + 99, Math.max(x1, x2));
                    const ez = Math.min(sz + 99, Math.max(z1, z2));
                    bot.chat(`/forceload add ${sx} ${sz} ${ex} ${ez}`);
                    await dormir(600);
                }
            }
        } else {
            bot.chat(`/forceload add ${x1} ${z1} ${x2} ${z2}`);
            await dormir(600);
        }
    } catch (e) {}
}

async function prepararLote(xCentro, yZero, zCentro, largura, profundidade) {
    console.log(`🧹 [PRÉ-LIMPEZA] Preparando lote...`);
    titulo("🧹 PREPARANDO LOTE", "Nivelando o terreno", "aqua", "gray");

    const x1 = xCentro - Math.floor(largura / 2);
    const x2 = xCentro + Math.floor(largura / 2);
    const z1 = zCentro - Math.floor(profundidade / 2);
    const z2 = zCentro + Math.floor(profundidade / 2);
    const passo = 30;

    await forceloadArea(x1, z1, x2, z2);

    titulo("🔧 LIMPANDO BEDROCK ERRADA", "Y > -63", "red", "dark_red");
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            const ex = Math.min(sx + passo - 1, x2);
            const ez = Math.min(sz + passo - 1, z2);
            bot.chat(`/fill ${sx} -62 ${sz} ${ex} ${yZero + 80} ${ez} air replace bedrock`);
            await dormir(140);
        }
    }

    titulo("🧱 COLOCANDO BEDROCK", "Base em Y=-63", "gray", "dark_gray");
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            const ex = Math.min(sx + passo - 1, x2);
            const ez = Math.min(sz + passo - 1, z2);
            bot.chat(`/fill ${sx} -63 ${sz} ${ex} -63 ${ez} bedrock replace air`);
            await dormir(120);
        }
    }

    titulo("🧹 LIMPANDO AÉREO", "Apagando tudo acima", "aqua", "gray");
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            const ex = Math.min(sx + passo - 1, x2);
            const ez = Math.min(sz + passo - 1, z2);
            bot.chat(`/fill ${sx} ${yZero + 1} ${sz} ${ex} ${yZero + 80} ${ez} air replace`);
            await dormir(140);
        }
    }

    titulo("🌍 PREENCHENDO TERRA", "Y=-62 até Y=-61", "gold", "yellow");
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            const ex = Math.min(sx + passo - 1, x2);
            const ez = Math.min(sz + passo - 1, z2);
            bot.chat(`/fill ${sx} -62 ${sz} ${ex} ${yZero - 1} ${ez} dirt replace air`);
            await dormir(140);
        }
    }

    titulo("🌱 COLOCANDO GRAMA", "Nivelando terreno", "green", "gray");
    for (let sx = x1; sx <= x2; sx += passo) {
        for (let sz = z1; sz <= z2; sz += passo) {
            const ex = Math.min(sx + passo - 1, x2);
            const ez = Math.min(sz + passo - 1, z2);
            bot.chat(`/fill ${sx} ${yZero} ${sz} ${ex} ${yZero} ${ez} grass_block replace air`);
            await dormir(140);
        }
    }

    const yAtual = Math.floor(bot.entity.position.y);
    if (Math.abs(yAtual - yZero) > 1) {
        console.log(`🔄 Bot em Y=${yAtual}, teleportando pro Y=${yZero}...`);
        titulo("🔄 AJUSTANDO POSIÇÃO", `Y=${yZero}`, "aqua", "gray");
        bot.chat(`/tp ${xCentro} ${yZero} ${zCentro}`);
        await dormir(800);
    }

    bot.chat(`/forceload remove all`);
    await dormir(300);

    console.log(`✅ Lote preparado.`);
    titulo("✅ LOTE PRONTO!", "Bora construir!", "green", "gray");
}

// ═══ 15. LISTENERS ═══
bot.on("whisper", async (username, message) => {
    if (username !== config.droneNome) return;
    if (message === "EXPLODIR" && progresso.xBaseGlobal !== null) {
        const cx = progresso.xBaseGlobal + Math.floor(progresso.larguraAtual / 2);
        const cz = progresso.zBaseGlobal + Math.floor(progresso.profundidadeAtual / 2);

        await executarKokusen(
            cx,
            progresso.yZeroGlobal,
            cz,
            progresso.larguraAtual,
            progresso.profundidadeAtual
        );

        titulo("⏱️ Cooldown...", "Drone filmando", "gray", "dark_gray");
        await dormir(config.cooldownAposExplosao);
        await reconstruirChao(cx, progresso.yZeroGlobal, cz, progresso.larguraAtual, progresso.profundidadeAtual);
        await dormir(5000);
        progresso.indiceFila++;
        progresso.faseApp = "construir_fila";
        salvarProgresso(progresso);
    }
});

bot.on("chat", async (username, message) => {
    if (message.trim() === "!posicionar") {
        console.log(`⚡ ${username} pediu reposicionamento`);
        await ajustarPosicaoInicial(true);
        bot.chat(`/tell ${username} Posicionado no Y=${config.yChaoFixo}`);
    }

    if (message.trim() === "!testeDrone") {
        const pos = bot.entity.position;
        bot.chat(`/tell ${username} Testando drone...`);
        await enviarComandoDrone(`ABERTURA_INICIO ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`);
    }

    if (message.trim() === "!teste360") {
        const pos = bot.entity.position;
        bot.chat(`/tell ${username} Testando 360...`);
        await enviarComandoDrone(`MODO_360 ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`);
    }

    if (message.trim() === "!testeKokusen") {
        const pos = bot.entity.position;
        bot.chat(`/tell ${username} Testando Kokusen...`);
        await enviarComandoDrone(`KOKUSEN_INICIO ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`);
    }

    if (message.trim() === "!pararDrone") {
        bot.chat(`/tell ${username} Parando drone...`);
        await enviarComandoDrone(`PARAR`);
    }

    if (message.trim() === "!status") {
        bot.chat(`/tell ${username} ocupado=${ocupado} fase=${progresso.faseApp} lote=${progresso.indiceFila + 1}/${progresso.fila.length}`);
    }
});

// ═══ 16. PROGRESSO ═══
const ARQUIVO_SAVE = "./progresso_obra.json";

function carregarProgresso() {
    if (fs.existsSync(ARQUIVO_SAVE)) {
        try { return JSON.parse(fs.readFileSync(ARQUIVO_SAVE, "utf-8")); } catch (e) {}
    }
    return {
        faseApp: "descobrir", indiceFila: 0, fila: [],
        xBaseGlobal: null, zBaseGlobal: null, yZeroGlobal: null,
        larguraAtual: 0, profundidadeAtual: 0
    };
}
function salvarProgresso(d) {
    try { fs.writeFileSync(ARQUIVO_SAVE, JSON.stringify(d, null, 2)); } catch (e) {}
}

let progresso = carregarProgresso();
let plantaCache = null;

// ═══ 17. LOOP PRINCIPAL (v3.5: trava global blindada) ═══
async function loopPrincipal() {
    if (!bot.entity) return;

    // ⚡ v3.5: TRAVA GLOBAL — se ocupado, espera
    if (ocupado) {
        tituloAcao("🔒 Explosão em andamento...", "red");
        return; // sai rápido, o próximo loop checa de novo
    }

    if (progresso.faseApp === "descobrir") {
        titulo("🔍 Analisando Terreno...", "Escaneando projetos", "aqua", "gray");
        await ajustarPosicaoInicial(false);

        const fila = await descobrirBlueprints();
        if (fila.length === 0) {
            console.log("⏸️ Nenhum blueprint válido. Re-scanneando em 30s...");
            titulo("⏸️ Sem projetos!", "Coloque schematics na pasta", "red", "gray");
            await dormir(30000);
            return;
        }
        progresso.fila = fila;
        progresso.indiceFila = 0;
        progresso.xBaseGlobal = Math.floor(bot.entity.position.x);
        progresso.zBaseGlobal = Math.floor(bot.entity.position.z);
        progresso.yZeroGlobal = config.yChaoFixo;

        console.log(`📍 Base: X=${progresso.xBaseGlobal} Z=${progresso.zBaseGlobal} Y=${progresso.yZeroGlobal}`);
        titulo("✅ Terreno OK!", `Y base: ${progresso.yZeroGlobal}`, "green", "gray");

        progresso.faseApp = "construir_fila";
        salvarProgresso(progresso);
        return;
    }

    if (progresso.faseApp === "construir_fila") {
        if (progresso.indiceFila >= progresso.fila.length) {
            console.log("🎉 Fila completa. Reiniciando do zero.");
            titulo("🎉 FILA COMPLETA!", "Reiniciando do zero", "green", "gray");
            progresso.indiceFila = 0;
            salvarProgresso(progresso);
            return;
        }

        const item = progresso.fila[progresso.indiceFila];
        console.log(`\n📦 Lote ${progresso.indiceFila + 1}/${progresso.fila.length}: ${item.arquivo}`);
        titulo(
            "📦 Lote " + (progresso.indiceFila + 1) + "/" + progresso.fila.length,
            item.arquivo.replace(/\.(schem|schematic|nbt)$/, "").slice(0, 30),
            "gold", "yellow"
        );

        bot.chat("/clear @s");
        await dormir(1000);

        const loteX = item.tamanhoX + config.espacamentoLateral;
        const loteZ = item.tamanhoZ + config.ruaFrente + config.margemFundo;

        progresso.larguraAtual = loteX;
        progresso.profundidadeAtual = loteZ;
        salvarProgresso(progresso);

        await aberturaChuva(
            progresso.xBaseGlobal + Math.floor(item.tamanhoX / 2),
            progresso.yZeroGlobal,
            progresso.zBaseGlobal + Math.floor(item.tamanhoZ / 2),
            loteX, loteZ
        );

        await prepararLote(
            progresso.xBaseGlobal + Math.floor(item.tamanhoX / 2),
            progresso.yZeroGlobal,
            progresso.zBaseGlobal + Math.floor(item.tamanhoZ / 2),
            loteX, loteZ
        );

        await ajustarPosicaoInicial(false);

        plantaCache = await carregarBlueprint(item, progresso.xBaseGlobal, progresso.yZeroGlobal, progresso.zBaseGlobal);

        if (!plantaCache || plantaCache.blocos.length === 0) {
            console.log(`⚠️ ${item.arquivo} não carregou. Pulando.`);
            titulo("❌ Falha no arquivo", item.arquivo, "red", "gray");
            progresso.indiceFila++;
            progresso.faseApp = "construir_fila";
            salvarProgresso(progresso);
            await dormir(2000);
            return;
        }

        await construirBlueprint(plantaCache, false);

        const cx = progresso.xBaseGlobal + Math.floor(loteX / 2);
        const cz = progresso.zBaseGlobal + Math.floor(loteZ / 2);

        await enviarComandoDrone(`MODO_360 ${cx} ${progresso.yZeroGlobal} ${cz}`);
        titulo("🎬 Obra Concluída!", "Drone gravando 360º", "green", "gray");

        if (kokusenPendente.length > 0) {
            console.log(`\n💀 [KOKUSEN PENDENTE] Explodindo a obra...`);
            const d = kokusenPendente.shift();
            await anunciarDoador(d.doador, d.valor, d.nivel);
            await dormir(1500);
            await executarKokusen(cx, progresso.yZeroGlobal, cz, loteX, loteZ);
            await reconstruirChao(cx, progresso.yZeroGlobal, cz, loteX, loteZ);
            await dormir(5000);
            await ajustarPosicaoInicial(true);
        }

        inicioEsperaDoacao = Date.now();
        progresso.faseApp = "aguardando_kokusen";
        salvarProgresso(progresso);
        return;
    }

    if (progresso.faseApp === "aguardando_kokusen") {
        // ⚡ v3.5: se ocupado, NÃO conta o timer
        if (ocupado) {
            tituloAcao("🔒 Explosão em andamento...", "red");
            return;
        }

        const d = pegarProximaDoacao();
        if (d) {
            console.log(`\n💰 [DOAÇÃO] ${d.doador} [${d.nivel}]`);
            await anunciarDoador(d.doador, d.valor, d.nivel);
            await dormir(1500);

            const cx = progresso.xBaseGlobal + Math.floor(progresso.larguraAtual / 2);
            const cz = progresso.zBaseGlobal + Math.floor(progresso.profundidadeAtual / 2);
            const yTopo = progresso.yZeroGlobal + 30;

            switch (d.efeito) {
                case "TNT_PEQUENA": await tntPequena(cx, yTopo, cz); break;
                case "TNT_MEDIA":   await tntMedia(cx, yTopo, cz); break;
                case "TNT_GRANDE":  await tntGrande(cx, yTopo, cz); break;
                case "KOKUSEN_PATROCINADO":
                    await executarKokusen(cx, progresso.yZeroGlobal, cz, progresso.larguraAtual, progresso.profundidadeAtual);
                    await reconstruirChao(cx, progresso.yZeroGlobal, cz, progresso.larguraAtual, progresso.profundidadeAtual);
                    await ajustarPosicaoInicial(true);
                    break;
            }

            await dormir(5000);
            if (plantaCache) {
                const estado = await vistoriarEReparar(plantaCache);
                if (estado === "RESTART_TOTAL") {
                    progresso.faseApp = "construir_fila";
                    progresso.indiceFila = 0;
                    salvarProgresso(progresso);
                }
            }

            // ⚡ v3.5: reseta o timer DEPOIS de terminar tudo
            inicioEsperaDoacao = Date.now();
        } else {
            const tempoEsperando = Date.now() - inicioEsperaDoacao;

            if (tempoEsperando > config.tempoMaxEsperaDoacao) {
                console.log(`\n⏰ 5 minutos sem doação. Avançando pro próximo lote.`);
                titulo("⏰ Tempo esgotado!", "Próximo lote em 10s", "yellow", "gold");
                await dormir(10000);
                progresso.indiceFila++;
                progresso.faseApp = "construir_fila";
                inicioEsperaDoacao = 0;
                salvarProgresso(progresso);
                return;
            }

            const segundosRestantes = Math.floor((config.tempoMaxEsperaDoacao - tempoEsperando) / 1000);
            if (segundosRestantes % 30 === 0) {
                const min = Math.floor(segundosRestantes / 60);
                const seg = segundosRestantes % 60;
                titulo("⏳ Aguardando PIX...", `Próximo lote em ${min}:${String(seg).padStart(2, "0")}`, "aqua", "gray");
            } else {
                tituloAcao(`⏳ Aguardando PIX — próximo lote em ${Math.floor(segundosRestantes / 60)}:${String(segundosRestantes % 60).padStart(2, "0")}`, "aqua");
            }
        }
        await dormir(2000);
        return;
    }

    if (progresso.faseApp === "erro_leitura") {
        await dormir(5000);
        return;
    }
}

async function iniciarMente() {
    while (true) {
        try { await loopPrincipal(); } catch (e) { console.log("⚠️ Loop:", e.message); }
        await dormir(200);
    }
}

// ═══ 18. SPAWN ═══
bot.once("spawn", async () => {
    console.log("🔌 Raiden conectada.");
    try {
        const mcData = minecraftData(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
    } catch (e) {}

    await dormir(1500);
    bot.chat("/gamemode creative");
    await dormir(500);
    bot.chat("/clear @s");
    await dormir(800);
    bot.chat(`/skin ${config.skin}`);
    await dormir(800);

    titulo("🟢 Raiden Online", "Webhook LivePix ativo", "gold", "gray");
    console.log("🏙️ Sistema pronto. Webhook na porta " + config.portaWebhook);
    console.log("💡 Digite !posicionar no chat pra forçar TP pro chão.");
    console.log("💡 Digite !testeDrone, !teste360, !testeKokusen pra testar o drone.");
    console.log("💡 Digite !status pra ver se tá ocupado.");
    iniciarMente();
});

// ═══ 19. BLINDAGEM ═══
bot.on("error", (e) => console.log("⚠️ bot error:", e.message));
bot.on("kicked", (r) => console.log("⚠️ kicked:", r));
process.on("uncaughtException", (e) => console.log("⚠️ uncaught:", e.message));
process.on("unhandledRejection", (e) => console.log("⚠️ rejection:", e));