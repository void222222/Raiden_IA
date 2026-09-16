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
"""

# ============================================================
# 1. IMPORTS PADRÃO DO PYTHON
# ============================================================

import asyncio
import json
import re
import sys
import threading
import queue
import time

from collections import Counter
from typing import Optional
from contextlib import asynccontextmanager


# ============================================================
# 2. BIBLIOTECAS EXTERNAS
# ============================================================

import uvicorn
import speech_recognition as sr

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    WebSocket,
    WebSocketDisconnect
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


# ============================================================
# 3. NÚCLEO
# ============================================================

from nucleo.logger import logger

from nucleo.config import (
    MICROFONE_ATIVO,
    CORS_ORIGINS,
    MAX_UPLOAD_SIZE,
    UPLOAD_CHUNK_SIZE,
    EXTENSOES_PERMITIDAS,
    PASTA_PUBLIC_CHATVRM,
    PASTA_PAINEL,
    MINECRAFT_AUTONOMIA_ATIVA,
    MINECRAFT_INTERVALO_DECISAO,
    MINECRAFT_RESUMO_INTERVALO,
)

from nucleo.filas import (
    fila_perguntas,
    fila_respostas,
    minecraft_autonomia_evento,
)

from nucleo.utils import (
    calar_linux,
    gerar_acao_id_minecraft,
    _normalizar_acao_id,
)

from nucleo.requests import (
    MensagemRequest,
    YouTubeRequest,
    MemoriaRequest,
    EsquecerMemoriaRequest,
    MinecraftAcaoRequest,
    MinecraftObjetivoRequest,
    MinecraftProgressoRequest,
)

from nucleo.historico import (
    limpar_historico,
)

from nucleo.estado_minecraft import (
    # Eventos
    registrar_evento_autonomia_minecraft,
    registrar_evento_minecraft,
    registrar_resultado_acao_minecraft,
    obter_ultimos_eventos_minecraft,

    # Estado
    obter_estado_autonomia_minecraft,
    obter_estado_minecraft,
    obter_objetivo_minecraft,

    # Resultados
    obter_ultimo_resultado_acao_minecraft,
    obter_resultado_acao_minecraft,

    # Pendência
    marcar_acao_pendente,
    obter_acao_pendente_id,
    existe_acao_pendente,
)

from nucleo.llm_conversa import pensar_ollama
from nucleo.llm_minecraft import (
    pensar_acao_minecraft,
    validar_acao_minecraft,
)
from nucleo.voz import gerar_voz_base64

from nucleo.cerebro import (
    gerar_resposta,
    worker_cerebro,
)


# ============================================================
# 4. MÓDULOS DA RAIDEN
# ============================================================

from modulos.web_memoria import (
    iniciar_banco,
    aprender_memoria_pessoal,
    esquecer_memoria_pessoal,
    listar_memorias_pessoais,
)

import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module
import modulos.minecraft as minecraft_module
import modulos.minecraft_objetivos as minecraft_objetivos_module


# ============================================================
# 5. ESTADO GLOBAL
# ============================================================

minecraft_tarefa_autonomia = None


# ============================================================
# 🎯 HANDLE DA TASK DE AUTONOMIA
# ============================================================

def _autonomia_esta_rodando() -> bool:
    """
    Diz se a tarefa assíncrona da autonomia
    está realmente viva.
    """

    tarefa = minecraft_tarefa_autonomia

    return (
        tarefa is not None
        and not tarefa.done()
    )


# ============================================================
# ⛏ EXECUTAR DECISÃO MINECRAFT
# ============================================================

async def executar_decisao_minecraft(
    decisao: dict
) -> Optional[str]:

    if not decisao:
        return None

    decisao_validada = validar_acao_minecraft(decisao)

    if decisao_validada is None:
        logger.warning(
            "⚠️ Decisão Minecraft rejeitada."
        )
        return None

    acao = decisao_validada.get("acao")

    if acao in {None, "nenhuma"}:
        logger.info("⛏ Raiden decidiu não agir.")
        return None

    bridge = minecraft_module.minecraft_bridge

    if not bridge.conectado:
        logger.warning("⛏ Minecraft não conectado.")
        return None

    parametros = {
        chave: valor
        for chave, valor in decisao_validada.items()
        if chave != "acao"
    }

    acao_id = gerar_acao_id_minecraft()

    logger.info(
        "⛏🧠 Raiden decidiu: %s | acao_id=%s",
        decisao_validada,
        acao_id
    )

    try:
        sucesso = await bridge.executar_acao(
            acao,
            acao_id=acao_id,
            **parametros
        )

        if not sucesso:
            logger.warning(
                "⛏ Falha ao enviar ação %s",
                acao_id
            )
            return None

        if acao in {
            "definir_objetivo",
            "iniciar_autonomia",
            "parar_autonomia",
            "reiniciar_autonomia"
        }:
            return acao_id

        marcar_acao_pendente(acao_id)
        return acao_id

    except Exception as e:
        logger.error(
            f"❌ Erro executando ação Minecraft: {e}"
        )
        return None


# ============================================================
# ⛏🤖 LOOP AUTÔNOMO DO MINECRAFT
# ============================================================

async def loop_autonomia_minecraft():
    """
    Loop estratégico:
        percepção → estado da autonomia JS → Ollama decide
        → envia (ou não) comando → dorme
    """

    logger.info(
        "⛏🤖 Loop estratégico Minecraft iniciado."
    )

    while True:

        try:
            await minecraft_autonomia_evento.wait()

            bridge = minecraft_module.minecraft_bridge

            if not bridge.conectado:
                await asyncio.sleep(2)
                continue

            if existe_acao_pendente():
                await asyncio.sleep(1)
                continue

            estado = obter_estado_minecraft()

            decisao = await pensar_acao_minecraft(estado)

            if decisao:
                await executar_decisao_minecraft(decisao)

            await asyncio.sleep(
                MINECRAFT_INTERVALO_DECISAO
            )

        except asyncio.CancelledError:
            logger.info(
                "⛏🤖 Loop Minecraft encerrado."
            )
            raise

        except Exception as e:
            logger.error(
                f"❌ Erro no loop Minecraft: {e}"
            )
            await asyncio.sleep(3)


# ============================================================
# ⛏ INICIAR AUTONOMIA
# ============================================================

async def iniciar_autonomia_minecraft():

    global minecraft_tarefa_autonomia


    if (
        minecraft_tarefa_autonomia is not None
        and not minecraft_tarefa_autonomia.done()
    ):

        logger.info(
            "⛏🤖 Autonomia Minecraft já está "
            "rodando, ignorando reinício."
        )

        return


    if minecraft_tarefa_autonomia is not None:

        logger.warning(
            "⛏🤖 Tarefa de autonomia anterior "
            "estava finalizada. Recriando."
        )

        minecraft_tarefa_autonomia = None


    if not MINECRAFT_AUTONOMIA_ATIVA:

        logger.info(
            "⛏🤖 Autonomia Minecraft desativada "
            "por configuração."
        )
        return

    minecraft_autonomia_evento.set()

    minecraft_tarefa_autonomia = (
        asyncio.create_task(
            loop_autonomia_minecraft()
        )
    )

    logger.info(
        "⛏🤖 Loop estratégico Minecraft preparado."
    )


# ============================================================
# ⛏ PARAR AUTONOMIA
# ============================================================

async def parar_autonomia_minecraft():

    global minecraft_tarefa_autonomia


    minecraft_autonomia_evento.clear()


    if minecraft_tarefa_autonomia:

        minecraft_tarefa_autonomia.cancel()


        try:

            await (
                minecraft_tarefa_autonomia
            )

        except asyncio.CancelledError:

            pass


        minecraft_tarefa_autonomia = None


    logger.info(
        "⛏🤖 Autonomia Minecraft parada."
    )


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
            60        )


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
# ⛏ WEBSOCKET DO MINECRAFT
# ============================================================

@app.websocket("/ws/minecraft")
async def websocket_minecraft(
    websocket: WebSocket
):

    await websocket.accept()


    bridge = (
        minecraft_module
        .minecraft_bridge
    )


    await bridge.conectar(
        websocket
    )


    logger.info(
        "⛏ Conexão Minecraft estabelecida."
    )


    await bridge.enviar({

        "tipo": "conexao",

        "status": "ok",

        "mensagem":
            "Minecraft conectado à Raiden."

    })

    if (
        MINECRAFT_AUTONOMIA_ATIVA
        and bridge.conectado
    ):
        try:
            objetivo_inicial = (
                minecraft_objetivos_module
                .minecraft_objetivos
                .obter_estado()
            )

            if (
                objetivo_inicial
                and objetivo_inicial.get("existe")
            ):
                obj = objetivo_inicial.get("objetivo") or {}

                payload_objetivo = {
                    "id": obj.get("id"),
                    "nome": obj.get("nome"),
                    "descricao": obj.get("descricao"),
                }

                if obj.get("itens_necessarios"):
                    payload_objetivo["itens_necessarios"] = (
                        obj["itens_necessarios"]
                    )

                if obj.get("construir"):
                    payload_objetivo["construir"] = obj["construir"]

                if not obj.get("itens_necessarios") and obj.get("etapas"):
                    payload_objetivo["etapas"] = obj["etapas"]

                await bridge.executar_acao(
                    "definir_objetivo",
                    acao_id=gerar_acao_id_minecraft(),
                    **payload_objetivo
                )

                await bridge.executar_acao(
                    "iniciar_autonomia",
                    acao_id=gerar_acao_id_minecraft()
                )

                logger.info(
                    "⛏🤖 Objetivo inicial enviado ao bot: %s",
                    payload_objetivo.get("id")
                )

        except Exception as e:

            logger.error(
                f"❌ Erro no bootstrap da autonomia: {e}"
            )


    try:

        while True:

            mensagem = (
                await websocket.receive_json()
            )


            if not isinstance(
                mensagem,
                dict
            ):

                logger.warning(
                    "⚠️ Minecraft enviou "
                    "mensagem inválida."
                )


                await bridge.enviar({

                    "tipo": "erro",

                    "mensagem":
                        "A mensagem precisa "
                        "ser um objeto JSON."

                })


                continue


            tipo = mensagem.get(
                "tipo",
                "desconhecido"
            )


            if tipo == "ack":

                continue


            if tipo == "ping":

                await bridge.enviar({

                    "tipo": "pong",

                    "timestamp":
                        mensagem.get(
                            "timestamp"
                        )

                })

                continue


            if tipo == "estado":

                estado_real = mensagem.get("estado")

                if isinstance(estado_real, dict):

                    bridge.atualizar_estado(
                        estado_real
                    )

                else:

                    logger.warning(
                        "⚠️ Mensagem de estado sem "
                        "chave 'estado' válida."
                    )

                await bridge.enviar({

                    "tipo": "ack",

                    "origem": "raiden",

                    "evento":
                        "estado_recebido"

                })

                continue


            if (
                tipo ==
                "minecraft_acao_resultado"
            ):

                acao_id = (
                    mensagem.get("acao_id")
                    or mensagem.get("id")
                )

                acao_id_normalizado = (
                    _normalizar_acao_id(acao_id)
                )

                origem = mensagem.get("origem", "api")

                if acao_id_normalizado is None:

                    if origem == "autonomia":

                        logger.info(
                            "⛏ Resultado de ação da autonomia "
                            "(sem acao_id): %s",
                            mensagem.get("acao")
                        )

                    else:

                        logger.warning(
                            "⚠️ Resultado de ação Minecraft "
                            "sem acao_id e origem != autonomia. "
                            "payload=%r",
                            mensagem
                        )

                else:

                    mensagem["acao_id"] = acao_id_normalizado

                bridge.registrar_resultado_acao(
                    mensagem
                )

                registrar_resultado_acao_minecraft(
                    mensagem
                )

                registrar_evento_minecraft({
                    "tipo": "minecraft_acao_resultado",
                    **mensagem
                })

                logger.info(
                    "⛏ Resultado da ação: %s",
                    mensagem
                )

                continue


            if tipo == "minecraft_chat":

                bridge.registrar_chat(
                    mensagem
                )


                registrar_evento_minecraft(
                    mensagem
                )


                logger.info(
                    "💬 Minecraft: "
                    f"{mensagem.get('usuario')}: "
                    f"{mensagem.get('mensagem')}"
                )


                continue


            if tipo == "minecraft_evento":

                evento_nome = str(
                    mensagem.get("evento") or ""
                )

                if evento_nome.startswith("minecraft_autonomia_"):

                    registrar_evento_autonomia_minecraft(
                        mensagem
                    )

                else:

                    registrar_evento_minecraft(
                        mensagem
                    )

                continue


            logger.info(
                "⛏ Minecraft → Raiden | "
                f"tipo={tipo} | dados={mensagem}"
            )


            await bridge.enviar({

                "tipo": "ack",

                "origem": "raiden",

                "evento":
                    "mensagem_recebida",

                "tipo_recebido":
                    tipo

            })


    except WebSocketDisconnect:

        logger.info(
            "⛏ Minecraft encerrou a conexão."
        )


    except Exception:

        logger.exception(
            "❌ Erro no WebSocket Minecraft"
        )


    finally:

        await bridge.desconectar()


        logger.info(
            "⛏ Conexão Minecraft finalizada."
        )


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

        "autonomia_tarefa_existe":
            minecraft_tarefa_autonomia
            is not None,

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
# 🧠 MEMÓRIA PESSOAL
# ============================================================

@app.post("/api/painel/memoria/aprender")
async def aprender_memoria(
    req: MemoriaRequest
):

    termo = req.termo.strip()

    conteudo = req.conteudo.strip()

    categoria = (
        req.categoria.strip()
        or "geral"
    )


    if not termo or not conteudo:

        raise HTTPException(

            status_code=400,

            detail=(
                "Termo e conteúdo "
                "são obrigatórios."
            )

        )


    sucesso = (
        aprender_memoria_pessoal(

            termo=termo,

            conteudo=conteudo,

            categoria=categoria

        )
    )


    if not sucesso:

        raise HTTPException(

            status_code=500,

            detail=(
                "Não foi possível "
                "salvar a memória."
            )

        )


    return {

        "status": "ok",

        "mensagem":
            "Memória aprendida.",

        "termo": termo,

        "categoria": categoria

    }


@app.get("/api/painel/memoria")
async def listar_memoria():

    return {

        "memorias":
            listar_memorias_pessoais()

    }


@app.delete("/api/painel/memoria")
async def esquecer_memoria(
    req: EsquecerMemoriaRequest
):

    termo = req.termo.strip()


    if not termo:

        raise HTTPException(

            status_code=400,

            detail="Termo obrigatório."

        )


    sucesso = (
        esquecer_memoria_pessoal(

            termo=termo,

            categoria=req.categoria

        )
    )

    if not sucesso:

        raise HTTPException(

            status_code=404,

            detail="Memória não encontrada."

        )


    return {

        "status": "ok",

        "mensagem":
            "Memória esquecida."

    }


# ============================================================
# 🎛️ PAINEL
# ============================================================

@app.get("/api/painel/status")
async def painel_status():

    return {

        "youtube":
            yt_module.olheiro_ativo,

        "frontend": (
            front_module
            .processo_frontend
            is not None
        ),

        "livepix": (
            pix_module
            .processo_tunel
            is not None
        ),

        "minecraft": (
            minecraft_module
            .minecraft_bridge
            .conectado
        ),

        "minecraft_autonomia":
            MINECRAFT_AUTONOMIA_ATIVA

    }


# ============================================================
# 🎥 YOUTUBE
# ============================================================

@app.post("/api/painel/youtube/toggle")
async def toggle_youtube(
    req: YouTubeRequest = None
):

    if yt_module.olheiro_ativo:

        yt_module.parar_olheiro()

        return {
            "status": "desligado"
        }


    if not req or not req.link:

        raise HTTPException(

            status_code=400,

            detail=(
                "Coloque o link da live "
                "para ligar!"
            )

        )


    sucesso = (
        yt_module.iniciar_olheiro(
            req.link,
            callback_youtube
        )
    )


    if sucesso:

        return {
            "status": "ligado"
        }


    raise HTTPException(

        status_code=400,

        detail=(
            "Erro ao conectar no YouTube."
        )

    )


# ============================================================
# 🎛 FRONTEND
# ============================================================

@app.post("/api/painel/frontend/toggle")
async def toggle_frontend():

    if (
        front_module
        .processo_frontend
        is not None
    ):

        front_module.parar_chatvrm()

        return {
            "status": "desligado"
        }


    sucesso = (
        front_module
        .ligar_chatvrm()
    )


    if sucesso:

        return {
            "status": "ligado"
        }


    raise HTTPException(

        status_code=500,

        detail=(
            "Erro ao iniciar "
            "o Front-end."
        )

    )


# ============================================================
# 💰 LIVEPIX
# ============================================================

@app.post("/api/painel/livepix/toggle")
async def toggle_livepix():

    if (
        pix_module
        .processo_tunel
        is not None
    ):

        pix_module.parar_tunel()

        return {
            "status": "desligado"
        }


    resultado = (
        pix_module
        .ligar_tunel()
    )


    if resultado["status"] == "ok":

        return {

            "status": "ligado",

            "url":
                resultado["url"]

        }


    raise HTTPException(

        status_code=500,

        detail=resultado["detail"]

    )


# ============================================================
# 🛑 PARAR TUDO
# ============================================================

@app.post("/api/painel/parar-tudo")
async def painel_parar():

    yt_module.parar_olheiro()

    front_module.parar_chatvrm()

    pix_module.parar_tunel()


    logger.info(
        "🛑 Comando de emergência: "
        "Tudo parado."
    )


    return {
        "status": "ok"
    }


# ============================================================
# 📺 PAINEL WEB
# ============================================================

@app.get("/painel")
async def abrir_painel():

    return FileResponse(
        PASTA_PAINEL
        / "dashboard.html"
    )


# ============================================================
# 👗 GESTÃO DE ARQUIVOS
# ============================================================

EXTENSOES_PERMITIDAS = {

    ".vrm",

    ".vrma",

    ".png",

    ".jpg",

    ".jpeg"

}


@app.get("/api/arquivos")
async def listar_arquivos():

    modelos = []

    animacoes = []

    fundos = []


    try:

        for arquivo in os.listdir(
            PASTA_PUBLIC_CHATVRM
        ):

            caminho = (
                PASTA_PUBLIC_CHATVRM
                / arquivo
            )


            if not caminho.is_file():

                continue


            if arquivo.lower().endswith(
                ".vrm"
            ):

                modelos.append(
                    arquivo
                )


            elif arquivo.lower().endswith(
                ".vrma"
            ):

                animacoes.append(
                    arquivo
                )


            elif arquivo.lower().endswith(
                (
                    ".png",
                    ".jpg",
                    ".jpeg"
                )
            ):

                fundos.append(
                    arquivo
                )


        return {

            "modelos": modelos,

            "animacoes": animacoes,

            "fundos": fundos

        }


    except Exception as e:

        logger.error(
            f"❌ Erro ao listar arquivos: {e}"
        )


        raise HTTPException(

            status_code=500,

            detail=(
                "Erro ao listar arquivos."
            )

        )


# ============================================================
# 📤 UPLOAD
# ============================================================

@app.post("/api/upload")
async def upload_arquivo(
    file: UploadFile = File(...)
):

    nome_arquivo = Path(
        file.filename or ""
    ).name


    if not nome_arquivo:

        raise HTTPException(

            status_code=400,

            detail=(
                "Nome de arquivo inválido."
            )

        )


    extensao = (
        Path(nome_arquivo)
        .suffix
        .lower()
    )


    if extensao not in EXTENSOES_PERMITIDAS:

        raise HTTPException(

            status_code=400,

            detail=(
                "Tipo de arquivo não permitido. "
                "Use VRM, VRMA, PNG ou JPG."
            )

        )


    caminho_salvar = (
        PASTA_PUBLIC_CHATVRM
        / nome_arquivo
    )


    try:

        caminho_salvar.resolve().relative_to(
            PASTA_PUBLIC_CHATVRM.resolve()
        )


    except ValueError:

        raise HTTPException(

            status_code=400,

            detail=(
                "Caminho de arquivo inválido."
            )

        )


    try:

        tamanho_total = 0

        conteudo = bytearray()


        while True:

            chunk = await file.read(
                UPLOAD_CHUNK_SIZE
            )


            if not chunk:

                break


            tamanho_total += len(
                chunk
            )


            if tamanho_total > MAX_UPLOAD_SIZE:

                raise HTTPException(

                    status_code=413,

                    detail=(
                        "Arquivo muito grande! "
                        "Máximo: 10MB"
                    )

                )


            conteudo.extend(
                chunk
            )


        caminho_salvar.write_bytes(
            conteudo
        )


        logger.info(
            f"📥 Arquivo salvo: "
            f"{nome_arquivo} "
            f"({tamanho_total} bytes)"
        )


        return {

            "status": "ok",

            "arquivo": nome_arquivo,

            "tamanho": tamanho_total

        }


    except HTTPException:

        raise


    except Exception as e:

        logger.error(
            f"❌ Erro ao salvar arquivo "
            f"{nome_arquivo}: {e}"
        )


        raise HTTPException(

            status_code=500,

            detail=(
                "Erro ao salvar arquivo."
            )

        )


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