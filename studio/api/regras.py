"""O registro de regras do Noctis — o único lugar onde elas moram.

Antes disto, as regras eram constantes espalhadas pelo código: três eventos para
firmar, teto de XP, quem pode sobrescrever o quê, o texto que os agentes recebem.
Funcionavam, mas ninguém além de quem escreveu o código sabia quais eram. Um
sistema que exige coisas que o dono não consegue ler não está sob controle dele.

Duas garantias, e o resto é consequência:

  · **Toda regra que o Noctis aplica está aqui.** Se uma regra existir no código
    e não aqui, é defeito.
  · **O valor que o painel mostra é o valor que o código usa.** O código lê desta
    tabela na hora de aplicar — não há cópia em outro lugar para desatualizar.

Regras `fixas` são mostradas mas não se editam: são proteções (a base não se
apaga, repositório não vai para a lixeira) cujo desligamento abriria caminho
para perda de dados.
"""
from __future__ import annotations

import json
from pathlib import Path

_CONFIG: Path | None = None
_cache: dict = {"mtime": None, "valores": {}}


def configurar(raiz: Path) -> None:
    global _CONFIG
    _CONFIG = raiz / "config" / "regras.json"


# ── O catálogo ────────────────────────────────────────────────────────────────
# `onde` diz em que ponto a regra é aplicada, para ninguém ter de adivinhar:
#   servidor  — a API recusa ou calcula
#   protocolo — está escrito no prompt dos agentes
#   cli       — o comando que os agentes rodam cobra ou avisa
#   nocturn   — vira achado na ronda do supervisor

AREAS = [
    ("protocolo",   "Protocolo dos agentes", "o que todo agente é obrigado a fazer, e em que momento"),
    ("habilidades", "Habilidades",           "como uma habilidade nasce, se funde e quem pode mexer nela"),
    ("xp",          "XP e níveis",           "quanto cada trabalho vale e quanto custa subir de nível"),
    ("aprendizado", "Aprendizado",           "como uma hipótese do agente vira conhecimento validado por você"),
    ("nocturn",     "Supervisão",            "o que o NOCTURN cobra, e a partir de quando"),
    ("protecoes",   "Proteções",             "o que o Noctis nunca deixa acontecer"),
]

