"""
🎌 RAIDEN - API Principal
Fase 4: Core REST + Ouvido Físico + Visão + Centro de Comando
Revisão Final: Segurança + Estabilidade + Memória de Curto Prazo + Memória Pessoal
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
import queue
from collections import deque
from io import BytesIO
from pathlib import Path
from typing import Optional
from contextlib import contextmanager, asynccontextmanager

# ==========================================
# 2. BIBLIOTECAS EXTERNAS
# ==========================================
import httpx
import uvicorn
import edge_tts
import speech_recognition as sr

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    WebSocket,
    WebSocketDisconnect
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ==========================================
# 3. MÓDULOS DA RAIDEN
# ==========================================
from modulos.web_memoria import (
    iniciar_banco,
    consultar_conhecimento,
    lembrar_memoria_pessoal,
    aprender_memoria_pessoal,
    esquecer_memoria_pessoal,
    listar_memorias_pessoais,
)
from modulos.visao import ver_a_tela

import modulos.youtube as yt_module
import modulos.frontend as front_module
import modulos.livepix as pix_module


# ==========================================
# CONFIGURAÇÕES GERAIS
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s"
)

logger = logging.getLogger("RaidenCore")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODELO_CONVERSA = "raiden_carioca"

# Mantém o modelo carregado por alguns minutos.
OLLAMA_KEEP_ALIVE = "5m"

MICROFONE_ATIVO = (
    os.getenv("RAIDEN_MICROFONE_ATIVO", "0") == "1"
)

# CORS - Configurável via variável de ambiente
# Padrão: localhost para desenvolvimento
CORS_ORIGINS = os.getenv(
    "RAIDEN_CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:8080"
).split(",")

# Tamanho máximo de upload (10MB)
MAX_UPLOAD_SIZE = 10 * 1024 * 1024

# Tamanho do chunk para leitura de upload (1MB)
UPLOAD_CHUNK_SIZE = 1024 * 1024

RAIZ_PROJETO = Path(__file__).resolve().parent

PASTA_PUBLIC_CHATVRM = (
    RAIZ_PROJETO / "ChatVRM" / "public"
)

PASTA_PAINEL = (
    RAIZ_PROJETO / "painel"
)


# ==========================================
# FILAS
# ==========================================
fila_perguntas = queue.Queue()
fila_respostas = queue.Queue()


# ==========================================
# 🧠 CONTEXTO DE CURTO PRAZO
# ==========================================

historico_conversa = deque(maxlen=10)
historico_lock = threading.Lock()


# ==========================================
# MODELOS DE DADOS
# ==========================================

class MensagemRequest(BaseModel):
    texto: Optional[str] = None
    text: Optional[str] = None


class YouTubeRequest(BaseModel):
    link: Optional[str] = None


class MemoriaRequest(BaseModel):
    termo: str
    conteudo: str
    categoria: str = "geral"


class EsquecerMemoriaRequest(BaseModel):
    termo: str
    categoria: Optional[str] = None


# ==========================================
# UTILITÁRIO
# ==========================================

@contextmanager
def calar_linux():
    """
    Silencia temporariamente o stderr.
    Usado para evitar mensagens indesejadas
    de bibliotecas do sistema.
    """

    devnull = os.open(
        os.devnull,
        os.O_WRONLY
    )

    old_stderr = os.dup(2)

    sys.stderr.flush()

    os.dup2(
        devnull,
        2
    )

    try:
        yield

    finally:
        os.dup2(
            old_stderr,
            2
        )

        os.close(devnull)
        os.close(old_stderr)


# ==========================================
# 🧠 MEMÓRIA DE CURTO PRAZO
# ==========================================

def adicionar_ao_historico(
    usuario: str,
    raiden: str
):
    """
    Salva uma interação recente da conversa.
    Thread-safe.
    """

    with historico_lock:
        historico_conversa.append({
            "usuario": usuario,
            "raiden": raiden
        })


def obter_contexto_conversa() -> str:
    """
    Monta o histórico recente em texto
    para o Ollama entender o contexto.
    Thread-safe.
    """

    with historico_lock:
        historico = list(historico_conversa)

    if not historico:
        return "Não existe conversa anterior relevante."

    linhas = ["CONVERSA RECENTE:"]

    for item in historico:
        linhas.append(
            f"Lucas: {item['usuario']}"
        )
        linhas.append(
            f"Raiden: {item['raiden']}"
        )

    return "\n".join(linhas)


def limpar_historico():
    """
    Limpa todo o histórico de conversa.
    Thread-safe.
    """

    with historico_lock:
        historico_conversa.clear()

    logger.info("🧹 Histórico de conversa limpo.")


def obter_memoria_pessoal(termo: str) -> str:
    """
    Busca informações permanentes relevantes sobre Lucas/projeto.

    A memória pessoal é diferente do histórico:
    - histórico = conversa recente
    - memória pessoal = informações que devem permanecer
    """
    try:
        memoria = lembrar_memoria_pessoal(termo)

        if memoria:
            return memoria

    except Exception as e:
        logger.error(
            f"❌ Erro ao consultar memória pessoal: {e}"
        )

    return ""


# ==========================================
# 🧠 CÉREBRO — OLLAMA
# ==========================================

async def pensar_ollama(
    prompt_usuario: str,
    memoria_pessoal: str = ""
) -> str:
    """
    Envia a mensagem ao Ollama com contexto.
    O Modelfile controla a personalidade.
    O Python controla contexto/orquestração.
    """

    contexto = obter_contexto_conversa()

    bloco_memoria = ""

    if memoria_pessoal:
        bloco_memoria = (
            "\n\nMEMÓRIA PESSOAL RELEVANTE:\n"
            f"{memoria_pessoal}\n"
            "\nUse essa memória somente se ela for relevante "
            "para a mensagem atual. Não invente informações "
            "a partir dela.\n"
        )

    prompt_final = (
        f"{contexto}\n"
        f"{bloco_memoria}\n"
        "MENSAGEM ATUAL DO LUCAS:\n"
        f"{prompt_usuario}\n\n"
        "Responda à mensagem atual considerando "
        "a conversa recente e a memória pessoal "
        "quando forem relevantes."
    )

    payload = {
        "model": MODELO_CONVERSA,
        "prompt": prompt_final,
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "num_predict": 150
        }
    }

    try:

        async with httpx.AsyncClient() as client:

            resp = await client.post(
                OLLAMA_URL,
                json=payload,
                timeout=30.0
            )

            resp.raise_for_status()

            return resp.json().get(
                "response",
                ""
            ).strip()

    except httpx.TimeoutException:
        logger.error("⏱️ Timeout ao conectar com Ollama")
        return (
            "Demorei demais pra pensar, mermão. "
            "Tenta de novo aí."
        )

    except httpx.HTTPError as e:
        logger.error(f"🌐 Erro HTTP com Ollama: {e}")
        return (
            "Deu ruim na comunicação com meu cérebro. "
            "Vê se o Ollama tá ligado!"
        )

    except Exception as e:
        logger.error(f"❌ Erro inesperado no Ollama: {e}")
        return (
            "Deu ruim no meu cérebro, mermão. "
            "Vê se o Ollama tá ligado!"
        )


# ==========================================
# 🔊 GERAÇÃO DE VOZ
# ==========================================

async def gerar_voz_base64(
    texto: str
) -> Optional[str]:
    """
    Gera áudio base64 usando Edge TTS.
    Retorna None em caso de erro.
    """

    if not texto:
        return None

    try:

        communicate = edge_tts.Communicate(
            texto,
            voice="pt-BR-FranciscaNeural",
            rate="+10%"
        )

        audio_buffer = BytesIO()

        async for chunk in communicate.stream():

            if chunk["type"] == "audio":

                audio_buffer.write(
                    chunk["data"]
                )

        return base64.b64encode(
            audio_buffer.getvalue()
        ).decode("utf-8")

    except Exception as e:
        logger.error(f"🔇 Erro na geração de voz: {e}")
        return None


# ==========================================
# 🔎 PROCESSAMENTO COMPLETO
# ==========================================

async def processar_mensagem_completa(
    texto: str
) -> str:
    """
    Processa a mensagem do usuário.
    Fluxo: visão → memória → Ollama → pesquisa → resposta final.
    """

    logger.info(f"🗣️ Input recebido: {texto}")

    texto_lower = texto.lower()

    memoria_pessoal = obter_memoria_pessoal(texto)

    if memoria_pessoal:
        logger.info(
            "🧠 Memória pessoal relevante encontrada."
        )

    # ------------------------------------------
    # 👁️ VISÃO
    # ------------------------------------------

    gatilhos_visao = [
        "olha",
        "vê",
        "ve",
        "que tem",
        "mostra"
    ]

    if (
        "tela" in texto_lower
        and any(
            palavra in texto_lower
            for palavra in gatilhos_visao
        )
    ):

        logger.info("👁️ Ativando o olho...")

        descricao_tela = await ver_a_tela()

        prompt_visao = (
            "O usuário pediu para você olhar "
            "a tela dele.\n\n"
            f"Você viu isso:\n{descricao_tela}\n\n"
            "Descreva isso para ele com "
            "a sua personalidade."
        )

        resposta = await pensar_ollama(
            prompt_visao,
            memoria_pessoal
        )

        adicionar_ao_historico(
            texto,
            resposta
        )

        return resposta

    # ------------------------------------------
    # 🧠 PRIMEIRA RESPOSTA
    # ------------------------------------------

    resposta_bruta = await pensar_ollama(
        texto,
        memoria_pessoal
    )

    # ------------------------------------------
    # 🔎 PESQUISA WEB
    # ------------------------------------------

    match = re.search(
        r"\[PESQUISAR:\s*(.*?)\]",
        resposta_bruta,
        re.IGNORECASE
    )

    if match:

        query = match.group(1).strip()

        logger.info(f"🔍 Raiden pediu para pesquisar: {query}")

        try:

            info_encontrada = (
                await consultar_conhecimento(query)
            )

            if info_encontrada:

                prompt_segunda_passada = (
                    "Você recebeu uma informação "
                    "pesquisada na internet.\n\n"
                    f"PERGUNTA ORIGINAL DO LUCAS:\n"
                    f"{texto}\n\n"
                )

                # Adiciona memória pessoal se existir
                if memoria_pessoal:
                    prompt_segunda_passada += (
                        f"MEMÓRIA PESSOAL RELEVANTE:\n"
                        f"{memoria_pessoal}\n\n"
                    )

                prompt_segunda_passada += (
                    f"INFORMAÇÃO ENCONTRADA NA WEB:\n"
                    f"{info_encontrada}\n\n"
                    "Responda à pergunta original "
                    "usando a informação encontrada. "
                    "Não invente informações que não "
                    "estejam disponíveis."
                )

                resposta_final = await pensar_ollama(
                    prompt_segunda_passada
                )

                adicionar_ao_historico(
                    texto,
                    resposta_final
                )

                return resposta_final

            resposta = (
                "Pô mermão, tentei pesquisar aqui "
                "mas a internet não ajudou em nada."
            )

            adicionar_ao_historico(
                texto,
                resposta
            )

            return resposta

        except Exception as e:
            logger.error(f"🔍 Erro ao pesquisar: {e}")

            resposta = (
                "Foi mal, minha conexão com "
                "a internet caiu aqui."
            )

            adicionar_ao_historico(
                texto,
                resposta
            )

            return resposta

    # ------------------------------------------
    # 💬 RESPOSTA NORMAL
    # ------------------------------------------

    adicionar_ao_historico(
        texto,
        resposta_bruta
    )

    return resposta_bruta


# ==========================================
# 📦 MONTA RESPOSTA COMPLETA
# ==========================================

async def gerar_resposta(
    texto: str
) -> dict:
    """
    Gera resposta completa:
    texto + áudio + expressão.
    """

    resposta_texto = (
        await processar_mensagem_completa(texto)
    )

    audio_b64 = (
        await gerar_voz_base64(resposta_texto)
    )

    return {
        "texto": resposta_texto,
        "audio_base64": audio_b64,
        "expressao": "neutral"
    }


# ==========================================
# 🧠 WORKER DO CÉREBRO
# ==========================================

def worker_cerebro():
    """
    Processa mensagens da fila uma por vez.
    Mantém o worker vivo mesmo com erros.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    logger.info("🧠 Worker do cérebro iniciado.")

    while True:

        try:
            item = fila_perguntas.get(timeout=1)

        except queue.Empty:
            continue

        # --------------------------------------
        # Identifica o tipo da mensagem
        # --------------------------------------

        if isinstance(item, tuple):
            comando, fila_retorno = item
        else:
            comando = item
            fila_retorno = None

        logger.info(f"🧠 Processando: {comando}")

        try:
            resposta = loop.run_until_complete(
                gerar_resposta(comando)
            )

            if fila_retorno is not None:
                fila_retorno.put(resposta)
            else:
                fila_respostas.put(resposta)

        except Exception as e:
            logger.error(f"❌ Erro no processamento: {e}")

            resposta_erro = {
                "texto": (
                    "Deu ruim aqui, mermão. "
                    "Não consegui processar "
                    "essa mensagem."
                ),
                "audio_base64": None,
                "expressao": "neutral"
            }

            if fila_retorno is not None:
                fila_retorno.put(resposta_erro)
            else:
                fila_respostas.put(resposta_erro)

        finally:
            fila_perguntas.task_done()


