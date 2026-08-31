import { useState, useRef, KeyboardEvent } from "react";

// Aqui definimos o "contrato" de comunicação desse componente.
// Ele avisa o React: "Para me usar, você precisa me passar uma função onSend, 
// me dizer se a IA está pensando (isLoading), e opcionalmente um texto de placeholder".
// Toda a comunicação com a sua API FastAPI do Python acontece LÁ FORA, através do 'onSend'.
interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, isLoading, placeholder = "Digite sua mensagem..." }: ChatInputProps) {
  // useState: É a "memória curta" do componente. 
  // 'input' guarda o que você está digitando agora. 'setInput' é a função que atualiza isso.
  const [input, setInput] = useState("");
  
  // useRef: É como um gancho que nos permite tocar no elemento HTML diretamente.
  // Vamos usar isso para focar a caixinha de texto automaticamente depois que você enviar uma mensagem.
  const inputRef = useRef<HTMLInputElement>(null);

  // Função disparada quando você clica no botão de enviar ou aperta Enter.
  const handleSend = () => {
    // Só envia se o texto não for só espaço em branco (input.trim()) 
    // E se a Raiden NÃO estiver carregando a resposta anterior (!isLoading).
    if (input.trim() && !isLoading) {
      // Chama a função que veio do componente pai (essa sim vai falar com o Python)
      onSend(input.trim());
      // Limpa a caixinha de texto depois de enviar
      setInput("");
      // Força o cursor a voltar a piscar na caixinha de texto, para você não ter que clicar nela de novo
      inputRef.current?.focus();
    }
  };

  // Função que fica "escutando" o seu teclado enquanto você digita.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Se a tecla for "Enter" E você NÃO estiver segurando o "Shift" (pra pular linha)...
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Impede que o formulário dê refresh na página (comportamento padrão do navegador)
      handleSend();       // Dispara o envio
    }
  };

  // Daqui para baixo é apenas Front-end puro (Visual e CSS misturado no React)
  return (
    <div style={{
      display: "flex", // Coloca a caixinha e o botão lado a lado
      gap: 8,
      padding: "12px 16px",
      background: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(10px)", // Dá aquele efeito de vidro embaçado estiloso
      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
      alignItems: "center", // Alinha tudo no centro verticalmente
    }}>
      <input
        ref={inputRef} // Conecta o nosso 'gancho' do useRef aqui
        type="text"
        value={input} // O valor amarrado à nossa memória 'useState'
        // Toda vez que você digita uma letra, atualiza a memória com o texto novo
        onChange={(e) => setInput(e.target.value)} 
        onKeyDown={handleKeyDown} // Escuta o Enter
        placeholder={placeholder}
        // Se a Raiden estiver pensando (isLoading), bloqueia a caixinha pra você não bugar a fila
        disabled={isLoading} 
        style={{
          flex: 1, // Faz a caixinha de texto esticar e ocupar todo o espaço que sobrar
          padding: "12px 16px",
          borderRadius: 24,
          border: "2px solid rgba(79, 70, 229, 0.5)",
          background: "rgba(255, 255, 255, 0.1)",
          color: "white",
          fontSize: 14,
          outline: "none",
          transition: "border-color 0.2s",
        }}
        // Frescuras visuais: muda a cor da borda quando você clica na caixinha (Focus) e quando sai (Blur)
        onFocus={(e) => e.target.style.borderColor = "#4f46e5"}
        onBlur={(e) => e.target.style.borderColor = "rgba(79, 70, 229, 0.5)"}
      />
      <button
        onClick={handleSend} // Dispara o envio ao clicar
        // Desativa o botão se a Raiden estiver pensando ou se a caixinha estiver vazia
        disabled={isLoading || !input.trim()} 
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          // Se estiver carregando, o botão fica apagado. Se não, fica roxo neon.
          background: isLoading ? "rgba(79, 70, 229, 0.3)" : "#4f46e5",
          border: "none",
          color: "white",
          fontSize: 18,
          // Muda o cursor do mouse pra um símbolo de "proibido" se estiver carregando
          cursor: isLoading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          // Se a caixa estiver vazia, o botão fica meio transparente (opacity 0.5)
          opacity: input.trim() ? 1 : 0.5,
        }}
      >
        {/* Renderização condicional: Mostra uma ampulheta se estiver carregando, ou a setinha se estiver livre */}
        {isLoading ? "⏳" : "➤"}
      </button>
    </div>
  );
}