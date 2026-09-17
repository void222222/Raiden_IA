# ⚡ Raiden IA

<p align="center">
  <strong>Assistente de IA local com voz, visão, memória, avatar 3D, integrações de live e módulo de automação para Minecraft.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-em%20desenvolvimento-orange?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Ollama-black?style=for-the-badge" alt="Ollama">
  <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Minecraft-mineflayer-green?style=for-the-badge" alt="Minecraft">
</p>

---

## Sobre o projeto

**Raiden IA** é um projeto experimental de assistente virtual desenvolvido para reunir, em uma única aplicação, conversação com IA, voz, visão computacional, memória, avatar 3D, integrações com transmissões ao vivo e automação de Minecraft.

O projeto possui um backend principal em **Python/FastAPI** e utiliza um modelo de linguagem executado através do **Ollama**.

A interface visual utiliza o projeto **ChatVRM**, incorporado ao próprio repositório como uma aplicação Next.js/React.

Além disso, o projeto possui atualmente um módulo separado de Minecraft desenvolvido em **JavaScript**, utilizando **Mineflayer**, `minecraft-data`, `mineflayer-pathfinder` e outras bibliotecas do ecossistema Prismarine.

O objetivo não é transformar a Raiden exclusivamente em um bot de Minecraft. O Minecraft é tratado como um módulo adicional dentro da arquitetura da Raiden.

---

# 🧠 Arquitetura geral

Atualmente o projeto está dividido em algumas camadas principais:

```text
                         ┌─────────────────────────┐
                         │        Usuário          │
                         │                         │
                         │ Texto / Voz / Interface │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │      Raiden Core        │
                         │       FastAPI           │
                         │     api_raiden.py       │
                         └────────────┬────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
              ▼                       ▼                        ▼
       ┌──────────────┐       ┌──────────────┐        ┌────────────────┐
       │    Cérebro   │       │   Memória    │        │     Visão      │
       │    Ollama    │       │ SQLite/Web   │        │    da tela     │
       └──────────────┘       └──────────────┘        └────────────────┘
              │
              │
              ▼
       ┌─────────────────────────────────────────────┐
       │              Integrações                    │
       │                                             │
       │ YouTube │ LivePix │ ChatVRM │ Minecraft    │
       └─────────────────────────────────────────────┘
                           │
                           ▼
                  ┌───────────────────┐
                  │     Resposta      │
                  │ Texto + Áudio     │
                  │ + Avatar 3D       │
                  └───────────────────┘
```

No caso do Minecraft, a arquitetura possui uma separação própria:

```text
                 Raiden Core / Python
                         │
                         │ WebSocket
                         ▼
                ┌──────────────────┐
                │ Módulo Minecraft │
                │     JavaScript    │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │    Mineflayer    │
                │      Bot         │
                └────────┬─────────┘
                         │
                         ▼
                    Minecraft
```

A própria API principal possui um WebSocket específico em `/ws/minecraft`, além do WebSocket normal `/ws`.

---

# 🤖 Inteligência artificial

O modelo principal da Raiden é executado através do **Ollama**.

O `Modelfile` atualmente utiliza:

```text
qwen2.5:3b
```

e cria um modelo personalizado chamado:

```text
raiden_carioca
```

O `Modelfile` define parâmetros como:

```text
temperature 0.55
top_p 0.90
repeat_penalty 1.15
num_ctx 4096
```

Também define a personalidade, comportamento conversacional, regras de pesquisa e identidade da personagem.

A personalidade configurada no modelo é baseada em uma personagem de VTuber com características:

* tsundere;
* debochada;
* irônica;
* carioca;
* leal;
* parceira;
* voltada para conversação natural.

O modelo também possui regras para diferenciar conversas normais de situações em que uma pesquisa externa é necessária.

---

# 🧠 Núcleo da Raiden

O diretório `nucleo/` concentra boa parte da lógica central da aplicação.

Atualmente existem componentes como:

```text
nucleo/
├── acoes_minecraft.py
├── cerebro.py
├── config.py
├── estado_minecraft.py
├── filas.py
├── historico.py
├── llm_conversa.py
├── llm_minecraft.py
├── logger.py
├── loop_minecraft.py
├── requests.py
├── utils.py
├── voz.py
└── websocket_minecraft.py
```

Entre as responsabilidades presentes nessa camada estão:

