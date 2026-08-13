"""Módulo de Áudio - Voz e microfone"""
import asyncio
import re
from io import BytesIO
from gtts import gTTS

def limpar_emojis(texto: str) -> str:
    texto = re.sub(r'[😀-🙏🌀-🗿🚀-🛿★☆♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼]', '', texto)
    texto = texto.replace('*', '').replace('_', '').replace('~', '').replace('`', '')
    return texto.strip()

def gerar_fala(texto: str) -> bytes:
    """Gera áudio com edge_tts (neural) e fallback para gTTS"""
    texto = limpar_emojis(texto)
    if not texto:
        return b""
    
    try:
        import edge_tts
        async def _gerar():
            communicate = edge_tts.Communicate(texto, voice="pt-BR-FranciscaNeural", rate="+10%")
            mp3_data = BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    mp3_data.write(chunk["data"])
            return mp3_data.getvalue()
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        resultado = loop.run_until_complete(_gerar())
        loop.close()
        return resultado
    except Exception as e:
        try:
            mp3_fp = BytesIO()
            tts = gTTS(text=texto, lang='pt', slow=False)
            tts.write_to_fp(mp3_fp)
            mp3_fp.seek(0)
            return mp3_fp.read()
        except Exception as e2:
            print(f"   ⚠️ Erro ao gerar áudio: {e2}")
            return b""