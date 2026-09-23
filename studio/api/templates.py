"""A camada de templates do Warden: moldes que descem para qualquer projeto.

O Warden tem três camadas, e elas respondem a perguntas diferentes:

    própria    o que é DELE — as memórias, os agentes e os mapas da governança
               (a pasta do projeto base, como a de qualquer outro projeto)
    catálogo   o que existe em TODOS os projetos, lido ao vivo, nada copiado
               (`/api/todos/*` — é vista, não acervo)
    templates  os moldes que ele guarda para instanciar em outros projetos
               (esta aqui)

O que separa template de catálogo é a intenção: no catálogo está o que os
projetos produziram, e ele muda quando eles mudam. No template está o que foi
DESTILADO — um agente que provou servir, uma memória que vale em qualquer
contexto —, e ele só muda quando alguém decide mudá-lo.

Três decisões que definem o comportamento:

1. **Instanciar é copiar, não referenciar.** O recurso criado a partir do molde
   é independente: editá-lo não mexe no molde, e mexer no molde não reescreve
   em silêncio quem já nasceu num projeto que você nem abriu.
2. **O molde não leva organização.** Papel, squad e `reporta_a` descrevem o
   trabalho num projeto, não o agente. Um molde que chegasse mandando em alguém
   seria hierarquia viajando junto.
3. **Nome ocupado não é sobrescrito.** O novo entra com sufixo. Perder um agente
   porque alguém instanciou um molde homônimo seria perder trabalho por um
   gesto de conveniência.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import yaml

TIPOS = {"agent": ("agents", ".yaml"), "memory": ("memory", ".md"),
         "flow": ("flows", ".yaml"), "persona": ("personas", ".yaml")}

# O que NÃO viaja num molde de agente: é a organização de um projeto.
LOCAIS = ("papel", "squad", "reporta_a")


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", t.lower())).strip("_")[:60]


def pasta(base_do_warden: Path, kind: str) -> Path:
    """Os moldes moram na pasta do projeto base, em `templates/<tipo>`."""
    if kind not in TIPOS:
        raise ValueError(f"tipo inválido: {kind}")
    p = base_do_warden / "templates" / TIPOS[kind][0]
    p.mkdir(parents=True, exist_ok=True)
    return p


def _meta_path(base_do_warden: Path) -> Path:
    return base_do_warden / "templates" / "meta.json"


def _meta(base_do_warden: Path) -> dict:
    p = _meta_path(base_do_warden)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        return {}


def _gravar_meta(base_do_warden: Path, d: dict) -> None:
    p = _meta_path(base_do_warden)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def _limpar_protocolo(texto: str) -> str:
    """Tira o bloco do protocolo: ele é reinstalado no destino, pelas regras de
    lá. Congelado no molde, espalharia um protocolo velho por projeto novo."""
    i = texto.find("## Protocolo do Noctis")
    return texto[:i].rstrip() + "\n" if i >= 0 else texto


def listar(base_do_warden: Path, kind: str = "") -> list[dict]:
    meta = _meta(base_do_warden)
    out = []
    for k in ([kind] if kind else list(TIPOS)):
        _, ext = TIPOS[k]
        for f in sorted(pasta(base_do_warden, k).glob(f"*{ext}")):
            m = meta.get(f"{k}:{f.stem}", {})
            if k == "memory":
                texto = f.read_text(encoding="utf-8")
                titulo = next((l.lstrip("# ").strip() for l in texto.splitlines()
                               if l.strip().startswith("#")), f.stem)
                resumo = next((l.strip() for l in texto.splitlines()
                               if l.strip() and not l.strip().startswith("#")), "")
            else:
                try:
                    cfg = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
                except yaml.YAMLError:
                    cfg = {}
                titulo = cfg.get("name") or f.stem
                resumo = (cfg.get("description") or "").strip()
            out.append({"kind": k, "slug": f.stem, "nome": titulo,
                        "descricao": resumo[:300],
                        "de": m.get("de", ""), "deProjeto": m.get("deProjeto", ""),
                        "criado_em": m.get("criado_em", ""),
                        "usos": m.get("usos", 0)})
    return out


def guardar(base_do_warden: Path, kind: str, nome: str, conteudo,
            de: str = "", de_projeto: str = "") -> dict:
    """Salva um recurso como molde. `conteudo` é dict (yaml) ou str (markdown)."""
    rotulo = " ".join(str(nome or "").split())[:80]
    chave = slug(rotulo)
    if not chave:
        raise ValueError("template sem nome")
    _, ext = TIPOS[kind]
    alvo = pasta(base_do_warden, kind) / f"{chave}{ext}"
    novo = not alvo.exists()

    if kind == "memory":
        alvo.write_text(_limpar_protocolo(str(conteudo)), encoding="utf-8")
    else:
        cfg = dict(conteudo or {})
        for campo in LOCAIS:
            cfg.pop(campo, None)
        if isinstance(cfg.get("system_prompt"), str):
            cfg["system_prompt"] = _limpar_protocolo(cfg["system_prompt"])
        cfg["name"] = rotulo
        alvo.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False, width=88),
                        encoding="utf-8")

    meta = _meta(base_do_warden)
    anterior = meta.get(f"{kind}:{chave}", {})
    meta[f"{kind}:{chave}"] = {**anterior, "de": de, "deProjeto": de_projeto,
                               "criado_em": anterior.get("criado_em") or f"{date.today():%Y-%m-%d}",
                               "usos": anterior.get("usos", 0)}
    _gravar_meta(base_do_warden, meta)
    return {"kind": kind, "slug": chave, "nome": rotulo, "novo": novo}


def apagar(base_do_warden: Path, kind: str, chave: str) -> bool:
    _, ext = TIPOS[kind]
    alvo = pasta(base_do_warden, kind) / f"{slug(chave)}{ext}"
    if not alvo.exists():
        raise KeyError(chave)
    alvo.unlink()
    meta = _meta(base_do_warden)
    meta.pop(f"{kind}:{slug(chave)}", None)
    _gravar_meta(base_do_warden, meta)
    return True


def instanciar(base_do_warden: Path, kind: str, chave: str, destino: Path,
               nome: str = "") -> dict:
    """Põe uma cópia do molde dentro de um projeto."""
    folder, ext = TIPOS[kind]
    fonte = pasta(base_do_warden, kind) / f"{slug(chave)}{ext}"
    if not fonte.exists():
        raise KeyError(chave)

    rotulo = " ".join(str(nome or "").split())[:80]
    (destino / folder).mkdir(parents=True, exist_ok=True)
    base_nome = slug(rotulo) if rotulo else slug(chave)
    alvo, n = destino / folder / f"{base_nome}{ext}", 1
    while alvo.exists():
        n += 1
        alvo = destino / folder / f"{base_nome}_{n}{ext}"

    if kind == "memory":
        alvo.write_text(fonte.read_text(encoding="utf-8"), encoding="utf-8")
    else:
        cfg = yaml.safe_load(fonte.read_text(encoding="utf-8")) or {}
        for campo in LOCAIS:
            cfg.pop(campo, None)
        if rotulo:
            cfg["name"] = rotulo
        # De onde ele veio fica escrito: daqui a um mês, "por que este agente é
        # igual àquele lá?" tem resposta sem arqueologia.
        cfg["nasceu_de"] = f"template:{slug(chave)}"
        alvo.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False, width=88),
                        encoding="utf-8")

    meta = _meta(base_do_warden)
    m = meta.setdefault(f"{kind}:{slug(chave)}", {})
    m["usos"] = int(m.get("usos", 0)) + 1
    _gravar_meta(base_do_warden, meta)
    return {"nome": alvo.stem, "renomeado": alvo.stem != base_nome, "kind": kind}
