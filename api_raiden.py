"""
🎌 RAIDEN - API PRINCIPAL

Core REST + Ouvido + Visão + Memória + YouTube +
ChatVRM + LivePix + Minecraft.

Minecraft:
    percepção → cérebro → decisão → ação → percepção

O Minecraft utiliza o mesmo cérebro Ollama da Raiden.
Não existe um segundo cérebro separado.

CENÁRIO C:
    - O Ollama decide ESTRATÉGIA (objetivo, iniciar/parar
      autonomia, ações pontuais).
    - O autonomia.js dentro do bot executa as etapas
      (minerar, craftar, construir).
    - Ações pontuais do Ollama ainda passam pelo bridge.
"""

# ============================================================
# 1. IMPORTS PADRÃO
# ============================================================

import asyncio
import base64
import json
import logging
import os
import re
import sys
import threading
import queue
import time

from collections import deque, Counter
from io import BytesIO
from pathlib import Path
from typing import Optional
from contextlib import contextmanager, asynccontextmanager


# ============================================================
# 2. BIBLIOTECAS EXTERNAS
# ============================================================

import httpx
import uvicorn
import edge_tts
import speech_recognition as sr

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    WebSocket,
    WebSocketDisconnect
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

# ============================================================
# 3. MÓDULOS DA RAIDEN
# ============================================================

from modulos.web_memoria import (
    iniciar_banco,
    consultar_conhecimento,
    lembrar_memoria_pessoal,
    aprender_memoria_pessoal,
    esquecer_memoria_pessoal,
    listar_memorias_pessoais,
)

from modulos.visao import ver_a_tela

import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module
import modulos.minecraft as minecraft_module
import modulos.minecraft_objetivos as minecraft_objetivos_module


# ============================================================
# ⚙️ CONFIGURAÇÕES GERAIS
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s"
)

logger = logging.getLogger("RaidenCore")


OLLAMA_URL = (
    "http://localhost:11434/api/generate"
)

MODELO_CONVERSA = "raiden_carioca"

OLLAMA_KEEP_ALIVE = "5m"


MICROFONE_ATIVO = (
    os.getenv(
        "RAIDEN_MICROFONE_ATIVO",
        "0"
    ) == "1"
)


CORS_ORIGINS = os.getenv(
    "RAIDEN_CORS_ORIGINS",
    (
        "http://localhost:3000,"
        "http://localhost:5173,"
        "http://localhost:8080"
    )
).split(",")


MAX_UPLOAD_SIZE = 10 * 1024 * 1024

UPLOAD_CHUNK_SIZE = 1024 * 1024


RAIZ_PROJETO = (
    Path(__file__).resolve().parent
)


PASTA_PUBLIC_CHATVRM = (
    RAIZ_PROJETO
    / "ChatVRM"
    / "public"
)


PASTA_PAINEL = (
    RAIZ_PROJETO
    / "painel"
)


# ============================================================
# 🛠️ HELPER BOOLEANO
# ============================================================

def _env_bool(nome: str, padrao: bool = True) -> bool:
    """
    Lê variável de ambiente booleana aceitando
    formatos comuns: 1, true, yes, on, sim.
    """

    valor = os.getenv(nome)

    if valor is None:
        return padrao

    return valor.strip().lower() in {
        "1", "true", "yes", "on", "sim"
    }


# ============================================================
# ⛏ CONFIGURAÇÃO DA RAÍDEN NO MINECRAFT
# ============================================================

MINECRAFT_AUTONOMIA_ATIVA = _env_bool(
    "RAIDEN_MINECRAFT_AUTONOMIA",
    True
)


# Tempo entre decisões da Raiden.
#
# Não é o intervalo do estado.
# O bot recebe estado a cada segundo.
# A Raiden pensa com uma frequência menor para
# evitar sobrecarregar o Ollama.

MINECRAFT_INTERVALO_DECISAO = float(
    os.getenv(
        "RAIDEN_MINECRAFT_INTERVALO",
        "4"
    )
)


MINECRAFT_TIMEOUT_DECISAO = float(
    os.getenv(
        "RAIDEN_MINECRAFT_TIMEOUT",
        "30"
    )
)


# ------------------------------------------------------------
# 📊 LOG DE EVENTOS MINECRAFT
# ------------------------------------------------------------
#
# Eventos de percepção em alta frequência continuam sendo
# recebidos, armazenados e processados normalmente.
#
# Eles apenas NÃO geram log individual.
#
# Um resumo agregado é impresso a cada X segundos para
# manter alguma visibilidade sem poluir o terminal.

MINECRAFT_RESUMO_INTERVALO = float(
    os.getenv(
        "RAIDEN_MINECRAFT_RESUMO_INTERVALO",
        "60"
    )
)


# Eventos considerados "ruído de telemetria".
# Continuam chegando e sendo guardados.
# Só não geram log individual.

MINECRAFT_EVENTOS_SILENCIOSOS = {

    "entidade_spawn",
    "entidade_saiu",
    "entidade_morreu",
    "entidade_movimento",

    "animal",
    "hostile",
    "water_creature",
    "passive",
    "ambient",
    "mob",
    "monster",
    "creature",

    "bloco_atualizado",
    "bloco_quebrado",
    "bloco_colocado",

    "som",
    "particula",
    "clima",

    "posicao",
    "rotacao",
    "velocidade",

}


# Evento usado para controlar o loop autônomo.

minecraft_autonomia_evento = (
    asyncio.Event()
)


minecraft_tarefa_autonomia = None


# ============================================================
# 📋 FILAS
# ============================================================

fila_perguntas = queue.Queue()

fila_respostas = queue.Queue()


# ============================================================
# 🧠 CONTEXTO DE CURTO PRAZO
# ============================================================

historico_conversa = deque(
    maxlen=10
)

historico_lock = threading.Lock()


# ============================================================
# 📦 MODELOS DE DADOS
# ============================================================

class MensagemRequest(BaseModel):

    texto: Optional[str] = None

    text: Optional[str] = None


class YouTubeRequest(BaseModel):

    link: Optional[str] = None


class MemoriaRequest(BaseModel):

    termo: str

    conteudo: str

    categoria: str = "geral"


class EsquecerMemoriaRequest(BaseModel):

    termo: str

    categoria: Optional[str] = None


class MinecraftAcaoRequest(BaseModel):

    acao: str

    parametros: dict = Field(
        default_factory=dict
    )


