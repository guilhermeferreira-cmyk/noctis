"""O que está torto agora, e onde cada coisa é gravada.

Duas perguntas que o dono faz e que não tinham resposta em lugar nenhum:

    "o que está inconsistente neste projeto?"
    "onde isso tudo é guardado, e quanto pesa?"

O NOCTURN responde a primeira em parte, mas ele olha o TRABALHO — agente parado,
entrega sem confirmação. Aqui o olhar é sobre a ESTRUTURA: Learning sem tese
respondida, hipótese esperando há dias, aprendizado que ninguém reusou, regra
fora do padrão, tag solta, agente sem lugar na organização.

Cada achado diz o que é, quanto é, e o que fazer — e nada disso impede o projeto
de funcionar. É um painel de saúde, não uma lista de erros.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import aprendizado as apr
import enquadramento as enq
import organizacao as org
import progresso as prog
import regras
import repertorio as rep


def _dias(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - t).total_seconds() / 86400
    except ValueError:
        return None


def achados(base: Path) -> list[dict]:
    """Os achados de estrutura, do mais acionável para o menos."""
    out: list[dict] = []
    skills = rep.carregar(base)
    est = apr.estado(base)

    # ── Learnings ───────────────────────────────────────────────────────────
    incompletas = {p["skill"] for p in enq.perguntas(base)}
    if incompletas:
        out.append({
            "id": "learnings_incompletos", "onde": "Learning",
            "gravidade": "media",
            "titulo": f"{len(incompletas)} Learning(s) ainda sendo descoberto(s)",
            "detalhe": "Faltam teses a responder. Enquanto faltam, o documento que os "
                       "agentes leem está incompleto.",
            "itens": sorted(skills[c].get("rotulo", c) for c in incompletas if c in skills)[:12],
            "acao": "Responda em Aprender, no NOCTURN, ou na doca do Learning.",
        })

    sem_tag = [d.get("rotulo", c) for c, d in skills.items()
               if not (d.get("tags") or []) and d.get("estado") != "arquivada"]
    if sem_tag:
        out.append({
            "id": "learnings_sem_tag", "onde": "Learning", "gravidade": "baixa",
            "titulo": f"{len(sem_tag)} Learning(s) sem tag",
            "detalhe": "Sem tag elas não entram em nenhum agrupamento e só aparecem na busca.",
            "itens": sorted(sem_tag)[:12],
            "acao": "Ponha uma tag no card, ou no detalhe do Learning.",
        })

    tags_soltas = [t["tag"] for t in rep.tags_do_projeto(base) if t["solta"]]
    if tags_soltas:
        out.append({
            "id": "tags_soltas", "onde": "Learnings", "gravidade": "baixa",
            "titulo": f"{len(tags_soltas)} tag(s) usadas uma vez só",
            "detalhe": "Tag de um Learning só costuma ser sinônimo de outro que já existe.",
            "itens": tags_soltas[:12],
            "acao": "Funda com outra em Configurações › Learnings, ou deixe se for proposital.",
        })

    # ── Aprendizado ───────────────────────────────────────────────────────────
    pendentes = [h for h in est["hipoteses"] if h["pendente"] and not h["invalida"]]
    velhas = [h for h in pendentes if (_dias(h.get("quando")) or 0) >= 3]
    if pendentes:
        out.append({
            "id": "hipoteses_pendentes", "onde": "Aprendizado",
            "gravidade": "alta" if velhas else "media",
            "titulo": f"{len(pendentes)} hipótese(s) esperando sua resposta"
                      + (f", {len(velhas)} há 3 dias ou mais" if velhas else ""),
            "detalhe": "Hipótese sem resposta não vira aprendizado, e o agente que a propôs "
                       "segue trabalhando sem saber se acertou.",
            "itens": [h["texto"][:90] for h in pendentes[:8]],
            "acao": "Responda na aba Aprender — a mais incerta vem primeiro.",
        })

    vivos = [a for a in est["aprendizados"] if not a["aposentado"]]
    sem_uso = [a for a in vivos if not a["usos"] and (_dias(a.get("quando")) or 0) >= 2]
    if sem_uso:
        out.append({
            "id": "aprendizado_sem_reuso", "onde": "Aprendizado", "gravidade": "media",
            "titulo": f"{len(sem_uso)} aprendizado(s) que ninguém reusou",
            "detalhe": "Conhecimento validado que nunca é aplicado é enfeite: ou a consulta "
                       "não o traz, ou ele não serve como está escrito.",
            "itens": [a["texto"][:90] for a in sem_uso[:8]],
            "acao": "Veja se o Learning dele aparece na consulta dos agentes, ou aposente.",
        })

    fragil = [a for a in vivos if a["fragil"] and a["usos"]]
    if fragil:
        out.append({
            "id": "aprendizado_fragil_em_uso", "onde": "Aprendizado", "gravidade": "alta",
            "titulo": f"{len(fragil)} aprendizado(s) frágeis já sendo aplicados",
            "detalhe": "A confiança está abaixo do limiar e os agentes já estão guiando "
                       "decisão por eles.",
            "itens": [a["texto"][:90] for a in fragil[:8]],
            "acao": "Confirme com mais evidência, reescreva, ou aposente.",
        })

    # ── Organização ───────────────────────────────────────────────────────────
    o = org.ler(base)
    if o["avisos"]:
        out.append({
            "id": "organizacao", "onde": "Organização",
            "gravidade": "media" if o["maestros"] else "alta",
            "titulo": f"{len(o['avisos'])} coisa(s) a acertar na organização",
            "detalhe": "A cadeia de comando incompleta aparece no despacho: o agente não "
                       "sabe a quem reportar.",
            "itens": o["avisos"][:8],
            "acao": "Ajuste na vista de Organização, no ⋯ do card.",
        })

    sem_papel = [a["titulo"] for a in org._agentes(base) if a["papel"] == "agente"
                 and not a["squad"] and not o["squads"]]
    if sem_papel and len(sem_papel) > 3:
        out.append({
            "id": "organizacao_rasa", "onde": "Organização", "gravidade": "baixa",
            "titulo": f"{len(sem_papel)} agentes e nenhuma squad",
            "detalhe": "Acima de uns três agentes, sem squad o Maestro carrega todo o "
                       "contexto de todos.",
            "itens": sorted(sem_papel)[:12],
            "acao": "Crie uma squad em Organização e mova quem for do mesmo domínio.",
        })

    # ── Trabalho ──────────────────────────────────────────────────────────────
    log = prog.ler_log(base)
    confirmados = {r.get("evento") for r in log if r.get("registro") == "confirmacao"}
    esperando = [e for e in log if e.get("registro") == "evento"
                 and e.get("tipo") in ("entrega", "output")
                 and e["id"] not in confirmados
                 and (_dias(e.get("quando")) or 0) >= 2]
    if esperando:
        out.append({
            "id": "sem_confirmacao", "onde": "Trabalho", "gravidade": "media",
            "titulo": f"{len(esperando)} entrega(s) esperando sua confirmação",
            "detalhe": "Sem confirmação o agente não recebe o bônus, e quem despachou "
                       "também não.",
            "itens": [f'{e.get("agente")}: {(e.get("resumo") or "")[:70]}' for e in esperando[:8]],
            "acao": "Confirme no card do agente, ou com --confirmar no comando.",
        })

    # ── Regras ────────────────────────────────────────────────────────────────
    alteradas = [r for r in regras.listar()["regras"] if r.get("alterada")]
    if alteradas:
        out.append({
            "id": "regras_alteradas", "onde": "Regras", "gravidade": "info",
            "titulo": f"{len(alteradas)} regra(s) diferentes do padrão",
            "detalhe": "Não é problema — é para você lembrar do que ajustou, e poder voltar.",
            "itens": [r["titulo"] for r in alteradas][:12],
            "acao": "Cada uma tem 'voltar ao padrão' no painel de Regras.",
        })

    ordem = {"alta": 0, "media": 1, "baixa": 2, "info": 3}
    out.sort(key=lambda a: ordem.get(a["gravidade"], 9))
    return out


# ── Onde cada coisa é gravada ─────────────────────────────────────────────────

_ARQUIVOS = [
    ("progresso/eventos.jsonl", "O histórico de trabalho: eventos, confirmações, observações, "
                                "hipóteses, respostas, aprendizados. Só cresce."),
    ("skills.json", "A identidade de cada Learning: nome, tags, teses respondidas."),
    ("squads.json", "As squads do projeto: nome, cor, ícone, do que cuidam."),
    ("resources.json", "A aparência e as tags de cada recurso — cor, ícone, ativo."),
    ("project.yaml", "O nome do projeto e o que ele é."),
]
_PASTAS = [
    ("agents", "*.yaml", "Um arquivo por agente: prompt, papel, squad."),
    ("memory", "*.md", "As memórias do projeto."),
    ("flows", "*.yaml", "Os fluxos."),
    ("personas", "*.yaml", "As personas."),
    ("skills", "*.md", "O documento de cada Learning — o que os agentes leem."),
    ("canvases", "*.json", "O arranjo de cada mapa."),
    ("outputs", "*", "O que os agentes produziram."),
]


def _tamanho(p: Path) -> int:
    try:
        return p.stat().st_size
    except OSError:
        return 0


def dados(base: Path, raiz: Path) -> dict:
    itens = []
    for rel, desc in _ARQUIVOS:
        p = base / rel
        itens.append({"caminho": rel, "desc": desc, "existe": p.exists(),
                      "bytes": _tamanho(p), "arquivos": 1 if p.exists() else 0})
    for pasta, padrao, desc in _PASTAS:
        d = base / pasta
        arqs = sorted(d.glob(padrao)) if d.is_dir() else []
        itens.append({"caminho": f"{pasta}/", "desc": desc, "existe": d.is_dir(),
                      "bytes": sum(_tamanho(a) for a in arqs), "arquivos": len(arqs)})
    globais = []
    for rel, desc in [("config/regras.json", "As regras que você alterou — o resto vem do padrão."),
                      ("config/aparencia.json", "Cores, ícones, logo, céu."),
                      ("config/config.jsonl", "O rastro das mudanças de regra: o que mudou, quando, por quem."),
                      ("config/nocturn/conversa.jsonl", "A conversa com o NOCTURN.")]:
        p = raiz / rel
        globais.append({"caminho": rel, "desc": desc, "existe": p.exists(),
                        "bytes": _tamanho(p), "arquivos": 1 if p.exists() else 0})
    return {"projeto": base.name, "pasta": str(base), "itens": itens, "globais": globais,
            "total": sum(i["bytes"] for i in itens)}
