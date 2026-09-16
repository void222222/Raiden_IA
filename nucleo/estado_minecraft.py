"""
📊 ESTADO DO MINECRAFT — RAIDEN

Hub central de leitura de estado do Minecraft.

Concentra:
- estado da autonomia JS (o "corpo" no Node)
- eventos recentes (telemetria)
- resultados de ações
- ação pendente
- contador de eventos silenciosos
- flag de "objetivo recém-concluído"

NÃO contém lógica de decisão.
NÃO contém loop.
Apenas guarda e expõe estado.
"""

import json
import threading
import time

from collections import Counter, deque
from typing import Optional

from nucleo.config import (
    MINECRAFT_EVENTOS_SILENCIOSOS,
    MINECRAFT_RESUMO_INTERVALO,
)
from nucleo.logger import logger
from nucleo.utils import _normalizar_acao_id


# ============================================================
# 🧠 ESTADO DA AUTONOMIA JS
# ============================================================

minecraft_autonomia_estado: dict = {}

minecraft_autonomia_estado_lock = threading.Lock()


# ============================================================
# ⚠️ FLAG: OBJETIVO RECÉM-CONCLUÍDO
# ============================================================
#
# Quando o autonomia.js emite "objetivo_concluido", o loop
# de pensamento precisa saber que o objetivo anterior
# terminou — pra o Ollama definir um novo.
#
# Essa flag é setada ao receber o evento e limpa depois
# que o loop decidiu o próximo passo.

objetivo_recem_concluido: Optional[dict] = None


def marcar_objetivo_concluido(meta: dict) -> None:
    """Marca que um objetivo acabou de ser concluído."""

    global objetivo_recem_concluido

    objetivo_recem_concluido = {
        "meta": meta or {},
        "em": time.time(),
    }


def limpar_objetivo_concluido() -> None:
    """Limpa a flag depois que o loop já tratou."""

    global objetivo_recem_concluido

    objetivo_recem_concluido = None


# ============================================================
# 📡 EVENTOS RECENTES
# ============================================================

minecraft_eventos_recentes = deque(maxlen=50)


# ============================================================
# 📊 CONTADOR AGREGADO DE EVENTOS SILENCIOSOS
# ============================================================

minecraft_contador_eventos: Counter = Counter()

minecraft_contador_lock = threading.Lock()

minecraft_ultimo_resumo_ts = time.monotonic()


# ============================================================
# 🎮 RESULTADOS DE AÇÕES
# ============================================================

minecraft_resultados_acoes: dict = {}

minecraft_resultados_acoes_lock = threading.Lock()

minecraft_ultimo_resultado_acao: Optional[dict] = None


# ============================================================
# ⏳ AÇÃO PENDENTE
# ============================================================

minecraft_acao_pendente_id: Optional[str] = None

minecraft_acao_pendente_lock = threading.Lock()


# ============================================================
# 📡 REGISTRAR EVENTO DE AUTONOMIA
# ============================================================

