"""A organização: quem responde a quem, e por qual domínio.

Até aqui a hierarquia do Noctis existia só em prosa: o Maestro do Overhaul é
Maestro porque o system_prompt dele diz isso, e os engenheiros sabem se reportar
porque outra frase pede. Funciona enquanto alguém lembra de escrever a frase —
e falha silenciosamente quando não escreve, que é o pior tipo de falha.

Aqui a cadeia passa a ser dado. Dois campos no yaml do agente, e nada mais:

    papel: maestro | lider | agente
    squad: <nome livre>          (o que ele lidera, se lider; onde ele está, se agente)

Três decisões que economizam estrutura:

· **Squad não tem arquivo.** A lista de squads nasce do uso, como as tags das
  habilidades: squad é o que os agentes dizem que é. Um cadastro à parte só
  criaria squad vazia e squad órfã para alguém arrumar depois.
· **Papel não é capacidade.** Maestro não é o agente mais forte, é o que tem a
  visão do todo — compute é outra conversa, e ainda não existe aqui.
· **Modo raso é legítimo.** Projeto sem líder nenhum é Flat Mode: o Maestro fala
  direto com os agentes, e a vista mostra isso sem reclamar.
"""
from __future__ import annotations

from pathlib import Path

PAPEIS = {
    "maestro": {"label": "Maestro", "desc": "visão do todo: decompõe o objetivo e despacha",
                "cor": "#a78bfa"},
    "lider":   {"label": "Líder de squad", "desc": "manda no domínio dele e consolida o que sobe",
                "cor": "#38bdf8"},
    "agente":  {"label": "Agente", "desc": "executa com profundidade no que sabe fazer",
                "cor": "#10b981"},
}
PAPEL_PADRAO = "agente"


def _yaml(base: Path, nome: str) -> dict:
    import yaml
    p = base / "agents" / f"{nome}.yaml"
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}


def ler(base: Path) -> dict:
    """A organização montada a partir dos yaml — sem índice para desatualizar."""
    agentes = []
    for f in sorted((base / "agents").glob("*.yaml")):
        cfg = _yaml(base, f.stem)
        papel = str(cfg.get("papel") or "").strip().lower()
        agentes.append({
            "nome": f.stem,
            "titulo": cfg.get("name") or f.stem,
            "descricao": (cfg.get("description") or "").strip()[:160],
            "papel": papel if papel in PAPEIS else PAPEL_PADRAO,
            "squad": str(cfg.get("squad") or "").strip(),
            "reporta_a": str(cfg.get("reporta_a") or "").strip(),
        })

    maestros = [a for a in agentes if a["papel"] == "maestro"]
    lideres = [a for a in agentes if a["papel"] == "lider"]
    comuns = [a for a in agentes if a["papel"] == "agente"]

    # Uma squad existe porque alguém disse que está nela. A que tem gente e
    # nenhum líder aparece igual: é informação, não defeito — no Flat Mode o
    # Maestro fala direto com todos.
    nomes = sorted({a["squad"] for a in agentes if a["squad"]}, key=str.lower)
    squads = []
    for s in nomes:
        squads.append({
            "nome": s,
            "lider": next((l for l in lideres if l["squad"] == s), None),
            "membros": [a for a in comuns if a["squad"] == s],
        })

    soltos = [a for a in comuns if not a["squad"]]
    sem_squad_lider = [l for l in lideres if not l["squad"]]
    return {
        "papeis": PAPEIS,
        "maestros": maestros,
        "squads": squads,
        "soltos": soltos,
        "lideresSemSquad": sem_squad_lider,
        "total": len(agentes),
        # O que está torto, dito em uma frase cada. A vista mostra como aviso, e
        # nada disso impede o projeto de funcionar.
        "avisos": _avisos(maestros, squads, soltos, sem_squad_lider, len(agentes)),
    }


def _avisos(maestros, squads, soltos, lideres_sem_squad, total) -> list[str]:
    avisos = []
    if total and not maestros:
        avisos.append("Nenhum Maestro: ninguém responde pela visão do todo neste projeto.")
    if len(maestros) > 1:
        avisos.append(f"{len(maestros)} Maestros — dois donos do todo costumam virar dois planos.")
    for s in squads:
        if not s["lider"] and len(s["membros"]) > 2:
            avisos.append(f'A squad "{s["nome"]}" tem {len(s["membros"])} agentes e nenhum líder.')
        if s["lider"] and not s["membros"]:
            avisos.append(f'"{s["lider"]["titulo"]}" lidera a squad "{s["nome"]}", que está vazia.')
    for l in lideres_sem_squad:
        avisos.append(f'"{l["titulo"]}" é líder sem squad: diga qual domínio ele lidera.')
    if soltos and squads:
        avisos.append(f"{len(soltos)} agente(s) fora de squad — falam direto com o Maestro.")
    return avisos


def definir(base: Path, nome: str, papel: str | None = None, squad: str | None = None,
            reporta_a: str | None = None) -> dict:
    """Muda o papel ou a squad de um agente, mexendo só nesses campos do yaml."""
    import yaml
    p = base / "agents" / f"{nome}.yaml"
    if not p.exists():
        raise KeyError(nome)
    cfg = _yaml(base, nome)
    if papel is not None:
        if papel and papel not in PAPEIS:
            raise ValueError(f"papel inválido: {papel!r}")
        cfg["papel"] = papel or PAPEL_PADRAO
    if squad is not None:
        s = " ".join(str(squad).strip().split())[:40]
        if s:
            cfg["squad"] = s
        else:
            cfg.pop("squad", None)
    if reporta_a is not None:
        if reporta_a:
            cfg["reporta_a"] = str(reporta_a).strip()[:80]
        else:
            cfg.pop("reporta_a", None)
    p.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False, width=88),
                 encoding="utf-8")
    return {"nome": nome, "papel": cfg.get("papel"), "squad": cfg.get("squad", "")}


def cadeia_de(base: Path, nome: str) -> list[dict]:
    """A cadeia de comando deste agente, de cima para baixo.

    É o que o despacho precisa carregar: o agente saber a própria posição é o
    que impede ele de sobrescrever restrição de quem está acima.
    """
    org = ler(base)
    eu = next((a for a in [*org["maestros"], *[s["lider"] for s in org["squads"] if s["lider"]],
                           *org["soltos"], *[m for s in org["squads"] for m in s["membros"]]]
               if a and a["nome"] == nome), None)
    if not eu:
        raise KeyError(nome)
    cadeia = [{"papel": "usuario", "nome": "usuario", "titulo": "Você"}]
    if org["maestros"]:
        cadeia.append(org["maestros"][0])
    if eu["papel"] == "agente" and eu["squad"]:
        lider = next((s["lider"] for s in org["squads"] if s["nome"] == eu["squad"]), None)
        if lider:
            cadeia.append(lider)
    if eu["papel"] != "maestro" or not org["maestros"]:
        cadeia.append(eu)
    return cadeia
