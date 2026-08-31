"""
👁️ VISÃO NATIVA (Módulo de Print de Tela)
Usa a ferramenta nativa e silenciosa do COSMIC para capturar a tela 
no Wayland e envia para o modelo de Visão do Ollama.
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import base64
import glob
import logging
import os
import subprocess
from typing import Optional

# ==========================================
# 2. BIBLIOTECAS EXTERNAS (Pip)
# ==========================================
import httpx

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
logger = logging.getLogger("Visao")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODELO_VISAO = "llava-phi3" 
PASTA_TMP_VISAO = "/tmp/raiden_visao"
TIMEOUT_OLLAMA = 60.0  # Visão exige mais tempo para pensar do que texto

# ==========================================
# FUNÇÕES DE CAPTURA E ANÁLISE
# ==========================================
def tirar_print_nativo() -> Optional[str]:
    """
    Tira um print silencioso usando as flags do cosmic-screenshot.
    Bypassa o bloqueio do Wayland usando a ferramenta nativa da DE.
    Retorna a imagem convertida em Base64 ou None se falhar.
    """
    # Garante que a pasta temporária existe
    os.makedirs(PASTA_TMP_VISAO, exist_ok=True)
    
    # 1. Limpa qualquer print velho da pasta para não confundir a IA
    try:
        for f in glob.glob(f"{PASTA_TMP_VISAO}/*"):
            os.remove(f)
    except Exception as e:
        logger.warning(f"Aviso ao tentar limpar a pasta temporária: {e}")
        
    caminho_imagem = None

    # 2. O COMANDO MÁGICO DO COSMIC: Mudo, sem notificação, tela cheia!
    try:
        subprocess.run(
            [
                "cosmic-screenshot", 
                "--interactive=false", 
                "--notify=false", 
                "-s", PASTA_TMP_VISAO
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5.0
        )
        
        # 3. Pega o arquivo gerado automaticamente na pasta temporária
        arquivos = glob.glob(f"{PASTA_TMP_VISAO}/*")
        if arquivos:
            caminho_imagem = arquivos[0]
            logger.info("📸 Print tirado em tela cheia com sucesso (cosmic-screenshot)!")
            
    except Exception as e:
        logger.error(f"❌ Falha ao acionar o cosmic-screenshot: {e}")
        return None

    if not caminho_imagem:
        logger.error("❌ O comando rodou, mas a imagem não foi encontrada na pasta temporária.")
        return None
        
    # 4. Transforma em Base64 e destrói as provas pra não lotar seu HD
    try:
        with open(caminho_imagem, "rb") as arquivo_img:
            img_b64 = base64.b64encode(arquivo_img.read()).decode("utf-8")
        
        # Apaga o arquivo original na mesma hora
        os.remove(caminho_imagem)
        return img_b64
        
    except Exception as e:
        logger.error(f"❌ Erro ao converter a imagem do print para Base64: {e}")
        return None

async def ver_a_tela(prompt: str = "Descreva de forma curta e direta o que tem nesta tela de computador ou jogo.") -> str:
    """
    Orquestra todo o processo: Tira o print e manda pro Ollama analisar com o modelo de Visão.
    Retorna a string com a descrição do que está acontecendo na tela.
    """
    img_b64 = tirar_print_nativo()
    
    # Se a função de cima devolveu None, a gente já corta o mal pela raiz aqui
    if not img_b64:
        return "Não consegui enxergar a tela, mermão. O sistema bloqueou a visão."
        
    payload = {
        "model": MODELO_VISAO,
        "prompt": prompt,
        "images": [img_b64],
        "stream": False,
        "options": {"num_predict": 100}
    }
    
    try:
        logger.info("🧠 Enviando imagem para o córtex visual (Ollama)...")
        # AsyncClient fecha a conexão sozinho usando o 'async with'
        async with httpx.AsyncClient() as client:
            resp = await client.post(OLLAMA_URL, json=payload, timeout=TIMEOUT_OLLAMA)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
            
    except httpx.TimeoutException:
        logger.error("❌ O Ollama demorou demais para analisar a imagem (Timeout).")
        return "Pô, a imagem tava tão complexa que meu cérebro travou pensando. Tenta de novo."
    except Exception as e:
        logger.error(f"❌ Erro sinistro no modelo de visão: {e}")
        return "Meu olho deu tela azul, não consegui processar a imagem."