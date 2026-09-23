"""A organização: quem responde a quem, e por qual domínio.

Até aqui a hierarquia do Noctis existia só em prosa: o Maestro era Maestro porque
o system_prompt dele dizia isso. Agora a cadeia é dado — e dado que você e os
agentes editam a qualquer momento, que era o gap: dava para ver a organização e
não dava para montá-la.

Duas verdades, cada uma no seu lugar:

    agents/<nome>.yaml     papel e squad DAQUELE agente
    squads.json            a identidade da squad: nome, cor, ícone, o que ela faz

A squad ganhou arquivo porque ela é uma coisa, não um rótulo: tem nome que se
renomeia sem reescrever dez agentes, tem cor no mapa da organização e tem uma
frase dizendo de que ela cuida. Squad citada num yaml e ausente do registro é
adotada na leitura — assim nada se perde quando um agente inventa uma squad nova
num despacho.

Quem pode mexer: você e os agentes. Diferente dos Learnings, aqui não há o que
proteger de palpite — desenhar a própria organização é parte do trabalho deles, e
o desenho errado é visível na hora, na tela.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

_PAPEIS_BASE = {
    # O Warden está acima da linha do projeto: ele é o único papel que enxerga
    # todos, e o único que pode dar ordem a um Maestro. Há um só em todo o
    # Noctis — dois guardiões do conjunto seriam dois conjuntos.
    "warden":  {"label": "Warden", "desc": "responde por todos os projetos e ordena aos Maestros"},
    "maestro": {"label": "Maestro", "desc": "visão do todo: decompõe o objetivo e despacha"},
    "lider":   {"label": "Líder de squad", "desc": "manda no domínio dele e consolida o que sobe"},
    "agente":  {"label": "Agente", "desc": "executa com profundidade no que sabe fazer"},
}


def papeis() -> dict:
    """Os papéis com a cor que está valendo nas regras."""
    import regras
    try:
        cores = regras.valor("organizacao.cores_dos_papeis")
    except KeyError:
        cores = {}
    return {k: {**v, "cor": cores.get(k, "#71717a")} for k, v in _PAPEIS_BASE.items()}


PAPEIS = _PAPEIS_BASE
PAPEL_PADRAO = "agente"
COR_PADRAO = "#38bdf8"
ICONE_PADRAO = "GiFamilyTree"


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")[:40]


# ── O registro de squads ──────────────────────────────────────────────────────

def _caminho(base: Path) -> Path:
    return base / "squads.json"


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


def criar_squad(base: Path, nome: str, por: str = "usuario", cor: str = "",
                icone: str = "", descricao: str = "") -> dict:
    nome = " ".join(str(nome).strip().split())[:60]
    if not nome:
        raise ValueError("squad sem nome")
    chave = slug(nome)
    if not chave:
        raise ValueError("nome inválido")
    sq = carregar(base)
    if chave in sq:
        raise KeyError(chave)
    sq[chave] = {"nome": nome, "cor": (cor or COR_PADRAO)[:9], "icone": (icone or ICONE_PADRAO)[:60],
                 "descricao": str(descricao).strip()[:300], "pai": "",
                 "criada_em": date.today().isoformat(), "criada_por": str(por)[:120]}
    salvar(base, sq)
    return {**sq[chave], "chave": chave}


def editar_squad(base: Path, chave: str, patch: dict) -> dict:
    sq = carregar(base)
    if chave not in sq:
        raise KeyError(chave)
    d = sq[chave]
    if str(patch.get("nome") or "").strip():
        d["nome"] = " ".join(str(patch["nome"]).strip().split())[:60]
    for campo, limite in (("cor", 9), ("icone", 60), ("descricao", 300)):
        if campo in patch:
            d[campo] = str(patch[campo] or "").strip()[:limite] or d.get(campo, "")
    # A squad-mãe: "Marketing" com "Conteúdo" e "Performance" dentro. Uma squad
    # grande demais vira departamento, e departamento não cabe numa lane só.
    if "pai" in patch:
        pai = slug(str(patch["pai"] or ""))
        if pai == chave:
            raise ValueError("uma squad não pode ser mãe de si mesma")
        if pai and pai not in sq:
            raise KeyError(pai)
        # Ciclo é o erro que trava a leitura inteira: A dentro de B dentro de A.
        visto, cursor = {chave}, pai
        while cursor:
            if cursor in visto:
                raise ValueError("isso fecharia um ciclo entre as squads")
            visto.add(cursor)
            cursor = slug(sq.get(cursor, {}).get("pai") or "")
        d["pai"] = pai
    salvar(base, sq)
    return {**d, "chave": chave}


def apagar_squad(base: Path, chave: str) -> int:
    """Tira a squad do registro e solta quem estava nela. Nenhum agente é apagado."""
    sq = carregar(base)
    sq.pop(chave, None)
    # As filhas sobem um nível em vez de sumirem junto.
    for d in sq.values():
        if slug(d.get("pai") or "") == chave:
            d["pai"] = ""
    salvar(base, sq)
    soltos = 0
    for f in (base / "agents").glob("*.yaml"):
        cfg = _yaml(base, f.stem)
        if slug(cfg.get("squad") or "") == chave:
            definir(base, f.stem, squad="")
            soltos += 1
    return soltos


# ── Os agentes ────────────────────────────────────────────────────────────────

def _yaml(base: Path, nome: str) -> dict:
    """O agente resolvido. Papel e squad são do acoplamento, mas o nome de
    exibição vem do arquétipo — ler cru mostraria o slug no lugar do nome."""
    import yaml
    import arquetipos as arqs
    p = base / "agents" / f"{nome}.yaml"
    try:
        return arqs.resolver(yaml.safe_load(p.read_text(encoding="utf-8")) or {})
    except (OSError, yaml.YAMLError):
        return {}


def _customizacao(base: Path) -> dict:
    """Cor, ícone, tags e ativo — o que você ajustou no card daquele agente.

    Isso mora no resources.json, junto da identidade visual dos outros recursos:
    o card na organização tem de ser o MESMO agente que aparece na grade e no
    mapa, com a mesma cor e o mesmo ícone. Dois desenhos para a mesma coisa é
    como se perde a confiança na tela.
    """
    p = base / "resources.json"
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        return {}
    out = {}
    for k, v in d.items():
        if isinstance(k, str) and k.startswith("agent:") and isinstance(v, dict):
            out[k.split(":", 1)[1]] = v
    return out


def _agentes(base: Path) -> list[dict]:
    custom = _customizacao(base)
    out = []
    for f in sorted((base / "agents").glob("*.yaml")):
        cfg = _yaml(base, f.stem)
        papel = str(cfg.get("papel") or "").strip().lower()
        c = custom.get(f.stem, {})
        out.append({
            "nome": f.stem,
            "titulo": cfg.get("name") or f.stem,
            "descricao": (cfg.get("description") or "").strip()[:200],
            "papel": papel if papel in PAPEIS else PAPEL_PADRAO,
            "squad": slug(cfg.get("squad") or ""),
            "squadNome": str(cfg.get("squad") or "").strip(),
            "reporta_a": str(cfg.get("reporta_a") or "").strip(),
            # a customização do card, a mesma da grade e do mapa
            "cor": c.get("color") or "",
            "icone": c.get("icon") or "",
            "tags": [t for t in (c.get("tags") or []) if isinstance(t, str)][:8],
            "ativo": c.get("active", True),
            "modelo": cfg.get("model") or cfg.get("modelo") or "",
            "temperatura": cfg.get("temperature", cfg.get("temperatura")),
            "ferramentas": len(cfg.get("tools") or cfg.get("ferramentas") or []),
        })
    return out


def definir(base: Path, nome: str, papel: str | None = None, squad: str | None = None,
            reporta_a: str | None = None) -> dict:
    """Muda papel e squad de um agente, mexendo só nesses campos do yaml.

    Squad que ainda não existe no registro é criada na hora: no meio de um
    despacho, ter de cadastrar antes de atribuir é atrito que faz o agente
    desistir e deixar o campo vazio.
    """
    import yaml
    p = base / "agents" / f"{nome}.yaml"
    if not p.exists():
        raise KeyError(nome)
    cfg = _yaml(base, nome)
    rebaixado = ""
    if papel is not None:
        if papel and papel not in PAPEIS:
            raise ValueError(f"papel inválido: {papel!r}")
        # Maestro é UM. Dois donos do todo viram dois planos, e o agente no meio
        # não sabe a quem reportar. Promover alguém rebaixa quem estava lá —
        # para líder se ele lidera uma squad, para agente se não lidera.
        # Warden e Maestro são únicos, e pelo mesmo motivo: quem responde pelo
        # todo não pode ser dois. A diferença é o alcance — o Maestro é único
        # no projeto, o Warden é único em todo o Noctis (a checagem entre
        # projetos é feita no servidor, que é quem enxerga a pasta inteira).
        if papel in ("maestro", "warden"):
            for outro in _agentes(base):
                if outro["papel"] == papel and outro["nome"] != nome:
                    novo = "lider" if outro["squad"] else "agente"
                    definir(base, outro["nome"], papel=novo)
                    rebaixado = f'{outro["titulo"]} virou {PAPEIS[novo]["label"].lower()}'
        cfg["papel"] = papel or PAPEL_PADRAO
    if squad is not None:
        s = " ".join(str(squad).strip().split())[:60]
        if s:
            chave = slug(s)
            sq = carregar(base)
            nome_bonito = sq[chave]["nome"] if chave in sq else s
            if chave not in sq:
                criar_squad(base, s, por="sistema")
            cfg["squad"] = nome_bonito
        else:
            cfg.pop("squad", None)
    if reporta_a is not None:
        if reporta_a:
            cfg["reporta_a"] = str(reporta_a).strip()[:80]
        else:
            cfg.pop("reporta_a", None)
    p.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False, width=88),
                 encoding="utf-8")
    return {"nome": nome, "papel": cfg.get("papel"), "squad": cfg.get("squad", ""),
            "rebaixado": rebaixado}


# ── A leitura ─────────────────────────────────────────────────────────────────

def ler(base: Path) -> dict:
    agentes = _agentes(base)
    registro = carregar(base)

    # Squad citada por um agente e ausente do registro entra: nada se perde
    # quando um agente inventa uma squad no meio do trabalho.
    mudou = False
    for a in agentes:
        if a["squad"] and a["squad"] not in registro:
            registro[a["squad"]] = {
                "nome": a["squadNome"] or a["squad"], "cor": COR_PADRAO, "icone": ICONE_PADRAO,
                "descricao": "", "criada_em": date.today().isoformat(), "criada_por": "adotada"}
            mudou = True
    if mudou:
        salvar(base, registro)

    # O Warden fica fora das listas de execução: ele não é membro de squad nem
    # "solto falando com o Maestro" — é o degrau acima do Maestro, e a tela o
    # desenha ali. Tratá-lo como agente comum o jogava numa lane qualquer.
    wardens = [a for a in agentes if a["papel"] == "warden"]
    maestros = [a for a in agentes if a["papel"] == "maestro"]
    lideres = [a for a in agentes if a["papel"] == "lider"]
    comuns = [a for a in agentes if a["papel"] == "agente"]

    squads = []
    for chave, d in sorted(registro.items(), key=lambda kv: kv[1].get("nome", "").lower()):
        pai = slug(d.get("pai") or "")
        squads.append({
            "chave": chave, **d,
            "pai": pai if pai in registro else "",
            "filhas": sorted(k for k, v in registro.items() if slug(v.get("pai") or "") == chave),
            "lider": next((l for l in lideres if l["squad"] == chave), None),
            "membros": [a for a in comuns if a["squad"] == chave],
        })

    # Profundidade: serve para a tela desenhar a lane de dentro dentro da de
    # fora, e para o despacho saber quantos degraus tem até o Maestro.
    por_chave = {s["chave"]: s for s in squads}
    for s in squads:
        nivel, cursor, guarda = 0, s["pai"], 0
        while cursor and guarda < 12:
            nivel += 1
            cursor = por_chave.get(cursor, {}).get("pai", "")
            guarda += 1
        s["nivel"] = nivel

    soltos = [a for a in comuns if not a["squad"]]
    sem_squad_lider = [l for l in lideres if not l["squad"]]
    return {
        "papeis": papeis(),
        "wardens": wardens,
        "maestros": maestros,
        "squads": squads,
        "soltos": soltos,
        "lideresSemSquad": sem_squad_lider,
        "total": len(agentes),
        "avisos": _avisos(maestros, squads, soltos, sem_squad_lider, len(agentes), wardens),
    }


def _avisos(maestros, squads, soltos, lideres_sem_squad, total, wardens=()) -> list[str]:
    import regras
    try:
        liga = regras.valor("organizacao.avisos")
    except KeyError:
        liga = {}

    def on(chave: str) -> bool:
        return liga.get(chave, True)

    avisos = []
    if on("sem_maestro") and total and not maestros:
        avisos.append("Nenhum Maestro: ninguém responde pela visão do todo neste projeto.")
    if on("dois_maestros") and len(wardens) > 1:
        avisos.append(f"{len(wardens)} Wardens — quem responde pelo conjunto é UM.")
    if on("dois_maestros") and len(maestros) > 1:
        avisos.append(f"{len(maestros)} Maestros — o Noctis tem UM; promova de novo para acertar.")
    for s in squads:
        if on("squad_sem_lider") and not s["lider"] and len(s["membros"]) > 2:
            avisos.append(f'A squad "{s["nome"]}" tem {len(s["membros"])} agentes e nenhum líder.')
        # Squad com sub-squads não está vazia: ela delega. O aviso é para a
        # que não tem ninguém nem filha nenhuma.
        if on("squad_vazia") and not s["lider"] and not s["membros"] and not s["filhas"]:
            avisos.append(f'A squad "{s["nome"]}" está vazia.')
        if on("squad_vazia") and s["lider"] and not s["membros"] and not s["filhas"]:
            avisos.append(f'"{s["lider"]["titulo"]}" lidera a squad "{s["nome"]}", que está vazia.')
    for l in (lideres_sem_squad if on("lider_sem_squad") else []):
        avisos.append(f'"{l["titulo"]}" é líder sem squad: diga qual domínio ele lidera.')
    if on("fora_de_squad") and soltos and squads:
        avisos.append(f"{len(soltos)} agente(s) fora de squad — falam direto com o Maestro.")
    return avisos


def cadeia_de(base: Path, nome: str) -> list[dict]:
    """A cadeia de comando deste agente, de cima para baixo.

    É o que o despacho precisa carregar: o agente saber a própria posição é o
    que impede ele de sobrescrever restrição de quem está acima.
    """
    org = ler(base)
    eu = next((a for a in _agentes(base) if a["nome"] == nome), None)
    if not eu:
        raise KeyError(nome)
    cadeia = [{"papel": "usuario", "nome": "usuario", "titulo": "Você"}]
    if org["maestros"]:
        cadeia.append(org["maestros"][0])
    if eu["papel"] in ("agente", "lider") and eu["squad"]:
        # Sobe pela árvore de squads: o líder da squad, depois o líder da
        # squad-mãe, e assim por diante até o Maestro.
        por_chave = {s["chave"]: s for s in org["squads"]}
        cursor = por_chave.get(eu["squad"])
        degraus = []
        guarda = 0
        while cursor and guarda < 12:
            lider = cursor.get("lider")
            if lider and lider["nome"] != nome:
                degraus.append(lider)
            cursor = por_chave.get(cursor.get("pai") or "")
            guarda += 1
        cadeia.extend(reversed(degraus))
    if eu["papel"] != "maestro" or not org["maestros"]:
        cadeia.append(eu)
    return cadeia
