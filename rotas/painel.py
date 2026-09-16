"""
🎛️ ROTAS — PAINEL

Endpoints de status e controle geral da Raiden.

- status dos módulos
- abrir painel
- parar tudo
- toggles: youtube, frontend, livepix
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from modulos.minecraft import minecraft_bridge

import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module

from nucleo.config import (
    MINECRAFT_AUTONOMIA_ATIVA,
    PASTA_PAINEL,
)
from nucleo.logger import logger
from nucleo.requests import YouTubeRequest


router = APIRouter()


# ============================================================
# 📊 STATUS GERAL
# ============================================================

@router.get("/api/painel/status")
async def painel_status():

    return {
        "youtube": yt_module.olheiro_ativo,
        "frontend": (
            front_module.processo_frontend is not None
        ),
        "livepix": (
            pix_module.processo_tunel is not None
        ),
        "minecraft": minecraft_bridge.conectado,
        "minecraft_autonomia": MINECRAFT_AUTONOMIA_ATIVA,
    }


# ============================================================
# 🎥 YOUTUBE
# ============================================================

@router.post("/api/painel/youtube/toggle")
async def toggle_youtube(req: YouTubeRequest = None):

    if yt_module.olheiro_ativo:
        yt_module.parar_olheiro()
        return {"status": "desligado"}

    if not req or not req.link:
        raise HTTPException(
            status_code=400,
            detail="Coloque o link da live para ligar!"
        )

    # Import local pra evitar ciclo com api_raiden
    from api_raiden import callback_youtube

    sucesso = yt_module.iniciar_olheiro(
        req.link,
        callback_youtube
    )

    if sucesso:
        return {"status": "ligado"}

    raise HTTPException(
        status_code=400,
        detail="Erro ao conectar no YouTube."
    )


# ============================================================
# 🎛 FRONTEND
# ============================================================

@router.post("/api/painel/frontend/toggle")
async def toggle_frontend():

    if front_module.processo_frontend is not None:
        front_module.parar_chatvrm()
        return {"status": "desligado"}

    sucesso = front_module.ligar_chatvrm()

    if sucesso:
        return {"status": "ligado"}

    raise HTTPException(
        status_code=500,
        detail="Erro ao iniciar o Front-end."
    )


# ============================================================
# 💰 LIVEPIX
# ============================================================

@router.post("/api/painel/livepix/toggle")
async def toggle_livepix():

    if pix_module.processo_tunel is not None:
        pix_module.parar_tunel()
        return {"status": "desligado"}

    resultado = pix_module.ligar_tunel()

    if resultado["status"] == "ok":
        return {
            "status": "ligado",
            "url": resultado["url"]
        }

    raise HTTPException(
        status_code=500,
        detail=resultado["detail"]
    )


# ============================================================
# 🛑 PARAR TUDO
# ============================================================

@router.post("/api/painel/parar-tudo")
async def painel_parar():

    yt_module.parar_olheiro()
    front_module.parar_chatvrm()
    pix_module.parar_tunel()

    logger.info(
        "🛑 Comando de emergência: Tudo parado."
    )

    return {"status": "ok"}


# ============================================================
# 📺 PAINEL WEB
# ============================================================

@router.get("/painel")
async def abrir_painel():

    return FileResponse(
        PASTA_PAINEL / "dashboard.html"
    )