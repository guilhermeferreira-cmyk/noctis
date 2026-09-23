"""Arquétipos: o que um agente É, sem projeto nenhum.

O YAML de um agente sempre misturou duas naturezas, e o próprio código já sabia
disso — `enviar_agente()` remove `papel`, `squad` e `reporta_a` ao mandar um
agente para outro projeto, porque "eles não descrevem o agente, descrevem o
trabalho dele naquele projeto". Este módulo promove essa convenção a modelo de
dados:

    ARQUÉTIPO   o que ele é      name, description, system_prompt,
                (agnóstico)      tools, output_format, temperature

    ACOPLAMENTO o que ele faz    papel, squad, reporta_a, memory_files,
                AQUI             prompt_local

A medição que motivou isto: de 56 agentes, 18 têm o mesmo nome em mais de um
projeto, e 15 desses têm o `system_prompt` 99,4%+ idêntico. Entre as duas cópias
de `pen_dev`, a ÚNICA diferença era o slug do projeto dentro do bloco
`[noctis-xp]` — texto que o instalador já gera sozinho.

O ganho contra contaminação não é filtrar melhor: é tirar o lugar onde o
vazamento mora. Conhecimento de projeto colado no `system_prompt` viaja junto na
cópia; no arquétipo, ele não tem onde morar.

NADA aqui muda o comportamento de um agente que não declare `arquetipo:`. Um
acoplamento sem vínculo é lido exatamente como antes.
"""
from __future__ import annotations

from pathlib import Path

import yaml

# Os campos que descrevem o agente, e só ele. Tudo que não está nesta lista é
# do projeto e fica no acoplamento.
CAMPOS_DO_ARQUETIPO = ("name", "description", "system_prompt", "tools",
                       "output_format", "temperature")

# Os campos que descrevem o trabalho dele num projeto.
CAMPOS_DO_ACOPLAMENTO = ("papel", "squad", "reporta_a", "memory_files",
                         "prompt_local", "arquetipo", "desacoplado")


# Onde fica a biblioteca. Quem chama de fora do main (organizacao, nocturn) não
# tem como saber qual projeto é o do Warden, e espalhar esse slug pelo código
# seria pior — então o main configura uma vez, como já faz com as regras.
_BASE: Path | None = None


def configurar(base_do_warden: Path) -> None:
    global _BASE
    _BASE = base_do_warden


def _warden(base_do_warden: Path | None = None) -> Path | None:
    return base_do_warden if base_do_warden is not None else _BASE


def pasta(base_do_warden: Path) -> Path:
    """A biblioteca vive no projeto-base, que é o do Warden."""
    return base_do_warden / "arquetipos"


def caminho(base_do_warden: Path, slug: str) -> Path:
    return pasta(base_do_warden) / f"{slug}.yaml"


def ler(base_do_warden: Path, slug: str) -> dict | None:
    p = caminho(base_do_warden, slug)
    if not p.exists():
        return None
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return None


def listar(base_do_warden: Path) -> list[dict]:
    d = pasta(base_do_warden)
    if not d.is_dir():
        return []
    fora = []
    for f in sorted(d.glob("*.yaml")):
        cfg = ler(base_do_warden, f.stem) or {}
        fora.append({"slug": f.stem,
                     "name": cfg.get("name") or f.stem,
                     "description": (cfg.get("description") or "").strip()})
    return fora


def gravar(base_do_warden: Path, slug: str, cfg: dict) -> Path:
    p = caminho(base_do_warden, slug)
    p.parent.mkdir(parents=True, exist_ok=True)
    limpo = {k: cfg[k] for k in CAMPOS_DO_ARQUETIPO if k in cfg}
    # O protocolo nunca entra no arquétipo: ele é gerado na leitura, para o
    # projeto que está lendo.
    if limpo.get("system_prompt"):
        limpo["system_prompt"] = sem_protocolo(str(limpo["system_prompt"])).rstrip() + "\n"
    p.write_text(yaml.safe_dump(limpo, allow_unicode=True, sort_keys=False, width=88),
                 encoding="utf-8")
    return p


