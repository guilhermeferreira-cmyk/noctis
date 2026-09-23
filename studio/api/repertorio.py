"""O repertório de Learnings do projeto.

Antes disto, Learning era texto solto dentro dos eventos: dois agentes
escrevendo o mesmo nome de formas diferentes tinham dois Learnings de mundos
separados, e perguntar "quem sabe diagramar?" era perguntar por uma string.
Aqui ela ganha identidade — um id, um rótulo, apelidos, uma descrição.

A divisão de verdades segue a que o Noctis já usa:

    resources.json          o que o recurso é
    canvases/*.json         onde ele está
    skills.json             o que o Learning é      ← este arquivo
    skills/<id>.md          o que se aprendeu nela
    progresso/eventos.jsonl o que aconteceu

O log continua mandando no XP; o repertório manda no nome. Nenhum dos dois
reescreve o outro, e é isso que evita duas fontes brigando.

Quem descreve é quem aprendeu: o agente, no mesmo comando em que registra o
trabalho. Ele acabou de exercitar aquilo e tem o contexto inteiro; esperar que
uma pessoa descreva depois é pôr o gargalo mais caro do sistema no caminho de
cada Learning que nasce.

O que se protege é a CURADORIA, não o campo. Texto que a pessoa editou fica
marcado como curado e agente nenhum passa por cima; texto escrito por agente
pode ser melhorado por outro agente, que é justamente o que se quer.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import progresso as prog
import regras

# Um Learning firma quando o PROJETO a exercitou três vezes — por quem for.
# O corte é sobre o termo ser real, não sobre quem o praticou: a maestria de
# cada agente já está no nível dele.
EVENTOS_PARA_FIRMAR = 3
ESTADOS = ("broto", "firmada", "arquivada")

# O que cabe no repertório: qualquer coisa que o trabalho dos agentes deixe e
# volte a servir. A `pergunta` de cada espécie é o que se cobra de quem escreve —
# perguntar "o que é isto?" para uma armadilha rende definição; perguntar "o que
# dá errado?" rende o aprendizado.
ESPECIES = {
    "competencia": {"label": "Competência", "icone": "GiSkills", "cor": "#10b981",
                    "desc": "o que o agente sabe fazer",
                    "pergunta": "o que ele sabe fazer, em uma frase"},
    "armadilha":   {"label": "Armadilha", "icone": "GiStoneCrafting", "cor": "#f59e0b",
                    "desc": "o que dá errado, e como contornar",
                    "pergunta": "o que dá errado e como se contorna"},
    "metodo":      {"label": "Método", "icone": "GiPathDistance", "cor": "#3b82f6",
                    "desc": "a receita que funcionou",
                    "pergunta": "os passos que funcionaram"},
    "ferramenta":  {"label": "Ferramenta", "icone": "GiSpanner", "cor": "#a78bfa",
                    "desc": "domínio de uma ferramenta específica",
                    "pergunta": "o que essa ferramenta faz bem e onde ela trai"},
    "padrao":      {"label": "Padrão", "icone": "GiStamper", "cor": "#ec4899",
                    "desc": "a decisão que virou regra",
                    "pergunta": "a regra, e por que ela existe"},
    "dominio":     {"label": "Domínio", "icone": "GiBrain", "cor": "#06b6d4",
                    "desc": "o que se sabe do assunto ou do cliente",
                    "pergunta": "o que se sabe do assunto que não está em lugar nenhum"},
}
ESPECIE_PADRAO = "competencia"

# -- Natureza e tags ----------------------------------------------------------
#
# A UNICA classificacao rigida e a natureza, porque ela muda o que o sistema faz
# com o Learning -- e nao como ela se organiza:
#
#   procedimento  o passo a passo que a pessoa escreve e que se exporta como
#                 SKILL.md para o Claude Code dos agentes
#   dominio       assunto vivo, com plano de aprendizado: acumula hipoteses,
#                 abre perguntas e so vira aprendizado quando a pessoa valida
#
# Todo o resto e TAG, livre. Categoria fixa obriga a escolher uma gaveta quando
# o Learning cabe em tres, e a lista envelhece: "verificacao" e "construcao"
# valem juntas. O vocabulario nasce do uso -- as tags que ja existem sao
# sugeridas antes de deixar criar uma nova --, e duas travas o mantem amplo:
#
#   1. nome proprio nao entra (projeto, cliente, arquivo): isso e memoria
#   2. agente nenhum cria tag; ele so usa as que a pessoa ja criou
ESPECIES_COMO_TAG = {"armadilha": "armadilha", "metodo": "metodo", "padrao": "padrao",
                     "ferramenta": "ferramenta", "dominio": "dominio"}
# A divisão procedimento/domínio existiu por dois dias e caiu: "poderia ser os
# dois". Todo Learning tem passos e sensibilidade, em proporções diferentes.
# O dicionário fica vazio de propósito — as telas antigas leem dele sem quebrar,
# e nada mais pergunta por natureza.
NATUREZAS: dict = {}
# Nascer SEM rumo é o normal: o dono digita o nome e o Noctis descobre o resto
# perguntando (enquadramento.py). Escolher numa tela era formulário, e ele
# recusou formulário — "eu só quero digitar um Learning para eles aprenderem".
NATUREZA_PADRAO = ""

def _max_tags() -> int:
    return regras.valor("learning.max_tags")


def normalizar_tag(t: str) -> str:
    """Tag e minuscula e enxuta: "Verificacao " e "verificacao" sao a mesma."""
    return " ".join(str(t or "").strip().lower().split())[:32]


def _nomes_proprios(base: Path) -> set:
    """Nomes que nao podem virar tag: os projetos e os recursos deste projeto.

    Uma tag com nome de projeto, cliente ou arquivo nao agrupa nada -- ela so
    repete onde a coisa aconteceu, e isso e trabalho da memoria.
    """
    nomes = set()
    raiz = base.parent
    if raiz.exists():
        for d in raiz.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                nomes.add(normalizar_tag(d.name.replace("_", " ").replace("-", " ")))
                nomes.add(normalizar_tag(d.name))
    rec = base / "resources.json"
    if rec.exists():
        try:
            for _kind, itens in (json.loads(rec.read_text(encoding="utf-8")) or {}).items():
                for nome, meta in (itens or {}).items():
                    nomes.add(normalizar_tag(nome.replace("_", " ")))
                    if isinstance(meta, dict) and meta.get("title"):
                        nomes.add(normalizar_tag(meta["title"]))
        except (json.JSONDecodeError, AttributeError):
            pass
    return {n for n in nomes if n}


def tags_do_projeto(base: Path) -> list:
    """O vocabulario de tags com a contagem de uso -- o que a tela sugere.

    Tag usada uma vez so aparece como solta: e candidata a fundir ou renomear,
    e e assim que o vocabulario se limpa sem lista fechada.
    """
    rep = carregar(base)
    contagem = {}
    for d in rep.values():
        for tg in d.get("tags") or []:
            contagem[tg] = contagem.get(tg, 0) + 1
    return [{"tag": tg, "usos": n, "solta": n < 2}
            for tg, n in sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))]


def validar_tags(base: Path, tags, autor: str = "usuario") -> list:
    """Limpa, corta e recusa. Erro aqui e ValueError com o motivo em portugues."""
    limpas = []
    proprios = _nomes_proprios(base)
    existentes = {x["tag"] for x in tags_do_projeto(base)}
    de_agente = autor not in ("usuario", "")
    for bruta in (tags or []):
        tg = normalizar_tag(bruta)
        if not tg or tg in limpas:
            continue
        if len(tg) < 3:
            raise ValueError("a tag '%s' e curta demais para agrupar algo" % tg)
        if tg in proprios:
            raise ValueError(
                "'%s' e nome proprio (projeto, recurso ou arquivo) - isso e memoria, "
                "nao tag de Learning" % tg)
        if de_agente and tg not in existentes:
            raise ValueError("agente nao cria tag: '%s' ainda nao existe no projeto" % tg)
        limpas.append(tg)
    return limpas[:_max_tags()]


def renomear_tag(base: Path, de: str, para: str) -> int:
    """Renomeia em todos os Learnings. `para` que ja existe e fusao."""
    de, para = normalizar_tag(de), normalizar_tag(para)
    if not de or not para:
        raise ValueError("informe as duas tags")
    if para not in {x["tag"] for x in tags_do_projeto(base)}:
        validar_tags(base, [para])
    rep = carregar(base)
    n = 0
    for d in rep.values():
        tags = d.get("tags") or []
        if de in tags:
            d["tags"] = list(dict.fromkeys([para if x == de else x for x in tags]))
            n += 1
    salvar(base, rep)
    return n


def apagar_tag(base: Path, tag: str) -> int:
    tag = normalizar_tag(tag)
    rep = carregar(base)
    n = 0
    for d in rep.values():
        tags = d.get("tags") or []
        if tag in tags:
            d["tags"] = [x for x in tags if x != tag]
            n += 1
    salvar(base, rep)
    return n


def _caminho(base: Path) -> Path:
    return base / "skills.json"


def corpo_path(base: Path, chave: str) -> Path:
    """O markdown do Learning. `Path(chave).name` corta qualquer `..` da URL."""
    d = base / "skills"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{Path(chave).name}.md"


def ler_corpo(base: Path, chave: str) -> str:
    p = corpo_path(base, chave)
    return p.read_text(encoding="utf-8") if p.exists() else ""


def escrever_corpo(base: Path, chave: str, texto: str) -> str:
    corpo_path(base, chave).write_text(texto, encoding="utf-8")
    return texto


def anexar_ao_corpo(base: Path, chave: str, texto: str, autor: str) -> str:
    """Acrescenta um trecho assinado, sem apagar o que já estava.

    Acumular é o ponto: cada agente que passa por aquelo Learning deixa o que
    descobriu, e o documento cresce. Substituir o corpo inteiro é uma operação
    de curadoria — e essa é sua, pelo drawer.
    """
    atual = ler_corpo(base, chave)
    from datetime import date
    bloco = f"## {date.today():%d/%m/%Y} · {autor}\n\n{texto.strip()}\n"
    novo = (atual.rstrip() + "\n\n" + bloco) if atual.strip() else bloco
    return escrever_corpo(base, chave, novo)


def carregar(base: Path) -> dict:
    p = _caminho(base)
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def salvar(base: Path, dados: dict) -> None:
    _caminho(base).write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


def _nova(rotulo: str, quando: str, autor: str, especie: str = ESPECIE_PADRAO,
          natureza: str = NATUREZA_PADRAO, tags: list | None = None) -> dict:
    return {"rotulo": rotulo, "descricao": "", "aliases": [], "estado": "broto",
            "natureza": natureza if natureza in NATUREZAS else NATUREZA_PADRAO,
            "tags": tags or [],
            "especie": especie if especie in ESPECIES else ESPECIE_PADRAO,
            "nasceu_em": (quando or "")[:10] or date.today().isoformat(),
            "nasceu_de": autor, "vinculados": []}


def orfas(base: Path) -> list[dict]:
    """Nomes de Learning citados em eventos que não existem no repertório.

    É o que sobra quando o agente cita algo que você nunca criou. Não é erro
    dele: é matéria para você decidir se aquilo merece ser um Learning.
    """
    rep = carregar(base)
    idx = indice(rep)
    mortas = prog.destruidas(base)
    vistos: dict[str, dict] = {}
    for r in prog.ler_log(base):
        if r.get("registro") != "evento":
            continue
        for rotulo in r.get("habilidades", []):
            s = prog.slug(rotulo)
            if not s or s in idx or s in mortas:
                continue
            d = vistos.setdefault(s, {"chave": s, "rotulo": rotulo, "citacoes": 0,
                                      "agentes": [], "ultima": None})
            d["citacoes"] += 1
            if r.get("agente") and r["agente"] not in d["agentes"]:
                d["agentes"].append(r["agente"])
            d["ultima"] = r.get("quando")
    return sorted(vistos.values(), key=lambda d: -d["citacoes"])


def firmadas(rep: dict) -> set:
    """Os ids já firmados — o card do agente usa isto para separar broto de skill."""
    return {c for c, d in rep.items() if d.get("estado") == "firmada"}


def indice(rep: dict) -> dict:
    """Mapa apelido → id canônico, para o casamento valer entre agentes."""
    idx = {}
    for chave, d in rep.items():
        idx[chave] = chave
        for a in d.get("aliases", []):
            idx[a] = chave
    return idx


def sincronizar(base: Path) -> dict:
    """Lê o log e garante uma entrada de repertório para cada nome declarado.

    É idempotente e barato: o repertório nasce do que já aconteceu, sem inventar
    nada. Chamado depois de cada evento e ao abrir a página.
    """
    rep = carregar(base)
    idx = indice(rep)
    mudou = False
    mortas = prog.destruidas(base)

    # Fusões registradas no log valem aqui também: o destino absorve o apelido.
    for r in prog.ler_log(base):
        if r.get("registro") == "fusao":
            destino = r.get("para")
            if destino and destino in rep:
                for origem in r.get("de", []):
                    if origem != destino and origem not in rep[destino]["aliases"]:
                        rep[destino]["aliases"].append(origem)
                        mudou = True
                    if origem in rep:
                        del rep[origem]
                        mudou = True
            continue
        if r.get("registro") != "evento":
            continue
        for rotulo in r.get("habilidades", []):
            s = prog.slug(rotulo)
            if not s or s in idx or s in mortas:
                continue
            # Nome novo citado num evento. Se ele PARECE um Learning que já
            # existe, entra como apelido dela — isso é casamento, não criação.
            parente = prog.casar_habilidade(rotulo, {k: {"aliases": v.get("aliases", [])}
                                                     for k, v in rep.items()})
            if parente:
                rep[parente]["aliases"].append(s)
                idx = indice(rep)
                mudou = True
                continue
            # Sem parente: NÃO abre entrada. Quem crio Learning é o dono.
            # O nome fica como citação órfã (`orfas()`), e o NOCTURN a traz na
            # ronda para ele decidir: criar, apelidar de outra, ou ignorar.
            if not regras.valor("learning.so_o_dono_cria"):
                rep[s] = _nova(rotulo, r.get("quando", ""), r.get("agente", ""))
                idx = indice(rep)
                mudou = True

    # Contagem de eventos por Learning decide quem firma sozinha.
    contagem: dict[str, int] = {}
    for r in prog.ler_log(base):
        if r.get("registro") != "evento":
            continue
        for rotulo in r.get("habilidades", []):
            chave = idx.get(prog.slug(rotulo))
            if chave:
                contagem[chave] = contagem.get(chave, 0) + 1
    for chave, d in rep.items():
        if d.get("estado") == "arquivada":
            continue
        novo = "firmada" if (not regras.valor("learning.usar_firmar")
                             or contagem.get(chave, 0) >= regras.valor("learning.eventos_para_firmar")) \
            else "broto"
        # Só sobe sozinha. Quem firmou na mão não volta a ser broto.
        if novo == "firmada" and d.get("estado") != "firmada":
            d["estado"] = novo
            mudou = True
        elif d.get("estado") not in ESTADOS:
            d["estado"] = novo
            mudou = True

    # A especie deixou de ser identidade: ela desce para tag, que e onde este
    # tipo de informacao se combina com outras. A natureza e escolha sua, e o
    # padrao e procedimento -- dominio se declara.
    for d in rep.values():
        if "natureza" not in d:
            d["natureza"] = "dominio" if d.get("especie") == "dominio" else ""
            mudou = True
        if "tags" not in d:
            vinda = ESPECIES_COMO_TAG.get(d.get("especie", ""))
            d["tags"] = [vinda] if vinda else []
            mudou = True

    if mudou:
        salvar(base, rep)
    return rep


def criar(base: Path, rotulo: str, descricao: str = "",
          especie: str = ESPECIE_PADRAO, autor: str = "usuario",
          natureza: str = NATUREZA_PADRAO, tags: list | None = None) -> dict:
    """Abre um Learning à mão.

    Nem todo aprendizado nasce de despacho: "Armadilhas do Figma via MCP" foi
    aprendido apanhando, e só depois alguém o exercitou. Um Learning assim
    nasce sem portador e sem XP — e está certo: o texto existe, o exercício
    ainda não. O texto mora no corpo dela, como em todo Learning.
    """
    rep = carregar(base)
    chave = prog.slug(rotulo)
    if not chave:
        raise ValueError("nome inválido")
    if chave in rep:
        raise KeyError(chave)
    rep[chave] = {**_nova(rotulo.strip()[:80], "", autor, especie, natureza,
                          validar_tags(base, tags, autor)),
                  "descricao": descricao.strip()[:600],
                  "descricao_por": autor, "curada": autor == "usuario"}
    salvar(base, rep)
    return {**rep[chave], "chave": chave}


def atualizar(base: Path, chave: str, patch: dict, autor: str = "usuario") -> dict:
    """Muda o Learning. `autor` decide se o texto vira curadoria ou não.

    Escrita de agente não sobrescreve o que a pessoa curou — é a única trava, e
    ela existe para o trabalho de curadoria não ser desfeito por um despacho.
    """
    rep = carregar(base)
    if chave not in rep:
        raise KeyError(chave)
    d = rep[chave]
    if "rotulo" in patch and str(patch["rotulo"]).strip():
        d["rotulo"] = str(patch["rotulo"]).strip()[:80]
    if "descricao" in patch:
        curada = bool(d.get("curada")) and regras.valor("learning.curadoria_protegida")
        de_agente = autor not in ("usuario", "")
        if not (curada and de_agente):
            d["descricao"] = str(patch["descricao"]).strip()[:600]
            d["descricao_por"] = autor or "usuario"
            d["curada"] = not de_agente
    if patch.get("estado") in ESTADOS:
        d["estado"] = patch["estado"]
    if patch.get("especie") in ESPECIES:
        d["especie"] = patch["especie"]
    if patch.get("natureza") in NATUREZAS:
        d["natureza"] = patch["natureza"]
    if "corpo_curado" in patch:
        d["corpo_curado"] = bool(patch["corpo_curado"])
    if isinstance(patch.get("enquadramento"), dict):
        # O valor é a LISTA de teses marcadas — `str()` aqui viraria o repr da
        # lista, e o documento saía soletrado, caractere por caractere.
        d["enquadramento"] = {
            str(k)[:40]: ([str(x)[:300] for x in v][:12] if isinstance(v, list) else [str(v)[:300]])
            for k, v in patch["enquadramento"].items()}
    if "tags" in patch:
        d["tags"] = validar_tags(base, patch["tags"], autor)
    if "cor" in patch:
        d["cor"] = str(patch["cor"])[:9]
    if "icone" in patch:
        d["icone"] = str(patch["icone"])[:60]
    salvar(base, rep)
    return d


def vincular(base: Path, chave: str, agente: str, ligado: bool) -> dict:
    """Vínculo declarado: 'este agente deve ter isto', sem XP nenhum.

    É diferente de exercitada, que nasce de evento e traz experiência junto.
    Misturar as duas inventaria um passado que não houve.
    """
    rep = carregar(base)
    if chave not in rep:
        raise KeyError(chave)
    v = rep[chave].setdefault("vinculados", [])
    if ligado and agente not in v:
        v.append(agente)
    if not ligado and agente in v:
        v.remove(agente)
    salvar(base, rep)
    return rep[chave]


def detalhe(base: Path, chave: str) -> dict:
    """Um Learning inteira: quem a exercita, o que se aprendeu, e quando.

    Inclui os eventos que a citaram — é neles que está a história concreta, e é
    o que separa "nível 3" de "subiu para 3 fazendo estas quatro coisas".
    """
    v = visao(base)
    s = v["skills"].get(chave)
    if not s:
        raise KeyError(chave)
    idx = indice(carregar(base))
    eventos = []
    for r in prog.ler_log(base):
        if r.get("registro") != "evento":
            continue
        chaves = {idx.get(prog.slug(x)) for x in (r.get("habilidades") or [])}
        if chave in chaves:
            eventos.append({"id": r["id"], "quando": r.get("quando"), "agente": r.get("agente"),
                            "tipo": r.get("tipo"), "resumo": r.get("resumo"),
                            "despacho": r.get("despacho"),
                            "arquivos": (r.get("evidencia") or {}).get("arquivos", [])})
    eventos.sort(key=lambda e: e.get("quando") or "", reverse=True)
    return {**s, "eventosDetalhados": eventos, "especies": v["especies"],
            "naturezas": v["naturezas"], "tagsDoProjeto": v["tags"],
            "corpo": ler_corpo(base, chave)}


def visao(base: Path) -> dict:
    """O repertório com quem tem cada Learning e em que nível."""
    rep = sincronizar(base)
    idx = indice(rep)
    firmadas = {c for c, d in rep.items() if d.get("estado") == "firmada"}
    estado = prog.estado_do_projeto(base, idx, firmadas)

    portadores: dict[str, list] = {c: [] for c in rep}
    for nome, a in estado["agentes"].items():
        for chave, h in {**a["habilidades"], **a["brotos"]}.items():
            if chave in portadores:
                portadores[chave].append({
                    "agente": nome, "nivel": h["nivel"], "xp": h["xp"],
                    "eventos": h["eventos"], "progresso": h["progresso"],
                    "ultima": h.get("ultima"),
                })

    # Os marcos são de quem os escreveu, mas pertencem à habilidade: juntos, eles
    # são a história do que se aprendeu nela.
    marcos: dict[str, list] = {}
    for r_ in prog.ler_log(base):
        if r_.get("registro") == "marco":
            marcos.setdefault(r_.get("habilidade"), []).append(
                {"agente": r_.get("agente"), "quando": r_.get("quando"),
                 "nivel": r_.get("nivel"), "texto": r_.get("texto")})

    saida = {}
    for chave, d in rep.items():
        gente = sorted(portadores.get(chave, []), key=lambda p: (-p["nivel"], -p["xp"]))
        saida[chave] = {
            **d, "chave": chave, "portadores": gente,
            "especie": d.get("especie") if d.get("especie") in ESPECIES else ESPECIE_PADRAO,
            # Vazia quando ainda não se sabe o que ela é — e a tela mostra isso
            # como "descobrindo", não como erro.
            "natureza": d.get("natureza") if d.get("natureza") in NATUREZAS else "",
            "enquadramento": d.get("enquadramento") or {},
            # Corpo que você escreveu à mão não é remontado a partir das
            # respostas — o documento passa a ser seu.
            "corpo_curado": bool(d.get("corpo_curado")),
            "tags": d.get("tags") or [],
            "marcos": sorted(marcos.get(chave, []), key=lambda m: m.get("quando") or "", reverse=True),
            "temCorpo": bool(ler_corpo(base, chave).strip()),
            "eventos": sum(p["eventos"] for p in gente),
            "xp": round(sum(p["xp"] for p in gente), 1),
            "nivel_maximo": gente[0]["nivel"] if gente else 0,
        }
    ordem = sorted(saida.values(), key=lambda s: (s["estado"] == "arquivada",
                                                  s["estado"] == "broto",
                                                  -s["xp"], s["rotulo"].lower()))
    return {"skills": {s["chave"]: s for s in ordem},
            "firmarEm": regras.valor("learning.eventos_para_firmar"), "estados": list(ESTADOS),
            "especies": ESPECIES, "naturezas": NATUREZAS,
            "tags": tags_do_projeto(base)}


# ── Leitura ───────────────────────────────────────────────────────────────────

import re as _re

# Palavras curtas demais casam com tudo e não dizem nada.
def _min_termo() -> int:
    return regras.valor("learning.min_termo_busca")
# Armadilha pesa mais: é o que evita o erro, e é por isso que se consulta.
def _peso_tag() -> dict:
    return regras.valor("learning.peso_da_tag")


def _termos(texto: str) -> list[str]:
    return [t for t in prog.slug(texto).split("-") if len(t) >= _min_termo()]


def buscar(base: Path, consulta: str, limite: int = 5) -> list[dict]:
    """Os Learnings que respondem a uma consulta em texto livre.

    Sem modelo e sem índice: é contagem de termos com peso por onde o termo
    apareceu. Nome vale mais que texto, porque quem nomeou já resumiu. É tosco de
    propósito — um repertório de projeto tem dezenas de entradas, não milhares, e
    o que importa aqui é ser previsível para quem consulta.
    """
    alvo = _termos(consulta)
    if not alvo:
        return []
    rep = carregar(base)
    achados = []
    for chave, d in rep.items():
        if d.get("estado") == "arquivada":
            continue
        corpo = ler_corpo(base, chave)
        campos = [
            (3.0, " ".join([d.get("rotulo", ""), chave])),
            (2.0, " ".join(d.get("aliases", []))),
            (2.0, d.get("descricao", "")),
            (1.0, corpo),
        ]
        nota = 0.0
        for peso, texto in campos:
            termos = set(_termos(texto))
            nota += peso * sum(1 for t in alvo if t in termos)
        if nota <= 0:
            continue
        pesos = _peso_tag()
        for _tg in (d.get("tags") or []):
            nota *= pesos.get(_tg, 1.0)
        achados.append({"chave": chave, "rotulo": d.get("rotulo", chave),
                        "especie": d.get("especie", ESPECIE_PADRAO),
                        "estado": d.get("estado", "broto"),
                        "descricao": d.get("descricao", ""),
                        "corpo": corpo, "nota": round(nota, 2)})
    achados.sort(key=lambda a: -a["nota"])
    return achados[:limite]


def registrar_consulta(base: Path, agente: str, termos: str, chaves: list[str],
                       modo: str) -> None:
    """Toda leitura vira registro. É o que responde "o aprendizado está servindo?"

    Learning que ninguém consulta em meses é candidata a arquivo; muito
    consultada e com texto curto é candidata a ser escrita melhor. Sem este
    registro, as duas perguntas não têm resposta.
    """
    import json as _json
    import uuid as _uuid
    with prog.caminho_log(base).open("a", encoding="utf-8") as f:
        f.write(_json.dumps({"id": "cns_" + _uuid.uuid4().hex[:12], "quando": prog.agora(),
                             "registro": "consulta", "agente": agente[:120],
                             "modo": modo, "termos": termos[:300], "chaves": chaves[:20]},
                            ensure_ascii=False) + "\n")


def parecidas(base: Path, rotulo: str) -> tuple[str | None, list[str]]:
    """Antes de abrir uma habilidade: já existe, ou há parentes próximos?

    Devolve (a mesma, se houver) e (as parecidas). "A mesma" bloqueia a criação;
    "parecidas" só avisa — pode ser distinta de fato, e quem decide é quem escreve.
    """
    rep = carregar(base)
    idx = indice(rep)
    s = prog.slug(rotulo)
    mesma = idx.get(s) or prog.casar_habilidade(
        rotulo, {k: {"aliases": v.get("aliases", [])} for k, v in rep.items()})
    proximas = []
    if not mesma:
        for chave in rep:
            if regras.valor("learning.faixa_parecidas") <= prog._semelhanca(s, chave) \
                    < regras.valor("learning.limiar_fusao"):
                proximas.append(rep[chave].get("rotulo", chave))
    return mesma, proximas[:3]


# ── Destruir e promover ───────────────────────────────────────────────────────

def destruir(base: Path, chave: str, por: str = "usuario") -> None:
    """Some com a habilidade: entrada, texto e apelidos. Deixa a lápide no log."""
    rep = carregar(base)
    if chave not in rep:
        raise KeyError(chave)
    for apelido in rep[chave].get("aliases", []):
        prog.destruir_habilidade(base, apelido, por)
    prog.destruir_habilidade(base, chave, por)
    del rep[chave]
    salvar(base, rep)
    p = corpo_path(base, chave)
    if p.exists():
        p.unlink()


def promover(origem: Path, destino: Path, chave: str, projeto_origem: str,
             por: str = "usuario") -> dict:
    """Copia o Learning para a base — o caminho pelo qual ela cresce.

    Se a base já tem um Learning com esse nome, o texto entra como seção nova,
    assinada com o projeto de onde veio. Nada é sobrescrito: a base acumula, como
    todo o resto.
    """
    rep_o = carregar(origem)
    if chave not in rep_o:
        raise KeyError(chave)
    d = rep_o[chave]
    corpo = ler_corpo(origem, chave)
    rep_d = carregar(destino)
    mesma = indice(rep_d).get(chave)
    if mesma:
        alvo = rep_d[mesma]
        if not (alvo.get("descricao") or "").strip() and d.get("descricao"):
            alvo["descricao"] = d["descricao"]
        origens = alvo.setdefault("origens", [])
        if projeto_origem not in origens:
            origens.append(projeto_origem)
        salvar(destino, rep_d)
        if corpo.strip():
            anexar_ao_corpo(destino, mesma, corpo, f"{projeto_origem} (promovido por {por})")
        return rep_d[mesma]
    rep_d[chave] = {
        "rotulo": d.get("rotulo", chave), "descricao": d.get("descricao", ""),
        "aliases": list(d.get("aliases", [])), "estado": "firmada",
        "especie": d.get("especie", ESPECIE_PADRAO),
        "nasceu_em": d.get("nasceu_em", ""), "nasceu_de": d.get("nasceu_de", ""),
        "descricao_por": d.get("descricao_por", ""), "curada": bool(d.get("curada")),
        "vinculados": [], "origens": [projeto_origem],
    }
    salvar(destino, rep_d)
    if corpo.strip():
        escrever_corpo(destino, chave, corpo)
    return rep_d[chave]
