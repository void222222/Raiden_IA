"""🎌 RAIDEN - Assistente Virtual Linux (Arquitetura Modular + Comandos Dinâmicos)"""
import asyncio
import base64
import json
import os
import re
import threading
import time
from typing import Optional
import httpx
import speech_recognition as sr
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import warnings

# ========= MÓDULOS INTERNOS =========
from modulos.memoria import (
    iniciar_caderno, ajustar_humor, anotar_no_caderno,
    ler_ultimas_conversas, carregar_bio
)
from modulos.cerebro import (
    chamar_ollama, router_intencao,
    MODELO_CONVERSA, MODELO_CODIGO, MODELO_VISAO
)
from modulos.audio import gerar_fala, limpar_emojis
from modulos.sistema import (
    capturar_tela, ajustar_volume, controlar_midia,
    digitar_texto, abrir_editor, extrair_numero_do_texto
)
from modulos.web import (
    executar_pesquisa_google, executar_pesquisa_youtube,
    executar_video_youtube_direto, devorar_video_youtube
)
from modulos.grande_sabio import executar_pesquisa_profunda

# ========= CONFIGURAÇÕES INICIAIS =========
os.environ['ALSA_CARD'] = 'default'
os.environ['AUDIODEV'] = 'null'
warnings.filterwarnings("ignore", category=RuntimeWarning)
logging.getLogger("uvicorn.access").disabled = True
logging.getLogger("speech_recognition").setLevel(logging.ERROR)

# ========= APLICAÇÃO FASTAPI =========
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Inicializa banco de dados
iniciar_caderno()
BIO = carregar_bio()

# ========= PROCESSAMENTO DE MENSAGENS (CÉREBRO CENTRAL) =========