# O bloco `[noctis-xp]` cita o slug do projeto. Guardá-lo dentro do arquétipo
# faria o agente de um projeto mandar o outro registrar trabalho no lugar
# errado — foi exatamente a única diferença que a medição achou entre as duas
# cópias de `pen_dev`. Então o arquétipo guarda o prompt SEM o bloco, e ele é
# gerado na leitura, para o projeto certo. De quebra, protocolo velho deixa de
# existir: não há cópia congelada para envelhecer.
MARCA_PROTOCOLO = "## Protocolo do Noctis"


def sem_protocolo(texto: str) -> str:
    i = (texto or "").find(MARCA_PROTOCOLO)
    return (texto[:i].rstrip() + "\n") if i >= 0 else (texto or "")


def _bloco(projeto: str, agente: str) -> str:
    """Gera o bloco do protocolo. Falhar aqui nunca pode impedir a leitura de um
    agente — no pior caso ele sai sem o bloco, e o Diagnóstico acusa."""
    try:
        import sys as _sys
        raiz = Path(__file__).parent.parent.parent / "tools" / "xp"
        if str(raiz) not in _sys.path:
            _sys.path.insert(0, str(raiz))
        import instalar_protocolo as _ip
        return _ip.bloco_para(projeto, agente)
    except Exception:
        return ""


def _com_protocolo(cfg: dict, projeto: str, agente: str) -> dict:
    """Troca o bloco gravado pelo bloco de agora, deste projeto.

    Sem `projeto`/`agente` não há o que gerar, e o que estiver gravado fica —
    é o caso de quem lê fora do contexto de um projeto.
    """
    if not (projeto and agente):
        return cfg
    bloco = _bloco(projeto, agente)
    if not bloco:
        return cfg
    corpo = sem_protocolo(str(cfg.get("system_prompt") or "")).rstrip()
    cfg["system_prompt"] = (corpo + "\n\n" + bloco.strip() + "\n") if corpo else bloco.strip() + "\n"
    return cfg


def resolver(acoplamento: dict, base_do_warden: Path | None = None,
             projeto: str = "", agente: str = "") -> dict:
    """Junta arquétipo + acoplamento no agente efetivo.

    Sem `arquetipo:`, devolve o que entrou — é por isso que ligar este
    resolvedor no caminho de leitura não muda nada enquanto ninguém for
    promovido.

    `prompt_local` ACRESCENTA ao prompt do arquétipo, nunca substitui. Se
    pudesse substituir, o arquétipo viraria decoração e a deriva que a
    separação existe para evitar voltaria pela janela.
    """
    slug = str((acoplamento or {}).get("arquetipo") or "").strip()
    raiz = _warden(base_do_warden)
    if not slug or raiz is None or (acoplamento or {}).get("desacoplado"):
        # Agente local: nada a herdar, mas o protocolo é gerado do mesmo jeito.
        # Enquanto o bloco era texto gravado em cada arquivo, ele envelhecia
        # sozinho — e o instalador pulava em silêncio os agentes que a tela
        # tinha salvo, deixando o protocolo congelado na data de criação.
        # Gerando na leitura, não existe cópia velha para ficar para trás.
        return _com_protocolo(dict(acoplamento or {}), projeto, agente)

    arq = ler(raiz, slug)
    if arq is None:
        # Arquétipo sumido: devolve o acoplamento com a falha declarada, em vez
        # de entregar um agente mudo fingindo que está tudo bem. O Diagnóstico
        # lê este campo.
        fora = dict(acoplamento)
        fora["arquetipo_ausente"] = slug
        return fora

    fora = {k: v for k, v in arq.items() if k in CAMPOS_DO_ARQUETIPO}
    for k, v in (acoplamento or {}).items():
        if k == "prompt_local":
            continue
        fora[k] = v

    local = str((acoplamento or {}).get("prompt_local") or "").strip()
    if local:
        base = str(fora.get("system_prompt") or "").rstrip()
        fora["system_prompt"] = (base + "\n\n" + local) if base else local

    # O protocolo entra por último, e sempre do projeto que está lendo.
    return _com_protocolo(fora, projeto, agente)


def partir(cfg: dict) -> tuple[dict, dict]:
    """Separa um YAML de hoje nas duas metades. Usado para promover."""
    arq = {k: cfg[k] for k in CAMPOS_DO_ARQUETIPO if k in cfg}
    aco = {k: v for k, v in cfg.items() if k not in CAMPOS_DO_ARQUETIPO}
    return arq, aco
