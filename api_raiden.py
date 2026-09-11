"""
🎌 RAIDEN - API PRINCIPAL

Core REST + Ouvido + Visão + Memória + YouTube +
ChatVRM + LivePix + Minecraft.

Minecraft:
    percepção → cérebro → decisão → ação → percepção

O Minecraft utiliza o mesmo cérebro Ollama da Raiden.
Não existe um segundo cérebro separado.
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

from collections import deque
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
from pydantic import BaseModel


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
# ⛏ CONFIGURAÇÃO DA RAÍDEN NO MINECRAFT
# ============================================================

MINECRAFT_AUTONOMIA_ATIVA = (
    os.getenv(
        "RAIDEN_MINECRAFT_AUTONOMIA",
        "1"
    ) == "1"
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

def obter_estado_minecraft() -> dict:

    return (
        minecraft_module
        .minecraft_bridge
        .obter_estado()
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
            f"Inventário: "
            f"{estado_minecraft.get('inventario')}\n"
            f"Entidades próximas: "
            f"{estado_minecraft.get('entidades')}\n"
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
# ⛏🧠 CÉREBRO DO MINECRAFT
# ============================================================

async def pensar_acao_minecraft(
    estado: dict
) -> Optional[dict]:

    """
    Faz o mesmo cérebro da Raiden decidir uma ação
    Minecraft.

    A resposta precisa ser JSON.

    Exemplo:

    {
        "acao": "andar",
        "direcao": "frente",
        "duracao": 2
    }

    ou:

    {
        "acao": "nenhuma"
    }
    """

    if not isinstance(
        estado,
        dict
    ):

        return None


    prompt = f"""
Você é a Raiden jogando Minecraft.

Você é a mesma Raiden que conversa com Lucas.
Não é uma segunda IA.
Você deve manter sua personalidade normal.

Sua função agora é observar o estado atual do Minecraft
e decidir UMA ação simples.

ESTADO ATUAL:
{json.dumps(
    estado,
    ensure_ascii=False,
    indent=2
)}

AÇÕES DISPONÍVEIS:

1. andar
Formato:
{{
  "acao": "andar",
  "direcao": "frente",
  "duracao": 1
}}

Direções:
- frente
- tras
- esquerda
- direita

A duração deve ficar entre 0.1 e 5 segundos.

2. pular
{{
  "acao": "pular"
}}

3. parar
{{
  "acao": "parar"
}}

4. olhar
Pode olhar para uma posição:
{{
  "acao": "olhar",
  "x": 10,
  "y": 95,
  "z": -20
}}

5. atacar
Use somente se existir uma entidade próxima:
{{
  "acao": "atacar",
  "nome": "Zombie"
}}

6. quebrar
Somente se existir uma posição de bloco conhecida:
{{
  "acao": "quebrar",
  "x": 10,
  "y": 95,
  "z": -20
}}

7. equipar
{{
  "acao": "equipar",
  "nome": "diamond_sword"
}}

8. usar
{{
  "acao": "usar"
}}

9. dropar
{{
  "acao": "dropar",
  "nome": "dirt",
  "quantidade": 1
}}

10. chat
{{
  "acao": "chat",
  "mensagem": "Oi, Lucas."
}}

11. nenhuma
Use quando não houver motivo para agir:
{{
  "acao": "nenhuma"
}}

REGRAS:

