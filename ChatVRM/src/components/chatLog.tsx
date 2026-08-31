// Importa os 'ganchos' do React e a tipagem de Mensagem de outro arquivo
import { useEffect, useRef } from "react";
import { Message } from "@/features/messages/messages";

// O "contrato" desse componente. Ele precisa receber a lista do histórico de mensagens para funcionar.
// Repare que, diferente do arquivo anterior, ele nem pede o 'isLoading' (se ela está pensando).
type Props = {
  messages: Message[];
};

export const ChatLog = ({ messages }: Props) => {
  // Cria um gancho (referência) invisível que vamos atrelar à última mensagem da lista
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // EFEITO 1: Quando a página carregar pela primeira vez...
  useEffect(() => {
    // ...ele pega o gancho invisível e joga a barra de rolagem pra lá na hora, sem animação (behavior: "auto").
    chatScrollRef.current?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  }, []);

  // EFEITO 2: Toda vez que o array de 'messages' for atualizado (alguém falar algo)...
  useEffect(() => {
    // ...ele joga a barra de rolagem pra última mensagem, mas agora com uma animação suave (smooth).
    chatScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [messages]);

  // A renderização da tela usando classes do Tailwind CSS (em vez de 'style' direto como no outro)
  return (
    // 'absolute w-col-span-6 h-[100svh]': Fixa a janela do chat ocupando a altura toda da tela do navegador
    <div className="absolute w-col-span-6 max-w-full h-[100svh] pb-64">
      
      {/* Aqui é a área rolável do chat. 'overflow-y-auto' faz a barra de rolagem aparecer se encher. */}
      <div className="max-h-full px-16 pt-104 pb-64 overflow-y-auto scroll-hidden">
        
        {/* Pega a lista de mensagens inteira e começa a cuspir balões de fala na tela */}
        {messages.map((msg, i) => {
          return (
            // Se esta for a ÚLTIMA mensagem da lista (messages.length - 1 === i), 
            // a gente gruda aquele gancho invisível (chatScrollRef) nela para o auto-scroll funcionar.
            <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
              
              {/* Chama o componente 'Chat' (que está logo abaixo neste mesmo arquivo) para desenhar o balão */}
              <Chat role={msg.role} message={msg.content} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTE SECUNDÁRIO: O Balão de Chat Individual
// (Fica escondido aqui dentro mesmo, só o ChatLog usa ele)
// ============================================================================
const Chat = ({ role, message }: { role: string; message: string }) => {
  
  // Decide as cores baseado em quem tá falando. 
  // Se for a IA, o fundo do cabeçalho é a cor secundária (roxo/azul). Se for você, é a cor primária.
  const roleColor =
    role === "assistant" ? "bg-secondary text-white " : "bg-base text-primary";
  
  // Define a cor do texto do balão
  const roleText = role === "assistant" ? "text-secondary" : "text-primary";
  
  // Empurra o balão um pouco para a direita (pl-40) se for você, ou para a esquerda (pr-40) se for a IA.
  const offsetX = role === "user" ? "pl-40" : "pr-40";

  return (
    // A caixa principal do balão com tamanho máximo travado (max-w-sm)
    <div className={`mx-auto max-w-sm my-16 ${offsetX}`}>
      
      {/* O Cabeçalho do balão. Se a role for assistant, escreve "RAIDEN". Senão, "VOCÊ". */}
      <div
        className={`px-24 py-8 rounded-t-8 font-bold tracking-wider ${roleColor}`}
      >
        {role === "assistant" ? "RAIDEN" : "VOCÊ"}
      </div>
      
      {/* O Corpo do balão, onde a mensagem realmente fica escrita */}
      <div className="px-24 py-16 bg-white rounded-b-8">
        <div className={`typography-16 font-bold ${roleText}`}>{message}</div>
      </div>
    </div>
  );
};