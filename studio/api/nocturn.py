"""NOCTURN — o supervisor do Noctis.

É o único agente que não pertence a projeto nenhum: ele atravessa todos. O que
cada projeto tem é um time; o que o Noctis tem é ele.

Duas responsabilidades, e a ordem importa:

**Zelar pelo vocabulário.** Habilidade nasce de texto solto que um agente
escreveu ao fechar um despacho. Sem descrição, dois meses depois ninguém sabe se
"arquitetura de API" era desenhar contrato de rota ou escolher entre REST e fila
— e uma habilidade que ninguém sabe o que é não serve para escolher quem
despachar. Ele cobra a descrição de toda habilidade que entra.

**Relatar.** Ele varre os projetos e diz o que está acontecendo: quem subiu de
nível, o que está esperando confirmação, quem não trabalha há tempo, que termo
novo apareceu.

O cérebro dele mora fora daqui. Este módulo mantém a varredura (que é regra, e
regra não precisa de modelo) e a conversa (que é arquivo). Quando o NOCTURN for
aberto numa sessão de verdade, ele lê e escreve na mesma conversa — o dock não
precisa saber quem está do outro lado.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml

import progresso as prog
import repertorio as rep
import regras

# As rondas. Cada achado nasce marcado com a sua, e o dock vira abas a partir
# disto — uma ronda por tipo de pergunta, para nenhuma afogar a outra.
RONDAS = [
    ("vocabulario", "Vocabulário", "as habilidades e os nomes que elas têm"),
    ("trabalho",    "Trabalho",    "o que foi entregue e o que ficou esperando"),
    ("agentes",     "Agentes",     "quem está trabalhando e quem parou"),
    ("memoria",     "Memória",     "o que os agentes leem e de onde veio"),
]

# Dois nomes acima disto são parentes suspeitos. O casamento automático já funde
# a partir de 0,82 na entrada; esta faixa é a que passa batido e precisa de olho.
PARECIDAS_DE, PARECIDAS_ATE = 0.68, 0.82

# Dias sem trabalho a partir dos quais o agente entra no relatório como parado.
DIAS_PARA_OCIOSO = 14
# Confirmação pendente vira cobrança depois disto.
DIAS_PARA_COBRAR_CONFIRMACAO = 2


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _idade_em_dias(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds() / 86400
    except ValueError:
        return None


# ── Conversa ──────────────────────────────────────────────────────────────────

def _dir(raiz: Path) -> Path:
    d = raiz / "config" / "nocturn"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _conversa_path(raiz: Path) -> Path:
    return _dir(raiz) / "conversa.jsonl"


def ler_conversa(raiz: Path, limite: int = 200) -> list[dict]:
    p = _conversa_path(raiz)
    if not p.exists():
        return []
    out = []
    for linha in p.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha:
            try:
                out.append(json.loads(linha))
            except json.JSONDecodeError:
                continue
    return out[-limite:]


def dizer(raiz: Path, texto: str, autor: str = "nocturn", projeto: str = "",
          assunto: str = "") -> dict:
    """Uma fala na conversa. Append-only, como todo registro do Noctis."""
    msg = {"id": "msg_" + uuid.uuid4().hex[:10], "quando": agora(),
           "autor": autor if autor in ("nocturn", "voce") else "voce",
           "texto": str(texto).strip()[:4000],
           "projeto": projeto[:80], "assunto": assunto[:80]}
    with _conversa_path(raiz).open("a", encoding="utf-8") as f:
        f.write(json.dumps(msg, ensure_ascii=False) + "\n")
    return msg


# ── Varredura ─────────────────────────────────────────────────────────────────

def varrer_projeto(base: Path, slug: str) -> dict:
    """O que este projeto tem a dizer. Só leitura — varredura não muda nada."""
    achados: list[dict] = []
    eventos = prog.ler_log(base)
    # Não sair cedo quando o projeto não tem trabalho registrado: memória sem
    # autor e memória que ninguém lê existem com ou sem XP. A saída antecipada
    # que havia aqui escondia essas rondas justamente nos projetos recém-zerados.

    r = rep.sincronizar(base)
    estado = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))

    # 1. A responsabilidade número um: habilidade sem descrição.
    for chave, d in r.items():
        if d.get("estado") == "arquivada" or (d.get("descricao") or "").strip():
            continue
        achados.append({
            "ronda": "vocabulario", "tipo": "skill_sem_descricao", "urgencia": "alta" if d.get("estado") == "firmada" else "media",
            "projeto": slug, "chave": chave, "rotulo": d.get("rotulo", chave),
            "estado": d.get("estado", "broto"), "nasceu_de": d.get("nasceu_de", ""),
            "texto": f'"{d.get("rotulo", chave)}" entrou no repertório sem descrição.',
        })

    # 2. Entregas esperando confirmação — sem ela, o registro fica sem revisor.
    confirmados = {x.get("evento") for x in eventos if x.get("registro") == "confirmacao"}
    for ev in eventos:
        if ev.get("registro") != "evento" or ev["id"] in confirmados:
            continue
        if ev.get("tipo") not in ("entrega", "output"):
            continue
        dias = _idade_em_dias(ev.get("quando"))
        if dias is not None and dias >= regras.valor("nocturn.dias_para_cobrar_confirmacao"):
            achados.append({
                "ronda": "trabalho", "tipo": "sem_confirmacao", "urgencia": "media", "projeto": slug,
                "evento": ev["id"], "agente": ev.get("agente", ""), "dias": round(dias),
                "texto": f'{ev.get("agente")} entregou "{ev.get("resumo") or ev.get("despacho")}" '
                         f'há {round(dias)} dia(s) e ninguém confirmou.',
            })

    # 3. Agente parado e agente que nunca trabalhou não são a mesma coisa.
    for f in sorted((base / "agents").glob("*.yaml")):
        ficha = estado["agentes"].get(f.stem)
        if not ficha:
            achados.append({
                "ronda": "agentes", "tipo": "agente_sem_trabalho", "urgencia": "baixa", "projeto": slug,
                "agente": f.stem,
                "texto": f"{f.stem} nunca registrou trabalho — nenhuma habilidade nasceu dele.",
            })
            continue
        dias = _idade_em_dias(ficha.get("ultima"))
        if dias is not None and dias >= regras.valor("nocturn.dias_para_ocioso"):
            achados.append({
                "ronda": "agentes", "tipo": "agente_parado", "urgencia": "baixa", "projeto": slug,
                "agente": f.stem, "dias": round(dias),
                "texto": f"{f.stem} não registra trabalho há {round(dias)} dias.",
            })

    # 3b. Habilidade firmada sem corpo: nem marco, nem memória apontada. A
    #     descrição diz o que ela é; o corpo é o que se aprendeu nela, e sem
    #     isso ela vira rótulo — que era o que o repertório veio evitar.
    com_marco = {r_.get("habilidade") for r_ in eventos if r_.get("registro") == "marco"}
    for chave, d in r.items():
        if d.get("estado") != "firmada":
            continue
        if chave in com_marco or rep.ler_corpo(base, chave).strip():
            continue
        achados.append({
            "ronda": "vocabulario", "tipo": "skill_sem_corpo", "urgencia": "media",
            "projeto": slug, "chave": chave, "rotulo": d.get("rotulo", chave),
            "texto": f'"{d.get("rotulo", chave)}" está firmada, mas ninguém escreveu o que se aprendeu nela.',
        })

    # 3c. Firmada e nunca consultada. Aprendizado que ninguém lê não está
    #     servindo — ou está mal nomeado, ou é candidato a arquivo.
    consultadas = set()
    for r_ in eventos:
        if r_.get("registro") == "consulta":
            consultadas.update(r_.get("chaves") or [])
    ha_consultas = any(r_.get("registro") == "consulta" for r_ in eventos)
    if ha_consultas:
        for chave, d in r.items():
            if d.get("estado") == "firmada" and chave not in consultadas:
                achados.append({
                    "ronda": "vocabulario", "tipo": "skill_sem_leitura", "urgencia": "baixa",
                    "projeto": slug, "chave": chave, "rotulo": d.get("rotulo", chave),
                    "texto": f'"{d.get("rotulo", chave)}" nunca foi consultada por agente nenhum.',
                })

    # 4. Nomes parecidos demais que escaparam do casamento automático.
    chaves = [c for c, d in r.items() if d.get("estado") != "arquivada"]
    for i, a in enumerate(chaves):
        for b in chaves[i + 1:]:
            razao = prog._semelhanca(a, b)
            if regras.valor("habilidades.faixa_parecidas") <= razao < regras.valor("habilidades.limiar_fusao"):
                achados.append({
                    "ronda": "vocabulario", "tipo": "skill_parecida", "urgencia": "media",
                    "projeto": slug, "chave": a, "outra": b,
                    "rotulo": r[a].get("rotulo", a), "outroRotulo": r[b].get("rotulo", b),
                    "texto": f'"{r[a].get("rotulo", a)}" e "{r[b].get("rotulo", b)}" podem ser a mesma coisa.',
                })

    # 5. Decisões que ninguém marcou. O card espera uma escolha, não uma leitura.
    idx_ident = {}
    f_ident = base / "resources.json"
    if f_ident.exists():
        try:
            idx_ident = json.loads(f_ident.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            idx_ident = {}
    for chave, ident in idx_ident.items():
        dec = ident.get("decision")
        if not dec or not dec.get("options"):
            continue
        if not any(o.get("checked") for o in dec["options"]):
            kind, _, nome = chave.partition(":")
            achados.append({
                "ronda": "trabalho", "tipo": "decisao_pendente", "urgencia": "alta",
                "projeto": slug, "recurso": nome, "kind": kind,
                "texto": f'"{nome}" tem uma decisão aberta: {dec.get("question") or "sem pergunta"}',
            })

    # 6. Memória produzida sem autor não credita ninguém; memória que nenhum
    #    agente carrega não entra em prompt nenhum.
    usadas = set()
    agentes_do_projeto = []
    for f in sorted((base / "agents").glob("*.yaml")):
        agentes_do_projeto.append(f.stem)
        try:
            d = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            continue
        for m in (d.get("memory_files") or []):
            usadas.add(Path(str(m)).stem)
    for f in sorted((base / "memory").glob("*.md")):
        ident = idx_ident.get(f"memory:{f.stem}", {})
        if ident.get("origin") == "produzido" and not (ident.get("autor") or "").strip():
            achados.append({
                "ronda": "memoria", "tipo": "memoria_sem_autor", "urgencia": "media",
                "projeto": slug, "recurso": f.stem, "kind": "memory",
                "agentes": agentes_do_projeto,
                "texto": f'"{f.stem}" foi produzida por um agente, mas não diz por qual.',
            })
        if f.stem not in usadas:
            achados.append({
                "ronda": "memoria", "tipo": "memoria_sem_uso", "urgencia": "baixa",
                "projeto": slug, "recurso": f.stem, "kind": "memory",
                "texto": f'"{f.stem}" não está em memory_files de nenhum agente.',
            })

    return {"projeto": slug, "achados": achados, "eventos": estado["eventos"],
            "agentes": len(estado["agentes"]), "skills": len(r),
            "nomesDosAgentes": agentes_do_projeto}


def relatorio(raiz: Path, projetos: list[tuple[str, Path]]) -> dict:
    """A varredura completa, projeto a projeto.

    Ordena por urgência porque o dock mostra poucos de cada vez: o que aparece
    primeiro tem de ser o que muda uma decisão.
    """
    por_projeto = []
    todos: list[dict] = []
    for slug, base in projetos:
        v = varrer_projeto(base, slug)
        if v["achados"] or v.get("eventos"):
            por_projeto.append(v)
        todos.extend(v["achados"])

    peso = {"alta": 0, "media": 1, "baixa": 2}
    todos.sort(key=lambda a: (peso.get(a.get("urgencia", "baixa"), 3), a.get("projeto", "")))
    return {
        "quando": agora(),
        "projetos": por_projeto,
        "achados": todos,
        "rondas": [{"id": i, "rotulo": r, "desc": d,
                    "total": sum(1 for a in todos if a.get("ronda") == i)}
                   for i, r, d in RONDAS],
        "resumo": {
            "semDescricao": sum(1 for a in todos if a["tipo"] == "skill_sem_descricao"),
            "semConfirmacao": sum(1 for a in todos if a["tipo"] == "sem_confirmacao"),
            "parados": sum(1 for a in todos if a["tipo"] in ("agente_parado", "agente_sem_trabalho")),
        },
    }
