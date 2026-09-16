"""
🎮 AÇÕES MINECRAFT — RAIDEN

Executa decisões estratégicas do cérebro no Minecraft.

Fluxo:
1. Recebe uma decisão do LLM (dict)
2. Valida (via llm_minecraft.validar_acao_minecraft)
3. Envia pro bridge (WebSocket do bot)
4. Marca ação pendente (se for micro-ação)

Ações de CONTROLE (definir_objetivo, iniciar_autonomia,
etc) NÃO entram como pendentes — são síncronas do lado
do bot.

Micro-ações (andar, quebrar, colocar, etc) entram
como pendentes e aguardam o resultado real chegar
via WebSocket.
"""

from typing import Optional

from modulos.minecraft import minecraft_bridge

from nucleo.estado_minecraft import marcar_acao_pendente
from nucleo.llm_minecraft import validar_acao_minecraft
from nucleo.logger import logger
from nucleo.utils import gerar_acao_id_minecraft


# ============================================================
# 🚦 AÇÕES DE CONTROLE (não ficam pendentes)
# ============================================================

ACOES_CONTROLE = {
    "definir_objetivo",
    "iniciar_autonomia",
    "parar_autonomia",
    "reiniciar_autonomia",
}


# ============================================================
# 🎮 EXECUTAR DECISÃO
# ============================================================

async def executar_decisao_minecraft(
    decisao: dict
) -> Optional[str]:
    """
    Executa uma decisão do LLM no Minecraft.

    Retorna:
      - `acao_id` (str) se enviou
      - `None` se rejeitou ou não conectou
    """

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

    if not minecraft_bridge.conectado:
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
        sucesso = await minecraft_bridge.executar_acao(
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

        # Controle não fica pendente.
        if acao in ACOES_CONTROLE:
            return acao_id

        marcar_acao_pendente(acao_id)
        return acao_id

    except Exception as e:
        logger.error(
            f"❌ Erro executando ação Minecraft: {e}"
        )
        return None