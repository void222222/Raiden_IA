"""Módulo de Sistema - Comandos Linux, visão e automação (Comandos Dinâmicos)"""
import os
import base64
import subprocess
import tempfile
import re

async def capturar_tela(client, modelo_visao: str, chamar_ollama_func) -> str:
    """Captura a tela e retorna descrição da IA de visão"""
    metodos = [
        lambda tmp: subprocess.run(['grim', tmp], check=True, capture_output=True, timeout=5),
        lambda tmp: subprocess.run(['gnome-screenshot', '-f', tmp], check=True, capture_output=True, timeout=5),
        lambda tmp: subprocess.run(['maim', tmp], check=True, capture_output=True, timeout=5),
    ]
    
    for metodo in metodos:
        try:
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                tmp_name = tmp.name
            metodo(tmp_name)
            with open(tmp_name, 'rb') as f:
                img_data = f.read()
            os.unlink(tmp_name)
            img_base64 = base64.b64encode(img_data).decode()
            prompt_visao = "Descreva em UMA frase curta e informal (em português) o que está acontecendo nesta tela."
            return await chamar_ollama_func(client, modelo_visao, prompt_visao, timeout_segundos=120, imagens=[img_base64])
        except:
            continue
    
    return "Não foi possível capturar a tela."

def extrair_numero_do_texto(texto: str, padrao: int = 10, permitir_zero: bool = False) -> int:
    """
    Extrai números mencionados em linguagem natural.
    Args:
        texto: Frase falada pelo usuário
        padrao: Valor padrão se nenhum número for encontrado
        permitir_zero: Se True, permite retornar 0 (para modo mudo)
    
    Ex: "aumenta 30 por cento" → 30
        "vinte e cinco" → 25
        "volume 50%" → 50
        "mudo" → 0 (se permitir_zero=True)
    """
    texto = texto.lower().strip()
    
    # 🎯 Verifica palavras de silêncio/mudo
    palavras_mudo = ["mudo", "muta", "mutar", "silêncio", "silencio", "silenciar", "zero", "desligar som", "sem som"]
    if any(p in texto for p in palavras_mudo):
        if permitir_zero:
            print(f"      🔇 Modo mudo detectado: 0%")
            return 0
    
    # 🎯 PRIORIDADE 1: Dígitos numéricos (mais confiável)
    # Captura números como "30", "25%", "volume 50", "0%"
    match = re.search(r'(\d+)\s*(?:%|por cento|porcento)?', texto)
    if match:
        valor = int(match.group(1))
        limite_min = 0 if permitir_zero else 1
        if limite_min <= valor <= 100:
            print(f"      🔢 Número extraído (dígito): {valor}")
            return valor
    
    # 🎯 PRIORIDADE 2: Números por extenso compostos
    numeros_compostos = {
        "vinte e um": 21, "vinte e dois": 22, "vinte e três": 23,
        "vinte e tres": 23, "vinte e quatro": 24, "vinte e cinco": 25,
        "vinte e seis": 26, "vinte e sete": 27, "vinte e oito": 28,
        "vinte e nove": 29, "trinta e um": 31, "trinta e dois": 32,
        "trinta e três": 33, "trinta e tres": 33, "trinta e quatro": 34,
        "trinta e cinco": 35, "trinta e seis": 36, "trinta e sete": 37,
        "trinta e oito": 38, "trinta e nove": 39, "quarenta e um": 41,
        "quarenta e dois": 42, "quarenta e três": 43, "quarenta e tres": 43,
        "quarenta e quatro": 44, "quarenta e cinco": 45, "cinquenta e um": 51,
        "cinquenta e dois": 52, "cinquenta e três": 53, "cinquenta e tres": 53,
        "cinquenta e quatro": 54, "cinquenta e cinco": 55
    }
    
    for extenso, valor in sorted(numeros_compostos.items(), key=lambda x: len(x[0]), reverse=True):
        if extenso in texto:
            print(f"      🔤 Número extraído (composto): {valor}")
            return valor
    
    # 🎯 PRIORIDADE 3: Números por extenso simples
    numeros_simples = {
        "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2,
        "três": 3, "tres": 3, "quatro": 4, "cinco": 5,
        "seis": 6, "sete": 7, "oito": 8, "nove": 9,
        "dez": 10, "onze": 11, "doze": 12, "treze": 13,
        "quatorze": 14, "catorze": 14, "quinze": 15,
        "dezesseis": 16, "dezessete": 17, "dezoito": 18,
        "dezenove": 19, "vinte": 20, "trinta": 30,
        "quarenta": 40, "cinquenta": 50, "sessenta": 60,
        "setenta": 70, "oitenta": 80, "noventa": 90, "cem": 100
    }
    
    for extenso, valor in sorted(numeros_simples.items(), key=lambda x: len(x[0]), reverse=True):
        if re.search(rf'\b{extenso}\b', texto):
            limite_min = 0 if permitir_zero else 1
            if limite_min <= valor <= 100:
                print(f"      🔤 Número extraído (simples): {valor}")
                return valor
    
    # 🎯 PRIORIDADE 4: Padrão
    print(f"      ⚠️ Nenhum número encontrado, usando padrão: {padrao}")
    return padrao