# ==========================================
# 🎥 YOUTUBE
# ==========================================

def callback_youtube(
    comando: str
):
    """
    Recebe comando do olheiro do YouTube
    e envia para o cérebro.
    """

    fila_perguntas.put(comando)


# ==========================================
# 🎤 MICROFONE
# ==========================================

def escutar_microfone():
    """
    Escuta o microfone e detecta o gatilho.
    Aceita variações do nome Raiden.
    """

    VARIACOES_RAIDEN = [
        "raiden",
        "rayden",
        "haiden",
        "reyden"
    ]

    r = sr.Recognizer()
    r.energy_threshold = 300
    r.dynamic_energy_threshold = True
    r.pause_threshold = 0.8

    try:
        with calar_linux():
            mic = sr.Microphone()

        with mic as source:
            r.adjust_for_ambient_noise(
                source,
                duration=1
            )

            logger.info(
                "🎤 Ouvido físico ativado! "
                "Diga 'Raiden, [sua mensagem]'."
            )

            while True:

                try:
                    audio = r.listen(
                        source,
                        phrase_time_limit=8
                    )

                    texto = (
                        r.recognize_google(
                            audio,
                            language="pt-BR"
                        )
                        .lower()
                    )

                    # Detecta variações do nome
                    gatilho_encontrado = False

                    for variacao in VARIACOES_RAIDEN:

                        if variacao in texto:
                            texto = texto.replace(
                                variacao,
                                ""
                            )
                            gatilho_encontrado = True

                    if not gatilho_encontrado:
                        continue

                    comando = texto.strip()

                    if comando:
                        logger.info(
                            f"🎙️ Microfone captou: {comando}"
                        )
                        fila_perguntas.put(comando)

                except sr.UnknownValueError:
                    pass

                except sr.RequestError as e:
                    logger.warning(
                        f"⚠️ Erro no reconhecimento: {e}"
                    )
                    continue

                except Exception as e:
                    logger.debug(
                        f"Aviso no microfone: {e}"
                    )
                    continue

    except Exception as e:
        logger.error(f"❌ Erro ao iniciar microfone: {e}")
        logger.warning("🎤 Microfone desativado por erro.")


