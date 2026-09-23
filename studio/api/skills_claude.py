"""Skill — exatamente a definição do Claude: um `SKILL.md`, descoberto e
rodado pelo Claude Code. Isto aqui não gerencia XP, portador nem tese — isso é
Learning (`repertorio.py`). O que este módulo faz é:

    ler      o que existe de fato em `.claude/skills/<slug>/SKILL.md`,
             nativo ou não, em qualquer projeto
    criar    uma skill NOVA, escrita pelo Noctis — inclusive a partir de um
             Learning que já provou servir
    vincular um ou mais Learnings a uma skill que o Noctis criou

A fronteira que nunca se move: uma skill que já existia no disco antes do
Noctis olhar para ela — nativa do Claude, de um plugin, ou escrita à mão por
você fora daqui — é **intocável**. O Noctis só edita e só vincula o que ele
mesmo escreveu, e um registro próprio (`config/skills_noctis.json`, dentro do
projeto) é o que distingue uma coisa da outra: se o slug está lá, é dele; se
não está, é alheio, mesmo que o conteúdo pareça igual.

O vínculo com Learning não entra no `SKILL.md` — mexer no arquivo que o
Claude Code lê para guardar metadado do Noctis arriscaria quebrar o parser
dele por um motivo que não é da conta dele. O vínculo mora só no registro.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import yaml


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")[:60]


def pasta(base: Path) -> Path:
    p = base / ".claude" / "skills"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _registro_path(base: Path) -> Path:
    return base / "config" / "skills_noctis.json"


def _registro(base: Path) -> dict:
    p = _registro_path(base)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        return {}


def _gravar_registro(base: Path, d: dict) -> None:
    p = _registro_path(base)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def _ler_frontmatter(caminho: Path) -> tuple[dict, str]:
    """(metadados, corpo) de um SKILL.md — frontmatter YAML entre `---`."""
    texto = caminho.read_text(encoding="utf-8")
    if texto.startswith("---"):
        fim = texto.find("\n---", 3)
        if fim >= 0:
            try:
                meta = yaml.safe_load(texto[3:fim]) or {}
            except yaml.YAMLError:
                meta = {}
            corpo = texto[fim + 4:].lstrip("\n")
            return meta if isinstance(meta, dict) else {}, corpo
    return {}, texto


# ── As skills que o Claude enxerga, e que o Noctis não escreveu ───────────────
# Elas não moram no projeto: moram em `~/.claude/skills` (as suas, sincronizadas)
# e em `~/.claude/plugins/**/skills` (as que vieram com plugin). O Noctis lê e
# mostra; não edita nenhuma delas — para mexer, você DUPLICA para dentro do
# projeto, e a cópia é sua.
#
# A varredura em si é barata (~0,15 s), mas ler o frontmatter de ~400 arquivos
# não é (~2,4 s). Por isso o resultado fica em memória com uma assinatura de
# (quantidade, mtime mais recente): enquanto nada mudou no disco, a resposta é
# instantânea; quando um plugin é instalado ou uma skill sincroniza, a
# assinatura muda sozinha e a leitura acontece de novo.

_cache_globais: dict = {"assinatura": None, "skills": []}


def _arquivos_globais() -> list[tuple[str, Path]]:
    casa = Path.home() / ".claude"
    fora: list[tuple[str, Path]] = []
    pasta_usuario = casa / "skills"
    if pasta_usuario.is_dir():
        for f in pasta_usuario.rglob("SKILL.md"):
            # `.staging` é área de sincronização, não skill instalada.
            if ".staging" not in f.parts:
                fora.append(("usuario", f))
    pasta_plugins = casa / "plugins"
    if pasta_plugins.is_dir():
        for f in pasta_plugins.rglob("SKILL.md"):
            if ".trash" in f.parts or ".staging" in f.parts:
                continue
            if "skills" in f.parts:
                fora.append(("plugin", f))
    return fora


def globais() -> list[dict]:
    """As skills de fora do projeto — só leitura, sempre."""
    arquivos = _arquivos_globais()
    try:
        assinatura = (len(arquivos), max((f.stat().st_mtime for _, f in arquivos), default=0))
    except OSError:
        assinatura = (len(arquivos), 0)
    if _cache_globais["assinatura"] == assinatura:
        return _cache_globais["skills"]

    vistos: set[str] = set()
    fora: list[dict] = []
    for origem, f in arquivos:
        slug_ = f.parent.name
        # O mesmo slug vem repetido de várias pastas de sync/plugin: a primeira
        # ganha. Mostrar quatro "docx" idênticas não ajuda ninguém a escolher.
        if slug_ in vistos:
            continue
        vistos.add(slug_)
        try:
            meta, corpo = _ler_frontmatter(f)
        except OSError:
            continue
        fora.append({
            "slug": slug_,
            "nome": meta.get("name") or slug_,
            "descricao": (meta.get("description") or "").strip(),
            "nativa": True, "origem": origem, "learnings": [],
            "criada_em": "", "de_learning": "", "tamanho": len(corpo),
            "caminho": str(f),
        })
    fora.sort(key=lambda s: (s["origem"], s["nome"].lower()))
    _cache_globais["assinatura"] = assinatura
    _cache_globais["skills"] = fora
    return fora


def _montar(frontmatter: str, corpo: str) -> str:
    """O texto de um SKILL.md: frontmatter entre `---`, corpo abaixo.

    Num lugar só porque três caminhos escrevem esse arquivo — criar, duplicar
    e editar — e um deles divergindo no formato faria o Claude Code ler uma
    skill quebrada sem ninguém entender por quê."""
    n = chr(10)
    return "---" + n + frontmatter.strip() + n + "---" + n + n + corpo.strip() + n

def listar(base: Path) -> list[dict]:
    """Todas as skills que existem no projeto — nativas e as do Noctis."""
    registro = _registro(base)
    out = []
    for f in sorted(pasta(base).glob("*/SKILL.md")):
        slug_ = f.parent.name
        meta, corpo = _ler_frontmatter(f)
        info = registro.get(slug_)
        out.append({
            "slug": slug_,
            "nome": meta.get("name") or slug_,
            "descricao": (meta.get("description") or "").strip(),
            "nativa": info is None,
            "origem": "projeto",
            "learnings": (info or {}).get("learnings", []),
            "criada_em": (info or {}).get("criada_em", ""),
            "de_learning": (info or {}).get("de_learning", ""),
            "duplicada_de": (info or {}).get("duplicada_de", ""),
            "tamanho": len(corpo),
        })
    return out


def ler(base: Path, slug_: str) -> dict:
    f = pasta(base) / slug_ / "SKILL.md"
    if not f.exists():
        raise KeyError(slug_)
    meta, corpo = _ler_frontmatter(f)
    info = _registro(base).get(slug_)
    return {"slug": slug_, "nome": meta.get("name") or slug_,
            "descricao": (meta.get("description") or "").strip(), "corpo": corpo,
            "nativa": info is None, "learnings": (info or {}).get("learnings", [])}


def criar(base: Path, nome: str, descricao: str, corpo: str = "",
          learnings: list[str] | None = None, de_learning: str = "") -> dict:
    """Escreve uma skill nova. Nome ocupado por skill NATIVA é recusado —
    o Noctis não pisa em cima de nada que não é dele; ocupado por outra do
    Noctis ganha sufixo, como em todo lugar aqui."""
    rotulo = " ".join(str(nome or "").split())[:80]
    if not rotulo:
        raise ValueError("skill sem nome")
    if not str(descricao or "").strip():
        raise ValueError("skill sem descrição — é o que o Claude usa para saber quando usá-la")

    registro = _registro(base)
    base_slug = slug(rotulo) or "skill"
    alvo_dir, s, n = pasta(base) / base_slug, base_slug, 1
    while alvo_dir.exists() and s not in registro:
        # Existe e não é nossa: é nativa. Não sobrescreve — muda de nome.
        n += 1
        s = f"{base_slug}-{n}"
        alvo_dir = pasta(base) / s
    while alvo_dir.exists():
        # Existe e É nossa: mesma regra de sempre, sufixo em vez de sobrescrever.
        n += 1
        s = f"{base_slug}-{n}"
        alvo_dir = pasta(base) / s

    alvo_dir.mkdir(parents=True, exist_ok=True)
    frontmatter = yaml.safe_dump({"name": rotulo, "description": descricao.strip()[:1024]},
                                 allow_unicode=True, sort_keys=False, width=88).strip()
    (alvo_dir / "SKILL.md").write_text(_montar(frontmatter, corpo), encoding="utf-8")

    registro[s] = {"criada_em": f"{date.today():%Y-%m-%d}",
                   "de_learning": de_learning,
                   "learnings": sorted({str(x).strip() for x in (learnings or []) if str(x).strip()})}
    _gravar_registro(base, registro)
    return {"slug": s, "nome": rotulo}


def vincular(base: Path, slug_: str, learnings: list[str]) -> dict:
    """Liga um ou mais Learnings a uma skill do Noctis. Skill nativa recusa —
    vincular é metadado do Noctis, e o Noctis não escreve em cima do alheio."""
    registro = _registro(base)
    if slug_ not in registro:
        raise PermissionError("esta skill não foi criada pelo Noctis — vincular Learning é só nas suas")
    registro[slug_]["learnings"] = sorted({str(x).strip() for x in (learnings or []) if str(x).strip()})
    _gravar_registro(base, registro)
    return {"slug": slug_, "learnings": registro[slug_]["learnings"]}


def duplicar(base: Path, slug_: str, origem: str = "") -> dict:
    """Traz uma cópia para dentro do projeto — e a cópia É sua.

    A original não se toca, venha ela de onde vier (do projeto, do seu
    `~/.claude/skills` ou de um plugin). O que nasce aqui entra no registro do
    Noctis, e por isso passa a aceitar edição e vínculo com Learning: é o
    caminho para mexer numa skill do Claude sem mexer na skill do Claude.
    """
    fonte = None
    if origem in ("", "projeto"):
        candidata = pasta(base) / slug_ / "SKILL.md"
        if candidata.exists():
            fonte = candidata
    if fonte is None:
        for g in globais():
            if g["slug"] == slug_ and (not origem or g["origem"] == origem):
                fonte = Path(g["caminho"])
                break
    if fonte is None or not fonte.exists():
        raise KeyError(slug_)

    meta, corpo = _ler_frontmatter(fonte)
    registro = _registro(base)
    alvo_slug, n = f"{slug_}-copia", 1
    while (pasta(base) / alvo_slug).exists():
        n += 1
        alvo_slug = f"{slug_}-copia-{n}"

    alvo_dir = pasta(base) / alvo_slug
    alvo_dir.mkdir(parents=True, exist_ok=True)
    nome = f'{meta.get("name") or slug_} (cópia)'
    frontmatter = yaml.safe_dump({"name": nome,
                                  "description": (meta.get("description") or "").strip()[:1024]},
                                 allow_unicode=True, sort_keys=False, width=88).strip()
    (alvo_dir / "SKILL.md").write_text(_montar(frontmatter, corpo), encoding="utf-8")
    registro[alvo_slug] = {"criada_em": f"{date.today():%Y-%m-%d}", "de_learning": "",
                           "duplicada_de": slug_, "learnings": []}
    _gravar_registro(base, registro)
    return {"slug": alvo_slug, "nome": nome, "de": slug_}


def editar(base: Path, slug_: str, patch: dict) -> dict:
    """Reescreve uma skill do Noctis. Nativa recusa — não é dele para editar."""
    registro = _registro(base)
    if slug_ not in registro:
        raise PermissionError("esta skill não foi criada pelo Noctis — duplique antes de editar")
    f = pasta(base) / slug_ / "SKILL.md"
    if not f.exists():
        raise KeyError(slug_)
    meta, corpo = _ler_frontmatter(f)
    nome = " ".join(str(patch.get("nome", meta.get("name") or slug_)).split())[:80]
    descricao = str(patch.get("descricao", meta.get("description") or "")).strip()
    if not nome:
        raise ValueError("skill sem nome")
    if not descricao:
        raise ValueError("skill sem descrição — é o que o Claude usa para saber quando usá-la")
    novo_corpo = patch.get("corpo", corpo)
    frontmatter = yaml.safe_dump({"name": nome, "description": descricao[:1024]},
                                 allow_unicode=True, sort_keys=False, width=88).strip()
    f.write_text(_montar(frontmatter, str(novo_corpo)), encoding="utf-8")
    return {"slug": slug_, "nome": nome}


def perguntas_vinculadas(base: Path, learnings_por_id) -> list[dict]:
    """As perguntas em aberto de cada skill do Noctis, pelos Learnings que ela
    vincula. Aparece MESMO SEM pergunta nenhuma — uma skill com o vínculo vazio
    também entra, com a lista vazia: o painel existe para você ver que aquele
    contexto ainda não foi preenchido, não só para contar o que falta.
    """
    registro = _registro(base)
    todas = learnings_por_id(base)
    out = []
    for slug_, info in registro.items():
        vinc = info.get("learnings") or []
        perguntas = [p for p in todas if p.get("skill") in vinc]
        out.append({"slug": slug_, "learnings": vinc, "perguntas": perguntas})
    return out


# ── Templates de skill ────────────────────────────────────────────────────────
# Mesma ideia da camada de templates do Warden (`templates.py`), mas skill não
# é um arquivo só — é uma PASTA com um `SKILL.md` dentro, então o molde
# precisa da própria forma. Fica aqui, e não em `templates.py`, para não forçar
# o módulo genérico a conhecer essa exceção.

def _templates_dir(base_do_warden: Path) -> Path:
    p = base_do_warden / "templates" / "skills"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _templates_meta_path(base_do_warden: Path) -> Path:
    return base_do_warden / "templates" / "meta.json"


def listar_templates(base_do_warden: Path) -> list[dict]:
    """Os moldes de skill guardados — mesmo arquivo de metadados que os outros
    tipos de template usam (`templates/meta.json`), só a chave muda de prefixo."""
    meta = {}
    p = _templates_meta_path(base_do_warden)
    if p.exists():
        try:
            meta = json.loads(p.read_text(encoding="utf-8")) or {}
        except json.JSONDecodeError:
            meta = {}
    out = []
    for f in sorted(_templates_dir(base_do_warden).glob("*/SKILL.md")):
        slug_ = f.parent.name
        m, _ = _ler_frontmatter(f)
        info = meta.get(f"skill:{slug_}", {})
        out.append({"kind": "skill", "slug": slug_, "nome": m.get("name") or slug_,
                    "descricao": (m.get("description") or "").strip(),
                    "de": info.get("de", ""), "deProjeto": info.get("deProjeto", ""),
                    "criado_em": info.get("criado_em", ""), "usos": info.get("usos", 0)})
    return out


def guardar_template(base_do_warden: Path, base_origem: Path, slug_origem: str) -> dict:
    """Guarda uma skill de QUALQUER projeto como molde. A skill original não
    se mexe — instanciar depois é cópia, não referência, como todo template.
    `base_origem` já vem resolvida pelo chamador (evita este módulo precisar
    importar `main` para achar a pasta de um projeto)."""
    fonte = base_origem / ".claude" / "skills" / slug_origem / "SKILL.md"
    if not fonte.exists():
        raise KeyError(slug_origem)
    alvo_dir = _templates_dir(base_do_warden) / slug_origem
    novo = not alvo_dir.exists()
    alvo_dir.mkdir(parents=True, exist_ok=True)
    (alvo_dir / "SKILL.md").write_text(fonte.read_text(encoding="utf-8"), encoding="utf-8")

    p = _templates_meta_path(base_do_warden)
    meta = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    chave = f"skill:{slug_origem}"
    anterior = meta.get(chave, {})
    meta[chave] = {"de": slug_origem, "deProjeto": base_origem.name,
                   "criado_em": anterior.get("criado_em") or f"{date.today():%Y-%m-%d}",
                   "usos": anterior.get("usos", 0)}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"slug": slug_origem, "novo": novo}


def instanciar_template(base_do_warden: Path, slug_: str, destino: Path) -> dict:
    """Copia o molde para dentro de outro projeto — como toda instanciação
    daqui, nome ocupado ganha sufixo em vez de sobrescrever."""
    fonte = _templates_dir(base_do_warden) / slug_ / "SKILL.md"
    if not fonte.exists():
        raise KeyError(slug_)
    registro = _registro(destino)
    alvo_slug, n = slug_, 1
    while (destino / ".claude" / "skills" / alvo_slug).exists():
        n += 1
        alvo_slug = f"{slug_}-{n}"
    alvo_dir = destino / ".claude" / "skills" / alvo_slug
    alvo_dir.mkdir(parents=True, exist_ok=True)
    (alvo_dir / "SKILL.md").write_text(fonte.read_text(encoding="utf-8"), encoding="utf-8")
    registro[alvo_slug] = {"criada_em": f"{date.today():%Y-%m-%d}",
                           "de_learning": "", "learnings": []}
    _gravar_registro(destino, registro)

    p = _templates_meta_path(base_do_warden)
    meta = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    chave = f"skill:{slug_}"
    if chave in meta:
        meta[chave]["usos"] = int(meta[chave].get("usos", 0)) + 1
        p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"slug": alvo_slug, "renomeado": alvo_slug != slug_}
