"""
🎯 OBJETIVOS DO MINECRAFT — RAIDEN

Gerencia o objetivo atual da Raiden no Minecraft.
Não executa ações.
Não conversa com o Minecraft.
Apenas controla:
- objetivo atual
- descrição
- progresso
- conclusão
- contexto para o cérebro

FORMATOS SUPORTADOS:

1. Formato declarativo (novo):
   definir_objetivo(
       id="picareta_pedra",
       nome="Fazer uma picareta de pedra",
       descricao="...",
       itens_necessarios={"stone_pickaxe": 1}
   )

2. Formato por etapas (antigo):
   definir_objetivo(
       id="primeiro_abrigo",
       nome="Construir um abrigo",
       descricao="...",
       etapas=["Conseguir madeira", ...]
   )

O formato declarativo é preferido. O formato por etapas
continua funcionando — o autonomia.js converte etapas
em metas declarativas automaticamente.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


# ============================================================
# 📦 MODELO
# ============================================================

@dataclass
class ObjetivoMinecraft:
    id: str
    nome: str
    descricao: str
    progresso: int = 0
    total: int = 1
    concluido: bool = False

    # Formato antigo
    etapas: list[str] = field(default_factory=list)

    # Formato novo
    itens_necessarios: dict = field(default_factory=dict)
    construir: Optional[dict] = None

    # Estado
    local: Optional[dict] = None


# ============================================================
# 🎯 GERENCIADOR
# ============================================================

class GerenciadorObjetivosMinecraft:

    def __init__(self):
        self.objetivo_atual: Optional[ObjetivoMinecraft] = None
        self.historico: list[dict] = []

    # ========================================================
    # 🎯 DEFINIR OBJETIVO
    # ========================================================

    def definir_objetivo(
        self,
        id: str,
        nome: str,
        descricao: str,
        etapas: Optional[list[str]] = None,
        itens_necessarios: Optional[dict] = None,
        construir: Optional[dict] = None,
    ) -> ObjetivoMinecraft:
        """
        Aceita formato declarativo OU por etapas.

        Se `itens_necessarios` for informado, ele é a fonte
        de verdade. `etapas` vira descritivo.

        Se apenas `etapas` for informado, converte as etapas
        em `itens_necessarios` inferidos.
        """

        etapas = list(etapas or [])
        itens_necessarios = dict(itens_necessarios or {})

        # Se só veio etapas, infere itens_necessarios
        if not itens_necessarios and etapas:
            itens_necessarios = self._inferir_itens_das_etapas(
                etapas
            )

        # Se nem itens nem etapas, erro
        if not itens_necessarios and not etapas:
            raise ValueError(
                "definir_objetivo precisa de "
                "`etapas` ou `itens_necessarios`."
            )

        # Constrói a etapa descritiva a partir dos itens, se
        # o usuário não passou etapas explícitas.
        if not etapas:
            etapas = self._descrever_itens(
                itens_necessarios,
                construir
            )

        total = max(1, len(etapas))

        objetivo = ObjetivoMinecraft(
            id=id,
            nome=nome,
            descricao=descricao,
            progresso=0,
            total=total,
            concluido=False,
            etapas=etapas,
            itens_necessarios=itens_necessarios,
            construir=construir,
        )

        self.objetivo_atual = objetivo

        return objetivo

    # ========================================================
    # 🔍 INFERÊNCIA DE ITENS A PARTIR DE ETAPAS
    # ========================================================
    #
    # Regra: cada etapa tem um tipo implícito (madeira,
    # tábuas, local, construção). A partir do nome, infere
    # o item necessário.

    def _inferir_itens_das_etapas(
        self,
        etapas: list[str],
    ) -> dict:

        itens: dict = {}

        for etapa in etapas:
            nome = str(etapa or "").lower()

            if (
                "madeira" in nome
                or "tronco" in nome
                or "log" in nome
            ):
                itens.setdefault("oak_log", 25)

            elif (
                "tabua" in nome
                or "tábua" in nome
                or "recurso" in nome
            ):
                itens.setdefault("oak_planks", 100)

            elif (
                "abrigo" in nome
                or "construir" in nome
                or "casa" in nome
            ):
                itens.setdefault("oak_planks", 100)

            elif (
                "picareta" in nome
                and "pedra" in nome
            ):
                itens.setdefault("stone_pickaxe", 1)

            elif "picareta" in nome:
                itens.setdefault("wooden_pickaxe", 1)

            elif (
                "espada" in nome
                and "pedra" in nome
            ):
                itens.setdefault("stone_sword", 1)

            elif "espada" in nome:
                itens.setdefault("wooden_sword", 1)

        return itens

    # ========================================================
    # 📝 DESCRIÇÃO DE ITENS
    # ========================================================

    def _descrever_itens(
        self,
        itens: dict,
        construir: Optional[dict],
    ) -> list[str]:

        etapas = []

        for item, qtd in itens.items():
            etapas.append(f"Obter {qtd}x {item}")

        if construir and construir.get("tipo"):
            etapas.append(
                f"Construir {construir['tipo']}"
            )

        if not etapas:
            etapas = ["Concluir objetivo"]

        return etapas

    # ========================================================
    # 📈 ATUALIZAR PROGRESSO
    # ========================================================

    def atualizar_progresso(
        self,
        progresso: int,
    ) -> None:

        if not self.objetivo_atual:
            return

        progresso = max(
            0,
            min(
                progresso,
                self.objetivo_atual.total,
            ),
        )

        self.objetivo_atual.progresso = progresso

        if progresso >= self.objetivo_atual.total:
            self.concluir_objetivo()

    # ========================================================
    # ✅ CONCLUIR
    # ========================================================

    def concluir_objetivo(
        self,
        sucesso: bool = True,
    ) -> None:

        if not self.objetivo_atual:
            return

        self.objetivo_atual.progresso = (
            self.objetivo_atual.total
        )

        self.objetivo_atual.concluido = True

        self.historico.append({
            "id": self.objetivo_atual.id,
            "nome": self.objetivo_atual.nome,
            "concluido_em": datetime.utcnow().isoformat(),
            "sucesso": bool(sucesso),
        })

    # ========================================================
    # ❌ LIMPAR
    # ========================================================

    def limpar_objetivo(self) -> None:
        self.objetivo_atual = None

    # ========================================================
    # 📊 ESTADO
    # ========================================================

    def obter_estado(self) -> dict:

        if not self.objetivo_atual:
            return {
                "existe": False,
                "objetivo": None,
                "historico": list(self.historico),
            }

        objetivo = self.objetivo_atual

        return {
            "existe": True,
            "objetivo": {
                "id": objetivo.id,
                "nome": objetivo.nome,
                "descricao": objetivo.descricao,
                "progresso": objetivo.progresso,
                "total": objetivo.total,
                "concluido": objetivo.concluido,
                "etapas": objetivo.etapas,
                "itens_necessarios": dict(
                    objetivo.itens_necessarios
                ),
                "construir": objetivo.construir,
                "local": objetivo.local,
            },
            "historico": list(self.historico),
        }

    # ========================================================
    # 🧠 CONTEXTO PARA A IA
    # ========================================================

    def obter_contexto_ia(self) -> str:

        if not self.objetivo_atual:
            return (
                "A Raiden não possui nenhum objetivo "
                "Minecraft definido."
            )

        objetivo = self.objetivo_atual

        progresso = (
            f"{objetivo.progresso}/"
            f"{objetivo.total}"
        )

        etapas = "\n".join(
            f"- {etapa}"
            for etapa in objetivo.etapas
        )

        bloco_itens = ""

        if objetivo.itens_necessarios:
            linhas = "\n".join(
                f"- {qtd}x {item}"
                for item, qtd in objetivo.itens_necessarios.items()
            )

            bloco_itens = (
                "\nITENS NECESSÁRIOS:\n"
                f"{linhas}\n"
            )

        bloco_construir = ""

        if objetivo.construir and objetivo.construir.get("tipo"):
            bloco_construir = (
                "\nCONSTRUÇÃO:\n"
                f"- Tipo: {objetivo.construir['tipo']}\n"
            )

        return f"""
