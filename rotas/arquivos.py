"""
📁 ROTAS — ARQUIVOS

Listagem e upload de arquivos do ChatVRM.
"""

import os

from pathlib import Path

from fastapi import (
    APIRouter,
    HTTPException,
    UploadFile,
    File,
)

from nucleo.config import (
    EXTENSOES_PERMITIDAS,
    MAX_UPLOAD_SIZE,
    PASTA_PUBLIC_CHATVRM,
    UPLOAD_CHUNK_SIZE,
)
from nucleo.logger import logger


router = APIRouter()


# ============================================================
# 📋 LISTAR
# ============================================================

@router.get("/api/arquivos")
async def listar_arquivos():

    modelos = []
    animacoes = []
    fundos = []

    try:
        for arquivo in os.listdir(PASTA_PUBLIC_CHATVRM):

            caminho = PASTA_PUBLIC_CHATVRM / arquivo

            if not caminho.is_file():
                continue

            nome_lower = arquivo.lower()

            if nome_lower.endswith(".vrm"):
                modelos.append(arquivo)

            elif nome_lower.endswith(".vrma"):
                animacoes.append(arquivo)

            elif nome_lower.endswith((".png", ".jpg", ".jpeg")):
                fundos.append(arquivo)

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
            detail="Erro ao listar arquivos."
        )


# ============================================================
# 📤 UPLOAD
# ============================================================

@router.post("/api/upload")
async def upload_arquivo(file: UploadFile = File(...)):

    nome_arquivo = Path(file.filename or "").name

    if not nome_arquivo:
        raise HTTPException(
            status_code=400,
            detail="Nome de arquivo inválido."
        )

    extensao = Path(nome_arquivo).suffix.lower()

    if extensao not in EXTENSOES_PERMITIDAS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tipo de arquivo não permitido. "
                "Use VRM, VRMA, PNG ou JPG."
            )
        )

    caminho_salvar = PASTA_PUBLIC_CHATVRM / nome_arquivo

    try:
        caminho_salvar.resolve().relative_to(
            PASTA_PUBLIC_CHATVRM.resolve()
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Caminho de arquivo inválido."
        )

    try:
        tamanho_total = 0
        conteudo = bytearray()

        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)

            if not chunk:
                break

            tamanho_total += len(chunk)

            if tamanho_total > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="Arquivo muito grande! Máximo: 10MB"
                )

            conteudo.extend(chunk)

        caminho_salvar.write_bytes(conteudo)

        logger.info(
            f"📥 Arquivo salvo: {nome_arquivo} "
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
            detail="Erro ao salvar arquivo."
        )