async def processar_mensagem(texto_usuario: str) -> dict:
    texto = texto_usuario.lower().strip()
    if not texto:
        return {"texto": "", "audio": None, "expressao": None}

    print(f"\n🧠 Processando: '{texto_usuario}'")

    # ====== COMANDOS LOCAIS RÁPIDOS (FAST-PATH) ======
    
    # Humor
    if "cara de brava" in texto or "ficar brava" in texto:
        return {"texto": "Pronto, estou furiosa.", "audio": gerar_fala("Pronto, estou furiosa."), "expressao": "angry"}
    if "cara normal" in texto or "voltar ao normal" in texto:
        return {"texto": "Hum, melhor assim.", "audio": gerar_fala("Hum, melhor assim."), "expressao": "neutral"}
    
    # Encerramento
    if "encerrar sistema" in texto or "desligar sistema" in texto:
        return {"texto": "Até logo, Lucas. Foi bom trabalhar com você.", "audio": gerar_fala("Até logo, Lucas. Foi bom trabalhar com você."), "expressao": None}
    
    # ====== AGENDA: LISTAR TAREFAS (verificar primeiro) ======
    if any(g in texto for g in ["quais são minhas tarefas", "mostrar agenda", "ver agenda", 
                                  "o que eu tenho pra fazer", "minhas tarefas", "lista de tarefas",
                                  "me mostrar a agenda", "mostrar tarefas", "listar tarefas",
                                  "o que tem na agenda", "o que está na agenda"]):
        from modulos.memoria import listar_tarefas
        
        resultado = listar_tarefas()
        print(f"   📅 Listando tarefas: {resultado}")
        
        audio_bytes = gerar_fala(resultado)
        anotar_no_caderno("Lucas", texto_usuario)
        anotar_no_caderno("Raiden", resultado)
        return {"texto": resultado, "audio": audio_bytes, "expressao": None}
    
    # ====== AGENDA: SALVAR TAREFA ======
    gatilhos_agenda = ["agendar", "agenda ", "agende", "anota tarefa", "salvar tarefa", 
                       "salvar compromisso", "lembrar de", "me lembrar", "marcar compromisso", 
                       "adicionar na agenda", "marcar na agenda", "colocar na agenda", 
                       "criar tarefa", "nova tarefa", "novo compromisso", "novo evento",
                       "anotar compromisso", "registrar tarefa", "registrar compromisso"]
    
    if any(g in texto for g in gatilhos_agenda):
        from modulos.memoria import salvar_tarefa
        
        # Extrai a tarefa removendo os gatilhos
        tarefa = texto
        for gatilho in ["agendar", "agenda", "agende", "anota tarefa", "salvar tarefa", 
                        "salvar compromisso", "lembrar de", "me lembrar", "marcar compromisso", 
                        "adicionar na agenda", "marcar na agenda", "colocar na agenda", 
                        "criar tarefa", "nova tarefa", "novo compromisso", "novo evento",
                        "anotar compromisso", "registrar tarefa", "registrar compromisso",
                        "raiden", "por favor", "para mim", "na agenda"]:
            tarefa = tarefa.replace(gatilho, "")
        
        tarefa = tarefa.strip().strip(":").strip().strip(",").strip()
        
        if tarefa and len(tarefa) > 2:
            resultado = salvar_tarefa(tarefa)
            resposta = f"📅 {resultado}"
            print(f"   📅 Tarefa salva: '{tarefa}'")
        else:
            resposta = "Me fala qual tarefa você quer agendar. Ex: 'Raiden, agenda comprar pão'"
            print(f"   ⚠️ Tarefa vazia. Texto original: '{texto}' | Texto limpo: '{tarefa}'")
        
        audio_bytes = gerar_fala(resposta)
        anotar_no_caderno("Lucas", texto_usuario)
        anotar_no_caderno("Raiden", resposta)
        return {"texto": resposta, "audio": audio_bytes, "expressao": None}
    
    # ====== DETECÇÃO DIRETA DO GRANDE SÁBIO ======
    if any(p in texto for p in ["grande sábio", "grande sabio", "sábio", "sabio"]):
        print("   🎯 Grande Sábio detectado!")
        threading.Thread(target=executar_pesquisa_profunda, args=(texto,), daemon=True).start()
        
        from modulos.grande_sabio import extrair_tema_limpo
        tema_limpo = extrair_tema_limpo(texto)
        resposta = f"🫡 Grande Sábio acionado! Vou pesquisar sobre {tema_limpo} em múltiplas fontes e gerar um relatório completo. O arquivo estará em Documentos/Raiden/Grande_Sabio/ em alguns minutos. Pode continuar me usando normalmente enquanto isso."
        
        anotar_no_caderno("Lucas", texto_usuario)
        anotar_no_caderno("Raiden", resposta)
        return {"texto": resposta, "audio": gerar_fala(resposta), "expressao": None}
    
    # ====== PROCESSAMENTO NORMAL COM IA (TOOL CALLING) ======
    async with httpx.AsyncClient() as client:
        
        # Visão computacional
        gatilhos_visao = ["olha minha tela", "o que eu tô fazendo", "vê isso", "minha tela", "olha isso", "tá vendo"]
        if any(g in texto for g in gatilhos_visao):
            print("   👁️ Capturando tela...")
            descricao = await capturar_tela(client, MODELO_VISAO, chamar_ollama)
            texto = f"{texto}. [Contexto visual: {descricao}]"
            print(f"   👁️ Tela: {descricao[:100]}...")

        # Humor dinâmico
        delta = 10 if "testando" in texto else 5 if len(texto.split()) < 3 else 2
        if "por favor" in texto or "obrigado" in texto or "obrigada" in texto:
            delta = -5
        irritacao = ajustar_humor(delta)

        # Roteamento MoE
        intencao = await router_intencao(client, texto)
        modelo = MODELO_CODIGO if intencao == "codigo" else MODELO_CONVERSA
        print(f"   🧠 Roteador: {intencao} → {modelo}")

        historico = ler_ultimas_conversas(4)
        
        prompt = f"""[INSTRUÇÃO DE FERRAMENTAS]
Se o Lucas pedir ações na internet, inclua UM destes JSONs na última linha:
- Google: {{"tool": "search_google", "args": {{"query": "termo"}}}}
- YouTube: {{"tool": "search_youtube", "args": {{"query": "termo"}}}}
- Vídeo específico: {{"tool": "play_youtube_video", "args": {{"query": "termo", "index": 1}}}}
- Artigo/Dossiê: {{"tool": "grande_sabio", "args": {{"query": "tema"}}}}
- Resumir vídeo: {{"tool": "devorar_video", "args": {{"query": "termo"}}}}

[CONTEXTO]
{BIO}
Irritação: {irritacao}/100
Histórico:
{historico}

Lucas: {texto}
Raiden:"""

        timeout = 120 if modelo == MODELO_CODIGO else 60
        resposta = await chamar_ollama(client, modelo, prompt, timeout_segundos=timeout)

    if not resposta or "[Erro" in resposta:
        resposta = "Desculpe, não consegui processar isso."

    # Intercepta e executa ferramentas (JSON)
    tool_regex = r'\{[^{}]*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^{}]*\}\s*\}'
    match_tool = re.search(tool_regex, resposta)
    
    if match_tool:
        try:
            tool_call = json.loads(match_tool.group(0))
            tool_name = tool_call.get("tool")
            args = tool_call.get("args", {})
            query = args.get("query", "")
            
            print(f"   🔧 Ferramenta: {tool_name} - {query}")
            
            if tool_name == "search_google" and query:
                threading.Thread(target=executar_pesquisa_google, args=(query,), daemon=True).start()
            elif tool_name == "search_youtube" and query:
                threading.Thread(target=executar_pesquisa_youtube, args=(query,), daemon=True).start()
            elif tool_name == "play_youtube_video" and query:
                index = args.get("index", 1)
                threading.Thread(target=executar_video_youtube_direto, args=(query, index), daemon=True).start()
            elif tool_name == "grande_sabio" and query:
                threading.Thread(target=executar_pesquisa_profunda, args=(query,), daemon=True).start()
            elif tool_name == "devorar_video" and query:
                threading.Thread(target=devorar_video_youtube, args=(query,), daemon=True).start()
            
            resposta = re.sub(tool_regex, '', resposta).replace("```json", "").replace("```", "").strip()
            if not resposta:
                resposta = f"Beleza! Já estou executando a pesquisa sobre {query}."
                
        except Exception as e:
            print(f"   ⚠️ Erro na ferramenta: {e}")

    resposta = limpar_emojis(resposta)
    anotar_no_caderno("Lucas", texto_usuario)
    anotar_no_caderno("Raiden", resposta)

    return {"texto": resposta, "audio": gerar_fala(resposta), "expressao": None}