CATALOGO: list[dict] = [
    # ── Protocolo ─────────────────────────────────────────────────────────────
    {"id": "protocolo.auto_instalar", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Instalar o protocolo em todo agente salvo",
     "faz": "Todo agente criado ou editado pelo Noctis sai com o bloco de protocolo no system_prompt.",
     "porque": "Sem isso, o sistema depende de alguém lembrar de rodar o instalador — e um agente sem protocolo não registra trabalho nem lê o que foi aprendido.",
     "onde": ["servidor"]},
    {"id": "protocolo.consultar_ao_comecar", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Consultar o repertório antes de começar",
     "faz": "O protocolo manda o agente rodar --consultar com o assunto da tarefa antes de agir.",
     "porque": "É a metade que deixa o trabalho mais barato: não reaprender o que outro agente já pagou para aprender.",
     "onde": ["protocolo"]},
    {"id": "protocolo.registrar_trabalho", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Registrar o trabalho ao terminar",
     "faz": "O protocolo manda o agente registrar o que fez (tipo, resumo, evidência, dificuldade). É o que gera XP.",
     "porque": "Sem registro não há XP, não há histórico, e o NOCTURN não sabe quem está trabalhando.",
     "onde": ["protocolo"]},
    {"id": "protocolo.declarar_habilidades", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Agentes declaram e escrevem habilidades",
     "faz": "Liga -s, --nova e --anotar: o agente nomeia habilidades ao registrar trabalho e escreve o texto delas. Desligado, o protocolo não fala disso e o servidor recusa as três operações — o trabalho continua sendo registrado e continua gerando XP.",
     "porque": "É a chave para pausar a escrita enquanto o formato de habilidade é redefinido, sem parar o registro de trabalho.",
     "onde": ["protocolo", "servidor"]},

    # ── Habilidades ───────────────────────────────────────────────────────────
    {"id": "habilidades.usar_firmar", "area": "habilidades", "tipo": "bool", "padrao": True,
     "titulo": "Separar broto de habilidade firmada",
     "faz": "Uma habilidade só conta cheio na aptidão depois de exercitada N vezes no projeto; antes disso é broto e pesa 0,45.",
     "porque": "Filtro contra ruído num vocabulário sem critério. Com um formato de habilidade bem definido, pode ser dispensável.",
     "onde": ["servidor"]},
    {"id": "habilidades.eventos_para_firmar", "area": "habilidades", "tipo": "int", "padrao": 3,
     "min": 1, "max": 20,
     "titulo": "Eventos para firmar",
     "faz": "Quantas vezes o projeto precisa exercitar uma habilidade para ela deixar de ser broto.",
     "porque": "Separa algo feito uma vez de algo que se repete.",
     "onde": ["servidor"], "depende": "habilidades.usar_firmar"},
    {"id": "habilidades.limiar_fusao", "area": "habilidades", "tipo": "float", "padrao": 0.82,
     "min": 0.6, "max": 1.0, "passo": 0.01,
     "titulo": "Semelhança para fundir nomes sozinho",
     "faz": "Dois nomes com semelhança igual ou maior que isto viram a mesma habilidade automaticamente, e o nome novo vira apelido.",
     "porque": "Impede que \"diagramação SVG\" e \"diagramas em SVG\" virem duas coisas que nunca sobem de nível. Alto demais deixa duplicatas passarem; baixo demais funde coisas diferentes.",
     "onde": ["servidor"]},
    {"id": "habilidades.faixa_parecidas", "area": "habilidades", "tipo": "float", "padrao": 0.68,
     "min": 0.4, "max": 0.95, "passo": 0.01,
     "titulo": "Semelhança para sugerir fusão",
     "faz": "Entre este valor e o limiar de fusão, os nomes não se fundem sozinhos, mas o NOCTURN aponta como possível duplicata.",
     "porque": "A faixa que o casamento automático deixa passar e precisa de olho humano.",
     "onde": ["nocturn", "servidor"]},
    {"id": "habilidades.curadoria_protegida", "area": "habilidades", "tipo": "bool", "padrao": True,
     "titulo": "Agente não sobrescreve texto que você editou",
     "faz": "Descrição editada por você fica marcada como curada; escrita de agente sobre ela é ignorada. Texto de agente pode ser melhorado por outro agente.",
     "porque": "Curadoria não pode ser desfeita por um despacho.",
     "onde": ["servidor"]},
    {"id": "habilidades.skills_nativas_intocaveis", "area": "habilidades", "tipo": "bool", "padrao": True,
     "fixa": True,
     "titulo": "Agentes só mexem em skills criadas pelo Noctis",
     "faz": "Skills nativas do Claude e qualquer skill sua fora do Noctis nunca são criadas, editadas ou apagadas por agente nem pelo exportador.",
     "porque": "O Noctis não pode sobrescrever ferramenta que não é dele. Decisão de 18/09.",
     "onde": ["protocolo"],
     "estado": "valerá integralmente quando a exportação para SKILL.md existir; hoje o Noctis não escreve em pasta de skill nenhuma"},

    # ── Aprendizado ───────────────────────────────────────────────────────────
    {"id": "aprendizado.evidencias_minimas", "area": "aprendizado", "tipo": "int", "padrao": 2,
     "min": 1, "max": 10,
     "titulo": "Observações mínimas para propor uma hipótese",
     "faz": "O agente só pode propor uma generalização apontando ao menos este número de observações registradas.",
     "porque": "Observação isolada não é padrão. Sem este corte, a primeira coincidência vira regra do projeto.",
     "onde": ["servidor", "protocolo"]},
    {"id": "aprendizado.confianca_para_promover", "area": "aprendizado", "tipo": "float",
     "padrao": 0.7, "min": 0.3, "max": 0.95, "passo": 0.05,
     "titulo": "Confiança para o aprendizado valer sozinho",
     "faz": "Abaixo desta confiança o aprendizado aparece marcado como frágil e pede mais evidência antes de ser injetado nos despachos.",
     "porque": "Aprendizado fraco tratado como certo é pior do que aprendizado nenhum: ele desloca a decisão sem aviso.",
     "onde": ["servidor", "nocturn"]},
    {"id": "aprendizado.no_protocolo", "area": "aprendizado", "tipo": "bool", "padrao": True,
     "titulo": "Pedir observação e hipótese aos agentes",
     "faz": "O protocolo instrui o agente a registrar o que observou nos domínios e a propor hipótese quando houver evidência bastante — e a citar qual aprendizado aplicou ao fechar o trabalho.",
     "porque": "Sem isto o loop existe e ninguém alimenta: foi exatamente o que aconteceu com as habilidades, que ficaram vazias porque nada no prompt as pedia.",
     "onde": ["protocolo", "cli"]},
    {"id": "aprendizado.agente_nunca_conclui", "area": "aprendizado", "tipo": "bool",
     "padrao": True, "fixa": True,
     "titulo": "Agente propõe, você conclui",
     "faz": "Agente registra observação e propõe hipótese. Aprendizado só nasce da sua resposta — e em 'corrigir' vale o texto que você escreveu, não o dele.",
     "porque": "O humano define significado; o agente descobre padrões. Foi a decisão de 18/09, e é o que impede o sistema de aprender a coisa errada com confiança alta.",
     "onde": ["servidor", "protocolo"]},

    # ── XP ────────────────────────────────────────────────────────────────────
    {"id": "xp.base_por_tipo", "area": "xp", "tipo": "mapa", "padrao": {
        "entrega": 60, "output": 25, "correcao": 20, "revisao": 15, "memoria": 15, "decisao": 10, "retrabalho": 0},
     "min": 0, "max": 500,
     "titulo": "XP base por tipo de trabalho",
     "faz": "O ponto de partida de cada registro, antes dos multiplicadores.",
     "porque": "Revisão e decisão têm valor próprio para o agente que orienta, e não produz, não ficar para sempre no nível 1.",
     "onde": ["servidor"]},
    {"id": "xp.dificuldade", "area": "xp", "tipo": "mapa", "padrao": {"baixa": 1.0, "media": 1.3, "alta": 1.7},
     "min": 0.1, "max": 5, "passo": 0.05,
     "titulo": "Multiplicador por dificuldade",
     "faz": "A dificuldade declarada no registro multiplica o XP.",
     "porque": "Trabalho difícil e fácil não podem valer igual.",
     "onde": ["servidor"]},
    {"id": "xp.mult_confirmado", "area": "xp", "tipo": "float", "padrao": 1.25, "min": 1.0, "max": 3.0, "passo": 0.05,
     "titulo": "Bônus de entrega confirmada",
     "faz": "Quando alguém confirma a entrega, o XP dela é multiplicado por isto.",
     "porque": "Trabalho revisado vale mais que trabalho só declarado.",
     "onde": ["servidor"]},
    {"id": "xp.mult_descoberta", "area": "xp", "tipo": "float", "padrao": 1.35, "min": 1.0, "max": 3.0, "passo": 0.05,
     "titulo": "Bônus de habilidade nova",
     "faz": "A primeira vez que um agente exercita uma habilidade, o XP do registro é multiplicado por isto.",
     "porque": "Aprender algo novo vale mais que repetir.",
     "onde": ["servidor"]},
    {"id": "xp.teto_por_evento", "area": "xp", "tipo": "int", "padrao": 180, "min": 10, "max": 2000,
     "titulo": "Teto de XP por registro",
     "faz": "Nenhum registro vale mais que isto, somados todos os multiplicadores.",
     "porque": "Rede de segurança contra um registro absurdo; não deveria ser atingido no uso normal.",
     "onde": ["servidor"]},
    {"id": "xp.saturacao_diaria", "area": "xp", "tipo": "int", "padrao": 3, "min": 1, "max": 50,
     "titulo": "Repetições no mesmo dia antes de render menos",
     "faz": "A partir do registro seguinte a este número, a mesma habilidade no mesmo dia rende metade.",
     "porque": "Repetir a mesma coisa dez vezes num dia não é aprender dez vezes.",
     "onde": ["servidor"]},
    {"id": "xp.curva_agente", "area": "xp", "tipo": "curva", "padrao": [100.0, 1.7],
     "titulo": "Curva de nível do agente",
     "faz": "XP acumulado para o nível n = base × n^expoente. Não há nível máximo.",
     "porque": "Cada nível custa mais que o anterior: 40 entregas precisam parecer diferentes de 4.",
     "onde": ["servidor"]},
    {"id": "xp.curva_skill", "area": "xp", "tipo": "curva", "padrao": [40.0, 1.6],
     "titulo": "Curva de nível de habilidade",
     "faz": "XP de uma habilidade para o nível n = base × n^expoente.",
     "porque": "Mais barata que a do agente: a habilidade sobe antes, e é isso que mostra em que o agente é bom.",
     "onde": ["servidor"]},

    # ── Supervisão ────────────────────────────────────────────────────────────
    {"id": "nocturn.dias_para_ocioso", "area": "nocturn", "tipo": "int", "padrao": 14, "min": 1, "max": 365,
     "titulo": "Dias sem trabalho para agente parado",
     "faz": "Agente que não registra trabalho há mais que isto entra na ronda como parado.",
     "porque": "Agente parado é time que você acha que tem e não tem.",
     "onde": ["nocturn"]},
    {"id": "nocturn.dias_para_cobrar_confirmacao", "area": "nocturn", "tipo": "int", "padrao": 2, "min": 0, "max": 60,
     "titulo": "Dias até cobrar confirmação",
     "faz": "Entrega sem confirmação há mais que isto vira achado na ronda.",
     "porque": "Entrega que ninguém revisa fica sem o bônus e sem revisor.",
     "onde": ["nocturn"]},

    # ── Proteções ─────────────────────────────────────────────────────────────
    {"id": "protecoes.base_permanente", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "A base de conhecimento não se apaga nem se renomeia",
     "faz": "O projeto `noctis` recusa exclusão e renomeação.",
     "porque": "É o chão dos outros projetos; perder a base é perder o que eles compartilham.",
     "onde": ["servidor"]},
    {"id": "protecoes.repositorios", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "Repositório de código não é projeto do Noctis",
     "faz": "Pasta em projects/ com .git e sem project.yaml aparece na lista, mas o Noctis não move nem apaga.",
     "porque": "Mandar o repositório do site para a lixeira o arrancaria do lugar onde o resto do trabalho o procura.",
     "onde": ["servidor"]},
    {"id": "protecoes.lixeira", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "Excluir projeto manda para a lixeira",
     "faz": "Só \"apagar de vez\", na lixeira, remove um projeto do disco.",
     "porque": "Um clique não pode apagar meses de trabalho sem volta.",
     "onde": ["servidor"]},
    {"id": "protecoes.log_append_only", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "O histórico de trabalho só cresce",
     "faz": "Confirmação, fusão e destruição entram como registros novos; nenhum registro antigo é reescrito.",
     "porque": "É o que permite recalcular tudo quando uma regra muda sem perder a história.",
     "onde": ["servidor"]},
]

