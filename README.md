# ⚡ Raiden IA

<p align="center">
  <strong>Assistente de Inteligência Artificial local com voz, visão, memória e integração com lives.</strong>
</p>

<p align="center">
  <a href="https://github.com/void222222/Raiden_IA">
    <img src="https://img.shields.io/badge/status-em%20desenvolvimento-orange?style=for-the-badge" alt="Status">
  </a>
  <img src="https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Ollama-black?style=for-the-badge" alt="Ollama">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
</p>

---

## 🎥 Sobre o projeto

**Raiden IA** é um projeto de assistente virtual executado localmente, desenvolvido para integrar diferentes recursos de Inteligência Artificial em uma única aplicação.

A proposta é transformar um modelo de linguagem local em uma personagem interativa capaz de:

- conversar por texto;
- ouvir comandos pelo microfone;
- responder utilizando voz;
- analisar o conteúdo da tela;
- pesquisar informações na web;
- armazenar conhecimento temporariamente;
- interagir com o chat de uma live no YouTube;
- receber eventos relacionados ao LivePix;
- controlar um avatar 3D através do ChatVRM.

O projeto funciona como uma camada de **orquestração entre modelos de IA, serviços externos, backend e uma interface 3D**, centralizando a lógica em uma API desenvolvida com FastAPI.

---

## 🧠 Arquitetura

```text
                         ┌─────────────────────┐
                         │       Usuário       │
                         │                     │
                         │ Texto / Microfone   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Raiden Core     │
                         │      FastAPI        │
                         │   api_raiden.py     │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
       │    Ollama    │      │   Memória    │      │    Visão     │
       │    LLM       │      │ SQLite + Web │      │   da Tela    │
       └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Resposta        │
                         │ Texto + Áudio       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      ChatVRM        │
                         │      Avatar 3D      │
                         └─────────────────────┘

      Integrações
      ─────────────────────────────────────────────

      YouTube Live ──► leitura do chat ──► Raiden
      LivePix ───────► Webhook/Túnel ─────► FastAPI
```

---

## ✨ Principais funcionalidades

### 💬 Conversação com IA local

O núcleo da aplicação utiliza **Ollama** para executar modelos localmente.

O projeto possui um `Modelfile` próprio para configurar a personalidade da Raiden, atualmente baseado em:

```text
qwen2.5:3b
```

O modelo personalizado é registrado como:

```text
raiden_carioca
```

### 🧠 Memória e pesquisa na web

A Raiden combina **SQLite + cache temporal + pesquisa web**.

```text
Pergunta
   │
   ▼
Memória local
   │
   ├── informação válida ──► reutiliza
   │
   └── informação inexistente/expirada
                 │
                 ▼
          Pesquisa na Web
                 │
                 ▼
          Salva no SQLite
```

As informações possuem validade padrão de **7 dias**.

### 👁️ Visão computacional

A Raiden consegue analisar o conteúdo da tela:

```text
Usuário pede para olhar a tela
            │
            ▼
   cosmic-screenshot
            │
            ▼
      Captura da tela
            │
            ▼
         Base64
            │
            ▼
      Ollama + Vision
            │
            ▼
      Descrição da tela
```

O modelo de visão configurado atualmente é:

```text
llava-phi3
```

### 🎙️ Entrada por voz

A aplicação possui um listener contínuo para o microfone.

Exemplo:

```text
Raiden, olha minha tela
```

### 🔊 Respostas em voz

As respostas são convertidas em áudio com **Edge TTS**.

Voz atual:

```text
pt-BR-FranciscaNeural
```

O áudio é retornado em Base64 para a interface.

### 📺 Integração com YouTube Live

O módulo monitora o chat da live usando `pytchat`.

Gatilho:

```text
!raiden
```

Exemplo:

```text
!raiden qual a melhor armadura no Terraria?
```

### 💸 Integração com LivePix

O módulo pode criar um túnel usando **Localtunnel** para permitir comunicação externa com a API local.

> ⚠️ Expor uma API local publicamente exige autenticação, validação de webhooks e outras medidas de segurança em ambientes reais.

### 🎭 Interface 3D integrada

O **ChatVRM** faz parte do próprio repositório como uma aplicação integrada ao projeto Raiden.

O front-end utiliza **Next.js/React** e fornece:

- renderização do avatar VRM;
- chat por texto;
- reprodução de áudio com lip-sync;
- troca de modelos `.vrm`;
- reprodução de animações `.vrma`;
- troca de fundos;
- upload de modelos, animações e imagens;
- integração direta com os endpoints da API Python.

O backend controla o servidor do ChatVRM e consegue iniciá-lo através de:

```bash
npm run dev
```

---

# 🛠️ Stack tecnológica

| Categoria           | Tecnologias                      |
| ------------------- | -------------------------------- |
| Backend             | Python, FastAPI, Uvicorn         |
| IA                  | Ollama, Qwen 2.5 3B              |
| Visão               | Ollama Vision, LLaVA-Phi3        |
| Voz                 | SpeechRecognition, Edge TTS      |
| Memória             | SQLite                           |
| Web                 | HTTPX, BeautifulSoup, DuckDuckGo |
| YouTube             | Pytchat                          |
| Front-end 3D        | Next.js, React, ChatVRM          |
| Avatar / Animações  | VRM, VRMA                        |
| Streaming / Eventos | YouTube Live, LivePix            |
| Túnel               | Localtunnel                      |
| Sistema             | Linux / COSMIC                   |

---

# 📁 Estrutura do projeto