# ========= ROTAS DA API =========
class MensagemRequest(BaseModel):
    text: Optional[str] = None
    texto: Optional[str] = None
    audio_base64: Optional[str] = None
    imagem_base64: Optional[str] = None 

@app.post("/chat")
async def chat_endpoint(req: MensagemRequest):
    texto = req.texto or req.text

    # ========= NOVO: PROCESSAMENTO DE IMAGEM =========
    if req.imagem_base64:
        from modulos.cerebro import MODELO_VISAO
        async with httpx.AsyncClient() as client:
            prompt_visao = texto or "Descreva detalhadamente o que você vê nesta imagem. Se for um print de código, explique o código. Se for uma foto, descreva a cena."
            resposta = await chamar_ollama(
                client,
                MODELO_VISAO,
                prompt_visao,
                timeout_segundos=120,
                imagens=[req.imagem_base64]
            )
            resposta = limpar_emojis(resposta)
            audio_bytes = gerar_fala(resposta)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else None
            return {
                "texto": resposta,
                "audio_base64": audio_b64,
                "expressao": None
            }
    # =================================================

    if not texto and req.audio_base64:
        raise HTTPException(status_code=400, detail="Envie pelo menos o texto.")
    resultado = await processar_mensagem(texto)
    audio_b64 = base64.b64encode(resultado["audio"]).decode("utf-8") if resultado["audio"] else None
    return {
        "texto": resultado["texto"],
        "audio_base64": audio_b64,
        "expressao": resultado["expressao"]
    }

# ========= NOVAS ROTAS DO DASHBOARD =========

@app.get("/api/dossies")
async def listar_dossies():
    """Lista pastas e arquivos do Grande Sábio"""
    pasta_base = os.path.expanduser("~/Documentos/Raiden/Grande_Sabio")
    if not os.path.exists(pasta_base):
        return {"dossies": []}
    
    dossies = []
    for pasta in sorted(os.listdir(pasta_base)):
        caminho_pasta = os.path.join(pasta_base, pasta)
        if os.path.isdir(caminho_pasta):
            relatorio = os.path.join(caminho_pasta, "RELATORIO.md")
            if os.path.exists(relatorio):
                with open(relatorio, "r", encoding="utf-8") as f:
                    conteudo = f.read()
                dossies.append({
                    "nome": pasta.replace("_", " "),
                    "pasta": pasta,
                    "conteudo": conteudo,
                    "tamanho": len(conteudo)
                })
    
    return {"dossies": sorted(dossies, key=lambda x: x["nome"])}

