"""Módulo Cérebro - Comunicação com Ollama, roteamento e configuração centralizada de modelos (MoE)"""
import httpx

# ========= CONFIGURAÇÃO CENTRALIZADA =========
OLLAMA_URL = "http://localhost:11434/api/generate"

# ========= MIXTURE OF EXPERTS (MoE) =========
# Cada modelo tem uma especialidade. Esta é a ÚNICA fonte da verdade.
MODELO_ROTEADOR = "llama3.2:latest"      # Ultra-rápido, classifica intenção
MODELO_CONVERSA = "raiden_nova:latest"    # Avatar, interage com o usuário
MODELO_CODIGO = "qwen2.5-coder:7b"       # Cérebro lógico, JSON, ferramentas, Grande Sábio
MODELO_VISAO = "llava:7b"           # ✅ instalado e funcionando

async def chamar_ollama(client: httpx.AsyncClient, modelo: str, prompt: str, system: str = None, timeout_segundos: int = 60, imagens: list = None) -> str:
    """Chamada assíncrona ao Ollama (para uso no event loop principal)"""
    payload = {
        "model": modelo,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": 2048,
            "num_thread": 8
        }
    }
    if system:
        payload["system"] = system
    if imagens:
        payload["images"] = imagens
    try:
        resp = await client.post(OLLAMA_URL, json=payload, timeout=float(timeout_segundos))
        resp.raise_for_status()
        return resp.json()["response"]
    except Exception as e:
        print(f"Erro no Ollama ({modelo}): {e}")
        return "[Erro na IA]"

async def router_intencao(client: httpx.AsyncClient, mensagem: str) -> str:
    """Classifica a intenção usando o modelo roteador (rápido)"""
    prompt = f"""
Classifique a mensagem abaixo em apenas UMA palavra: "codigo" ou "conversa".
Regras:
- "codigo": programação, script, debug, Python, Linux, terminal, git, código, algoritmo, ferramentas, pesquisas técnicas.
- "conversa": bate-papo casual, perguntas gerais, entretenimento.
Mensagem: {mensagem}
Classificação:"""
    try:
        resposta = await chamar_ollama(client, MODELO_ROTEADOR, prompt, timeout_segundos=90)
        resposta = resposta.strip().lower()
        return "codigo" if "codigo" in resposta else "conversa"
    except:
        return "conversa"

def chamar_ollama_sync(modelo: str, prompt: str, system: str = None, timeout: int = 300, temperature: float = 0.7, num_predict: int = 2048) -> str:
    """Versão síncrona do Ollama para uso em threads (NÃO BLOQUEIA o event loop)"""
    payload = {
        "model": modelo,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": num_predict,
            "num_thread": 8,
            "temperature": temperature
        }
    }
    if system:
        payload["system"] = system
    
    try:
        resp = httpx.post(OLLAMA_URL, json=payload, timeout=float(timeout))
        resp.raise_for_status()
        return resp.json()["response"]
    except Exception as e:
        print(f"   ❌ Erro Ollama sync ({modelo}): {e}")
        return "[Erro na IA]"