# ==========================================
# 🚀 FASTAPI / LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # ------------------------------------------
    # Inicialização
    # ------------------------------------------

    logger.info("🚀 Inicializando Raiden Core...")

    iniciar_banco()

    # Worker do cérebro
    threading.Thread(
        target=worker_cerebro,
        daemon=True,
        name="TrabalhadorCerebro"
    ).start()

    # Microfone
    if MICROFONE_ATIVO:
        threading.Thread(
            target=escutar_microfone,
            daemon=True,
            name="OuvidoFisico"
        ).start()
        logger.info("🎤 Ouvido físico ativado.")

    else:
        logger.info("🎤 Ouvido físico desativado.")

    # Pasta pública
    PASTA_PUBLIC_CHATVRM.mkdir(
        parents=True,
        exist_ok=True
    )

    logger.info("🎛️ Painel local sem autenticação.")
    logger.info("✅ Raiden Core iniciado com sucesso.")

    yield

    # ------------------------------------------
    # Shutdown
    # ------------------------------------------

    logger.info("🛑 Iniciando shutdown da Raiden...")

    # Para os módulos
    try:
        yt_module.parar_olheiro()
    except Exception:
        pass

    try:
        front_module.parar_chatvrm()
    except Exception:
        pass

    try:
        pix_module.parar_tunel()
    except Exception:
        pass

    # Limpa o histórico
    limpar_historico()

    logger.info("✅ Shutdown completo.")


