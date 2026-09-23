"""As teses que o executor propõe sobre um Learning, a partir do trabalho.

O fluxo é o que ele desenhou, e é o que define a feature:

    você cria o Learning e descreve
        ↓  ela desce no despacho: Maestro → líder → executor
    o executor faz a tarefa
        ↓  e propõe TESES sobre o Learning, à luz do que acabou de fazer
    volta com as perguntas
        ↓  você responde
    ele ajusta a tese, e ela é validada ou não

Isto substitui as cinco perguntas predeterminadas como caminho principal. Elas
eram um questionário igual para todo Learning; a tese é o que ESTE agente
descobriu fazendo ESTE trabalho — e vem com a pergunta que a resolveria, escrita
por quem estava lá.

A tese não é aprendizado. Ela nasce `proposta`, e o que acontece depois é seu:

    confirma  →  vira `validada` e entra no documento do Learning
    refuta    →  vira `refutada` e fica no histórico (saber o que não era conta)
    ajusta    →  o agente reescreve citando a anterior, e propõe de novo

Tudo no mesmo `progresso/eventos.jsonl`, append-only: `tese` e `veredito`.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import progresso as prog
import repertorio as rep

TIPOS_PERGUNTA = ("bool", "radio", "multi")
VEREDITOS = ("confirma", "refuta", "ajusta")
ESTADOS = ("proposta", "validada", "refutada", "revisada")


# ── Escrita ───────────────────────────────────────────────────────────────────

def propor(base: Path, dados: dict) -> dict:
    """O executor propõe uma tese sobre um Learning que JÁ existe.

    Três exigências, e as três são sobre honestidade:
      · o Learning tem de existir — o agente não cria repertório;
      · a tese vem com a pergunta que a resolve, porque tese sem pergunta é
        opinião e não dá para responder;
      · ela aponta o trabalho de onde saiu, porque tese sem trabalho é palpite.
    """
    skill = prog.slug(str(dados.get("skill") or ""))
    texto = str(dados.get("texto") or "").strip()
    agente = str(dados.get("agente") or "").strip()
    if skill not in rep.carregar(base):
        raise KeyError(skill)
    if not texto:
        raise ValueError("tese sem afirmação: o que você descobriu sobre esto Learning?")
    if not agente:
        raise ValueError("tese sem autor")

    p = dados.get("pergunta") or {}
    tipo = str(p.get("tipo") or "bool")
    if tipo not in TIPOS_PERGUNTA:
        raise ValueError(f"tipo de pergunta inválido: {tipo!r}; use bool, radio ou multi")
    ptexto = str(p.get("texto") or "").strip()
    if not ptexto:
        raise ValueError("tese sem pergunta: diga o que perguntar ao dono para resolvê-la")
    opcoes = [str(o).strip()[:160] for o in (p.get("opcoes") or []) if str(o).strip()][:8]
    if tipo in ("radio", "multi") and len(opcoes) < 2:
        raise ValueError("pergunta de escolha precisa de pelo menos duas opções")
    if tipo == "bool" and not opcoes:
        opcoes = ["Sim", "Não"]

    eventos = [str(e)[:40] for e in (dados.get("eventos") or []) if str(e).strip()][:10]
    if not eventos and not str(dados.get("despacho") or "").strip():
        raise ValueError("tese sem trabalho: cite o evento (ou o despacho) de onde ela saiu")

    return prog._anexar(base, {
        "id": "tse_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "tese", "skill": skill, "agente": agente,
        "texto": texto[:400],
        "pergunta": {"tipo": tipo, "texto": ptexto[:300], "opcoes": opcoes},
        "eventos": eventos,
        "despacho": str(dados.get("despacho") or "").strip()[:200],
        # Quando o agente reescreve depois da sua resposta, a nova tese cita a
        # anterior: dá para ler a evolução do entendimento dele.
        "revisa": str(dados.get("revisa") or "").strip()[:40] or None,
    })


def responder(base: Path, tese_id: str, dados: dict) -> dict:
    """Sua resposta. Confirmar grava a tese no documento do Learning."""
    tese = next((t for t in cruas(base) if t["id"] == tese_id), None)
    if not tese:
        raise KeyError(tese_id)
    veredito = str(dados.get("veredito") or "").strip()
    if veredito not in VEREDITOS:
        raise ValueError(f"veredito inválido: use um de {', '.join(VEREDITOS)}")
    por = str(dados.get("por") or "usuario").strip()[:120]
    if por not in ("usuario", ""):
        raise PermissionError("responder tese é seu: o agente propõe, você decide")

    escolhas = [str(e)[:160] for e in (dados.get("escolhas") or [])][:8]
    reg = prog._anexar(base, {
        "id": "vrd_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "veredito", "tese": tese_id, "skill": tese["skill"],
        "veredito": veredito, "escolhas": escolhas, "por": por or "usuario",
    })

    # Confirmada, ela entra no documento que os agentes leem. É o único jeito de
    # a tese sair do histórico e virar instrução.
    if veredito == "confirma":
        linha = tese["texto"]
        if escolhas:
            linha += f" ({', '.join(escolhas)})"
        rep.anexar_ao_corpo(base, tese["skill"], linha, f"{tese['agente']} · validado por você")
    return {"veredito": reg, "tese": tese_id}


# ── Leitura ───────────────────────────────────────────────────────────────────

def cruas(base: Path) -> list[dict]:
    return [r for r in prog.ler_log(base) if r.get("registro") == "tese"]


def estado(base: Path, skill: str = "") -> list[dict]:
    """As teses com o estado que os vereditos deram a cada uma."""
    log = prog.ler_log(base)
    vereditos: dict[str, list[dict]] = {}
    for r in log:
        if r.get("registro") == "veredito":
            vereditos.setdefault(r.get("tese"), []).append(r)
    revisadas = {t["revisa"] for t in cruas(base) if t.get("revisa")}
    mortas = prog.destruidas(base)

    out = []
    for t in cruas(base):
        if t.get("skill") in mortas or (skill and t.get("skill") != skill):
            continue
        meus = vereditos.get(t["id"], [])
        ultimo = meus[-1] if meus else None
        estado_ = ("revisada" if t["id"] in revisadas
                   else "validada" if ultimo and ultimo["veredito"] == "confirma"
                   else "refutada" if ultimo and ultimo["veredito"] == "refuta"
                   else "ajustar" if ultimo and ultimo["veredito"] == "ajusta"
                   else "proposta")
        out.append({**t, "estado": estado_, "vereditos": meus,
                    "pendente": not meus and t["id"] not in revisadas})
    out.sort(key=lambda t: t.get("quando") or "", reverse=True)
    return out


def inbox(base: Path) -> list[dict]:
    """As teses esperando você — é o que volta do despacho."""
    return [t for t in estado(base) if t["pendente"]]


def para_o_agente(base: Path, skills: list[str], limite: int = 6) -> list[dict]:
    """O que já foi validado nestos Learnings, curto, para descer no despacho."""
    vals = [t for t in estado(base) if t["estado"] == "validada" and t["skill"] in skills]
    return [{"id": t["id"], "skill": t["skill"], "texto": t["texto"]} for t in vals[:limite]]


# ── Propostas de Learning ──────────────────────────────────────────────────
# O agente não cria repertório — mas trabalhando ele topa com coisas que o
# repertório não tem nome para. Antes isso só tinha dois destinos: virar tese
# forçada num Learning que não era aquela, ou sumir.
#
# Aqui ele PROPÕE, com o trabalho de onde saiu, e a decisão continua sendo sua:
#
#     aceita  →  o Learning nasce, com você como autor
#     recusa  →  fica no histórico com o motivo (saber o que não vira conta)
#     ajusta  →  ele reescreve citando a anterior
#
# Mesmo log append-only: `proposta` e `veredito_proposta`.

VEREDITOS_PROPOSTA = ("aceita", "recusa", "ajusta")


def propor_habilidade(base: Path, dados: dict) -> dict:
    """O agente propõe um Learning nova. Nada nasce disto sozinho."""
    rotulo = " ".join(str(dados.get("rotulo") or "").split())[:80]
    o_que_e = str(dados.get("o_que_e") or "").strip()
    agente = str(dados.get("agente") or "").strip()
    if not rotulo:
        raise ValueError("proposta sem nome: como você chamaria esto Learning?")
    if not o_que_e:
        raise ValueError("proposta sem descrição: diga em uma frase o que ela é")
    if not agente:
        raise ValueError("proposta sem autor")

    eventos = [str(e)[:40] for e in (dados.get("eventos") or []) if str(e).strip()][:10]
    if not eventos and not str(dados.get("despacho") or "").strip():
        raise ValueError("proposta sem trabalho: cite o evento (ou o despacho) de onde ela saiu")

    # Já existe algo parecido? A proposta continua de pé, mas chega com o aviso
    # do lado — duas entradas para a mesma coisa é como um repertório vira pilha.
    mesma, proximas = rep.parecidas(base, rotulo)
    return prog._anexar(base, {
        "id": "prp_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "proposta", "rotulo": rotulo, "chave": prog.slug(rotulo),
        "o_que_e": o_que_e[:400], "agente": agente,
        "porque": str(dados.get("porque") or "").strip()[:400],
        "eventos": eventos,
        "despacho": str(dados.get("despacho") or "").strip()[:200],
        "parecida_com": mesma or "", "parecidas": proximas[:4],
        "revisa": str(dados.get("revisa") or "").strip()[:40] or None,
    })


def responder_proposta(base: Path, pid: str, dados: dict) -> dict:
    """Sua decisão. Aceitar é o único caminho pelo qual o Learning nasce."""
    prop = next((p for p in prog.ler_log(base)
                 if p.get("registro") == "proposta" and p.get("id") == pid), None)
    if not prop:
        raise KeyError(pid)
    veredito = str(dados.get("veredito") or "").strip()
    if veredito not in VEREDITOS_PROPOSTA:
        raise ValueError(f"veredito inválido: use um de {', '.join(VEREDITOS_PROPOSTA)}")
    por = str(dados.get("por") or "usuario").strip()[:120]
    if por not in ("usuario", ""):
        raise PermissionError("aceitar Learning é seu: o agente propõe, você decide")

    # Você pode aceitar com outro nome e outra frase — aceitar não é assinar
    # embaixo do texto dele, é dizer que a coisa existe e merece nome.
    rotulo = " ".join(str(dados.get("rotulo") or prop["rotulo"]).split())[:80]
    descricao = str(dados.get("descricao") or prop["o_que_e"]).strip()[:600]

    criada = ""
    if veredito == "aceita":
        try:
            sk = rep.criar(base, rotulo, descricao, str(dados.get("especie") or ""),
                           "usuario", "", dados.get("tags") or [])
            criada = sk["chave"]
        except KeyError:
            # Já existe: a proposta se resolve no Learning que já estava lá,
            # e o corpo dela recebe o que o agente trouxe.
            criada = prog.slug(rotulo)
        rep.anexar_ao_corpo(base, criada,
                            prop["o_que_e"] + (f"\n\n{prop['porque']}" if prop.get("porque") else ""),
                            f"{prop['agente']} · proposta aceita por você")

    reg = prog._anexar(base, {
        "id": "vrp_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "veredito_proposta", "proposta": pid, "veredito": veredito,
        "motivo": str(dados.get("motivo") or "").strip()[:300],
        "criada": criada, "por": por or "usuario",
    })
    return {"veredito": reg, "proposta": pid, "criada": criada}


def propostas(base: Path) -> list[dict]:
    """As propostas com o estado que a sua decisão deu a cada uma."""
    log = prog.ler_log(base)
    vereditos: dict[str, dict] = {}
    for r in log:
        if r.get("registro") == "veredito_proposta":
            vereditos[r.get("proposta")] = r
    cruas_ = [r for r in log if r.get("registro") == "proposta"]
    revisadas = {p["revisa"] for p in cruas_ if p.get("revisa")}

    out = []
    for p in cruas_:
        v = vereditos.get(p["id"])
        estado_ = ("revisada" if p["id"] in revisadas
                   else "aceita" if v and v["veredito"] == "aceita"
                   else "recusada" if v and v["veredito"] == "recusa"
                   else "ajustar" if v and v["veredito"] == "ajusta"
                   else "proposta")
        out.append({**p, "estado": estado_, "veredito": v,
                    "pendente": not v and p["id"] not in revisadas})
    out.sort(key=lambda p: p.get("quando") or "", reverse=True)
    return out
