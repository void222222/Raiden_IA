"""
🔧 UTILITÁRIOS — RAIDEN

Funções soltas que não dependem de estado.
"""

import base64
import json
import os
import sys
import time

from contextlib import contextmanager
from typing import Optional


# ============================================================
# 🔇 SILENCIAR STDERR (Linux)
# ============================================================

@contextmanager
def calar_linux():
    """
    Silencia temporariamente o stderr.

    Útil para evitar mensagens do ALSA/JACK ao abrir
    o microfone no Linux.
    """

    devnull = os.open(
        os.devnull,
        os.O_WRONLY
    )

    old_stderr = os.dup(2)

    sys.stderr.flush()

    os.dup2(devnull, 2)

    try:
        yield

    finally:
        os.dup2(old_stderr, 2)

        os.close(devnull)
        os.close(old_stderr)


# ============================================================
# 🆔 ID DE AÇÃO MINECRAFT
# ============================================================

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


def _normalizar_acao_id(
    acao_id
) -> Optional[str]:
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