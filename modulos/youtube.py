"""
📺 OLHEIRO DO YOUTUBE (Módulo de Integração)
Conecta na live do YouTube usando pytchat, monitora o chat em tempo real
e avisa a API central quando alguém digita o comando da Raiden.
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import logging
import threading
import time
from typing import Callable

# ==========================================
# 2. BIBLIOTECAS EXTERNAS (Pip)
# ==========================================
import pytchat

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
logger = logging.getLogger("YouTube")

# O comando que o pessoal precisa digitar no chat para ela responder
GATILHO_CHAT = "!raiden"
INTERVALO_LEITURA = 1  # Tempo em segundos de pausa entre leituras do chat

# Estado Global do Olheiro
olheiro_ativo: bool = False

# ==========================================
# FUNÇÕES AUXILIARES
# ==========================================
def extrair_id_video(link_live: str) -> str:
    """
    Tenta extrair o ID do vídeo independente de ser o link completo (v=ID) 
    ou o link encurtado (youtu.be/ID).
    """
    try:
        if "v=" in link_live:
            return link_live.split("v=")[1].split("&")[0]
        # Pega a última parte do link encurtado, removendo parâmetros adicionais se houver (?)
        return link_live.split("/")[-1].split("?")[0]
    except Exception as e:
        logger.error(f"❌ Erro ao extrair ID do link '{link_live}': {e}")
        return ""

# ==========================================
# MOTOR DE LEITURA DO CHAT
# ==========================================
def ler_chat_youtube(link_live: str, callback_api: Callable[[str], None]) -> None:
    """
    Função que roda em loop contínuo na Thread varrendo o chat da live.
    Quando detecta o gatilho, joga o texto limpo para o 'callback_api'.
    """
    global olheiro_ativo
    olheiro_ativo = True
    
    video_id = extrair_id_video(link_live)
    if not video_id:
        logger.error("❌ Link do YouTube inválido. Desligando o olheiro.")
        olheiro_ativo = False
        return

    try:
        chat = pytchat.create(video_id=video_id)
        logger.info(f"🔴 Conectado ao chat da live (ID: {video_id})! Olheiro na moita.")
        
        # Só continua lendo se a live estiver online e o botão do painel estiver ligado
        while chat.is_alive() and olheiro_ativo:
            for c in chat.get().sync_items():
                texto = c.message.lower()
                
                # Checa se o comando foi chamado
                if GATILHO_CHAT in texto:
                    # Tira a palavra '!raiden' da frente e guarda só a mensagem
                    comando = texto.replace(GATILHO_CHAT, "").strip()
                    
                    if comando:
                        logger.info(f"💬 Mensagem capturada ({c.author.name}): {comando}")
                        
                        # Dispara a função principal da API (o cérebro)
                        callback_api(comando)
            
            # Respiro pro processador do PC não fritar
            time.sleep(INTERVALO_LEITURA) 
            
    except Exception as e:
        logger.error(f"❌ Treta sinistra no olheiro do YouTube: {e}")
    finally:
        # Garante que o status global atualiza se a live cair ou a thread morrer
        olheiro_ativo = False
        logger.info("⭕ Olheiro do YouTube desconectado.")

# ==========================================
# CONTROLES DE INÍCIO E FIM DA THREAD
# ==========================================
def iniciar_olheiro(link_live: str, callback_api: Callable[[str], None]) -> bool:
    """
    Cria um processo em segundo plano (Thread) para ler o YouTube sem travar o seu FastAPI.
    """
    global olheiro_ativo
    
    if olheiro_ativo:
        logger.warning("⚠️ O olheiro já está bisbilhotando uma live!")
        return False 
    
    # daemon=True é vital: faz essa thread ser destruída automaticamente se a API principal for fechada.
    thread = threading.Thread(
        target=ler_chat_youtube, 
        args=(link_live, callback_api), 
        daemon=True
    )
    thread.start()
    return True

def parar_olheiro() -> None:
    """
    Sinaliza para o loop `while` parar de ler o chat e fechar a conexão.
    """
    global olheiro_ativo
    
    if olheiro_ativo:
        olheiro_ativo = False
        logger.info("🛑 Sinal enviado para puxar o olheiro do YouTube de volta.")