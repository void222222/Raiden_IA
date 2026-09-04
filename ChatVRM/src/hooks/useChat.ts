import { useState, useCallback, useRef, useEffect } from "react";

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

  const socketRef = useRef<WebSocket | null>(null);

  // Converte http:// para ws:// e https:// para wss://
  const wsUrl = apiUrl
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:")
    .replace(/\/$/, "");

  // ==========================================
  // 🔌 CONEXÃO WEBSOCKET
  // ==========================================

  useEffect(() => {
    const socket = new WebSocket(`${wsUrl}/ws`);

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("🔌 WebSocket da Raiden conectado.");
    };

    socket.onmessage = (event) => {
      try {
        const data: ChatResponse = JSON.parse(event.data);

        const resposta =
          data.texto?.trim() ||
          "Desculpe, não consegui responder.";

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: resposta,
          },
        ]);

        if (data.audio_base64 && playWithLipSync) {
          playWithLipSync(data.audio_base64);
        }
      } catch (error) {
        console.error(
          "❌ Erro ao interpretar resposta do WebSocket:",
          error
        );
      } finally {
        setIsLoading(false);
      }
    };

    socket.onerror = (error) => {
      console.error(
        "❌ Erro no WebSocket da Raiden:",
        error
      );

      setIsLoading(false);
    };

    socket.onclose = () => {
      console.log(
        "🔌 WebSocket da Raiden desconectado."
      );

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setIsLoading(false);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [wsUrl, playWithLipSync]);

  // ==========================================
  // 💬 ADICIONAR MENSAGEM MANUALMENTE
  // ==========================================

  const addMessage = useCallback(
    (role: "user" | "assistant", content: string) => {
      setMessages((prev) => [
        ...prev,
        {
          role,
          content,
        },
      ]);
    },
    []
  );

  // ==========================================
  // 📤 ENVIAR MENSAGEM
  // ==========================================

  const sendMessage = useCallback(
    async (text: string) => {
      const texto = text.trim();

      if (!texto) return;

      const socket = socketRef.current;

      // Verifica se o WebSocket está conectado.
      if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Não consegui conectar com a Raiden.",
          },
        ]);

        console.error(
          "❌ WebSocket não está conectado."
        );

        return;
      }

      // Mostra a mensagem do usuário imediatamente.
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: texto,
        },
      ]);

      setIsLoading(true);

      try {
        socket.send(texto);
      } catch (error) {
        console.error(
          "❌ Erro ao enviar mensagem pelo WebSocket:",
          error
        );

        setIsLoading(false);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Erro ao enviar mensagem para a Raiden.",
          },
        ]);
      }
    },
    []
  );

  // ==========================================
  // 🧹 LIMPAR HISTÓRICO VISUAL
  // ==========================================

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