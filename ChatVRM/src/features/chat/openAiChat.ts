import { Message } from "../messages/messages";

/**
 * Obtém a resposta da Raiden chamando o proxy /api/chat.
 * Agora a reprodução do áudio é feita diretamente no componente (com lip‑sync),
 * então esta função apenas retorna os dados.
 */
export async function getChatResponse(messages: Message[], apiKey: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Erro na API: ${response.status}`);
  }

  const data = await response.json();

  // Retorna o texto e o áudio (base64) para o componente decidir como tocar
  return {
    message: data.message || "Hmm, fiquei sem palavras.",
    audio: data.audio || null,
  };
}

// Mantida por compatibilidade, mas não usamos streaming no momento
export async function getChatResponseStream(messages: Message[], apiKey: string) {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}