@app.get("/api/dossie/{pasta}")
async def ler_dossie(pasta: str):
    """Lê um dossiê específico"""
    caminho = os.path.expanduser(f"~/Documentos/Raiden/Grande_Sabio/{pasta}/RELATORIO.md")
    if not os.path.exists(caminho):
        raise HTTPException(status_code=404, detail="Dossiê não encontrado")
    
    with open(caminho, "r", encoding="utf-8") as f:
        conteudo = f.read()
    
    return {"nome": pasta.replace("_", " "), "conteudo": conteudo}

@app.get("/api/anotacoes")
async def listar_anotacoes():
    """Lista anotações do histórico"""
    from modulos.memoria import get_db
    
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT autor, mensagem, timestamp FROM historico WHERE autor = 'Lucas' ORDER BY id DESC LIMIT 50")
        linhas = c.fetchall()
    
    anotacoes = []
    for linha in linhas:
        anotacoes.append({
            "autor": linha["autor"],
            "mensagem": linha["mensagem"],
            "data": time.strftime("%d/%m/%Y %H:%M", time.localtime(linha["timestamp"]))
        })
    
    return {"anotacoes": anotacoes}

@app.get("/api/agenda")
async def listar_agenda():
    """Lista tarefas da agenda"""
    from modulos.memoria import get_db
    
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT tarefa, data FROM agenda ORDER BY id DESC")
        tarefas = c.fetchall()
    
    return {"tarefas": [{"tarefa": t["tarefa"], "data": t["data"]} for t in tarefas]}

# ========= ESCUTA CONTÍNUA (COMANDOS COMPLETOS + TIMER) =========
ultima_resposta = None
lock_resposta = threading.Lock()

def processar_e_responder(comando: str):
    global ultima_resposta
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        resultado = loop.run_until_complete(processar_mensagem(comando))
        loop.close()
        
        with lock_resposta:
            ultima_resposta = {
                "texto": resultado["texto"],
                "audio_base64": base64.b64encode(resultado["audio"]).decode("utf-8") if resultado.get("audio") else None
            }
    except Exception as e:
        print(f"   ⚠️ Erro ao processar: {e}")

