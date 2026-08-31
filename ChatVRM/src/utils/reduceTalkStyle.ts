// ==========================================================================
// DIAGNÓSTICO: 100% LIXO (RESQUÍCIO DA API KOEMOTION)
// ==========================================================================
// Isso servia para limitar as emoções da voz na API velha que o projeto
// usava (Koeiromap). Como a nossa Raiden usa Edge-TTS direto do Python, 
// isso não serve pra absolutamente nada.
// ==========================================================================

type ReducedTalkStyle = "talk" | "happy" | "sad";

export const reduceTalkStyle = (talkStyle: string): ReducedTalkStyle => {
  if (talkStyle == "talk" || talkStyle == "happy" || talkStyle == "sad") {
    return talkStyle;
  }

  return "talk";
};