- Escolha SOMENTE UMA ação.
- Não invente entidades.
- Não invente itens.
- Não invente coordenadas.
- Não invente informações do mundo.
- Se houver um inimigo próximo, considere atacá-lo.
- Se estiver com pouca vida, priorize segurança.
- Não fique trocando de direção sem motivo.
- Faça ações simples.
- Não escreva explicações.
- NÃO use Markdown.
- Retorne SOMENTE JSON válido.
"""


    payload = {

        "model": MODELO_CONVERSA,

        "prompt": prompt,

        "stream": False,

        "keep_alive": OLLAMA_KEEP_ALIVE,

        "options": {

            "temperature": 0.35,

            "top_p": 0.85,

            "num_predict": 120

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


        # ----------------------------------------------------
        # Tenta encontrar JSON mesmo se o modelo colocar
        # alguma sujeira ao redor.
        # ----------------------------------------------------

        resposta_limpa = (
            resposta
            .replace(
                "```json",
                ""
            )
            .replace(
                "```",
                ""
            )
            .strip()
        )


        try:

            decisao = json.loads(
                resposta_limpa
            )

        except json.JSONDecodeError:

            match = re.search(
                r"\{.*\}",
                resposta_limpa,
                re.DOTALL
            )

            if not match:

                logger.warning(
                    "⚠️ Raiden retornou uma decisão "
                    "Minecraft que não é JSON."
                )

                return None


            decisao = json.loads(
                match.group(0)
            )


        if not isinstance(
            decisao,
            dict
        ):

            return None


        return validar_acao_minecraft(
            decisao
        )


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
# ⛏ VALIDAÇÃO DE AÇÃO
# ============================================================

def validar_acao_minecraft(
    decisao: dict
) -> Optional[dict]:

    """
    Valida a decisão antes de permitir que ela
    chegue ao Minecraft.

    O Ollama nunca executa código diretamente.
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

        "andar",
        "pular",
        "parar",
        "olhar",
        "atacar",
        "quebrar",
        "equipar",
        "usar",
        "dropar",
        "chat",
        "nenhuma"

    }


    if acao not in acoes_permitidas:

        logger.warning(
            f"⚠️ Ação Minecraft bloqueada: {acao}"
        )

        return None


    decisao["acao"] = acao


    # ========================================================
    # 🚶 ANDAR
    # ========================================================

    if acao == "andar":

        direcao = decisao.get(
            "direcao",
            "frente"
        )

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

            duracao = 1


        duracao = max(
            0.1,
            min(
                duracao,
                5
            )
        )


        decisao["direcao"] = direcao

        decisao["duracao"] = duracao


    # ========================================================
    # 👀 OLHAR
    # ========================================================

    elif acao == "olhar":

        if not all(
            isinstance(
                decisao.get(c),
                (int, float)
            )
            for c in (
                "x",
                "y",
                "z"
            )
        ):

            return None


    # ========================================================
    # ⚔️ ATACAR
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


        decisao["nome"] = nome


    # ========================================================
    # ⛏️ QUEBRAR
    # ========================================================

    elif acao == "quebrar":

        if not all(
            isinstance(
                decisao.get(c),
                (int, float)
            )
            for c in (
                "x",
                "y",
                "z"
            )
        ):

            return None


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


        decisao["nome"] = nome.strip()

        destino = decisao.get(
            "destino",
            "hand"
        )

        if destino not in {
            "hand",
            "off-hand"
        }:

            destino = "hand"


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


        decisao["nome"] = nome.strip()


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

            quantidade = 1


        decisao["quantidade"] = max(
            1,
            min(
                quantidade,
                64
            )
        )


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
    # 🛑 NENHUMA / PARAR / PULAR
    # ========================================================

    return decisao


# ============================================================
# ⛏ EXECUTAR DECISÃO MINECRAFT
# ============================================================

async def executar_decisao_minecraft(
    decisao: dict
):

    if not decisao:

        return


    acao = decisao.get(
        "acao"
    )


    if acao in {
        None,
        "nenhuma"
    }:

        logger.info(
            "⛏ Raiden decidiu não agir."
        )

        return


    bridge = (
        minecraft_module
        .minecraft_bridge
    )


    if not bridge.conectado:

        return


    logger.info(
        f"⛏🧠 Raiden decidiu: {decisao}"
    )


    try:

        if acao == "andar":

            await bridge.andar(
                direcao=decisao["direcao"],
                duracao=decisao["duracao"]
            )


        elif acao == "pular":

            await bridge.pular()


        elif acao == "parar":

            await bridge.parar()


        elif acao == "olhar":

            await bridge.olhar(
                x=decisao["x"],
                y=decisao["y"],
                z=decisao["z"]
            )


        elif acao == "atacar":

            await bridge.atacar(
                nome=decisao["nome"]
            )


        elif acao == "quebrar":

            await bridge.quebrar(
                x=decisao["x"],
                y=decisao["y"],
                z=decisao["z"]
            )


        elif acao == "equipar":

            await bridge.equipar(
                nome=decisao["nome"],
                destino=decisao["destino"]
            )


        elif acao == "usar":

            await bridge.usar()


        elif acao == "dropar":

            await bridge.dropar(
                nome=decisao["nome"],
                quantidade=decisao["quantidade"]
            )


        elif acao == "chat":

            await bridge.falar(
                decisao["mensagem"]
            )


    except Exception as e:

        logger.error(
            f"❌ Erro executando ação Minecraft: {e}"
        )


# ============================================================
# ⛏🤖 LOOP AUTÔNOMO DO MINECRAFT
# ============================================================

async def loop_autonomia_minecraft():

    """
    Loop contínuo da Raiden dentro do Minecraft.

    Estado → pensamento → ação → espera → estado.
    """

    logger.info(
        "⛏🤖 Loop autônomo da Raiden iniciado."
    )


    while True:

        try:

            await minecraft_autonomia_evento.wait()


            if not (
                minecraft_module
                .minecraft_bridge
                .conectado
            ):

                await asyncio.sleep(1)

                continue


            estado = (
                obter_estado_minecraft()
            )


            decisao = (
                await pensar_acao_minecraft(
                    estado
                )
            )


            if decisao:

                await executar_decisao_minecraft(
                    decisao
                )


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

            await asyncio.sleep(2)


