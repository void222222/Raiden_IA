"""
💬 ROTAS — CHAT HTTP

Endpoints HTTP de chat (não-WebSocket).
O WebSocket /ws fica no api_raiden.py.
"""

import asyncio
import queue

from fastapi import APIRouter, HTTPException

from nucleo.filas import (
    fila_perguntas,
    fila_respostas,
)
from nucleo.historico import limpar_historico
from nucleo.requests import MensagemRequest


router = APIRouter()


# ============================================================
# 💬 CHAT MANUAL
# ============================================================

@router.post("/chat")
async def chat_endpoint(req: MensagemRequest):

    texto = (req.texto or req.text or "").strip()

    if not texto:
        raise HTTPException(
            status_code=400,
            detail="Texto vazio!"
        )

    fila_retorno = queue.Queue(maxsize=1)

    fila_perguntas.put((texto, fila_retorno))

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
# 🔊 FILA DE ÁUDIO
# ============================================================

@router.get("/proximo_audio")
async def proximo_audio():

    try:
        return fila_respostas.get_nowait()

    except queue.Empty:
        return {
            "texto": None,
            "audio_base64": None
        }


# ============================================================
# 🧹 LIMPAR HISTÓRICO
# ============================================================

@router.post("/api/chat/limpar-historico")
async def limpar_historico_chat():

    limpar_historico()

    return {
        "status": "ok",
        "mensagem": "Histórico limpo!"
    }