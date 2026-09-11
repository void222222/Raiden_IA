"""
⛏ RAIDEN - MÓDULO MINECRAFT

Ponte entre a Raiden e o Minecraft.

Responsabilidades:

- manter a conexão WebSocket com o Minecraft
- armazenar o estado atual do jogo
- enviar comandos para o Minecraft
- receber resultados de ações
- receber mensagens de chat
- controlar estado de conexão
- fornecer uma interface simples para a API
"""

import logging
from typing import Any, Dict, Optional

from fastapi import WebSocket


logger = logging.getLogger("Minecraft")


class MinecraftBridge:

    def __init__(self):

        # ====================================================
        # 🔌 CONEXÃO
        # ====================================================

        self.websocket: Optional[WebSocket] = None

        self.conectado: bool = False


        # ====================================================
        # 🌍 ESTADO DO MINECRAFT
        # ====================================================

        self.estado: Dict[str, Any] = {

            "posicao": None,

            "rotacao": None,

            "velocidade": None,

            "no_chao": None,

            "vida": None,

            "fome": None,

            "oxigenio": None,

            "nivel_experiencia": 0,

            "item_na_mao": None,

            "inventario": [],

            "entidades": [],

        }


        # ====================================================
        # ⚔️ ÚLTIMA AÇÃO
        # ====================================================

        self.ultima_acao: Optional[Dict[str, Any]] = None


        # ====================================================
        # 💬 ÚLTIMA MENSAGEM DO CHAT
        # ====================================================

        self.ultima_mensagem_chat: Optional[
            Dict[str, Any]
        ] = None


    # ========================================================
    # 🔌 CONECTAR
    # ========================================================

    async def conectar(
        self,
        websocket: WebSocket
    ):

        self.websocket = websocket

        self.conectado = True

        logger.info(
            "⛏ Minecraft conectado à Raiden."
        )


    # ========================================================
    # 🔌 DESCONECTAR
    # ========================================================

    async def desconectar(self):

        self.websocket = None

        self.conectado = False

        logger.info(
            "⛏ Minecraft desconectado da Raiden."
        )


    # ========================================================
    # 📡 ENVIAR MENSAGEM
    # ========================================================

    async def enviar(
        self,
        mensagem: dict
    ) -> bool:

        if not self.websocket:

            logger.warning(
                "⚠️ Tentativa de enviar mensagem "
                "sem Minecraft conectado."
            )

            return False


        try:

            await self.websocket.send_json(
                mensagem
            )

            return True


        except Exception as erro:

            logger.error(
                f"❌ Erro ao enviar mensagem "
                f"para o Minecraft: {erro}"
            )

            return False


    # ========================================================
    # 🎮 ENVIAR AÇÃO
    # ========================================================

    async def executar_acao(
        self,
        acao: str,
        **parametros
    ) -> bool:
        """
        Envia uma ação estruturada para o Minecraft.

        Exemplo:

        await minecraft_bridge.executar_acao(
            "andar",
            direcao="frente",
            duracao=2
        )

        Isso gera:

        {
            "tipo": "minecraft_acao",
            "acao": "andar",
            "direcao": "frente",
            "duracao": 2
        }
        """

        mensagem = {

            "tipo": "minecraft_acao",

            "acao": acao,

            **parametros

        }


        logger.info(
            f"🎮 Enviando ação para Minecraft: "
            f"{mensagem}"
        )


        return await self.enviar(
            mensagem
        )


    # ========================================================
    # 🚶 MOVIMENTO
    # ========================================================

    async def andar(
        self,
        direcao: str = "frente",
        duracao: float = 1
    ) -> bool:

        return await self.executar_acao(
            "andar",
            direcao=direcao,
            duracao=duracao
        )


    async def pular(self) -> bool:

        return await self.executar_acao(
            "pular"
        )


    async def parar(self) -> bool:

        return await self.executar_acao(
            "parar"
        )


    # ========================================================
    # 👀 OLHAR
    # ========================================================

    async def olhar(
        self,
        **parametros
    ) -> bool:

        return await self.executar_acao(
            "olhar",
            **parametros
        )


    # ========================================================
    # ⚔️ COMBATE
    # ========================================================

    async def atacar(
        self,
        nome: Optional[str] = None,
        entidade_id: Optional[int] = None
    ) -> bool:

        parametros = {}


        if nome is not None:

            parametros["nome"] = nome


        if entidade_id is not None:

            parametros["id"] = entidade_id


        return await self.executar_acao(
            "atacar",
            **parametros
        )


    # ========================================================
    # ⛏️ QUEBRAR BLOCO
    # ========================================================

    async def quebrar(
        self,
        x: float,
        y: float,
        z: float
    ) -> bool:

        return await self.executar_acao(
            "quebrar",
            x=x,
            y=y,
            z=z
        )


    # ========================================================
    # 🎒 EQUIPAR ITEM
    # ========================================================

    async def equipar(
        self,
        nome: str,
        destino: str = "hand"
    ) -> bool:

        return await self.executar_acao(
            "equipar",
            nome=nome,
            destino=destino
        )


    # ========================================================
    # 🖐️ USAR ITEM
    # ========================================================

    async def usar(self) -> bool:

        return await self.executar_acao(
            "usar"
        )


    # ========================================================
    # 🗑️ DROPAR ITEM
    # ========================================================

    async def dropar(
        self,
        nome: str,
        quantidade: Optional[int] = None
    ) -> bool:

        parametros = {
            "nome": nome
        }


        if quantidade is not None:

            parametros[
                "quantidade"
            ] = quantidade


        return await self.executar_acao(
            "dropar",
            **parametros
        )


    # ========================================================
    # 💬 CHAT
    # ========================================================

    async def falar(
        self,
        mensagem: str
    ) -> bool:

        return await self.executar_acao(
            "chat",
            mensagem=mensagem
        )


    # ========================================================
    # 📡 ATUALIZAR ESTADO
    # ========================================================

    def atualizar_estado(
        self,
        estado: dict
    ):
        """
        Atualiza silenciosamente o estado conhecido
        do Minecraft.

        O Minecraft envia esse estado continuamente.
        """

        if not isinstance(
            estado,
            dict
        ):

            logger.warning(
                "⚠️ Estado recebido não é "
                "um objeto JSON."
            )

            return


        # ====================================================
        # 📍 POSIÇÃO
        # ====================================================

        if "posicao" in estado:

            self.estado[
                "posicao"
            ] = estado["posicao"]


        # ====================================================
        # 👀 ROTAÇÃO
        # ====================================================

        if "rotacao" in estado:

            self.estado[
                "rotacao"
            ] = estado["rotacao"]


        # ====================================================
        # 🏃 VELOCIDADE
        # ====================================================

        if "velocidade" in estado:

            self.estado[
                "velocidade"
            ] = estado["velocidade"]


        # ====================================================
        # 🧍 CHÃO
        # ====================================================

        if "no_chao" in estado:

            self.estado[
                "no_chao"
            ] = estado["no_chao"]


        # ====================================================
        # ❤️ VIDA
        # ====================================================

        if "vida" in estado:

            self.estado[
                "vida"
            ] = estado["vida"]


        # ====================================================
        # 🍗 FOME
        # ====================================================

        if "fome" in estado:

            self.estado[
                "fome"
            ] = estado["fome"]


        # ====================================================
        # 🫁 OXIGÊNIO
        # ====================================================

        if "oxigenio" in estado:

            self.estado[
                "oxigenio"
            ] = estado["oxigenio"]


        # ====================================================
        # ⭐ EXPERIÊNCIA
        # ====================================================

        if "nivel_experiencia" in estado:

            self.estado[
                "nivel_experiencia"
            ] = estado[
                "nivel_experiencia"
            ]


        # ====================================================
        # 🖐️ ITEM NA MÃO
        # ====================================================

        if "item_na_mao" in estado:

            self.estado[
                "item_na_mao"
            ] = estado["item_na_mao"]


        # ====================================================
        # 🎒 INVENTÁRIO
        # ====================================================

        if "inventario" in estado:

            inventario = estado[
                "inventario"
            ]

            if isinstance(
                inventario,
                list
            ):

                self.estado[
                    "inventario"
                ] = inventario


        # ====================================================
        # 👾 ENTIDADES
        # ====================================================

        if "entidades" in estado:

            entidades = estado[
                "entidades"
            ]

            if isinstance(
                entidades,
                list
            ):

                self.estado[
                    "entidades"
                ] = entidades


    # ========================================================
    # ⚔️ RESULTADO DE AÇÃO
    # ========================================================

    def registrar_resultado_acao(
        self,
        resultado: dict
    ):
        """
        Guarda o resultado da última ação executada
        pelo Minecraft.
        """

        if not isinstance(
            resultado,
            dict
        ):

            return


        self.ultima_acao = resultado


        logger.info(
            f"🎮 Resultado da ação Minecraft: "
            f"{resultado}"
        )


    # ========================================================
    # 💬 RECEBER CHAT
    # ========================================================

    def registrar_chat(
        self,
        mensagem: dict
    ):
        """
        Guarda a última mensagem recebida
        do chat do Minecraft.
        """

        if not isinstance(
            mensagem,
            dict
        ):

            return


        self.ultima_mensagem_chat = mensagem


        logger.info(
            f"💬 Minecraft: {mensagem}"
        )


    # ========================================================
    # 🌍 OBTER ESTADO
    # ========================================================

    def obter_estado(self) -> dict:
        """
        Retorna uma cópia do estado atual
        conhecido do Minecraft.
        """

        return {

            "posicao":
                self.estado["posicao"],

            "rotacao":
                self.estado["rotacao"],

            "velocidade":
                self.estado["velocidade"],

            "no_chao":
                self.estado["no_chao"],

            "vida":
                self.estado["vida"],

            "fome":
                self.estado["fome"],

            "oxigenio":
                self.estado["oxigenio"],

            "nivel_experiencia":
                self.estado[
                    "nivel_experiencia"
                ],

            "item_na_mao":
                self.estado[
                    "item_na_mao"
                ],

            "inventario":
                list(
                    self.estado[
                        "inventario"
                    ]
                ),

            "entidades":
                list(
                    self.estado[
                        "entidades"
                    ]
                ),

        }


    # ========================================================
    # 🎮 OBTER ÚLTIMA AÇÃO
    # ========================================================

    def obter_ultima_acao(
        self
    ) -> Optional[dict]:

        if self.ultima_acao is None:

            return None


        return dict(
            self.ultima_acao
        )


    # ========================================================
    # 💬 OBTER ÚLTIMO CHAT
    # ========================================================

    def obter_ultima_mensagem_chat(
        self
    ) -> Optional[dict]:

        if (
            self.ultima_mensagem_chat
            is None
        ):

            return None


        return dict(
            self.ultima_mensagem_chat
        )


    # ========================================================
    # 📊 RESUMO PARA A RAÍDEN
    # ========================================================

    def obter_contexto(
        self
    ) -> dict:
        """
        Retorna as informações principais que podem
        ser utilizadas pelo cérebro da Raiden.
        """

        return {

            "conectado":
                self.conectado,

            "estado":
                self.obter_estado(),

            "ultima_acao":
                self.obter_ultima_acao(),

            "ultima_mensagem_chat":
                self.obter_ultima_mensagem_chat(),

        }


# ============================================================
# 🌍 INSTÂNCIA GLOBAL
# ============================================================

minecraft_bridge = MinecraftBridge()