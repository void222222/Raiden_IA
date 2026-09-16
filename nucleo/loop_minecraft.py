"""
🔁 LOOP MINECRAFT — RAIDEN

Loop estratégico que pensa no Minecraft.

Fluxo:
1. Espera o evento `minecraft_autonomia_evento`
2. Se bridge desconectado → dorme
3. Se tem ação pendente → dorme
4. Lê estado, chama o LLM, executa decisão
5. Limpa flag de objetivo concluído (se aplicável)
6. Dorme `MINECRAFT_INTERVALO_DECISAO`

A tarefa assíncrona vive aqui como variável de módulo.
"""

import asyncio

from typing import Optional

from modulos.minecraft import minecraft_bridge

from nucleo.acoes_minecraft import executar_decisao_minecraft
from nucleo.config import MINECRAFT_INTERVALO_DECISAO
from nucleo.estado_minecraft import (
    existe_acao_pendente,
    limpar_objetivo_concluido,
    obter_estado_minecraft,
)
from nucleo.filas import minecraft_autonomia_evento
from nucleo.llm_minecraft import pensar_acao_minecraft
from nucleo.logger import logger


# ============================================================
# 🎯 HANDLE DA TASK
# ============================================================

minecraft_tarefa_autonomia: Optional[asyncio.Task] = None


# ============================================================
# 🎯 ESTADO
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
# 🔁 LOOP
# ============================================================

async def loop_autonomia_minecraft():
    """
    Loop estratégico:

        percepção
          ↓
        estado da autonomia JS
          ↓
        Ollama decide estratégia
          ↓
        envia (ou não) comando
          ↓
        dorme MINECRAFT_INTERVALO_DECISAO

    O loop NÃO tenta micro-gerenciar cada ação.
    """

    logger.info(
        "⛏🤖 Loop estratégico Minecraft iniciado."
    )

    while True:

        try:
            await minecraft_autonomia_evento.wait()

            if not minecraft_bridge.conectado:
                await asyncio.sleep(2)
                continue

            if existe_acao_pendente():
                await asyncio.sleep(1)
                continue

            estado = obter_estado_minecraft()

            decisao = await pensar_acao_minecraft(estado)

            if decisao:
                await executar_decisao_minecraft(decisao)

                # ⚠️ Se decidiu definir/iniciar objetivo,
                # limpa a flag de conclusão (já foi tratada)
                if decisao.get("acao") in {
                    "definir_objetivo",
                    "iniciar_autonomia",
                    "reiniciar_autonomia",
                }:
                    limpar_objetivo_concluido()

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
# ▶️ INICIAR
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

    from nucleo.config import MINECRAFT_AUTONOMIA_ATIVA

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
# 🛑 PARAR
# ============================================================

async def parar_autonomia_minecraft():

    global minecraft_tarefa_autonomia

    minecraft_autonomia_evento.clear()

    if minecraft_tarefa_autonomia:

        minecraft_tarefa_autonomia.cancel()

        try:
            await minecraft_tarefa_autonomia

        except asyncio.CancelledError:
            pass

        minecraft_tarefa_autonomia = None

    logger.info(
        "⛏🤖 Autonomia Minecraft parada."
    )