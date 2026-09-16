"""
⛏ LLM MINECRAFT — RAIDEN

Cérebro estratégico do Minecraft.
O Ollama decide estratégia (definir objetivo,
parar autonomia, ação pontual).

Micro-ações são responsabilidade do autonomia.js.

⚠️ FIX APLICADO:
  Bloco de conclusão no prompt quando
  _minecraft_objetivo_recem_concluido está setado.
"""

import json
import re

from typing import Optional

import httpx

from nucleo.config import (
    MINECRAFT_TIMEOUT_DECISAO,
    MODELO_CONVERSA,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_URL,
)
from nucleo.estado_minecraft import (
    obter_contexto_objetivo_minecraft,
    obter_estado_autonomia_minecraft,
    obter_ultimo_resultado_acao_minecraft,
)
from nucleo.logger import logger


# ⚠️ Referência indireta pra flag.
# O valor real mora em nucleo.estado_minecraft.
def _ler_objetivo_recem_concluido():
    from nucleo import estado_minecraft
    return estado_minecraft.objetivo_recem_concluido


# ============================================================
# 🧠 PENSAR AÇÃO MINECRAFT
# ============================================================

async def pensar_acao_minecraft(
    estado: dict
) -> Optional[dict]:

    if not isinstance(estado, dict):
        return None

    contexto_objetivo = obter_contexto_objetivo_minecraft()

    autonomia_estado = obter_estado_autonomia_minecraft()

    ultimo_resultado = obter_ultimo_resultado_acao_minecraft()

    vida = estado.get("vida")
    fome = estado.get("fome")
    posicao = estado.get("posicao")

    inventario = estado.get("inventario") or []
    if isinstance(inventario, list):
        inventario_resumo = [
            {
                "nome": item.get("nome"),
                "qtd": item.get("quantidade")
            }
            for item in inventario[:15]
            if isinstance(item, dict)
        ]
    else:
        inventario_resumo = []

    entidades = estado.get("entidades") or []
    if isinstance(entidades, list):
        entidades_resumo = [
            {
                "nome": ent.get("nome"),
                "dist": ent.get("distancia"),
                "hostil": ent.get("hostil")
            }
            for ent in entidades[:5]
            if isinstance(ent, dict)
        ]
    else:
        entidades_resumo = []

    obj_atual = autonomia_estado.get("objetivoAtual") or {}
    etapa_atual = autonomia_estado.get("etapaAtual") or {}
    recursos = autonomia_estado.get("recursos") or {}
    acao_atual = autonomia_estado.get("acaoAtual")

    autonomia_rodando = bool(
        autonomia_estado.get("ativa")
    )

    bloco_autonomia = (
        "ESTADO DA AUTONOMIA JS:\n"
        f"- Rodando: {autonomia_rodando}\n"
        f"- Objetivo: {obj_atual.get('nome') or 'nenhum'}\n"
        f"- Etapa: {etapa_atual.get('nome') or 'nenhuma'}\n"
        f"- Ação atual: {acao_atual or 'nenhuma'}\n"
        f"- Madeira: {recursos.get('madeira', 0)}/"
        f"{recursos.get('madeiraNecessaria', 0)}\n"
        f"- Tábuas: {recursos.get('tabuas', 0)}/"
        f"{recursos.get('tabuasNecessarias', 0)}\n"
    )

    # ⚠️ FIX DO BUG: avisa o Ollama que o objetivo
    # anterior terminou e ele precisa definir um novo.
    bloco_conclusao = ""

    concluido = _ler_objetivo_recem_concluido()

    if concluido:
        meta_concluida = concluido.get("meta") or {}
        nome_concluido = (
            meta_concluida.get("nome")
            or meta_concluida.get("id")
            or "objetivo anterior"
        )

        bloco_conclusao = (
            "\n"
            "==================================================\n"
            "⚠️ ATENÇÃO: OBJETIVO ANTERIOR CONCLUÍDO\n"
            "==================================================\n"
            "\n"
            f"Você acabou de concluir: {nome_concluido}\n"
            "\n"
            "Você DEVE escolher UMA destas opções AGORA:\n"
            "\n"
            "1. Definir um NOVO objetivo útil\n"
            "   (ex: fazer picareta de pedra, minerar ferro,\n"
            "   construir uma torre, explorar caverna, etc)\n"
            "\n"
            "2. Mandar 'nenhuma' APENAS se realmente\n"
            "   não há nada útil pra fazer.\n"
            "\n"
            "Não repita o objetivo que você acabou de\n"
            "concluir.\n"
        )

    prompt = f"""
Você é a Raiden jogando Minecraft sozinha.

Você é a MESMA Raiden que conversa com Lucas.
Não é uma segunda IA.
Mantenha sua personalidade carioca.

==================================================
COMO VOCÊ FUNCIONA NO MINECRAFT
==================================================

Você tem DUAS partes trabalhando juntas:

1. O CÉREBRO (você, agora):
   - Decide O QUE fazer.
   - Define objetivos de longo prazo.
   - Pode interromper para agir pontualmente
     (comer, fugir, falar com Lucas).

2. O CORPO (autonomia JS dentro do bot):
   - Executa as etapas do objetivo.
   - Sabe minerar, craftar, construir sozinho.
   - Não precisa que você dê micro-ordens.

Você NÃO precisa dizer "quebre o bloco X".
Você diz "quero construir um abrigo" e o corpo
faz o resto.

==================================================
OBJETIVO ATUAL (memória do Python)
==================================================

{contexto_objetivo}

==================================================
ESTADO DA AUTONOMIA JS (corpo)
==================================================

{bloco_autonomia}
{bloco_conclusao}

==================================================
RESULTADO DA ÚLTIMA AÇÃO QUE VOCÊ MANDOU
==================================================

{ultimo_resultado}

==================================================
ESTADO DO MINECRAFT
==================================================

Vida: {vida}
Fome: {fome}
Posição: {posicao}
Inventário (top 15): {inventario_resumo}
Entidades próximas (top 5): {entidades_resumo}

==================================================
AÇÕES ESTRATÉGICAS DISPONÍVEIS
==================================================

Você só pode escolher UMA destas:

1. Deixar o corpo trabalhar:
{{
  "acao": "nenhuma"
}}

Use quando a autonomia JS já está executando
um objetivo e você quer deixar rolar.

--------------------------------------------------

2. Definir um objetivo novo:

   Formato declarativo (preferido):
   {{
     "acao": "definir_objetivo",
     "id": "picareta_pedra",
     "nome": "Fazer uma picareta de pedra",
     "descricao": "Coletar pedra e madeira e craftar.",
     "itens_necessarios": {{
       "stone_pickaxe": 1
     }}
   }}

   Outro exemplo:
   {{
     "acao": "definir_objetivo",
     "id": "primeiro_abrigo",
     "nome": "Construir um abrigo",
     "descricao": "Encontrar recursos e construir um abrigo.",
     "itens_necessarios": {{
       "oak_planks": 100
     }},
     "construir": {{
       "tipo": "abrigo_simples"
     }}
   }}

   Formato por etapas (compatibilidade):
   {{
     "acao": "definir_objetivo",
     "id": "primeiro_abrigo",
     "nome": "Construir um abrigo",
     "descricao": "Encontrar recursos e construir um abrigo simples.",
     "etapas": [
       "Conseguir madeira",
       "Conseguir recursos básicos",
       "Encontrar local",
       "Construir abrigo"
     ]
   }}

Use quando não há objetivo rodando ou
quando você quer mudar de objetivo.

O corpo JS planeja sozinho como obter cada item.
Você só declara O QUE precisa, não COMO obter.

--------------------------------------------------

3. Iniciar a autonomia (depois de definir objetivo):
{{
  "acao": "iniciar_autonomia"
}}

Use depois de definir_objetivo, se a autonomia
não estiver rodando.

--------------------------------------------------

4. Parar a autonomia:
{{
  "acao": "parar_autonomia",
  "motivo": "fome"
}}

Use se quiser que o corpo pare TUDO agora
(perigo grave, fome crítica, etc).

--------------------------------------------------

5. Ação pontual (fora do objetivo):
{{
  "acao": "usar",
  "nome": "bread"
}}

{{
  "acao": "atacar",
  "nome": "Zombie"
}}

{{
  "acao": "chat",
  "mensagem": "Oi, Lucas."
}}

Use quando precisar interromper a autonomia
por um instante — comer, se defender, falar —
sem parar o objetivo.

==================================================
REGRAS
==================================================

- Retorne SOMENTE JSON válido.
- Não use Markdown.
- Não escreva explicações.
- Se a autonomia JS já está executando bem
  (objetivo definido, recursos crescendo),
  escolha "nenhuma".
- Se a autonomia JS NÃO está rodando e não há
  objetivo, defina um objetivo e mande iniciar.
- Se você está com fome baixa, mande uma ação
  pontual para comer (ex: usar bread).
- Se tem hostil perto e a autonomia JS não está
  reagindo, mande uma ação pontual.
- Não fique definindo o mesmo objetivo toda hora.
- Não invente coordenadas.
- Não invente itens.
- Ao definir objetivo, prefira `itens_necessarios` em
  vez de `etapas`. O corpo JS resolve a cadeia
  (ex: stone_pickaxe → cobblestone + stick → planks → log).
- Só use `etapas` se quiser controle total do fluxo.
- Nunca invente itens que não existem no Minecraft.
"""

    payload = {
        "model": MODELO_CONVERSA,
        "prompt": prompt,
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": 0.3,
            "top_p": 0.85,
            "num_predict": 200
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                OLLAMA_URL,
                json=payload,
                timeout=MINECRAFT_TIMEOUT_DECISAO
            )
            resp.raise_for_status()

            resposta = (
                resp.json()
                .get("response", "")
                .strip()
            )

        if not resposta:
            return None

        resposta_limpa = (
            resposta
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        try:
            decisao = json.loads(resposta_limpa)

        except json.JSONDecodeError:
            match = re.search(
                r"\{.*\}",
                resposta_limpa,
                re.DOTALL
            )

            if not match:
                logger.warning(
                    "⚠️ Raiden retornou decisão "
                    "Minecraft que não é JSON."
                )
                return None

            try:
                decisao = json.loads(match.group(0))

            except json.JSONDecodeError:
                logger.warning(
                    "⚠️ JSON Minecraft não pôde "
                    "ser recuperado."
                )
                return None

        return validar_acao_minecraft(decisao)

    except httpx.TimeoutException:
        logger.warning(
            "⏱️ Decisão Minecraft demorou demais."
        )
        return None

    except Exception as e:
        logger.error(
            f"❌ Erro pensando ação Minecraft: {e}"
        )
        return None


# ============================================================
# ⛏ VALIDAÇÃO
# ============================================================

def validar_acao_minecraft(
    decisao: dict
) -> Optional[dict]:

    """
    Camada de segurança entre o Ollama e o Minecraft.
    """

    if not isinstance(decisao, dict):
        return None

    acao = decisao.get("acao")

    if not isinstance(acao, str):
        return None

    acao = acao.lower().strip()

    acoes_permitidas = {
        "andar",
        "pular",
        "parar",
        "olhar",
        "olhar_direcao",
        "atacar",
        "atacar_proximo",
        "parar_combate",
        "quebrar",
        "colocar",
        "interagir",
        "usar",
        "equipar",
        "desequipar",
        "dropar",
        "ir_para",
        "ir_para_bloco",
        "ir_para_entidade",
        "seguir",
        "parar_navegacao",
        "craftar",
        "construir",
        "chat",
        "definir_objetivo",
        "iniciar_autonomia",
        "parar_autonomia",
        "reiniciar_autonomia",
        "nenhuma"
    }

    if acao not in acoes_permitidas:
        logger.warning(
            f"⚠️ Ação Minecraft bloqueada: {acao}"
        )
        return None

    decisao = dict(decisao)
    decisao["acao"] = acao

    if acao == "andar":

        direcao = str(
            decisao.get("direcao", "frente")
        ).lower().strip()

        if direcao not in {
            "frente", "tras", "esquerda", "direita"
        }:
            return None

        try:
            duracao = float(decisao.get("duracao", 1))
        except (TypeError, ValueError):
            return None

        if not 0.1 <= duracao <= 5:
            return None

        decisao["direcao"] = direcao
        decisao["duracao"] = duracao

    elif acao == "olhar":

        for coordenada in ("x", "y", "z"):
            if not isinstance(
                decisao.get(coordenada),
                (int, float)
            ):
                return None

    elif acao == "olhar_direcao":

        direcao = decisao.get("direcao")

        if not isinstance(direcao, str):
            return None

        if direcao not in {
            "frente", "tras", "esquerda",
            "direita", "cima", "baixo"
        }:
            return None

    elif acao == "atacar":

        nome = decisao.get("nome")

        if not isinstance(nome, str):
            return None

        nome = nome.strip()

        if not nome:
            return None

        decisao["nome"] = nome[:100]

    elif acao in {
        "quebrar", "colocar", "interagir",
        "ir_para", "ir_para_bloco"
    }:

        for coordenada in ("x", "y", "z"):
            if not isinstance(
                decisao.get(coordenada),
                (int, float)
            ):
                return None

        if acao == "colocar":

            nome = decisao.get("nome")

            if not isinstance(nome, str):
                return None

            if not nome.strip():
                return None

            decisao["nome"] = nome.strip()[:100]

    elif acao in {"ir_para_entidade", "seguir"}:

        nome = decisao.get("nome")

        if not isinstance(nome, str):
            return None

        if not nome.strip():
            return None

        decisao["nome"] = nome.strip()[:100]

    elif acao == "equipar":

        nome = decisao.get("nome")

        if not isinstance(nome, str):
            return None

        if not nome.strip():
            return None

        destino = decisao.get("destino", "hand")

        if destino not in {"hand", "off-hand"}:
            return None

        decisao["nome"] = nome.strip()[:100]
        decisao["destino"] = destino

    elif acao == "desequipar":

        destino = decisao.get("destino", "hand")

        if destino not in {"hand", "off-hand"}:
            return None

        decisao["destino"] = destino

    elif acao == "dropar":

        nome = decisao.get("nome")

        if not isinstance(nome, str):
            return None

        if not nome.strip():
            return None

        try:
            quantidade = int(decisao.get("quantidade", 1))
        except (TypeError, ValueError):
            return None

        if not 1 <= quantidade <= 64:
            return None

        decisao["nome"] = nome.strip()[:100]
        decisao["quantidade"] = quantidade

    elif acao == "craftar":

        nome = decisao.get("nome")

        if not isinstance(nome, str):
            return None

        if not nome.strip():
            return None

        try:
            quantidade = int(decisao.get("quantidade", 1))
        except (TypeError, ValueError):
            return None

        if not 1 <= quantidade <= 64:
            return None

        decisao["nome"] = nome.strip()[:100]
        decisao["quantidade"] = quantidade

    elif acao == "construir":

        tipo = decisao.get("tipo")

        if not isinstance(tipo, str):
            return None

        tipos_permitidos = {
            "abrigo_simples", "parede", "piso", "teto"
        }

        if tipo not in tipos_permitidos:
            return None

        decisao["tipo"] = tipo

    elif acao == "chat":

        mensagem = decisao.get("mensagem")

        if not isinstance(mensagem, str):
            return None

        mensagem = mensagem.strip()

        if not mensagem:
            return None

        decisao["mensagem"] = mensagem[:200]

    if acao == "definir_objetivo":

        id_obj = decisao.get("id")
        if not isinstance(id_obj, str) or not id_obj.strip():
            return None

        nome = decisao.get("nome")
        if not isinstance(nome, str) or not nome.strip():
            return None

        descricao = decisao.get("descricao")
        if not isinstance(descricao, str):
            descricao = ""

        itens = decisao.get("itens_necessarios")
        etapas = decisao.get("etapas")

        itens_limpos = None
        if isinstance(itens, dict) and itens:
            itens_limpos = {}
            for k, v in itens.items():
                if not isinstance(k, str) or not k.strip():
                    continue
                try:
                    q = int(v)
                except (TypeError, ValueError):
                    continue
                if q > 0:
                    itens_limpos[k.strip()] = q

            if not itens_limpos:
                itens_limpos = None

        etapas_limpas = None
        if isinstance(etapas, list) and etapas:
            etapas_limpas = [
                str(e).strip()
                for e in etapas
                if isinstance(e, str) and str(e).strip()
            ]
            if not etapas_limpas:
                etapas_limpas = None

        if not itens_limpos and not etapas_limpas:
            return None

        construir = decisao.get("construir")
        construir_limpo = None
        if isinstance(construir, dict):
            tipo = construir.get("tipo")
            if isinstance(tipo, str) and tipo.strip():
                construir_limpo = {"tipo": tipo.strip()}

        decisao["id"] = id_obj.strip()[:100]
        decisao["nome"] = nome.strip()[:200]
        decisao["descricao"] = descricao.strip()[:500]

        if itens_limpos:
            decisao["itens_necessarios"] = itens_limpos
            decisao.pop("etapas", None)
        elif etapas_limpas:
            decisao["etapas"] = etapas_limpas[:20]

        if construir_limpo:
            decisao["construir"] = construir_limpo
        else:
            decisao.pop("construir", None)

    elif acao == "parar_autonomia":

        motivo = decisao.get("motivo", "api")
        if not isinstance(motivo, str):
            motivo = "api"

        decisao["motivo"] = motivo.strip()[:100]

    elif acao in {
        "iniciar_autonomia",
        "reiniciar_autonomia"
    }:
        pass

    return decisao