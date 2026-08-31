"""
🎭 INTERFACE 3D DA RAIDEN (Módulo Front-end)
Responsável por ligar e desligar o servidor React (ChatVRM)
que renderiza o avatar 3D no navegador.
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import logging
import os
import signal
import subprocess
from typing import Optional

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
logger = logging.getLogger("Frontend")

# Caminho onde o projeto do ChatVRM está instalado no seu Linux
CAMINHO_CHATVRM = os.path.expanduser("~/Documentos/ChatVRM")

# Variável global para guardar o processo do Node.js/React
processo_frontend: Optional[subprocess.Popen] = None

# ==========================================
# FUNÇÕES DE CONTROLE
# ==========================================
def ligar_chatvrm() -> bool:
    """
    Inicia o servidor de desenvolvimento do ChatVRM (npm run dev).
    Retorna True se ligar com sucesso ou se já estiver rodando.
    """
    global processo_frontend
    
    if processo_frontend is not None:
        logger.info("⚡ O Front-end 3D já está rodando na porta 3000!")
        return True

    # Trava de segurança: Verifica se a pasta existe antes de dar o comando
    if not os.path.exists(CAMINHO_CHATVRM):
        logger.error(f"❌ Pasta não encontrada: {CAMINHO_CHATVRM}")
        return False
    
    try:
        # Lógica monstra: preexec_fn=os.setsid cria um 'grupo' de processos. 
        # Assim, o npm e o node ficam juntos. Quando precisarmos fechar, não ficam processos zumbis!
        processo_frontend = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=CAMINHO_CHATVRM,
            preexec_fn=os.setsid
        )
        logger.info("🎭 Front-end (ChatVRM) mandou sinal de iniciar! Acesse: http://localhost:3000")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erro ao tentar ligar o npm run dev: {e}")
        return False

def parar_chatvrm() -> bool:
    """
    Mata o processo do Node.js/React de forma limpa.
    Retorna True se parar com sucesso ou se já estiver parado.
    """
    global processo_frontend
    
    if processo_frontend is None:
        logger.info("O Front-end já estava desligado.")
        return True
        
    try:
        # Lógica monstra parte 2: os.killpg mata TODO o grupo de processos atrelados àquele PID
        # Ninguém sobrevive para travar a sua porta 3000.
        os.killpg(os.getpgid(processo_frontend.pid), signal.SIGTERM)
        processo_frontend = None
        logger.info("🛑 Front-end (ChatVRM) derrubado com sucesso.")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erro sinistro ao tentar matar o processo do Front-end: {e}")
        return False