# ============================================================
# ⛏ INICIAR AUTONOMIA
# ============================================================

async def iniciar_autonomia_minecraft():

    global minecraft_tarefa_autonomia


    if minecraft_tarefa_autonomia:

        return


    if not MINECRAFT_AUTONOMIA_ATIVA:

        logger.info(
            "⛏🤖 Autonomia Minecraft desativada "
            "por configuração."
        )

        return


    minecraft_autonomia_evento.set()


    minecraft_tarefa_autonomia = (
        asyncio.create_task(
            loop_autonomia_minecraft()
        )
    )


    logger.info(
        "⛏🤖 Autonomia Minecraft preparada."
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

            await minecraft_tarefa_autonomia

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

    version="2.1.0",

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
            60
        )


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


    await (
        minecraft_module
        .minecraft_bridge
        .conectar(
            websocket
        )
    )


    logger.info(
        "⛏ Conexão Minecraft estabelecida."
    )


    # --------------------------------------------------------
    # Confirma conexão
    # --------------------------------------------------------

    await (
        minecraft_module
        .minecraft_bridge
        .enviar({

            "tipo": "conexao",

            "status": "ok",

            "mensagem":
                "Minecraft conectado à Raiden."

        })
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


                await (
                    minecraft_module
                    .minecraft_bridge
                    .enviar({

                        "tipo": "erro",

                        "mensagem":
                            "A mensagem precisa "
                            "ser um objeto JSON."

                    })
                )


                continue


            tipo = mensagem.get(
                "tipo",
                "desconhecido"
            )


            # =================================================
            # 🏓 PING
            # =================================================

            if tipo == "ping":

                await (
                    minecraft_module
                    .minecraft_bridge
                    .enviar({

                        "tipo": "pong"

                    })
                )

                continue


            # =================================================
            # 🌍 ESTADO
            # =================================================

            if tipo == "estado":

                minecraft_module \
                    .minecraft_bridge \
                    .atualizar_estado(
                        mensagem
                    )


                await (
                    minecraft_module
                    .minecraft_bridge
                    .enviar({

                        "tipo": "ack",

                        "origem": "raiden",

                        "evento":
                            "estado_recebido"

                    })
                )


                continue


            # =================================================
            # 🎮 RESULTADO DE AÇÃO
            # =================================================

            if (
                tipo ==
                "minecraft_acao_resultado"
            ):

                minecraft_module \
                    .minecraft_bridge \
                    .registrar_resultado_acao(
                        mensagem
                    )


                logger.info(
                    "⛏ Resultado da ação: "
                    f"{mensagem}"
                )


                continue


            # =================================================
            # 💬 CHAT DO MINECRAFT
            # =================================================

            if tipo == "minecraft_chat":

                minecraft_module \
                    .minecraft_bridge \
                    .registrar_chat(
                        mensagem
                    )


                logger.info(
                    "💬 Minecraft: "
                    f"{mensagem.get('usuario')}: "
                    f"{mensagem.get('mensagem')}"
                )


                continue


            # =================================================
            # 📡 EVENTO DESCONHECIDO
            # =================================================

            logger.info(
                "⛏ Minecraft → Raiden | "
                f"tipo={tipo} | dados={mensagem}"
            )


            await (
                minecraft_module
                .minecraft_bridge
                .enviar({

                    "tipo": "ack",

                    "origem": "raiden",

                    "evento":
                        "mensagem_recebida",

                    "tipo_recebido":
                        tipo

                })
            )


    except WebSocketDisconnect:

        logger.info(
            "⛏ Minecraft encerrou a conexão."
        )


    except Exception as e:

        logger.error(
            f"❌ Erro no WebSocket Minecraft: {e}"
        )


    finally:

        await (
            minecraft_module
            .minecraft_bridge
            .desconectar()
        )


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

        "autonomia":
            MINECRAFT_AUTONOMIA_ATIVA,

        "estado":
            bridge.obter_estado(),

        "ultima_acao":
            bridge.obter_ultima_acao(),

        "ultimo_chat":
            bridge.obter_ultima_mensagem_chat()

    }


# ============================================================
# ⛏ CONTROLE MANUAL DA AUTONOMIA
# ============================================================

@app.post("/api/minecraft/autonomia")
async def minecraft_autonomia(
    ativa: bool
):

    global MINECRAFT_AUTONOMIA_ATIVA


    MINECRAFT_AUTONOMIA_ATIVA = ativa


    if ativa:

        await iniciar_autonomia_minecraft()

        return {

            "status": "ok",

            "autonomia": True

        }


    await parar_autonomia_minecraft()


    return {

        "status": "ok",

        "autonomia": False

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