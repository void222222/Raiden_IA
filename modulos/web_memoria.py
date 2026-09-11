"""
🧠 MEMÓRIA E PESQUISA WEB (Módulo de Conhecimento)
Busca respostas na internet (DuckDuckGo), filtra as fontes dependendo do assunto
e salva no banco de dados SQLite com prazo de validade (para não usar dados velhos).

ATUALIZAÇÃO: Separação clara entre conhecimento web e memória pessoal
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
from typing import Optional, List, Dict

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
RAIZ_PROJETO = Path(__file__).resolve().parent.parent
PASTA_DB = RAIZ_PROJETO / "db"

ARQUIVO_DB_WEB = PASTA_DB / "memoria_web.db"
ARQUIVO_DB_PESSOAL = PASTA_DB / "memoria_pessoal.db"

# Tempo para ela "esquecer" algo e ser obrigada a pesquisar na web de novo
DIAS_VALIDADE = 7

# ==========================================
# 🗄️ GESTÃO DO BANCO DE DADOS WEB (SQLite)
# ==========================================

def iniciar_banco() -> None:
    """
    Cria a pasta e as tabelas dos bancos de dados.
    Separa claramente:
    - memoria_web.db: conhecimento pesquisado na internet
    - memoria_pessoal.db: memórias da Raiden sobre Lucas/projeto
    """
    PASTA_DB.mkdir(parents=True, exist_ok=True)
    
    try:
        # Banco de conhecimento web
        with sqlite3.connect(ARQUIVO_DB_WEB) as conn:
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
            logger.info("🗄️ Banco de conhecimento web carregado.")
            
        # Banco de memória pessoal
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            c.execute('''
                CREATE TABLE IF NOT EXISTS memoria_pessoal (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    categoria TEXT NOT NULL DEFAULT 'geral',
                    termo TEXT NOT NULL,
                    conteudo TEXT NOT NULL,
                    data_criacao TIMESTAMP NOT NULL,
                    data_atualizacao TIMESTAMP NOT NULL,
                    UNIQUE(categoria, termo)
                )
            ''')
            conn.commit()
            logger.info("🧠 Banco de memória pessoal carregado.")
            
    except Exception as e:
        logger.error(f"❌ Erro fatal ao iniciar os bancos de dados: {e}")


# ==========================================
# 🌐 CONHECIMENTO WEB (Com validade)
# ==========================================

def salvar_na_memoria(termo: str, conteudo: str) -> None:
    """
    Salva uma nova informação aprendida na web, carimbando a hora exata.
    Se o termo já existir, ele atualiza (INSERT OR REPLACE).
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_WEB) as conn:
            c = conn.cursor()
            data_atual = datetime.now().isoformat()
            c.execute(
                "INSERT OR REPLACE INTO memoria_dinamica (termo, conteudo, data_salvamento) VALUES (?, ?, ?)", 
                (termo, conteudo, data_atual)
            )
            conn.commit()
    except Exception as e:
        logger.error(f"❌ Erro ao tentar escrever no cérebro (SQLite Web): {e}")


def buscar_na_memoria(termo: str) -> Optional[str]:
    """
    Procura no banco de dados web.
    Lógica chave: Se a memória for mais velha que 'DIAS_VALIDADE', 
    ele apaga e finge que não sabe, forçando uma pesquisa nova.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_WEB) as conn:
            c = conn.cursor()
            # Busca termos parecidos (LIKE) e retorna o ID real
            c.execute(
                "SELECT id, termo, conteudo, data_salvamento FROM memoria_dinamica WHERE termo LIKE ?", 
                (f"%{termo}%",)
            )
            resultado = c.fetchone()
            
            if resultado:
                id_registro, termo_real, conteudo, data_str = resultado
                data_salvamento = datetime.fromisoformat(data_str)
                
                # Checa se a memória passou da data de validade
                if datetime.now() - data_salvamento > timedelta(days=DIAS_VALIDADE):
                    logger.info(f"🗑️ Conhecimento sobre '{termo_real}' expirou (> {DIAS_VALIDADE} dias). Apagando para atualizar.")
                    # Apaga usando o ID real do registro encontrado
                    c.execute("DELETE FROM memoria_dinamica WHERE id = ?", (id_registro,))
                    conn.commit()
                    return None
                    
                return conteudo
                
    except Exception as e:
        logger.error(f"❌ Erro ao vasculhar as memórias antigas: {e}")
        
    return None


# ==========================================
# 🧠 MEMÓRIA PESSOAL (Sem validade)
# ==========================================

def salvar_memoria_pessoal(
    termo: str,
    conteudo: str,
    categoria: str = "geral"
) -> bool:
    """
    Salva uma memória pessoal da Raiden.
    Memórias pessoais NÃO expiram.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            data_atual = datetime.now().isoformat()
            
            c.execute(
                """
                INSERT INTO memoria_pessoal 
                (categoria, termo, conteudo, data_criacao, data_atualizacao) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(categoria, termo) 
                DO UPDATE SET 
                    conteudo = excluded.conteudo,
                    data_atualizacao = excluded.data_atualizacao
                """,
                (categoria, termo, conteudo, data_atual, data_atual)
            )
            conn.commit()
            return True
            
    except Exception as e:
        logger.error(f"❌ Erro ao salvar memória pessoal: {e}")
        return False


