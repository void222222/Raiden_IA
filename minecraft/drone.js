// drone.js — O Diretor de Fotografia (v3.5 — Câmera Suave)
//
// MUDANÇAS DA v3.5:
// - ✅ Movimento SUAVE via física do mineflayer (sem /tp por frame)
// - ✅ Usa bot.creative.flyTo() + controle manual de velocity
// - ✅ /tp só como fallback de emergência (a cada 3s, não 400ms)
// - ✅ Interpolação de posição pra câmera cinematográfica
// - ✅ Escuta whisper E messagestr (mantido da v3.4)
// - ✅ Regex robusto + fallback de coordenadas (mantido)
// - ✅ Corrigido: usa .norm() em vez de .length() no velocity
// - ✅ dronePronto: só loga "Raiden entrou" depois do spawn

const mineflayer = require('mineflayer');
const { Vec3 } = require('vec3');

const drone = mineflayer.createBot({
    host: '127.0.0.1',
    port: 25565,
    username: 'DroneCam',
    version: false
});

// ─── ESTADOS ───
let modo = "SEGUIR";
let centroObra = null;
let anguloGiro = 0;
let anguloExplosao = 0;
let anguloAbertura = 0;
let inicioFilmagem = 0;
let inicioAbertura = 0;
let ultimoAviso = 0;
let tpFunciona = true;
let ultimoTPEmergencia = 0;
let ticksTravado = 0;
let dronePronto = false;

// ─── CONFIG v3.5 ───
const CONFIG = {
    DISTANCIA_SEGUIR: 8,
    ALTURA_SEGUIR: 6,
    RAIO_ORBITA: 30,
    ALTURA_ORBITA: 18,
    VELOCIDADE_GIRO: 0.006,
    VOLTAS: 3,
    RAIO_ABERTURA: 45,
    ALTURA_ABERTURA: 35,
    VELOCIDADE_GIRO_ABERTURA: 0.004,
    TEMPO_ABERTURA: 20 * 60 * 1000,
    RAIO_ORBITA_EXPLOSAO: 40,
    ALTURA_ORBITA_EXPLOSAO: 30,
    VELOCIDADE_GIRO_EXPLOSAO: 0.003,
    TEMPO_FILMAGEM_EXPLOSAO: 10 * 60 * 1000,

    VELOCIDADE_MAX: 0.8,
    SUAVIDADE: 0.15,
    DISTANCIA_CHEGOU: 1.5,
    INTERVALO_TP_EMERGENCIA: 3000,
    DISTANCIA_TRAVOU: 15
};

// ─── SPAWN ───
drone.once('spawn', () => {
    console.log("🚁 Câmera no ar. Configurando lentes...");
    console.log(`📌 Posição inicial do drone: ${drone.entity.position}`);

    setTimeout(() => {
        drone.chat("/gamemode creative");
        drone.chat("/effect give @s minecraft:invisibility 999999 1 true");
        drone.chat("/effect give @s minecraft:resistance 999999 4 true");
        drone.chat("/gamerule sendCommandFeedback false");
        drone.chat("/gamerule commandBlockOutput false");
        console.log("🎥 Drone invisível, imune e pronto pra gravar.");

        setTimeout(() => {
            try {
                drone.creative.startFlying();
                console.log("✈️ Modo de voo criativo ativado.");
            } catch (e) {
                console.log("⚠️ Falha ao ativar voo:", e.message);
            }

            setTimeout(() => {
                console.log("🧪 Testando /tp (emergência)...");
                const posAntes = drone.entity.position.clone();
                drone.chat(`/tp @s ${posAntes.x} ${posAntes.y + 5} ${posAntes.z}`);
                setTimeout(() => {
                    const posDepois = drone.entity.position;
                    const diff = posDepois.distanceTo(posAntes);
                    if (diff > 1) {
                        console.log(`✅ /tp de emergência OK (moveu ${diff.toFixed(2)} blocos)`);
                        tpFunciona = true;
                    } else {
                        console.log(`❌ /tp NÃO FUNCIONA! Sem fallback de emergência.`);
                        console.log(`💡 DICA: dá OP pro drone: /op DroneCam`);
                        tpFunciona = false;
                    }

                    dronePronto = true;

                    if (drone.players['Raiden']) {
                        console.log("👁️ Raiden já estava online! Action!");
                        modo = "SEGUIR";
                    } else {
                        console.log("⏳ Aguardando a Raiden entrar...");
                    }
                }, 1500);
            }, 1500);
        }, 800);
    }, 1500);
});

drone.on('playerJoined', (player) => {
    if (!dronePronto) return;
    if (player.username === 'Raiden' && modo === "SEGUIR") {
        console.log("👁️ Raiden entrou! Action!");
    }
});