_POR_ID = {r["id"]: r for r in CATALOGO}


# ── Leitura e escrita ─────────────────────────────────────────────────────────

def _valores_salvos() -> dict:
    if not _CONFIG or not _CONFIG.exists():
        return {}
    mtime = _CONFIG.stat().st_mtime
    if _cache["mtime"] != mtime:
        try:
            _cache["valores"] = json.loads(_CONFIG.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            _cache["valores"] = {}
        _cache["mtime"] = mtime
    return _cache["valores"]


def valor(rid: str):
    """O valor que o código deve usar AGORA. É a única forma de ler uma regra."""
    r = _POR_ID[rid]
    if r.get("fixa"):
        return r["padrao"]
    salvo = _valores_salvos().get(rid)
    if salvo is None:
        return r["padrao"]
    if r["tipo"] == "mapa":
        return {**r["padrao"], **salvo}
    return salvo


def _validar(r: dict, v):
    t = r["tipo"]
    if t == "bool":
        return bool(v)
    if t in ("int", "float"):
        n = int(v) if t == "int" else float(v)
        return max(r.get("min", n), min(r.get("max", n), n))
    if t == "mapa":
        if not isinstance(v, dict):
            raise ValueError("esperado um mapa de valores")
        out = {}
        for k in r["padrao"]:
            if k in v:
                n = float(v[k])
                out[k] = max(r.get("min", n), min(r.get("max", n), n))
        return out
    if t == "curva":
        base, expo = float(v[0]), float(v[1])
        return [max(1.0, min(10000.0, base)), max(1.0, min(4.0, expo))]
    raise ValueError(f"tipo desconhecido: {t}")


def definir(rid: str, v) -> dict:
    r = _POR_ID.get(rid)
    if not r:
        raise KeyError(rid)
    if r.get("fixa"):
        raise PermissionError(rid)
    valores = dict(_valores_salvos())
    valores[rid] = _validar(r, v)
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(valores, ensure_ascii=False, indent=2), encoding="utf-8")
    _cache["mtime"] = None
    return listar_uma(rid)


def restaurar(rid: str) -> dict:
    valores = dict(_valores_salvos())
    valores.pop(rid, None)
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(valores, ensure_ascii=False, indent=2), encoding="utf-8")
    _cache["mtime"] = None
    return listar_uma(rid)


def listar_uma(rid: str) -> dict:
    r = _POR_ID[rid]
    atual = valor(rid)
    return {**r, "valor": atual, "alterada": (not r.get("fixa")) and atual != r["padrao"]}


def listar() -> dict:
    return {"areas": [{"id": i, "titulo": t, "desc": d} for i, t, d in AREAS],
            "regras": [listar_uma(r["id"]) for r in CATALOGO]}
