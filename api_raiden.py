"""
🎌 RAIDEN - API Principal 
Fase 4: Core REST + Ouvido Físico + Visão + Centro de Comando
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import asyncio
import base64
import logging
import os
import re
import sys
import threading
from io import BytesIO
from typing import Optional, Dict, Any
from contextlib import contextmanager, asynccontextmanager

# ==========================================
# 2. BIBLIOTECAS EXTERNAS (Pip)
# ==========================================
import httpx
import uvicorn
import edge_tts
import speech_recognition as sr
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ==========================================
# 3. MÓDULOS DA RAIDEN (Seus arquivos)
# ==========================================
from modulos.web_memoria import iniciar_banco, consultar_conhecimento
from modulos.visao import ver_a_tela
import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module

# ==========================================
# CONFIGURAÇÕES GERAIS E CONSTANTES
# ==========================================
# Configuração de Logs para o Terminal
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger("RaidenCore")

# Configurações do Cérebro (Ollama)
OLLAMA_URL = "http://localhost:11434/api/generate"
MODELO_CONVERSA = "raiden_carioca"

# Caminhos de Pastas
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parent
PASTA_PUBLIC_CHATVRM = RAIZ_PROJETO / "ChatVRM" / "public"

# Variáveis Globais de Estado (Com trava de segurança para Threads)
ultima_resposta: Optional[Dict[str, Any]] = None
lock_resposta = threading.Lock()

# ==========================================
# MODELOS DE DADOS (Pydantic)
# ==========================================
class MensagemRequest(BaseModel):
    texto: Optional[str] = None
    text: Optional[str] = None

class YouTubeRequest(BaseModel):
    link: Optional[str] = None 

# ==========================================
# UTILITÁRIOS DO SISTEMA
# ==========================================
@contextmanager
def calar_linux():
    """
    Gambiarra suprema: Silencia os erros chatos de ALSA/Jack do microfone no Linux.
    Ele desvia a saída de erro (stderr) para o limbo temporariamente.
    """
    devnull = os.open(os.devnull, os.O_WRONLY)
    old_stderr = os.dup(2)
    sys.stderr.flush()
    os.dup2(devnull, 2)
    try:
        yield
    finally:
        os.dup2(old_stderr, 2)
        os.close(devnull)
        os.close(old_stderr)

# ==========================================
# NÚCLEO DE INTELIGÊNCIA E VOZ
# ==========================================
async def pensar_ollama(prompt_usuario: str, respondendo_pesquisa: bool = False) -> str:
    """
    Envia a mensagem para o modelo Ollama e retorna o texto da Raiden.
    Se 'respondendo_pesquisa' for True, ela não tentará pesquisar novamente.
    """
    # Define a personalidade baseada no contexto
    if respondendo_pesquisa:
        prompt_sistema = (
            "Você é a Raiden, uma VTuber Carioca Tsundere.\n"
            "Responda em no MÁXIMO 2 frases curtas. Seja direta. Use gírias do Rio (Mermão, Papo reto, Coé).\n"
            "Apenas leia a informação recebida e explique para o usuário com a sua personalidade."
        )
    else:
        prompt_sistema = (
            "Você é a Raiden, uma VTuber Carioca Tsundere.\n"
            "Regra 1: Responda em no MÁXIMO 2 frases curtas. Seja direta. Use gírias do Rio.\n"
            "Regra 2: Se pedirem curiosidades, tutoriais ou coisas que você NÃO SABE, responda APENAS com a tag:\n"
            "[PESQUISAR: termo resumido]\n"
            "NÃO escreva mais nada além da tag se precisar pesquisar."
        )

    payload = {
        "model": MODELO_CONVERSA,
        "prompt": prompt_usuario,
        "system": prompt_sistema,
        "stream": False,
        "options": {"num_predict": 150} 
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(OLLAMA_URL, json=payload, timeout=30.0)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
    except Exception as e:
        logger.error(f"Erro ao conectar com o cérebro (Ollama): {e}")
        return "Deu ruim no meu cérebro, mermão. Vê se o Ollama tá ligado!"

async def gerar_voz_base64(texto: str) -> Optional[str]:
    """
    Transforma o texto em áudio usando a voz do Edge TTS e converte para Base64 
    para enviar direto para o ChatVRM.
    """
    if not texto:
        return None
        
    try:
        communicate = edge_tts.Communicate(texto, voice="pt-BR-FranciscaNeural", rate="+10%")
        audio_buffer = BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
        return base64.b64encode(audio_buffer.getvalue()).decode("utf-8")
    except Exception as e:
        logger.error(f"Erro na geração de voz: {e}")
        return None

async def processar_mensagem_completa(texto: str) -> str:
    """
    Cérebro orquestrador: Lida com Visão, Pesquisa Web ou Chat Normal.
    """
    logger.info(f"🗣️ Input recebido: {texto}")
    texto_lower = texto.lower()
    
    # 1. Checa se o usuário pediu para ela "ver a tela"
    gatilhos_visao = ["olha", "vê", "ve", "que tem", "mostra"]
    if "tela" in texto_lower and any(palavra in texto_lower for palavra in gatilhos_visao):
        logger.info("👁️ Ativando o olho (Tirando print no COSMIC)...")
        descricao_tela = await ver_a_tela()
        prompt_visao = f"O usuário pediu para você olhar a tela dele. Você viu isso: '{descricao_tela}'. Descreva isso para ele com a sua personalidade carioca."
        return await pensar_ollama(prompt_visao, respondendo_pesquisa=True)

    # 2. Fluxo Normal: Manda para a IA
    resposta_bruta = await pensar_ollama(texto, respondendo_pesquisa=False)
    
    # 3. Verifica se a IA pediu para pesquisar na Web
    match = re.search(r'\[PESQUISAR:\s*(.*?)\]', resposta_bruta, re.IGNORECASE)
    if match:
        query = match.group(1).strip()
        logger.info(f"🔍 Raiden pediu para pesquisar: {query}")
        try:
            info_encontrada = await consultar_conhecimento(query)
            if info_encontrada:
                prompt_segunda_passada = (
                    f"O usuário te perguntou o seguinte: '{texto}'\n\n"
                    f"O sistema pesquisou na internet e achou isso: {info_encontrada}\n\n"
                    "Responda EXATAMENTE o que o usuário perguntou usando essas informações. Vá direto ao ponto."
                )
                return await pensar_ollama(prompt_segunda_passada, respondendo_pesquisa=True)
            else:
                return "Pô mermão, tentei pesquisar aqui mas a internet não ajudou em nada."
        except Exception as e:
            logger.error(f"Erro ao tentar ler a tag e pesquisar: {e}")
            return "Foi mal, minha conexão com a internet caiu aqui."

    # 4. Retorna a resposta normal se não for visão nem pesquisa
    return resposta_bruta

# ==========================================
# TRATAMENTO DE ÁUDIO E EVENTOS (Inputs)
# ==========================================
def callback_youtube(comando: str):
    """
    Função chamada quando o módulo do YouTube detecta uma nova mensagem no chat.
    Roda em uma thread separada, por isso cria seu próprio loop assíncrono.
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        resposta_texto = loop.run_until_complete(processar_mensagem_completa(comando))
        audio_b64 = loop.run_until_complete(gerar_voz_base64(resposta_texto))
        loop.close()
        
        global ultima_resposta
        with lock_resposta:
            ultima_resposta = {
                "texto": resposta_texto,
                "audio_base64": audio_b64,
                "expressao": "neutral"
            }
    except Exception as e:
        logger.error(f"Erro ao processar mensagem do YouTube: {e}")

