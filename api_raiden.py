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

⚠️ N4A — ROTAS SIMPLES MOVIDAS:
    - painel, memória, arquivos → rotas/
    - Os endpoints foram removidos daqui.
    - Os routers são registrados no fim do arquivo.
"""

# ============================================================
# 1. IMPORTS PADRÃO DO PYTHON
# ============================================================

import asyncio
import queue
import threading

from pathlib import Path
from contextlib import asynccontextmanager


# ============================================================
# 2. BIBLIOTECAS EXTERNAS
# ============================================================

import uvicorn
import speech_recognition as sr

from fastapi import (
    FastAPI,
    HTTPException,
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
    fila_respostas,
)

from nucleo.utils import (
    calar_linux,
    gerar_acao_id_minecraft,
    _normalizar_acao_id,
)

from nucleo.requests import (
    MensagemRequest,
    MinecraftAcaoRequest,
    MinecraftObjetivoRequest,
    MinecraftProgressoRequest,
)

from nucleo.historico import (
    limpar_historico,
)

from nucleo.estado_minecraft import (
    registrar_evento_autonomia_minecraft,
    registrar_evento_minecraft,
    registrar_resultado_acao_minecraft,
    obter_ultimos_eventos_minecraft,
    obter_estado_autonomia_minecraft,
    obter_objetivo_minecraft,
    obter_ultimo_resultado_acao_minecraft,
    obter_resultado_acao_minecraft,
    marcar_acao_pendente,
    obter_acao_pendente_id,
    existe_acao_pendente,
)

from nucleo.llm_minecraft import (
    validar_acao_minecraft,
)

from nucleo.cerebro import (
    worker_cerebro,
)

from nucleo.loop_minecraft import (
    iniciar_autonomia_minecraft,
    parar_autonomia_minecraft,
    _autonomia_esta_rodando,
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
import modulos.minecraft as minecraft_module
import modulos.minecraft_objetivos as minecraft_objetivos_module


# ============================================================
# 5. ROTAS (N4A)
# ============================================================

from rotas.painel import router as painel_router
from rotas.memoria import router as memoria_router
from rotas.arquivos import router as arquivos_router


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
# 🧩 ROUTERS (N4A)
# ============================================================

app.include_router(painel_router)
app.include_router(memoria_router)
app.include_router(arquivos_router)


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
# 💬 CHAT MANUAL
# ============================================================

@app.post("/chat")
async def chat_endpoint(
    req: MensagemRequest
):

    texto = (
        req.texto
        or req.text
        or ""
    ).strip()

    if not texto:

        raise HTTPException(
            status_code=400,
            detail="Texto vazio!"
        )

    fila_retorno = (
        queue.Queue(
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

        resposta = await asyncio.to_thread(
            fila_retorno.get,
            True,
            60
        )

        return resposta

    except queue.Empty:

        raise HTTPException(
            status_code=504,
            detail=(
                "A Raiden demorou mais de "
                "60 segundos para responder."
            )
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
                queue.Queue(
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
                    await asyncio.to_thread(
                        fila_retorno.get,
                        True,
                        60
                    )
                )

            except queue.Empty:

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
# ⛏ STATUS DO MINECRAFT
# ============================================================

@app.get("/api/minecraft/status")
async def minecraft_status():

    bridge = (
        minecraft_module
        .minecraft_bridge
    )

    return {

        "conectado":
            bridge.conectado,

        "autonomia":
            MINECRAFT_AUTONOMIA_ATIVA,

        "autonomia_habilitada":
            MINECRAFT_AUTONOMIA_ATIVA,

        "autonomia_rodando":
            _autonomia_esta_rodando(),

        "estado":
            bridge.obter_estado(),

        "objetivo":
            obter_objetivo_minecraft(),

        "autonomia_js":
            obter_estado_autonomia_minecraft(),

        "ultima_acao":
            bridge.obter_ultima_acao(),

        "ultimo_resultado_acao":
            obter_ultimo_resultado_acao_minecraft(),

        "ultimo_chat":
            bridge.obter_ultima_mensagem_chat(),

        "acao_pendente":
            existe_acao_pendente(),

        "acao_pendente_id":
            obter_acao_pendente_id(),

        "ultima_acao_id":
            _normalizar_acao_id(
                (
                    bridge.obter_ultima_acao()
                    or {}
                ).get("acao_id")
            ),

        "eventos_recentes":
            obter_ultimos_eventos_minecraft()

    }


# ============================================================
# ⛏ OBJETIVO ATUAL
# ============================================================

@app.get("/api/minecraft/objetivo")
async def minecraft_objetivo():

    return obter_objetivo_minecraft()


@app.post("/api/minecraft/objetivo")
async def definir_objetivo_minecraft(
    objetivo: MinecraftObjetivoRequest
):

    resultado = (
        minecraft_objetivos_module
        .minecraft_objetivos
        .definir_objetivo(
            id=objetivo.id,
            nome=objetivo.nome,
            descricao=objetivo.descricao,
            etapas=objetivo.etapas,
            itens_necessarios=objetivo.itens_necessarios,
            construir=objetivo.construir,
        )
    )

    return {
        "status": "ok",
        "objetivo": {
            "id": resultado.id,
            "nome": resultado.nome,
            "descricao": resultado.descricao,
            "progresso": resultado.progresso,
            "total": resultado.total,
            "concluido": resultado.concluido,
            "etapas": resultado.etapas,
            "itens_necessarios": resultado.itens_necessarios,
            "construir": resultado.construir,
        }
    }


@app.post("/api/minecraft/objetivo/progresso")
async def atualizar_progresso_minecraft(
    progresso: MinecraftProgressoRequest
):

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .atualizar_progresso(
            progresso.progresso
        )
    )

    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


@app.post("/api/minecraft/objetivo/concluir")
async def concluir_objetivo_minecraft():

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .concluir_objetivo()
    )

    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


@app.delete("/api/minecraft/objetivo")
async def limpar_objetivo_minecraft():

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .limpar_objetivo()
    )

    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


# ============================================================
# ⛏ EXECUTAR AÇÃO MANUAL NO MINECRAFT
# ============================================================

@app.post("/api/minecraft/acao")
async def minecraft_acao(
    request: MinecraftAcaoRequest
):

    bridge = (
        minecraft_module
        .minecraft_bridge
    )

    if not bridge.conectado:

        raise HTTPException(
            status_code=503,
            detail="Minecraft não está conectado."
        )

    decisao = {
        "acao":
            request.acao,
        **request.parametros
    }

    decisao_validada = (
        validar_acao_minecraft(
            decisao
        )
    )

    if decisao_validada is None:

        raise HTTPException(
            status_code=400,
            detail="Ação Minecraft inválida."
        )

    acao = (
        decisao_validada["acao"]
    )

    parametros = {
        chave: valor
        for chave, valor
        in decisao_validada.items()
        if chave != "acao"
    }

    acao_id = gerar_acao_id_minecraft()

    sucesso_envio = await bridge.executar_acao(
        acao,
        acao_id=acao_id,
        **parametros
    )

    if sucesso_envio:

        if acao not in {
            "definir_objetivo",
            "iniciar_autonomia",
            "parar_autonomia",
            "reiniciar_autonomia"
        }:
            marcar_acao_pendente(acao_id)

    return {

        "status":
            "ok"
            if sucesso_envio
            else "erro",

        "acao_id":
            acao_id,

        "acao":
            decisao_validada,

        "enviada":
            sucesso_envio,

        "confirmada":
            False,

        "observacao": (
            "enviada indica apenas que a ação "
            "foi entregue ao bridge. O resultado "
            "real chega via evento "
            "'minecraft_acao_resultado' no "
            "WebSocket e pode ser consultado "
            f"em /api/minecraft/acao/{acao_id}."
        )

    }


# ============================================================
# ⛏ CONSULTAR RESULTADO DE AÇÃO POR ID
# ============================================================

@app.get("/api/minecraft/acao/{acao_id}")
async def consultar_acao_minecraft(
    acao_id: str
):

    acao_id = _normalizar_acao_id(
        acao_id
    )

    if not acao_id:

        raise HTTPException(
            status_code=400,
            detail="acao_id obrigatório."
        )

    resultado = (
        obter_resultado_acao_minecraft(
            acao_id
        )
    )

    if resultado is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "Nenhum resultado registrado "
                "para esta ação."
            )
        )

    return {

        "status": "ok",

        "acao_id": acao_id,

        "resultado": resultado

    }


# ============================================================
# 🔊 FILA DE ÁUDIO
# ============================================================

@app.get("/proximo_audio")
async def proximo_audio():

    try:

        return (
            fila_respostas.get_nowait()
        )

    except queue.Empty:

        return {

            "texto": None,

            "audio_base64": None

        }


# ============================================================
# 🧹 LIMPAR HISTÓRICO
# ============================================================

@app.post("/api/chat/limpar-historico")
async def limpar_historico_chat():

    limpar_historico()

    return {

        "status": "ok",

        "mensagem":
            "Histórico limpo!"

    }


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