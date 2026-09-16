"""
🧠 CÉREBRO — RAIDEN

Worker que processa mensagens da fila e gera resposta.

Responsabilidades:
- consumir `fila_perguntas`
- processar mensagem (com visão opcional)
- gerar áudio
- devolver na `fila_retorno` OU `fila_respostas`

Não lida com Minecraft diretamente — delega.
"""

import asyncio
import queue
import re

from typing import Optional

from modulos.visao import ver_a_tela
from modulos.web_memoria import (
    consultar_conhecimento,
    lembrar_memoria_pessoal,
)

from nucleo.filas import (
    fila_perguntas,
    fila_respostas,
)
from nucleo.historico import adicionar_ao_historico
from nucleo.llm_conversa import pensar_ollama
from nucleo.logger import logger
from nucleo.voz import gerar_voz_base64


# ============================================================
# 🧠 MEMÓRIA PESSOAL — WRAPPER
# ============================================================

def obter_memoria_pessoal(termo: str) -> str:
    """
    Wrapper em torno de lembrar_memoria_pessoal
    pra isolar erros.
    """

    try:
        memoria = lembrar_memoria_pessoal(termo)

        if memoria:
            return memoria

    except Exception as e:
        logger.error(
            f"❌ Erro ao consultar memória pessoal: {e}"
        )

    return ""


# ============================================================
# 🔎 PROCESSAR MENSAGEM
# ============================================================

async def processar_mensagem_completa(texto: str) -> str:

    logger.info(f"🗣️ Input recebido: {texto}")

    texto_lower = texto.lower()

    memoria_pessoal = obter_memoria_pessoal(texto)

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

        logger.info("👁️ Ativando o olho...")

        descricao_tela = await ver_a_tela()

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

        adicionar_ao_historico(texto, resposta)

        return resposta

    # ========================================================
    # 🧠 PRIMEIRA RESPOSTA
    # ========================================================

    resposta_bruta = await pensar_ollama(
        texto,
        memoria_pessoal
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

        query = match.group(1).strip()

        logger.info(
            f"🔍 Raiden pediu para pesquisar: {query}"
        )

        try:
            info_encontrada = await consultar_conhecimento(
                query
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

                resposta_final = await pensar_ollama(
                    prompt_segunda_passada
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

            adicionar_ao_historico(texto, resposta)

            return resposta

        except Exception as e:

            logger.error(f"🔍 Erro ao pesquisar: {e}")

            resposta = (
                "Foi mal, minha conexão com "
                "a internet caiu aqui."
            )

            adicionar_ao_historico(texto, resposta)

            return resposta

    # ========================================================
    # 💬 RESPOSTA NORMAL
    # ========================================================

    adicionar_ao_historico(texto, resposta_bruta)

    return resposta_bruta


# ============================================================
# 📦 RESPOSTA COMPLETA (texto + áudio)
# ============================================================

async def gerar_resposta(texto: str) -> dict:

    resposta_texto = await processar_mensagem_completa(texto)

    audio_b64 = await gerar_voz_base64(resposta_texto)

    return {
        "texto": resposta_texto,
        "audio_base64": audio_b64,
        "expressao": "neutral"
    }


# ============================================================
# 🧠 WORKER
# ============================================================

def worker_cerebro():

    loop = asyncio.new_event_loop()

    asyncio.set_event_loop(loop)

    logger.info("🧠 Worker do cérebro iniciado.")

    while True:

        try:
            item = fila_perguntas.get(timeout=1)

        except queue.Empty:
            continue

        if isinstance(item, tuple):
            comando, fila_retorno = item
        else:
            comando = item
            fila_retorno = None

        logger.info(f"🧠 Processando: {comando}")

        try:

            resposta = loop.run_until_complete(
                gerar_resposta(comando)
            )

            if fila_retorno is not None:
                fila_retorno.put(resposta)
            else:
                fila_respostas.put(resposta)

        except Exception as e:

            logger.error(f"❌ Erro no processamento: {e}")

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
                fila_retorno.put(resposta_erro)
            else:
                fila_respostas.put(resposta_erro)

        finally:
            fila_perguntas.task_done()