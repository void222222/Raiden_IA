// ==========================================================================
// IMPORTAÇÕES GLOBAIS (O que é carregado para o site INTEIRO)
// ==========================================================================
// Importa o arquivo de CSS global. É aqui que ficam as cores, margens e 
// estilos básicos que valem pra todas as páginas do seu projeto.
import "@/styles/globals.css";

// Importa as "tipagens" do Next.js (isso é coisa do TypeScript, serve só pra 
// o seu VS Code saber o que significa o 'Component' e o 'pageProps' ali embaixo).
import type { AppProps } from "next/app";

// Importa um pacote de ícones prontos (da biblioteca Charcoal UI, que veio no ChatVRM).
// Como está importado bem aqui na raiz, os ícones funcionam em qualquer tela do projeto.
import "@charcoal-ui/icons";

// ==========================================================================
// COMPONENTE PRINCIPAL (O Empacotador)
// ==========================================================================
// O Next.js usa essa função 'App' como uma "capa" que envolve tudo.
// Se você quisesse colocar um menu fixo que aparece em TODAS as páginas do site, 
// você colocaria o código dele aqui.
export default function App({ Component, pageProps }: AppProps) {
  
  // O 'Component' é literalmente a página que você está acessando no momento 
  // (por exemplo, o seu gigantesco index.tsx que montamos antes).
  // O 'pageProps' são as propriedades/dados que essa página precisa pra rodar.
  // 
  // Resumo da ópera: Ele pega a sua página atual, veste com o CSS global e renderiza!
  return <Component {...pageProps} />;
}