# ==========================================
# APLICAÇÃO FASTAPI
# ==========================================

app = FastAPI(
    title="Raiden Core API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configurável
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Arquivos estáticos (público - necessário para o frontend)
app.mount(
    "/midia",
    StaticFiles(
        directory=PASTA_PUBLIC_CHATVRM
    ),
    name="midia"
)


# ==========================================
# 💬 CHAT MANUAL (PÚBLICO)
# ==========================================

@app.post("/chat")
async def chat_endpoint(
    req: MensagemRequest
):
    """
    Chat manual.
    Público para permitir uso local.
    """

    texto = (
        req.texto
        or req.text
        or ""
    ).strip()

    if not texto:
        raise HTTPException(
            status_code=400,
            detail="Texto vazio!"
        )

    fila_retorno = queue.Queue(maxsize=1)

    fila_perguntas.put(
        (texto, fila_retorno)
    )

    try:
        resposta = await asyncio.to_thread(
            fila_retorno.get,
            True,
            60
        )

        return resposta

    except queue.Empty:
        raise HTTPException(
            status_code=504,
            detail=(
                "A Raiden demorou mais de "
                "60 segundos para responder."
            )
        )


# ==========================================
# 🔌 WEBSOCKET (PÚBLICO)
# ==========================================

@app.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
    """
    WebSocket para comunicação em tempo real.
    Público para permitir uso local.
    """

    await websocket.accept()
    logger.info("🔌 WebSocket conectado.")

    try:
        while True:
            texto = (
                await websocket.receive_text()
            ).strip()

            if not texto:
                await websocket.send_json({
                    "texto": "Manda alguma coisa aí, mermão.",
                    "audio_base64": None,
                    "expressao": "neutral"
                })
                continue

            logger.info(f"🔌 WebSocket recebeu: {texto}")

            fila_retorno = queue.Queue(maxsize=1)

            fila_perguntas.put(
                (texto, fila_retorno)
            )

            try:
                resposta = await asyncio.to_thread(
                    fila_retorno.get,
                    True,
                    60
                )

            except queue.Empty:
                await websocket.send_json({
                    "texto": (
                        "A Raiden demorou demais "
                        "pra responder, mermão."
                    ),
                    "audio_base64": None,
                    "expressao": "neutral"
                })
                continue

            await websocket.send_json(resposta)
            logger.info("🔌 Resposta enviada pelo WebSocket.")

    except WebSocketDisconnect:
        logger.info("🔌 WebSocket desconectado.")

    except Exception as e:
        logger.error(f"❌ Erro no WebSocket: {e}")

        try:
            await websocket.close(code=1011)
        except Exception:
            pass


# ==========================================
# 🔊 FILA DE ÁUDIO (PÚBLICO)
# ==========================================

@app.get("/proximo_audio")
async def proximo_audio():
    """
    Retorna o próximo áudio da fila.
    Público para uso do frontend.
    """

    try:
        return fila_respostas.get_nowait()

    except queue.Empty:
        return {
            "texto": None,
            "audio_base64": None
        }


# ==========================================
# 🧹 LIMPAR HISTÓRICO
# ==========================================

@app.post("/api/chat/limpar-historico")
async def limpar_historico_chat():
    """
    Limpa o histórico de conversa.
    """

    limpar_historico()

    return {
        "status": "ok",
        "mensagem": "Histórico limpo!"
    }


# ==========================================
# 🧠 MEMÓRIA PESSOAL
# ==========================================

@app.post("/api/painel/memoria/aprender")
async def aprender_memoria(
    req: MemoriaRequest
):
    """
    Salva uma memória permanente da Raiden.
    """

    termo = req.termo.strip()
    conteudo = req.conteudo.strip()
    categoria = req.categoria.strip() or "geral"

    if not termo or not conteudo:
        raise HTTPException(
            status_code=400,
            detail="Termo e conteúdo são obrigatórios."
        )

    sucesso = aprender_memoria_pessoal(
        termo=termo,
        conteudo=conteudo,
        categoria=categoria
    )

    if not sucesso:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível salvar a memória."
        )

    return {
        "status": "ok",
        "mensagem": "Memória aprendida.",
        "termo": termo,
        "categoria": categoria
    }


