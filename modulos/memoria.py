"""Módulo de Memória - SQLite, histórico e estado emocional"""
import sqlite3
import time

def get_db():
    conn = sqlite3.connect("memoria_raiden.db", check_same_thread=False, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn

def iniciar_caderno():
    with get_db() as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS historico 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, autor TEXT, mensagem TEXT, timestamp REAL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS agenda 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, tarefa TEXT, data TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS estado 
                     (chave TEXT PRIMARY KEY, valor INTEGER)''')
        c.execute('INSERT OR IGNORE INTO estado (chave, valor) VALUES ("irritacao", 0)')
        conn.commit()

def ajustar_humor(delta):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT valor FROM estado WHERE chave = 'irritacao'")
        atual = c.fetchone()[0]
        novo = max(0, min(100, atual + delta))
        c.execute("UPDATE estado SET valor = ? WHERE chave = 'irritacao'", (novo,))
        conn.commit()
        return novo

def anotar_no_caderno(autor, msg):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("INSERT INTO historico (autor, mensagem, timestamp) VALUES (?, ?, ?)",
                  (autor, msg, time.time()))
        conn.commit()

def ler_ultimas_conversas(limite=4):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT autor, mensagem FROM historico ORDER BY id DESC LIMIT ?", (limite,))
        linhas = c.fetchall()
        linhas.reverse()
        return "".join(f"{l['autor']}: {l['mensagem']}\n" for l in linhas)

def salvar_tarefa(tarefa):
    with get_db() as conn:
        c = conn.cursor()
        data = time.strftime("%d/%m/%Y")
        c.execute("INSERT INTO agenda (tarefa, data) VALUES (?, ?)", (tarefa, data))
        conn.commit()
        return f"Tarefa '{tarefa}' anotada."

def listar_tarefas():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT tarefa FROM agenda")
        tarefas = c.fetchall()
        if not tarefas:
            return "Sua agenda está vazia."
        return "Suas tarefas são: " + ", ".join(t['tarefa'] for t in tarefas)

def carregar_bio():
    try:
        with open("bio_raiden.txt", "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "O usuário é Lucas."