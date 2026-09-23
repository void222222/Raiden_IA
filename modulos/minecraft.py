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

⚠️ NOVO MODELO (The Sims):
    O bot novo (bot.js) é 100% autônomo. Ele manda
    o estado a cada 1s, incluindo:
      - posicao, vida, fome, inventario (padrão)
      - casas (coordenadas de casas construídas)
      - obra (casa sendo construída agora)
      - ativo (pausado ou não)

    A API só observa e manda comandos pontuais.

Contrato de ação:

    A API gera um `acao_id` e envia junto com a ação.
    O Minecraft devolve o MESMO `acao_id` no resultado.

    Isso permite saber exatamente qual execução
    terminou, especialmente quando várias ações
    são disparadas em sequência.

    Quando a API NÃO informa um `acao_id`,
    o bridge gera um UUID automaticamente.
    Isso garante que `acao_pendente` sempre
    pode ser limpa quando o resultado chega.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

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

            # ⚠️ NOVOS CAMPOS (bot The Sims)
            "casas": [],
            "obra": None,
            "ativo": True,

        }

        # ====================================================
        # ⚔️ ÚLTIMA AÇÃO
        # ====================================================

        self.ultima_acao: Optional[Dict[str, Any]] = None

        # ====================================================
        # 🆔 CONTROLE DE AÇÃO
        # ====================================================

        self.ultima_acao_id: Optional[str] = None

        self.acao_pendente: Optional[
            Dict[str, Any]
        ] = None

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
        acao_id: Optional[str] = None,
        **parametros
    ) -> bool:
        """
        Envia uma ação estruturada para o Minecraft.

        O `acao_id` identifica exclusivamente essa execução,
        permitindo relacionar a ação enviada ao resultado
        posteriormente recebido do Minecraft.

        Se `acao_id` não for informado, um UUID é gerado
        automaticamente.

        Os parâmetros específicos da ação são agrupados
        dentro da chave `"parametros"`, mantendo o
        protocolo alinhado com o `bot.js`.
        """

        if acao_id is None:

            acao_id = str(uuid.uuid4())

        mensagem = {

            "tipo": "minecraft_acao",

            "acao": acao,

            "acao_id": acao_id,

            "parametros": dict(parametros)

        }

        logger.info(
            f"🎮 Enviando ação para Minecraft: "
            f"{mensagem}"
        )

        enviada = await self.enviar(
            mensagem
        )

        if not enviada:

            self.acao_pendente = None

            return False

        self.ultima_acao_id = acao_id

        self.acao_pendente = {

            "acao_id": acao_id,

            "acao": acao,

            "parametros": dict(parametros),

            "status": "pendente",

        }

        return True

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
    # 🛑 CONTROLE DA AUTONOMIA
    # ========================================================

    async def pausar(self) -> bool:
        """Pausa o loop de decisão do bot."""

        return await self.executar_acao(
            "pausar"
        )

    async def continuar(self) -> bool:
        """Retoma o loop de decisão do bot."""

        return await self.executar_acao(
            "continuar"
        )

    async def ir_para(
        self,
        x: float,
        y: float,
        z: float
    ) -> bool:
        """Manda o bot andar até uma coordenada."""

        return await self.executar_acao(
            "ir_para",
            x=x,
            y=y,
            z=z
        )

    async def construir_casa(
        self,
        x: float,
        y: float,
        z: float
    ) -> bool:
        """Manda o bot construir uma casa na coordenada."""

        return await self.executar_acao(
            "construir_casa",
            x=x,
            y=y,
            z=z
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
    # 🧱 COLOCAR BLOCO
    # ========================================================

    async def colocar(
        self,
        nomeItem: str,
        x: float,
        y: float,
        z: float
    ) -> bool:

        return await self.executar_acao(
            "colocar",
            nomeItem=nomeItem,
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

        NOTA:
        O bot.js envia alguns campos com nomes
        diferentes (camelCase vs snake_case).
        Aceitamos os dois.
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
        # Helper: lê do estado aceitando múltiplas chaves
        # ====================================================

        def _ler(*chaves):
            for chave in chaves:
                if chave in estado:
                    return estado[chave]
            return None

        # ── POSIÇÃO ──
        valor = _ler("posicao")
        if valor is not None:
            self.estado["posicao"] = valor

        # ── ROTAÇÃO ──
        valor = _ler("rotacao")
        if valor is not None:
            self.estado["rotacao"] = valor

        # ── VELOCIDADE ──
        valor = _ler("velocidade")
        if valor is not None:
            self.estado["velocidade"] = valor

        # ── CHÃO ──
        valor = _ler("no_chao", "noChao")
        if valor is not None:
            self.estado["no_chao"] = valor

        # ── VIDA ──
        valor = _ler("vida")
        if valor is not None:
            self.estado["vida"] = valor

        # ── FOME ──
        valor = _ler("fome")
        if valor is not None:
            self.estado["fome"] = valor

        # ── OXIGÊNIO ──
        valor = _ler("oxigenio", "oxygen")
        if valor is not None:
            self.estado["oxigenio"] = valor

        # ── EXPERIÊNCIA ──
        exp_objeto = _ler("experiencia", "experience")
        if isinstance(exp_objeto, dict):
            nivel = exp_objeto.get("nivel")
            if nivel is not None:
                self.estado["nivel_experiencia"] = nivel
        else:
            valor = _ler("nivel_experiencia")
            if valor is not None:
                self.estado["nivel_experiencia"] = valor

        # ── ITEM NA MÃO ──
        valor = _ler("item_na_mao", "itemNaMao")
        if valor is not None:
            self.estado["item_na_mao"] = valor

        # ── INVENTÁRIO ──
        inventario = _ler("inventario")
        if isinstance(inventario, list):
            self.estado["inventario"] = inventario

        # ── ENTIDADES ──
        entidades = _ler("entidades")
        if isinstance(entidades, list):
            self.estado["entidades"] = entidades

        # ══════════════════════════════════════════════════
        # ⚠️ CAMPOS NOVOS DO BOT THE SIMS
        # ══════════════════════════════════════════════════

        # ── CASAS CONSTRUÍDAS ──
        casas = _ler("casas")
        if isinstance(casas, list):
            self.estado["casas"] = casas

        # ── OBRA EM ANDAMENTO ──
        obra = _ler("obra")
        if obra is not None:
            self.estado["obra"] = obra

        # ── ATIVO ──
        ativo = _ler("ativo")
        if ativo is not None:
            self.estado["ativo"] = bool(ativo)

    # ========================================================
    # ⚔️ RESULTADO DE AÇÃO
    # ========================================================

    def registrar_resultado_acao(
        self,
        resultado: dict
    ):
        """
        Guarda o resultado da última ação executada
        pelo Minecraft e atualiza o controle da ação
        pendente.
        """

        if not isinstance(
            resultado,
            dict
        ):
            return

        self.ultima_acao = dict(
            resultado
        )

        acao_id = resultado.get(
            "acao_id"
        )

        if acao_id is not None:
            self.ultima_acao_id = str(
                acao_id
            )

        if self.acao_pendente is not None:

            id_pendente = (
                self.acao_pendente.get(
                    "acao_id"
                )
            )

            if (
                acao_id is not None
                and str(acao_id)
                == str(id_pendente)
            ):
                self.acao_pendente = None

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
        """Guarda a última mensagem do chat."""

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

            # ⚠️ NOVOS
            "casas":
                list(
                    self.estado["casas"]
                ),

            "obra":
                self.estado["obra"],

            "ativo":
                self.estado["ativo"],

        }

    # ========================================================
    # 🏠 OBTER CASAS
    # ========================================================

    def obter_casas(self) -> List[dict]:
        """Retorna lista de casas construídas."""

        return list(self.estado.get("casas", []))

    def obter_obra_atual(self) -> Optional[dict]:
        """Retorna a obra em andamento (ou None)."""

        return self.estado.get("obra")

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
    # 🆔 OBTER ID DA ÚLTIMA AÇÃO
    # ========================================================

    def obter_ultima_acao_id(
        self
    ) -> Optional[str]:

        return self.ultima_acao_id

    # ========================================================
    # ⏳ OBTER AÇÃO PENDENTE
    # ========================================================

    def obter_acao_pendente(
        self
    ) -> Optional[dict]:

        if self.acao_pendente is None:
            return None

        return dict(
            self.acao_pendente
        )

    # ========================================================
    # 💬 OBTER ÚLTIMO CHAT
    # ========================================================

    def obter_ultima_mensagem_chat(
        self
    ) -> Optional[dict]:

        if self.ultima_mensagem_chat is None:
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

            "casas":
                self.obter_casas(),

            "obra":
                self.obter_obra_atual(),

            "ultima_acao":
                self.obter_ultima_acao(),

            "ultima_acao_id":
                self.obter_ultima_acao_id(),

            "acao_pendente":
                self.obter_acao_pendente(),

            "ultima_mensagem_chat":
                self.obter_ultima_mensagem_chat(),

        }


# ============================================================
# 🌍 INSTÂNCIA GLOBAL
# ============================================================

minecraft_bridge = MinecraftBridge()