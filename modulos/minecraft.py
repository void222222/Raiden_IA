"""
⛏ RAIDEN - MÓDULO MINECRAFT

Ponte entre a Raiden e o Minecraft.

Este módulo mantém o estado atual recebido
do Minecraft e é responsável pela comunicação
entre a Raiden e o Minecraft.
"""

import logging
from typing import Optional

from fastapi import WebSocket


logger = logging.getLogger("Minecraft")


class MinecraftBridge:

    def __init__(self):
        self.websocket: Optional[WebSocket] = None
        self.conectado: bool = False

        # Estado atual do Minecraft
        self.estado = {
            "posicao": None,
            "vida": None,
            "fome": None,
            "inventario": [],
        }

    async def conectar(self, websocket: WebSocket):
        self.websocket = websocket
        self.conectado = True

        logger.info("⛏ Minecraft conectado à Raiden.")

    async def desconectar(self):
        self.websocket = None
        self.conectado = False

        logger.info("⛏ Minecraft desconectado da Raiden.")

    async def enviar(self, mensagem: dict) -> bool:
        if not self.websocket:
            logger.warning(
                "⚠️ Tentativa de enviar mensagem sem Minecraft conectado."
            )
            return False

        try:
            await self.websocket.send_json(mensagem)
            return True

        except Exception as e:
            logger.error(
                f"❌ Erro ao enviar mensagem para o Minecraft: {e}"
            )
            return False

    def atualizar_estado(self, estado: dict):
        """
        Atualiza silenciosamente o estado conhecido do Minecraft.

        O estado é recebido continuamente, mas não é impresso
        no terminal a cada atualização.
        """

        if not isinstance(estado, dict):
            logger.warning(
                "⚠️ Estado recebido não é um objeto JSON."
            )
            return

        if "posicao" in estado:
            self.estado["posicao"] = estado["posicao"]

        if "vida" in estado:
            self.estado["vida"] = estado["vida"]

        if "fome" in estado:
            self.estado["fome"] = estado["fome"]

        if "inventario" in estado:
            self.estado["inventario"] = estado["inventario"]

    def obter_estado(self) -> dict:
        """
        Retorna o estado atual conhecido do Minecraft.
        """

        return {
            "posicao": self.estado["posicao"],
            "vida": self.estado["vida"],
            "fome": self.estado["fome"],
            "inventario": list(self.estado["inventario"]),
        }


minecraft_bridge = MinecraftBridge()