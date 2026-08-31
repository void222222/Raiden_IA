// Esse é um componente funcional do React. 
// Ele exige apenas uma coisa para funcionar: receber uma 'message' (o texto que a Raiden falou) do componente pai.
export const AssistantText = ({ message }: { message: string }) => {
  return (
    // 'absolute bottom-0 left-0 w-full': Isso aqui "prega" a caixa de texto lá no rodapé da sua tela.
    // 'mb-104' dá uma margem (um empurrãozinho) para não colar totalmente no chão do monitor.
    <div className="absolute bottom-0 left-0 mb-104  w-full">
      
      {/* Centraliza a caixa na tela e define uma largura máxima (max-w-4xl) para não ficar esticadona num monitor Ultrawide */}
      <div className="mx-auto max-w-4xl w-full p-16">
        
        {/* A caixa branca com bordas arredondadas (rounded-8) onde o texto vai morar */}
        <div className="bg-white rounded-8">
          
          {/* O Cabeçalho da caixa. É aquela tarja em cima onde fica escrito "CHARACTER" (ou o nome dela) */}
          <div className="px-24 py-8 bg-secondary rounded-t-8 text-white font-bold tracking-wider">
            CHARACTER
          </div>
          
          {/* A área principal onde a frase da Raiden vai aparecer */}
          <div className="px-24 py-16">
            
            {/* 'line-clamp-4': É uma trava de segurança visual. Se a Raiden falar um texto gigantesco, 
                isso impede que a caixa cresça infinitamente. Ela corta o texto na 4ª linha. */}
            <div className="line-clamp-4 text-secondary typography-16 font-bold">
              
              {/* O PULO DO GATO: A Faxina com Regex!
                  A função .replace(/\[([a-zA-Z]*?)\]/g, "") procura qualquer coisa que esteja escrita 
                  entre colchetes (ex: [PESQUISAR] ou [FELIZ]) e SUBSTITUI por NADA ("").
                  Por que isso é útil? Se o seu Python mandar uma instrução misturada no texto, 
                  o sistema entende a instrução, mas apaga da legenda pra não ficar feio na live! */}
              {message.replace(/\[([a-zA-Z]*?)\]/g, "")}
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};