def registrar_evento_autonomia_minecraft(
    evento: dict
) -> None:
    """
    Guarda eventos da autonomia JS.

    Eventos importantes:
      - minecraft_autonomia_estado
      - minecraft_autonomia_etapa_concluida
      - minecraft_autonomia_objetivo_concluido
      - minecraft_autonomia_erro
      - minecraft_autonomia_perigo
      - minecraft_autonomia_travado
    """

    if not isinstance(evento, dict):
        return

    nome = str(
        evento.get("evento")
        or evento.get("tipo")
        or ""
    )

    if nome == "minecraft_autonomia_estado":

        with minecraft_autonomia_estado_lock:
            minecraft_autonomia_estado.update(evento)

        return

    if nome == "minecraft_autonomia_etapa_concluida":

        logger.info(
            "⛏🤖 Etapa concluída: %s",
            evento.get("novaEtapa")
            or evento.get("etapaAnterior")
        )

        return

    if nome == "minecraft_autonomia_objetivo_concluido":

        # ⚠️ O JS manda "meta", não "objetivo"
        meta = evento.get("meta") or {}

        nome_meta = (
            meta.get("nome")
            or meta.get("id")
            or "?"
        )

        logger.info(
            "⛏🤖 Objetivo concluído: %s",
            nome_meta
        )

        with minecraft_autonomia_estado_lock:
            minecraft_autonomia_estado.update(evento)

        # Marca a flag pro loop de pensamento
        marcar_objetivo_concluido(meta)

        # Limpa o objetivo no gerenciador
        try:
            from modulos.minecraft_objetivos import (
                minecraft_objetivos,
            )

            minecraft_objetivos.limpar_objetivo()

            logger.info(
                "⛏🤖 Objetivo limpo do gerenciador."
            )

        except Exception as e:
            logger.error(
                f"❌ Erro limpando objetivo: {e}"
            )

        return

    if nome == "minecraft_autonomia_erro":

        logger.error(
            "⛏🤖 Erro na autonomia: %s",
            evento.get("erro")
        )

        return

    if nome == "minecraft_autonomia_perigo":

        perigos = evento.get("perigos") or []
        criticos = evento.get("criticos") or []

        primeiro = (criticos or perigos or [{}])[0]

        tipo = primeiro.get("tipo") or "?"
        nome_perigo = primeiro.get("nome") or "?"
        distancia = primeiro.get("distancia")

        logger.warning(
            "⛏🤖 Perigo detectado | tipo=%s nome=%s dist=%s | "
            "total=%d criticos=%d",
            tipo,
            nome_perigo,
            distancia,
            len(perigos),
            len(criticos)
        )

        return

    if nome == "minecraft_autonomia_travado":

        logger.warning(
            "⛏🤖 Autonomia travada: %s",
            evento
        )

        return

    logger.info(
        "⛏🤖 Evento autonomia: %s | %s",
        nome,
        evento
    )


def obter_estado_autonomia_minecraft() -> dict:
    """Retorna cópia do estado atual da autonomia JS."""

    with minecraft_autonomia_estado_lock:
        return dict(minecraft_autonomia_estado)


# ============================================================
# 📊 RESUMO PERIÓDICO
# ============================================================

def _resumo_eventos_se_passou_intervalo():

    global minecraft_ultimo_resumo_ts

    agora = time.monotonic()

    if (
        agora - minecraft_ultimo_resumo_ts
        < MINECRAFT_RESUMO_INTERVALO
    ):
        return

    with minecraft_contador_lock:

        if not minecraft_contador_eventos:

            minecraft_ultimo_resumo_ts = agora
            return

        copia = dict(minecraft_contador_eventos)

        minecraft_contador_eventos.clear()

    minecraft_ultimo_resumo_ts = agora

    total = sum(copia.values())

    detalhes = ", ".join(
        f"{nome}={qtd}"
        for nome, qtd
        in sorted(
            copia.items(),
            key=lambda x: -x[1]
        )[:10]
    )

    logger.info(
        "📊 Minecraft (resumo %ss): total=%s | %s",
        int(MINECRAFT_RESUMO_INTERVALO),
        total,
        detalhes
    )


# ============================================================
# 🌍 ESTADO DO MINECRAFT (via bridge)
# ============================================================

def obter_estado_minecraft() -> dict:
    """Retorna o estado mais recente do Minecraft."""

    from modulos.minecraft import minecraft_bridge

    return minecraft_bridge.obter_estado()


def obter_objetivo_minecraft() -> dict:
    """Retorna o objetivo atual da Raiden no Minecraft."""

    try:
        from modulos.minecraft_objetivos import (
            minecraft_objetivos,
        )

        return minecraft_objetivos.obter_estado()

    except Exception as e:
        logger.error(
            f"❌ Erro ao obter objetivo Minecraft: {e}"
        )
        return {}


def obter_contexto_objetivo_minecraft() -> str:
    """Converte o objetivo atual em contexto pro cérebro."""

    try:
        from modulos.minecraft_objetivos import (
            minecraft_objetivos,
        )

        return minecraft_objetivos.obter_contexto_ia()

    except Exception as e:
        logger.error(
            f"❌ Erro ao obter contexto do objetivo: {e}"
        )
        return "Nenhum objetivo definido no momento."


# ============================================================
# 📡 REGISTRAR EVENTO GENÉRICO
# ============================================================

