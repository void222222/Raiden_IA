"""Módulo Web - Pesquisas rápidas, YouTube e Devorador de Vídeos"""
import urllib.parse
import urllib.request
import re
import httpx
import os
from youtube_transcript_api import YouTubeTranscriptApi

# Importa configurações centralizadas
from modulos.cerebro import OLLAMA_URL, MODELO_CODIGO

def executar_pesquisa_google(termo: str):
    """Abre pesquisa no navegador padrão"""
    try:
        import webbrowser
        webbrowser.open_new_tab(f"https://www.google.com/search?q={urllib.parse.quote(termo)}")
        print(f"   🌐 Pesquisa Google: {termo}")
    except Exception as e:
        print(f"   ⚠️ Erro ao abrir pesquisa: {e}")

def executar_pesquisa_youtube(termo: str):
    """Abre pesquisa no YouTube"""
    try:
        import webbrowser
        webbrowser.open_new_tab(f"https://www.youtube.com/results?search_query={urllib.parse.quote(termo)}")
        print(f"   🎬 YouTube: {termo}")
    except Exception as e:
        print(f"   ⚠️ Erro ao abrir YouTube: {e}")

def executar_video_youtube_direto(termo: str, index: int = 1):
    """Abre vídeo específico do YouTube"""
    try:
        import webbrowser
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(termo)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        video_ids = re.findall(r"watch\?v=(\S{11})", html)
        unique_ids = list(dict.fromkeys(video_ids))
        
        if unique_ids and len(unique_ids) >= index:
            video_url = f"https://www.youtube.com/watch?v={unique_ids[index-1]}"
            webbrowser.open_new_tab(video_url)
            print(f"   🎬 Vídeo aberto: {termo}")
    except Exception as e:
        print(f"   ⚠️ Erro ao abrir vídeo: {e}")

def devorar_video_youtube(tema: str):
    """Extrai legendas de vídeos e resume usando o modelo de código"""
    print(f"\n   🐍 DEVORADOR: Caçando vídeo sobre '{tema}'...")
    pasta = os.path.expanduser("~/Documentos/Raiden/Devorados")
    os.makedirs(pasta, exist_ok=True)
    caminho = os.path.join(pasta, f"Resumo_{tema.replace(' ', '_')[:30]}.md")

    try:
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(tema)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        video_ids = re.findall(r"watch\?v=(\S{11})", html)
        
        if not video_ids:
            print("   ⚠️ Nenhum vídeo encontrado")
            return
            
        video_id = video_ids[0]
        print(f"   📹 Vídeo ID: {video_id}")
        
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['pt', 'en'])
            texto_legenda = " ".join([t['text'] for t in transcript])
        except:
            print("   ⚠️ Vídeo sem legendas")
            return

        texto_legenda = texto_legenda[:15000]
        
        prompt = f"""Resuma detalhadamente este vídeo baseado na transcrição:

TRANSCRIÇÃO:
{texto_legenda}

Formato Markdown com títulos e listas."""

        payload = {
            "model": MODELO_CODIGO,  # Usa o modelo centralizado
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": 2048}
        }
        
        resposta = httpx.post(OLLAMA_URL, json=payload, timeout=300.0).json()["response"]
        
        with open(caminho, "w", encoding="utf-8") as f:
            f.write(f"# Resumo: {tema}\n\n{resposta}")
        
        print(f"   ✅ DEVORADOR CONCLUÍDO! Salvo em: {caminho}\n")
        
    except Exception as e:
        print(f"   ⚠️ Erro no Devorador: {e}\n")