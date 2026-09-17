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
- ações (via bridge)
- acks

Faz o bootstrap inicial (define objetivo + inicia
autonomia) quando o bot conecta.

⚠️ CORREÇÃO (Bloco 0):
    O bootstrap agora:
      1. Verifica se já existe objetivo ativo
      2. SE tiver: envia definir_objetivo → espera 500ms →
         envia iniciar_autonomia
      3. SE não tiver: não faz nada (loop do LLM cria)

    E roda em BACKGROUND TASK, sem bloquear o loop
    de recebimento do WebSocket.

    Sem isso, o `asyncio.sleep(0.5)` bloqueava a
    corrotina e a conexão caía.
"""

import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from modulos.minecraft import minecraft_bridge
from modulos.minecraft_objetivos import minecraft_objetivos

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
# ⚙️ CONFIG LOCAL
# ============================================================

# Delay entre `definir_objetivo` e `iniciar_autonomia`.
DELAY_ENTRE_DEFINIR_E_INICIAR = 0.5  # segundos


# ============================================================
# 🚀 BOOTSTRAP
# ============================================================

async def _bootstrap_autonomia():
    """
    Envia objetivo inicial + inicia autonomia no bot.
    Roda em background, NÃO bloqueia o WebSocket.
    """

    if not MINECRAFT_AUTONOMIA_ATIVA:
        logger.info(
            "⛏🤖 Bootstrap ignorado: "
            "autonomia desativada por config."
        )
        return

    if not minecraft_bridge.conectado:
        logger.info(
            "⛏🤖 Bootstrap ignorado: "
            "Minecraft não conectado."
        )
        return

    try:
        objetivo_atual = minecraft_objetivos.obter_estado()

        # ── Não tem objetivo? Loop do LLM vai criar ──
        if not (objetivo_atual and objetivo_atual.get("existe")):
            logger.info(
                "⛏🤖 Nenhum objetivo ativo. "
                "Bootstrap ignorado. Loop do LLM vai definir."
            )
            return

        obj = objetivo_atual.get("objetivo") or {}

        logger.info(
            "⛏🤖 Bootstrap: enviando objetivo existente "
            "\"%s\" (%s)",
            obj.get("nome"),
            obj.get("id")
        )

        # ── Monta payload ──
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

        if (
            not obj.get("itens_necessarios")
            and obj.get("etapas")
        ):
            payload_objetivo["etapas"] = obj["etapas"]

        # ── 1. Envia definir_objetivo ──
        await minecraft_bridge.executar_acao(
            "definir_objetivo",
            acao_id=gerar_acao_id_minecraft(),
            **payload_objetivo
        )

        # ── 2. Delay pra evitar race condition ──
        await asyncio.sleep(DELAY_ENTRE_DEFINIR_E_INICIAR)

        # ── 3. Envia iniciar_autonomia ──
        await minecraft_bridge.executar_acao(
            "iniciar_autonomia",
            acao_id=gerar_acao_id_minecraft()
        )

        logger.info(
            "⛏🤖 Bootstrap completo: objetivo + autonomia "
            "enviados com sucesso."
        )

    except Exception as e:
        logger.error(
            f"❌ Erro no bootstrap da autonomia: {e}"
        )


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

    # ⚠️ FIX: bootstrap em BACKGROUND TASK.
    # Não bloqueia o `while True` que recebe mensagens.
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
                    minecraft_bridge.atualizar_estado(estado_real)
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

                if evento_nome.startswith("minecraft_autonomia_"):
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