def ajustar_volume(porcentagem: int = 10, direcao: str = "up"):
    """
    Ajusta o volume do sistema.
    Args:
        porcentagem: Valor entre 0 e 100 (0 = mudo)
        direcao: "up" para aumentar, "down" para diminuir, "set" para definir
    """
    # Agora permite 0% (mudo), mas limita em 100%
    porcentagem = max(0, min(100, porcentagem))
    
    try:
        if direcao == "up":
            subprocess.run(
                ["amixer", "-D", "pulse", "sset", "Master", f"{porcentagem}%+"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"   🔊 Volume aumentado em {porcentagem}%")
        elif direcao == "down":
            subprocess.run(
                ["amixer", "-D", "pulse", "sset", "Master", f"{porcentagem}%-"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"   🔉 Volume diminuído em {porcentagem}%")
        elif direcao == "set":
            subprocess.run(
                ["amixer", "-D", "pulse", "sset", "Master", f"{porcentagem}%"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            if porcentagem == 0:
                print(f"   🔇 Volume: MUDO (0%)")
            else:
                print(f"   🎚️ Volume definido para {porcentagem}%")
        elif direcao == "mute":
            # Usa o comando mute do amixer (alterna)
            subprocess.run(
                ["amixer", "-D", "pulse", "sset", "Master", "mute"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"   🔇 Som mutado/desmutado")
        elif direcao == "unmute":
            subprocess.run(
                ["amixer", "-D", "pulse", "sset", "Master", "unmute"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"   🔊 Som reativado")
    except Exception as e:
        print(f"   ⚠️ Erro ao ajustar volume: {e}")

def controlar_midia(acao: str):
    """
    Controla o player de mídia.
    Args:
        acao: "play-pause", "next", "previous", "stop"
    """
    try:
        if acao == "play-pause":
            subprocess.run(
                ["playerctl", "play-pause"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print("   ⏯️ Play/Pause")
        elif acao == "next":
            subprocess.run(
                ["playerctl", "next"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print("   ⏭️ Próxima faixa")
        elif acao == "previous":
            subprocess.run(
                ["playerctl", "previous"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print("   ⏮️ Faixa anterior")
        elif acao == "stop":
            subprocess.run(
                ["playerctl", "stop"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print("   ⏹️ Parado")
    except Exception as e:
        print(f"   ⚠️ Erro ao controlar mídia: {e}")

def digitar_texto(texto: str):
    """Digita texto via wtype (Wayland)"""
    try:
        subprocess.run(["wtype", texto + " "])
        print(f"   📝 Digitado: {texto[:50]}...")
    except Exception as e:
        print(f"   ⚠️ Erro ao digitar: {e}")

def abrir_editor() -> bool:
    """Abre o editor de texto nativo. Retorna True se conseguiu abrir."""
    editores = ["gedit", "gnome-text-editor", "mousepad", "kate", "leafpad"]
    for editor in editores:
        try:
            subprocess.Popen([editor], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"   📝 Editor {editor} aberto")
            return True
        except FileNotFoundError:
            continue
    print("   ⚠️ Nenhum editor de texto encontrado")
    return False