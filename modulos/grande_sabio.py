"""Módulo Grande Sábio - Pipeline de Deep Research de 5 fases (MoE)"""
import os
import re
import time
import urllib.parse
import httpx
from bs4 import BeautifulSoup

# Importa configurações centralizadas
from modulos.cerebro import OLLAMA_URL, MODELO_CODIGO, chamar_ollama_sync

# Verifica se Playwright está disponível (sem poluir o namespace global)
PLAYWRIGHT_DISPONIVEL = False
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_DISPONIVEL = True
except ImportError:
    pass

def extrair_tema_limpo(texto_bruto: str) -> str:
    """Extrai o tema real removendo palavras de comando"""
    palavras_remover = [
        "raiden", "ative", "use", "usar", "o", "a", "os", "as", "um", "uma",
        "grande", "sábio", "sabio", "e", "me", "passe", "por",
        "favor", "gentileza", "quero", "preciso", "de", "da", "do",
        "para", "com", "sem", "mais", "menos", "pesquisar", "pesquise",
        "sobre", "acerca", "referente", "receita", "artigo", "relatório",
        "relatorio", "faça", "faz", "fazer", "criar", "cria", "monte",
        "montar", "elaborar", "escrever", "escreva", "preparar", "prepara"
    ]
    
    for palavra in palavras_remover:
        texto_bruto = re.sub(rf'\b{palavra}\b', '', texto_bruto, flags=re.IGNORECASE)
    
    texto_limpo = re.sub(r'\s+', ' ', texto_bruto).strip()
    
    if not texto_limpo or len(texto_limpo) < 3:
        texto_limpo = "história do Linux"
    
    return texto_limpo

def _extrair_urls_da_busca(tema: str, num_links: int = 5) -> list:
    """Fase 2: Busca URLs no DuckDuckGo/Google"""
    urls = []
    
    if PLAYWRIGHT_DISPONIVEL:
        try:
            from playwright.sync_api import sync_playwright
            
            with sync_playwright() as p:
                browser = p.firefox.launch(headless=True)
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                )
                page = context.new_page()
                
                query = urllib.parse.quote(tema)
                busca_url = f"https://html.duckduckgo.com/html/?q={query}"
                page.goto(busca_url, timeout=30000)
                
                links_elementos = page.locator("a.result__url").all()
                
                for link in links_elementos[:num_links + 5]:
                    href = link.get_attribute("href")
                    if href:
                        if href.startswith("//"):
                            href = "https:" + href
                        if "uddg=" in href:
                            parsed = urllib.parse.urlparse(href)
                            params = urllib.parse.parse_qs(parsed.query)
                            if 'uddg' in params:
                                href = urllib.parse.unquote(params['uddg'][0])
                        if href.startswith("http") and len(urls) < num_links:
                            urls.append(href)
                
                browser.close()
                return list(dict.fromkeys(urls))
                
        except Exception as e:
            print(f"      ⚠️ Playwright falhou: {str(e)[:80]}")
    
    # Fallback: requests + BeautifulSoup
    try:
        import requests
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        query = urllib.parse.quote(tema)
        
        # Tenta Google primeiro
        try:
            url = f"https://www.google.com/search?q={query}&hl=pt-BR"
            response = requests.get(url, headers=headers, timeout=15)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            for a in soup.find_all('a'):
                href = a.get('href', '')
                if href.startswith('/url?q='):
                    real_url = href.split('/url?q=')[1].split('&')[0]
                    real_url = urllib.parse.unquote(real_url)
                    if real_url.startswith('http') and 'google.com' not in real_url:
                        if real_url not in urls:
                            urls.append(real_url)
        except:
            # Fallback DuckDuckGo
            url = f"https://html.duckduckgo.com/html/?q={query}"
            response = requests.get(url, headers=headers, timeout=15)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            for a in soup.find_all('a', class_='result__url'):
                href = a.get('href', '')
                if href:
                    if href.startswith("//"):
                        href = "https:" + href
                    if "uddg=" in href:
                        parsed = urllib.parse.urlparse(href)
                        params = urllib.parse.parse_qs(parsed.query)
                        if 'uddg' in params:
                            href = params['uddg'][0]
                    if href.startswith('http') and href not in urls:
                        urls.append(href)
        
        return list(dict.fromkeys(urls))[:num_links]
        
    except Exception as e:
        print(f"      ⚠️ Requests falhou: {str(e)[:80]}")
        return []

