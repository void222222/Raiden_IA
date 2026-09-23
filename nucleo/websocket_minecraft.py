"""
🔌 WEBSOCKET MINECRAFT — RAIDEN

Handler do endpoint `/ws/minecraft`.

Recebe:
- estado do jogo
- resultado de ações
- chat do Minecraft
- eventos de telemetria
- eventos de autonomia

Envia:
- ações pontuais (via bridge)
- acks

⚠️ NOVO MODELO:
    O bot é autônomo. NÃO mandamos mais
    `definir_objetivo` nem `iniciar_autonomia`
    no bootstrap.

    A API só:
    - Confirma a conexão
    - Fica observando
    - Manda comandos pontuais SE o usuário pedir
"""

import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from modulos.minecraft import minecraft_bridge

from nucleo.config import MINECRAFT_AUTONOMIA_ATIVA
from nucleo.estado_minecraft import (
    registrar_evento_autonomia_minecraft,
    registrar_evento_minecraft,
    registrar_resultado_acao_minecraft,
)
from nucleo.logger import logger
from nucleo.utils import (
    _normalizar_acao_id,
    gerar_acao_id_minecraft,
)


# ============================================================
# 🚀 BOOTSTRAP
# ============================================================

async def _bootstrap_autonomia():
    """
    ⚠️ NOVO MODELO:
    O bot é autônomo. NÃO mandamos mais
    `definir_objetivo` nem `iniciar_autonomia`.

    A API só confirma a conexão e fica observando.
    """

    if not minecraft_bridge.conectado:
        return

    logger.info(
        "⛏🤖 Bot autônomo conectado. "
        "API em modo observador."
    )

    # Nada a fazer. O bot já está rodando sozinho.


# ============================================================
# 🔌 HANDLER PRINCIPAL
# ============================================================

async def handler_websocket_minecraft(
    websocket: WebSocket
):

    await websocket.accept()

    await minecraft_bridge.conectar(websocket)

    logger.info(
        "⛏ Conexão Minecraft estabelecida."
    )

    # Confirma conexão
    await minecraft_bridge.enviar({
        "tipo": "conexao",
        "status": "ok",
        "mensagem": "Minecraft conectado à Raiden."
    })

    # Bootstrap em background task (não bloqueia)
    asyncio.create_task(_bootstrap_autonomia())

    try:

        while True:

            mensagem = await websocket.receive_json()

            if not isinstance(mensagem, dict):
                logger.warning(
                    "⚠️ Minecraft enviou mensagem inválida."
                )
                await minecraft_bridge.enviar({
                    "tipo": "erro",
                    "mensagem":
                        "A mensagem precisa ser um objeto JSON."
                })
                continue

            tipo = mensagem.get("tipo", "desconhecido")

            # =================================================
            # 🚫 ACK
            # =================================================

            if tipo == "ack":
                continue

            # =================================================
            # 🏓 PING
            # =================================================

            if tipo == "ping":
                await minecraft_bridge.enviar({
                    "tipo": "pong",
                    "timestamp": mensagem.get("timestamp")
                })
                continue

            # =================================================
            # 🌍 ESTADO
            # =================================================

            if tipo == "estado":

                estado_real = mensagem.get("estado")

                if isinstance(estado_real, dict):
                    minecraft_bridge.atualizar_estado(
                        estado_real
                    )
                else:
                    logger.warning(
                        "⚠️ Mensagem de estado sem "
                        "chave 'estado' válida."
                    )

                await minecraft_bridge.enviar({
                    "tipo": "ack",
                    "origem": "raiden",
                    "evento": "estado_recebido"
                })
                continue

            # =================================================
            # 🎮 RESULTADO DE AÇÃO
            # =================================================

            if tipo == "minecraft_acao_resultado":

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
                            "⛏ Resultado de ação da "
                            "autonomia (sem acao_id): %s",
                            mensagem.get("acao")
                        )
                    else:
                        logger.warning(
                            "⚠️ Resultado de ação Minecraft "
                            "sem acao_id e origem != autonomia."
                        )

                else:
                    mensagem["acao_id"] = acao_id_normalizado

                minecraft_bridge.registrar_resultado_acao(
                    mensagem
                )
                registrar_resultado_acao_minecraft(mensagem)
                registrar_evento_minecraft({
                    "tipo": "minecraft_acao_resultado",
                    **mensagem
                })

                logger.info(
                    "⛏ Resultado da ação: %s",
                    mensagem
                )
                continue

            # =================================================
            # 💬 CHAT DO MINECRAFT
            # =================================================

            if tipo == "minecraft_chat":

                minecraft_bridge.registrar_chat(mensagem)
                registrar_evento_minecraft(mensagem)

                logger.info(
                    "💬 Minecraft: "
                    f"{mensagem.get('usuario')}: "
                    f"{mensagem.get('mensagem')}"
                )
                continue

            # =================================================
            # 📡 EVENTOS
            # =================================================

            if tipo == "minecraft_evento":

                evento_nome = str(
                    mensagem.get("evento") or ""
                )

                if evento_nome.startswith(
                    "minecraft_autonomia_"
                ):
                    registrar_evento_autonomia_minecraft(
                        mensagem
                    )
                else:
                    registrar_evento_minecraft(mensagem)

                continue

            # =================================================
            # ❓ DESCONHECIDO
            # =================================================

            logger.info(
                "⛏ Minecraft → Raiden | "
                f"tipo={tipo} | dados={mensagem}"
            )

            await minecraft_bridge.enviar({
                "tipo": "ack",
                "origem": "raiden",
                "evento": "mensagem_recebida",
                "tipo_recebido": tipo
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
        await minecraft_bridge.desconectar()
        logger.info(
            "⛏ Conexão Minecraft finalizada."
        )