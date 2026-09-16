"""
🧠 LLM CONVERSA — RAIDEN

Cérebro conversacional da Raiden.
Usado para chat, visão e pesquisa web.

NÃO lida com Minecraft.
"""

import httpx

from nucleo.config import (
    OLLAMA_KEEP_ALIVE,
    OLLAMA_URL,
    MODELO_CONVERSA,
)
from nucleo.estado_minecraft import (
    obter_estado_minecraft,
    obter_ultimo_resultado_acao_minecraft,
)
from nucleo.historico import obter_contexto_conversa
from nucleo.logger import logger


async def pensar_ollama(
    prompt_usuario: str,
    memoria_pessoal: str = ""
) -> str:
    """
    Cérebro normal da Raiden.
    Usado para conversa, pesquisa e visão.
    """

    from modulos.minecraft import minecraft_bridge

    contexto = obter_contexto_conversa()

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

    if minecraft_bridge.conectado:

        estado_minecraft = obter_estado_minecraft()

        ultima_acao = minecraft_bridge.obter_ultima_acao()

        ultimo_resultado = (
            obter_ultimo_resultado_acao_minecraft()
        )

        ultimo_chat = (
            minecraft_bridge.obter_ultima_mensagem_chat()
        )

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
            f"Posição: {estado_minecraft.get('posicao')}\n"
            f"Rotação: {estado_minecraft.get('rotacao')}\n"
            f"Vida: {estado_minecraft.get('vida')}\n"
            f"Fome: {estado_minecraft.get('fome')}\n"
            f"Inventário ({inventario_total} itens, "
            f"primeiros 20): {inventario}\n"
            f"Entidades próximas "
            f"({entidades_total} no total, "
            f"primeiras 5): {entidades}\n"
            f"Última ação enviada: {ultima_acao}\n"
            f"Último resultado real: {ultimo_resultado}\n"
            f"Último chat recebido: {ultimo_chat}\n"
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
        "options": {"num_predict": 150}
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

        logger.error("⏱️ Timeout ao conectar com Ollama")

        return (
            "Demorei demais pra pensar, mermão. "
            "Tenta de novo aí."
        )

    except httpx.HTTPError as e:

        logger.error(f"🌐 Erro HTTP com Ollama: {e}")

        return (
            "Deu ruim na comunicação com meu cérebro. "
            "Vê se o Ollama tá ligado!"
        )

    except Exception as e:

        logger.error(f"❌ Erro inesperado no Ollama: {e}")

        return (
            "Deu ruim no meu cérebro, mermão. "
            "Vê se o Ollama tá ligado!"
        )