def buscar_memoria_pessoal(
    termo: str,
    categoria: Optional[str] = None
) -> Optional[str]:
    """
    Busca uma memória pessoal específica.
    Retorna o conteúdo se encontrar.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            
            if categoria:
                c.execute(
                    """
                    SELECT conteudo FROM memoria_pessoal 
                    WHERE termo LIKE ? AND categoria = ?
                    ORDER BY data_atualizacao DESC LIMIT 1
                    """,
                    (f"%{termo}%", categoria)
                )
            else:
                c.execute(
                    """
                    SELECT conteudo FROM memoria_pessoal 
                    WHERE termo LIKE ?
                    ORDER BY data_atualizacao DESC LIMIT 1
                    """,
                    (f"%{termo}%",)
                )
            
            resultado = c.fetchone()
            
            if resultado:
                return resultado[0]
                
    except Exception as e:
        logger.error(f"❌ Erro ao buscar memória pessoal: {e}")
        
    return None


def listar_memorias_pessoais(
    categoria: Optional[str] = None
) -> List[Dict]:
    """
    Lista todas as memórias pessoais.
    Pode filtrar por categoria.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            
            if categoria:
                c.execute(
                    """
                    SELECT id, categoria, termo, conteudo, 
                           data_criacao, data_atualizacao
                    FROM memoria_pessoal 
                    WHERE categoria = ?
                    ORDER BY data_atualizacao DESC
                    """,
                    (categoria,)
                )
            else:
                c.execute(
                    """
                    SELECT id, categoria, termo, conteudo, 
                           data_criacao, data_atualizacao
                    FROM memoria_pessoal 
                    ORDER BY data_atualizacao DESC
                    """
                )
            
            resultados = c.fetchall()
            
            memorias = []
            for r in resultados:
                memorias.append({
                    "id": r[0],
                    "categoria": r[1],
                    "termo": r[2],
                    "conteudo": r[3],
                    "data_criacao": r[4],
                    "data_atualizacao": r[5]
                })
            
            return memorias
            
    except Exception as e:
        logger.error(f"❌ Erro ao listar memórias pessoais: {e}")
        return []


