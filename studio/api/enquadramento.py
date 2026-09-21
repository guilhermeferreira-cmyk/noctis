"""As perguntas que descobrem o que uma habilidade é — todas fechadas.

O dono digita só o nome da habilidade. Quem descobre o resto é o Noctis,
perguntando. E as perguntas são de ESCOLHA, nunca campo aberto:

    "as perguntas de skill e aprendizado não devem ser campos abertos, devem ser
     baseadas em teses e ser por múltipla escolha, boolean ou radio"

O motivo é bom e vale escrever: resposta digitada à mão não se compara entre
habilidades nem entre projetos. Cinco habilidades com "medir antes de decidir"
escrito de cinco maneiras são cinco strings; cinco marcando a mesma TESE são um
padrão que o Noctis lê, conta e usa para escolher a quem delegar.

Cada pergunta é uma tese ou um conjunto de teses:

    bool    a tese vale ou não vale aqui
    radio   qual das teses descreve esta habilidade
    multi   quais teses valem (várias)

Nenhuma escolha é obrigatória: "nenhuma delas" fecha a pergunta e ela não volta.
Quando faltar tese, o lugar de escrever é o DOCUMENTO da habilidade, em markdown,
onde ele cola o que quiser — a fila de perguntas não é onde se redige.
"""
from __future__ import annotations

from pathlib import Path

import repertorio as rep

NENHUMA = "nenhuma delas"

# ── O catálogo de teses ───────────────────────────────────────────────────────
# As opções são genéricas de propósito: descrevem FORMAS de trabalho, e não o
# conteúdo de um projeto. Tese que cita cliente, arquivo ou ferramenta viraria
# exatamente o que ele recusou nas habilidades — específico demais para reusar.
PERGUNTAS = [
    {
        "campo": "momento", "titulo": "Quando entra", "tipo": "multi",
        "texto": "Em que momento do trabalho esta habilidade entra?",
        "opcoes": [
            "Antes de começar, para decidir o caminho",
            "Durante a execução, a cada passo",
            "Ao fechar, antes de entregar",
            "Quando algo deu errado",
            "Só quando alguém pede",
        ],
        "frase": "Entra {escolhas}.",
    },
    {
        "campo": "tem_passos", "titulo": "Tem passo a passo", "tipo": "bool",
        "texto": "Isto se faz seguindo uma sequência fixa de passos?",
        "opcoes": ["Sim, tem sequência fixa", "Não, depende do caso"],
        "frase": "{escolhas}.",
    },
    {
        "campo": "erro_tipico", "titulo": "Onde se erra", "tipo": "multi",
        "texto": "Como se erra nisto, normalmente?",
        "opcoes": [
            "Acreditando no que o código ou o documento declara, sem medir",
            "Pulando a verificação por pressa",
            "Copiando de um caso anterior sem conferir se cabe",
            "Decidindo sem consultar o que o projeto já aprendeu",
            "Tratando exceção como regra",
            "Parando no primeiro resultado que parece bom",
        ],
        "frase": "Erra-se {escolhas}.",
    },
    {
        "campo": "prova", "titulo": "Como se prova", "tipo": "multi",
        "texto": "O que prova que ficou bom?",
        "opcoes": [
            "Uma medida no artefato final, não no código-fonte",
            "Comparação com um alvo declarado antes",
            "Revisão de outro agente",
            "Teste automatizado passando",
            "Aprovação sua, e só ela",
        ],
        "frase": "Está pronto quando existe {escolhas}.",
    },
    {
        "campo": "julgamento", "titulo": "O que pesa no julgamento", "tipo": "radio",
        "texto": "Acertar isto depende mais de quê?",
        "opcoes": [
            "Seguir o procedimento com disciplina",
            "Sensibilidade que se apura com os casos",
            "Conhecer o contexto do projeto",
            "Domínio de uma ferramenta",
        ],
        "frase": "Acertar depende de {escolhas}.",
    },
]
POR_CAMPO = {p["campo"]: p for p in PERGUNTAS}


