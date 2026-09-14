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
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ObjetivoMinecraft:
    id: str
    nome: str
    descricao: str
    progresso: int = 0
    total: int = 1
    concluido: bool = False
    etapas: list[str] = field(default_factory=list)


class GerenciadorObjetivosMinecraft:

    def __init__(self):
        self.objetivo_atual: Optional[ObjetivoMinecraft] = None
        self.historico: list[str] = []

    # ========================================================
    # 🎯 DEFINIR OBJETIVO
    # ========================================================

    def definir_objetivo(
        self,
        id: str,
        nome: str,
        descricao: str,
        etapas: list[str],
    ) -> ObjetivoMinecraft:

        objetivo = ObjetivoMinecraft(
            id=id,
            nome=nome,
            descricao=descricao,
            progresso=0,
            total=len(etapas),
            concluido=False,
            etapas=etapas,
        )

        self.objetivo_atual = objetivo

        return objetivo

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

    def concluir_objetivo(self) -> None:

        if not self.objetivo_atual:
            return

        self.objetivo_atual.progresso = (
            self.objetivo_atual.total
        )

        self.objetivo_atual.concluido = True

        if self.objetivo_atual.id not in self.historico:
            self.historico.append(
                self.objetivo_atual.id
            )

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
            },
            "historico": self.historico,
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
# 🏠 PRIMEIRO OBJETIVO
# ============================================================

minecraft_objetivos.definir_objetivo(
    id="primeiro_abrigo",

    nome="Construir um abrigo",

    descricao=(
        "Encontrar recursos e construir "
        "um abrigo simples para passar a noite "
        "com segurança."
    ),

    etapas=[
        "Encontrar madeira",
        "Conseguir recursos básicos",
        "Encontrar um local adequado",
        "Construir as paredes",
        "Construir o teto",
        "Finalizar o abrigo",
    ],
)