def apagar_memoria_pessoal(
    termo: str,
    categoria: Optional[str] = None
) -> bool:
    """
    Apaga uma memória pessoal específica.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            
            if categoria:
                c.execute(
                    "DELETE FROM memoria_pessoal WHERE termo = ? AND categoria = ?",
                    (termo, categoria)
                )
            else:
                c.execute(
                    "DELETE FROM memoria_pessoal WHERE termo = ?",
                    (termo,)
                )
            
            conn.commit()
            return c.rowcount > 0
            
    except Exception as e:
        logger.error(f"❌ Erro ao apagar memória pessoal: {e}")
        return False


def listar_categorias_memorias() -> List[str]:
    """
    Lista todas as categorias de memórias pessoais.
    """
    try:
        with sqlite3.connect(ARQUIVO_DB_PESSOAL) as conn:
            c = conn.cursor()
            c.execute(
                "SELECT DISTINCT categoria FROM memoria_pessoal ORDER BY categoria"
            )
            
            return [r[0] for r in c.fetchall()]
            
    except Exception as e:
        logger.error(f"❌ Erro ao listar categorias: {e}")
        return []


# ==========================================
# 🔍 MOTOR DE PESQUISA NA WEB
# ==========================================

def otimizar_busca(termo: str) -> str:
    """
    Filtro de QI Alto: Analisa o contexto da sua pergunta e 
    força o buscador a ir nos sites que realmente importam.
    """
    termo_lower = termo.lower()
    
    # Contexto 1: Games (Força busca nas Wikis oficiais)
    jogos_keywords = [
        "minecraft", "terraria", "roblox", "jogo", "game", 
        "craftar", "fazer espada", "picareta", "bancada", "boss"
    ]
    if any(k in termo_lower for k in jogos_keywords):
        logger.info("🎮 Assunto Gamer detectado! Limitando pesquisa a sites de Wiki...")
        return f"{termo} wiki OR fandom"
        
    # Contexto 2: Política/Mundo real (Força sites de notícias confiáveis)
    noticias_keywords = [
        "notícia", "noticia", "presidente", "hoje", "brasil", 
        "governo", "aconteceu", "ministro"
    ]
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
                textos = [
                    f"Fonte {i+1}: {res.text.strip()}" 
                    for i, res in enumerate(resultados[:10])
                ]
                return "\n---\n".join(textos)
                
    except httpx.TimeoutException:
        logger.error("❌ A pesquisa demorou muito e deu Timeout.")
    except Exception as e:
        logger.error(f"❌ Erro sinistro no Web Scraper: {e}")
        
    return None


# ==========================================
# 🎯 ORQUESTRADOR DE CONHECIMENTO WEB
# ==========================================

async def consultar_conhecimento(termo: str) -> Optional[str]:
    """
    O Orquestrador do Conhecimento Web:
    1º Tenta lembrar do conhecimento web (SQLite). 
       Se lembrar e não tiver vencido, usa.
    2º Se não lembrar, vai pra Web (DuckDuckGo).
    3º Se achar na Web, salva pra não ter que pesquisar de novo.
    
    IMPORTANTE: Este método NÃO pesquisa memórias pessoais.
    Memórias pessoais são acessadas separadamente.
    """
    lembranca = buscar_na_memoria(termo)
    
    if lembranca:
        logger.info(f"🧠 Conhecimento web em cache: '{termo}'")
        return f"[CONHECIMENTO WEB] {lembranca}"
    
    logger.info(f"🌐 Pesquisando na Web por: '{termo}'...")
    info_web = await pesquisar_na_web(termo)
    
    if info_web:
        salvar_na_memoria(termo, info_web)
        logger.info(f"💾 Conhecimento web salvo! Validade: {DIAS_VALIDADE} dias.")
        return f"[CONHECIMENTO WEB] {info_web}"
    
    return None


# ==========================================
# 🧠 ORQUESTRADOR DE MEMÓRIA PESSOAL
# ==========================================

def lembrar_memoria_pessoal(termo: str) -> Optional[str]:
    """
    Busca na memória pessoal da Raiden.
    NÃO pesquisa na internet.
    Apenas retorna o que ela já sabe sobre Lucas/projeto.
    """
    memoria = buscar_memoria_pessoal(termo)
    
    if memoria:
        logger.info(f"🧠 Memória pessoal encontrada: '{termo}'")
        return f"[MEMÓRIA PESSOAL] {memoria}"
    
    return None


def aprender_memoria_pessoal(
    termo: str,
    conteudo: str,
    categoria: str = "geral"
) -> bool:
    """
    Ensina algo novo à Raiden sobre Lucas/projeto.
    Esta informação NÃO expira e NÃO é pesquisada na web.
    """
    sucesso = salvar_memoria_pessoal(termo, conteudo, categoria)
    
    if sucesso:
        logger.info(f"📝 Memória pessoal aprendida: '{termo}' [{categoria}]")
    
    return sucesso


def esquecer_memoria_pessoal(
    termo: str,
    categoria: Optional[str] = None
) -> bool:
    """
    Faz a Raiden esquecer uma memória pessoal.
    """
    sucesso = apagar_memoria_pessoal(termo, categoria)
    
    if sucesso:
        logger.info(f"🗑️ Memória pessoal esquecida: '{termo}'")
    
    return sucesso