OBJETIVO ATUAL DA RAIDEN NO MINECRAFT

Nome:
{objetivo.nome}

Descrição:
{objetivo.descricao}

Progresso:
{progresso}

Etapas:
{etapas}
{bloco_itens}{bloco_construir}
O objetivo é a prioridade da Raiden.
Ela deve observar o estado atual do Minecraft
e escolher ações que realmente contribuam
para alcançar esse objetivo.

Não deve executar ações aleatórias apenas
porque elas estão disponíveis.
"""

    # ========================================================
    # 🔍 EXISTE OBJETIVO?
    # ========================================================

    def tem_objetivo(self) -> bool:
        return (
            self.objetivo_atual is not None
            and not self.objetivo_atual.concluido
        )


# ============================================================
# 🌎 INSTÂNCIA GLOBAL
# ============================================================

minecraft_objetivos = (
    GerenciadorObjetivosMinecraft()
)


# ============================================================
# 🏠 OBJETIVO INICIAL
# ============================================================
#
# Formato declarativo (novo).
# Equivalente ao antigo "primeiro_abrigo" com 4 etapas.

minecraft_objetivos.definir_objetivo(
    id="primeiro_abrigo",

    nome="Construir um abrigo",

    descricao=(
        "Encontrar recursos e construir "
        "um abrigo simples para passar a noite "
        "com segurança."
    ),

    itens_necessarios={
        "oak_planks": 100
    },

    construir={
        "tipo": "abrigo_simples"
    },
)