def escutar_microfone():
    """
    Fica ouvindo o microfone do PC o tempo todo em uma Thread separada.
    Se ouvir 'Raiden', processa o comando.
    """
    r = sr.Recognizer()
    r.energy_threshold = 300
    r.dynamic_energy_threshold = True
    r.pause_threshold = 0.8

    with calar_linux():
        mic = sr.Microphone()

    with mic as source:
        r.adjust_for_ambient_noise(source, duration=1)
        logger.info("🎤 Ouvido físico ativado! Diga 'Raiden, [sua mensagem]'.")
        
        while True:
            try:
                audio = r.listen(source, phrase_time_limit=8)
                texto = r.recognize_google(audio, language="pt-BR").lower()
                
                if "raiden" in texto:
                    comando = texto.replace("raiden", "").strip()
                    if comando:
                        logger.info(f"🎙️ Microfone captou: {comando}")
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        
                        resposta_texto = loop.run_until_complete(processar_mensagem_completa(comando))
                        audio_b64 = loop.run_until_complete(gerar_voz_base64(resposta_texto))
                        loop.close()
                        
                        global ultima_resposta
                        with lock_resposta:
                            ultima_resposta = {
                                "texto": resposta_texto,
                                "audio_base64": audio_b64,
                                "expressao": "neutral"
                            }
            except sr.UnknownValueError:
                pass  # Ignora quando não entende o que foi dito
            except Exception as e:
                logger.debug(f"Aviso no microfone: {e}")

# ==========================================
# CONFIGURAÇÃO FASTAPI (Rotas e Lifespan)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Eventos que rodam quando a API liga e desliga."""
    iniciar_banco()
    threading.Thread(target=escutar_microfone, daemon=True).start()
    
    # Prepara a pasta de assets se ela não existir
    if not os.path.exists(PASTA_PUBLIC_CHATVRM):
        os.makedirs(PASTA_PUBLIC_CHATVRM)
        
    yield
    # Aqui entraria código para desligar coisas de forma segura, se necessário.

