"""
💸 INTEGRAÇÃO LIVEPIX (Módulo Túnel)
Abre um túnel para a internet usando o Localtunnel.
Isso permite que o LivePix envie os avisos de doação (Webhooks) direto para a sua API local.
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import logging
import os
import signal
import subprocess
import time
from typing import Dict, Optional

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
logger = logging.getLogger("LivePix")

PORTA_API = "8000"
TIMEOUT_TUNEL = 10  # Tempo máximo (loops) esperando o link ser gerado

# Variáveis globais de estado
processo_tunel: Optional[subprocess.Popen] = None
url_publica: Optional[str] = None

# ==========================================
# FUNÇÕES DE CONTROLE DO TÚNEL
# ==========================================
def ligar_tunel() -> Dict[str, str]:
    """
    Inicia o Localtunnel para expor a porta local (8000) para a internet.
    Lê a saída do terminal até encontrar a URL gerada e a retorna.
    """
    global processo_tunel, url_publica
    
    # Se já estiver rodando, não abre dois túneis pra não dar conflito. Devolve o link ativo.
    if processo_tunel is not None and url_publica is not None:
        logger.info("⚡ O túnel já está aberto e funcionando!")
        return {"status": "ok", "url": url_publica}
        
    try:
        # Lógica monstra: preexec_fn=os.setsid agrupa o processo para matá-lo de forma limpa depois
        processo_tunel = subprocess.Popen(
            ["lt", "--port", PORTA_API],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=os.setsid
        )
        
        logger.info("⏳ Cavando túnel para a internet (Localtunnel)...")
        
        # O Localtunnel demora 1 ou 2 segundos para cuspir o link no terminal.
        # Fica lendo a saída até achar a frase mágica "your url is" ou dar timeout.
        tempo_espera = 0
        while tempo_espera < TIMEOUT_TUNEL:
            linha = processo_tunel.stdout.readline()
            
            if "your url is" in linha.lower():
                # Corta a string e pega só a parte do link (https://...)
                url_publica = linha.split("is:")[1].strip()
                logger.info(f"💸 Túnel LivePix escancarado pro mundo: {url_publica}")
                return {"status": "ok", "url": url_publica}
            
            time.sleep(0.5)
            tempo_espera += 1
            
        # Se passou do tempo e não gerou, a internet ou o servidor do 'lt' deve ter caído.
        logger.error("❌ Demorou demais pra gerar o túnel. O servidor do Localtunnel pode estar fora do ar.")
        parar_tunel()
        return {"status": "erro", "detail": "A internet falhou ao tentar gerar o túnel."}
        
    except FileNotFoundError:
        # Erro clássico se você esquecer de instalar o Localtunnel numa formatação futura
        logger.error("❌ Comando 'lt' não encontrado. Você instalou o localtunnel? (npm install -g localtunnel)")
        return {"status": "erro", "detail": "Localtunnel não está instalado no Linux."}
    except Exception as e:
        logger.error(f"❌ Erro sinistro ao iniciar Localtunnel: {e}")
        return {"status": "erro", "detail": str(e)}

def parar_tunel() -> bool:
    """
    Mata o processo do Localtunnel de forma limpa, garantindo que a porta não fique presa.
    """
    global processo_tunel, url_publica
    
    if processo_tunel is None:
        logger.info("O túnel já estava fechado.")
        return True
        
    try:
        # os.killpg mata toda a família de processos atrelada a esse PID
        os.killpg(os.getpgid(processo_tunel.pid), signal.SIGTERM)
        processo_tunel = None
        url_publica = None
        logger.info("🛑 Túnel do LivePix soterrado (fechado) com sucesso.")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erro ao tentar tapar o túnel: {e}")
        return False