import { useEffect, useRef } from "react";

// Aqui nós definimos o "molde" de uma mensagem individual.
// O React precisa saber que cada mensagem tem um 'role' (quem falou: você ou a IA) 
// e um 'content' (o texto da mensagem em si).
interface Message {
  role: "user" | "assistant";
  content: string;
}

// Aqui é o "contrato" do componente. Para esse arquivo funcionar, o componente pai 
// (que gerencia a API) precisa entregar para ele duas coisas:
// 1. A lista completa de mensagens (o histórico).
// 2. Um aviso se a Raiden está raciocinando naquele momento (isLoading).
interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
}

export default function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  // useRef: É um "gancho" que usamos para marcar um elemento invisível lá no final da tela.
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a última mensagem:
  // Esse useEffect fica de olho na lista de 'messages'. Toda vez que uma mensagem nova chega,
  // ele pega aquele gancho invisível (bottomRef) e rola a tela suavemente para baixo.
  // Isso evita que você tenha que ficar rolando o mouse para ler as respostas novas.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{
      flex: 1,
      overflow: "auto", // Cria a barra de rolagem caso o chat fique muito grande
      padding: "16px",
      display: "flex",
      flexDirection: "column", // Coloca uma mensagem embaixo da outra
      gap: 12, // Dá um espacinho de respiro entre os balões de fala
    }}>
      
      {/* RENDERIZAÇÃO CONDICIONAL 1: TELA VAZIA */}
      {/* Se o histórico de mensagens estiver zerado (messages.length === 0), 
          ele mostra essa mensagem bonitinha no meio da tela. */}
      {messages.length === 0 && (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontSize: 14,
          textAlign: "center",
          padding: 40,
        }}>
          💬 Digite uma mensagem para falar com a Raiden
        </div>
      )}

      {/* RENDERIZAÇÃO DO HISTÓRICO DE MENSAGENS */}
      {/* O 'map' pega a lista de mensagens e cria um balãozinho visual para cada uma delas */}
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            // Se for você ("user"), joga o balão pra direita (flex-end). Se for a Raiden, joga pra esquerda (flex-start).
            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "80%", // O balão não ocupa a tela toda para ficar parecido com WhatsApp
            padding: "12px 16px",
            borderRadius: 16,
            // Truque de design: deixa a "ponta" do balão quadrada indicando quem falou
            borderBottomRightRadius: msg.role === "user" ? 4 : 16,
            borderBottomLeftRadius: msg.role === "assistant" ? 4 : 16,
            // Se for você, o balão fica com um degradê roxo. Se for ela, fica um vidro escuro transparente.
            background: msg.role === "user"
              ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
              : "rgba(255, 255, 255, 0.1)",
            color: "white",
            fontSize: 14,
            lineHeight: 1.5,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {/* Cabeçalho pequenininho em cima do balão dizendo quem está falando */}
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>
            {msg.role === "user" ? "👤 Você" : "🎌 Raiden"}
          </div>
          {/* O texto da mensagem em si */}
          {msg.content}
        </div>
      ))}

      {/* RENDERIZAÇÃO CONDICIONAL 2: INDICADOR DE DIGITAÇÃO */}
      {/* Se o Python avisar que a IA está pensando (isLoading = true), 
          mostra esse balão fantasma pra você saber que ela não travou. */}
      {isLoading && (
        <div style={{
          alignSelf: "flex-start",
          padding: "12px 16px",
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.1)",
          color: "#94a3b8",
          fontSize: 14,
        }}>
          🎌 Raiden está pensando...
        </div>
      )}

      {/* O NOSSO GANCHO INVISÍVEL */}
      {/* Essa div vazia fica sempre no final do chat. É pra cá que o useEffect rola a tela! */}
      <div ref={bottomRef} />
    </div>
  );
}