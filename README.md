```markdown
# ⚡ Raiden IA – Assistente Virtual Tsundere com Visão, Voz e Humor

![Python](https://img.shields.io/badge/Python-3.12+-blue?style=for-the-badge&logo=python)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-orange?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Offline](https://img.shields.io/badge/AI-100%25%20Offline-red?style=for-the-badge)

> **Status:** Em desenvolvimento ativo – backend funcional, frontend nativo (Tauri + ChatVRM) em construção.  
> **Objetivo:** Uma assistente IA 100% local, offline, com personalidade forte, memória, agenda, visão computacional e controle de sistema.

---

# 📌 Sobre o Projeto

Raiden é uma assistente virtual com personalidade **tsundere** — sarcástica, impaciente, mas surpreendentemente prestativa.

Ela:
* 🎤 Escuta sua voz
* 🧠 Pensa usando LLMs locais
* 🔊 Responde com voz
* 💾 Lembra de conversas e tarefas
* 😠 Muda de humor conforme você a trata
* 🎵 Toca músicas automaticamente
* 👀 Em breve enxergará sua tela usando visão computacional

Tudo funcionando **localmente**, sem enviar dados para a nuvem.

O objetivo do projeto é criar uma IA pessoal realmente útil, divertida e com presença própria — algo próximo de uma companheira digital estilo J.A.R.V.I.S., mas com personalidade forte.

---

# ✨ Funcionalidades

| Funcionalidade | Status |
|----------------|--------|
| LLM local com Ollama (Llama 3 / Qwen) | ✅ |
| Reconhecimento de voz (STT) | ✅ |
| Síntese de voz (TTS) | ✅ |
| Modo standby / wake mode | ✅ |
| Memória persistente com SQLite | ✅ |
| Agenda e tarefas | ✅ |
| Sistema de humor dinâmico | ✅ |
| Proatividade automática | ✅ |
| Anti-repetição nas respostas | ✅ |
| DJ Raiden (YouTube automático) | ✅ |
| Comunicação via WebSocket | ✅ |
| Frontend Tauri + ChatVRM | 🚧 |
| Visão computacional (LLaVA) | 🚧 |
| Controle de sistema | 🚧 |
| Wake word dedicado | 🚧 |
| Acesso remoto | 🚧 |

---

# 🧠 Tecnologias Utilizadas

## Backend
* Python 3.12+
* FastAPI
* SQLite
* WebSockets

## IA Local
* Ollama
* Llama 3
* Qwen 2.5
* LLaVA (planejado)

## Voz
* SpeechRecognition
* gTTS
* pygame
* Piper (planejado)

## Frontend
* Tauri
* ChatVRM
* VRM Models

## Infraestrutura
* Linux (Pop!_OS / Ubuntu recomendado)
* Tailscale

---

# ⚙️ Pré-requisitos

Antes de instalar a Raiden, certifique-se de possuir:

* Git
* Python 3.12+
* Ollama instalado
* Linux recomendado (Ubuntu / Pop!_OS)

---

# 🚀 Instalação

## 1. Clone o repositório

```bash
git clone https://github.com/void222222/Raiden_IA.git
cd Raiden_IA

```

## 2. Crie o ambiente virtual

```bash
python3 -m venv raiden_env
source raiden_env/bin/activate

```

## 3. Instale as dependências

```bash
pip install requests speechrecognition gtts pygame pyaudio fastapi uvicorn websockets

```

## 4. Instale o Ollama

Linux:

```bash
curl -fsSL https://ollama.com/install.sh | sh

```

## 5. Baixe os modelos

```bash
ollama pull llama3
ollama pull qwen2.5:7b

```

## 6. Crie o modelo personalizado

```bash
ollama create raiden_nova -f Modelfile

```

## 7. Execute o projeto

```bash
python3 teste_ia.py

```

> **A Raiden iniciará em modo standby aguardando o comando de ativação.**

---

# 🎤 Comandos de Voz

**📅 Agenda**

* *"Raiden, anotar estudar matemática amanhã"*
* *"Raiden, minhas tarefas"*

**🎵 Música**

* *"Raiden, tocar Linkin Park"*
* *"Raiden, tocar opening de Bleach"*

**🎭 Expressões**

* *"Raiden, cara de feliz"*
* *"Raiden, cara de brava"*
* *"Raiden, cara de triste"*
* *"Raiden, cara de surpresa"*

**💻 Sistema**

* *"Raiden, encerrar sistema"*

---

# 🗺️ Roadmap

### Fase 2

* [ ] Wake word definitivo
* [ ] TTS totalmente offline
* [ ] Melhor roteamento de modelos
* [ ] Sistema emocional avançado
* [ ] Melhor proatividade
* [ ] Melhor memória contextual

### Fase 3 – Projeto J.A.R.V.I.S.

* [ ] Aplicativo completo em Tauri
* [ ] IA com visão computacional
* [ ] Controle do sistema operacional
* [ ] Automação avançada
* [ ] Acesso remoto via celular
* [ ] Clonagem de voz emocional
* [ ] Sistema multiagente

---

# 📁 Estrutura do Projeto

```text
Raiden_IA/
├── teste_ia.py
├── memoria_raiden.db
├── bio_raiden.txt
├── Modelfile
├── requirements.txt
├── frontend/
├── assets/
└── README.md

```

---

# ⚡ Objetivos do Projeto

* Criar uma IA pessoal totalmente offline
* Desenvolver uma assistente com personalidade real
* Integrar voz, visão e automação
* Criar uma experiência semelhante a uma IA de ficção científica
* Evoluir para desktop e Android usando o mesmo código-base

---

# 🤝 Contribuições

Sugestões, feedbacks e ideias são sempre bem-vindos. Você pode:

* Abrir issues
* Reportar bugs
* Sugerir melhorias
* Contribuir com código

---

# 📄 Licença

**MIT License** - Você pode usar, modificar e estudar o projeto livremente.

---

# 👤 Autor

**Lucas Santos**

Desenvolvedor Full Stack focado em:

* Inteligência Artificial
* Sistemas Offline
* Automação
* Frontend Interativo
* LLMs Locais

**GitHub:** [https://github.com/void222222](https://www.google.com/search?q=https://github.com/void222222)

---

# 🙏 Agradecimentos

* Comunidade Ollama
* Projeto ChatVRM
* Desenvolvedores open source
* Todos que acompanham o projeto

> ⚡ *"Uma IA local não precisa ser fria. Ela pode ter personalidade."*


```
