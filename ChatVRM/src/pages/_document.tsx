// ==========================================================================
// IMPORTAÇÕES (Trazendo as ferramentas essenciais do Next.js)
// ==========================================================================
// buildUrl: Uma função utilitária do próprio projeto (ChatVRM) para montar o link certinho das imagens
import { buildUrl } from "@/utils/buildUrl";
// Componentes base do Next.js que montam a estrutura bruta do HTML (a "carcaça" do site)
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    // Aqui ele define a linguagem padrão da página. O original está "ja" (Japonês).
    // (Nota: estou deixando como está pra gente não alterar a lógica antes da live, 
    // mas num futuro Clean Code, a gente pode trocar pra "pt-BR" sem medo).
    <Html lang="ja">
      
      {/* ==========================================================================
          CABEÇALHO INVISÍVEL (<Head>)
          Tudo que fica aqui carrega antes da tela aparecer pro usuário.
          ========================================================================== */}
      <Head>
        {/* Essas 3 linhas de 'link' estão conectando com os servidores do Google 
            para baixar e aplicar as fontes de texto "M PLUS 2" e "Montserrat" no projeto */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+2&family=Montserrat&display=swap"
          rel="stylesheet"
        />
      </Head>
      
      {/* ==========================================================================
          CORPO DA PÁGINA (<body>)
          Aqui é a tela de fato. Repara que ele já joga aquela imagem "fundoi_verde.webp" 
          (provavelmente o seu fundo de chroma key) direto no fundo geral da página!
          ========================================================================== */}
      <body style={{ backgroundImage: `url(${buildUrl("/fundoi_verde.webp")})` }}>
        
        {/* <Main /> é o "buraco" onde o Next.js vai injetar todo o conteúdo 
            das suas outras páginas (tipo o seu index.tsx, a Raiden, os botões, etc) */}
        <Main />
        
        {/* <NextScript /> injeta os códigos JavaScript pesados do Next.js 
            pra fazer o site ser interativo. Sem isso, os botões não clicam! */}
        <NextScript />
      </body>
    </Html>
  );
}