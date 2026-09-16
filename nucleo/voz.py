"""
🔊 VOZ — RAIDEN

Geração de áudio a partir de texto via Edge TTS.
"""

import base64

from io import BytesIO
from typing import Optional

import edge_tts

from nucleo.logger import logger


VOZ_PADRAO = "pt-BR-FranciscaNeural"
VELOCIDADE_PADRAO = "+10%"


async def gerar_voz_base64(
    texto: str
) -> Optional[str]:

    if not texto:
        return None

    try:
        communicate = edge_tts.Communicate(
            texto,
            voice=VOZ_PADRAO,
            rate=VELOCIDADE_PADRAO
        )

        audio_buffer = BytesIO()

        async for chunk in communicate.stream():

            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])

        return base64.b64encode(
            audio_buffer.getvalue()
        ).decode("utf-8")

    except Exception as e:

        logger.error(f"🔇 Erro na geração de voz: {e}")

        return None