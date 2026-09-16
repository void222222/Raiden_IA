"""
🎌 RAIDEN - API PRINCIPAL

Core REST + Ouvido + Visão + Memória + YouTube +
ChatVRM + LivePix + Minecraft.

Minecraft:
    percepção → cérebro → decisão → ação → percepção

O Minecraft utiliza o mesmo cérebro Ollama da Raiden.
Não existe um segundo cérebro separado.

CENÁRIO C:
    - O Ollama decide ESTRATÉGIA (objetivo, iniciar/parar
      autonomia, ações pontuais).
    - O autonomia.js dentro do bot executa as etapas
      (minerar, craftar, construir).
    - Ações pontuais do Ollama ainda passam pelo bridge.

⚠️ REFATORAÇÃO N4:
    Rotas HTTP foram extraídas para rotas/.
    Este arquivo agora só contém:
    - Lifespan (startup/shutdown)
    - WebSocket /ws (chat)
    - WebSocket /ws/minecraft (bridge)
    - CORS + arquivos estáticos
    - Registro dos routers

    Rotas movidas:
      N4A: painel, memoria, arquivos
      N4B: chat, minecraft
"""

# ============================================================
# 1. IMPORTS PADRÃO DO PYTHON
# ============================================================

import asyncio
import threading

from contextlib import asynccontextmanager


# ============================================================
# 2. BIBLIOTECAS EXTERNAS
# ============================================================

import uvicorn
import speech_recognition as sr

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


# ============================================================
# 3. NÚCLEO
# ============================================================

from nucleo.logger import logger

from nucleo.config import (
    MICROFONE_ATIVO,
    CORS_ORIGINS,
    PASTA_PUBLIC_CHATVRM,
    MINECRAFT_AUTONOMIA_ATIVA,
    MINECRAFT_RESUMO_INTERVALO,
)

from nucleo.filas import (
    fila_perguntas,
)

from nucleo.utils import (
    calar_linux,
)

from nucleo.historico import (
    limpar_historico,
)

from nucleo.cerebro import (
    worker_cerebro,
)

from nucleo.loop_minecraft import (
    iniciar_autonomia_minecraft,
    parar_autonomia_minecraft,
)

from nucleo.websocket_minecraft import (
    handler_websocket_minecraft,
)


# ============================================================
# 4. MÓDULOS DA RAIDEN
# ============================================================

from modulos.web_memoria import (
    iniciar_banco,
)

import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module


# ============================================================
# 5. ROTAS (N4A + N4B)
# ============================================================

from rotas.painel import router as painel_router
from rotas.memoria import router as memoria_router
from rotas.arquivos import router as arquivos_router
from rotas.chat import router as chat_router
from rotas.minecraft import router as minecraft_router


# ============================================================
# 🎥 YOUTUBE
# ============================================================

def callback_youtube(
    comando: str
):

    fila_perguntas.put(
        comando
    )


# ============================================================
# 🎤 MICROFONE
# ============================================================

def escutar_microfone():

    VARIACOES_RAIDEN = [
        "raiden",
        "rayden",
        "haiden",
        "reyden"
    ]

    r = sr.Recognizer()

    r.energy_threshold = 300
    r.dynamic_energy_threshold = True
    r.pause_threshold = 0.8

    try:

        with calar_linux():
            mic = sr.Microphone()

        with mic as source:

            r.adjust_for_ambient_noise(
                source,
                duration=1
            )

            logger.info(
                "🎤 Ouvido físico ativado! "
                "Diga 'Raiden, [sua mensagem]'."
            )

            while True:

                try:

                    audio = r.listen(
                        source,
                        phrase_time_limit=8
                    )

                    texto = (
                        r.recognize_google(
                            audio,
                            language="pt-BR"
                        )
                        .lower()
                    )

                    gatilho_encontrado = False

                    for variacao in VARIACOES_RAIDEN:

                        if variacao in texto:

                            texto = texto.replace(
                                variacao,
                                ""
                            )

                            gatilho_encontrado = True

                    if not gatilho_encontrado:
                        continue

                    comando = texto.strip()

                    if comando:

                        logger.info(
                            f"🎙️ Microfone captou: {comando}"
                        )

                        fila_perguntas.put(
                            comando
                        )

                except sr.UnknownValueError:
                    pass

                except sr.RequestError as e:

                    logger.warning(
                        f"⚠️ Erro no reconhecimento: {e}"
                    )

                    continue

                except Exception as e:

                    logger.debug(
                        f"Aviso no microfone: {e}"
                    )

                    continue

    except Exception as e:

        logger.error(
            f"❌ Erro ao iniciar microfone: {e}"
        )

        logger.warning(
            "🎤 Microfone desativado por erro."
        )


