"""
🧠 MEMÓRIA E PESQUISA WEB (Módulo de Conhecimento)
Busca respostas na internet (DuckDuckGo), filtra as fontes dependendo do assunto
e salva no banco de dados SQLite com prazo de validade (para não usar dados velhos).
"""

# ==========================================
# 1. IMPORTS PADRÃO DO PYTHON
# ==========================================
import logging
import os
import sqlite3
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# ==========================================
# 2. BIBLIOTECAS EXTERNAS (Pip)
# ==========================================
import httpx
from bs4 import BeautifulSoup

# ==========================================
# CONFIGURAÇÕES E CONSTANTES
# ==========================================
logger = logging.getLogger("WebMemoria")

# Caminhos do Banco de Dados
PASTA_DB = Path.home() / "Documentos" / "Raiden" / "db"
ARQUIVO_DB = PASTA_DB / "memoria_raiden.db"

# Tempo para ela "esquecer" algo e ser obrigada a pesquisar na web de novo
DIAS_VALIDADE = 7  

# ==========================================
# GESTÃO DO BANCO DE DADOS (SQLite)
# ==========================================
def iniciar_banco() -> None:
    """
    Cria a pasta e a tabela do banco de dados caso não existam.
    Inclui a coluna de data para o sistema de validade (Memory Expiry).
    """
    PASTA_DB.mkdir(parents=True, exist_ok=True)
    
    try:
        with sqlite3.connect(ARQUIVO_DB) as conn:
            c = conn.cursor()
            c.execute('''
                CREATE TABLE IF NOT EXISTS memoria_dinamica (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    termo TEXT UNIQUE NOT NULL,
                    conteudo TEXT NOT NULL,
                    data_salvamento TIMESTAMP NOT NULL
                )
            ''')
            conn.commit()
            logger.info("🗄️ Banco de dados da Raiden carregado com sucesso.")
    except Exception as e:
        logger.error(f"❌ Erro fatal ao iniciar o banco de dados: {e}")

def salvar_na_memoria(termo: str, conteudo: str) -> None:
    """
    Salva uma nova informação aprendida na web, carimbando a hora exata.
    Se o termo já existir, ele atualiza (INSERT OR REPLACE).
    """
    try:
        with sqlite3.connect(ARQUIVO_DB) as conn:
            c = conn.cursor()
            data_atual = datetime.now().isoformat()
            c.execute(
                "INSERT OR REPLACE INTO memoria_dinamica (termo, conteudo, data_salvamento) VALUES (?, ?, ?)", 
                (termo, conteudo, data_atual)
            )
            conn.commit()
    except Exception as e:
        logger.error(f"❌ Erro ao tentar escrever no cérebro (SQLite): {e}")

def buscar_na_memoria(termo: str) -> Optional[str]:
    """
    Procura no banco de dados. 
    Lógica chave: Se a memória for mais velha que 'DIAS_VALIDADE', 
    ele apaga e finge que não sabe, forçando uma pesquisa nova.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB) as conn:
            c = conn.cursor()
            # Busca termos parecidos (LIKE)
            c.execute("SELECT conteudo, data_salvamento FROM memoria_dinamica WHERE termo LIKE ?", (f"%{termo}%",))
            resultado = c.fetchone()
            
            if resultado:
                conteudo, data_str = resultado
                data_salvamento = datetime.fromisoformat(data_str)
                
                # Checa se a memória passou da data de validade
                if datetime.now() - data_salvamento > timedelta(days=DIAS_VALIDADE):
                    logger.info(f"🗑️ Memória sobre '{termo}' expirou (> {DIAS_VALIDADE} dias). Apagando para atualizar.")
                    c.execute("DELETE FROM memoria_dinamica WHERE termo = ?", (termo,))
                    conn.commit()
                    return None
                    
                return conteudo
                
    except Exception as e:
        logger.error(f"❌ Erro ao vasculhar as memórias antigas: {e}")
        
    return None

# ==========================================
# MOTOR DE PESQUISA NA WEB
# ==========================================
def otimizar_busca(termo: str) -> str:
    """
    Filtro de QI Alto: Analisa o contexto da sua pergunta e 
    força o buscador a ir nos sites que realmente importam.
    """
    termo_lower = termo.lower()
    
    # Contexto 1: Games (Força busca nas Wikis oficiais)
    jogos_keywords = ["minecraft", "terraria", "roblox", "jogo", "game", "craftar", "fazer espada", "picareta", "bancada", "boss"]
    if any(k in termo_lower for k in jogos_keywords):
        logger.info("🎮 Assunto Gamer detectado! Limitando pesquisa a sites de Wiki...")
        return f"{termo} wiki OR fandom"
        
    # Contexto 2: Política/Mundo real (Força sites de notícias confiáveis)
    noticias_keywords = ["notícia", "noticia", "presidente", "hoje", "brasil", "governo", "aconteceu", "ministro"]
    if any(k in termo_lower for k in noticias_keywords):
        logger.info("📰 Assunto Sério detectado! Direcionando para portais de notícia...")
        return f"{termo} site:g1.globo.com"
        
    # Se não cair em nenhum filtro, joga a pesquisa crua
    return termo

async def pesquisar_na_web(termo: str) -> Optional[str]:
    """
    Bate no DuckDuckGo de forma oculta, aplica o filtro de otimização e
    raspa os 10 primeiros resultados para a IA ler de uma vez só.
    """
    termo_otimizado = otimizar_busca(termo)
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(termo_otimizado)}"
    
    # Finge ser um navegador do Windows para o DuckDuckGo não bloquear
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=15.0)
            
            if resp.status_code != 200:
                logger.error(f"DuckDuckGo recusou a conexão (Status {resp.status_code})")
                return None
            
            # Sopa de HTML: Achando os resumos das pesquisas
            soup = BeautifulSoup(resp.text, 'html.parser')
            resultados = soup.find_all('a', class_='result__snippet')
            
            if resultados:
                # Junta até 10 resultados para a Raiden ter contexto sobrando
                textos = [f"Fonte {i+1}: {res.text.strip()}" for i, res in enumerate(resultados[:10])]
                return "\n---\n".join(textos)
                
    except httpx.TimeoutException:
        logger.error("❌ A pesquisa demorou muito e deu Timeout.")
    except Exception as e:
        logger.error(f"❌ Erro sinistro no Web Scraper: {e}")
        
    return None

async def consultar_conhecimento(termo: str) -> Optional[str]:
    """
    O Orquestrador do Cérebro:
    1º Tenta lembrar (SQLite). Se lembrar e não tiver vencido, usa.
    2º Se não lembrar, vai pra Web (DuckDuckGo).
    3º Se achar na Web, salva pra não ter que pesquisar de novo na próxima vez.
    """
    lembranca = buscar_na_memoria(termo)
    
    if lembranca:
        logger.info(f"🧠 Lembrei direto do meu HD (No prazo de validade): '{termo}'")
        return f"[MEMÓRIA LOCAL] {lembranca}"
    
    logger.info(f"🌐 Informação não encontrada/Vencida. Pesquisando na Web por: '{termo}'...")
    info_web = await pesquisar_na_web(termo)
    
    if info_web:
        salvar_na_memoria(termo, info_web)
        logger.info(f"💾 Conhecimento baixado e salvo! Validade renovada para {DIAS_VALIDADE} dias.")
        return f"[WEB] {info_web}"
    
    return None