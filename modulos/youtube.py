"""
📺 OLHEIRO DO YOUTUBE (Módulo de Integração)

Lê o chat somente quando o olheiro é ativado
pela API/painel.
"""

import logging
import threading
from typing import Callable
from urllib.parse import parse_qs, urlparse

import pytchat

logger = logging.getLogger("YouTube")

# Comando que ativa a Raiden no chat.
GATILHO_CHAT = "!raiden"

# Intervalo entre leituras.
INTERVALO_LEITURA = 1

# Estado do olheiro.
olheiro_ativo: bool = False

# Thread responsável pelo chat.
_thread_olheiro: threading.Thread | None = None

# Evento usado para parar a thread.
_parar_evento = threading.Event()


def extrair_id_video(link_live: str) -> str:
    """Extrai o ID de uma URL do YouTube."""
    try:
        link = link_live.strip()

        if not link:
            return ""

        # Se aparentemente já for um ID.
        if "://" not in link and "/" not in link:
            return link.split("?")[0].strip()

        parsed = urlparse(link)

        # URL padrão: youtube.com/watch?v=ID
        if parsed.query:
            video_id = parse_qs(parsed.query).get("v", [""])[0]
            if video_id:
                return video_id.strip()

        partes = [parte for parte in parsed.path.split("/") if parte]

        if not partes:
            return ""

        # /live/ID, /embed/ID, /shorts/ID
        if (
            partes[0] in {"live", "embed", "shorts"}
            and len(partes) >= 2
        ):
            return partes[1].split("?")[0].strip()

        return partes[-1].split("?")[0].strip()

    except Exception as e:
        logger.error(f"❌ Erro ao extrair ID do link '{link_live}': {e}")
        return ""


def ler_chat_youtube(
    link_live: str,
    callback_api: Callable[[str], None],
) -> None:
    """
    Thread responsável por monitorar o chat.
    """
    global olheiro_ativo

    video_id = extrair_id_video(link_live)

    if not video_id:
        logger.error("❌ Link/ID do YouTube inválido.")
        olheiro_ativo = False
        return

    chat = None
    try:
        # Adicionando o interruptable=False
        chat = pytchat.create(video_id=video_id, interruptable=False)
        logger.info(f"🔴 Conectado ao chat da live (ID: {video_id}).")

        while chat.is_alive() and not _parar_evento.is_set():

            try:
                for c in chat.get().sync_items():

                    if _parar_evento.is_set():
                        break

                    texto = c.message.strip()
                    texto_lower = texto.lower()

                    # Garante que o comando está no início da frase
                    if not texto_lower.startswith(GATILHO_CHAT):
                        continue

                    # Remove o comando só do início
                    comando = texto_lower[len(GATILHO_CHAT):].strip()

                    if not comando:
                        continue

                    autor = getattr(getattr(c, "author", None), "name", "desconhecido")
                    logger.info(f"💬 Mensagem capturada ({autor}): {comando}")

                    try:
                        # Roda em thread separada para não travar a leitura do chat
                        threading.Thread(
                            target=callback_api, 
                            args=(comando,), 
                            daemon=True
                        ).start()
                    except Exception:
                        logger.exception("❌ Erro no callback da API.")

            except Exception:
                logger.exception("⚠️ Erro ao processar o chat.")
                _parar_evento.wait(2)
                continue

            # Espera sem travar completamente a possibilidade de encerramento.
            _parar_evento.wait(INTERVALO_LEITURA)

    except Exception:
        logger.exception("❌ Treta sinistra no olheiro do YouTube.")

    finally:
        # Garante que o pytchat morre e libera memória
        if chat and chat.is_alive():
            chat.terminate()

        olheiro_ativo = False
        logger.info("⭕ Olheiro do YouTube desconectado.")


def iniciar_olheiro(
    link_live: str,
    callback_api: Callable[[str], None],
) -> bool:
    """
    Inicia uma única thread em background para monitorar o chat.
    """
    global olheiro_ativo
    global _thread_olheiro

    if olheiro_ativo:
        logger.warning("⚠️ O olheiro já está ativo!")
        return False

    if not extrair_id_video(link_live):
        logger.error("❌ Não foi possível encontrar o ID da live.")
        return False

    # Garante que o evento anterior esteja limpo.
    _parar_evento.clear()
    olheiro_ativo = True

    _thread_olheiro = threading.Thread(
        target=ler_chat_youtube,
        args=(link_live, callback_api),
        daemon=True,
        name="RaidenYouTube",
    )
    _thread_olheiro.start()

    logger.info("👀 Olheiro do YouTube iniciado.")
    return True


def parar_olheiro() -> None:
    """
    Sinaliza para o leitor do YouTube parar.
    """
    global olheiro_ativo

    _parar_evento.set()
    olheiro_ativo = False
    logger.info("🛑 Sinal enviado para desligar o olheiro do YouTube.")