def _resp(d: dict, campo: str):
    return (d.get("enquadramento") or {}).get(campo)


def perguntas(base: Path) -> list[dict]:
    """As perguntas abertas, uma por habilidade — a fila tem de andar."""
    out = []
    for chave, d in rep.carregar(base).items():
        if d.get("estado") == "arquivada":
            continue
        rotulo = d.get("rotulo") or chave
        for p in PERGUNTAS:
            if _resp(d, p["campo"]) is None:
                out.append({
                    "id": f"enq:{chave}:{p['campo']}",
                    "tipo_fila": "enquadramento", "skill": chave, "campo": p["campo"],
                    "rotuloSkill": rotulo, "titulo": p["titulo"],
                    "pergunta": {"tipo": p["tipo"], "texto": f"{rotulo} — {p['texto']}",
                                 "opcoes": [*p["opcoes"], NENHUMA]},
                    "restantes": sum(1 for q in PERGUNTAS if _resp(d, q["campo"]) is None),
                    "total": len(PERGUNTAS),
                })
                break
    return out


def responder(base: Path, chave: str, campo: str, escolhas, autor: str = "usuario") -> dict:
    """Grava as escolhas. Lista vazia ou "nenhuma delas" fecha a pergunta.

    Enquadrar é da pessoa: o agente propõe tese (hipótese), ela decide.
    """
    if autor not in ("usuario", ""):
        raise PermissionError("enquadrar é seu: o agente propõe, você define")
    d = rep.carregar(base).get(chave)
    if not d:
        raise KeyError(chave)
    p = POR_CAMPO.get(campo)
    if not p:
        raise ValueError(f"campo desconhecido: {campo!r}")

    if isinstance(escolhas, str):
        escolhas = [escolhas] if escolhas.strip() else []
    validas = [str(e) for e in escolhas if str(e) in p["opcoes"]]
    if p["tipo"] in ("bool", "radio"):
        validas = validas[:1]

    enq = dict(d.get("enquadramento") or {})
    enq[campo] = validas          # lista vazia = dispensada, e não volta a ser feita
    atualizada = rep.atualizar(base, chave, {"enquadramento": enq})
    # O corpo se remonta a partir das escolhas — MENOS quando ele escreveu o
    # documento à mão. Aí o documento é dele, e as escolhas ficam guardadas.
    if not atualizada.get("corpo_curado"):
        rep.escrever_corpo(base, chave, corpo_de(atualizada))
    return atualizada


def _lista(itens: list[str]) -> str:
    itens = [i[0].lower() + i[1:] for i in itens]
    if len(itens) == 1:
        return itens[0]
    return ", ".join(itens[:-1]) + " e " + itens[-1]


def corpo_de(d: dict) -> str:
    """O documento montado a partir das escolhas — frases, não tabela de opções.

    O agente lê este markdown na consulta, então ele tem de soar como instrução,
    e não como resultado de questionário.
    """
    enq = d.get("enquadramento") or {}
    linhas: list[str] = []
    for p in PERGUNTAS:
        v = enq.get(p["campo"])
        if not v:
            continue
        linhas.append(f"## {p['titulo']}\n\n{p['frase'].format(escolhas=_lista(list(v)))}\n")
    return "\n".join(linhas)


def completude(d: dict) -> dict:
    respondidos = sum(1 for p in PERGUNTAS if _resp(d, p["campo"]) is not None)
    return {"respondidos": respondidos, "total": len(PERGUNTAS),
            "completa": respondidos >= len(PERGUNTAS)}


def estado(base: Path) -> dict:
    abertas = perguntas(base)
    incompletas = {p["skill"] for p in abertas}
    todas = [c for c, d in rep.carregar(base).items() if d.get("estado") != "arquivada"]
    return {"perguntas": abertas, "incompletas": len(incompletas),
            "prontas": len([c for c in todas if c not in incompletas]),
            "campos": [{"id": p["campo"], "titulo": p["titulo"], "tipo": p["tipo"]}
                       for p in PERGUNTAS]}
