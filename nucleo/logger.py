"""
📝 LOGGER — RAIDEN

Configuração padrão de logging do projeto.
Qualquer módulo importa `logger` daqui.
"""

import logging


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s"
)


logger = logging.getLogger("RaidenCore")