# ============================================================
# 🚀 FASTAPI / LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(
    app: FastAPI
):

    logger.info(
        "🚀 Inicializando Raiden Core..."
    )

    iniciar_banco()

    threading.Thread(
        target=worker_cerebro,
        daemon=True,
        name="TrabalhadorCerebro"
    ).start()

    await iniciar_autonomia_minecraft()

    if MICROFONE_ATIVO:

        threading.Thread(
            target=escutar_microfone,
            daemon=True,
            name="OuvidoFisico"
        ).start()

        logger.info(
            "🎤 Ouvido físico ativado."
        )

    else:

        logger.info(
            "🎤 Ouvido físico desativado."
        )

    PASTA_PUBLIC_CHATVRM.mkdir(
        parents=True,
        exist_ok=True
    )

    logger.info(
        "🎛️ Painel local sem autenticação."
    )

    logger.info(
        "⛏🤖 Autonomia Minecraft: "
        f"{MINECRAFT_AUTONOMIA_ATIVA}"
    )

    logger.info(
        "📊 Resumo de eventos Minecraft: "
        f"a cada {MINECRAFT_RESUMO_INTERVALO}s "
        "(eventos de telemetria silenciados)"
    )

    logger.info(
        "✅ Raiden Core iniciado com sucesso."
    )

    yield

    logger.info(
        "🛑 Iniciando shutdown da Raiden..."
    )

    await parar_autonomia_minecraft()

    try:
        yt_module.parar_olheiro()
    except Exception:
        pass

    try:
        front_module.parar_chatvrm()
    except Exception:
        pass

    try:
        pix_module.parar_tunel()
    except Exception:
        pass

    limpar_historico()

    logger.info(
        "✅ Shutdown completo."
    )


# ============================================================
# 🚀 APLICAÇÃO FASTAPI
# ============================================================

app = FastAPI(

    title="Raiden Core API",

    version="2.5.0",

    lifespan=lifespan

)


# ============================================================
# 🌐 CORS
# ============================================================

app.add_middleware(

    CORSMiddleware,

    allow_origins=CORS_ORIGINS,

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]

)


# ============================================================
# 🧩 ROUTERS (N4A + N4B)
# ============================================================

app.include_router(painel_router)
app.include_router(memoria_router)
app.include_router(arquivos_router)
app.include_router(chat_router)
app.include_router(minecraft_router)


# ============================================================
# 📁 ARQUIVOS ESTÁTICOS
# ============================================================

app.mount(

    "/midia",

    StaticFiles(
        directory=PASTA_PUBLIC_CHATVRM
    ),

    name="midia"

)


# ============================================================
# 🔌 WEBSOCKET NORMAL
# ============================================================

@app.websocket("/ws")
async def websocket_chat(
    websocket: WebSocket
):

    await websocket.accept()

    logger.info(
        "🔌 WebSocket conectado."
    )

    try:

        while True:

            texto = (
                await websocket.receive_text()
            ).strip()

            if not texto:

                await websocket.send_json({

                    "texto":
                        "Manda alguma coisa aí, mermão.",

                    "audio_base64": None,

                    "expressao": "neutral"

                })

                continue

            logger.info(
                f"🔌 WebSocket recebeu: {texto}"
            )

            fila_retorno = (
                asyncio.Queue(
                    maxsize=1
                )
            )

            fila_perguntas.put(
                (
                    texto,
                    fila_retorno
                )
            )

            try:

                resposta = (
                    await asyncio.wait_for(
                        fila_retorno.get(),
                        timeout=60
                    )
                )

            except asyncio.TimeoutError:

                await websocket.send_json({

                    "texto": (
                        "A Raiden demorou demais "
                        "pra responder, mermão."
                    ),

                    "audio_base64": None,

                    "expressao": "neutral"

                })

                continue

            await websocket.send_json(
                resposta
            )

            logger.info(
                "🔌 Resposta enviada pelo WebSocket."
            )

    except WebSocketDisconnect:

        logger.info(
            "🔌 WebSocket desconectado."
        )

    except Exception as e:

        logger.error(
            f"❌ Erro no WebSocket: {e}"
        )

        try:

            await websocket.close(
                code=1011
            )

        except Exception:
            pass


# ============================================================
# ⛏ WEBSOCKET DO MINECRAFT (rota fina)
# ============================================================

@app.websocket("/ws/minecraft")
async def websocket_minecraft_route(
    websocket: WebSocket
):
    await handler_websocket_minecraft(websocket)


# ============================================================
# 🚀 INICIALIZAÇÃO
# ============================================================

if __name__ == "__main__":

    logger.info(
        "🚀 API Central rodando "
        "na porta 8000..."
    )

    logger.info(
        "🌐 Host: 127.0.0.1 "
        "(somente este computador)"
    )

    uvicorn.run(

        app,

        host="127.0.0.1",

        port=8000,

        access_log=False

    )