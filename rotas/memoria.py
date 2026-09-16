"""
🧠 ROTAS — MEMÓRIA PESSOAL

Endpoints de memória pessoal da Raiden.
"""

from fastapi import APIRouter, HTTPException

from modulos.web_memoria import (
    aprender_memoria_pessoal,
    esquecer_memoria_pessoal,
    listar_memorias_pessoais,
)

from nucleo.requests import (
    MemoriaRequest,
    EsquecerMemoriaRequest,
)


router = APIRouter()


# ============================================================
# 📚 APRENDER
# ============================================================

@router.post("/api/painel/memoria/aprender")
async def aprender_memoria(req: MemoriaRequest):

    termo = req.termo.strip()
    conteudo = req.conteudo.strip()
    categoria = req.categoria.strip() or "geral"

    if not termo or not conteudo:
        raise HTTPException(
            status_code=400,
            detail="Termo e conteúdo são obrigatórios."
        )

    sucesso = aprender_memoria_pessoal(
        termo=termo,
        conteudo=conteudo,
        categoria=categoria
    )

    if not sucesso:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível salvar a memória."
        )

    return {
        "status": "ok",
        "mensagem": "Memória aprendida.",
        "termo": termo,
        "categoria": categoria
    }


# ============================================================
# 📋 LISTAR
# ============================================================

@router.get("/api/painel/memoria")
async def listar_memoria():

    return {
        "memorias": listar_memorias_pessoais()
    }


# ============================================================
# 🗑️ ESQUECER
# ============================================================

@router.delete("/api/painel/memoria")
async def esquecer_memoria(req: EsquecerMemoriaRequest):

    termo = req.termo.strip()

    if not termo:
        raise HTTPException(
            status_code=400,
            detail="Termo obrigatório."
        )

    sucesso = esquecer_memoria_pessoal(
        termo=termo,
        categoria=req.categoria
    )

    if not sucesso:
        raise HTTPException(
            status_code=404,
            detail="Memória não encontrada."
        )

    return {
        "status": "ok",
        "mensagem": "Memória esquecida."
    }