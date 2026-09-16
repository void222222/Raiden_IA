"""
📦 MODELOS PYDANTIC — RAIDEN

Todos os corpos de requisição HTTP usados pela API.
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ============================================================
# 💬 CHAT
# ============================================================

class MensagemRequest(BaseModel):
    texto: Optional[str] = None
    text: Optional[str] = None


class YouTubeRequest(BaseModel):
    link: Optional[str] = None


# ============================================================
# 🧠 MEMÓRIA PESSOAL
# ============================================================

class MemoriaRequest(BaseModel):
    termo: str
    conteudo: str
    categoria: str = "geral"


class EsquecerMemoriaRequest(BaseModel):
    termo: str
    categoria: Optional[str] = None


# ============================================================
# ⛏ MINECRAFT
# ============================================================

class MinecraftAcaoRequest(BaseModel):
    acao: str
    parametros: dict = Field(default_factory=dict)


class MinecraftObjetivoRequest(BaseModel):

    id: str
    nome: str
    descricao: str

    etapas: Optional[list[str]] = None
    itens_necessarios: Optional[dict[str, int]] = None
    construir: Optional[dict] = None

    @field_validator("id", "nome", "descricao")
    @classmethod
    def _campo_nao_vazio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("campo não pode ser vazio")
        return v

    @field_validator("etapas")
    @classmethod
    def _etapas_validas(
        cls,
        v: Optional[list[str]]
    ) -> Optional[list[str]]:

        if v is None:
            return None

        if not v:
            raise ValueError("etapas não pode ser vazia")

        limpas = [
            etapa.strip()
            for etapa in v
            if isinstance(etapa, str) and etapa.strip()
        ]

        if len(limpas) != len(v):
            raise ValueError(
                "todas as etapas precisam "
                "ser textos não vazios"
            )

        return limpas

    @field_validator("itens_necessarios")
    @classmethod
    def _itens_validos(
        cls,
        v: Optional[dict[str, int]]
    ) -> Optional[dict[str, int]]:

        if v is None:
            return None

        if not isinstance(v, dict) or not v:
            raise ValueError(
                "itens_necessarios precisa ser "
                "um dict não vazio"
            )

        limpos: dict[str, int] = {}

        for nome, qtd in v.items():

            if not isinstance(nome, str) or not nome.strip():
                raise ValueError(f"item inválido: {nome!r}")

            try:
                q = int(qtd)
            except (TypeError, ValueError):
                raise ValueError(
                    f"quantidade inválida para {nome}: {qtd!r}"
                )

            if q <= 0:
                raise ValueError(
                    f"quantidade deve ser > 0 para {nome}"
                )

            limpos[nome.strip()] = q

        return limpos

    @field_validator("construir")
    @classmethod
    def _construir_valido(
        cls,
        v: Optional[dict]
    ) -> Optional[dict]:

        if v is None:
            return None

        if not isinstance(v, dict):
            raise ValueError("construir precisa ser um dict")

        tipo = v.get("tipo")

        if not isinstance(tipo, str) or not tipo.strip():
            raise ValueError(
                "construir.tipo precisa ser string não vazia"
            )

        return {"tipo": tipo.strip()}


class MinecraftProgressoRequest(BaseModel):
    progresso: int = Field(ge=0)