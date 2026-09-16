"""
📬 FILAS — RAIDEN

Filas de mensagens e controle de loop assíncrono.
"""

import asyncio
import queue


# ============================================================
# 💬 FILA DE PERGUNTAS (chat, YouTube, microfone)
# ============================================================

fila_perguntas: queue.Queue = queue.Queue()


# ============================================================
# 🔊 FILA DE RESPOSTAS (áudio para o front)
# ============================================================

fila_respostas: queue.Queue = queue.Queue()


# ============================================================
# ⛏ CONTROLE DO LOOP MINECRAFT
# ============================================================

# Evento que destrava o loop de pensamento estratégico.
minecraft_autonomia_evento: asyncio.Event = asyncio.Event()