* processamento central da conversa;
* configuração da aplicação;
* filas de comunicação;
* histórico;
* comunicação com o LLM;
* voz;
* logging;
* controle do ciclo de autonomia Minecraft;
* estado do Minecraft;
* comunicação WebSocket com o módulo Minecraft.

A organização atual também mostra uma separação entre a lógica de conversa e a lógica relacionada ao Minecraft.

---

# 🌐 API FastAPI

O arquivo:

```text
api_raiden.py
```

é o ponto principal de inicialização do backend.

Ele atualmente é responsável principalmente por:

* inicializar o FastAPI;
* configurar CORS;
* iniciar o banco;
* iniciar o trabalhador do cérebro;
* iniciar/parar a autonomia Minecraft;
* iniciar o listener do microfone;
* registrar os routers;
* disponibilizar arquivos estáticos;
* manter o WebSocket principal;
* disponibilizar o WebSocket Minecraft;
* controlar o ciclo de vida da aplicação.

A API está configurada atualmente como:

```text
Raiden Core API
version 2.5.0
```

e executa localmente por padrão em:

```text
127.0.0.1:8000
```

O arquivo também registra os routers de:

```text
painel
memoria
arquivos
chat
minecraft
```

e os WebSockets:

```text
/ws
/ws/minecraft
```

---

# 🔌 Rotas da API

As rotas HTTP foram separadas do arquivo principal e estão em:

```text
rotas/
├── arquivos.py
├── chat.py
├── memoria.py
├── minecraft.py
└── painel.py
```

Essa separação permite que `api_raiden.py` funcione principalmente como ponto de inicialização e integração dos diferentes componentes.

## Chat

O router:

```text
rotas/chat.py
```

concentra as rotas relacionadas à conversação HTTP.

## Memória

```text
rotas/memoria.py
```

concentra as operações HTTP relacionadas à memória.

## Arquivos

```text
rotas/arquivos.py
```

é responsável pelas operações relacionadas aos arquivos utilizados pelo front-end.

## Painel

```text
rotas/painel.py
```

concentra o controle dos módulos da aplicação.

## Minecraft

```text
rotas/minecraft.py
```

concentra as operações HTTP relacionadas ao módulo Minecraft.

---

# 🎤 Entrada por voz

A aplicação possui um listener de microfone implementado em `api_raiden.py`.

O sistema utiliza:

```text
SpeechRecognition
PyAudio
```

e reconhece comandos em:

```text
pt-BR
```

Existem algumas variações configuradas para detectar o nome da personagem:

```text
raiden
rayden
haiden
reyden
```

Quando o gatilho é detectado, o texto é encaminhado para a fila de perguntas da aplicação.

---

# 🔊 Voz da Raiden

O projeto possui um módulo específico:

```text
nucleo/voz.py
```

e utiliza **Edge TTS** entre as dependências Python.

A voz configurada no projeto é:

```text
pt-BR-FranciscaNeural
```

As respostas da aplicação podem ser encaminhadas para a interface juntamente com dados de áudio.

---

# 👁️ Visão computacional

A visão da Raiden está implementada principalmente em:

```text
modulos/visao.py
```

e existe também o arquivo:

```text
olho_da_raiden.py
```

O projeto foi estruturado para permitir que a Raiden obtenha uma captura da tela e utilize um modelo de visão através do ecossistema Ollama para interpretar o conteúdo.

A visão é tratada como uma capacidade adicional da IA, separada do núcleo de conversação.

---

# 🧠 Memória

A memória da aplicação está distribuída entre componentes do núcleo e:

```text
modulos/web_memoria.py
```

Existe também:

```text
chroma_db/
```

no repositório atual.

A arquitetura atual combina mecanismos de memória e pesquisa externa, em vez de depender somente do histórico imediato da conversa.

O projeto ainda está em desenvolvimento nessa área e a estrutura atual não deve ser interpretada como um sistema definitivo de memória de longo prazo.

---

# 🌐 Pesquisa na Web

O projeto possui dependências para comunicação HTTP e processamento de páginas:

```text
httpx
beautifulsoup4
```

e o módulo:

```text
modulos/web_memoria.py
```

é responsável pela parte relacionada à memória/pesquisa web.

Isso significa que a Raiden **não é exclusivamente offline** quando esses recursos externos são utilizados.