def escutar_microfone():
    global ultima_resposta
    INATIVO, ATIVO, ANOTANDO = "inativo", "ativo", "anotando"
    estado = INATIVO
    ultimo_tempo_fala = 0
    TEMPO_SILENCIO = 15

    r = sr.Recognizer()
    r.pause_threshold = 1.5
    r.dynamic_energy_threshold = True
    r.energy_threshold = 300

    with sr.Microphone(sample_rate=16000) as source:
        r.adjust_for_ambient_noise(source, duration=0.5)
        print(f"🎤 Raiden pronta. Estado: {estado.upper()} (Timer: {TEMPO_SILENCIO}s)")
        print(f"   💡 Diga 'Raiden' + comando. Ex: 'Raiden, aumenta o volume em 30%'")

        while True:
            try:
                audio = r.listen(source, timeout=1, phrase_time_limit=8)
                duracao = len(audio.frame_data) / audio.sample_rate
                if duracao < 0.3:
                    continue

                texto = r.recognize_google(audio, language="pt-BR").lower()
                
                # Correções fonéticas
                correcoes = {
                    "happy": "rap",
                    "heavy": "rap",
                    "rep": "rap",
                    "raiden": "raiden",
                    "rayden": "raiden",
                    "sabio": "sábio",
                    "sabia": "sábio"
                }
                for errado, certo in correcoes.items():
                    texto = re.sub(rf'\b{errado}\b', certo, texto)

                print(f"   🎙️ Ouvido: {texto}")
                agora = time.time()

                # ============================================
                # COMANDOS DE MÍDIA (FAST-PATH + TIMER RESET)
                # ============================================
                
                # 🔇 MODO MUDO (Volume 0%)
                if any(g in texto for g in ["mudo", "mutar", "silenciar", "silêncio", "silencio", "modo mudo", "sem som", "desligar som", "tirar o som", "volume zero", "volume 0"]):
                    print(f"   🔇 Ativando modo mudo (0%)")
                    threading.Thread(target=ajustar_volume, args=(0, "set"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # 🔊 SAIR DO MUDO / REATIVAR SOM
                elif any(g in texto for g in ["sair do mudo", "reativar som", "voltar som", "ligar som", "ativar som", "com som", "desmutar", "volume normal", "volta som"]):
                    print(f"   🔊 Reativando som (10%)")
                    threading.Thread(target=ajustar_volume, args=(10, "set"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # 🔊 MUTE/UNMUTE NATIVO (alterna)
                elif any(g in texto for g in ["alternar mudo", "toggle mute", "mute"]):
                    print(f"   🔇 Alternando mute")
                    threading.Thread(target=ajustar_volume, args=(0, "mute"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Volume: Aumentar
                if any(g in texto for g in ["aumentar volume", "aumenta o volume", "aumenta volume", "sobe o volume", "subir volume", "mais volume", "volume mais alto", "volume para cima"]):
                    porcentagem = extrair_numero_do_texto(texto, padrao=10)
                    print(f"   🔊 Aumentando volume em {porcentagem}%")
                    threading.Thread(target=ajustar_volume, args=(porcentagem, "up"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Volume: Diminuir
                elif any(g in texto for g in ["diminuir volume", "abaixar volume", "abaixa o volume", "baixar volume", "desce o volume", "menos volume", "volume mais baixo", "volume para baixo", "reduzir volume"]):
                    porcentagem = extrair_numero_do_texto(texto, padrao=10)
                    print(f"   🔉 Diminuindo volume em {porcentagem}%")
                    threading.Thread(target=ajustar_volume, args=(porcentagem, "down"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Volume: Definir valor exato
                elif any(g in texto for g in ["volume em", "definir volume", "colocar volume", "deixar volume", "volume para", "volume no", "definir volume para"]):
                    porcentagem = extrair_numero_do_texto(texto, padrao=50, permitir_zero=True)
                    print(f"   🎚️ Definindo volume para {porcentagem}%")
                    threading.Thread(target=ajustar_volume, args=(porcentagem, "set"), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Mídia: Play/Pause
                elif any(g in texto for g in ["pausar", "despausar", "parar a música", "pausar a música", "continuar a música", "continuar música", "tocar música", "play", "pause"]):
                    threading.Thread(target=controlar_midia, args=("play-pause",), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Mídia: Próxima faixa
                elif any(g in texto for g in ["próxima música", "próxima faixa", "pular música", "pular faixa", "passar a música", "avançar música", "próximo", "skip"]):
                    threading.Thread(target=controlar_midia, args=("next",), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Mídia: Faixa anterior
                elif any(g in texto for g in ["música anterior", "faixa anterior", "voltar música", "voltar a música", "música passada", "anterior", "retroceder"]):
                    threading.Thread(target=controlar_midia, args=("previous",), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue
                
                # Mídia: Parar completamente
                elif any(g in texto for g in ["parar tudo", "parar player", "encerrar música"]):
                    threading.Thread(target=controlar_midia, args=("stop",), daemon=True).start()
                    ultimo_tempo_fala = agora
                    continue

                # ============================================
                # MODO DITADO (ANOTAÇÃO)
                # ============================================
                if estado == ANOTANDO:
                    gatilhos_fechar = [
                        "parar de anotar", "concluir anotação", "encerrar anotação",
                        "parar ditado", "finalizar anotação", "fechar anotação",
                        "sair do modo ditado", "parar de escrever"
                    ]
                    encerrou = False
                    texto_para_digitar = texto

                    for g in gatilhos_fechar:
                        if g in texto:
                            encerrou = True
                            texto_para_digitar = texto.split(g)[0].strip()
                            break
                    
                    if texto_para_digitar:
                        threading.Thread(target=digitar_texto, args=(texto_para_digitar,), daemon=True).start()
                            
                    if encerrou:
                        estado = INATIVO
                        ultimo_tempo_fala = agora
                        print("   📝 Anotação concluída. Voltando ao estado INATIVO.")
                        
                        audio_bytes = gerar_fala("Pronto, anotação encerrada e salva.")
                        with lock_resposta:
                            ultima_resposta = {
                                "texto": "Anotação encerrada e salva.",
                                "audio_base64": base64.b64encode(audio_bytes).decode("utf-8")
                            }
                    else:
                        ultimo_tempo_fala = agora
                    continue

                # ============================================
                # ESTADOS INATIVO E ATIVO
                # ============================================
                if estado == INATIVO:
                    if "raiden" in texto:
                        comando_puro = texto.replace("raiden", "").strip()
                        
                        # Modo anotação/ditado
                        gatilhos_anotar = [
                            "anotar", "abrir anotação", "iniciar anotação",
                            "começar anotação", "modo ditado", "abrir bloco de notas",
                            "abrir o editor", "começar a anotar", "iniciar ditado"
                        ]
                        if any(comando_puro.startswith(g) for g in gatilhos_anotar) or any(g in comando_puro for g in gatilhos_anotar):
                            print("   📝 Abrindo editor para ditado...")
                            
                            if abrir_editor():
                                time.sleep(2)
                                estado = ANOTANDO
                                ultimo_tempo_fala = agora
                                print("   📝 Estado: ANOTANDO (ditado ativo)")
                                
                                audio_bytes = gerar_fala("Editor aberto. Pode começar a ditar. Quando terminar, diga: parar de anotar.")
                                with lock_resposta:
                                    ultima_resposta = {
                                        "texto": "Editor aberto. Pode começar a ditar.",
                                        "audio_base64": base64.b64encode(audio_bytes).decode("utf-8")
                                    }
                                continue
                            else:
                                print("   ⚠️ Nenhum editor de texto encontrado.")
                                audio_bytes = gerar_fala("Nenhum editor de texto encontrado. Instale o gedit ou gnome-text-editor.")
                                with lock_resposta:
                                    ultima_resposta = {
                                        "texto": "Nenhum editor de texto encontrado.",
                                        "audio_base64": base64.b64encode(audio_bytes).decode("utf-8")
                                    }
                                continue
                        
                        # Comando normal
                        if comando_puro:
                            print(f"   ✅ Acordando... Comando: {comando_puro}")
                            threading.Thread(target=processar_e_responder, args=(comando_puro,), daemon=True).start()
                        
                        estado = ATIVO
                        ultimo_tempo_fala = agora
                        print(f"   🟢 Estado: ATIVO (timer: {TEMPO_SILENCIO}s)")
                else:
                    # Estado ATIVO - verifica timeout
                    if agora - ultimo_tempo_fala > TEMPO_SILENCIO:
                        estado = INATIVO
                        print(f"   🔴 Estado: INATIVO ({TEMPO_SILENCIO}s de silêncio)")
                        continue
                    
                    if texto.strip() and len(texto.split()) >= 1:
                        print(f"   ✅ Processando conversa: {texto}")
                        threading.Thread(target=processar_e_responder, args=(texto,), daemon=True).start()
                        ultimo_tempo_fala = agora
                        print(f"   ⏱️ Timer resetado ({TEMPO_SILENCIO}s)")

            except sr.WaitTimeoutError:
                if estado == ATIVO and time.time() - ultimo_tempo_fala > TEMPO_SILENCIO:
                    estado = INATIVO
                    print(f"   🔴 Estado: INATIVO (timeout)")
            except sr.UnknownValueError:
                if estado == ATIVO and time.time() - ultimo_tempo_fala > TEMPO_SILENCIO:
                    estado = INATIVO
                    print(f"   🔴 Estado: INATIVO (silêncio)")
            except Exception as e:
                print(f"   ⚠️ Erro no microfone: {e}")
                time.sleep(0.5)

@app.on_event("startup")
async def iniciar_escuta():
    threading.Thread(target=escutar_microfone, daemon=True).start()

@app.get("/proximo_audio")
async def proximo_audio():
    global ultima_resposta
    with lock_resposta:
        if ultima_resposta:
            resp = ultima_resposta
            ultima_resposta = None
            return resp
    return {"texto": None, "audio_base64": None}

# ========= PONTO DE ENTRADA =========
if __name__ == "__main__":
    print("\n" + "="*60)
    print("   🎌 RAIDEN - Assistente Virtual Linux")
    print("="*60)
    print(f"   🧠 MoE: Llama3.2 → Roteador")
    print(f"   🎭 MoE: RaidenNova → Conversa")
    print(f"   🔧 MoE: Qwen2.5-7B → Código/Ferramentas")
    print(f"   👁️ MoE: MiniCPM-V → Visão")
    print(f"   🔊 Volume: 0-100% dinâmico + Mudo")
    print(f"   🔇 Mudo: 'mudo', 'silenciar', 'volume zero'")
    print(f"   🔊 Reativar: 'voltar som', 'reativar som'")
    print(f"   ⏯️ Mídia: Play/Pause/Next/Previous/Stop")
    print(f"   📅 Agenda: 'agenda [tarefa]', 'quais são minhas tarefas?'")
    print(f"   ⏱️ Timer: Resetado em todos os comandos")
    print(f"   📊 Dashboard: /api/dossies | /api/anotacoes | /api/agenda")
    print("="*60 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)