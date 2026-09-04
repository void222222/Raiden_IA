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
import queue
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

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ==========================================
# 3. MÓDULOS DA RAIDEN
# ==========================================
from modulos.web_memoria import iniciar_banco, consultar_conhecimento
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
#
# fila_perguntas:
#   recebe mensagens para o cérebro processar.
#
# fila_respostas:
#   recebe respostas vindas do YouTube/microfone.
#
# Mensagens manuais do /chat recebem uma fila
# própria temporária para que o endpoint possa
# esperar pela resposta correta.
#
# ==========================================

fila_perguntas = queue.Queue()
fila_respostas = queue.Queue()


# ==========================================
# MODELOS DE DADOS
# ==========================================

class MensagemRequest(BaseModel):
    texto: Optional[str] = None
    text: Optional[str] = None


class YouTubeRequest(BaseModel):
    link: Optional[str] = None


# ==========================================
# UTILITÁRIO
# ==========================================

@contextmanager
def calar_linux():
    """
    Silencia temporariamente o stderr.

    Usado principalmente na inicialização do
    microfone para evitar mensagens indesejadas
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
# 🧠 CÉREBRO — OLLAMA
# ==========================================

async def pensar_ollama(
    prompt_usuario: str,
    respondendo_pesquisa: bool = False
) -> str:

    if respondendo_pesquisa:

        prompt_sistema = (
            "Você é a Raiden, uma VTuber Carioca Tsundere.\n"
            "Responda em no MÁXIMO 2 frases curtas. "
            "Seja direta. Use gírias do Rio "
            "(Mermão, Papo reto, Coé).\n"
            "Apenas leia a informação recebida e "
            "explique para o usuário com a sua personalidade."
        )

    else:

        prompt_sistema = (
            "Você é a Raiden, uma VTuber Carioca Tsundere.\n"
            "Regra 1: Responda em no MÁXIMO 2 frases curtas. "
            "Seja direta. Use gírias do Rio.\n"
            "Regra 2: Se pedirem curiosidades, tutoriais "
            "ou coisas que você NÃO SABE, responda "
            "APENAS com a tag:\n"
            "[PESQUISAR: termo resumido]\n"
            "NÃO escreva mais nada além da tag "
            "se precisar pesquisar."
        )

    payload = {
        "model": MODELO_CONVERSA,
        "prompt": prompt_usuario,
        "system": prompt_sistema,
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

    except Exception as e:

        logger.error(
            f"Erro ao conectar com o cérebro (Ollama): {e}"
        )

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

        logger.error(
            f"Erro na geração de voz: {e}"
        )

        return None


# ==========================================
# 🔎 PROCESSAMENTO COMPLETO
# ==========================================

async def processar_mensagem_completa(
    texto: str
) -> str:

    logger.info(
        f"🗣️ Input recebido: {texto}"
    )

    texto_lower = texto.lower()

    # ------------------------------------------
    # VISÃO
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

        logger.info(
            "👁️ Ativando o olho..."
        )

        descricao_tela = await ver_a_tela()

        prompt_visao = (
            "O usuário pediu para você olhar "
            "a tela dele.\n\n"
            f"Você viu isso:\n{descricao_tela}\n\n"
            "Descreva isso para ele com "
            "a sua personalidade carioca."
        )

        return await pensar_ollama(
            prompt_visao,
            respondendo_pesquisa=True
        )

    # ------------------------------------------
    # PRIMEIRA RESPOSTA
    # ------------------------------------------

    resposta_bruta = await pensar_ollama(
        texto,
        respondendo_pesquisa=False
    )

    # ------------------------------------------
    # PESQUISA WEB
    # ------------------------------------------

    match = re.search(
        r"\[PESQUISAR:\s*(.*?)\]",
        resposta_bruta,
        re.IGNORECASE
    )

    if match:

        query = match.group(1).strip()

        logger.info(
            f"🔍 Raiden pediu para pesquisar: {query}"
        )

        try:

            info_encontrada = (
                await consultar_conhecimento(query)
            )

            if info_encontrada:

                prompt_segunda_passada = (
                    f"O usuário te perguntou o seguinte:\n"
                    f"'{texto}'\n\n"

                    f"O sistema pesquisou na internet "
                    f"e achou isso:\n"
                    f"{info_encontrada}\n\n"

                    "Responda EXATAMENTE o que o "
                    "usuário perguntou usando essas "
                    "informações. "
                    "Vá direto ao ponto."
                )

                return await pensar_ollama(
                    prompt_segunda_passada,
                    respondendo_pesquisa=True
                )

            return (
                "Pô mermão, tentei pesquisar aqui "
                "mas a internet não ajudou em nada."
            )

        except Exception as e:

            logger.error(
                "Erro ao tentar pesquisar: "
                f"{e}"
            )

            return (
                "Foi mal, minha conexão com "
                "a internet caiu aqui."
            )

    # ------------------------------------------
    # RESPOSTA NORMAL
    # ------------------------------------------

    return resposta_bruta


# ==========================================
# 📦 MONTA RESPOSTA COMPLETA
# ==========================================

async def gerar_resposta(
    texto: str
) -> dict:

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

    Mensagens normais:
        fila_perguntas.put("texto")

    Mensagens manuais do /chat:
        fila_perguntas.put(
            (texto, fila_de_retorno)
        )
    """

    loop = asyncio.new_event_loop()

    asyncio.set_event_loop(loop)

    while True:

        item = fila_perguntas.get()

        # --------------------------------------
        # Identifica o tipo da mensagem
        # --------------------------------------

        if isinstance(item, tuple):

            comando, fila_retorno = item

        else:

            comando = item
            fila_retorno = None

        logger.info(
            f"🧠 Processando pergunta da fila: "
            f"{comando}"
        )

        try:

            resposta = loop.run_until_complete(
                gerar_resposta(comando)
            )

            # ----------------------------------
            # Mensagem manual
            # ----------------------------------

            if fila_retorno is not None:

                fila_retorno.put(
                    resposta
                )

            # ----------------------------------
            # YouTube / Microfone
            # ----------------------------------

            else:

                fila_respostas.put(
                    resposta
                )

        except Exception as e:

            logger.error(
                f"Erro no processamento da fila: {e}"
            )

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

                fila_retorno.put(
                    resposta_erro
                )

            else:

                fila_respostas.put(
                    resposta_erro
                )

        finally:

            fila_perguntas.task_done()


