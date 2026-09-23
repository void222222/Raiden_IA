"""
⚙️ CONFIG — RAIDEN

Toda configuração que vem de variável de ambiente,
constante de caminho e afins.

Sem lógica. Sem estado. Sem dependências externas.

⚠️ MUDANÇA:
    `MINECRAFT_AUTONOMIA_ATIVA` agora é `False` por
    padrão. O bot novo (bot.js) é 100% autônomo.
    A API só OBSERVA e manda comandos pontuais.
"""

import os

from pathlib import Path


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
# 🧠 OLLAMA
# ============================================================

OLLAMA_URL = (
    "http://localhost:11434/api/generate"
)

MODELO_CONVERSA = "raiden_carioca"

OLLAMA_KEEP_ALIVE = "5m"


# ============================================================
# 🎤 MICROFONE
# ============================================================

MICROFONE_ATIVO = (
    os.getenv(
        "RAIDEN_MICROFONE_ATIVO",
        "0"
    ) == "1"
)


# ============================================================
# 🌐 CORS
# ============================================================

CORS_ORIGINS = os.getenv(
    "RAIDEN_CORS_ORIGINS",
    (
        "http://localhost:3000,"
        "http://localhost:5173,"
        "http://localhost:8080"
    )
).split(",")


# ============================================================
# 📁 UPLOAD
# ============================================================

MAX_UPLOAD_SIZE = 10 * 1024 * 1024

UPLOAD_CHUNK_SIZE = 1024 * 1024

EXTENSOES_PERMITIDAS = {
    ".vrm",
    ".vrma",
    ".png",
    ".jpg",
    ".jpeg"
}


# ============================================================
# 📂 CAMINHOS
# ============================================================

RAIZ_PROJETO = (
    Path(__file__).resolve().parent.parent
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
# ⛏ MINECRAFT
# ============================================================
#
# ⚠️ MUDANÇA IMPORTANTE:
#
# MINECRAFT_AUTONOMIA_ATIVA agora é False por padrão.
#
# Motivo:
#   O bot novo (bot.js) tem o próprio "cérebro The Sims".
#   Ele já sabe:
#     - sobreviver (comer, fugir, lutar)
#     - craftar kit mínimo
#     - construir casa a cada 30 blocos
#     - ligar casas com estrada
#
#   A API Python NÃO precisa mais controlar ele.
#
#   O que a API faz agora:
#     - Recebe estado (posição, vida, casas)
#     - Recebe eventos (morreu, casa terminada)
#     - Manda comandos pontuais SE o usuário pedir
#
#   Se quiser LIGAR o loop estratégico antigo de volta
#   (não recomendado), é só setar:
#       export RAIDEN_MINECRAFT_AUTONOMIA=1
#

MINECRAFT_AUTONOMIA_ATIVA = _env_bool(
    "RAIDEN_MINECRAFT_AUTONOMIA",
    False     # ⚠️ ANTES ERA True. Agora é False.
)

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