@app.get("/api/painel/memoria")
async def listar_memoria():
    """
    Lista todas as memórias pessoais da Raiden.
    """

    return {
        "memorias": listar_memorias_pessoais()
    }


@app.delete("/api/painel/memoria")
async def esquecer_memoria(
    req: EsquecerMemoriaRequest
):
    """
    Remove uma memória pessoal.
    """

    termo = req.termo.strip()

    if not termo:
        raise HTTPException(
            status_code=400,
            detail="Termo obrigatório."
        )

    sucesso = esquecer_memoria_pessoal(
        termo=termo,
        categoria=req.categoria
    )

    if not sucesso:
        raise HTTPException(
            status_code=404,
            detail="Memória não encontrada."
        )

    return {
        "status": "ok",
        "mensagem": "Memória esquecida."
    }


# ==========================================
# 🎛️ PAINEL
# ==========================================

@app.get("/api/painel/status")
async def painel_status():
    """
    Status dos módulos.
    """

    return {
        "youtube": yt_module.olheiro_ativo,
        "frontend": (
            front_module.processo_frontend
            is not None
        ),
        "livepix": (
            pix_module.processo_tunel
            is not None
        )
    }


# ==========================================
# YOUTUBE TOGGLE
# ==========================================

@app.post("/api/painel/youtube/toggle")
async def toggle_youtube(
    req: YouTubeRequest = None
):
    """
    Liga/desliga o olheiro do YouTube.
    """

    if yt_module.olheiro_ativo:
        yt_module.parar_olheiro()
        return {"status": "desligado"}

    if not req or not req.link:
        raise HTTPException(
            status_code=400,
            detail="Coloque o link da live para ligar!"
        )

    sucesso = yt_module.iniciar_olheiro(
        req.link,
        callback_youtube
    )

    if sucesso:
        return {"status": "ligado"}

    raise HTTPException(
        status_code=400,
        detail="Erro ao conectar no YouTube."
    )