app = FastAPI(title="Raiden Core API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Servindo arquivos estáticos (Fundos, Modelos VRM)
app.mount("/midia", StaticFiles(directory=PASTA_PUBLIC_CHATVRM), name="midia")

@app.post("/chat")
async def chat_endpoint(req: MensagemRequest):
    """Recebe mensagens em texto (via Painel ou ChatVRM) e processa."""
    global ultima_resposta
    texto = req.texto or req.text
    if not texto: 
        raise HTTPException(status_code=400, detail="Texto vazio!")
        
    resposta_texto = await processar_mensagem_completa(texto)
    audio_b64 = await gerar_voz_base64(resposta_texto)
    
    resultado = {"texto": resposta_texto, "audio_base64": audio_b64, "expressao": "neutral"}
    with lock_resposta:
        ultima_resposta = resultado
    return resultado

@app.get("/proximo_audio")
async def proximo_audio():
    """Endpoint que o ChatVRM consome constantemente para ver se tem áudio novo."""
    global ultima_resposta
    with lock_resposta:
        if ultima_resposta:
            resp = ultima_resposta
            ultima_resposta = None
            return resp
    return {"texto": None, "audio_base64": None}

# ==========================================
# 🎛️ ROTAS DO PAINEL DE COMANDO
# ==========================================
@app.get("/api/painel/status")
async def painel_status():
    """Retorna se os módulos estão ligados ou desligados."""
    return {
        "youtube": yt_module.olheiro_ativo,
        "frontend": front_module.processo_frontend is not None,
        "livepix": pix_module.processo_tunel is not None
    }

@app.post("/api/painel/youtube/toggle")
async def toggle_youtube(req: YouTubeRequest = None):
    """Liga ou desliga a leitura do chat do YouTube."""
    if yt_module.olheiro_ativo:
        yt_module.parar_olheiro()
        return {"status": "desligado"}
    else:
        if not req or not req.link:
            raise HTTPException(status_code=400, detail="Coloque o link da live para ligar!")
        sucesso = yt_module.iniciar_olheiro(req.link, callback_youtube)
        if sucesso: 
            return {"status": "ligado"}
        raise HTTPException(status_code=400, detail="Erro ao conectar no YouTube.")

@app.post("/api/painel/frontend/toggle")
async def toggle_frontend():
    """Liga ou desliga a interface 3D da Raiden (ChatVRM)."""
    if front_module.processo_frontend is not None:
        front_module.parar_chatvrm()
        return {"status": "desligado"}
    else:
        sucesso = front_module.ligar_chatvrm()
        if sucesso: 
            return {"status": "ligado"}
        raise HTTPException(status_code=500, detail="Erro ao iniciar o Front-end.")

@app.post("/api/painel/livepix/toggle")
async def toggle_livepix():
    """Liga ou desliga a escuta de doações (LivePix)."""
    if pix_module.processo_tunel is not None:
        pix_module.parar_tunel()
        return {"status": "desligado"}
    else:
        resultado = pix_module.ligar_tunel()
        if resultado["status"] == "ok":
            return {"status": "ligado", "url": resultado["url"]}
        raise HTTPException(status_code=500, detail=resultado["detail"])

@app.post("/api/painel/parar-tudo")
async def painel_parar():
    """Botão de pânico: Desliga todos os processos de uma vez."""
    yt_module.parar_olheiro()
    front_module.parar_chatvrm()
    pix_module.parar_tunel()
    logger.info("🛑 Comando de emergência acionado: Tudo parado.")
    return {"status": "ok"}

@app.get("/painel")
async def abrir_painel():
    """Entrega o HTML do painel de controle."""
    return FileResponse("painel/dashboard.html")

# ==========================================
# 👗 GESTÃO DE ARQUIVOS (Guarda-Roupa e Background)
# ==========================================
@app.get("/api/arquivos")
async def listar_arquivos():
    """Lista todos os arquivos VRM, VRMA e Imagens da pasta public."""
    modelos, animacoes, fundos = [], [], []
    for arquivo in os.listdir(PASTA_PUBLIC_CHATVRM):
        if arquivo.endswith(".vrm"):
            modelos.append(arquivo)
        elif arquivo.endswith(".vrma"):
            animacoes.append(arquivo)
        elif arquivo.lower().endswith((".png", ".jpg", ".jpeg")):
            fundos.append(arquivo)
    return {"modelos": modelos, "animacoes": animacoes, "fundos": fundos}

@app.post("/api/upload")
async def upload_arquivo(file: UploadFile = File(...)):
    """Salva um novo fundo ou modelo VRM enviado pelo painel."""
    caminho_salvar = os.path.join(PASTA_PUBLIC_CHATVRM, file.filename)
    try:
        with open(caminho_salvar, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        logger.info(f"📥 Arquivo novo salvo com sucesso: {file.filename}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro ao salvar arquivo {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# INICIALIZAÇÃO
# ==========================================
if __name__ == "__main__":
    logger.info("🚀 API Central rodando na porta 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, access_log=False)