"""
👁️ OLHO DA RAIDEN (Módulo de Visão)
Sistema de captura de tela com filtro inteligente e descrição via LLM.
Fase 4: Robusto, Clean Code e com recuperação automática de erros.
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import base64
import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# ==========================================
# 2. BIBLIOTECAS EXTERNAS (Pip)
# ==========================================
import cv2
import httpx

# ==========================================
# 3. MÓDULOS DA RAIDEN
# ==========================================
from modulos.screen_filter import ScreenFilter

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
MODELO_VISAO = "llava-phi3"
OLLAMA_URL = "http://localhost:11434/api/generate"

# Tempos e Intervalos (em segundos)
OLLAMA_TIMEOUT = 120        
INTERVALO_CAPTURA = 15      # Tempo entre as "piscadas" (capturas) normais
INTERVALO_RECONEXAO = 5     # Tempo para tentar ligar a câmera de novo se cair
INTERVALO_ERRO_TELA = 10    # Tempo de espera se a tela estiver preta/verde

# Caminhos de Arquivos (Usando Pathlib para ser à prova de falhas no Linux)
PASTA_RAIDEN = Path.home() / "Documentos" / "Raiden"
ARQUIVO_MEMORIA = PASTA_RAIDEN / "memoria_visual.txt"
ARQUIVO_HEARTBEAT = PASTA_RAIDEN / "olho_heartbeat.json"
ARQUIVO_LOG = PASTA_RAIDEN / "olho_da_raiden.log"

# Configuração do Log
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(name)s - %(levelname)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(ARQUIVO_LOG, encoding='utf-8')
    ]
)
logger = logging.getLogger("OlhoDaRaiden")


class OlhoDaRaiden:
    """
    O Nervo Óptico da VTuber.
    Responsável por capturar a câmera virtual do OBS, filtrar telas inúteis,
    enviar para a IA analisar e salvar a memória do que ela está vendo.
    """
    
    def __init__(self):
        self.screen_filter = ScreenFilter()
        self.camera_index = self._encontrar_camera_obs()
        self.capture: Optional[cv2.VideoCapture] = None
        self.running = True
        
        # Controle de Estado
        self.last_description = ""
        self.consecutive_errors = 0
        self.max_errors = 10
        self.last_successful_capture = 0
        self.last_ollama_check = 0
        self.ollama_available = False
        
        # Estatísticas para o Dashboard
        self.stats = {
            "frames_capturados": 0,
            "frames_validos": 0,
            "frames_rejeitados": 0,
            "descricoes_geradas": 0,
            "erros_total": 0,
            "reconexoes": 0
        }
        
        # Garante que a pasta existe antes de começar
        PASTA_RAIDEN.mkdir(parents=True, exist_ok=True)
        
        # Registra os "botões de pânico" do Linux (Ctrl+C ou Kill) para fechar bonito
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        logger.info("👁️ Olho da Raiden inicializado com sucesso.")
        logger.info(f"📷 Câmera do OBS plugada no índice: {self.camera_index}")
    
    def _signal_handler(self, signum, frame):
        """Captura quando você tenta fechar o terminal e desliga a câmera primeiro."""
        logger.info(f"🛑 Sinal {signum} recebido. Fechando o olho gracefully...")
        self.running = False
        self._cleanup()
        sys.exit(0)
    
    def _encontrar_camera_obs(self) -> int:
        """Vasculha o sistema Linux procurando qual /dev/video é a câmera do OBS."""
        base = "/sys/class/video4linux/"
        
        if not os.path.exists(base):
            logger.warning("Diretório de vídeo não encontrado no Linux.")
            return 0
        
        try:
            for pasta in os.listdir(base):
                caminho_name = os.path.join(base, pasta, "name")
                if os.path.exists(caminho_name):
                    with open(caminho_name, "r") as f:
                        nome = f.read()
                        if "OBS" in nome:
                            indice = int(pasta.replace("video", ""))
                            logger.info(f"✅ Câmera Virtual do OBS achada: /dev/video{indice}")
                            return indice
                            
            logger.warning("Câmera do OBS não encontrada. Apelando para a câmera padrão (0).")
            return 0
            
        except Exception as e:
            logger.error(f"Erro ao vasculhar a câmera do OBS: {e}")
            return 0
    
    def _inicializar_captura(self) -> bool:
        """Abre a conexão com a câmera usando o OpenCV."""
        try:
            if self.capture is not None:
                self.capture.release()
            
            self.capture = cv2.VideoCapture(self.camera_index)
            
            if not self.capture.isOpened():
                logger.error(f"❌ Não rolou abrir a câmera {self.camera_index}.")
                return False
            
            # Força a qualidade Full HD na captura
            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            self.capture.set(cv2.CAP_PROP_FPS, 30)
            
            # Tira uma "foto" de teste para ver se não tá travada
            ret, frame = self.capture.read()
            if not ret or frame is None:
                logger.error("❌ Câmera abriu, mas não mandou imagem.")
                return False
            
            logger.info(f"✅ Captura rodando liso: {frame.shape[1]}x{frame.shape[0]}")
            self.stats["reconexoes"] += 1
            return True
            
        except Exception as e:
            logger.error(f"Erro brabo ao inicializar captura: {e}")
            return False
    
    def _verificar_ollama(self) -> bool:
        """Dá um 'ping' no Ollama a cada 30 segundos para ver se ele tá vivo."""
        if time.time() - self.last_ollama_check < 30:
            return self.ollama_available
        
        self.last_ollama_check = time.time()
        
        try:
            resp = httpx.get("http://localhost:11434/api/tags", timeout=5)
            self.ollama_available = (resp.status_code == 200)
        except Exception:
            self.ollama_available = False
            
        return self.ollama_available
    
    def _pegar_nome_janela(self) -> str:
        """Usa o xdotool do Linux para ler o título da janela que você está focado."""
        try:
            res = subprocess.run(
                ['xdotool', 'getactivewindow', 'getwindowname'],
                capture_output=True,
                text=True,
                timeout=2
            )
            nome = res.stdout.strip()
            return nome if nome else "Área de Trabalho"
            
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "Desconhecido"
        except Exception as e:
            logger.error(f"Erro no xdotool: {e}")
            return "Desconhecido"
    
    def _enviar_para_ollama(self, frame) -> Optional[str]:
        """Codifica o print da tela e manda para o modelo de visão (Llava)."""
        try:
            # Transforma a imagem do OpenCV num formato Base64 comprimido
            _, buffer = cv2.imencode('.png', frame, [cv2.IMWRITE_PNG_COMPRESSION, 6])
            img_b64 = base64.b64encode(buffer).decode('utf-8')
            
            nome_janela = self._pegar_nome_janela()
            prompt = (
                f"Janela atual: '{nome_janela}'. "
                "Descreva em 1 frase curta e objetiva. "
                "Se for tela verde, preta ou vazia, responda exatamente: [TELA_INVALIDA]"
            )
            
            payload = {
                "model": MODELO_VISAO,
                "prompt": prompt,
                "stream": False,
                "images": [img_b64],
                "options": {
                    "temperature": 0.1,  # Frio para não alucinar
                    "num_predict": 60,   # Resposta diretassa
                    "top_p": 0.9
                }
            }
            
            resp = httpx.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
            
            if resp.status_code == 200:
                resposta = resp.json().get("response", "").strip()
                if resposta and "[TELA_INVALIDA]" not in resposta:
                    return resposta
                logger.debug("👻 Ollama disse que a tela tá vazia/verde.")
                return None
                
            logger.error(f"Ollama retornou o código de erro: {resp.status_code}")
            return None
                
        except (httpx.TimeoutException, httpx.ConnectError) as erro_rede:
            logger.error(f"Falha de rede com o Ollama: {erro_rede}")
            return None
        except Exception as e:
            logger.error(f"Erro genérico ao mandar pro Ollama: {e}")
            return None
    
    def _salvar_descricao(self, descricao: str, frame=None):
        """Guarda o que ela viu em um arquivo de texto para a API poder ler depois."""
        try:
            with open(ARQUIVO_MEMORIA, "w", encoding="utf-8") as f:
                f.write(descricao)
            
            heartbeat = {
                "timestamp": time.time(),
                "ultima_captura": datetime.now().isoformat(),
                "descricao": descricao,
                "stats": self.stats
            }
            
            with open(ARQUIVO_HEARTBEAT, "w", encoding="utf-8") as f:
                json.dump(heartbeat, f, ensure_ascii=False, indent=2)
            
            self.last_description = descricao
            self.last_successful_capture = time.time()
            logger.info(f"💾 Memória salva: {descricao}")
            
        except Exception as e:
            logger.error(f"Erro ao salvar no HD: {e}")
    
    def _atualizar_heartbeat(self, status: str = "running", erro: Optional[str] = None):
        """Bate o ponto no arquivo JSON para o dashboard saber que o script tá vivo."""
        try:
            heartbeat = {
                "timestamp": time.time(),
                "status": status,
                "ultimo_sucesso": self.last_successful_capture,
                "erro": erro,
                "stats": self.stats
            }
            with open(ARQUIVO_HEARTBEAT, "w", encoding="utf-8") as f:
                json.dump(heartbeat, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Erro no heartbeat: {e}")
    
    def _processar_frame(self, frame) -> bool:
        """Pega o frame, passa no filtro de qualidade e manda pra IA."""
        self.stats["frames_capturados"] += 1
        
        # Filtro burro (rápido): Checa se a tela não tá toda preta ou toda verde
        analise = self.screen_filter.analyze_frame(frame)
        if not analise.is_valid:
            self.stats["frames_rejeitados"] += 1
            logger.debug(f"Frame descartado pelo filtro: {analise.reason}")
            return False
        
        self.stats["frames_validos"] += 1
        
        if not self._verificar_ollama():
            logger.warning("Ollama caiu ou tá dormindo. Pulando captura...")
            return False
        
        descricao = self._enviar_para_ollama(frame)
        
        # Só salva se a tela mudou (pra não floodar o HD)
        if descricao and descricao != self.last_description:
            self._salvar_descricao(descricao, frame)
            self.stats["descricoes_geradas"] += 1
            return True
            
        return False
    
    def _cleanup(self):
        """Solta a câmera do sistema operacional pra não deixar o dispositivo preso."""
        try:
            if self.capture is not None:
                self.capture.release()
                logger.info("🔓 Câmera liberada com sucesso.")
            
            self._atualizar_heartbeat("stopped")
        except Exception as e:
            logger.error(f"Erro ao limpar a bagunça: {e}")
    
    def executar(self):
        """O coração do sistema. Fica rodando em loop eterno."""
        logger.info("🚀 Dando o start no loop de captura...")
        
        if not self._inicializar_captura():
            logger.error("☠️ Abortando missão: A câmera não iniciou.")
            return
        
        while self.running:
            try:
                ret, frame = self.capture.read()
                
                if not ret or frame is None:
                    logger.warning("Câmera piscou/falhou. Tentando de novo em 5s...")
                    time.sleep(INTERVALO_RECONEXAO)
                    
                    if not self._inicializar_captura():
                        self.consecutive_errors += 1
                        if self.consecutive_errors >= self.max_errors:
                            logger.error("Muitos erros seguidos. Vou dar uma pausa longa (30s).")
                            time.sleep(30)
                            self.consecutive_errors = 0
                    continue
                
                # Se leu a câmera de boa, zera o contador de erros
                self.consecutive_errors = 0
                
                # Joga a imagem pro processo principal
                sucesso = self._processar_frame(frame)
                self._atualizar_heartbeat("running")
                
                # Descansa um pouco antes do próximo print
                if sucesso:
                    time.sleep(INTERVALO_CAPTURA)
                else:
                    time.sleep(INTERVALO_ERRO_TELA)
                
            except KeyboardInterrupt:
                logger.info("Você apertou Ctrl+C. Fui!")
                break
            except Exception as e:
                self.stats["erros_total"] += 1
                self.consecutive_errors += 1
                logger.error(f"Treta pesada no loop (Erro #{self.stats['erros_total']}): {e}")
                self._atualizar_heartbeat("error", str(e))
                
                # Se continuar dando erro, ele espera cada vez mais pra não travar o PC
                tempo_espera = min(INTERVALO_RECONEXAO * (2 ** self.consecutive_errors), 60)
                time.sleep(tempo_espera)
        
        self._cleanup()


# ==========================================
# GATILHO DE INÍCIO
# ==========================================
def main():
    try:
        olho = OlhoDaRaiden()
        olho.executar()
    except Exception as e:
        logger.critical(f"Erro fatal que crashou tudo: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()