def _extrair_texto_site(url: str) -> str:
    """Fase 2: Visita um site e extrai texto limpo"""
    try:
        if PLAYWRIGHT_DISPONIVEL:
            from playwright.sync_api import sync_playwright
            
            with sync_playwright() as p:
                browser = p.firefox.launch(headless=True)
                page = browser.new_page()
                
                page.goto(url, timeout=20000, wait_until="domcontentloaded")
                page.wait_for_timeout(2000)
                
                js_extractor = """
                () => {
                    let textos = [];
                    document.querySelectorAll('p, li, h1, h2, h3, h4').forEach(el => {
                        let t = el.innerText.trim();
                        if (t.length > 20) textos.push(t);
                    });
                    return textos.join('\\n');
                }
                """
                texto = page.evaluate(js_extractor)
                browser.close()
                return texto[:8000] if texto else ""
        
        else:
            import requests
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            response = requests.get(url, headers=headers, timeout=15)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove elementos desnecessários
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            
            textos = []
            for tag in soup.find_all(['p', 'li', 'h1', 'h2', 'h3']):
                texto = tag.get_text().strip()
                if len(texto) > 20:
                    textos.append(texto)
            
            return '\n'.join(textos[:150])[:8000]
            
    except Exception:
        return ""

def executar_pesquisa_profunda(tema_bruto: str):
    """
    🧙‍♂️ VERDADEIRO GRANDE SÁBIO - PIPELINE DE 5 FASES
    Usa MODELO_CODIGO (Qwen2.5-7B) para todo o processamento lógico
    Roda em thread separada, NÃO BLOQUEIA a Raiden
    """
    
    # ============ FASE 0: PREPARAÇÃO ============
    tema = extrair_tema_limpo(tema_bruto)
    
    print(f"\n{'='*70}")
    print(f"   🧙‍♂️ GRANDE SÁBIO - MODO PESQUISA PROFUNDA")
    print(f"   📝 Tema: '{tema}'")
    print(f"   🧠 Modelo: {MODELO_CODIGO}")
    print(f"   ⏱️  Este processo pode levar de 5 a 15 minutos.")
    print(f"   💬 Enquanto isso, continue usando a Raiden normalmente.")
    print(f"{'='*70}\n")
    
    pasta_base = os.path.expanduser(f"~/Documentos/Raiden/Grande_Sabio/{tema.replace(' ', '_')[:30]}")
    os.makedirs(pasta_base, exist_ok=True)
    caminho_relatorio = os.path.join(pasta_base, "RELATORIO.md")
    
    # ============ FASE 1: PLANEJAMENTO (LLM) ============
    print("   📋 [1/5] Planejando a pesquisa...")
    
    prompt_plano = f"""Você é um pesquisador sênior. Crie um plano de pesquisa para o tema: "{tema}".

Gere EXATAMENTE 4 queries de busca otimizadas. Cada query deve abordar um aspecto diferente.
Responda APENAS com as queries, uma por linha, neste formato:
query1: [sua query]
query2: [sua query]
query3: [sua query]
query4: [sua query]
"""
    
    plano_resposta = chamar_ollama_sync(MODELO_CODIGO, prompt_plano, temperature=0.3, num_predict=512)
    
    queries = []
    for linha in plano_resposta.split('\n'):
        if ':' in linha and 'query' in linha.lower():
            query = linha.split(':', 1)[1].strip()
            if query and len(query) > 10:
                queries.append(query)
    
    if len(queries) < 2:
        queries = [
            f"{tema} definição e conceitos principais",
            f"{tema} história e origem",
            f"{tema} características e funcionalidades",
            f"{tema} curiosidades e fatos importantes"
        ]
    
    print(f"   ✅ Plano com {len(queries)} queries:")
    for i, q in enumerate(queries):
        print(f"      {i+1}. {q}")
    
    # ============ FASE 2: COLETA DE DADOS ============
    print(f"\n   🌐 [2/5] Coletando dados da web...")
    
    todas_fontes = []
    
    for idx, query in enumerate(queries):
        print(f"      🔍 Query {idx+1}/{len(queries)}: {query[:60]}...")
        
        urls = _extrair_urls_da_busca(query, num_links=3)
        print(f"         {len(urls)} sites encontrados")
        
        for url_idx, url in enumerate(urls):
            print(f"         📄 Site {url_idx+1}/{len(urls)}: {url[:50]}...")
            texto = _extrair_texto_site(url)
            
            if texto and len(texto) > 200:
                todas_fontes.append({
                    'url': url,
                    'texto': texto,
                    'query_origem': query
                })
                print(f"            ✅ {len(texto)} caracteres")
            else:
                print(f"            ⚠️ Conteúdo insuficiente")
            
            time.sleep(1.5)  # Gentileza com servidores
    
    print(f"\n   ✅ Coleta concluída: {len(todas_fontes)} fontes válidas")
    
    if not todas_fontes:
        print("   ❌ Nenhuma fonte encontrada. Abortando.")
        return
    
    # ============ FASE 3: ANÁLISE POR BLOCOS ============
    print(f"\n   🧠 [3/5] Analisando e sintetizando...")
    
    BLOCK_SIZE = 6000  # Caracteres por bloco (~1500 tokens)
    textos_consolidados = []
    buffer = ""
    
    for fonte in todas_fontes:
        trecho = f"\n--- FONTE: {fonte['url']} ---\n{fonte['texto']}\n"
        if len(buffer) + len(trecho) > BLOCK_SIZE:
            textos_consolidados.append(buffer)
            buffer = trecho
        else:
            buffer += trecho
    
    if buffer:
        textos_consolidados.append(buffer)
    
    print(f"      Dados divididos em {len(textos_consolidados)} blocos")
    
    resumos_blocos = []
    for idx, bloco in enumerate(textos_consolidados):
        print(f"      Bloco {idx+1}/{len(textos_consolidados)}...")
        
        prompt_resumo = f"""Analise o texto abaixo sobre "{tema}" e extraia APENAS fatos relevantes.

TEXTO:
{bloco[:6000]}

Liste os fatos em tópicos (-). Seja preciso com números, datas e nomes."""
        
        resumo = chamar_ollama_sync(MODELO_CODIGO, prompt_resumo, temperature=0.2, num_predict=1024)
        if resumo and "[Erro" not in resumo:
            resumos_blocos.append(resumo)
            print(f"         ✅ {len(resumo)} caracteres")
        time.sleep(0.5)
    
    # ============ FASE 4: SÍNTESE FINAL ============
    print(f"\n   📝 [4/5] Gerando relatório final...")
    
    dados_consolidados = "\n\n".join(resumos_blocos)
    
    prompt_final = f"""VOCÊ É O GRANDE SÁBIO. Produza um RELATÓRIO COMPLETO sobre: "{tema}"

[DADOS PESQUISADOS]
{dados_consolidados[:10000]}

[ESTRUTURA OBRIGATÓRIA]
# {tema.upper()} - Relatório de Pesquisa

## 📌 Resumo Executivo
(2-3 parágrafos)

## 📖 Desenvolvimento
(Sub-tópicos com ##)

## 🎯 Conclusão

## 📚 Fontes Consultadas
{chr(10).join([f'- {f["url"]}' for f in todas_fontes[:15]])}

[REGRAS CRÍTICAS]
1. NÃO ALUCINE: Use APENAS dados fornecidos
2. Temperatura 0.2 = precisão máxima
3. Mínimo 800 palavras
4. Markdown profissional
"""
    
    relatorio = chamar_ollama_sync(
        MODELO_CODIGO,
        prompt_final,
        temperature=0.2,
        num_predict=4096,
        timeout=600
    )
    
    # ============ FASE 5: EMPACOTAMENTO ============
    print(f"\n   💾 [5/5] Salvando...")
    
    if relatorio and "[Erro" not in relatorio:
        with open(caminho_relatorio, "w", encoding="utf-8") as f:
            f.write(f"# Relatório do Grande Sábio\n")
            f.write(f"**Tema:** {tema}\n")
            f.write(f"**Data:** {time.strftime('%d/%m/%Y %H:%M')}\n")
            f.write(f"**Fontes:** {len(todas_fontes)}\n")
            f.write(f"**Modelo:** {MODELO_CODIGO}\n\n")
            f.write("---\n\n")
            f.write(relatorio)
        
        # Arquivos auxiliares
        with open(os.path.join(pasta_base, "RESUMO.md"), "w") as f:
            f.write(relatorio[:2000])
        
        with open(os.path.join(pasta_base, "fontes_brutas.txt"), "w") as f:
            for fonte in todas_fontes:
                f.write(f"\n{'='*60}\nURL: {fonte['url']}\n{'='*60}\n{fonte['texto'][:3000]}\n")
        
        print(f"\n{'='*70}")
        print(f"   ✅ GRANDE SÁBIO CONCLUÍDO!")
        print(f"   📁 Pasta: {pasta_base}")
        print(f"   📄 Relatório: RELATORIO.md")
        print(f"   📊 {len(relatorio)} caracteres | {len(todas_fontes)} fontes")
        print(f"   🧠 Processado por: {MODELO_CODIGO}")
        print(f"{'='*70}\n")
    else:
        print(f"\n   ❌ Falha na geração. Dados brutos salvos em: {pasta_base}")