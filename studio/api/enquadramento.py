"""As perguntas que descobrem o que uma habilidade é.

O dono só digita o nome. Quem descobre o resto é o Noctis, perguntando — e a
diferença entre isto e um formulário é o que ele disse: "eu só quero digitar uma
habilidade para eles aprenderem e eles mesmos irem descobrindo o que é essa
habilidade, com perguntas".

**Não existe mais bifurcação.** Por um tempo a primeira pergunta era "isto é um
passo a passo ou um assunto que se apura?", e ele derrubou com o argumento certo:
"poderia ser os dois". Diagramação avançada tem passos E vai acumulando
sensibilidade; verificar um build tem passos E ensina armadilhas novas a cada
caso. Obrigar a escolher um lado era o sistema impondo uma forma que o trabalho
não tem.

Então toda habilidade tem os mesmos campos, perguntados em ordem de utilidade, e
toda habilidade pode acumular aprendizado. Campo que não cabe naquela habilidade
se dispensa — e dispensar é uma resposta legítima, registrada, que não volta a
ser perguntada.
"""
from __future__ import annotations

from pathlib import Path

import repertorio as rep

# A ordem é a do trabalho, não a de um formulário: primeiro quando usar (sem
# isso o resto não serve), depois o passo a passo, o que dá errado, como saber
# que ficou pronto, e por fim o que importa entender além do procedimento.
CAMPOS = [
    ("quando_usar", "Quando usar", "Em que situação isto entra?"),
    ("passos", "Como se faz", "Quais são os passos, na ordem? (se não for passo a passo, dispense)"),
    ("armadilhas", "Armadilhas", "O que costuma dar errado aqui?"),
    ("verificacao", "Como verificar", "Como se sabe que ficou bom — que medida, que prova?"),
    ("o_que_importa", "O que importa entender",
     "Além do procedimento, o que eles precisam entender para acertar o julgamento?"),
]
TITULO = {c: t for c, t, _ in CAMPOS}

DISPENSADO = "—"


def _resp(d: dict, campo: str) -> str:
    return str((d.get("enquadramento") or {}).get(campo) or "").strip()


def perguntas(base: Path) -> list[dict]:
    """As perguntas abertas, uma por habilidade incompleta.

    Uma por vez, de propósito: cinco perguntas sobre a mesma habilidade de uma
    vez viram formulário, e formulário é o que ele não quer. A seguinte aparece
    quando esta for respondida — ou dispensada.
    """
    out = []
    for chave, d in rep.carregar(base).items():
        if d.get("estado") == "arquivada":
            continue
        rotulo = d.get("rotulo") or chave
        for campo, titulo, texto in CAMPOS:
            if not _resp(d, campo):
                out.append({
                    "id": f"enq:{chave}:{campo}",
                    "tipo_fila": "enquadramento", "skill": chave, "campo": campo,
                    "rotuloSkill": rotulo, "titulo": titulo,
                    "pergunta": {"tipo": "texto", "texto": f"{rotulo} — {texto}", "opcoes": []},
                    "podeDispensar": True,
                    "restantes": sum(1 for c, _, _ in CAMPOS if not _resp(d, c)),
                })
                break          # uma por habilidade: a fila tem de andar
    return out


def responder(base: Path, chave: str, campo: str, valor: str, autor: str = "usuario") -> dict:
    """Grava a resposta no campo. `valor` vazio ou '—' é dispensa registrada.

    Enquadrar é da pessoa. Agente que tentar cai na mesma trava das habilidades:
    ele propõe, ela define.
    """
    if autor not in ("usuario", ""):
        raise PermissionError("enquadrar é seu: o agente propõe, você define")
    d = rep.carregar(base).get(chave)
    if not d:
        raise KeyError(chave)
    if campo not in TITULO:
        raise ValueError(f"campo desconhecido: {campo!r}")

    enq = dict(d.get("enquadramento") or {})
    enq[campo] = (str(valor or "").strip() or DISPENSADO)[:2000]
    atualizada = rep.atualizar(base, chave, {"enquadramento": enq})
    # O corpo em markdown se remonta a partir das respostas: é ele que o agente
    # lê na consulta, e é ele que vai virar SKILL.md.
    rep.escrever_corpo(base, chave, corpo_de(atualizada))
    return atualizada


def corpo_de(d: dict) -> str:
    """O markdown da habilidade, montado a partir das respostas."""
    enq = d.get("enquadramento") or {}
    linhas: list[str] = []
    for campo, titulo, _ in CAMPOS:
        v = str(enq.get(campo) or "").strip()
        if v and v != DISPENSADO:
            linhas.append(f"## {titulo}\n\n{v}\n")
    return "\n".join(linhas)


def completude(d: dict) -> dict:
    """Quanto dela já foi dito — o que a tela mostra como "descobrindo"."""
    respondidos = sum(1 for c, _, _ in CAMPOS if _resp(d, c))
    return {"respondidos": respondidos, "total": len(CAMPOS),
            "completa": respondidos >= len(CAMPOS)}


def estado(base: Path) -> dict:
    abertas = perguntas(base)
    incompletas = {p["skill"] for p in abertas}
    todas = [c for c, d in rep.carregar(base).items() if d.get("estado") != "arquivada"]
    return {"perguntas": abertas, "incompletas": len(incompletas),
            "prontas": len([c for c in todas if c not in incompletas]),
            "campos": [{"id": c, "titulo": t} for c, t, _ in CAMPOS]}