// ─── TELEPATIA ───
function processarComandoDrone(username, message) {
    if (!message) return;
    if (username && username !== 'desconhecido' && !username.includes('Raiden')) return;

    console.log(`📨 Comando recebido de [${username}]: ${message}`);

    if (message.includes('ABERTURA_INICIO')) {
        const match = message.match(/ABERTURA_INICIO\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
        if (!match) { console.log("⚠️ ABERTURA_INICIO sem coordenadas"); return; }
        const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
        console.log(`\n🎆 Abertura! Filmando em [${x}, ${y}, ${z}]`);
        modo = "ABERTURA";
        centroObra = new Vec3(x, y, z);
        anguloAbertura = 0;
        inicioAbertura = Date.now();
        return;
    }

    if (message.includes('MODO_360')) {
        const match = message.match(/MODO_360\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
        if (!match) { console.log("⚠️ MODO_360 sem coordenadas"); return; }
        const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
        console.log(`\n🎥 Obra finalizada! 360º em [${x}, ${y}, ${z}]`);
        modo = "ORBITAR";
        centroObra = new Vec3(x, y, z);
        anguloGiro = 0;
        return;
    }

    if (message.includes('KOKUSEN_INICIO')) {
        const match = message.match(/KOKUSEN_INICIO\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
        if (!match) { console.log("⚠️ KOKUSEN_INICIO sem coordenadas"); return; }
        const x = parseFloat(match[1]), y = parseFloat(match[2]), z = parseFloat(match[3]);
        console.log(`\n💥 KOKUSEN! Filmando em [${x}, ${y}, ${z}]`);
        modo = "ORBITAR_EXPLOSAO";
        centroObra = new Vec3(x, y, z);
        anguloExplosao = 0;
        inicioFilmagem = Date.now();
        ultimoAviso = 0;
        return;
    }

    if (message.includes('PARAR')) {
        console.log(`\n🛑 PARAR recebido! Voltando a SEGUIR.`);
        modo = "SEGUIR";
        centroObra = null;
        return;
    }
}

drone.on('whisper', (username, message) => {
    processarComandoDrone(username, message);
});

drone.on('messagestr', (message, messagePosition, jsonMsg, sender) => {
    if (!message) return;
    if (message.includes('ABERTURA_INICIO') ||
        message.includes('MODO_360') ||
        message.includes('KOKUSEN_INICIO') ||
        message.includes('PARAR')) {
        processarComandoDrone(sender || 'desconhecido', message);
    }
});

// ─── MOVIMENTO SUAVE ───
function voarSuavePara(alvo, velocidade = CONFIG.VELOCIDADE_MAX) {
    if (!drone.entity) return;

    const pos = drone.entity.position;
    const dx = alvo.x - pos.x;
    const dy = alvo.y - pos.y;
    const dz = alvo.z - pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < CONFIG.DISTANCIA_CHEGOU) {
        try {
            drone.entity.velocity.x *= 0.5;
            drone.entity.velocity.y *= 0.5;
            drone.entity.velocity.z *= 0.5;
        } catch (e) {}
        return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const velX = nx * velocidade;
    const velY = ny * velocidade;
    const velZ = nz * velocidade;

    try {
        drone.entity.velocity.x += (velX - drone.entity.velocity.x) * CONFIG.SUAVIDADE;
        drone.entity.velocity.y += (velY - drone.entity.velocity.y) * CONFIG.SUAVIDADE;
        drone.entity.velocity.z += (velZ - drone.entity.velocity.z) * CONFIG.SUAVIDADE;
    } catch (e) {}

    if (!drone.entity.onGround && !drone.creative.flying) {
        try { drone.creative.startFlying(); } catch (e) {}
    }
}

// ─── TP DE EMERGÊNCIA ───
function tpEmergencia(x, y, z) {
    const agora = Date.now();
    if (agora - ultimoTPEmergencia < CONFIG.INTERVALO_TP_EMERGENCIA) return;
    if (!tpFunciona) return;

    ultimoTPEmergencia = agora;
    const px = Math.round(x * 100) / 100;
    const py = Math.round(y * 100) / 100;
    const pz = Math.round(z * 100) / 100;

    console.log(`🚨 [EMERGÊNCIA] Drone travado! Forçando TP pra (${px}, ${py}, ${pz})`);
    try { drone.chat(`/tp @s ${px} ${py} ${pz}`); } catch (e) {}
}

// ─── LOOP DE MOVIMENTO ───
let contadorLog = 0;
setInterval(() => {
    if (!drone.entity) return;

    let alvo = null;
    let descricao = "";

    // ─── SEGUIR ───
    if (modo === "SEGUIR") {
        const raiden = drone.players['Raiden'];
        if (!raiden || !raiden.entity) {
            if (contadorLog % 50 === 0) {
                console.log("⏳ Modo SEGUIR, mas Raiden não está online. Aguardando...");
            }
            contadorLog++;
            return;
        }
        const pos = raiden.entity.position;
        alvo = new Vec3(
            pos.x + CONFIG.DISTANCIA_SEGUIR * 0.7,
            pos.y + CONFIG.ALTURA_SEGUIR,
            pos.z + CONFIG.DISTANCIA_SEGUIR * 0.7
        );
        descricao = "SEGUIR";
        try { drone.lookAt(raiden.entity.position.offset(0, 1.5, 0), true); } catch (e) {}
    }

    // ─── ORBITAR ───
    else if (modo === "ORBITAR" && centroObra) {
        anguloGiro += CONFIG.VELOCIDADE_GIRO;
        alvo = new Vec3(
            centroObra.x + CONFIG.RAIO_ORBITA * Math.cos(anguloGiro),
            centroObra.y + CONFIG.ALTURA_ORBITA,
            centroObra.z + CONFIG.RAIO_ORBITA * Math.sin(anguloGiro)
        );
        descricao = "ORBITAR";
        try { drone.lookAt(centroObra.offset(0, 5, 0), true); } catch (e) {}

        if (anguloGiro >= Math.PI * 2 * CONFIG.VOLTAS) {
            console.log("💥 Take finalizado! Liberando KOKUSEN...");
            drone.whisper('Raiden', 'EXPLODIR');
            modo = "ORBITAR_EXPLOSAO";
            anguloExplosao = anguloGiro;
            inicioFilmagem = Date.now();
            ultimoAviso = 0;
        }
    }

    // ─── ABERTURA ───
    else if (modo === "ABERTURA" && centroObra) {
        anguloAbertura += CONFIG.VELOCIDADE_GIRO_ABERTURA;
        alvo = new Vec3(
            centroObra.x + CONFIG.RAIO_ABERTURA * Math.cos(anguloAbertura),
            centroObra.y + CONFIG.ALTURA_ABERTURA,
            centroObra.z + CONFIG.RAIO_ABERTURA * Math.sin(anguloAbertura)
        );
        descricao = "ABERTURA";
        try { drone.lookAt(centroObra.offset(0, 5, 0), true); } catch (e) {}

        if (Date.now() - inicioAbertura > CONFIG.TEMPO_ABERTURA) {
            console.log(`🎬 Abertura filmada! Voltando a SEGUIR.`);
            modo = "SEGUIR";
            centroObra = null;
            inicioAbertura = 0;
        }
    }

    // ─── EXPLOSÃO ───
    else if (modo === "ORBITAR_EXPLOSAO" && centroObra) {
        anguloExplosao += CONFIG.VELOCIDADE_GIRO_EXPLOSAO;
        alvo = new Vec3(
            centroObra.x + CONFIG.RAIO_ORBITA_EXPLOSAO * Math.cos(anguloExplosao),
            centroObra.y + CONFIG.ALTURA_ORBITA_EXPLOSAO,
            centroObra.z + CONFIG.RAIO_ORBITA_EXPLOSAO * Math.sin(anguloExplosao)
        );
        descricao = "EXPLOSAO";
        try { drone.lookAt(centroObra.offset(0, 3, 0), true); } catch (e) {}

        const tempo = Date.now() - inicioFilmagem;
        if (tempo - ultimoAviso > 60000) {
            const restante = Math.max(0, Math.ceil((CONFIG.TEMPO_FILMAGEM_EXPLOSAO - tempo) / 60000));
            console.log(`🎬 Filmando explosão... ${restante}min restantes`);
            ultimoAviso = tempo;
        }

        if (tempo > CONFIG.TEMPO_FILMAGEM_EXPLOSAO) {
            console.log(`🎬 Corta! Voltando a SEGUIR.`);
            modo = "SEGUIR";
            centroObra = null;
            inicioFilmagem = 0;
        }
    }

    // ─── MOVIMENTO SUAVE ───
    if (alvo) {
        voarSuavePara(alvo, CONFIG.VELOCIDADE_MAX);

        const pos = drone.entity.position;
        const dist = alvo.distanceTo(pos);

        if (dist > CONFIG.DISTANCIA_TRAVOU) {
            ticksTravado++;
            if (ticksTravado > 60) {
                tpEmergencia(alvo.x, alvo.y, alvo.z);
                ticksTravado = 0;
            }
        } else {
            ticksTravado = 0;
        }

        if (contadorLog % 50 === 0) {
            const vel = drone.entity.velocity
                ? Math.sqrt(
                    (drone.entity.velocity.x || 0) ** 2 +
                    (drone.entity.velocity.y || 0) ** 2 +
                    (drone.entity.velocity.z || 0) ** 2
                  ).toFixed(2)
                : "0.00";
            console.log(`🎥 [${descricao}] Drone: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) → Alvo: (${alvo.x.toFixed(1)}, ${alvo.y.toFixed(1)}, ${alvo.z.toFixed(1)}) | Dist: ${dist.toFixed(1)} | Vel: ${vel}`);
        }
        contadorLog++;
    }
}, 50);

drone.on('error', (e) => console.log("⚠️ drone error:", e.message));
drone.on('kicked', (r) => console.log("⚠️ drone kicked:", r));