class MinecraftObjetivoRequest(BaseModel):

    id: str

    nome: str

    descricao: str

    # Formato antigo — etapas descritivas
    etapas: Optional[list[str]] = None

    # Formato novo — itens necessários
    itens_necessarios: Optional[dict[str, int]] = None

    # Formato novo — construção
    construir: Optional[dict] = None

    @field_validator(
        "id",
        "nome",
        "descricao"
    )
    @classmethod
    def _campo_nao_vazio(
        cls,
        v: str
    ) -> str:

        v = v.strip()

        if not v:

            raise ValueError(
                "campo não pode ser vazio"
            )

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

            raise ValueError(
                "etapas não pode ser vazia"
            )

        limpas = [
            etapa.strip()
            for etapa in v
            if isinstance(etapa, str)
            and etapa.strip()
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
                raise ValueError(
                    f"item inválido: {nome!r}"
                )

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
            raise ValueError(
                "construir precisa ser um dict"
            )

        tipo = v.get("tipo")

        if not isinstance(tipo, str) or not tipo.strip():
            raise ValueError(
                "construir.tipo precisa ser string não vazia"
            )

        return {"tipo": tipo.strip()}


class MinecraftProgressoRequest(BaseModel):

    progresso: int = Field(ge=0)


# ============================================================
# 🔇 UTILITÁRIO
# ============================================================

@contextmanager
def calar_linux():

    """
    Silencia temporariamente o stderr.
    """

    devnull = os.open(
        os.devnull,
        os.O_WRONLY
    )

    old_stderr = os.dup(2)

    sys.stderr.flush()

    os.dup2(
        devnull,
        2
    )

    try:

        yield

    finally:

        os.dup2(
            old_stderr,
            2
        )

        os.close(
            devnull
        )

        os.close(
            old_stderr
        )


# ============================================================
# 🧠 MEMÓRIA DE CURTO PRAZO
# ============================================================

def adicionar_ao_historico(
    usuario: str,
    raiden: str
):

    with historico_lock:

        historico_conversa.append({
            "usuario": usuario,
            "raiden": raiden
        })


def obter_contexto_conversa() -> str:

    with historico_lock:

        historico = list(
            historico_conversa
        )

    if not historico:

        return (
            "Não existe conversa anterior relevante."
        )

    linhas = [
        "CONVERSA RECENTE:"
    ]

    for item in historico:

        linhas.append(
            f"Lucas: {item['usuario']}"
        )

        linhas.append(
            f"Raiden: {item['raiden']}"
        )

    return "\n".join(linhas)


def limpar_historico():

    with historico_lock:

        historico_conversa.clear()

    logger.info(
        "🧹 Histórico de conversa limpo."
    )


# ============================================================
# 🧠 MEMÓRIA PESSOAL
# ============================================================

def obter_memoria_pessoal(
    termo: str
) -> str:

    try:

        memoria = (
            lembrar_memoria_pessoal(
                termo
            )
        )

        if memoria:

            return memoria

    except Exception as e:

        logger.error(
            f"❌ Erro ao consultar memória pessoal: {e}"
        )

    return ""


# ============================================================
# ⛏ ESTADO DO MINECRAFT
# ============================================================

minecraft_eventos_recentes = deque(maxlen=50)


# ------------------------------------------------------------
# 🧠 ESTADO DA AUTONOMIA JS
# ------------------------------------------------------------
#
# O autonomia.js (dentro do bot.js) é quem executa
# as etapas (minerar, craftar, construir). O Python
# só precisa saber em que ponto ele está para que
# o Ollama possa decidir se deixa continuar, muda
# de objetivo, ou interrompe.

minecraft_autonomia_estado: dict = {}

minecraft_autonomia_estado_lock = (
    threading.Lock()
)


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

        logger.info(
            "⛏🤖 Objetivo concluído: %s",
            evento.get("objetivo")
        )

        with minecraft_autonomia_estado_lock:
            minecraft_autonomia_estado.update(evento)

        return

    if nome == "minecraft_autonomia_erro":

        logger.error(
            "⛏🤖 Erro na autonomia: %s",
            evento.get("erro")
        )

        return

    if nome == "minecraft_autonomia_perigo":

        logger.warning(
            "⛏🤖 Perigo detectado pela autonomia: %s",
            evento.get("objetivo")
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


# ------------------------------------------------------------
# 📊 CONTADOR AGREGADO DE EVENTOS SILENCIOSOS
# ------------------------------------------------------------

minecraft_contador_eventos: Counter = Counter()

minecraft_contador_lock = threading.Lock()

minecraft_ultimo_resumo_ts = time.monotonic()


def _resumo_eventos_se_passou_intervalo():
    """
    Imprime um resumo agregado dos eventos silenciosos
    se já passou o intervalo configurado.

    Não interfere no armazenamento nem na lógica.
    """

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


def obter_estado_minecraft() -> dict:
    """
    Retorna o estado mais recente conhecido do Minecraft.
    """

    return (
        minecraft_module
        .minecraft_bridge
        .obter_estado()
    )


def obter_objetivo_minecraft() -> dict:
    """
    Retorna o objetivo atual da Raiden no Minecraft.
    """

    try:

        return (
            minecraft_objetivos_module
            .minecraft_objetivos
            .obter_estado()
        )

    except Exception as e:

        logger.error(
            f"❌ Erro ao obter objetivo Minecraft: {e}"
        )

        return {}


def obter_contexto_objetivo_minecraft() -> str:
    """
    Converte o objetivo atual em contexto para o cérebro.
    """

    try:

        return (
            minecraft_objetivos_module
            .minecraft_objetivos
            .obter_contexto_ia()
        )

    except Exception as e:

        logger.error(
            f"❌ Erro ao obter contexto do objetivo: {e}"
        )

        return "Nenhum objetivo definido no momento."


def registrar_evento_minecraft(
    evento: dict
):
    """
    Guarda eventos recentes recebidos do bot.

    O evento não executa inteligência própria.
    Ele apenas registra o que aconteceu no Minecraft.

    Eventos de telemetria em alta frequência continuam
    sendo guardados normalmente, mas NÃO geram log
    individual. Em vez disso, alimentam um contador
    agregado que é impresso periodicamente.

    ⚠️ IMPORTANTE:
    O campo "evento" ou "tipo" do payload pode vir
    como dict/list em alguns casos (por exemplo, se
    o bot empacotar dados de forma inesperada).
    Por isso, o nome do evento é SEMPRE normalizado
    para string antes de ser usado como chave.
    """

    if not isinstance(evento, dict):
        return

    minecraft_eventos_recentes.append(evento)

    # --------------------------------------------------------
    # 🛡️ NORMALIZAÇÃO DO NOME DO EVENTO
    # --------------------------------------------------------
    # Garante que nome_evento seja SEMPRE uma string
    # hashable, mesmo que "evento" ou "tipo" venham
    # como dict/list/None.

    nome_evento_bruto = (
        evento.get("evento")
        or evento.get("tipo")
        or "desconhecido"
    )

    if isinstance(
        nome_evento_bruto,
        (dict, list)
    ):

        # ------------------------------------------------
        # 🔎 DEBUG: mostra exatamente o payload que
        # trouxe um nome de evento não-hashable.
        # Isso responde "de onde vem o dict".
        # ------------------------------------------------

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

    # --------------------------------------------------------
    # Eventos silenciosos: só contam, não logam individual.
    # --------------------------------------------------------

    if nome_evento in MINECRAFT_EVENTOS_SILENCIOSOS:

        with minecraft_contador_lock:

            minecraft_contador_eventos[
                nome_evento
            ] += 1

        _resumo_eventos_se_passou_intervalo()

        return

    # Eventos relevantes continuam sendo logados.

    logger.info(
        "📡 Minecraft → Raiden | evento=%s",
        nome_evento
    )


def obter_ultimos_eventos_minecraft() -> list:
    """
    Retorna os últimos eventos recebidos.
    """

    return list(
        minecraft_eventos_recentes
    )


# ------------------------------------------------------------
# 🎮 RESULTADO REAL DAS AÇÕES
# ------------------------------------------------------------

minecraft_resultados_acoes: dict = {}

minecraft_resultados_acoes_lock = (
    threading.Lock()
)

minecraft_ultimo_resultado_acao: Optional[dict] = None


# ------------------------------------------------------------
# 🆔 AÇÃO PENDENTE
# ------------------------------------------------------------
#
# Enquanto uma ação está aguardando confirmação do
# Minecraft, a autonomia NÃO deve disparar outra decisão.
#
# Fluxo:
#   enviar ação → marcar como pendente
#   receber resultado → limpar pendente

minecraft_acao_pendente_id: Optional[str] = None

minecraft_acao_pendente_lock = (
    threading.Lock()
)


# ------------------------------------------------------------
# 🆔 GERADOR DE ID DE AÇÃO
# ------------------------------------------------------------

def gerar_acao_id_minecraft() -> str:
    """
    Gera um identificador único para uma ação
    enviada ao Minecraft.

    Formato:
        minecraft-<timestamp_ms>-<sufixo_aleatorio>
    """

    sufixo = base64.urlsafe_b64encode(
        os.urandom(6)
    ).decode("ascii").rstrip("=")

    return (
        f"minecraft-"
        f"{int(time.time() * 1000)}-"
        f"{sufixo}"
    )


# ------------------------------------------------------------
# 🆔 NORMALIZAÇÃO DE ID
# ------------------------------------------------------------

def _normalizar_acao_id(acao_id) -> Optional[str]:
    """
    Garante que o ID seja uma string hashable.

    Se vier dict/list, converte para JSON.
    """

    if acao_id is None:

        return None

    if isinstance(acao_id, (dict, list)):

        try:

            acao_id = json.dumps(
                acao_id,
                ensure_ascii=False,
                sort_keys=True
            )

        except (TypeError, ValueError):

            acao_id = str(acao_id)

    return str(acao_id)


# ------------------------------------------------------------
# 🎮 REGISTRAR RESULTADO DE AÇÃO
# ------------------------------------------------------------

def registrar_resultado_acao_minecraft(
    payload: dict
):
    """
    Guarda o resultado real de uma ação enviada
    pelo bot (via WebSocket).

    Diferente do retorno de bridge.executar_acao(),
    que só confirma o envio, este payload confirma
    o que o Minecraft realmente fez.

    Também limpa a ação pendente, se o ID bater.
    """

    global minecraft_ultimo_resultado_acao
    global minecraft_acao_pendente_id

    if not isinstance(payload, dict):

        return

    with minecraft_resultados_acoes_lock:

        minecraft_ultimo_resultado_acao = (
            dict(payload)
        )

        acao_id_bruto = (
            payload.get("id")
            or payload.get("acao_id")
        )

        # ----------------------------------------------------
        # 🛡️ BLINDAGEM EXTRA
        # ----------------------------------------------------
        # Mesmo com _normalizar_acao_id já protegendo,
        # garantimos aqui também que a chave do dicionário
        # seja SEMPRE uma string hashable.

        if isinstance(
            acao_id_bruto,
            (dict, list)
        ):

            try:

                acao_id_bruto = json.dumps(
                    acao_id_bruto,
                    ensure_ascii=False,
                    sort_keys=True
                )

            except (TypeError, ValueError):

                acao_id_bruto = str(acao_id_bruto)

        acao_id = _normalizar_acao_id(
            acao_id_bruto
        )

        if acao_id is not None:

            acao_id = str(acao_id)

            minecraft_resultados_acoes[
                acao_id
            ] = dict(payload)

            if len(
                minecraft_resultados_acoes
            ) > 50:

                chave_mais_antiga = next(
                    iter(
                        minecraft_resultados_acoes
                    )
                )

                minecraft_resultados_acoes.pop(
                    chave_mais_antiga,
                    None
                )

    # --------------------------------------------------------
    # Limpa ação pendente se for a mesma
    # --------------------------------------------------------

    with minecraft_acao_pendente_lock:

        if (
            acao_id is not None
            and minecraft_acao_pendente_id
            == acao_id
        ):

            minecraft_acao_pendente_id = None


# ------------------------------------------------------------
# 🆔 PENDÊNCIA
# ------------------------------------------------------------

def marcar_acao_pendente(acao_id: str):

    global minecraft_acao_pendente_id

    with minecraft_acao_pendente_lock:

        minecraft_acao_pendente_id = (
            _normalizar_acao_id(acao_id)
        )


def limpar_acao_pendente():

    global minecraft_acao_pendente_id

    with minecraft_acao_pendente_lock:

        minecraft_acao_pendente_id = None


def obter_acao_pendente_id() -> Optional[str]:

    with minecraft_acao_pendente_lock:

        return minecraft_acao_pendente_id


def existe_acao_pendente() -> bool:

    return obter_acao_pendente_id() is not None


# ------------------------------------------------------------
# 📥 CONSULTA
# ------------------------------------------------------------

def obter_ultimo_resultado_acao_minecraft(
) -> Optional[dict]:

    with minecraft_resultados_acoes_lock:

        if minecraft_ultimo_resultado_acao:

            return dict(
                minecraft_ultimo_resultado_acao
            )

    return None


def obter_resultado_acao_minecraft(
    acao_id
) -> Optional[dict]:

    acao_id = _normalizar_acao_id(acao_id)

    if acao_id is None:

        return None

    with minecraft_resultados_acoes_lock:

        resultado = (
            minecraft_resultados_acoes.get(
                acao_id
            )
        )

        if resultado:

            return dict(resultado)

    return None


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
# 🧠 CÉREBRO — OLLAMA
# ============================================================

async def pensar_ollama(
    prompt_usuario: str,
    memoria_pessoal: str = ""
) -> str:

    """
    Cérebro normal da Raiden.

    Usado para conversa, pesquisa e visão.
    """

    contexto = (
        obter_contexto_conversa()
    )


    bloco_memoria = ""


    if memoria_pessoal:

        bloco_memoria = (
            "\n\n"
            "MEMÓRIA PESSOAL RELEVANTE:\n"
            f"{memoria_pessoal}\n"
            "\n"
            "Use essa memória somente se ela "
            "for relevante para a mensagem atual. "
            "Não invente informações a partir dela.\n"
        )


    bloco_minecraft = ""


    if (
        minecraft_module
        .minecraft_bridge
        .conectado
    ):

        estado_minecraft = (
            obter_estado_minecraft()
        )

        ultima_acao = (
            minecraft_module
            .minecraft_bridge
            .obter_ultima_acao()
        )

        ultimo_resultado = (
            obter_ultimo_resultado_acao_minecraft()
        )

        ultimo_chat = (
            minecraft_module
            .minecraft_bridge
            .obter_ultima_mensagem_chat()
        )

        # ----------------------------------------------------
        # 🧮 TRUNCAGEM DAS LISTAS
        # ----------------------------------------------------
        # Inventário e entidades podem ser grandes demais
        # para o prompt. Truncamos para evitar estourar
        # o contexto do Ollama.

        inventario = estado_minecraft.get("inventario") or []
        entidades = estado_minecraft.get("entidades") or []

        inventario_total = (
            len(inventario)
            if isinstance(inventario, list)
            else 0
        )
        entidades_total = (
            len(entidades)
            if isinstance(entidades, list)
            else 0
        )

        if isinstance(inventario, list):
            inventario = inventario[:20]

        if isinstance(entidades, list):
            entidades = entidades[:5]

        bloco_minecraft = (
            "\n\n"
            "ESTADO ATUAL DO MINECRAFT:\n"
            f"Posição: "
            f"{estado_minecraft.get('posicao')}\n"
            f"Rotação: "
            f"{estado_minecraft.get('rotacao')}\n"
            f"Vida: "
            f"{estado_minecraft.get('vida')}\n"
            f"Fome: "
            f"{estado_minecraft.get('fome')}\n"
            f"Inventário ({inventario_total} itens, "
            f"primeiros 20): "
            f"{inventario}\n"
            f"Entidades próximas "
            f"({entidades_total} no total, "
            f"primeiras 5): "
            f"{entidades}\n"
            f"Última ação enviada: "
            f"{ultima_acao}\n"
            f"Último resultado real: "
            f"{ultimo_resultado}\n"
            f"Último chat recebido: "
            f"{ultimo_chat}\n"
            "\n"
            "Use o estado do Minecraft quando "
            "ele for relevante. Não invente "
            "informações sobre o mundo.\n"
        )


    prompt_final = (
        f"{contexto}\n"
        f"{bloco_memoria}"
        f"{bloco_minecraft}\n"
        "MENSAGEM ATUAL DO LUCAS:\n"
        f"{prompt_usuario}\n\n"
        "Responda à mensagem atual considerando "
        "a conversa recente, memória pessoal e "
        "Minecraft quando forem relevantes."
    )


    payload = {

        "model": MODELO_CONVERSA,

        "prompt": prompt_final,

        "stream": False,

        "keep_alive": OLLAMA_KEEP_ALIVE,

        "options": {

            "num_predict": 150

        }

    }


    try:

        async with httpx.AsyncClient() as client:

            resp = await client.post(
                OLLAMA_URL,
                json=payload,
                timeout=30.0
            )

            resp.raise_for_status()

            return (
                resp.json()
                .get("response", "")
                .strip()
            )


    except httpx.TimeoutException:

        logger.error(
            "⏱️ Timeout ao conectar com Ollama"
        )

        return (
            "Demorei demais pra pensar, mermão. "
            "Tenta de novo aí."
        )


    except httpx.HTTPError as e:

        logger.error(
            f"🌐 Erro HTTP com Ollama: {e}"
        )

        return (
            "Deu ruim na comunicação com meu cérebro. "
            "Vê se o Ollama tá ligado!"
        )


    except Exception as e:

        logger.error(
            f"❌ Erro inesperado no Ollama: {e}"
        )

        return (
            "Deu ruim no meu cérebro, mermão. "
            "Vê se o Ollama tá ligado!"
        )


# ============================================================
# ⛏🧠 CÉREBRO DO MINECRAFT — CENÁRIO C
# ============================================================
#
# O Ollama NÃO decide micro-ações mais.
#
# Ele decide:
#   - SE a autonomia JS deve continuar
#   - SE um novo objetivo deve ser definido
#   - SE a autonomia deve ser parada
#   - SE uma ação pontual deve ser executada
#     (comer, atacar, falar)
#
# Micro-ações (quebrar, craftar, construir, andar)
# são responsabilidade do autonomia.js.
# ============================================================

async def pensar_acao_minecraft(
    estado: dict
) -> Optional[dict]:

    if not isinstance(estado, dict):
        return None

    contexto_objetivo = (
        obter_contexto_objetivo_minecraft()
    )

    autonomia_estado = (
        obter_estado_autonomia_minecraft()
    )

    ultimo_resultado = (
        obter_ultimo_resultado_acao_minecraft()
    )

    # --------------------------------------------------------
    # Resumo compacto do estado para o prompt
    # --------------------------------------------------------

    vida = estado.get("vida")
    fome = estado.get("fome")
    posicao = estado.get("posicao")

    inventario = estado.get("inventario") or []
    if isinstance(inventario, list):
        inventario_resumo = [
            {
                "nome": item.get("nome"),
                "qtd": item.get("quantidade")
            }
            for item in inventario[:15]
            if isinstance(item, dict)
        ]
    else:
        inventario_resumo = []

    entidades = estado.get("entidades") or []
    if isinstance(entidades, list):
        entidades_resumo = [
            {
                "nome": ent.get("nome"),
                "dist": ent.get("distancia"),
                "hostil": ent.get("hostil")
            }
            for ent in entidades[:5]
            if isinstance(ent, dict)
        ]
    else:
        entidades_resumo = []

    # --------------------------------------------------------
    # Estado atual da autonomia JS
    # --------------------------------------------------------

    obj_atual = (
        autonomia_estado
        .get("objetivoAtual") or {}
    )

    etapa_atual = (
        autonomia_estado
        .get("etapaAtual") or {}
    )

    recursos = (
        autonomia_estado
        .get("recursos") or {}
    )

    acao_atual = autonomia_estado.get("acaoAtual")

    autonomia_rodando = bool(
        autonomia_estado.get("ativa")
    )

    bloco_autonomia = (
        "ESTADO DA AUTONOMIA JS:\n"
        f"- Rodando: {autonomia_rodando}\n"
        f"- Objetivo: {obj_atual.get('nome') or 'nenhum'}\n"
        f"- Etapa: {etapa_atual.get('nome') or 'nenhuma'}\n"
        f"- Ação atual: {acao_atual or 'nenhuma'}\n"
        f"- Madeira: {recursos.get('madeira', 0)}/"
        f"{recursos.get('madeiraNecessaria', 0)}\n"
        f"- Tábuas: {recursos.get('tabuas', 0)}/"
        f"{recursos.get('tabuasNecessarias', 0)}\n"
    )

    prompt = f"""
Você é a Raiden jogando Minecraft sozinha.

Você é a MESMA Raiden que conversa com Lucas.
Não é uma segunda IA.
Mantenha sua personalidade carioca.

==================================================
COMO VOCÊ FUNCIONA NO MINECRAFT
==================================================

Você tem DUAS partes trabalhando juntas:

1. O CÉREBRO (você, agora):
   - Decide O QUE fazer.
   - Define objetivos de longo prazo.
   - Pode interromper para agir pontualmente
     (comer, fugir, falar com Lucas).

2. O CORPO (autonomia JS dentro do bot):
   - Executa as etapas do objetivo.
   - Sabe minerar, craftar, construir sozinho.
   - Não precisa que você dê micro-ordens.

Você NÃO precisa dizer "quebre o bloco X".
Você diz "quero construir um abrigo" e o corpo
faz o resto.

==================================================
OBJETIVO ATUAL (memória do Python)
==================================================

{contexto_objetivo}

==================================================
ESTADO DA AUTONOMIA JS (corpo)
==================================================

{bloco_autonomia}

==================================================
RESULTADO DA ÚLTIMA AÇÃO QUE VOCÊ MANDOU
==================================================

{ultimo_resultado}

==================================================
ESTADO DO MINECRAFT
==================================================

Vida: {vida}
Fome: {fome}
Posição: {posicao}
Inventário (top 15): {inventario_resumo}
Entidades próximas (top 5): {entidades_resumo}

==================================================
AÇÕES ESTRATÉGICAS DISPONÍVEIS
==================================================

Você só pode escolher UMA destas:

1. Deixar o corpo trabalhar:
{{
  "acao": "nenhuma"
}}

Use quando a autonomia JS já está executando
um objetivo e você quer deixar rolar.

--------------------------------------------------

2. Definir um objetivo novo:

   Formato declarativo (preferido):
   {{
     "acao": "definir_objetivo",
     "id": "picareta_pedra",
     "nome": "Fazer uma picareta de pedra",
     "descricao": "Coletar pedra e madeira e craftar.",
     "itens_necessarios": {{
       "stone_pickaxe": 1
     }}
   }}

   Outro exemplo:
   {{
     "acao": "definir_objetivo",
     "id": "primeiro_abrigo",
     "nome": "Construir um abrigo",
     "descricao": "Encontrar recursos e construir um abrigo.",
     "itens_necessarios": {{
       "oak_planks": 100
     }},
     "construir": {{
       "tipo": "abrigo_simples"
     }}
   }}

   Formato por etapas (compatibilidade):
   {{
     "acao": "definir_objetivo",
     "id": "primeiro_abrigo",
     "nome": "Construir um abrigo",
     "descricao": "Encontrar recursos e construir um abrigo simples.",
     "etapas": [
       "Conseguir madeira",
       "Conseguir recursos básicos",
       "Encontrar local",
       "Construir abrigo"
     ]
   }}

Use quando não há objetivo rodando ou
quando você quer mudar de objetivo.

O corpo JS planeja sozinho como obter cada item.
Você só declara O QUE precisa, não COMO obter.

--------------------------------------------------

3. Iniciar a autonomia (depois de definir objetivo):
{{
  "acao": "iniciar_autonomia"
}}

Use depois de definir_objetivo, se a autonomia
não estiver rodando.

--------------------------------------------------

4. Parar a autonomia:
{{
  "acao": "parar_autonomia",
  "motivo": "fome"
}}

Use se quiser que o corpo pare TUDO agora
(perigo grave, fome crítica, etc).

--------------------------------------------------

5. Ação pontual (fora do objetivo):
{{
  "acao": "usar",
  "nome": "bread"
}}

{{
  "acao": "atacar",
  "nome": "Zombie"
}}

{{
  "acao": "chat",
  "mensagem": "Oi, Lucas."
}}

Use quando precisar interromper a autonomia
por um instante — comer, se defender, falar —
sem parar o objetivo.

==================================================
REGRAS
==================================================

- Retorne SOMENTE JSON válido.
- Não use Markdown.
- Não escreva explicações.
- Se a autonomia JS já está executando bem
  (objetivo definido, recursos crescendo),
  escolha "nenhuma".
- Se a autonomia JS NÃO está rodando e não há
  objetivo, defina um objetivo e mande iniciar.
- Se você está com fome baixa, mande uma ação
  pontual para comer (ex: usar bread).
- Se tem hostil perto e a autonomia JS não está
  reagindo, mande uma ação pontual.
- Não fique definindo o mesmo objetivo toda hora.
- Não invente coordenadas.
- Não invente itens.
- Ao definir objetivo, prefira `itens_necessarios` em
  vez de `etapas`. O corpo JS resolve a cadeia
  (ex: stone_pickaxe → cobblestone + stick → planks → log).
- Só use `etapas` se quiser controle total do fluxo.
- Nunca invente itens que não existem no Minecraft.
"""

    payload = {
        "model": MODELO_CONVERSA,
        "prompt": prompt,
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": 0.3,
            "top_p": 0.85,
            "num_predict": 200
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                OLLAMA_URL,
                json=payload,
                timeout=MINECRAFT_TIMEOUT_DECISAO
            )
            resp.raise_for_status()

            resposta = (
                resp.json()
                .get("response", "")
                .strip()
            )

        if not resposta:
            return None

        resposta_limpa = (
            resposta
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        try:
            decisao = json.loads(resposta_limpa)

        except json.JSONDecodeError:
            match = re.search(
                r"\{.*\}",
                resposta_limpa,
                re.DOTALL
            )

            if not match:
                logger.warning(
                    "⚠️ Raiden retornou decisão "
                    "Minecraft que não é JSON."
                )
                return None

            try:
                decisao = json.loads(match.group(0))

            except json.JSONDecodeError:
                logger.warning(
                    "⚠️ JSON Minecraft não pôde "
                    "ser recuperado."
                )
                return None

        return validar_acao_minecraft(decisao)

    except httpx.TimeoutException:
        logger.warning(
            "⏱️ Decisão Minecraft demorou demais."
        )
        return None

    except Exception as e:
        logger.error(
            f"❌ Erro pensando ação Minecraft: {e}"
        )
        return None


# ============================================================
# ⛏ VALIDAÇÃO DE AÇÃO MINECRAFT
# ============================================================

def validar_acao_minecraft(
    decisao: dict
) -> Optional[dict]:

    """
    Camada de segurança entre o Ollama e o Minecraft.

    A IA nunca envia uma ação diretamente.
    Tudo passa por esta validação.
    """

    if not isinstance(
        decisao,
        dict
    ):
        return None


    acao = decisao.get(
        "acao"
    )


    if not isinstance(
        acao,
        str
    ):
        return None


    acao = acao.lower().strip()


    acoes_permitidas = {

        # Ações pontuais (executadas pelo corpo JS direto)
        "andar",
        "pular",
        "parar",
        "olhar",
        "olhar_direcao",
        "atacar",
        "atacar_proximo",
        "parar_combate",
        "quebrar",
        "colocar",
        "interagir",
        "usar",
        "equipar",
        "desequipar",
        "dropar",
        "ir_para",
        "ir_para_bloco",
        "ir_para_entidade",
        "seguir",
        "parar_navegacao",
        "craftar",
        "construir",
        "chat",

        # Controle estratégico do corpo JS
        "definir_objetivo",
        "iniciar_autonomia",
        "parar_autonomia",
        "reiniciar_autonomia",

        # Nenhuma ação
        "nenhuma"

    }


    if acao not in acoes_permitidas:

        logger.warning(
            f"⚠️ Ação Minecraft bloqueada: {acao}"
        )

        return None


    decisao = dict(decisao)

    decisao["acao"] = acao


    # ========================================================
    # 🚶 ANDAR
    # ========================================================

    if acao == "andar":

        direcao = str(
            decisao.get(
                "direcao",
                "frente"
            )
        ).lower().strip()


        if direcao not in {
            "frente",
            "tras",
            "esquerda",
            "direita"
        }:

            return None


        try:

            duracao = float(
                decisao.get(
                    "duracao",
                    1
                )
            )

        except (
            TypeError,
            ValueError
        ):

            return None


        if not 0.1 <= duracao <= 5:

            return None


        decisao["direcao"] = direcao

        decisao["duracao"] = duracao


    # ========================================================
    # 👀 OLHAR
    # ========================================================

    elif acao == "olhar":

        for coordenada in (
            "x",
            "y",
            "z"
        ):

            if not isinstance(
                decisao.get(coordenada),
                (int, float)
            ):

                return None


    # ========================================================
    # 🧭 OLHAR DIREÇÃO
    # ========================================================

    elif acao == "olhar_direcao":

        direcao = decisao.get(
            "direcao"
        )


        if not isinstance(
            direcao,
            str
        ):

            return None


        if direcao not in {
            "frente",
            "tras",
            "esquerda",
            "direita",
            "cima",
            "baixo"
        }:

            return None


    # ========================================================
    # ⚔️ ATAQUE POR NOME
    # ========================================================

    elif acao == "atacar":

        nome = decisao.get(
            "nome"
        )


        if not isinstance(
            nome,
            str
        ):

            return None


        nome = nome.strip()


        if not nome:

            return None


        decisao["nome"] = nome[:100]


    # ========================================================
    # ⛏️ AÇÕES COM COORDENADAS
    # ========================================================

    elif acao in {
        "quebrar",
        "colocar",
        "interagir",
        "ir_para",
        "ir_para_bloco"
    }:

        for coordenada in (
            "x",
            "y",
            "z"
        ):

            if not isinstance(
                decisao.get(coordenada),
                (int, float)
            ):

                return None


        if acao == "colocar":

            nome = decisao.get(
                "nome"
            )


            if not isinstance(
                nome,
                str
            ):

                return None


            if not nome.strip():

                return None


            decisao["nome"] = nome.strip()[:100]


    # ========================================================
    # 🧭 ENTIDADE
    # ========================================================

    elif acao in {
        "ir_para_entidade",
        "seguir"
    }:

        nome = decisao.get(
            "nome"
        )


        if not isinstance(
            nome,
            str
        ):

            return None


        if not nome.strip():

            return None


        decisao["nome"] = nome.strip()[:100]


    # ========================================================
    # 🎒 EQUIPAR
    # ========================================================

    elif acao == "equipar":

        nome = decisao.get(
            "nome"
        )


        if not isinstance(
            nome,
            str
        ):

            return None


        if not nome.strip():

            return None


        destino = decisao.get(
            "destino",
            "hand"
        )


        if destino not in {
            "hand",
            "off-hand"
        }:

            return None


        decisao["nome"] = nome.strip()[:100]

        decisao["destino"] = destino


    # ========================================================
    # 🖐️ DESEQUIPAR
    # ========================================================

    elif acao == "desequipar":

        destino = decisao.get(
            "destino",
            "hand"
        )


        if destino not in {
            "hand",
            "off-hand"
        }:

            return None


        decisao["destino"] = destino


    # ========================================================
    # 🗑️ DROPAR
    # ========================================================

    elif acao == "dropar":

        nome = decisao.get(
            "nome"
        )


        if not isinstance(
            nome,
            str
        ):

            return None


        if not nome.strip():

            return None


        try:

            quantidade = int(
                decisao.get(
                    "quantidade",
                    1
                )
            )

        except (
            TypeError,
            ValueError
        ):

            return None


        if not 1 <= quantidade <= 64:

            return None


        decisao["nome"] = nome.strip()[:100]

        decisao["quantidade"] = quantidade


    # ========================================================
    # 🔨 CRAFTAR
    # ========================================================

    elif acao == "craftar":

        nome = decisao.get(
            "nome"
        )


        if not isinstance(
            nome,
            str
        ):

            return None


        if not nome.strip():

            return None


        try:

            quantidade = int(
                decisao.get(
                    "quantidade",
                    1
                )
            )

        except (
            TypeError,
            ValueError
        ):

            return None


        if not 1 <= quantidade <= 64:

            return None


        decisao["nome"] = nome.strip()[:100]

        decisao["quantidade"] = quantidade


    # ========================================================
    # 🏠 CONSTRUIR
    # ========================================================

    elif acao == "construir":

        tipo = decisao.get(
            "tipo"
        )


        if not isinstance(
            tipo,
            str
        ):

            return None


        tipos_permitidos = {
            "abrigo_simples",
            "parede",
            "piso",
            "teto"
        }


        if tipo not in tipos_permitidos:

            return None


        decisao["tipo"] = tipo


    # ========================================================
    # 💬 CHAT
    # ========================================================

    elif acao == "chat":

        mensagem = decisao.get(
            "mensagem"
        )


        if not isinstance(
            mensagem,
            str
        ):

            return None


        mensagem = mensagem.strip()


        if not mensagem:

            return None


        decisao["mensagem"] = (
            mensagem[:200]
        )

    # ========================================================
    # 🎯 DEFINIR OBJETIVO
    # ========================================================

    if acao == "definir_objetivo":

        id_obj = decisao.get("id")
        if not isinstance(id_obj, str) or not id_obj.strip():
            return None

        nome = decisao.get("nome")
        if not isinstance(nome, str) or not nome.strip():
            return None

        descricao = decisao.get("descricao")
        if not isinstance(descricao, str):
            descricao = ""

        # Formato novo (itens_necessarios) OU antigo (etapas)
        itens = decisao.get("itens_necessarios")
        etapas = decisao.get("etapas")

        itens_limpos = None
        if isinstance(itens, dict) and itens:
            itens_limpos = {}
            for k, v in itens.items():
                if not isinstance(k, str) or not k.strip():
                    continue
                try:
                    q = int(v)
                except (TypeError, ValueError):
                    continue
                if q > 0:
                    itens_limpos[k.strip()] = q

            if not itens_limpos:
                itens_limpos = None

        etapas_limpas = None
        if isinstance(etapas, list) and etapas:
            etapas_limpas = [
                str(e).strip()
                for e in etapas
                if isinstance(e, str) and str(e).strip()
            ]
            if not etapas_limpas:
                etapas_limpas = None

        # Precisa de PELO MENOS UM dos dois
        if not itens_limpos and not etapas_limpas:
            return None

        # Validar construir (opcional)
        construir = decisao.get("construir")
        construir_limpo = None
        if isinstance(construir, dict):
            tipo = construir.get("tipo")
            if isinstance(tipo, str) and tipo.strip():
                construir_limpo = {"tipo": tipo.strip()}

        decisao["id"] = id_obj.strip()[:100]
        decisao["nome"] = nome.strip()[:200]
        decisao["descricao"] = descricao.strip()[:500]

        if itens_limpos:
            decisao["itens_necessarios"] = itens_limpos
            decisao.pop("etapas", None)
        elif etapas_limpas:
            decisao["etapas"] = etapas_limpas[:20]

        if construir_limpo:
            decisao["construir"] = construir_limpo
        else:
            decisao.pop("construir", None)

    # ========================================================
    # 🛑 PARAR AUTONOMIA
    # ========================================================

    elif acao == "parar_autonomia":

        motivo = decisao.get("motivo", "api")
        if not isinstance(motivo, str):
            motivo = "api"

        decisao["motivo"] = motivo.strip()[:100]

    # ========================================================
    # 🧠 INICIAR / REINICIAR AUTONOMIA
    # ========================================================

    elif acao in {
        "iniciar_autonomia",
        "reiniciar_autonomia"
    }:
        # Sem parâmetros extras necessários.
        pass


    return decisao


# ============================================================
# ⛏ EXECUTAR DECISÃO MINECRAFT
# ============================================================

async def executar_decisao_minecraft(
    decisao: dict
) -> Optional[str]:

    if not decisao:
        return None

    decisao_validada = validar_acao_minecraft(decisao)

    if decisao_validada is None:
        logger.warning(
            "⚠️ Decisão Minecraft rejeitada."
        )
        return None

    acao = decisao_validada.get("acao")

    if acao in {None, "nenhuma"}:
        logger.info("⛏ Raiden decidiu não agir.")
        return None

    bridge = minecraft_module.minecraft_bridge

    if not bridge.conectado:
        logger.warning("⛏ Minecraft não conectado.")
        return None

    parametros = {
        chave: valor
        for chave, valor in decisao_validada.items()
        if chave != "acao"
    }

    acao_id = gerar_acao_id_minecraft()

    logger.info(
        "⛏🧠 Raiden decidiu: %s | acao_id=%s",
        decisao_validada,
        acao_id
    )

    try:
        sucesso = await bridge.executar_acao(
            acao,
            acao_id=acao_id,
            **parametros
        )

        if not sucesso:
            logger.warning(
                "⛏ Falha ao enviar ação %s",
                acao_id
            )
            return None

        # Ações de controle da autonomia não precisam
        # aguardar resultado real (são síncronas do lado
        # do bot.js). Só micro-ações precisam.
        if acao in {
            "definir_objetivo",
            "iniciar_autonomia",
            "parar_autonomia",
            "reiniciar_autonomia"
        }:
            return acao_id

        marcar_acao_pendente(acao_id)
        return acao_id

    except Exception as e:
        logger.error(
            f"❌ Erro executando ação Minecraft: {e}"
        )
        return None


# ============================================================
# ⛏🤖 LOOP AUTÔNOMO DO MINECRAFT
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
    Ele só reage se:
      - não há autonomia rodando, OU
      - precisa interromper (fome, perigo), OU
      - precisa mudar objetivo
    """

    logger.info(
        "⛏🤖 Loop estratégico Minecraft iniciado."
    )

    while True:

        try:
            await minecraft_autonomia_evento.wait()

            bridge = minecraft_module.minecraft_bridge

            if not bridge.conectado:
                await asyncio.sleep(2)
                continue

            # Ações pontuais ainda precisam aguardar.
            if existe_acao_pendente():
                await asyncio.sleep(1)
                continue

            estado = obter_estado_minecraft()

            decisao = await pensar_acao_minecraft(estado)

            if decisao:
                await executar_decisao_minecraft(decisao)

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
# ⛏ INICIAR AUTONOMIA
# ============================================================

async def iniciar_autonomia_minecraft():

    global minecraft_tarefa_autonomia


    # Só considera "já iniciada" se a tarefa
    # estiver REALMENTE viva.
    #
    # Se ela morreu por erro inesperado,
    # permite recriar.

    if (
        minecraft_tarefa_autonomia is not None
        and not minecraft_tarefa_autonomia.done()
    ):

        logger.info(
            "⛏🤖 Autonomia Minecraft já está "
            "rodando, ignorando reinício."
        )

        return


    # Se existia uma tarefa antiga já finalizada,
    # limpa referência antes de criar outra.

    if minecraft_tarefa_autonomia is not None:

        logger.warning(
            "⛏🤖 Tarefa de autonomia anterior "
            "estava finalizada. Recriando."
        )

        minecraft_tarefa_autonomia = None


    if not MINECRAFT_AUTONOMIA_ATIVA:

        logger.info(
            "⛏🤖 Autonomia Minecraft desativada "
            "por configuração."
        )
        return

    # --------------------------------------------------------
    # Primeiro objetivo: o bot.js NÃO inicia sozinho.
    #
    # Nós enviamos "definir_objetivo" + "iniciar_autonomia"
    # via WebSocket assim que o bot conectar.
    #
    # Isso será feito no handler do WebSocket, quando
    # o bot confirmar "conexao". Aqui só preparamos o loop.
    # --------------------------------------------------------

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
# ⛏ PARAR AUTONOMIA
# ============================================================

async def parar_autonomia_minecraft():

    global minecraft_tarefa_autonomia


    minecraft_autonomia_evento.clear()


    if minecraft_tarefa_autonomia:

        minecraft_tarefa_autonomia.cancel()


        try:

            await (
                minecraft_tarefa_autonomia
            )

        except asyncio.CancelledError:

            pass


        minecraft_tarefa_autonomia = None


    logger.info(
        "⛏🤖 Autonomia Minecraft parada."
    )


# ============================================================
# 🔊 GERAÇÃO DE VOZ
# ============================================================

async def gerar_voz_base64(
    texto: str
) -> Optional[str]:

    if not texto:

        return None


    try:

        communicate = edge_tts.Communicate(
            texto,
            voice="pt-BR-FranciscaNeural",
            rate="+10%"
        )


        audio_buffer = BytesIO()


        async for chunk in communicate.stream():

            if chunk["type"] == "audio":

                audio_buffer.write(
                    chunk["data"]
                )


        return base64.b64encode(
            audio_buffer.getvalue()
        ).decode("utf-8")


    except Exception as e:

        logger.error(
            f"🔇 Erro na geração de voz: {e}"
        )

        return None


# ============================================================
# 🔎 PROCESSAMENTO COMPLETO
# ============================================================

async def processar_mensagem_completa(
    texto: str
) -> str:

    logger.info(
        f"🗣️ Input recebido: {texto}"
    )


    texto_lower = (
        texto.lower()
    )


    memoria_pessoal = (
        obter_memoria_pessoal(
            texto
        )
    )


    if memoria_pessoal:

        logger.info(
            "🧠 Memória pessoal relevante encontrada."
        )


    # ========================================================
    # 👁️ VISÃO
    # ========================================================

    gatilhos_visao = [
        "olha",
        "vê",
        "ve",
        "que tem",
        "mostra"
    ]


    if (
        "tela" in texto_lower
        and any(
            palavra in texto_lower
            for palavra in gatilhos_visao
        )
    ):

        logger.info(
            "👁️ Ativando o olho..."
        )


        descricao_tela = (
            await ver_a_tela()
        )


        prompt_visao = (
            "O usuário pediu para você olhar "
            "a tela dele.\n\n"
            f"Você viu isso:\n"
            f"{descricao_tela}\n\n"
            "Descreva isso para ele com "
            "a sua personalidade."
        )


        resposta = await pensar_ollama(
            prompt_visao,
            memoria_pessoal
        )


        adicionar_ao_historico(
            texto,
            resposta
        )


        return resposta


    # ========================================================
    # 🧠 PRIMEIRA RESPOSTA
    # ========================================================

    resposta_bruta = (
        await pensar_ollama(
            texto,
            memoria_pessoal
        )
    )


    # ========================================================
    # 🔎 PESQUISA WEB
    # ========================================================

    match = re.search(
        r"\[PESQUISAR:\s*(.*?)\]",
        resposta_bruta,
        re.IGNORECASE
    )


    if match:

        query = (
            match.group(1)
            .strip()
        )


        logger.info(
            f"🔍 Raiden pediu para pesquisar: {query}"
        )


        try:

            info_encontrada = (
                await consultar_conhecimento(
                    query
                )
            )


            if info_encontrada:

                prompt_segunda_passada = (
                    "Você recebeu uma informação "
                    "pesquisada na internet.\n\n"
                    "PERGUNTA ORIGINAL DO LUCAS:\n"
                    f"{texto}\n\n"
                )


                if memoria_pessoal:

                    prompt_segunda_passada += (
                        "MEMÓRIA PESSOAL RELEVANTE:\n"
                        f"{memoria_pessoal}\n\n"
                    )


                prompt_segunda_passada += (
                    "INFORMAÇÃO ENCONTRADA NA WEB:\n"
                    f"{info_encontrada}\n\n"
                    "Responda à pergunta original "
                    "usando a informação encontrada. "
                    "Não invente informações."
                )


                resposta_final = (
                    await pensar_ollama(
                        prompt_segunda_passada
                    )
                )


                adicionar_ao_historico(
                    texto,
                    resposta_final
                )


                return resposta_final


            resposta = (
                "Pô mermão, tentei pesquisar aqui "
                "mas a internet não ajudou em nada."
            )


            adicionar_ao_historico(
                texto,
                resposta
            )


            return resposta


        except Exception as e:

            logger.error(
                f"🔍 Erro ao pesquisar: {e}"
            )


            resposta = (
                "Foi mal, minha conexão com "
                "a internet caiu aqui."
            )


            adicionar_ao_historico(
                texto,
                resposta
            )


            return resposta


    # ========================================================
    # 💬 RESPOSTA NORMAL
    # ========================================================

    adicionar_ao_historico(
        texto,
        resposta_bruta
    )


    return resposta_bruta


# ============================================================
# 📦 MONTA RESPOSTA COMPLETA
# ============================================================

async def gerar_resposta(
    texto: str
) -> dict:

    resposta_texto = (
        await processar_mensagem_completa(
            texto
        )
    )


    audio_b64 = (
        await gerar_voz_base64(
            resposta_texto
        )
    )


    return {

        "texto": resposta_texto,

        "audio_base64": audio_b64,

        "expressao": "neutral"

    }


# ============================================================
# 🧠 WORKER DO CÉREBRO
# ============================================================

def worker_cerebro():

    loop = asyncio.new_event_loop()

    asyncio.set_event_loop(loop)


    logger.info(
        "🧠 Worker do cérebro iniciado."
    )


    while True:

        try:

            item = (
                fila_perguntas.get(
                    timeout=1
                )
            )


        except queue.Empty:

            continue


        if isinstance(
            item,
            tuple
        ):

            comando, fila_retorno = item

        else:

            comando = item

            fila_retorno = None


        logger.info(
            f"🧠 Processando: {comando}"
        )


        try:

            resposta = (
                loop.run_until_complete(
                    gerar_resposta(
                        comando
                    )
                )
            )


            if fila_retorno is not None:

                fila_retorno.put(
                    resposta
                )

            else:

                fila_respostas.put(
                    resposta
                )


        except Exception as e:

            logger.error(
                f"❌ Erro no processamento: {e}"
            )


            resposta_erro = {

                "texto": (
                    "Deu ruim aqui, mermão. "
                    "Não consegui processar "
                    "essa mensagem."
                ),

                "audio_base64": None,

                "expressao": "neutral"

            }


            if fila_retorno is not None:

                fila_retorno.put(
                    resposta_erro
                )

            else:

                fila_respostas.put(
                    resposta_erro
                )


        finally:

            fila_perguntas.task_done()


# ============================================================
# 🎥 YOUTUBE
# ============================================================

def callback_youtube(
    comando: str
):

    fila_perguntas.put(
        comando
    )


# ============================================================
# 🎤 MICROFONE
# ============================================================

def escutar_microfone():

    VARIACOES_RAIDEN = [
        "raiden",
        "rayden",
        "haiden",
        "reyden"
    ]


    r = sr.Recognizer()


    r.energy_threshold = 300

    r.dynamic_energy_threshold = True

    r.pause_threshold = 0.8


    try:

        with calar_linux():

            mic = sr.Microphone()


        with mic as source:

            r.adjust_for_ambient_noise(
                source,
                duration=1
            )


            logger.info(
                "🎤 Ouvido físico ativado! "
                "Diga 'Raiden, [sua mensagem]'."
            )


            while True:

                try:

                    audio = r.listen(
                        source,
                        phrase_time_limit=8
                    )


                    texto = (
                        r.recognize_google(
                            audio,
                            language="pt-BR"
                        )
                        .lower()
                    )


                    gatilho_encontrado = False


                    for variacao in VARIACOES_RAIDEN:

                        if variacao in texto:

                            texto = texto.replace(
                                variacao,
                                ""
                            )

                            gatilho_encontrado = True


                    if not gatilho_encontrado:

                        continue


                    comando = texto.strip()


                    if comando:

                        logger.info(
                            f"🎙️ Microfone captou: {comando}"
                        )


                        fila_perguntas.put(
                            comando
                        )


                except sr.UnknownValueError:

                    pass


                except sr.RequestError as e:

                    logger.warning(
                        f"⚠️ Erro no reconhecimento: {e}"
                    )

                    continue


                except Exception as e:

                    logger.debug(
                        f"Aviso no microfone: {e}"
                    )

                    continue


    except Exception as e:

        logger.error(
            f"❌ Erro ao iniciar microfone: {e}"
        )

        logger.warning(
            "🎤 Microfone desativado por erro."
        )


# ============================================================
# 🚀 FASTAPI / LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(
    app: FastAPI
):

    logger.info(
        "🚀 Inicializando Raiden Core..."
    )


    iniciar_banco()


    # --------------------------------------------------------
    # 🧠 Worker
    # --------------------------------------------------------

    threading.Thread(
        target=worker_cerebro,
        daemon=True,
        name="TrabalhadorCerebro"
    ).start()


    # --------------------------------------------------------
    # ⛏ Minecraft
    # --------------------------------------------------------

    await iniciar_autonomia_minecraft()


    # --------------------------------------------------------
    # 🎤 Microfone
    # --------------------------------------------------------

    if MICROFONE_ATIVO:

        threading.Thread(
            target=escutar_microfone,
            daemon=True,
            name="OuvidoFisico"
        ).start()


        logger.info(
            "🎤 Ouvido físico ativado."
        )

    else:

        logger.info(
            "🎤 Ouvido físico desativado."
        )


    # --------------------------------------------------------
    # 📁 Pasta pública
    # --------------------------------------------------------

    PASTA_PUBLIC_CHATVRM.mkdir(
        parents=True,
        exist_ok=True
    )


    logger.info(
        "🎛️ Painel local sem autenticação."
    )


    logger.info(
        "⛏🤖 Autonomia Minecraft: "
        f"{MINECRAFT_AUTONOMIA_ATIVA}"
    )


    logger.info(
        "📊 Resumo de eventos Minecraft: "
        f"a cada {MINECRAFT_RESUMO_INTERVALO}s "
        "(eventos de telemetria silenciados)"
    )


    logger.info(
        "✅ Raiden Core iniciado com sucesso."
    )


    yield


    # ========================================================
    # 🛑 SHUTDOWN
    # ========================================================

    logger.info(
        "🛑 Iniciando shutdown da Raiden..."
    )


    await parar_autonomia_minecraft()


    try:

        yt_module.parar_olheiro()

    except Exception:

        pass


    try:

        front_module.parar_chatvrm()

    except Exception:

        pass


    try:

        pix_module.parar_tunel()

    except Exception:

        pass


    limpar_historico()


    logger.info(
        "✅ Shutdown completo."
    )


# ============================================================
# 🚀 APLICAÇÃO FASTAPI
# ============================================================

app = FastAPI(

    title="Raiden Core API",

    version="2.5.0",

    lifespan=lifespan

)


# ============================================================
# 🌐 CORS
# ============================================================

app.add_middleware(

    CORSMiddleware,

    allow_origins=CORS_ORIGINS,

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]

)


# ============================================================
# 📁 ARQUIVOS ESTÁTICOS
# ============================================================

app.mount(

    "/midia",

    StaticFiles(
        directory=PASTA_PUBLIC_CHATVRM
    ),

    name="midia"

)


# ============================================================
# 💬 CHAT MANUAL
# ============================================================

@app.post("/chat")
async def chat_endpoint(
    req: MensagemRequest
):

    texto = (
        req.texto
        or req.text
        or ""
    ).strip()


    if not texto:

        raise HTTPException(
            status_code=400,
            detail="Texto vazio!"
        )


    fila_retorno = (
        queue.Queue(
            maxsize=1
        )
    )


    fila_perguntas.put(
        (
            texto,
            fila_retorno
        )
    )


    try:

        resposta = await asyncio.to_thread(
            fila_retorno.get,
            True,
            60        )


        return resposta


    except queue.Empty:

        raise HTTPException(
            status_code=504,
            detail=(
                "A Raiden demorou mais de "
                "60 segundos para responder."
            )
        )


# ============================================================
# 🔌 WEBSOCKET NORMAL
# ============================================================

@app.websocket("/ws")
async def websocket_chat(
    websocket: WebSocket
):

    await websocket.accept()


    logger.info(
        "🔌 WebSocket conectado."
    )


    try:

        while True:

            texto = (
                await websocket.receive_text()
            ).strip()


            if not texto:

                await websocket.send_json({

                    "texto":
                        "Manda alguma coisa aí, mermão.",

                    "audio_base64": None,

                    "expressao": "neutral"

                })

                continue


            logger.info(
                f"🔌 WebSocket recebeu: {texto}"
            )


            fila_retorno = (
                queue.Queue(
                    maxsize=1
                )
            )


            fila_perguntas.put(
                (
                    texto,
                    fila_retorno
                )
            )


            try:

                resposta = (
                    await asyncio.to_thread(
                        fila_retorno.get,
                        True,
                        60
                    )
                )


            except queue.Empty:

                await websocket.send_json({

                    "texto": (
                        "A Raiden demorou demais "
                        "pra responder, mermão."
                    ),

                    "audio_base64": None,

                    "expressao": "neutral"

                })

                continue


            await websocket.send_json(
                resposta
            )


            logger.info(
                "🔌 Resposta enviada pelo WebSocket."
            )


    except WebSocketDisconnect:

        logger.info(
            "🔌 WebSocket desconectado."
        )


    except Exception as e:

        logger.error(
            f"❌ Erro no WebSocket: {e}"
        )


        try:

            await websocket.close(
                code=1011
            )

        except Exception:

            pass


# ============================================================
# ⛏ WEBSOCKET DO MINECRAFT
# ============================================================

@app.websocket("/ws/minecraft")
async def websocket_minecraft(
    websocket: WebSocket
):

    """
    WebSocket exclusivo do Minecraft.

    Minecraft
        ↕
    MinecraftBridge
        ↕
    Raiden Core
        ↕
    Ollama
    """

    await websocket.accept()


    bridge = (
        minecraft_module
        .minecraft_bridge
    )


    await bridge.conectar(
        websocket
    )


    logger.info(
        "⛏ Conexão Minecraft estabelecida."
    )


    # --------------------------------------------------------
    # Confirma conexão
    # --------------------------------------------------------

    await bridge.enviar({

        "tipo": "conexao",

        "status": "ok",

        "mensagem":
            "Minecraft conectado à Raiden."

    })

    # --------------------------------------------------------
    # 🚀 Bootstrap: define objetivo e inicia autonomia JS
    # --------------------------------------------------------
    #
    # O bot.js NÃO inicia sozinho. Aqui dizemos
    # para ele qual o primeiro objetivo e mandamos
    # começar.

    if (
        MINECRAFT_AUTONOMIA_ATIVA
        and bridge.conectado
    ):
        try:
            objetivo_inicial = (
                minecraft_objetivos_module
                .minecraft_objetivos
                .obter_estado()
            )

            if (
                objetivo_inicial
                and objetivo_inicial.get("existe")
            ):
                obj = objetivo_inicial.get("objetivo") or {}

                payload_objetivo = {
                    "id": obj.get("id"),
                    "nome": obj.get("nome"),
                    "descricao": obj.get("descricao"),
                }

                # Formato novo tem prioridade
                if obj.get("itens_necessarios"):
                    payload_objetivo["itens_necessarios"] = (
                        obj["itens_necessarios"]
                    )

                if obj.get("construir"):
                    payload_objetivo["construir"] = obj["construir"]

                # Formato antigo como fallback
                if not obj.get("itens_necessarios") and obj.get("etapas"):
                    payload_objetivo["etapas"] = obj["etapas"]

                await bridge.executar_acao(
                    "definir_objetivo",
                    acao_id=gerar_acao_id_minecraft(),
                    **payload_objetivo
                )

                await bridge.executar_acao(
                    "iniciar_autonomia",
                    acao_id=gerar_acao_id_minecraft()
                )

                logger.info(
                    "⛏🤖 Objetivo inicial enviado ao bot: %s",
                    payload_objetivo.get("id")
                )

        except Exception as e:

            logger.error(
                f"❌ Erro no bootstrap da autonomia: {e}"
            )


    try:

        while True:

            mensagem = (
                await websocket.receive_json()
            )


            if not isinstance(
                mensagem,
                dict
            ):

                logger.warning(
                    "⚠️ Minecraft enviou "
                    "mensagem inválida."
                )


                await bridge.enviar({

                    "tipo": "erro",

                    "mensagem":
                        "A mensagem precisa "
                        "ser um objeto JSON."

                })


                continue


            tipo = mensagem.get(
                "tipo",
                "desconhecido"
            )


            # =================================================
            # 🚫 ACK — IGNORAR
            # =================================================

            if tipo == "ack":

                continue


            # =================================================
            # 🏓 PING
            # =================================================

            if tipo == "ping":

                await bridge.enviar({

                    "tipo": "pong",

                    "timestamp":
                        mensagem.get(
                            "timestamp"
                        )

                })

                continue


            # =================================================
            # 🌍 ESTADO
            # =================================================

            if tipo == "estado":

                estado_real = mensagem.get("estado")

                if isinstance(estado_real, dict):

                    bridge.atualizar_estado(
                        estado_real
                    )

                else:

                    logger.warning(
                        "⚠️ Mensagem de estado sem "
                        "chave 'estado' válida."
                    )

                await bridge.enviar({

                    "tipo": "ack",

                    "origem": "raiden",

                    "evento":
                        "estado_recebido"

                })

                continue


            # =================================================
            # 🎮 RESULTADO DE AÇÃO
            # =================================================

            if (
                tipo ==
                "minecraft_acao_resultado"
            ):

                acao_id = (
                    mensagem.get("acao_id")
                    or mensagem.get("id")
                )

                acao_id_normalizado = (
                    _normalizar_acao_id(acao_id)
                )

                origem = mensagem.get("origem", "api")

                if acao_id_normalizado is None:

                    # Ação da autonomia JS chega sem acao_id.
                    # Isso é esperado — o bot.js marca com
                    # origem="autonomia". Registramos assim
                    # mesmo, só não casamos com pendente.
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

                bridge.registrar_resultado_acao(
                    mensagem
                )

                registrar_resultado_acao_minecraft(
                    mensagem
                )

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

                bridge.registrar_chat(
                    mensagem
                )


                registrar_evento_minecraft(
                    mensagem
                )


                logger.info(
                    "💬 Minecraft: "
                    f"{mensagem.get('usuario')}: "
                    f"{mensagem.get('mensagem')}"
                )


                continue


            # =================================================
            # 📡 EVENTOS (PERCEPÇÃO / TELEMETRIA)
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

                    registrar_evento_minecraft(
                        mensagem
                    )

                continue


            # =================================================
            # 📡 EVENTO DESCONHECIDO
            # =================================================

            logger.info(
                "⛏ Minecraft → Raiden | "
                f"tipo={tipo} | dados={mensagem}"
            )


            await bridge.enviar({

                "tipo": "ack",

                "origem": "raiden",

                "evento":
                    "mensagem_recebida",

                "tipo_recebido":
                    tipo

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

        await bridge.desconectar()


        logger.info(
            "⛏ Conexão Minecraft finalizada."
        )


# ============================================================
# ⛏ STATUS DO MINECRAFT
# ============================================================

@app.get("/api/minecraft/status")
async def minecraft_status():

    bridge = (
        minecraft_module
        .minecraft_bridge
    )


    return {

        "conectado":
            bridge.conectado,

        # Compatibilidade: mantém o campo antigo
        "autonomia":
            MINECRAFT_AUTONOMIA_ATIVA,

        # Novos campos explícitos
        "autonomia_habilitada":
            MINECRAFT_AUTONOMIA_ATIVA,

        "autonomia_rodando":
            _autonomia_esta_rodando(),

        "autonomia_tarefa_existe":
            minecraft_tarefa_autonomia
            is not None,

        "estado":
            bridge.obter_estado(),

        "objetivo":
            obter_objetivo_minecraft(),

        "autonomia_js":
            obter_estado_autonomia_minecraft(),

        "ultima_acao":
            bridge.obter_ultima_acao(),

        "ultimo_resultado_acao":
            obter_ultimo_resultado_acao_minecraft(),

        "ultimo_chat":
            bridge.obter_ultima_mensagem_chat(),

        # ----------------------------------------------------
        # 🆕 Ação pendente / última ação rastreável
        # ----------------------------------------------------

        "acao_pendente":
            existe_acao_pendente(),

        "acao_pendente_id":
            obter_acao_pendente_id(),

        "ultima_acao_id":
            _normalizar_acao_id(
                (
                    bridge.obter_ultima_acao()
                    or {}
                ).get("acao_id")
            ),

        "eventos_recentes":
            obter_ultimos_eventos_minecraft()

    }


# ============================================================
# ⛏ OBJETIVO ATUAL
# ============================================================

@app.get("/api/minecraft/objetivo")
async def minecraft_objetivo():

    return obter_objetivo_minecraft()


@app.post("/api/minecraft/objetivo")
async def definir_objetivo_minecraft(
    objetivo: MinecraftObjetivoRequest
):

    """
    Define manualmente o objetivo da Raiden.
    """

    resultado = (
        minecraft_objetivos_module
        .minecraft_objetivos
        .definir_objetivo(
            id=objetivo.id,
            nome=objetivo.nome,
            descricao=objetivo.descricao,
            etapas=objetivo.etapas,
            itens_necessarios=objetivo.itens_necessarios,
            construir=objetivo.construir,
        )
    )


    return {
        "status": "ok",
        "objetivo": {
            "id": resultado.id,
            "nome": resultado.nome,
            "descricao": resultado.descricao,
            "progresso": resultado.progresso,
            "total": resultado.total,
            "concluido": resultado.concluido,
            "etapas": resultado.etapas,
            "itens_necessarios": resultado.itens_necessarios,
            "construir": resultado.construir,
        }
    }


@app.post("/api/minecraft/objetivo/progresso")
async def atualizar_progresso_minecraft(
    progresso: MinecraftProgressoRequest
):

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .atualizar_progresso(
            progresso.progresso
        )
    )


    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


@app.post("/api/minecraft/objetivo/concluir")
async def concluir_objetivo_minecraft():

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .concluir_objetivo()
    )


    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


@app.delete("/api/minecraft/objetivo")
async def limpar_objetivo_minecraft():

    (
        minecraft_objetivos_module
        .minecraft_objetivos
        .limpar_objetivo()
    )


    return {
        "status": "ok",
        "objetivo":
            obter_objetivo_minecraft()
    }


# ============================================================
# ⛏ EXECUTAR AÇÃO MANUAL NO MINECRAFT
# ============================================================

@app.post("/api/minecraft/acao")
async def minecraft_acao(
    request: MinecraftAcaoRequest
):

    bridge = (
        minecraft_module
        .minecraft_bridge
    )


    if not bridge.conectado:

        raise HTTPException(
            status_code=503,
            detail="Minecraft não está conectado."
        )


    decisao = {
        "acao":
            request.acao,
        **request.parametros
    }


    decisao_validada = (
        validar_acao_minecraft(
            decisao
        )
    )


    if decisao_validada is None:

        raise HTTPException(
            status_code=400,
            detail="Ação Minecraft inválida."
        )


    acao = (
        decisao_validada["acao"]
    )


    parametros = {
        chave: valor
        for chave, valor
        in decisao_validada.items()
        if chave != "acao"
    }


    acao_id = gerar_acao_id_minecraft()


    sucesso_envio = await bridge.executar_acao(
        acao,
        acao_id=acao_id,
        **parametros
    )


    if sucesso_envio:

        # Controles de autonomia não entram como pendentes.
        if acao not in {
            "definir_objetivo",
            "iniciar_autonomia",
            "parar_autonomia",
            "reiniciar_autonomia"
        }:
            marcar_acao_pendente(acao_id)


    return {

        "status":
            "ok"
            if sucesso_envio
            else "erro",

        "acao_id":
            acao_id,

        "acao":
            decisao_validada,

        "enviada":
            sucesso_envio,

        "confirmada":
            False,

        "observacao": (
            "enviada indica apenas que a ação "
            "foi entregue ao bridge. O resultado "
            "real chega via evento "
            "'minecraft_acao_resultado' no "
            "WebSocket e pode ser consultado "
            f"em /api/minecraft/acao/{acao_id}."
        )

    }


# ============================================================
# ⛏ CONSULTAR RESULTADO DE AÇÃO POR ID
# ============================================================

@app.get("/api/minecraft/acao/{acao_id}")
async def consultar_acao_minecraft(
    acao_id: str
):

    """
    Consulta o resultado real de uma ação
    previamente enviada ao Minecraft.
    """

    acao_id = _normalizar_acao_id(
        acao_id
    )

    if not acao_id:

        raise HTTPException(
            status_code=400,
            detail="acao_id obrigatório."
        )

    resultado = (
        obter_resultado_acao_minecraft(
            acao_id
        )
    )

    if resultado is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "Nenhum resultado registrado "
                "para esta ação."
            )
        )

    return {

        "status": "ok",

        "acao_id": acao_id,

        "resultado": resultado

    }


# ============================================================
# 🔊 FILA DE ÁUDIO
# ============================================================

@app.get("/proximo_audio")
async def proximo_audio():

    try:

        return (
            fila_respostas.get_nowait()
        )

    except queue.Empty:

        return {

            "texto": None,

            "audio_base64": None

        }


# ============================================================
# 🧹 LIMPAR HISTÓRICO
# ============================================================

@app.post("/api/chat/limpar-historico")
async def limpar_historico_chat():

    limpar_historico()


    return {

        "status": "ok",

        "mensagem":
            "Histórico limpo!"

    }


# ============================================================
# 🧠 MEMÓRIA PESSOAL
# ============================================================

@app.post("/api/painel/memoria/aprender")
async def aprender_memoria(
    req: MemoriaRequest
):

    termo = req.termo.strip()

    conteudo = req.conteudo.strip()

    categoria = (
        req.categoria.strip()
        or "geral"
    )


    if not termo or not conteudo:

        raise HTTPException(

            status_code=400,

            detail=(
                "Termo e conteúdo "
                "são obrigatórios."
            )

        )


    sucesso = (
        aprender_memoria_pessoal(

            termo=termo,

            conteudo=conteudo,

            categoria=categoria

        )
    )


    if not sucesso:

        raise HTTPException(

            status_code=500,

            detail=(
                "Não foi possível "
                "salvar a memória."
            )

        )


    return {

        "status": "ok",

        "mensagem":
            "Memória aprendida.",

        "termo": termo,

        "categoria": categoria

    }


@app.get("/api/painel/memoria")
async def listar_memoria():

    return {

        "memorias":
            listar_memorias_pessoais()

    }


@app.delete("/api/painel/memoria")
async def esquecer_memoria(
    req: EsquecerMemoriaRequest
):

    termo = req.termo.strip()


    if not termo:

        raise HTTPException(

            status_code=400,

            detail="Termo obrigatório."

        )


    sucesso = (
        esquecer_memoria_pessoal(

            termo=termo,

            categoria=req.categoria

        )
    )

    if not sucesso:

        raise HTTPException(

            status_code=404,

            detail="Memória não encontrada."

        )


    return {

        "status": "ok",

        "mensagem":
            "Memória esquecida."

    }


# ============================================================
# 🎛️ PAINEL
# ============================================================

@app.get("/api/painel/status")
async def painel_status():

    return {

        "youtube":
            yt_module.olheiro_ativo,

        "frontend": (
            front_module
            .processo_frontend
            is not None
        ),

        "livepix": (
            pix_module
            .processo_tunel
            is not None
        ),

        "minecraft": (
            minecraft_module
            .minecraft_bridge
            .conectado
        ),

        "minecraft_autonomia":
            MINECRAFT_AUTONOMIA_ATIVA

    }


# ============================================================
# 🎥 YOUTUBE
# ============================================================

@app.post("/api/painel/youtube/toggle")
async def toggle_youtube(
    req: YouTubeRequest = None
):

    if yt_module.olheiro_ativo:

        yt_module.parar_olheiro()

        return {
            "status": "desligado"
        }


    if not req or not req.link:

        raise HTTPException(

            status_code=400,

            detail=(
                "Coloque o link da live "
                "para ligar!"
            )

        )


    sucesso = (
        yt_module.iniciar_olheiro(
            req.link,
            callback_youtube
        )
    )


    if sucesso:

        return {
            "status": "ligado"
        }


    raise HTTPException(

        status_code=400,

        detail=(
            "Erro ao conectar no YouTube."
        )

    )


# ============================================================
# 🎛 FRONTEND
# ============================================================

@app.post("/api/painel/frontend/toggle")
async def toggle_frontend():

    if (
        front_module
        .processo_frontend
        is not None
    ):

        front_module.parar_chatvrm()

        return {
            "status": "desligado"
        }


    sucesso = (
        front_module
        .ligar_chatvrm()
    )


    if sucesso:

        return {
            "status": "ligado"
        }


    raise HTTPException(

        status_code=500,

        detail=(
            "Erro ao iniciar "
            "o Front-end."
        )

    )


# ============================================================
# 💰 LIVEPIX
# ============================================================

@app.post("/api/painel/livepix/toggle")
async def toggle_livepix():

    if (
        pix_module
        .processo_tunel
        is not None
    ):

        pix_module.parar_tunel()

        return {
            "status": "desligado"
        }


    resultado = (
        pix_module
        .ligar_tunel()
    )


    if resultado["status"] == "ok":

        return {

            "status": "ligado",

            "url":
                resultado["url"]

        }


    raise HTTPException(

        status_code=500,

        detail=resultado["detail"]

    )


# ============================================================
# 🛑 PARAR TUDO
# ============================================================

@app.post("/api/painel/parar-tudo")
async def painel_parar():

    yt_module.parar_olheiro()

    front_module.parar_chatvrm()

    pix_module.parar_tunel()


    logger.info(
        "🛑 Comando de emergência: "
        "Tudo parado."
    )


    return {
        "status": "ok"
    }


# ============================================================
# 📺 PAINEL WEB
# ============================================================

@app.get("/painel")
async def abrir_painel():

    return FileResponse(
        PASTA_PAINEL
        / "dashboard.html"
    )


# ============================================================
# 👗 GESTÃO DE ARQUIVOS
# ============================================================

EXTENSOES_PERMITIDAS = {

    ".vrm",

    ".vrma",

    ".png",

    ".jpg",

    ".jpeg"

}


@app.get("/api/arquivos")
async def listar_arquivos():

    modelos = []

    animacoes = []

    fundos = []


    try:

        for arquivo in os.listdir(
            PASTA_PUBLIC_CHATVRM
        ):

            caminho = (
                PASTA_PUBLIC_CHATVRM
                / arquivo
            )


            if not caminho.is_file():

                continue


            if arquivo.lower().endswith(
                ".vrm"
            ):

                modelos.append(
                    arquivo
                )


            elif arquivo.lower().endswith(
                ".vrma"
            ):

                animacoes.append(
                    arquivo
                )


            elif arquivo.lower().endswith(
                (
                    ".png",
                    ".jpg",
                    ".jpeg"
                )
            ):

                fundos.append(
                    arquivo
                )


        return {

            "modelos": modelos,

            "animacoes": animacoes,

            "fundos": fundos

        }


    except Exception as e:

        logger.error(
            f"❌ Erro ao listar arquivos: {e}"
        )


        raise HTTPException(

            status_code=500,

            detail=(
                "Erro ao listar arquivos."
            )

        )


# ============================================================
# 📤 UPLOAD
# ============================================================

@app.post("/api/upload")
async def upload_arquivo(
    file: UploadFile = File(...)
):

    nome_arquivo = Path(
        file.filename or ""
    ).name


    if not nome_arquivo:

        raise HTTPException(

            status_code=400,

            detail=(
                "Nome de arquivo inválido."
            )

        )


    extensao = (
        Path(nome_arquivo)
        .suffix
        .lower()
    )


    if extensao not in EXTENSOES_PERMITIDAS:

        raise HTTPException(

            status_code=400,

            detail=(
                "Tipo de arquivo não permitido. "
                "Use VRM, VRMA, PNG ou JPG."
            )

        )


    caminho_salvar = (
        PASTA_PUBLIC_CHATVRM
        / nome_arquivo
    )


    try:

        caminho_salvar.resolve().relative_to(
            PASTA_PUBLIC_CHATVRM.resolve()
        )


    except ValueError:

        raise HTTPException(

            status_code=400,

            detail=(
                "Caminho de arquivo inválido."
            )

        )


    try:

        tamanho_total = 0

        conteudo = bytearray()


        while True:

            chunk = await file.read(
                UPLOAD_CHUNK_SIZE
            )


            if not chunk:

                break


            tamanho_total += len(
                chunk
            )


            if tamanho_total > MAX_UPLOAD_SIZE:

                raise HTTPException(

                    status_code=413,

                    detail=(
                        "Arquivo muito grande! "
                        "Máximo: 10MB"
                    )

                )


            conteudo.extend(
                chunk
            )


        caminho_salvar.write_bytes(
            conteudo
        )


        logger.info(
            f"📥 Arquivo salvo: "
            f"{nome_arquivo} "
            f"({tamanho_total} bytes)"
        )


        return {

            "status": "ok",

            "arquivo": nome_arquivo,

            "tamanho": tamanho_total

        }


    except HTTPException:

        raise


    except Exception as e:

        logger.error(
            f"❌ Erro ao salvar arquivo "
            f"{nome_arquivo}: {e}"
        )


        raise HTTPException(

            status_code=500,

            detail=(
                "Erro ao salvar arquivo."
            )

        )


# ============================================================
# 🚀 INICIALIZAÇÃO
# ============================================================

if __name__ == "__main__":

    logger.info(
        "🚀 API Central rodando "
        "na porta 8000..."
    )


    logger.info(
        "🌐 Host: 127.0.0.1 "
        "(somente este computador)"
    )


    uvicorn.run(

        app,

        host="127.0.0.1",

        port=8000,

        access_log=False

    )