# ==========================================
# FRONTEND TOGGLE
# ==========================================

@app.post("/api/painel/frontend/toggle")
async def toggle_frontend():
    """
    Liga/desliga o frontend.
    """

    if front_module.processo_frontend is not None:
        front_module.parar_chatvrm()
        return {"status": "desligado"}

    sucesso = front_module.ligar_chatvrm()

    if sucesso:
        return {"status": "ligado"}

    raise HTTPException(
        status_code=500,
        detail="Erro ao iniciar o Front-end."
    )


# ==========================================
# LIVEPIX TOGGLE
# ==========================================

@app.post("/api/painel/livepix/toggle")
async def toggle_livepix():
    """
    Liga/desliga o túnel LivePix.
    """

    if pix_module.processo_tunel is not None:
        pix_module.parar_tunel()
        return {"status": "desligado"}

    resultado = pix_module.ligar_tunel()

    if resultado["status"] == "ok":
        return {
            "status": "ligado",
            "url": resultado["url"]
        }

    raise HTTPException(
        status_code=500,
        detail=resultado["detail"]
    )


# ==========================================
# 🛑 PARAR TUDO
# ==========================================

@app.post("/api/painel/parar-tudo")
async def painel_parar():
    """
    Para todos os módulos.
    """

    yt_module.parar_olheiro()
    front_module.parar_chatvrm()
    pix_module.parar_tunel()

    logger.info("🛑 Comando de emergência: Tudo parado.")

    return {"status": "ok"}