# ==========================================
# 🎥 YOUTUBE
# ==========================================

def callback_youtube(
    comando: str
):
    """
    Recebe o comando do olheiro do YouTube
    e manda para o cérebro.
    """

    fila_perguntas.put(
        comando
    )


# ==========================================
# 🎤 MICROFONE
# ==========================================

def escutar_microfone():
    """
    Escuta o microfone e só envia mensagens
    que contenham 'Raiden'.
    """

    r = sr.Recognizer()

    r.energy_threshold = 300
    r.dynamic_energy_threshold = True
    r.pause_threshold = 0.8

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

                if "raiden" in texto:

                    comando = (
                        texto
                        .replace(
                            "raiden",
                            ""
                        )
                        .strip()
                    )

                    if comando:

                        logger.info(
                            "🎙️ Microfone captou: "
                            f"{comando}"
                        )

                        fila_perguntas.put(
                            comando
                        )

            except sr.UnknownValueError:

                pass

            except Exception as e:

                logger.debug(
                    f"Aviso no microfone: {e}"
                )


# ==========================================
# 🚀 FASTAPI / LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    iniciar_banco()

    # ------------------------------------------
    # Worker do cérebro
    # ------------------------------------------

    threading.Thread(
        target=worker_cerebro,
        daemon=True,
        name="TrabalhadorCerebro"
    ).start()

    # ------------------------------------------
    # Microfone
    # ------------------------------------------

    if MICROFONE_ATIVO:

        threading.Thread(
            target=escutar_microfone,
            daemon=True
        ).start()

        logger.info(
            "🎤 Ouvido físico ativado por "
            "RAIDEN_MICROFONE_ATIVO=1."
        )

    else:

        logger.info(
            "🎤 Ouvido físico desativado."
        )

    # ------------------------------------------
    # Pasta pública
    # ------------------------------------------

    PASTA_PUBLIC_CHATVRM.mkdir(
        parents=True,
        exist_ok=True
    )

    yield


# ==========================================
# APLICAÇÃO FASTAPI
# ==========================================

app = FastAPI(
    title="Raiden Core API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.mount(
    "/midia",
    StaticFiles(
        directory=PASTA_PUBLIC_CHATVRM
    ),
    name="midia"
)


# ==========================================
# 💬 CHAT MANUAL
# ==========================================