```text
Raiden_IA/
│
├── api_raiden.py
├── Modelfile
├── README.md
├── requirements.txt
├── memoria_visual.txt
│
├── modulos/
│   ├── frontend.py
│   ├── livepix.py
│   ├── visao.py
│   ├── web_memoria.py
│   └── youtube.py
│
├── ChatVRM/
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   │   ├── *.vrm
│   │   ├── *.vrma
│   │   └── imagens/
│   └── src/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       └── pages/
│
├── Artes/
└── .gitignore
```

| Arquivo/Pasta       | Função                                      |
| ------------------- | ------------------------------------------- |
| `api_raiden.py`     | Núcleo da aplicação e API principal         |
| `web_memoria.py`    | Memória, cache e pesquisa web               |
| `visao.py`          | Captura e análise da tela                   |
| `youtube.py`        | Leitura do chat do YouTube                  |
| `livepix.py`        | Integração com Localtunnel/LivePix          |
| `frontend.py`       | Controle do servidor do ChatVRM             |
| `ChatVRM/`          | Interface 3D integrada da Raiden            |
| `Modelfile`         | Configuração do modelo/personagem           |
| `requirements.txt`  | Dependências Python do projeto              |

> `node_modules/`, `.next/`, ambientes virtuais e bancos locais não fazem parte do código-fonte versionado.

---

# 🔌 API

## `POST /chat`

Processa uma mensagem.

```json
{
  "texto": "Olá Raiden"
}
```

Resposta:

```json
{
  "texto": "...",
  "audio_base64": "...",
  "expressao": "neutral"
}
```

## `GET /proximo_audio`

Consulta se existe uma nova resposta disponível para o front-end.

## `GET /api/arquivos`

Lista os modelos `.vrm`, animações `.vrma` e imagens disponíveis no diretório público do ChatVRM.

## `POST /api/upload`

Recebe arquivos de avatar, animação ou imagem enviados pelo guarda-roupa da interface e salva no diretório público utilizado pela aplicação.

## `GET /api/painel/status`

Retorna o estado dos módulos:

```json
{
  "youtube": true,
  "frontend": true,
  "livepix": false
}
```

## Controle dos módulos

```text
POST /api/painel/youtube/toggle
POST /api/painel/frontend/toggle
POST /api/painel/livepix/toggle
POST /api/painel/parar-tudo
```

---

# 🚀 Instalação

## 1. Clone o projeto

```bash
git clone https://github.com/void222222/Raiden_IA.git
cd Raiden_IA
```

## 2. Crie o ambiente virtual Python

```bash
python3 -m venv venv
source venv/bin/activate
```

## 3. Instale as dependências Python

```bash
pip install -r requirements.txt
```

## 4. Instale as dependências do ChatVRM

```bash
cd ChatVRM
npm install
cd ..
```

## 5. Configure o Ollama

Disponibilize:

```text
qwen2.5:3b
llava-phi3
```

Depois crie o modelo personalizado:

```bash
ollama create raiden_carioca -f Modelfile
```

Verifique:

```bash
curl http://localhost:11434/api/tags
```

## 6. Instale o Localtunnel

```bash
npm install -g localtunnel
```

---

# ▶️ Executando

Com o ambiente virtual ativado:

```bash
python api_raiden.py
```

ou:

```bash
uvicorn api_raiden:app --host 0.0.0.0 --port 8000
```

A API ficará disponível em:

```text
http://localhost:8000
```

O módulo de frontend consegue iniciar o ChatVRM integrado automaticamente com:

```bash
npm run dev
```

na pasta `ChatVRM`.

---

# 🎭 ChatVRM

O ChatVRM está incorporado ao próprio repositório em:

```text
Raiden_IA/ChatVRM
```

O código Python utiliza caminhos relativos ao projeto para localizar o front-end e seus arquivos públicos, evitando dependência do antigo caminho `~/Documentos/ChatVRM`.

Isso permite mover o projeto inteiro para outro diretório sem precisar alterar caminhos absolutos no código.

---

# 📺 YouTube

Ative o módulo pelo painel e informe o link da live.

No chat:

```text
!raiden sua pergunta
```

---

# 🔐 Segurança

Recursos que podem realizar comunicação externa:

- DuckDuckGo
- Google Speech Recognition
- Edge TTS
- YouTube
- Localtunnel
- LivePix

Em uma evolução para produção, recomenda-se adicionar:

- autenticação;
- CORS restritivo;
- variáveis de ambiente para secrets;
- validação de webhooks;
- HTTPS;
- rate limiting;
- logs estruturados.

---

# 🗺️ Roadmap

## Backend

- [ ] Melhorar tratamento de erros
- [ ] Melhorar gerenciamento de processos
- [ ] Adicionar testes automatizados
- [ ] Configuração por variáveis de ambiente

## IA

- [ ] Memória de longo prazo
- [ ] Busca semântica mais robusta
- [ ] Melhor gerenciamento de contexto
- [ ] Mais ferramentas para o agente
- [ ] Evolução multimodal

## Interface

- [ ] Melhorar integração com ChatVRM
- [ ] Controle de expressões
- [ ] Sincronização entre fala e animações
- [ ] Painel de controle completo

## Streaming

- [ ] Melhorar integração com YouTube
- [ ] Melhorar eventos
- [ ] Integrar mais plataformas
- [ ] Sistema de comandos configuráveis

---

# 📌 Status

🚧 **Em desenvolvimento**

Projeto experimental para explorar a integração entre:

**IA + Backend + Automação + Visão Computacional + Voz + Streaming + Avatar 3D**

---

# 👨‍💻 Autor

**Lucas Santos de Araújo**

[GitHub - @void222222](https://github.com/void222222)

[Repositório - Raiden IA](https://github.com/void222222/Raiden_IA)

---

# ⭐ Contribuição

Sugestões, ideias e melhorias são bem-vindas.

Abra uma **Issue** ou envie um **Pull Request**.

---

# 📄 Licença

Este projeto ainda não possui uma licença open source definida.
