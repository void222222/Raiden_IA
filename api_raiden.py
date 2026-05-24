"""
Raiden 2.0 Backend – FastAPI
Substitui todo o loop infinito antigo.
Agora o PC fica servindo as requisições do app Tauri (local ou remoto via Tailscale).
"""

import base64
import io
import json
import os
import re
import sqlite3
import time
import threading
from io import BytesIO
from typing import Optional
from contextlib import asynccontextmanager

import requests
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image
import mss
import numpy as np

# --- Configurações Globais ---
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_VISION_URL = "http://localhost:11434/api/generate"   # mesma rota, muda o modelo
WAKE_WORD = "raiden"           # será tratado no cliente Tauri, aqui fica só referência
TEMPO_SILENCIO_PARA_PROATIVIDADE = 45  # segundos sem interação para o servidor sugerir fala
MODELO_CONVERSA = "raiden_nova"
MODELO_CODIGO = "qwen2.5-coder:7b"
MODELO_ROTEADOR = "llama3:8b"  # leve, só para classificar intenção
MODELO_VISAO = "llava:7b"      # ou qwen:vision

# --- Bio do Mestre ---
def carregar_bio():
    try:
        with open("bio_raiden.txt", "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "O usuário é Lucas, seu mestre. Ele é esforçado e está construindo você."

BIO = carregar_bio()

# --- Banco de Dados (Thread‑safe por conexão) ---
def get_db():
    conn = sqlite3.connect("memoria_raiden.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def iniciar_caderno():
    conn = get_db()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS historico 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, autor TEXT, mensagem TEXT, timestamp REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS agenda 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, tarefa TEXT, data TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS estado 
                 (chave TEXT PRIMARY KEY, valor INTEGER)''')
    c.execute('INSERT OR IGNORE INTO estado (chave, valor) VALUES ("irritacao", 0)')
    conn.commit()
    return conn

conn = iniciar_caderno()

def ajustar_humor(delta):
    c = conn.cursor()
    c.execute("SELECT valor FROM estado WHERE chave = 'irritacao'")
    atual = c.fetchone()[0]
    novo = max(0, min(100, atual + delta))
    c.execute("UPDATE estado SET valor = ? WHERE chave = 'irritacao'", (novo,))
    conn.commit()
    return novo

def anotar_no_caderno(autor, msg):
    c = conn.cursor()
    c.execute("INSERT INTO historico (autor, mensagem, timestamp) VALUES (?, ?, ?)",
              (autor, msg, time.time()))
    conn.commit()

def ler_ultimas_conversas(limite=4):
    c = conn.cursor()
    c.execute("SELECT autor, mensagem FROM historico ORDER BY id DESC LIMIT ?", (limite,))
    linhas = c.fetchall()
    linhas.reverse()
    return "".join(f"{l['autor']}: {l['mensagem']}\n" for l in linhas)

def salvar_tarefa(tarefa):
    c = conn.cursor()
    data = time.strftime("%d/%m/%Y")
    c.execute("INSERT INTO agenda (tarefa, data) VALUES (?, ?)", (tarefa, data))
    conn.commit()
    return f"Tarefa '{tarefa}' anotada."

def listar_tarefas():
    c = conn.cursor()
    c.execute("SELECT tarefa FROM agenda")
    tarefas = c.fetchall()
    if not tarefas:
        return "Sua agenda está vazia."
    return "Suas tarefas são: " + ", ".join(t['tarefa'] for t in tarefas)

# --- Funções da IA ---
def chamar_ollama(modelo: str, prompt: str, system: str = None) -> str:
    payload = {"model": modelo, "prompt": prompt, "stream": False}
    if system:
        payload["system"] = system
    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=20)
        resp.raise_for_status()
        return resp.json()["response"]
    except Exception as e:
        print(f"Erro no Ollama ({modelo}): {e}")
        return "[Erro na IA]"

def router_intencao(mensagem: str) -> str:
    """
    Usa um modelo leve para decidir se a mensagem é sobre código ou conversa.
    Retorna 'codigo' ou 'conversa'.
    """
    prompt = f"""
Você é um classificador. Analise a mensagem do usuário e responda apenas com uma palavra: "codigo" se for um pedido relacionado a programação, script, debug, etc; "conversa" para qualquer outra coisa (papo, perguntas pessoais, comandos de sistema, etc).

Mensagem: {mensagem}
Classificação:"""
    resposta = chamar_ollama(MODELO_ROTEADOR, prompt).strip().lower()
    if "codigo" in resposta:
        return "codigo"
    else:
        return "conversa"

def gerar_fala(texto: str) -> bytes:
    """
    Gera áudio em memória e retorna os bytes do MP3.
    Pode substituir gTTS por algo melhor depois (ex: edge-tts).
    """
    from gtts import gTTS
    mp3_fp = BytesIO()
    tts = gTTS(text=texto, lang='pt', slow=False)
    tts.write_to_fp(mp3_fp)
    mp3_fp.seek(0)
    return mp3_fp.read()

def processar_mensagem(texto_usuario: str) -> dict:
    """
    Recebe o texto do usuário, faz toda a lógica (roteamento, IA, comandos internos)
    e retorna um dicionário com a resposta e áudio.
    """
    texto = texto_usuario.lower().strip()
    if not texto:
        return {"texto": "", "audio": None, "expressao": None}

    # --- Comandos diretos de sistema (sem IA) ---
    if "encerrar sistema" in texto:
        return {"texto": "Até logo, Lucas.", "audio": gerar_fala("Até logo, Lucas."), "expressao": None}

    # Expressões manuais (caso queira manter)
    if "cara de brava" in texto or "ficar brava" in texto:
        return {"texto": "Pronto, estou furiosa.", "audio": gerar_fala("Pronto, estou furiosa."), "expressao": "angry"}
    if "cara de feliz" in texto or "ficar feliz" in texto:
        return {"texto": "Assim está melhor? Não se acostume.", "audio": gerar_fala("Assim está melhor? Não se acostume."), "expressao": "happy"}
    if "cara de triste" in texto or "triste" in texto:
        return {"texto": "Por sua causa, agora estou triste.", "audio": gerar_fala("Por sua causa, agora estou triste."), "expressao": "sad"}
    if "cara de surpresa" in texto or "surpresa" in texto:
        return {"texto": "Ah! Me assustou.", "audio": gerar_fala("Ah! Me assustou."), "expressao": "surprised"}
    if "cara normal" in texto or "voltar ao normal" in texto:
        return {"texto": "Hum, melhor assim.", "audio": gerar_fala("Hum, melhor assim."), "expressao": "neutral"}

    # Agenda
    if "anotar" in texto or "lembrar" in texto:
        item = re.sub(r'(anotar|lembrar)', '', texto).strip()
        if item:
            resp = salvar_tarefa(item)
        else:
            resp = "O que você quer anotar?"
        return {"texto": resp, "audio": gerar_fala(resp), "expressao": None}
    if "agenda" in texto or "tarefas" in texto:
        resp = listar_tarefas()
        return {"texto": resp, "audio": gerar_fala(resp), "expressao": None}

    # YouTube
    match_musica = re.search(r'(tocar|colocar|toca|coloca)\s+(.+)', texto)
    if match_musica:
        termo = match_musica.group(2).strip()
        if termo:
            import webbrowser
            webbrowser.open(f"https://www.youtube.com/results?search_query={termo.replace(' ', '+')}")
            resp = f"Tocando {termo} no YouTube."
            return {"texto": resp, "audio": gerar_fala(resp), "expressao": None}

    # --- IA ---
    # Ajustar humor
    delta = 10 if "testando" in texto else 5 if len(texto.split()) < 3 else 2
    if "por favor" in texto:
        delta = -5
    irritacao = ajustar_humor(delta)

    # Roteador inteligente
    intencao = router_intencao(texto)
    modelo = MODELO_CODIGO if intencao == "codigo" else MODELO_CONVERSA
    print(f"🧠 Usando modelo: {modelo} (intenção: {intencao})")

    historico = ler_ultimas_conversas(4)
    prompt = f"""[CONTEXTO]
{BIO}

Irritação: {irritacao}/100

Histórico recente:
{historico}

Lucas: {texto}
Raiden:"""

    resposta = chamar_ollama(modelo, prompt)

    if not resposta or "[Erro" in resposta:
        resposta = "Desculpe, não consegui pensar direito."

    # Tentar detectar function calling no retorno (ex: uma tool call em JSON)
    tool_regex = r'\{[^{}]*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^{}]*\}\s*\}'
    match_tool = re.search(tool_regex, resposta)
    if match_tool:
        try:
            tool_call = json.loads(match_tool.group(0))
            tool_name = tool_call.get("tool")
            args = tool_call.get("args", {})
            if tool_name == "create_folder":
                pasta = args.get("path", "")
                if pasta:
                    os.makedirs(pasta, exist_ok=True)
                    resposta = re.sub(tool_regex, '', resposta).strip()
                    resposta += f"\n[Pasta '{pasta}' criada.]"
        except Exception as e:
            print(f"Erro no function calling: {e}")

    anotar_no_caderno("Lucas", texto)
    anotar_no_caderno("Raiden", resposta)

    audio_bytes = gerar_fala(resposta)
    return {"texto": resposta, "audio": audio_bytes, "expressao": None}


# --- Inicialização do FastAPI ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(lifespan=lifespan)

# --- Modelos de dados para as requisições (ATUALIZADO) ---
class MensagemRequest(BaseModel):
    text: Optional[str] = None
    texto: Optional[str] = None
    audio_base64: Optional[str] = None

class ScreenshotRequest(BaseModel):
    image_base64: Optional[str] = None


# ---------- ROTAS ----------
@app.post("/chat")
async def chat_endpoint(req: MensagemRequest):
    """
    Recebe texto através dos campos 'text' (padrão ChatVRM) ou 'texto'.
    Retorna JSON com a resposta e áudio em base64.
    """
    # Se vier 'texto' usa ele, senão usa 'text' (tolerante aos dois formatos)
    texto = req.texto or req.text
    
    if not texto and req.audio_base64:
        raise HTTPException(status_code=400, detail="Envie pelo menos o texto.")
        
    resultado = processar_mensagem(texto)
    audio_b64 = base64.b64encode(resultado["audio"]).decode("utf-8") if resultado["audio"] else None
    
    return {
        "texto": resultado["texto"],
        "audio_base64": audio_b64,
        "expressao": resultado["expressao"]
    }

@app.get("/status")
async def status():
    """Retorna o estado atual da Raiden (irritação, etc.)."""
    c = conn.cursor()
    c.execute("SELECT valor FROM estado WHERE chave = 'irritacao'")
    irritacao = c.fetchone()[0]
    return {"irritacao": irritacao, "ultima_conversa": ler_ultimas_conversas(1)}

@app.post("/proatividade")
async def verificar_proatividade():
    """
    Chamada pelo cliente quando detecta silêncio.
    O servidor decide se a Raiden deve falar algo.
    """
    c = conn.cursor()
    c.execute("SELECT MAX(timestamp) FROM historico WHERE autor='Lucas'")
    ultimo = c.fetchone()[0] or 0
    agora = time.time()
    if agora - ultimo < TEMPO_SILENCIO_PARA_PROATIVIDADE:
        return {"deve_falar": False}

    prompt = f"""
[BIO]
{BIO}
Irritação atual: {ajustar_humor(0)}/100.
O Lucas está em silêncio há mais de 45 segundos. Você (Raiden) deve puxar um assunto tsundere?
Responda apenas "sim" ou "não"."""
    decisao = chamar_ollama(MODELO_ROTEADOR, prompt).strip().lower()
    if "sim" in decisao:
        historico = ler_ultimas_conversas(4)
        prompt_fala = f"""[CONTEXTO]
{BIO}
Irritação: {ajustar_humor(0)}/100.
Histórico recente:
{historico}
Lucas está ausente. Puxe assunto de forma tsundere.
Raiden:"""
        fala = chamar_ollama(MODELO_CONVERSA, prompt_fala)
        anotar_no_caderno("Raiden", fala)
        audio_bytes = gerar_fala(fala)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {"deve_falar": True, "texto": fala, "audio_base64": audio_b64}
    else:
        return {"deve_falar": False}

@app.post("/visao")
async def visao_endpoint(req: ScreenshotRequest = None):
    """
    Tira um screenshot da tela do servidor (ou usa imagem enviada pelo cliente)
    e pede para a Raiden comentar usando modelo multimodal.
    """
    if req and req.image_base64:
        image_data = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(image_data))
    else:
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            sct_img = sct.grab(monitor)
            image = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")

    buffered = BytesIO()
    image.save(buffered, format="JPEG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

    prompt = f"""
[BIO]
{BIO}
O Lucas está na frente do computador. Olhe a tela e faça um comentário tsundere sobre o que ele está fazendo.
Histórico recente:
{ler_ultimas_conversas(2)}
Raiden (comentário curto, no máximo 2 frases):"""

    payload = {
        "model": MODELO_VISAO,
        "prompt": prompt,
        "images": [img_base64],
        "stream": False
    }
    try:
        resp = requests.post(OLLAMA_VISION_URL, json=payload, timeout=30)
        resp.raise_for_status()
        comentario = resp.json()["response"]
    except Exception as e:
        print(f"Erro visão: {e}")
        comentario = "Não consigo ver sua tela agora."

    anotar_no_caderno("Raiden", comentario)
    audio_bytes = gerar_fala(comentario)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {"texto": comentario, "audio_base64": audio_b64}

# ---------- Inicialização do serviço ----------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)