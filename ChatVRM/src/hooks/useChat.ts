import { useState, useCallback } from "react";

// Aqui definimos o formato padrão de uma mensagem.
// Toda mensagem no chat tem que ter um 'role' (quem falou: "user" ou "assistant") 
// e o 'content' (o texto da fala).
interface Message {
  role: "user" | "assistant";
  content: string;
}

// Esse é o nosso Hook Customizado. Ele é o "motorista" do bate-papo.
// Ele precisa saber a URL da sua API (apiUrl) e, opcionalmente, 
// a função que faz a VTuber mexer a boca (playWithLipSync).
export function useChat(apiUrl: string, playWithLipSync?: (base64: string) => void) {
  
  // 'messages': Guarda o histórico da conversa inteira para mostrar na tela.
  const [messages, setMessages] = useState<Message[]>([]);
  
  // 'isLoading': Um aviso (verdadeiro/falso) para o botão de enviar saber se a Raiden 
  // ainda tá pensando. Assim você não manda duas mensagens sem querer e trava tudo.
  const [isLoading, setIsLoading] = useState(false);

  // Função simples para adicionar uma mensagem no histórico forçadamente 
  // (usamos isso quando você envia um arquivo/imagem pro chat).
  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    setMessages(prev => [...prev, { role, content }]);
  }, []);

  // ========================================================================
  // O CORAÇÃO DO SISTEMA: A Função que fala com o Python
  // ========================================================================
  const sendMessage = useCallback(async (text: string) => {
    // Se você mandou um texto vazio, ele ignora e não faz nada.
    if (!text.trim()) return;

    // 1. Pega o que você digitou e já joga na tela (histórico)
    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    
    // 2. Avisa o sistema: "A Raiden tá pensando, bloqueia o botão de enviar!"
    setIsLoading(true);

    try {
      // 3. O carteiro: Bate na porta da sua API Python (rota /chat) levando o seu texto
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: text }), // Envia o texto em formato JSON
      });
      
      // 4. Recebe a encomenda de volta do Python (O pacote com o Texto e o Áudio)
      const data = await res.json();
      const resposta = data.texto || "Desculpe, não consegui responder.";
      
      // 5. Joga a resposta da Raiden na tela do chat
      setMessages(prev => [...prev, { role: "assistant", content: resposta }]);
      
      // 6. O Pulo do Gato (Lip-Sync): Se o Python mandou um áudio em Base64, 
      // chama a função que toca o som e faz a boca do modelo 3D mexer no mesmo ritmo.
      if (data.audio_base64 && playWithLipSync) {
        playWithLipSync(data.audio_base64);
      }
    } catch (e) {
      // Se a sua API Python estiver desligada ou der pau, ele avisa aqui pra não travar a tela
      console.error("Erro ao enviar mensagem:", e);
      setMessages(prev => [...prev, { role: "assistant", content: "Erro ao comunicar com a Raiden." }]);
    } finally {
      // 7. Independente de ter dado certo ou erro, avisa que a Raiden parou de pensar 
      // e libera o botão de enviar de novo.
      setIsLoading(false);
    }
  }, [apiUrl, playWithLipSync]);

  // Função do botão de lixeira: Apaga o histórico da tela
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Devolve as ferramentas prontas para o index.tsx poder usar na interface
  return { messages, isLoading, sendMessage, clearMessages, addMessage };
}