Entre os recursos externos utilizados ou previstos no código estão serviços de reconhecimento de voz, TTS, pesquisa web, YouTube e serviços relacionados a transmissões.

---

# 📺 YouTube Live

O módulo:

```text
modulos/youtube.py
```

integra a aplicação com o chat de transmissões do YouTube.

A dependência utilizada é:

```text
pytchat
```

Existe também integração entre o módulo do YouTube e a fila de perguntas do cérebro da Raiden.

O sistema possui suporte a comandos direcionados à Raiden durante a transmissão.

Exemplo:

```text
!raiden sua pergunta
```

---

# 💸 LivePix

O projeto possui:

```text
modulos/livepix.py
```

para a integração relacionada ao LivePix.

Também existe suporte à utilização de **Localtunnel** para disponibilizar comunicação externa com uma aplicação que normalmente roda localmente.

Essa parte exige atenção especial de segurança quando utilizada fora de um ambiente local controlado.

---

# 🎭 ChatVRM

O diretório:

```text
ChatVRM/
```

contém a interface visual 3D da Raiden.

O projeto utiliza:

* Next.js;
* React;
* TypeScript;
* Three.js;
* `@pixiv/three-vrm`;
* animações VRMA;
* componentes de interface;
* reprodução de áudio.

O `package.json` atual do ChatVRM utiliza:

```text
Next.js 13.2.4
React 18.2.0
Three.js 0.149.0
TypeScript 5.0.2
```

e declara Node:

```text
16.14.2
```

como engine do projeto.

O ChatVRM possui seus próprios componentes, páginas, hooks e recursos públicos.

---

# 👤 Avatares e animações

O diretório:

```text
ChatVRM/public/
```

contém arquivos de avatar e animação.

Entre os arquivos presentes estão modelos:

```text
.vrm
```

e animações:

```text
.vrma
```

Também existem imagens e recursos utilizados pela interface.

O repositório atualmente contém diferentes versões/modelos da Raiden, incluindo arquivos como:

```text
Raiden_Atual.vrm
Raiden_br.vrm
Raiden_capoeira.vrm
Raiden_meid.vrm
raiden_true.vrm
```

além de animações como:

```text
capoeira.vrma
idle_loop.vrma
idle_loop2.vrma
tchau_sinho.vrma
```

---

# ⛏️ Minecraft

O Minecraft atualmente possui uma estrutura própria dentro do projeto:

```text
minecraft/
```

A integração é feita em **JavaScript** e utiliza:

```text
mineflayer
minecraft-data
mineflayer-pathfinder
prismarine-viewer
ws
```

As dependências estão registradas no `package.json` da raiz.

---

# 🧩 Estrutura do módulo Minecraft

A estrutura atual contém componentes separados para diferentes capacidades:

```text
minecraft/
├── acoes.js
├── autonomia/
│   ├── constantes.js
│   ├── estado.js
│   ├── executor.js
│   ├── handlers.js
│   ├── index.js
│   └── planejador.js
├── bot.js
├── coletor.js
├── combate.js
├── conexao.js
├── construcao.js
├── crafting.js
├── equipamento.js
├── eventos.js
├── inventario.js
├── movimento.js
├── mundo.js
├── navegacao.js
└── percepcao.js
```

A arquitetura separa responsabilidades como:

* conexão;
* controle do bot;
* percepção;
* mundo;
* movimento;
* navegação;
* inventário;
* equipamentos;
* crafting;
* construção;
* combate;
* eventos;
* coleta;
* ações;
* autonomia.

A estrutura também possui uma camada específica de autonomia.

---

# 🧠 Autonomia Minecraft

A autonomia está organizada em:

```text
minecraft/autonomia/
```

com:

```text
constantes.js
estado.js
executor.js
handlers.js
index.js
planejador.js
```

O planejador possui lógica para:

* analisar o inventário;
* verificar materiais necessários;
* procurar receitas;
* expandir receitas em tarefas;
* considerar mesa de crafting;
* verificar ferramentas necessárias;
* considerar níveis de ferramentas;
* gerar tarefas de obtenção de blocos;
* gerar tarefas de obtenção de itens;
* criar tarefas de crafting;
* trabalhar com estoques simulados durante o planejamento.

Também existe uma margem de segurança para compensar atrasos na sincronização do inventário do Mineflayer.

O fluxo pretendido é aproximadamente:

```text
Objetivo
   │
   ▼
Planejador
   │
   ├── materiais?
   ├── receita?
   ├── ferramenta?
   ├── crafting table?
   └── bloco?
   │
   ▼
Plano de tarefas
   │
   ▼
Executor / Handlers
   │
   ▼
Ações do bot
   │
   ▼
Minecraft
```

Essa parte ainda está em desenvolvimento e possui problemas de planejamento que estão sendo corrigidos durante a implementação.

---

# 🔄 Comunicação Python ↔ Minecraft

O backend Python possui componentes específicos para a integração:

```text
nucleo/acoes_minecraft.py
nucleo/estado_minecraft.py
nucleo/llm_minecraft.py
nucleo/loop_minecraft.py
nucleo/websocket_minecraft.py
```

Além disso existem:

```text
modulos/minecraft.py
modulos/minecraft_objetivos.py
rotas/minecraft.py
```

A API principal registra o WebSocket:

```text
/ws/minecraft
```

para comunicação com a camada Minecraft.

A arquitetura atual foi construída para que o Minecraft utilize a infraestrutura da Raiden sem precisar criar uma segunda IA completamente independente.

---

# 📦 Dependências Python

As dependências Python atualmente declaradas em `requirements.txt` são:

```text
fastapi
uvicorn
httpx
edge-tts
SpeechRecognition
PyAudio
pydantic
beautifulsoup4
pytchat
```

---

# 📦 Dependências JavaScript

Na raiz do projeto existe um `package.json` voltado principalmente ao módulo Minecraft.

Entre as dependências atuais estão:

```text
@pixiv/three-vrm-animation
canvas
minecraft-data
mineflayer
mineflayer-pathfinder
prismarine-viewer
ws
```

O arquivo também possui um script de testes configurado:

```bash
npm test
```

que aponta para:

```text
minecraft/tests/*.test.js
```

---

# 📁 Estrutura atual do projeto

A estrutura relevante do projeto atualmente é:

```text
Raiden_IA/
│
├── .gitignore
├── README.md
├── Modelfile
├── requirements.txt
├── package.json
├── package-lock.json
├── api_raiden.py
├── memoria_visual.txt
├── olho_da_raiden.py
│
├── nucleo/
│   ├── acoes_minecraft.py
│   ├── cerebro.py
│   ├── config.py
│   ├── estado_minecraft.py
│   ├── filas.py
│   ├── historico.py
│   ├── llm_conversa.py
│   ├── llm_minecraft.py
│   ├── logger.py
│   ├── loop_minecraft.py
│   ├── requests.py
│   ├── utils.py
│   ├── voz.py
│   └── websocket_minecraft.py
│
├── rotas/
│   ├── arquivos.py
│   ├── chat.py
│   ├── memoria.py
│   ├── minecraft.py
│   └── painel.py
│
├── modulos/
│   ├── frontend.py
│   ├── livepix.py
│   ├── minecraft.py
│   ├── minecraft_objetivos.py
│   ├── visao.py
│   ├── web_memoria.py
│   └── youtube.py
│
├── minecraft/
│   ├── acoes.js
│   ├── bot.js
│   ├── coletor.js
│   ├── combate.js
│   ├── conexao.js
│   ├── construcao.js
│   ├── crafting.js
│   ├── equipamento.js
│   ├── eventos.js
│   ├── inventario.js
│   ├── movimento.js
│   ├── mundo.js
│   ├── navegacao.js
│   ├── percepcao.js
│   │
│   └── autonomia/
│       ├── constantes.js
│       ├── estado.js
│       ├── executor.js
│       ├── handlers.js
│       ├── index.js
│       └── planejador.js
│
├── ChatVRM/
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   │   ├── modelos VRM
│   │   ├── animações VRMA
│   │   └── imagens
│   │
│   └── src/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       └── pages/
│
├── Artes/
│
└── chroma_db/
```

A estrutura acima representa os componentes relevantes encontrados no repositório atual.

---

# 🚀 Instalação

## 1. Clonar o repositório

```bash
git clone https://github.com/void222222/Raiden_IA.git
cd Raiden_IA
```

## 2. Criar o ambiente Python

```bash
python3 -m venv venv
source venv/bin/activate
```

## 3. Instalar dependências Python

```bash
pip install -r requirements.txt
```

## 4. Instalar dependências JavaScript da raiz

```bash
npm install
```

## 5. Instalar dependências do ChatVRM

