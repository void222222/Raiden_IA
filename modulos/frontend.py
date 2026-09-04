"""
🎭 INTERFACE 3D DA RAIDEN (Módulo Front-end)
Responsável por ligar e desligar o servidor React (ChatVRM).
"""

import logging
import os
import signal
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger("Frontend")

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
CAMINHO_CHATVRM = RAIZ_PROJETO / "ChatVRM"

processo_frontend: Optional[subprocess.Popen] = None


def ligar_chatvrm() -> bool:
    """Inicia o ChatVRM somente quando solicitado."""
    global processo_frontend

    if processo_frontend is not None:
        if processo_frontend.poll() is None:
            logger.info("⚡ O Front-end 3D já está rodando.")
            return True

        processo_frontend = None

    if not CAMINHO_CHATVRM.is_dir():
        logger.error(f"❌ Pasta não encontrada: {CAMINHO_CHATVRM}")
        return False

    try:
        # Cria um grupo próprio para npm + node.
        # Assim conseguimos encerrar os dois juntos depois.
        processo_frontend = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=CAMINHO_CHATVRM,
            start_new_session=True,
            stdin=subprocess.DEVNULL,
        )

        logger.info(
            "🎭 ChatVRM iniciado: http://localhost:3000"
        )

        return True

    except (OSError, subprocess.SubprocessError) as e:
        processo_frontend = None
        logger.error(
            f"❌ Erro ao iniciar o ChatVRM: {e}"
        )
        return False


def parar_chatvrm() -> bool:
    """Para o grupo inteiro do ChatVRM de forma limpa."""
    global processo_frontend

    if processo_frontend is None:
        logger.info("O Front-end já estava desligado.")
        return True

    processo = processo_frontend
    processo_frontend = None

    try:
        if processo.poll() is not None:
            return True

        grupo = os.getpgid(processo.pid)

        # Primeiro tenta encerrar normalmente.
        os.killpg(grupo, signal.SIGTERM)

        try:
            processo.wait(timeout=5)

        except subprocess.TimeoutExpired:
            logger.warning(
                "⚠️ ChatVRM não encerrou em 5s; "
                "forçando parada."
            )

            try:
                os.killpg(grupo, signal.SIGKILL)
            except ProcessLookupError:
                pass

            processo.wait(timeout=2)

        logger.info(
            "🛑 Front-end (ChatVRM) derrubado com sucesso."
        )

        return True

    except ProcessLookupError:
        return True

    except Exception as e:
        logger.error(
            f"❌ Erro ao parar o Front-end: {e}"
        )
        return False