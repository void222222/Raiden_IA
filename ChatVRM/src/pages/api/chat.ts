// ==========================================================================
// IMPORTAÇÕES DO NEXT.JS (O lado Servidor do seu Front-end)
// ==========================================================================
import type { NextApiRequest, NextApiResponse } from "next";

// ==========================================================================
// DEFINIÇÃO DE TIPO (A "Caixa" da Resposta)
// ==========================================================================
// Aqui a gente avisa pro TypeScript qual é o formato exato dos dados 
// que esse arquivo vai devolver para a tela do ChatVRM.
type Data = {
  message: string;  // O texto que a Raiden falou
  audio?: string;   // Opcional (?): O Base64 do áudio da voz dela
};

// ==========================================================================
// FUNÇÃO PRINCIPAL (O Carteiro)
// ==========================================================================
// Toda vez que você digita no chat do site e aperta "Enviar", o site 
// chama essa função 'handler'. O 'req' é o que entrou, o 'res' é o que sai.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    // 1. EXTRAÇÃO DA MENSAGEM
    // Pega o histórico inteiro de mensagens que veio do site
    const messages = req.body.messages;
    
    // Pega só a última mensagem (a que você acabou de enviar).
    // O '|| ""' garante que se vier vazio, ele não quebra o código.
    const ultimaMensagem = messages[messages.length - 1]?.content || "";

    // 2. CONEXÃO COM O CÉREBRO (API PYTHON)
    // Aqui o carteiro bate na porta da sua API FastAPI que deixamos rodando na porta 8000
    const response = await fetch("http://localhost:8000/chat", {
      method: "POST", // Mandando dados
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ultimaMensagem }), // Manda o texto no formato que o Python espera
    });

    // 3. TRATAMENTO DE ERRO DE CONEXÃO
    // Se o Python estiver desligado ou der erro 500 lá, ele avisa aqui e aborta
    if (!response.ok) {
      throw new Error(`Erro na API Python: ${response.status}`);
    }

    // 4. LENDO A RESPOSTA DA RAIDEN
    // Transforma a resposta que veio do Python de volta em um objeto Javascript
    const data = await response.json();

    // Caça o texto da resposta. Como no Python nós retornamos "texto", ele vai pegar ali no data.texto
    const respostaDaRaiden = data.texto || data.text || data.resposta || "Erro: campo de resposta não encontrado.";

    // Pega o Base64 da voz que o Edge TTS gerou lá no Python
    const audioBase64 = data.audio_base64 || null;

    // 5. DEVOLVENDO TUDO PARA A TELA 3D
    // O res.status(200) significa "Deu tudo certo (OK)". 
    // Ele empacota o texto e a voz e manda de volta pro VrmViewer tocar.
    res.status(200).json({
      message: respostaDaRaiden,
      audio: audioBase64,  
    });

  } catch (error) {
    // Se qualquer coisa der errado nesse caminho, ele cai aqui no catch, 
    // avisa no terminal (console.error) e devolve um erro 500 (Erro Interno do Servidor)
    console.error("Erro no chat.ts:", error);
    res.status(500).json({ message: "Erro ao tentar comunicar com o localhost:8000" });
  }
}