def registrar_evento_minecraft(evento: dict):
    """
    Guarda eventos recentes recebidos do bot.

    Eventos de telemetria em alta frequência continuam
    sendo guardados, mas NÃO geram log individual.
    """

    if not isinstance(evento, dict):
        return

    minecraft_eventos_recentes.append(evento)

    nome_evento_bruto = (
        evento.get("evento")
        or evento.get("tipo")
        or "desconhecido"
    )

    if isinstance(nome_evento_bruto, (dict, list)):

        logger.error(
            "🔎 DEBUG EVENTO NÃO-HASHABLE | "
            f"tipo_nome_evento="
            f"{type(nome_evento_bruto).__name__} | "
            f"nome_evento_bruto={nome_evento_bruto!r} | "
            f"payload={evento!r}"
        )

        try:
            nome_evento_bruto = json.dumps(
                nome_evento_bruto,
                ensure_ascii=False,
                sort_keys=True
            )
        except (TypeError, ValueError):
            nome_evento_bruto = str(nome_evento_bruto)

    nome_evento = str(nome_evento_bruto)

    if nome_evento in MINECRAFT_EVENTOS_SILENCIOSOS:

        with minecraft_contador_lock:
            minecraft_contador_eventos[nome_evento] += 1

        _resumo_eventos_se_passou_intervalo()
        return

    logger.info(
        "📡 Minecraft → Raiden | evento=%s",
        nome_evento
    )


def obter_ultimos_eventos_minecraft() -> list:
    """Retorna os últimos eventos recebidos."""

    return list(minecraft_eventos_recentes)


# ============================================================
# 🎮 RESULTADO DE AÇÃO
# ============================================================

def registrar_resultado_acao_minecraft(payload: dict):
    """
    Guarda o resultado real de uma ação enviada
    pelo bot (via WebSocket).
    """

    global minecraft_ultimo_resultado_acao
    global minecraft_acao_pendente_id

    if not isinstance(payload, dict):
        return

    with minecraft_resultados_acoes_lock:

        minecraft_ultimo_resultado_acao = dict(payload)

        acao_id_bruto = (
            payload.get("id")
            or payload.get("acao_id")
        )

        if isinstance(acao_id_bruto, (dict, list)):

            try:
                acao_id_bruto = json.dumps(
                    acao_id_bruto,
                    ensure_ascii=False,
                    sort_keys=True
                )
            except (TypeError, ValueError):
                acao_id_bruto = str(acao_id_bruto)

        acao_id = _normalizar_acao_id(acao_id_bruto)

        if acao_id is not None:

            acao_id = str(acao_id)

            minecraft_resultados_acoes[acao_id] = dict(payload)

            if len(minecraft_resultados_acoes) > 50:

                chave_mais_antiga = next(
                    iter(minecraft_resultados_acoes)
                )

                minecraft_resultados_acoes.pop(
                    chave_mais_antiga,
                    None
                )

    with minecraft_acao_pendente_lock:

        if (
            acao_id is not None
            and minecraft_acao_pendente_id == acao_id
        ):
            minecraft_acao_pendente_id = None


def obter_ultimo_resultado_acao_minecraft(
) -> Optional[dict]:

    with minecraft_resultados_acoes_lock:

        if minecraft_ultimo_resultado_acao:
            return dict(minecraft_ultimo_resultado_acao)

    return None


def obter_resultado_acao_minecraft(acao_id) -> Optional[dict]:

    acao_id = _normalizar_acao_id(acao_id)

    if acao_id is None:
        return None

    with minecraft_resultados_acoes_lock:

        resultado = minecraft_resultados_acoes.get(acao_id)

        if resultado:
            return dict(resultado)

    return None


# ============================================================
# ⏳ AÇÃO PENDENTE
# ============================================================

def marcar_acao_pendente(acao_id: str):

    global minecraft_acao_pendente_id

    with minecraft_acao_pendente_lock:
        minecraft_acao_pendente_id = _normalizar_acao_id(acao_id)


def limpar_acao_pendente():

    global minecraft_acao_pendente_id

    with minecraft_acao_pendente_lock:
        minecraft_acao_pendente_id = None


def obter_acao_pendente_id() -> Optional[str]:

    with minecraft_acao_pendente_lock:
        return minecraft_acao_pendente_id


def existe_acao_pendente() -> bool:

    return obter_acao_pendente_id() is not None