# ==========================================
# PAINEL WEB (PÚBLICO - HTML)
# ==========================================

@app.get("/painel")
async def abrir_painel():
    """
    Página HTML do painel.
    """

    return FileResponse(
        PASTA_PAINEL / "dashboard.html"
    )


# ==========================================
# 👗 GESTÃO DE ARQUIVOS (PÚBLICO)
# ==========================================

EXTENSOES_PERMITIDAS = {
    ".vrm",
    ".vrma",
    ".png",
    ".jpg",
    ".jpeg"
}


@app.get("/api/arquivos")
async def listar_arquivos():
    """
    Lista arquivos de mídia.
    Público - necessário para o frontend.
    """

    modelos = []
    animacoes = []
    fundos = []

    try:
        for arquivo in os.listdir(
            PASTA_PUBLIC_CHATVRM
        ):

            caminho = (
                PASTA_PUBLIC_CHATVRM
                / arquivo
            )

            if not caminho.is_file():
                continue

            if arquivo.lower().endswith(".vrm"):
                modelos.append(arquivo)

            elif arquivo.lower().endswith(".vrma"):
                animacoes.append(arquivo)

            elif arquivo.lower().endswith(
                (".png", ".jpg", ".jpeg")
            ):
                fundos.append(arquivo)

        return {
            "modelos": modelos,
            "animacoes": animacoes,
            "fundos": fundos
        }

    except Exception as e:
        logger.error(f"❌ Erro ao listar arquivos: {e}")
        raise HTTPException(
            status_code=500,
            detail="Erro ao listar arquivos."
        )


# ==========================================
# 📤 UPLOAD
# ==========================================

@app.post("/api/upload")
async def upload_arquivo(
    file: UploadFile = File(...)
):
    """
    Upload de arquivos de mídia.
    """

    # Sanitização do nome
    nome_arquivo = Path(
        file.filename or ""
    ).name

    if not nome_arquivo:
        raise HTTPException(
            status_code=400,
            detail="Nome de arquivo inválido."
        )

    # Verifica extensão
    extensao = Path(nome_arquivo).suffix.lower()

    if extensao not in EXTENSOES_PERMITIDAS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tipo de arquivo não permitido. "
                "Use VRM, VRMA, PNG ou JPG."
            )
        )

    # Garante que o caminho está dentro da pasta
    caminho_salvar = (
        PASTA_PUBLIC_CHATVRM / nome_arquivo
    )

    try:
        # Garante que está dentro da pasta pública
        caminho_salvar.resolve().relative_to(
            PASTA_PUBLIC_CHATVRM.resolve()
        )

    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Caminho de arquivo inválido."
        )

    try:
        # Leitura em chunks com limite
        tamanho_total = 0
        conteudo = bytearray()

        while True:
            chunk = await file.read(
                UPLOAD_CHUNK_SIZE
            )

            if not chunk:
                break

            tamanho_total += len(chunk)

            if tamanho_total > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        "Arquivo muito grande! "
                        "Máximo: 10MB"
                    )
                )

            conteudo.extend(chunk)

        # Salva o arquivo
        caminho_salvar.write_bytes(conteudo)

        logger.info(
            f"📥 Arquivo salvo: {nome_arquivo} "
            f"({tamanho_total} bytes)"
        )

        return {
            "status": "ok",
            "arquivo": nome_arquivo,
            "tamanho": tamanho_total
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"❌ Erro ao salvar arquivo "
            f"{nome_arquivo}: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail="Erro ao salvar arquivo."
        )


# ==========================================
# 🚀 INICIALIZAÇÃO
# ==========================================

if __name__ == "__main__":

    logger.info(
        "🚀 API Central rodando na porta 8000..."
    )

    logger.info(
        "🌐 Host: 127.0.0.1 (somente este computador)"
    )

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        access_log=False
    )