```bash
cd ChatVRM
npm install
cd ..
```

## 6. Configurar o Ollama

O projeto utiliza o modelo base definido no `Modelfile`:

```text
qwen2.5:3b
```

Depois de disponibilizar o modelo:

```bash
ollama create raiden_carioca -f Modelfile
```

O modelo de visão utilizado pelo projeto deve ser configurado de acordo com a configuração atual da instalação.

---

# ▶️ Executando a Raiden

Com o ambiente Python ativado:

```bash
python api_raiden.py
```

ou:

```bash
uvicorn api_raiden:app --host 127.0.0.1 --port 8000
```

A API principal utiliza:

```text
http://127.0.0.1:8000
```

O ChatVRM pode ser executado separadamente dentro de:

```text
ChatVRM/
```

com:

```bash
npm run dev
```

---

# ⚠️ Estado atual

O projeto está em **desenvolvimento ativo**.

Algumas partes já possuem uma implementação funcional e integrada, enquanto outras ainda estão sendo desenvolvidas e corrigidas.

Em especial, o módulo de autonomia Minecraft possui uma arquitetura relativamente grande de planejamento, execução e percepção, mas ainda não deve ser considerado um sistema completamente finalizado.

Portanto, este README documenta a **estrutura e as capacidades presentes no código**, e não apresenta o projeto como um produto final.

---

# 🌐 Recursos externos

Apesar de o projeto ter como objetivo executar grande parte da IA localmente, existem componentes que podem utilizar serviços externos.

Dependendo das funcionalidades utilizadas, podem existir comunicações com:

* serviços de reconhecimento de voz;
* Edge TTS;
* pesquisa na web;
* YouTube;
* LivePix;
* Localtunnel;
* outros serviços necessários pelas integrações.

Portanto:

> **Raiden IA não deve ser descrita como uma aplicação 100% offline em todas as suas funcionalidades atuais.**

O processamento principal do LLM pode ser executado localmente através do Ollama, mas determinadas funcionalidades dependem de serviços externos.

---

# 🔐 Segurança

A aplicação possui endpoints HTTP, WebSockets e integrações que podem receber ou enviar informações.

O próprio backend informa durante a inicialização que o painel local atualmente funciona **sem autenticação**.

Antes de utilizar a aplicação exposta diretamente à Internet, é necessário considerar medidas como:

* autenticação;
* CORS restritivo;
* validação de webhooks;
* HTTPS;
* rate limiting;
* gerenciamento adequado de credenciais;
* proteção dos endpoints;
* logs e monitoramento.

---

# 🛣️ Próximos passos

O projeto continua evoluindo principalmente nas seguintes áreas:

### IA

* evolução da memória;
* melhoria do contexto;
* ferramentas;
* capacidades multimodais;
* integração entre decisões da IA e ações.

### Backend

* refinamento da arquitetura;
* tratamento de erros;
* gerenciamento de processos;
* configuração;
* testes.

### Avatar

* evolução da integração com ChatVRM;
* expressões;
* animações;
* sincronização de fala;
* interface.

### YouTube / Live

* evolução das integrações;
* eventos;
* comandos;
* automações para transmissão.

### Minecraft

* estabilização da conexão;
* percepção;
* planejamento;
* crafting;
* coleta;
* navegação;
* construção;
* combate;
* execução de objetivos;
* integração entre o cérebro da Raiden e o bot;
* correção e expansão da autonomia.

---

# 📌 Filosofia do projeto

A Raiden IA não é apenas um chatbot.

A ideia do projeto é construir uma arquitetura na qual diferentes capacidades possam trabalhar juntas:

```text
IA
│
├── Conversação
├── Memória
├── Visão
├── Voz
├── Avatar
├── Web
├── YouTube
├── LivePix
└── Minecraft
```

O objetivo é que essas capacidades possam funcionar como módulos de um mesmo sistema, compartilhando o núcleo da Raiden em vez de serem projetos completamente independentes.

---

# 👨‍💻 Autor

**Lucas Santos de Araújo**

GitHub:

https://github.com/void222222

Repositório:

https://github.com/void222222/Raiden_IA

---

# 📄 Licença

O projeto principal atualmente não possui uma licença open source definida na raiz do repositório.

O diretório `ChatVRM` possui seu próprio arquivo de licença, portanto a licença desse componente deve ser considerada separadamente.

---
