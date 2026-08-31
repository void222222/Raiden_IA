// ==========================================================================
// DIAGNÓSTICO: ZUMBI ESTRUTURAL (NÃO FAZ NADA, MAS SUSTENTA OUTROS)
// ==========================================================================
// Ele literalmente pega o texto que você manda e devolve igual. 
// Motivo pra não deletar agora: Arquivos como o VrmViewer ainda importam 
// essa função. Se apagar o arquivo direto, o React dá tela branca. Deixa de enfeite.
// ==========================================================================

export function buildUrl(path: string): string {
  return path;
}