@app.post("/chat")
async def chat_endpoint(
    req: MensagemRequest
):
    """
    Recebe uma mensagem manual.

    A diferença importante é que agora o endpoint
    espera a resposta do worker antes de responder
    ao frontend.

    Antes:
        frontend -> /chat
                  -> status

    Agora:
        frontend -> /chat
                  -> fila
                  -> Ollama
                  -> TTS
                  -> resposta
                  -> frontend
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

    # ------------------------------------------
    # Cria uma fila exclusiva para essa pergunta
    # ------------------------------------------

    fila_retorno = queue.Queue(
        maxsize=1
    )

    # ------------------------------------------
    # Coloca a pergunta na fila principal
    # ------------------------------------------

    fila_perguntas.put(
        (
            texto,
            fila_retorno
        )
    )

    # ------------------------------------------
    # Espera o worker responder.
    #
    # asyncio.to_thread evita bloquear o
    # event loop do FastAPI enquanto esperamos
    # a queue do Python.
    # ------------------------------------------

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
# 🔊 FILA DE ÁUDIO
# ==========================================

@app.get("/proximo_audio")
async def proximo_audio():
    """
    Continua existindo para respostas do
    YouTube e microfone.

    O chat manual agora recebe a resposta
    diretamente pelo /chat.
    """

    try:

        return fila_respostas.get_nowait()

    except queue.Empty:

        return {
            "texto": None,
            "audio_base64": None
        }


# ==========================================
# 🎛️ PAINEL
# ==========================================

@app.get("/api/painel/status")
async def painel_status():

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

@app.post(
    "/api/painel/youtube/toggle"
)
async def toggle_youtube(
    req: YouTubeRequest = None
):

    if yt_module.olheiro_ativo:

        yt_module.parar_olheiro()

        return {
            "status": "desligado"
        }

    if not req or not req.link:

        raise HTTPException(
            status_code=400,
            detail=(
                "Coloque o link da live "
                "para ligar!"
            )
        )

    sucesso = yt_module.iniciar_olheiro(
        req.link,
        callback_youtube
    )

    if sucesso:

        return {
            "status": "ligado"
        }

    raise HTTPException(
        status_code=400,
        detail=(
            "Erro ao conectar no YouTube."
        )
    )


# ==========================================
# FRONTEND TOGGLE
# ==========================================

@app.post(
    "/api/painel/frontend/toggle"
)
async def toggle_frontend():

    if (
        front_module.processo_frontend
        is not None
    ):

        front_module.parar_chatvrm()

        return {
            "status": "desligado"
        }

    sucesso = (
        front_module.ligar_chatvrm()
    )

    if sucesso:

        return {
            "status": "ligado"
        }

    raise HTTPException(
        status_code=500,
        detail=(
            "Erro ao iniciar o Front-end."
        )
    )


# ==========================================
# LIVEPIX TOGGLE
# ==========================================

@app.post(
    "/api/painel/livepix/toggle"
)
async def toggle_livepix():

    if (
        pix_module.processo_tunel
        is not None
    ):

        pix_module.parar_tunel()

        return {
            "status": "desligado"
        }

    resultado = (
        pix_module.ligar_tunel()
    )

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

@app.post(
    "/api/painel/parar-tudo"
)
async def painel_parar():

    yt_module.parar_olheiro()

    front_module.parar_chatvrm()

    pix_module.parar_tunel()

    logger.info(
        "🛑 Comando de emergência acionado: "
        "Tudo parado."
    )

    return {
        "status": "ok"
    }


# ==========================================
# PAINEL WEB
# ==========================================

@app.get("/painel")
async def abrir_painel():

    return FileResponse(
        PASTA_PAINEL / "dashboard.html"
    )


# ==========================================
# 👗 GESTÃO DE ARQUIVOS
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

    modelos = []
    animacoes = []
    fundos = []

    for arquivo in os.listdir(
        PASTA_PUBLIC_CHATVRM
    ):

        caminho = (
            PASTA_PUBLIC_CHATVRM
            / arquivo
        )

        if not caminho.is_file():
            continue

        if arquivo.lower().endswith(
            ".vrm"
        ):

            modelos.append(
                arquivo
            )

        elif arquivo.lower().endswith(
            ".vrma"
        ):

            animacoes.append(
                arquivo
            )

        elif arquivo.lower().endswith(
            (
                ".png",
                ".jpg",
                ".jpeg"
            )
        ):

            fundos.append(
                arquivo
            )

    return {
        "modelos": modelos,
        "animacoes": animacoes,
        "fundos": fundos
    }


# ==========================================
# 📤 UPLOAD
# ==========================================

@app.post("/api/upload")
async def upload_arquivo(
    file: UploadFile = File(...)
):

    # ------------------------------------------
    # Remove qualquer caminho enviado pelo
    # cliente.
    #
    # Exemplo perigoso:
    # ../../arquivo.py
    #
    # vira apenas:
    # arquivo.py
    # ------------------------------------------

    nome_arquivo = Path(
        file.filename or ""
    ).name

    extensao = Path(
        nome_arquivo
    ).suffix.lower()

    if not nome_arquivo:

        raise HTTPException(
            status_code=400,
            detail="Nome de arquivo inválido."
        )

    # ------------------------------------------
    # Só permite arquivos usados pelo camarim.
    # ------------------------------------------

    if extensao not in EXTENSOES_PERMITIDAS:

        raise HTTPException(
            status_code=400,
            detail=(
                "Tipo de arquivo não permitido. "
                "Use VRM, VRMA, PNG ou JPG."
            )
        )

    caminho_salvar = (
        PASTA_PUBLIC_CHATVRM
        / nome_arquivo
    )

    try:

        content = await file.read()

        caminho_salvar.write_bytes(
            content
        )

        logger.info(
            "📥 Arquivo novo salvo com sucesso: "
            f"{nome_arquivo}"
        )

        return {
            "status": "ok",
            "arquivo": nome_arquivo
        }

    except Exception as e:

        logger.error(
            "Erro ao salvar arquivo "
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
        "🚀 API Central rodando "
        "na porta 8000..."
    )

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        access_log=False
    )
