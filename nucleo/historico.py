"""
🧠 HISTÓRICO DE CONVERSA — RAIDEN

Contexto de curto prazo (últimas N trocas).
Não é memória de longo prazo — isso mora
em modulos/web_memoria.py.
"""

import threading

from collections import deque

from nucleo.logger import logger


# ============================================================
# 🧠 ESTADO
# ============================================================

historico_conversa = deque(maxlen=10)

historico_lock = threading.Lock()


# ============================================================
# ✏️ ESCRITA
# ============================================================

def adicionar_ao_historico(
    usuario: str,
    raiden: str
):
    """Registra uma troca usuário→Raiden."""

    with historico_lock:
        historico_conversa.append({
            "usuario": usuario,
            "raiden": raiden
        })


def limpar_historico():
    """Esvazia o histórico de conversa."""

    with historico_lock:
        historico_conversa.clear()

    logger.info("🧹 Histórico de conversa limpo.")


# ============================================================
# 📖 LEITURA
# ============================================================

def obter_contexto_conversa() -> str:
    """
    Converte o histórico em texto para colar
    no prompt do Ollama.
    """

    with historico_lock:
        historico = list(historico_conversa)

    if not historico:
        return "Não existe conversa anterior relevante."

    linhas = ["CONVERSA RECENTE:"]

    for item in historico:
        linhas.append(f"Lucas: {item['usuario']}")
        linhas.append(f"Raiden: {item['raiden']}")

    return "\n".join(linhas)