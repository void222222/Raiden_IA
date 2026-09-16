"""
⛏ ROTAS — MINECRAFT HTTP

Endpoints HTTP de controle do Minecraft.
O WebSocket /ws/minecraft fica no api_raiden.py.
"""

from fastapi import APIRouter, HTTPException

from modulos.minecraft import minecraft_bridge
from modulos.minecraft_objetivos import minecraft_objetivos

from nucleo.acoes_minecraft import (
    executar_decisao_minecraft,  # não usado aqui, mas mantido pra simetria
)
from nucleo.config import MINECRAFT_AUTONOMIA_ATIVA
from nucleo.estado_minecraft import (
    existe_acao_pendente,
    obter_acao_pendente_id,
    obter_estado_autonomia_minecraft,
    obter_objetivo_minecraft,
    obter_resultado_acao_minecraft,
    obter_ultimo_resultado_acao_minecraft,
    obter_ultimos_eventos_minecraft,
    marcar_acao_pendente,
)
from nucleo.llm_minecraft import validar_acao_minecraft
from nucleo.loop_minecraft import _autonomia_esta_rodando
from nucleo.requests import (
    MinecraftAcaoRequest,
    MinecraftObjetivoRequest,
    MinecraftProgressoRequest,
)
from nucleo.utils import (
    _normalizar_acao_id,
    gerar_acao_id_minecraft,
)


router = APIRouter()


# ============================================================
# 📊 STATUS
# ============================================================

@router.get("/api/minecraft/status")
async def minecraft_status():

    return {
        "conectado": minecraft_bridge.conectado,

        "autonomia": MINECRAFT_AUTONOMIA_ATIVA,
        "autonomia_habilitada": MINECRAFT_AUTONOMIA_ATIVA,
        "autonomia_rodando": _autonomia_esta_rodando(),

        "estado": minecraft_bridge.obter_estado(),
        "objetivo": obter_objetivo_minecraft(),
        "autonomia_js": obter_estado_autonomia_minecraft(),

        "ultima_acao": minecraft_bridge.obter_ultima_acao(),
        "ultimo_resultado_acao":
            obter_ultimo_resultado_acao_minecraft(),
        "ultimo_chat":
            minecraft_bridge.obter_ultima_mensagem_chat(),

        "acao_pendente": existe_acao_pendente(),
        "acao_pendente_id": obter_acao_pendente_id(),

        "ultima_acao_id": _normalizar_acao_id(
            (
                minecraft_bridge.obter_ultima_acao()
                or {}
            ).get("acao_id")
        ),

        "eventos_recentes": obter_ultimos_eventos_minecraft(),
    }


# ============================================================
# 🎯 OBJETIVO
# ============================================================

@router.get("/api/minecraft/objetivo")
async def minecraft_objetivo():
    return obter_objetivo_minecraft()


@router.post("/api/minecraft/objetivo")
async def definir_objetivo_minecraft(
    objetivo: MinecraftObjetivoRequest
):

    resultado = minecraft_objetivos.definir_objetivo(
        id=objetivo.id,
        nome=objetivo.nome,
        descricao=objetivo.descricao,
        etapas=objetivo.etapas,
        itens_necessarios=objetivo.itens_necessarios,
        construir=objetivo.construir,
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


@router.post("/api/minecraft/objetivo/progresso")
async def atualizar_progresso_minecraft(
    progresso: MinecraftProgressoRequest
):

    minecraft_objetivos.atualizar_progresso(
        progresso.progresso
    )

    return {
        "status": "ok",
        "objetivo": obter_objetivo_minecraft()
    }


@router.post("/api/minecraft/objetivo/concluir")
async def concluir_objetivo_minecraft():

    minecraft_objetivos.concluir_objetivo()

    return {
        "status": "ok",
        "objetivo": obter_objetivo_minecraft()
    }


@router.delete("/api/minecraft/objetivo")
async def limpar_objetivo_minecraft():

    minecraft_objetivos.limpar_objetivo()

    return {
        "status": "ok",
        "objetivo": obter_objetivo_minecraft()
    }


# ============================================================
# 🎮 AÇÃO MANUAL
# ============================================================

@router.post("/api/minecraft/acao")
async def minecraft_acao(request: MinecraftAcaoRequest):

    if not minecraft_bridge.conectado:
        raise HTTPException(
            status_code=503,
            detail="Minecraft não está conectado."
        )

    decisao = {
        "acao": request.acao,
        **request.parametros
    }

    decisao_validada = validar_acao_minecraft(decisao)

    if decisao_validada is None:
        raise HTTPException(
            status_code=400,
            detail="Ação Minecraft inválida."
        )

    acao = decisao_validada["acao"]

    parametros = {
        chave: valor
        for chave, valor in decisao_validada.items()
        if chave != "acao"
    }

    acao_id = gerar_acao_id_minecraft()

    sucesso_envio = await minecraft_bridge.executar_acao(
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
        "status": "ok" if sucesso_envio else "erro",
        "acao_id": acao_id,
        "acao": decisao_validada,
        "enviada": sucesso_envio,
        "confirmada": False,
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
# 📥 CONSULTAR RESULTADO DE AÇÃO
# ============================================================

@router.get("/api/minecraft/acao/{acao_id}")
async def consultar_acao_minecraft(acao_id: str):

    acao_id = _normalizar_acao_id(acao_id)

    if not acao_id:
        raise HTTPException(
            status_code=400,
            detail="acao_id obrigatório."
        )

    resultado = obter_resultado_acao_minecraft(acao_id)

    if resultado is None:
        raise HTTPException(
            status_code=404,
            detail="Nenhum resultado registrado para esta ação."
        )

    return {
        "status": "ok",
        "acao_id": acao_id,
        "resultado": resultado
    }