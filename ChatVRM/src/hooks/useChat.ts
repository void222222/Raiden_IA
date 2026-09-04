
import { useState, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  texto: string | null;
  audio_base64: string | null;
  expressao?: string;
}

export function useChat(
  apiUrl: string,
  playWithLipSync?: (base64: string) => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Adiciona uma mensagem manualmente ao histórico.
  const addMessage = useCallback(
    (role: "user" | "assistant", content: string) => {
      setMessages((prev) => [...prev, { role, content }]);
    },
    []
  );

  // Envia uma mensagem para a Raiden.
  const sendMessage = useCallback(
    async (text: string) => {
      const texto = text.trim();

      // Ignora mensagens vazias.
      if (!texto) return;

      // Coloca a mensagem do usuário imediatamente no chat.
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: texto,
        },
      ]);

      setIsLoading(true);

      try {
        const res = await fetch(`${apiUrl}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            texto,
          }),
        });

        // Trata erros HTTP da API.
        if (!res.ok) {
          let detalhe = `Erro HTTP ${res.status}`;

          try {
            const erro = await res.json();

            if (erro.detail) {
              detalhe = erro.detail;
            }
          } catch {
            // Mantém a mensagem padrão caso a resposta não seja JSON.
          }

          throw new Error(detalhe);
        }

        const data: ChatResponse = await res.json();

        const resposta =
          data.texto?.trim() ||
          "Desculpe, não consegui responder.";

        // Mostra a resposta da Raiden.
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: resposta,
          },
        ]);

        // Toca o áudio e ativa o LipSync.
        if (data.audio_base64 && playWithLipSync) {
          playWithLipSync(data.audio_base64);
        }
      } catch (error) {
        console.error("Erro ao enviar mensagem:", error);

        const mensagemErro =
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao comunicar com a Raiden.";

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Erro ao comunicar com a Raiden: ${mensagemErro}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [apiUrl, playWithLipSync]
  );

  // Limpa o histórico visual do chat.
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    addMessage,
  };
}
