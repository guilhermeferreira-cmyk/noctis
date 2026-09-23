"""
Noctis — FastAPI backend (multi-tenant / multi-projeto)
Cada projeto é uma pasta isolada em meu_sistema/projects/<slug>/
com suas próprias subpastas agents/, flows/, memory/, personas/, outputs/.
Novos projetos são criados a partir do scaffold em meu_sistema/_templates/.
"""

import os
import re
import json
import unicodedata
from datetime import datetime, timedelta, timezone
import shutil
import base64
import mimetypes
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Any
import re as _re
import yaml
import uuid
import tempfile
import html as html_mod
from starlette.background import BackgroundTask
import exportar_pdf as pdf
import progresso as prog
import arquetipos as arqs
import nicknames as nick
import repertorio as rep
import aprendizado as apr
import enquadramento as enq
import diagnostico as diag
import teses as tse
import templates as tpl
import skills_claude as skc
import organizacao as org
import nocturn as noc
import regras
import estado as est

app = FastAPI(title="Noctis API")

# ── CORS + Private Network Access ─────────────────────────────────────────────
# CORS próprio (em vez do CORSMiddleware do Starlette) para tratar o preflight de
# Private Network Access: uma UI pública na Vercel (https) acessando este backend
# local exige o cabeçalho Access-Control-Allow-Private-Network no preflight, que o
# CORSMiddleware rejeita por padrão ("Disallowed CORS private-network").
_VERCEL_ORIGIN = _re.compile(r"^https://[a-z0-9-]+\.vercel\.app$", _re.I)
_LOCAL_ORIGINS = {"http://localhost:5502", "http://127.0.0.1:5502"}


def _origin_allowed(origin: str | None) -> bool:
    return bool(origin) and (origin in _LOCAL_ORIGINS or bool(_VERCEL_ORIGIN.match(origin or "")))


@app.middleware("http")
async def cors_pna(request, call_next):
    origin = request.headers.get("origin")
    allowed = _origin_allowed(origin)

    if request.method == "OPTIONS" and origin is not None:
        headers = {}
        if allowed:
            headers = {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Private-Network": "true",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            }
        return Response(status_code=200 if allowed else 403, headers=headers)

    response = await call_next(request)
    if allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        response.headers["Vary"] = "Origin"
    return response

# Onde ficam os dados.
#
# Na máquina, é a raiz do meu_sistema e os arquivos são para valer. Num host
# serverless (Vercel), o disco do pacote é só-leitura e a única pasta gravável é
# a temporária — então os dados vão para lá, e o que se editar vive enquanto
# aquela instância viver. `NOCTIS_DATA` permite apontar para outro lugar sem
# tocar no código.
def _raiz_dos_dados() -> Path:
    env = os.environ.get("NOCTIS_DATA")
    if env:
        return Path(env)
    if os.environ.get("VERCEL"):
        return Path(tempfile.gettempdir()) / "noctis"
    return Path(__file__).parent.parent.parent   # meu_sistema/


EFEMERO       = bool(os.environ.get("VERCEL")) and not os.environ.get("NOCTIS_DATA")
BASE_DIR      = _raiz_dos_dados()
PROJECTS_DIR  = BASE_DIR / "projects"
# Os moldes são só-leitura: moram no repositório, não nos dados. Num pacote
# serverless a raiz do repo não viaja junto, então uma cópia fica ao lado deste
# arquivo e vale quando a de cima não existe.
def _pasta_dos_moldes() -> Path:
    aqui = Path(__file__).parent
    for cand in (aqui.parent.parent / "_templates", aqui / "_templates"):
        if cand.is_dir():
            return cand
    return aqui.parent.parent / "_templates"


TEMPLATES_DIR = _pasta_dos_moldes()
# ── Os tipos de recurso, numa declaração só ───────────────────────────────────
#
# Isto era SEIS tabelas paralelas descrevendo o mesmo conjunto: ícone padrão,
# aparência, cor, pasta→kind, kind→(pasta, glob) e mais uma em `templates.py`.
# Acrescentar um tipo exigia lembrar das seis, e esquecer uma dava ícone
# genérico ou card sem cor — sem erro nenhum, só errado na tela.
#
# Agora há uma fonte e cinco derivações. `label`, `color` e `icon` continuam
# sendo apenas o PADRÃO: o que vale de fato sai de `_vocabulario()`, que mescla
# com o que você escolheu em config/aparencia.json.
KINDS: dict[str, dict] = {
    "memory":   {"pasta": "memory",    "ext": ".md",   "label": "Memória", "color": "#3b82f6", "icon": "GiBrain"},
    "agent":    {"pasta": "agents",    "ext": ".yaml", "label": "Agente",  "color": "#10b981", "icon": "GiRobotGolem"},
    "flow":     {"pasta": "flows",     "ext": ".yaml", "label": "Fluxo",   "color": "#f59e0b", "icon": "GiDirectionSigns"},
    "persona":  {"pasta": "personas",  "ext": ".yaml", "label": "Persona", "color": "#ec4899", "icon": "GiPublicSpeaker"},
    # As duas que faltavam ao Noctis, e que não são de marketing: o trabalho em
    # voo não era observável em lugar nenhum — o Maestro do Overhaul e o Braço
    # Direito rastreiam despacho dentro de tabela em Markdown por falta delas.
    "task":     {"pasta": "tasks",     "ext": ".yaml", "label": "Tarefa",  "color": "#38bdf8", "icon": "GiCheckedShield"},
    "artifact": {"pasta": "artifacts", "ext": ".md",   "label": "Peça",    "color": "#a855f7", "icon": "GiStoneBlock"},
}

KIND_DEFAULT_ICON = {k: v["icon"] for k, v in KINDS.items()}
KIND_META_PADRAO  = {k: {"label": v["label"], "ext": v["ext"],
                         "color": v["color"], "icon": v["icon"]} for k, v in KINDS.items()}
KIND_META_COLOR   = {k: v["color"] for k, v in KINDS.items()}
KIND_POR_PASTA    = {v["pasta"]: k for k, v in KINDS.items()}
KIND_DIRS         = {k: (v["pasta"], f'*{v["ext"]}') for k, v in KINDS.items()}

# As pastas que todo projeto tem. Derivada dos kinds mais `outputs`, que é
# depósito e não tipo de recurso.
RESOURCE_DIRS = tuple(list(dict.fromkeys(v["pasta"] for v in KINDS.values())) + ["outputs"])

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# A base de conhecimento do Noctis: um projeto permanente, que não se apaga nem
# se renomeia, e cujos Learnings todo agente de todo projeto encontra ao
# consultar. É para onde sobe o que foi aprendido num projeto e vale para os
# outros — e é o que faz o conhecimento parar de morrer com o projeto que o gerou.
BASE_SLUG = "noctis"
BASE_NOME = "Noctis — base de conhecimento"
# Projetos excluídos vão para cá, não para o nada.
LIXEIRA = PROJECTS_DIR / ".lixeira"


# ── Hubs: o Noctis é uma suíte ────────────────────────────────────────────────
#
# O mesmo motor serve mais de uma superfície. O hub `noctis` governa conhecimento;
# o hub `diem` produz. Eles precisam de REGRAS diferentes — saturação diária é
# anomalia num e meta no outro — e por isso o hub é o escopo que `regras.py`
# resolve.
#
# Hub é propriedade do PROJETO, declarada no `project.yaml`. Projeto sem
# declaração é do hub de origem: nada que já existe muda de lugar.
HUB_PADRAO = "noctis"
HUBS = ("noctis", "diem")


def hub_do_projeto(slug: str) -> str:
    return _hub_do_dir(PROJECTS_DIR / slug)


def _hub_do_dir(base: Path) -> str:
    # Pasta sem `project.yaml` não é projeto do Noctis — é repositório de código
    # dentro de `projects/`. Ela aparece na lista, então precisa de resposta.
    p = base / "project.yaml"
    if not p.is_file():
        return HUB_PADRAO
    cfg = load_yaml(p) or {}
    h = str(cfg.get("hub") or "").strip()
    return h if h in HUBS else HUB_PADRAO


def _escopo(projeto: str = "", hub: str = "") -> "regras.Escopo | None":
    """O escopo de uma leitura de regra, vindo da query da rota.

    `projeto` basta: o hub sai do `project.yaml` dele. `hub` sozinho serve para
    ajustar o hub inteiro, sem escolher projeto.
    """
    projeto = (projeto or "").strip()
    hub = (hub or "").strip()
    if projeto:
        return regras.Escopo(hub=hub_do_projeto(projeto), projeto=projeto)
    if hub in HUBS:
        return regras.Escopo(hub=hub)
    return None


def _e_repositorio(base: Path) -> bool:
    """Pasta que é repositório de código, e não projeto do Noctis.

    `projects/` também guarda clones de repositórios de código do trabalho.
    Eles têm `.git` e não têm `project.yaml`. O Noctis os lista, mas não pode
    movê-los nem apagá-los: um clique na lixeira arrancaria o repositório do lugar
    onde o resto do trabalho espera encontrá-lo.
    """
    return (base / ".git").exists() and not (base / "project.yaml").exists()


# ── Projetos escondidos ───────────────────────────────────────────────────────
# `projects/` guarda também repositórios de código e projetos que já morreram.
# Apagar um repositório dali destruiria trabalho de verdade, então a proteção
# continua de pé — o que faltava era poder tirá-los da LISTA sem tocar no disco.
def _ocultos_path() -> Path:
    return BASE_DIR / "config" / "projetos_ocultos.json"


def _ocultos() -> set[str]:
    p = _ocultos_path()
    if not p.exists():
        return set()
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return set(d if isinstance(d, list) else d.get("ocultos", []))
    except json.JSONDecodeError:
        return set()


def _gravar_ocultos(s: set[str]) -> None:
    p = _ocultos_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(sorted(s), ensure_ascii=False, indent=2), encoding="utf-8")


def _garantir_base() -> None:
    base = PROJECTS_DIR / BASE_SLUG
    for pasta in ("agents", "flows", "memory", "personas", "outputs"):
        (base / pasta).mkdir(parents=True, exist_ok=True)
    meta = base / "project.yaml"
    if not meta.exists():
        meta.write_text(f"name: {BASE_NOME}\nslug: {BASE_SLUG}\npermanente: true\n", encoding="utf-8")


_garantir_base()
regras.configurar(BASE_DIR)
arqs.configurar(PROJECTS_DIR / BASE_SLUG)

if EFEMERO and not (PROJECTS_DIR / "demonstracao").exists():
    # Instância nova: nasce um projeto para a pessoa ter por onde começar,
    # senão a primeira tela é um beco sem saída. Perguntar se a pasta está
    # vazia não serve — _garantir_base() acabou de criar a base ali.
    demo = PROJECTS_DIR / "demonstracao"
    for pasta in RESOURCE_DIRS:
        (demo / pasta).mkdir(parents=True, exist_ok=True)
    (demo / "memory" / "Comece por aqui.md").write_text(chr(10).join([
            '# Comece por aqui',
            '',
            'Este é o Noctis rodando na Vercel, sem nenhum dado real.',
            '',
            'Pode criar memórias, montar mapas, ligar cards e mexer na aparência à',
            'vontade: **nada aqui é permanente**. O host é serverless, então o que você',
            'editar vive enquanto esta instância viver e some quando ela recicla.',
            '',
            '## O que dá para validar',
            '',
            '- O mapa de recursos: lanes, ligações com saída própria e aresta em degradê',
            '- O Cosmos, a camada acima dos mapas',
            '- Aura, vidro e o céu com parallax — tudo regulável em Aparência',
            '- Tipos de memória, cards de decisão e o identificador copiável',
            '',
            '## Para trabalhar nas suas pastas',
            '',
            'Esta página é só o cliente. O Noctis de verdade é o servidor, e é ele que tem',
            'acesso a um disco — por isso, para criar projetos dentro das **suas** pastas,',
            'rode o servidor na sua máquina e aponte esta página para ele em',
            '**Configurações → Conexão**. O endereço fica guardado neste navegador.',
            '',
            '## O que não funciona aqui',
            '',
            'A exportação em PDF: ela imprime pelo Chrome instalado na máquina, e não',
            'existe navegador dentro de uma função serverless.',
            '',
            'As Skills do Claude: elas são lidas de `~/.claude` no seu computador, que',
            'não existe aqui. A página aparece, mas vem vazia.',
            '',
        ]), encoding="utf-8")


# ── Slug / projetos ───────────────────────────────────────────────────────────

def slugify(value: str) -> str:
    """Nome de arquivo a partir de um título.

    Acento é TRANSLITERADO, não descartado: apagar o caractere transformava
    "Copy em produção" em "copy_em_produo" e "Referências" em "referncias".
    O slug é identificador — nome de arquivo, chave em memory_files, id de nó no
    mapa e trecho de URL. Quem aparece na tela é o título do conteúdo.
    """
    value = (value or "").strip().lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.replace("ç", "c").replace("ñ", "n")
    value = value.replace(" ", "_").replace("-", "_")
    value = re.sub(r"[^a-z0-9_]", "", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


# Nome de recurso é para pessoa ler: acento, espaço e maiúscula passam.
# O slugify continua valendo para id de PROJETO e de MAPA, que são chaves
# técnicas com nome de exibição próprio — pasta com espaço no OneDrive é risco
# sem ganho, já que ninguém lê aquele id.
_PROIBIDOS_NO_NOME = set(r'<>:"/\|?*')
_RESERVADOS_WINDOWS = ({"CON", "PRN", "AUX", "NUL"} |
                       {f"COM{i}" for i in range(1, 10)} |
                       {f"LPT{i}" for i in range(1, 10)})


def nome_de_recurso(value: str) -> str:
    """Sanitiza o nome de um arquivo de recurso sem descaracterizá-lo.

    Tira só o que o sistema de arquivos recusa ou o que permitiria sair da
    pasta do projeto. Antes daqui passava um slugify que comia acento e trocava
    espaço por sublinhado: `Copy em produção` virava `copy_em_produo`, e o nome
    que a pessoa escolheu não sobrevivia.
    """
    nome = (value or "").strip()
    nome = "".join(c for c in nome if c not in _PROIBIDOS_NO_NOME and ord(c) >= 32)
    nome = re.sub(r"\s+", " ", nome).strip().strip(".")
    if not nome or nome.upper().split(".")[0] in _RESERVADOS_WINDOWS:
        raise HTTPException(400, f"nome inválido: {value!r}")
    return nome[:120]


def caminho_de_recurso(base: Path, folder: str, name: str, ext: str) -> Path:
    """Monta o caminho e confirma que ele não escapou da pasta do projeto."""
    alvo = (base / folder / f"{nome_de_recurso(name)}{ext}").resolve()
    raiz = (base / folder).resolve()
    if raiz != alvo.parent:
        raise HTTPException(400, "nome inválido")
    return alvo


def project_base(project: str) -> Path:
    """Retorna a pasta do projeto, validando que ela existe."""
    slug = slugify(project)
    path = PROJECTS_DIR / slug
    if not slug or not path.is_dir():
        raise HTTPException(404, f"Projeto '{project}' não encontrado")
    return path


def agents_dir(project: str)   -> Path: return project_base(project) / "agents"
def flows_dir(project: str)    -> Path: return project_base(project) / "flows"
def memory_dir(project: str)   -> Path: return project_base(project) / "memory"
def personas_dir(project: str) -> Path: return project_base(project) / "personas"


def _project_meta_path(base: Path) -> Path:
    return base / "project.yaml"


def _project_display_name(base: Path) -> str:
    meta = _project_meta_path(base)
    if meta.exists():
        cfg = load_yaml(meta)
        if cfg.get("name"):
            return str(cfg["name"])
    return base.name


# ── YAML helpers ──────────────────────────────────────────────────────────────

def load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


class _LiteralStr(str):
    pass


# ── Agentes: o ponto ÚNICO de leitura ────────────────────────────────────────
# Todo lugar que precisa saber o que um agente é passa por aqui. Ler o YAML cru
# em outro canto entrega um agente sem cabeça no dia em que ele for acoplado a
# um arquétipo — e o sintoma seria silencioso, que é o pior tipo.

def nickname_de(projeto: str, nome: str) -> str:
    """O nickname do agente aplicado, criando um se ele ainda não tem.

    Atribuir na LISTAGEM, e não só em quem cria, é de propósito. Um agente
    entra num projeto por vários caminhos — criado na tela, enviado de outro
    projeto, instanciado de um molde, vindo no scaffold de projeto novo — e,
    como isto aqui é sistema de arquivos, também por alguém copiando um yaml
    na pasta. Remendar cada caminho deixaria justamente o último de fora, e o
    sintoma seria um card sem nickname até alguém abrir a ficha.

    Escreve só na primeira vez: nas leituras seguintes é consulta pura.
    """
    if not regras.valor("agentes.nickname_automatico"):
        return nick.de(BASE_DIR, projeto, nome)
    return nick.atribuir(BASE_DIR, projeto, nome)


def ler_agente_do_arquivo(path: Path, protocolo: bool = True) -> dict:
    # O projeto sai do próprio caminho (projects/<slug>/agents/<nome>.yaml): é
    # ele que decide qual bloco de protocolo o agente recebe.
    #
    # `protocolo=False` para quem não vai olhar o prompt. Montar o bloco custa
    # ~46 ms — ele lê regras, papel e nickname —, e a grade de agentes lê 26 de
    # uma vez só para mostrar nome e descrição: 1,3 s de espera para produzir
    # um texto que ninguém ia ler. Não é caso de cache, é de não fazer.
    projeto = path.parent.parent.name
    return arqs.resolver(load_yaml(path), PROJECTS_DIR / BASE_SLUG,
                         projeto=projeto if protocolo else "",
                         agente=path.stem if protocolo else "")


def ler_agente(base: Path, nome: str) -> dict:
    p = caminho_de_recurso(base, "agents", nome, ".yaml")
    return ler_agente_do_arquivo(p) if p.exists() else {}


def _literal_representer(dumper, data):
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(_LiteralStr, _literal_representer)


def _convert(obj: Any) -> Any:
    """Marca strings multi-linha para usar estilo | no YAML."""
    if isinstance(obj, str):
        return _LiteralStr(obj) if "\n" in obj else obj
    if isinstance(obj, dict):
        return {k: _convert(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert(i) for i in obj]
    return obj


def save_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(_convert(data), f, allow_unicode=True,
                  default_flow_style=False, sort_keys=False)


# ── Projetos (tenants) ────────────────────────────────────────────────────────

@app.get("/api/saude")
def saude():
    """Aperto de mão. A UI pode ser servida de qualquer lugar (inclusive de um
    deploy público) e precisa descobrir se o endereço que apontaram é mesmo um
    Noctis, e sobre qual pasta ele está trabalhando — é a pasta que responde
    pela pergunta "onde meus projetos vão parar"."""
    return {
        "noctis": True,
        "raiz": str(BASE_DIR),
        "efemero": EFEMERO,
        "projetos": sum(1 for _ in PROJECTS_DIR.iterdir()) if PROJECTS_DIR.is_dir() else 0,
    }


@app.get("/api/projects")
def list_projects(incluir_ocultos: bool = False):
    """Os projetos. Escondidos ficam de fora, a menos que você peça para ver."""
    ocultos = _ocultos()
    result = []
    # A base vem primeiro: é o chão de todos os outros.
    pastas = sorted(PROJECTS_DIR.iterdir(), key=lambda b: (b.name != BASE_SLUG, b.name))
    for base in pastas:
        # Pastas com ponto são do sistema (a lixeira mora numa delas).
        if not base.is_dir() or base.name.startswith("."):
            continue
        if base.name in ocultos and not incluir_ocultos:
            continue
        result.append({
            "oculto":      base.name in ocultos,
            "slug":        base.name,
            "displayName": _project_display_name(base),
            "permanente":  base.name == BASE_SLUG,
            "repositorio": _e_repositorio(base),
            "hub":         _hub_do_dir(base),
            "counts": {
                "agents":   len(list((base / "agents").glob("*.yaml")))   if (base / "agents").is_dir()   else 0,
                "flows":    len(list((base / "flows").glob("*.yaml")))    if (base / "flows").is_dir()    else 0,
                "memory":   len(list((base / "memory").glob("*.md")))     if (base / "memory").is_dir()   else 0,
                "personas": len(list((base / "personas").glob("*.yaml"))) if (base / "personas").is_dir() else 0,
            },
        })
    return result


@app.post("/api/projects/{project}/ocultar")
def ocultar_projeto(project: str, data: dict | None = None):
    """Tira o projeto da lista — ou o traz de volta. Nada é apagado.

    É o caminho para repositório de código e projeto morto: some da navegação,
    e a pasta continua exatamente onde está. Apagar de verdade segue sendo no
    disco, pela sua mão, que é onde essa decisão deve estar.
    """
    if project == BASE_SLUG:
        raise HTTPException(400, "a base não se esconde: todo projeto a consulta")
    esconder = bool((data or {}).get("oculto", True))
    o = _ocultos()
    o.add(project) if esconder else o.discard(project)
    _gravar_ocultos(o)
    return {"ok": True, "oculto": esconder, "ocultos": sorted(o)}


@app.post("/api/projects")
def create_project(data: dict):
    raw_name = (data.get("name") or "").strip()
    if not raw_name:
        raise HTTPException(400, "name obrigatório")
    slug = slugify(data.get("slug") or raw_name)
    if not slug:
        raise HTTPException(400, "slug inválido")

    dest = PROJECTS_DIR / slug
    if dest.exists():
        raise HTTPException(409, f"Projeto '{slug}' já existe")

    # Cria a partir do scaffold de templates (se existir), senão estrutura vazia.
    if TEMPLATES_DIR.is_dir():
        shutil.copytree(TEMPLATES_DIR, dest)
    else:
        dest.mkdir(parents=True)
    for d in RESOURCE_DIRS:
        (dest / d).mkdir(parents=True, exist_ok=True)

    # O hub é escolhido no nascimento e fica gravado no projeto: é ele que diz
    # que superfície o abre e que regras valem lá dentro. Sem escolha, nasce no
    # hub de origem — ninguém precisa saber que existem hubs para criar projeto.
    hub = str(data.get("hub") or "").strip()
    meta = {"name": raw_name, "slug": slug}
    if hub and hub != HUB_PADRAO:
        if hub not in HUBS:
            raise HTTPException(400, f"hub desconhecido: {hub!r}")
        meta["hub"] = hub
    save_yaml(_project_meta_path(dest), meta)
    return {"ok": True, "slug": slug, "displayName": raw_name, "hub": hub or HUB_PADRAO}


@app.delete("/api/projects/{project}")
def delete_project(project: str):
    """Manda o projeto para a lixeira. Apagar de vez é outra operação, explícita.

    Era `rmtree` direto: um clique e o projeto sumia sem volta. Agora ele muda de
    pasta, e só a limpeza da lixeira apaga de fato.
    """
    base = project_base(project)
    if base.name == BASE_SLUG:
        raise HTTPException(403, "A base de conhecimento é permanente e não pode ser excluída.")
    if _e_repositorio(base):
        raise HTTPException(403, f"'{base.name}' é um repositório de código, não um projeto do Noctis. "
                                 "Mova ou apague pelo seu git, fora daqui.")
    LIXEIRA.mkdir(parents=True, exist_ok=True)
    destino = LIXEIRA / f"{base.name}--{datetime.now():%Y%m%d-%H%M%S}"
    shutil.move(str(base), str(destino))
    return {"ok": True, "lixeira": destino.name}


@app.get("/api/lixeira")
def listar_lixeira():
    if not LIXEIRA.is_dir():
        return {"itens": []}
    itens = []
    for d in sorted(LIXEIRA.iterdir(), reverse=True):
        if d.is_dir():
            slug, _, quando = d.name.partition("--")
            itens.append({"id": d.name, "slug": slug, "quando": quando,
                          "nome": _project_display_name(d)})
    return {"itens": itens}


@app.post("/api/lixeira/{item}/restaurar")
def restaurar_da_lixeira(item: str):
    origem = LIXEIRA / Path(item).name
    if not origem.is_dir():
        raise HTTPException(404, "item não está na lixeira")
    slug = origem.name.partition("--")[0]
    destino = PROJECTS_DIR / slug
    if destino.exists():
        raise HTTPException(409, f"já existe um projeto '{slug}' — renomeie antes de restaurar")
    shutil.move(str(origem), str(destino))
    return {"ok": True, "slug": slug}


@app.delete("/api/lixeira/{item}")
def apagar_de_vez(item: str):
    """Esta é a única rota que apaga um projeto de verdade."""
    alvo = LIXEIRA / Path(item).name
    if not alvo.is_dir():
        raise HTTPException(404, "item não está na lixeira")
    shutil.rmtree(alvo)
    return {"ok": True}


@app.post("/api/projects/{project}/rename")
def rename_project(project: str, data: dict):
    """Renomeia apenas o nome de exibição (mantém o slug/pasta estável)."""
    base = project_base(project)
    if base.name == BASE_SLUG:
        raise HTTPException(403, "O nome da base de conhecimento é fixo.")
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name obrigatório")
    meta = load_yaml(_project_meta_path(base)) if _project_meta_path(base).exists() else {}
    meta["name"] = new_name
    meta.setdefault("slug", base.name)
    save_yaml(_project_meta_path(base), meta)
    return {"ok": True, "displayName": new_name}


# ── Organização: quem responde a quem ────────────────────────────────────────
# A cadeia vive nos yaml dos agentes (papel, squad), e não num índice à parte:
# índice separado desatualiza, e aí a tela mente.

@app.get("/api/projects/{project}/diagnostico")
def ler_diagnostico(project: str):
    """O que está torto na estrutura do projeto, agora. Nada disso trava nada."""
    return {"achados": diag.achados(project_base(project))}


@app.get("/api/projects/{project}/dados")
def ler_dados(project: str):
    """Onde cada coisa é gravada, e quanto pesa — a garantia de que nada está preso."""
    return diag.dados(project_base(project), BASE_DIR)


@app.get("/api/projects/{project}/organizacao/layout")
def ler_layout_org(project: str):
    """O arranjo da organização: onde cada card está no canvas.

    Mora num arquivo só do arranjo, como os mapas de memória: a posição é
    visual e não tem nada a ver com a cadeia de comando, que vive nos yaml.
    """
    p = project_base(project) / "organizacao.json"
    if not p.exists():
        return {"pos": {}, "viewport": None}
    try:
        d = json.loads(p.read_text(encoding="utf-8")) or {}
    except json.JSONDecodeError:
        return {"pos": {}, "viewport": None}
    return {"pos": d.get("pos") or {}, "tam": d.get("tam") or {},
            "links": d.get("links") or [],
            # Quem foi tirado do desenho. O agente continua existindo e continua
            # na squad dele: sair do desenho é um gesto visual, como tirar um
            # card do mapa de memória sem apagar o arquivo.
            "fora": [str(n)[:120] for n in (d.get("fora") or [])][:500],
            "viewport": d.get("viewport")}


@app.put("/api/projects/{project}/organizacao/layout")
def salvar_layout_org(project: str, data: dict):
    """Grava o arranjo: posição, tamanho das lanes e os conectores que você puxou.

    Nada de papel ou squad por aqui — isso vive nos yaml. O que está neste
    arquivo é só desenho: mover, esticar e ligar.
    """
    pos, tam = {}, {}
    for k, v in (data.get("pos") or {}).items():
        try:
            pos[str(k)[:120]] = {"x": float(v["x"]), "y": float(v["y"])}
        except (KeyError, TypeError, ValueError):
            continue
    for k, v in (data.get("tam") or {}).items():
        try:
            tam[str(k)[:120]] = {"w": max(120.0, float(v["w"])), "h": max(80.0, float(v["h"]))}
        except (KeyError, TypeError, ValueError):
            continue
    # Conectores livres: você desenha a relação que quiser entre dois cards. A
    # cadeia de comando continua sendo papel + squad; isto é anotação visual.
    links = []
    for l in (data.get("links") or [])[:400]:
        a, b = str(l.get("source") or "")[:120], str(l.get("target") or "")[:120]
        if a and b and a != b:
            links.append({"source": a, "target": b, "rotulo": str(l.get("rotulo") or "")[:60]})
    fora = sorted({str(n)[:120] for n in (data.get("fora") or []) if str(n).strip()})[:500]
    p = project_base(project) / "organizacao.json"
    p.write_text(json.dumps({"pos": pos, "tam": tam, "links": links, "fora": fora,
                             "viewport": data.get("viewport")},
                            ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "cards": len(pos), "lanes": len(tam), "links": len(links),
            "fora": len(fora)}


@app.get("/api/projects/{project}/organizacao")
def ler_organizacao(project: str):
    """Maestro, squads, líderes e quem está fora de squad — com o que está torto."""
    return org.ler(project_base(project))


@app.put("/api/projects/{project}/organizacao/{nome}")
def definir_organizacao(project: str, nome: str, data: dict):
    """Muda papel e squad de um agente, sem tocar no resto do yaml dele."""
    try:
        return {"ok": True, "agente": org.definir(
            project_base(project), nome,
            data.get("papel"), data.get("squad"), data.get("reporta_a"))}
    except KeyError:
        raise HTTPException(404, f"agente '{nome}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/agents/{nome}/enviar")
def enviar_agente(project: str, nome: str, data: dict):
    """Manda o ARQUÉTIPO de um agente para outro projeto.

    Só o que o agente é — prompt, ferramentas, temperatura, memórias que ele
    carrega por padrão. Papel, squad e o histórico ficam onde estão: eles não
    descrevem o agente, descrevem o trabalho dele naquele projeto. Por isso a
    cópia nunca chega mandando em ninguém do outro lado.

    O original não se mexe. Se lá já existe alguém com o nome, o novo entra com
    sufixo em vez de sobrescrever — nada de agente comido em silêncio.
    """
    destino_slug = str((data or {}).get("para") or "").strip()
    origem, destino = project_base(project), PROJECTS_DIR / destino_slug
    if not destino.is_dir():
        raise HTTPException(404, f"projeto '{destino_slug}' não encontrado")
    if destino_slug == project:
        raise HTTPException(400, "esse agente já está neste projeto")
    fonte = origem / "agents" / f"{nome}.yaml"
    if not fonte.exists():
        raise HTTPException(404, f"agente '{nome}' não encontrado")

    cfg = ler_agente_do_arquivo(fonte)
    for campo in ("papel", "squad", "reporta_a"):
        cfg.pop(campo, None)

    (destino / "agents").mkdir(parents=True, exist_ok=True)
    alvo, n = destino / "agents" / f"{nome}.yaml", 1
    while alvo.exists():
        n += 1
        alvo = destino / "agents" / f"{nome}_{n}.yaml"
    alvo.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False, width=88),
                    encoding="utf-8")
    return {"ok": True, "para": destino_slug, "nome": alvo.stem,
            "renomeado": alvo.stem != nome}


@app.post("/api/projects/{project}/squads")
def criar_squad(project: str, data: dict):
    """Cria uma squad. Você ou um agente — desenhar a organização é trabalho deles também."""
    try:
        return {"ok": True, "squad": org.criar_squad(
            project_base(project), str(data.get("nome") or ""),
            str(data.get("por") or "usuario"), str(data.get("cor") or ""),
            str(data.get("icone") or ""), str(data.get("descricao") or ""))}
    except KeyError as e:
        raise HTTPException(409, f"já existe uma squad '{e.args[0]}'")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/api/projects/{project}/squads/{chave}")
def editar_squad(project: str, chave: str, data: dict):
    """Renomeia, troca a cor, o ícone ou o que a squad cuida."""
    try:
        return {"ok": True, "squad": org.editar_squad(project_base(project), chave, data)}
    except KeyError as e:
        raise HTTPException(404, f"squad '{e.args[0] if e.args else chave}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/projects/{project}/squads/{chave}")
def apagar_squad(project: str, chave: str):
    """Apaga a squad e solta quem estava nela. Agente nenhum é apagado."""
    return {"ok": True, "soltos": org.apagar_squad(project_base(project), chave)}


@app.get("/api/projects/{project}/organizacao/{nome}/cadeia")
def ler_cadeia(project: str, nome: str):
    """A cadeia de comando deste agente — o que o despacho dele carrega."""
    try:
        return {"cadeia": org.cadeia_de(project_base(project), nome)}
    except KeyError:
        raise HTTPException(404, f"agente '{nome}' não encontrado")


# ── Agents ────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project}/agents")
def list_agents(project: str):
    result = []
    for f in sorted(agents_dir(project).glob("*.yaml")):
        cfg = ler_agente_do_arquivo(f, protocolo=False)
        result.append({
            "name":        f.stem,
            "nickname":     nickname_de(project, f.stem),
            "displayName": cfg.get("name", f.stem),
            "description": (cfg.get("description") or "").strip()[:80],
        })
    return result


# ── A ficha do agente ────────────────────────────────────────────────────────
# A tela do agente precisa de seis coisas: o que ele é, o que ele faz AQUI, a
# memória que carrega, XP e nível, os Learnings e o histórico. Buscar isso em
# quatro pedidos foi o que deixou a troca de projeto lenta antes — então é um
# só, e as duas metades vêm SEPARADAS de propósito: quem desenha a tela não
# pode ter de adivinhar o que é herdado e o que é daqui.

def _learnings_do_agente(base: Path, nome: str) -> list[dict]:
    fora = []
    for chave, s in (rep.carregar(base) or {}).items():
        if nome not in (s.get("vinculados") or []):
            continue
        fora.append({"chave": chave, "rotulo": s.get("rotulo") or chave,
                     "estado": s.get("estado") or "broto",
                     "especie": s.get("especie") or "", "tags": s.get("tags") or [],
                     "temCorpo": bool(s.get("temCorpo")),
                     "descricao": (s.get("descricao") or "").strip()})
    fora.sort(key=lambda x: (x["estado"] != "firmada", x["rotulo"].lower()))
    return fora


def _contexto_acoplado(base: Path, cfg: dict) -> list[dict]:
    """As memórias que este agente carrega, com o tipo de cada uma — é o que a
    seção "Contexto acoplado" mostra."""
    idx = _load_identity(base)
    fora = []
    for mf in (cfg.get("memory_files") or []):
        stem = Path(str(mf)).stem
        meta = idx.get(f"memory:{stem}", {}) or {}
        p = base / "memory" / f"{stem}.md"
        fora.append({"nome": stem, "existe": p.exists(),
                     "tipo": meta.get("type") or "", "origem": meta.get("origin") or "",
                     "autor": meta.get("autor") or ""})
    return fora


@app.get("/api/nicknames")
def listar_nicknames():
    """O banco de nicknames: quem tem qual, e quantos nomes ainda há.

    Serve à tela de Configurações. O identificador vem junto porque é ele que
    endereça — ver os dois lado a lado é o que impede confundi-los.
    """
    base = PROJECTS_DIR
    # A varredura de órfãos acontece aqui, e não em toda listagem de recursos:
    # ela percorre o banco inteiro e olha o disco de todos os projetos. Pagar
    # isso a cada grade de cards seria caro para um caso que só muda quando um
    # agente some — e quem abre esta tela é justamente quem quer o banco em dia.
    liberados = (nick.liberar_orfaos(BASE_DIR, base)
                 if regras.valor("agentes.liberar_nickname_orfao") else [])

    dados = nick.todos(BASE_DIR)
    fora = []
    for ident, nome in sorted(dados.items(), key=lambda kv: kv[1].lower()):
        proj, _, agente = ident.partition(":")
        fora.append({"identificador": ident, "nickname": nome,
                     "projeto": proj, "agente": agente,
                     "existe": (base / proj / "agents" / f"{agente}.yaml").exists()})
    return {"nicknames": fora, "usados": len(dados),
            "livres": len(nick.livres(BASE_DIR)), "banco": len(nick.BANCO),
            # Dizer o que foi liberado, e não liberar em silêncio: o nome de um
            # agente aparece no histórico de quem leu, e sumir sem aviso é pior
            # do que continuar preso.
            "liberados": [{"identificador": i, "nickname": n} for i, n in liberados]}


@app.put("/api/nicknames/{projeto}/{agente}")
def trocar_nickname(projeto: str, agente: str, data: dict):
    try:
        novo = nick.definir(BASE_DIR, projeto, agente, str((data or {}).get("nickname") or ""))
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"ok": True, "nickname": novo}


@app.get("/api/arquetipos")
def listar_arquetipos():
    fora = []
    for a in arqs.listar(PROJECTS_DIR / BASE_SLUG):
        a["acoplado_em"] = [d.name for d in sorted(PROJECTS_DIR.iterdir())
                            if (d / "agents" / f"{a['slug']}.yaml").exists()
                            and load_yaml(d / "agents" / f"{a['slug']}.yaml").get("arquetipo") == a["slug"]]
        fora.append(a)
    return {"arquetipos": fora}


@app.get("/api/arquetipos/{slug}")
def ver_arquetipo(slug: str):
    """O agente CRU: o que ele é, e onde ele trabalha.

    A tabela de contextos é a resposta a "quero ver todos os contextos por
    projeto". Cada linha traz nível, XP, Learnings e último trabalho DAQUELE
    projeto — nunca um número somado, porque nível cross-projeto seria mentira:
    o agente subiria de nível onde nunca trabalhou.
    """
    arq = arqs.ler(PROJECTS_DIR / BASE_SLUG, slug)
    if arq is None:
        raise HTTPException(404, f"arquétipo '{slug}' não encontrado")

    contextos = []
    for d in sorted(PROJECTS_DIR.iterdir()):
        f = d / "agents" / f"{slug}.yaml"
        if not f.exists() or load_yaml(f).get("arquetipo") != slug:
            continue
        cru = load_yaml(f)
        pr = ler_progresso_agente(d.name, slug)
        contextos.append({
            "projeto": d.name, "projetoNome": _project_display_name(d),
            "papel": cru.get("papel") or "", "squad": cru.get("squad") or "",
            "memorias": len(cru.get("memory_files") or []),
            "temPromptLocal": bool(str(cru.get("prompt_local") or "").strip()),
            "nivel": pr.get("nivel", 0), "xp": pr.get("xp", 0),
            "eventos": pr.get("eventos", 0), "ultima": pr.get("ultima"),
            "learnings": len(_learnings_do_agente(d, slug)),
        })
    return {"slug": slug, "arquetipo": arq, "contextos": contextos}


@app.get("/api/projects/{project}/agents/{name}/ficha")
def ficha_do_agente(project: str, name: str):
    base = project_base(project)
    caminho = caminho_de_recurso(base, "agents", name, ".yaml")
    if not caminho.exists():
        raise HTTPException(404, f"Agente '{name}' não encontrado")

    cru = load_yaml(caminho)
    resolvido = ler_agente_do_arquivo(caminho)
    slug = str(cru.get("arquetipo") or "").strip()

    herdado, daqui = arqs.partir(resolvido)
    if not slug:
        # Agente local: tudo é daqui, e a tela diz isso em vez de fingir herança.
        daqui = {**herdado, **daqui}
        herdado = {}

    return {
        "nome": name, "projeto": project,
        # O endereço e o nome. O primeiro é derivado e serve para máquina; o
        # segundo vem do banco e serve para gente. Nunca trocam de pnick.
        "identificador": nick.identificador(project, name),
        # Atribuir na leitura é o que faz todo agente já existente ter um sem
        # ninguém rodar nada. Com a regra desligada, só mostra o que já tem.
        "nickname": nickname_de(project, name),
        "arquetipo": slug or None,
        "desacoplado": bool(cru.get("desacoplado")),
        "arquetipo_ausente": resolvido.get("arquetipo_ausente"),
        "herdado": herdado,
        "daqui": {k: v for k, v in daqui.items()
                  if k not in ("arquetipo", "desacoplado", "arquetipo_ausente")},
        "contexto": _contexto_acoplado(base, resolvido),
        "progresso": ler_progresso_agente(project, name),
        "learnings": _learnings_do_agente(base, name),
        # Onde mais este mesmo arquétipo está acoplado — a ponte para o modo cru.
        "tambem_em": [d.name for d in sorted(PROJECTS_DIR.iterdir())
                      if slug and d.name != project
                      and (d / "agents" / f"{name}.yaml").exists()
                      and load_yaml(d / "agents" / f"{name}.yaml").get("arquetipo") == slug],
    }


@app.get("/api/projects/{project}/agents/{name}")
def get_agent(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    if not path.exists():
        raise HTTPException(404, f"Agente '{name}' não encontrado")
    return ler_agente_do_arquivo(path)


@app.put("/api/projects/{project}/agents/{name}")
def save_agent(project: str, name: str, data: dict):
    caminho = caminho_de_recurso(project_base(project), "agents", name, ".yaml")

    # Se este agente é um acoplamento, o que chega vem RESOLVIDO — a tela leu o
    # agente inteiro, arquétipo incluído. Gravar isso direto enfiaria o prompt
    # herdado dentro do acoplamento, que passaria a sombrear o arquétipo: o
    # vínculo morreria em silêncio e as melhorias feitas no arquétipo parariam
    # de chegar aqui. Então a gravação separa as duas metades de volta.
    atual = load_yaml(caminho) if caminho.exists() else {}
    slug = str(atual.get("arquetipo") or "").strip()
    if slug and not atual.get("desacoplado"):
        arq_novo, aco = arqs.partir(dict(data))
        aco["arquetipo"] = slug
        aco.pop("arquetipo_ausente", None)

        # O prompt que volta traz o bloco de protocolo, que é gerado e não
        # editado. Ele sai antes da comparação, senão toda gravação pareceria
        # uma mudança do arquétipo.
        if arq_novo.get("system_prompt"):
            arq_novo["system_prompt"] = arqs.sem_protocolo(str(arq_novo["system_prompt"])).rstrip() + "\n"
        arq_antigo = arqs.ler(PROJECTS_DIR / BASE_SLUG, slug) or {}
        mudou = [k for k in arqs.CAMPOS_DO_ARQUETIPO
                 if k in arq_novo and str(arq_novo.get(k)) != str(arq_antigo.get(k))]
        if mudou:
            arqs.gravar(PROJECTS_DIR / BASE_SLUG, slug, {**arq_antigo, **arq_novo})

        save_yaml(caminho, aco)
        outros = [d.name for d in PROJECTS_DIR.iterdir()
                  if d.name != project
                  and (d / "agents" / f"{name}.yaml").exists()
                  and load_yaml(d / "agents" / f"{name}.yaml").get("arquetipo") == slug]
        return {"ok": True, "arquetipo": slug, "mudou_no_arquetipo": mudou,
                "afetou": outros if mudou else []}

    save_yaml(caminho, data)
    return {"ok": True}


@app.delete("/api/projects/{project}/agents/{name}")
def delete_agent(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
    # O nickname volta ao banco: ele é do agente aplicado, e o agente aplicado
    # deixou de existir. Segurar o nome só esgotaria o banco com fantasmas.
    nick.soltar(BASE_DIR, project, name)
    return {"ok": True}


@app.post("/api/projects/{project}/agents/{name}/rename")
def rename_agent(project: str, name: str, data: dict):
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name obrigatório")
    old = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    new = caminho_de_recurso(project_base(project), "agents", new_name, ".yaml")
    if not old.exists():
        raise HTTPException(404)
    if new.exists():
        raise HTTPException(409, f"'{new_name}' já existe")
    old.rename(new)
    # O identificador muda com o nome do arquivo, então o nickname muda de
    # endereço junto. O nome em si não muda: quem era Vega continua Vega.
    antigo = nick.de(BASE_DIR, project, name)
    nick.soltar(BASE_DIR, project, name)
    if antigo:
        nick.definir(BASE_DIR, project, new_name, antigo)
    return {"ok": True}


# ── Flows ─────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project}/flows")
def list_flows(project: str):
    result = []
    for f in sorted(flows_dir(project).glob("*.yaml")):
        cfg = load_yaml(f)
        result.append({
            "name":        f.stem,
            "displayName": cfg.get("name", f.stem),
            "description": (cfg.get("description") or "").strip()[:80],
        })
    return result


@app.get("/api/projects/{project}/flows/{name}")
def get_flow(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "flows", name, ".yaml")
    if not path.exists():
        raise HTTPException(404, f"Fluxo '{name}' não encontrado")
    return load_yaml(path)


@app.put("/api/projects/{project}/flows/{name}")
def save_flow(project: str, name: str, data: dict):
    save_yaml(caminho_de_recurso(project_base(project), "flows", name, ".yaml"), data)
    return {"ok": True}


@app.delete("/api/projects/{project}/flows/{name}")
def delete_flow(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "flows", name, ".yaml")
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
    return {"ok": True}


@app.post("/api/projects/{project}/flows/{name}/rename")
def rename_flow(project: str, name: str, data: dict):
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name obrigatório")
    old = caminho_de_recurso(project_base(project), "flows", name, ".yaml")
    new = caminho_de_recurso(project_base(project), "flows", new_name, ".yaml")
    if not old.exists():
        raise HTTPException(404)
    if new.exists():
        raise HTTPException(409, f"'{new_name}' já existe")
    old.rename(new)
    return {"ok": True}


# ── Memory ────────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project}/memory")
def list_memory(project: str):
    out = []
    for f in sorted(memory_dir(project).glob("*.md")):
        out.append({"name": f.stem, "filename": f.name,
                    **_thumbs_payload(_attachments(project, f.stem))})
    return out


@app.get("/api/projects/{project}/memory/{name}")
def get_memory(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "memory", name, ".md")
    if not path.exists():
        raise HTTPException(404)
    return {"content": path.read_text(encoding="utf-8")}


@app.put("/api/projects/{project}/memory/{name}")
def save_memory(project: str, name: str, data: dict):
    path = caminho_de_recurso(project_base(project), "memory", name, ".md")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data.get("content", ""), encoding="utf-8")
    return {"ok": True}


@app.delete("/api/projects/{project}/memory/{name}")
def delete_memory(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "memory", name, ".md")
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
    shutil.rmtree(_attach_dir(project, name), ignore_errors=True)
    return {"ok": True}


@app.post("/api/projects/{project}/memory/{name}/rename")
def rename_memory(project: str, name: str, data: dict):
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name obrigatório")
    old = caminho_de_recurso(project_base(project), "memory", name, ".md")
    new = caminho_de_recurso(project_base(project), "memory", new_name, ".md")
    if not old.exists():
        raise HTTPException(404)
    if new.exists():
        raise HTTPException(409, f"'{new_name}' já existe")
    old.rename(new)
    # Reflete o rename em todos os mapas, e no índice de identidade.
    base = project_base(project)
    _rename_em_todos_mapas(base, "memory", name, new_name)
    agentes = _rename_em_memory_files(base, name, new_name)
    anexos = _attach_dir(project, name)
    if anexos.is_dir():
        anexos.rename(_attach_dir(project, new_name))
    return {"ok": True, "agentesAtualizados": agentes}


# ── CRUD genérico por kind ────────────────────────────────────────────────────
#
# `agents`, `memory`, `flows` e `personas` têm cada um a sua família de rotas,
# escritas à mão e quase idênticas. Duplicar isso a cada tipo novo é como as
# seis tabelas de kind nasceram.
#
# Estas rotas servem QUALQUER kind declarado em `KINDS`, e são as que `task` e
# `artifact` usam. As antigas continuam onde estão: elas têm particularidades
# reais (a ficha do agente, os anexos da memória) e reescrevê-las agora seria
# mexer no que funciona para ganhar simetria.

def _kind_valido(kind: str) -> dict:
    k = KINDS.get(kind)
    if not k:
        raise HTTPException(404, f"tipo de recurso desconhecido: {kind!r}")
    return k


def verificar_peca(texto: str, esc) -> list[str]:
    """Os motivos pelos quais esta peça NÃO pode ser aprovada. Lista vazia = passa.

    Nenhum julgamento de LLM aqui: são checagens que a máquina faz igual toda
    vez. A lista de termos e o travessão saem do registro de regras, escopados —
    o hub que produz pode ter uma lista que o hub que governa não tem.
    """
    motivos: list[str] = []
    baixo = texto.lower()
    for termo in regras.valor("producao.vocabulario_banido", esc):
        if str(termo).lower() in baixo:
            motivos.append(f"usa a palavra banida {termo!r}")
    if regras.valor("producao.sem_travessao", esc) and "—" in texto:
        motivos.append("contém travessão (—)")
    return motivos


# ── O estado declarado do projeto ─────────────────────────────────────────────

@app.get("/api/projects/{project}/estado")
def ler_estado(project: str):
    base = project_base(project)
    return {**est.ler(base), "mudancas": est.mudancas(base)}


@app.put("/api/projects/{project}/estado")
def gravar_estado(project: str, data: dict):
    base = project_base(project)
    try:
        novo = est.gravar(base, data.get("estado") or {},
                          ator=str(data.get("ator") or "usuario"),
                          motivo=str(data.get("motivo") or ""),
                          origem=str(data.get("origem") or ""))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True, **novo, "mudancas": est.mudancas(base)}


@app.post("/api/projects/{project}/estado/mudancas/{indice}/responder")
def responder_mudanca(project: str, indice: int, data: dict):
    base = project_base(project)
    try:
        r = est.responder(base, indice, str(data.get("veredito") or ""),
                          str(data.get("por") or "usuario"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except IndexError:
        raise HTTPException(404, "mudança não encontrada")
    return {**r, "mudancas": est.mudancas(base)}


@app.post("/api/projects/{project}/recursos/artifact/{name}/verificar")
def verificar_artifact(project: str, name: str):
    """Roda o verificador sem gravar nada. É o que a tela chama para avisar antes."""
    base = project_base(project)
    path = caminho_de_recurso(base, "artifacts", name, ".md")
    if not path.exists():
        raise HTTPException(404)
    meta, corpo = _frente_materia(path)
    motivos = verificar_peca(corpo, regras.escopo_de_projeto(project))
    return {"passa": not motivos, "motivos": motivos, "estado": meta.get("estado")}


@app.get("/api/projects/{project}/recursos/{kind}")
def listar_recursos_do_kind(project: str, kind: str):
    k = _kind_valido(kind)
    pasta = project_base(project) / k["pasta"]
    if not pasta.is_dir():
        return []
    return [{"name": f.stem, "filename": f.name} for f in sorted(pasta.glob(f'*{k["ext"]}'))]


@app.get("/api/projects/{project}/recursos/{kind}/{name}")
def ler_recurso(project: str, kind: str, name: str):
    k = _kind_valido(kind)
    path = caminho_de_recurso(project_base(project), k["pasta"], name, k["ext"])
    if not path.exists():
        raise HTTPException(404)
    texto = path.read_text(encoding="utf-8")
    # YAML volta estruturado e Markdown volta como texto, que é a diferença que
    # o editor de cada um espera — e ela sai da declaração, não de um `if` por
    # tipo espalhado pelas telas.
    if k["ext"] == ".yaml":
        return {"content": texto, "dados": load_yaml(path) or {}}
    return {"content": texto}


@app.put("/api/projects/{project}/recursos/{kind}/{name}")
def gravar_recurso(project: str, kind: str, name: str, data: dict):
    k = _kind_valido(kind)
    base = project_base(project)
    path = caminho_de_recurso(base, k["pasta"], name, k["ext"])
    path.parent.mkdir(parents=True, exist_ok=True)

    if kind == "artifact":
        esc = regras.escopo_de_projeto(project)
        texto = data.get("content", "")
        meta, corpo = _partir_texto(texto)
        estado = str(meta.get("estado") or ESTADOS_ARTIFACT[0])
        # O GATE, e ele roda aqui — na escrita — porque é isso que o separa de
        # uma promessa no prompt. Recusar depois, na leitura, seria avisar que
        # a peça já aprovada não devia estar aprovada.
        if estado == "approved" and regras.valor("producao.gate_editorial", esc):
            motivos = verificar_peca(corpo, esc)
            if motivos:
                raise HTTPException(422, "a peça não passa no verificador: " + "; ".join(motivos))
        # A auto-aprovação nasce desligada e só existe com o verificador ligado:
        # sem ele, seria aprovação sem verificação.
        if (estado == "generated"
                and regras.valor("producao.aprovacao_automatica", esc)
                and regras.valor("producao.gate_editorial", esc)
                and not verificar_peca(corpo, esc)):
            meta["estado"] = "approved"
            texto = _montar_texto(meta, corpo)
        path.write_text(texto, encoding="utf-8")
        return {"ok": True, "estado": str(_partir_texto(texto)[0].get("estado") or estado)}

    if k["ext"] == ".yaml" and isinstance(data.get("dados"), dict):
        save_yaml(path, data["dados"])
    else:
        path.write_text(data.get("content", ""), encoding="utf-8")
    return {"ok": True}


@app.delete("/api/projects/{project}/recursos/{kind}/{name}")
def apagar_recurso(project: str, kind: str, name: str):
    k = _kind_valido(kind)
    path = caminho_de_recurso(project_base(project), k["pasta"], name, k["ext"])
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
    return {"ok": True}


@app.post("/api/projects/{project}/recursos/{kind}/{name}/rename")
def renomear_recurso(project: str, kind: str, name: str, data: dict):
    k = _kind_valido(kind)
    novo_nome = (data.get("new_name") or "").strip()
    if not novo_nome:
        raise HTTPException(400, "new_name obrigatório")
    base = project_base(project)
    old = caminho_de_recurso(base, k["pasta"], name, k["ext"])
    new = caminho_de_recurso(base, k["pasta"], novo_nome, k["ext"])
    if not old.exists():
        raise HTTPException(404)
    if new.exists():
        raise HTTPException(409, f"'{novo_nome}' já existe")
    old.rename(new)
    # O mapa e o índice de identidade seguem o nome, como em qualquer recurso:
    # sem isto o card perderia cor e tags ao ser renomeado.
    _rename_em_todos_mapas(base, kind, name, novo_nome)
    return {"ok": True}


# ── Anexos de memória ─────────────────────────────────────────────────────────
#
# Os anexos de uma memória vivem em `memory/<nome>.anexos/`, pasta irmã do `.md`.
# Colada ao arquivo, e não num diretório central, para que renomear e apagar a
# memória levem os anexos junto sem nenhum índice para manter em sincronia.
#
# O upload chega em JSON com o conteúdo em base64, e não em multipart, porque
# `python-multipart` não está instalado e uma dependência a mais só para isso
# obrigaria a reinstalar o ambiente de quem já roda o estúdio. O preço é o
# inchaço de 33% do base64, que o teto de 25 MB por arquivo mantém aceitável.

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"}
DOC_EXT = {".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".csv",
           ".xls", ".xlsx", ".ods", ".ppt", ".pptx", ".odp", ".json", ".yaml", ".yml"}
ATTACH_EXT = IMAGE_EXT | DOC_EXT
MAX_ATTACH_BYTES = 25 * 1024 * 1024


def _attach_dir_for(base: Path, name: str) -> Path:
    """`memory/<nome>.anexos/`, espelhando o nome do `.md` que ela acompanha.

    `Path(name).name` corta qualquer diretório antes de compor o caminho, que é
    o que impede um `..` vindo da URL de escapar da pasta do projeto.
    """
    return base / "memory" / f"{Path(name).name}.anexos"


def _attach_dir(project: str, name: str) -> Path:
    return _attach_dir_for(project_base(project), name)


def _safe_attach_name(filename: str) -> str:
    """Nome de arquivo seguro, preservando a extensão.

    `Path(...).name` corta qualquer diretório, o que já barra `../`; o resto da
    limpeza é para o nome não depender do sistema de arquivos de quem subiu.
    """
    raw = Path(str(filename or "")).name
    stem, dot, ext = raw.rpartition(".")
    if not dot:
        raise HTTPException(400, "Arquivo sem extensão")
    ext = "." + ext.lower()
    if ext not in ATTACH_EXT:
        raise HTTPException(400, f"Extensão '{ext}' não permitida")
    stem = re.sub(r"[^\w\s.-]", "", stem, flags=re.UNICODE).strip().replace(" ", "-")
    stem = re.sub(r"-{2,}", "-", stem)[:80] or "anexo"
    return stem + ext


def _attachment_info(path: Path, project: str, name: str) -> dict:
    ext = path.suffix.lower()
    return {
        "filename": path.name,
        "size": path.stat().st_size,
        "ext": ext,
        "isImage": ext in IMAGE_EXT,
        "mime": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        "url": f"/api/projects/{project}/memory/{name}/anexos/{path.name}",
    }


def _attachments_for(base: Path, name: str) -> list[dict]:
    """Anexos de uma memória. `base.name` é o slug do projeto, que compõe a URL."""
    d = _attach_dir_for(base, name)
    if not d.is_dir():
        return []
    return [_attachment_info(f, base.name, name)
            for f in sorted(d.iterdir()) if f.is_file()]


def _attachments(project: str, name: str) -> list[dict]:
    return _attachments_for(project_base(project), name)


THUMB_MAX = 6


def _thumbs_payload(anexos: list[dict]) -> dict:
    """Campos que o card do mapa consome: contagem e a grade de miniaturas.

    `images` vai separado de `len(thumbs)` para o card conseguir escrever o
    "+N" da última célula sem carregar as URLs que não vai desenhar.
    """
    imagens = [a["url"] for a in anexos if a["isImage"]]
    return {"attachments": len(anexos), "images": len(imagens),
            "thumbs": imagens[:THUMB_MAX]}


@app.get("/api/projects/{project}/memory/{name}/anexos")
def list_attachments(project: str, name: str):
    return _attachments(project, name)


@app.post("/api/projects/{project}/memory/{name}/anexos")
def upload_attachment(project: str, name: str, data: dict):
    if not (caminho_de_recurso(project_base(project), "memory", name, ".md")).exists():
        raise HTTPException(404, f"Memória '{name}' não encontrada")
    payload = data.get("data") or ""
    if "," in payload[:120] and payload.lstrip().startswith("data:"):
        payload = payload.split(",", 1)[1]          # data URL vinda do FileReader
    try:
        blob = base64.b64decode(payload, validate=True)
    except Exception:
        raise HTTPException(400, "Conteúdo não é base64 válido")
    if not blob:
        raise HTTPException(400, "Arquivo vazio")
    if len(blob) > MAX_ATTACH_BYTES:
        raise HTTPException(413, f"Arquivo passa de {MAX_ATTACH_BYTES // (1024 * 1024)} MB")

    fname = _safe_attach_name(data.get("filename"))
    d = _attach_dir(project, name)
    d.mkdir(parents=True, exist_ok=True)
    dest = d / fname
    # Não sobrescreve em silêncio: dois arquivos com o mesmo nome convivem.
    if dest.exists():
        stem, ext = dest.stem, dest.suffix
        i = 2
        while (d / f"{stem}-{i}{ext}").exists():
            i += 1
        dest = d / f"{stem}-{i}{ext}"
    dest.write_bytes(blob)
    return _attachment_info(dest, project, name)


@app.get("/api/projects/{project}/memory/{name}/anexos/{filename}")
def get_attachment(project: str, name: str, filename: str):
    path = _attach_dir(project, name) / Path(filename).name
    if not path.is_file():
        raise HTTPException(404)
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    # `inline` para a imagem e o PDF abrirem no drawer em vez de baixar.
    return FileResponse(path, media_type=mime,
                        headers={"Content-Disposition": f'inline; filename="{path.name}"'})


@app.delete("/api/projects/{project}/memory/{name}/anexos/{filename}")
def delete_attachment(project: str, name: str, filename: str):
    path = _attach_dir(project, name) / Path(filename).name
    if not path.is_file():
        raise HTTPException(404)
    path.unlink()
    d = path.parent
    if not any(d.iterdir()):
        d.rmdir()
    return {"ok": True}


# ── Mapa de memória (canvas) ──────────────────────────────────────────────────

CANVAS_PALETTE = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
                  "#10b981", "#06b6d4", "#ef4444", "#84cc16"]



# ── Mapas ─────────────────────────────────────────────────────────────────────
# Um projeto tem vários mapas, cada um em canvases/<id>.json. Um mapa é um
# RECORTE: os mesmos recursos podem aparecer em quantos mapas fizer sentido, com
# lane e peso próprios em cada um. O que descreve o recurso em si — cor, ícone,
# tags, ativa/inativa — mora no resources.json e é o mesmo em todos.

CANVAS_LEGADO = "memory_canvas.json"


def _canvases_dir(base: Path) -> Path:
    return base / "canvases"


def _canvas_path(base: Path, canvas_id: str = "principal") -> Path:
    return _canvases_dir(base) / f"{slugify(canvas_id) or 'principal'}.json"


def _migrar_canvas_legado(base: Path) -> None:
    """Move o memory_canvas.json para canvases/principal.json, uma única vez.

    O arquivo antigo é preservado com sufixo .migrado: se algo der errado aqui,
    o mapa que a pessoa montou à mão não pode se perder.
    """
    d = _canvases_dir(base)
    if d.is_dir() and any(d.glob("*.json")):
        return
    legado = base / CANVAS_LEGADO
    d.mkdir(parents=True, exist_ok=True)
    if legado.exists():
        try:
            dados = json.loads(legado.read_text(encoding="utf-8"))
        except Exception:
            dados = {}
        dados = {"id": "principal", "name": "Mapa principal",
                 "lanes": dados.get("lanes") or [],
                 "nodes": dados.get("nodes") or [],
                 "edges": dados.get("edges") or []}
        _canvas_path(base, "principal").write_text(
            json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            legado.rename(base / (CANVAS_LEGADO + ".migrado"))
        except Exception:
            pass


def _canvas_list(base: Path) -> list[dict]:
    _migrar_canvas_legado(base)
    d = _canvases_dir(base)
    out = []
    for f in sorted(d.glob("*.json")):
        try:
            dados = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            dados = {}
        nos = dados.get("nodes") or []
        lanes = dados.get("lanes") or []
        out.append({
            "id": f.stem,
            "name": dados.get("name") or f.stem,
            "nodes": len(nos),
            "lanes": len(lanes),
            # Miniatura do arranjo, para o card do cosmos mostrar a forma do mapa
            # em vez de só um número. Coordenadas absolutas: nó dentro de lane é
            # relativo a ela, e sem somar tudo cairia no canto.
            "preview": _canvas_preview(nos, lanes),
        })
    if not out:                                  # projeto sem mapa nenhum
        _save_canvas_file(base, {"id": "principal", "name": "Mapa principal",
                                 "lanes": [], "nodes": [], "edges": []}, "principal")
        out = [{"id": "principal", "name": "Mapa principal", "nodes": 0, "lanes": 0}]
    return out


def _canvas_preview(nos: list, lanes: list, limite: int = 60) -> list:
    """Retângulos normalizados em 0..1, para desenhar a miniatura do mapa."""
    porLane = {l.get("id"): l for l in lanes if l.get("id")}
    caixas = []
    for n in nos[:limite]:
        pai = porLane.get(n.get("parent"))
        x = n.get("x", 0) + (pai.get("x", 0) if pai else 0)
        y = n.get("y", 0) + (pai.get("y", 0) if pai else 0)
        caixas.append([x, y, n.get("width") or 264, n.get("height") or 176,
                       n.get("color") or "#3b82f6"])
    for l in lanes:
        caixas.append([l.get("x", 0), l.get("y", 0),
                       l.get("width") or 460, l.get("height") or 320, None])
    if not caixas:
        return []
    x0 = min(c[0] for c in caixas); y0 = min(c[1] for c in caixas)
    x1 = max(c[0] + c[2] for c in caixas); y1 = max(c[1] + c[3] for c in caixas)
    larg = max(1, x1 - x0); alt = max(1, y1 - y0)
    return [{"x": round((c[0] - x0) / larg, 4), "y": round((c[1] - y0) / alt, 4),
             "w": round(c[2] / larg, 4), "h": round(c[3] / alt, 4),
             "color": c[4], "lane": c[4] is None}
            for c in caixas]


# ── Cosmos: o mapa dos mapas ─────────────────────────────────────────────────
# Uma camada acima do canvas. Guarda só o arranjo — onde cada mapa fica e o que
# aponta para o quê. Os mapas em si continuam donos do próprio conteúdo, e um
# mapa some daqui sozinho quando o arquivo dele deixa de existir.

def _cosmos_path(base: Path) -> Path:
    return base / "cosmos.json"


def _load_cosmos(base: Path) -> dict:
    p = _cosmos_path(base)
    if p.exists():
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                d.setdefault("nodes", []); d.setdefault("edges", [])
                return d
        except Exception:
            pass
    return {"nodes": [], "edges": []}


def _canvas_default(base: Path) -> str:
    lst = _canvas_list(base)
    return "principal" if any(c["id"] == "principal" for c in lst) else lst[0]["id"]


def _load_canvas_file(base: Path, canvas_id: str | None = None) -> dict:
    _migrar_canvas_legado(base)
    canvas_id = canvas_id or _canvas_default(base)
    path = _canvas_path(base, canvas_id)
    vazio = {"id": canvas_id, "name": canvas_id, "lanes": [], "nodes": [], "edges": []}
    if not path.exists():
        return vazio
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("id", canvas_id)
        data.setdefault("name", canvas_id)
        data.setdefault("lanes", [])
        data.setdefault("nodes", [])
        data.setdefault("edges", [])
        return data
    except Exception:
        return vazio


def _save_canvas_file(base: Path, data: dict, canvas_id: str | None = None) -> None:
    canvas_id = canvas_id or data.get("id") or _canvas_default(base)
    _canvases_dir(base).mkdir(parents=True, exist_ok=True)
    data = {**data, "id": canvas_id, "name": data.get("name") or canvas_id}
    _canvas_path(base, canvas_id).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _rename_em_memory_files(base: Path, name: str, new_name: str) -> int:
    """Corrige `memory_files` dos agentes quando uma memória é renomeada.

    Editado como texto, não recarregado como YAML: os system_prompt são blocos
    literais e reescrevê-los pelo dumper mudaria a formatação de arquivos que a
    pessoa mantém à mão. Sem isto, renomear deixava a referência apontando para
    um arquivo que não existe mais — e o orchestrator só avisa e segue sem ela,
    então o agente perdia contexto sem ninguém perceber.
    """
    d = base / "agents"
    if not d.is_dir():
        return 0
    tocados = 0
    for f in sorted(d.glob("*.yaml")):
        txt = f.read_text(encoding="utf-8")
        novo = re.sub(rf"(^\s*-\s*)memory/{re.escape(name)}\.md[ 	]*$",
                      lambda m: f"{m.group(1)}memory/{new_name}.md", txt, flags=re.M)
        if novo != txt:
            f.write_text(novo, encoding="utf-8")
            tocados += 1
    return tocados


def _rename_em_todos_mapas(base: Path, kind: str, name: str, new_name: str) -> None:
    """Renomear um arquivo precisa alcançar cada mapa em que ele aparece,
    mais o índice de identidade — senão o card vira órfão e some na sincronia."""
    for c in _canvas_list(base):
        dados = _load_canvas_file(base, c["id"])
        nd = dados.get("nodes")
        mudou = False
        if isinstance(nd, list):
            for n in nd:
                if n.get("kind") == kind and n.get("name") == name:
                    n["name"] = new_name
                    n["id"] = f"{kind}:{new_name}"
                    mudou = True
        elif isinstance(nd, dict):                        # formato legado
            for key in (f"{kind}:{name}", name):
                if key in nd:
                    cfg = nd.pop(key); cfg["name"] = new_name; cfg["kind"] = kind
                    nd[f"{kind}:{new_name}"] = cfg
                    mudou = True
                    break
        if mudou:
            _save_canvas_file(base, dados, c["id"])
    idx = _load_identity(base)
    if f"{kind}:{name}" in idx:
        idx[f"{kind}:{new_name}"] = idx.pop(f"{kind}:{name}")
        _save_identity(base, idx)


def _existing_resources(base: Path) -> dict:
    out = {}
    for kind, (folder, pattern) in KIND_DIRS.items():
        d = base / folder
        out[kind] = {f.stem for f in d.glob(pattern)} if d.is_dir() else set()
    return out


# ── Peso e condensação (usados pelo condensado de lane) ───────────────────────
# Regra fundamental: NADA aqui escreve nos arquivos de origem. O peso governa
# apenas quanto de cada arquivo entra no condensado da lane. Os .md do projeto
# permanecem intactos e continuam sendo a fonte da verdade.

WEIGHT_MIN, WEIGHT_MAX = 0.0, 10.0


def _weight_norm(v) -> float:
    """Peso da instância no canvas. 1.0 = neutro, 0 = fora do condensado."""
    try:
        w = float(v)
    except (TypeError, ValueError):
        w = 1.0
    return round(max(WEIGHT_MIN, min(WEIGHT_MAX, w)), 2)


def _trim_at_boundary(text: str, limit: int) -> str:
    """Corta em fronteira natural (parágrafo, frase, palavra) antes do limite."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for sep in ("\n\n", ". ", "\n", " "):
        i = cut.rfind(sep)
        if i > limit * 0.5:
            cut = cut[:i]
            break
    return cut.rstrip(" ,;:-") + " […]"


def _md_sections(text: str) -> list:
    """Quebra um markdown em seções (nível, título, corpo), preservando a ordem."""
    secs, cur = [], {"level": 0, "title": "", "body": []}
    for ln in text.splitlines():
        st = ln.strip()
        tok = st.split(" ")[0] if st else ""
        if tok and set(tok) == {"#"} and len(tok) <= 6:
            secs.append(cur)
            cur = {"level": len(tok), "title": st[len(tok):].strip(), "body": []}
        else:
            cur["body"].append(ln)
    secs.append(cur)
    return [x for x in secs if x["title"] or "\n".join(x["body"]).strip()]


def _condense_md(text: str, budget: int) -> str:
    """Reduz um markdown ao orçamento, distribuindo o corte entre as seções.

    Três defesas para o condensado não degenerar:
    1. Se os títulos sozinhos comeriam o orçamento, corta a profundidade
       (só H1, depois só H1-H2...) até a espinha caber em 40% do total.
    2. Cada seção recebe uma fatia proporcional ao seu tamanho original.
    3. Seção que não couber com um mínimo legível é omitida inteira, título
       junto, e aparece na lista de omitidas do rodapé.

    Nunca altera o arquivo de origem.
    """
    MIN_BODY = 120
    HEAD_MAX_RATIO = 0.4

    text = text.strip()
    if budget <= 0:
        return ""
    if len(text) <= budget:
        return text

    secs = _md_sections(text)

    # 1. Profundidade máxima de título que a espinha comporta.
    def heads_cost(depth: int) -> int:
        return sum(len(x["title"]) + x["level"] + 2
                   for x in secs if x["title"] and x["level"] <= depth)

    depth = max((x["level"] for x in secs if x["title"]), default=1)
    while depth > 1 and heads_cost(depth) > budget * HEAD_MAX_RATIO:
        depth -= 1

    # Seções abaixo da profundidade viram corpo da seção anterior.
    merged = []
    for sec in secs:
        keep_head = bool(sec["title"]) and sec["level"] <= depth
        if keep_head or not merged:
            merged.append({"level": sec["level"], "title": sec["title"] if keep_head else "",
                           "body": list(sec["body"])})
        else:
            if sec["title"]:
                merged[-1]["body"].append(sec["title"] + ".")
            merged[-1]["body"].extend(sec["body"])

    bodies = ["\n".join(x["body"]).strip() for x in merged]
    room = max(0, budget - heads_cost(depth))
    total = sum(len(b) for b in bodies) or 1

    # 2 e 3. Fatia proporcional, com mínimo legível.
    out, omitted = [], []
    for sec, body in zip(merged, bodies):
        head = ("#" * max(1, sec["level"]) + " " + sec["title"]) if sec["title"] else ""
        if not body:
            if head:
                out.append(head)
            continue
        share = int(room * len(body) / total)
        if share < MIN_BODY:
            if sec["title"]:
                omitted.append(sec["title"])
            continue
        if head:
            out.append(head)
        out.append(_trim_at_boundary(body, share))

    if omitted:
        out.append("*Seções omitidas por orçamento: " + " · ".join(omitted) + "*")
    return "\n\n".join(out).strip()


def _item_text(base: Path, kind: str, name: str) -> str:
    """Texto integral de um recurso, para entrar no condensado."""
    if kind == "memory":
        p = base / "memory" / f"{name}.md"
        return p.read_text(encoding="utf-8").strip() if p.exists() else ""

    if kind == "agent":
        cfg = load_yaml(base / "agents" / f"{name}.yaml")
        return "\n\n".join(x for x in [
            (cfg.get("description") or "").strip(),
            (cfg.get("system_prompt") or "").strip(),
        ] if x)

    if kind == "persona":
        cfg = load_yaml(base / "personas" / f"{name}.yaml")
        parts = [f"{cfg.get('name', name)} — {cfg.get('role', '')} ({cfg.get('age', '')})",
                 (cfg.get("company_profile") or "").strip(),
                 (cfg.get("bio") or "").strip()]
        for key, rot in (("goals_on_site", "Objetivos"), ("trust_signals", "Sinais de confiança"),
                         ("red_flags", "Red flags"), ("objections", "Objeções")):
            vals = cfg.get(key) or []
            if vals:
                parts.append(rot + ":\n" + "\n".join(f"- {v}" for v in vals))
        return "\n\n".join(x for x in parts if x)

    if kind == "flow":
        cfg = load_yaml(base / "flows" / f"{name}.yaml")
        parts = [(cfg.get("description") or "").strip()]
        for i, st in enumerate(cfg.get("steps") or []):
            parts.append(f"{i + 1}. [{st.get('id')}] agente: {st.get('agent')}\n"
                         + (st.get("instruction") or "").strip())
        return "\n\n".join(x for x in parts if x)

    return ""


def _digest_plan(base: Path, items: list, budget: int) -> list:
    """Distribui o orçamento da lane entre os itens, proporcional ao peso.

    Itens que cabem inteiros dentro da sua fatia devolvem a sobra para os
    demais, para o orçamento não se perder em arquivos pequenos.
    """
    plan = []
    for it in items:
        kind, name = it.get("kind", "memory"), it.get("name")
        if not name:
            continue
        text = _item_text(base, kind, name)
        plan.append({"kind": kind, "name": name, "weight": _weight_norm(it.get("weight")),
                     "chars": len(text), "_text": text,
                     "share": 0.0, "budget": 0, "kept": 0, "condensed": False})

    active = [p for p in plan if p["weight"] > 0]
    remaining, pool = budget, list(active)
    while pool:
        tw = sum(p["weight"] for p in pool) or 1
        settled = []
        for p in pool:
            alloc = int(remaining * p["weight"] / tw)
            if p["chars"] <= alloc:                 # cabe inteiro, a sobra volta
                p.update(budget=alloc, kept=p["chars"], condensed=False)
                settled.append(p)
        if not settled:
            for p in pool:
                alloc = int(remaining * p["weight"] / tw)
                p.update(budget=alloc, kept=min(p["chars"], alloc), condensed=True)
            break
        for p in settled:
            remaining -= p["chars"]
            pool.remove(p)

    tw_all = sum(p["weight"] for p in active) or 1
    for p in plan:
        p["share"] = round(100.0 * p["weight"] / tw_all, 1) if p["weight"] > 0 else 0.0
    return plan


def _lane_norm(l: dict) -> dict:
    return {
        "id":     str(l.get("id")),
        "name":   l.get("name", "Lane"),
        "x":      l.get("x", 0), "y": l.get("y", 0),
        "width":  int(l.get("width") or 460),
        "height": int(l.get("height") or 320),
        "color":  l.get("color", "#64748b"),
        # Mesmo saneamento das tags de recurso: aparadas, sem vazias, teto de 12.
        "tags":   [str(t).strip() for t in (l.get("tags") or []) if str(t).strip()][:12],
        # Orçamento (em caracteres) do condensado desta lane.
        "budget": max(1000, min(200000, int(l.get("budget") or 12000))),
    }


# ── Identidade do recurso ─────────────────────────────────────────────────────
# Cor, ícone, tags e o estado ativa/inativa descrevem o RECURSO, não a posição
# dele num mapa. Ficavam no nó do canvas, o que dava dois problemas: recurso
# fora de todo mapa não tinha identidade nenhuma, e com mais de um mapa a mesma
# memória podia estar ativa num e inativa noutro — sem resposta para o
# orchestrator. Peso e lane continuam no mapa, porque esses sim são por recorte.

# Os seis tipos. Obrigatório, e não é rótulo: o tipo decide o que entra no
# prompt por padrão, quanto pesa no condensado e se a informação envelhece.
MEMORY_TYPES = {
    "fundacao":   {"label": "Fundação",   "color": "#3b82f6", "icon": "GiStoneBlock",
                   "prompt": "sempre",  "peso": 1.5, "valida": False,
                   "desc": "Quem somos, o projeto, a stack, a voz. Base de tudo."},
    "decisao":    {"label": "Decisão",    "color": "#8b5cf6", "icon": "GiStamper",
                   "prompt": "sempre",  "peso": 2.0, "valida": False,
                   "desc": "O que já foi decidido e não se rediscute a cada tarefa."},
    "referencia": {"label": "Referência", "color": "#06b6d4", "icon": "GiMagnifyingGlass",
                   "prompt": "sob demanda", "peso": 1.0, "valida": False,
                   "desc": "Material de fora, analisado. Benchmark, método, DNA."},
    "estado":     {"label": "Estado",     "color": "#f59e0b", "icon": "GiCctvCamera",
                   "prompt": "sob demanda", "peso": 1.0, "valida": True,
                   "desc": "Fotografia do que existe hoje. Envelhece."},
    "output":     {"label": "Output",     "color": "#10b981", "icon": "GiPaperTray",
                   "prompt": "nunca",   "peso": 0.5, "valida": True,
                   "desc": "O que um fluxo produziu. Resultado, não insumo."},
    "nota":       {"label": "Nota",       "color": "#64748b", "icon": "GiNotebook",
                   "prompt": "sob demanda", "peso": 0.5, "valida": False,
                   "desc": "Recado curto, lembrete, link solto."},
}
DEFAULT_TYPE = "nota"

# Origem é outra pergunta, e por isso é campo separado: de onde veio o arquivo.
# Um output pode ter sido colado à mão, e uma nota pode ter saído de um fluxo.
MEMORY_ORIGINS = {
    "inserido":  {"label": "Inserido",  "desc": "Criado ou colado por uma pessoa."},
    "produzido": {"label": "Produzido", "desc": "Saiu de um agente ou fluxo."},
}
DEFAULT_ORIGIN = "inserido"


def _aparencia_path() -> Path:
    return BASE_DIR / "config" / "aparencia.json"


def _aparencia() -> dict:
    """O que a pessoa personalizou. Vazio quando nunca mexeu."""
    p = _aparencia_path()
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _cor_valida(v, padrao: str) -> str:
    v = str(v or "").strip()
    return v if _HEX.match(v) else padrao


# Tamanho dos ícones, em px. Limites frouxos o bastante para servir a quem quer
# o card compacto e a quem quer o desenho grande, e apertados o bastante para o
# layout não quebrar.
# Cada lugar onde um ícone é desenhado tem o seu ajuste. A lista cresceu junto
# com o sistema: organização, squad, doca e árvore nasceram depois dos quatro
# primeiros, e sem entrar aqui ficavam num tamanho fixo que ninguém controlava.
# ── Ícone e cor de tudo o mais ────────────────────────────────────────────────
# Tipos de recurso e de memória já eram configuráveis; o resto do sistema tinha
# ícone cravado no código. Agora cada lugar com desenho próprio entra aqui:
# as seções da faixa, os botões da doca, os papéis da organização e os estados
# do Learning. Grupo/chave é o que a tela usa para agrupar os controles.
SISTEMA_PADRAO: dict[str, dict] = {
    # seções da faixa de ícones
    "secao.estado":      {"grupo": "Seções", "label": "Estado", "icon": "GiCompass", "color": "#22d3ee"},
    "secao.tasks":       {"grupo": "Seções", "label": "Tarefas", "icon": "GiCheckedShield", "color": "#38bdf8"},
    "secao.artifacts":   {"grupo": "Seções", "label": "Peças", "icon": "GiStoneBlock", "color": "#a855f7"},
    "secao.agents":      {"grupo": "Seções", "label": "Agentes", "icon": "GiRobotGolem", "color": "#10b981"},
    "secao.organizacao": {"grupo": "Seções", "label": "Organização", "icon": "GiFamilyTree", "color": "#a78bfa"},
    "secao.memory":      {"grupo": "Seções", "label": "Memória", "icon": "GiBrain", "color": "#3b82f6"},
    "secao.flows":       {"grupo": "Seções", "label": "Fluxos", "icon": "GiDirectionSigns", "color": "#f59e0b"},
    "secao.personas":    {"grupo": "Seções", "label": "Personas", "icon": "GiDna1", "color": "#ec4899"},
    "secao.learning":     {"grupo": "Seções", "label": "Learning", "icon": "GiSkills", "color": "#10b981"},
    "secao.skillsclaude": {"grupo": "Seções", "label": "Skills", "icon": "GiBookCover", "color": "#0ea5e9"},
    "secao.runtime":     {"grupo": "Seções", "label": "Runtime", "icon": "GiPulse", "color": "#f472b6"},
    "secao.canvas":      {"grupo": "Seções", "label": "Mapa de Memória", "icon": "GiTreasureMap", "color": "#06b6d4"},
    "secao.cosmos":      {"grupo": "Seções", "label": "Cosmos", "icon": "GiGalaxy", "color": "#a78bfa"},
    "secao.controle":    {"grupo": "Seções", "label": "Controle", "icon": "GiControlTower", "color": "#38bdf8"},
    "secao.setup":       {"grupo": "Seções", "label": "Gerar Setup", "icon": "GiMagicSwirl", "color": "#a855f7"},
    "secao.config":      {"grupo": "Seções", "label": "Configurações", "icon": "GiGears", "color": "#71717a"},
    "secao.zen":         {"grupo": "Seções", "label": "Modo zen", "icon": "GiMeditation", "color": "#a78bfa"},
    # Os hubs da suíte. A casca é a mesma nos dois; o que os diferencia é o
    # conjunto de seções, as regras (por escopo) e ESTA marca — o nome e a cor
    # que dizem em que superfície você está.
    "hub.noctis":        {"grupo": "Hubs", "label": "Noctis", "icon": "GiHeraldicSun", "color": "#a78bfa"},
    "hub.diem":          {"grupo": "Hubs", "label": "Diem", "icon": "GiSunrise", "color": "#f59e0b"},
    # a casa: o Warden e as camadas dele
    # A ÚNICA chave do Warden. Ela pinta tudo que é Warden na tela: o ícone da
    # seção na faixa, a aba da Visão geral, o botão de casa e a crista do hub.
    # Era `marca: True` com a nota de que não pintava nada — mas o painel a
    # oferecia assim mesmo, então mudá-la não fazia efeito nenhum e parecia
    # defeito. Ou a chave pinta, ou não se oferece; agora ela pinta.
    "warden.identidade": {"grupo": "Warden", "label": "Warden", "icon": "GiSpikedShield",
                         "color": "#f59e0b"},
    "warden.projetos":   {"grupo": "Warden", "label": "Projetos", "icon": "GiEmptyChessboard", "color": "#10b981"},
    # os papéis da organização
    "pnick.warden":      {"grupo": "Papéis", "label": "Warden", "icon": "GiSpikedShield", "color": "#f59e0b"},
    # a doca da direita
    # Sinais: estados que o card precisa gritar de longe. Havia aqui também um
    # `sinal.ligado`, do play; ele saiu junto com o play, senão seria um
    # controle em Configurações que não pinta mais nada. Estavam cravados em
    # âmbar dentro do JSX, fora deste catálogo — então não obedeciam a
    # Configurações e destoavam do vocabulário do resto da interface. O padrão
    # é o violeta de acento, no gesto do Obsidian: fundo sutil e filete, nunca
    # um anel colorido cercando o card.
    "sinal.pendente":    {"grupo": "Sinais", "label": "Decisão em aberto", "icon": "GiStamper", "color": "#8b5cf6"},

    "doca.contexto":     {"grupo": "Doca", "label": "Contexto", "icon": "GiInfo", "color": "#a1a1aa"},
    "doca.detalhe":      {"grupo": "Doca", "label": "Detalhe", "icon": "GiNotebook", "color": "#a1a1aa"},
    # os papéis da organização
    "pnick.maestro":     {"grupo": "Papéis", "label": "Maestro", "icon": "GiShipWheel", "color": "#a78bfa"},
    "pnick.lider":       {"grupo": "Papéis", "label": "Líder de squad", "icon": "GiCrenelCrown", "color": "#38bdf8"},
    "pnick.agente":      {"grupo": "Papéis", "label": "Agente", "icon": "GiRobotGolem", "color": "#10b981"},
    # estados do Learning
    "estado.broto":      {"grupo": "Learnings", "label": "Broto", "icon": "GiPlantSeed", "color": "#a1a1aa"},
    "estado.firmada":    {"grupo": "Learnings", "label": "Firmada", "icon": "GiCheckMark", "color": "#10b981"},
    "estado.arquivada":  {"grupo": "Learnings", "label": "Arquivada", "icon": "GiArchiveResearch", "color": "#52525b"},
    "estado.descobrindo": {"grupo": "Learnings", "label": "Descobrindo", "icon": "GiMagnifyingGlass", "color": "#8b5cf6"},
}

TAMANHOS_PADRAO = {"card": 30, "menu": 15, "nav": 19, "disco": 32,
                   "arvore": 13, "doca": 15, "organizacao": 17, "squad": 14,
                   "habilidade": 12}
TAMANHO_LIMITES = {"card": (14, 64), "menu": (10, 26), "nav": (12, 32),
                   "disco": (22, 64), "arvore": (10, 22), "doca": (11, 26),
                   "organizacao": (12, 34), "squad": (10, 26),
                   "habilidade": (10, 22)}


# A aura: o borrão de cor atrás dos cards do mapa e do cosmos.
#   difusao — o raio do blur, em px: quanto a cor se espalha
#   tamanho — o quanto a aura extravasa a borda do card, em px
AURA_PADRAO = {"difusao": 26, "tamanho": 24}
# Ligar/desligar mora junto do ajuste: quem regula é quem apaga.
LIGADO_PADRAO = {"aura": True, "vidro": True, "ceu": True}
AURA_LIMITES = {"difusao": (0, 80), "tamanho": (0, 90)}

# O pontilhado atrás do mapa, do cosmos e da organização. Opacidade em %, e a
# malha em px: quem trabalha no canvas o dia inteiro quer poder sumir com ele.
PONTILHADO_PADRAO = {"ativo": True, "opacidade": 22, "espaco": 20, "tamanho": 1,
                     "cor": "#8b8b8b"}
PONTILHADO_LIMITES = {"opacidade": (0, 100), "espaco": (8, 80), "tamanho": (1, 4)}


# O logo: tamanho, e cor sólida ou gradiente animado.
LOGO_PADRAO = {"tamanho": 26, "modo": "solida", "cor": "#e5e7eb",
               "corA": "#3b82f6", "corB": "#ec4899", "velocidade": 8}
LOGO_LIMITES = {"tamanho": (16, 160), "velocidade": (1, 30)}


# O céu do canvas: constelação e nebulosas.
#   estrelas    — quantas, no total, distribuídas entre as três profundidades
#   movimento   — amplitude do parallax das estrelas, em px
#   nebulosas   — quantas manchas de cor
#   movNebulosa — amplitude do parallax das nebulosas, em px
#   deriva      — quanto elas vagam sozinhas; 0 deixa o céu parado sem o mouse
CEU_PADRAO = {"estrelas": 314, "movimento": 90, "nebulosas": 5,
              "movNebulosa": 40, "deriva": 0, "opacidade": 100,
              "opacidadeNebulosa": 100}
CEU_LIMITES = {"estrelas": (0, 900), "movimento": (0, 240), "nebulosas": (0, 14),
               "movNebulosa": (0, 240), "deriva": (0, 100),
               "opacidade": (0, 200), "opacidadeNebulosa": (0, 300)}


# Dois desenhos possíveis para o campo, com os mesmos controles:
#   estrelas — pontos soltos em três profundidades
#   malha    — pontos ligados por fios quando vizinhos, numa profundidade só
CEU_ESTILOS = ("estrelas", "malha")


def _ceu(ap: dict) -> dict:
    dado = ap.get("ceu") or {}
    out = {}
    for k, padrao in CEU_PADRAO.items():
        lo, hi = CEU_LIMITES[k]
        try:
            out[k] = max(lo, min(hi, int(dado.get(k, padrao))))
        except (TypeError, ValueError):
            out[k] = padrao
    out["ativo"] = bool(dado.get("ativo", LIGADO_PADRAO["ceu"]))
    out["estilo"] = dado.get("estilo") if dado.get("estilo") in CEU_ESTILOS else "estrelas"
    return out


def _logo(ap: dict) -> dict:
    dado = ap.get("logo") or {}
    out = dict(LOGO_PADRAO)
    for k, (lo, hi) in LOGO_LIMITES.items():
        try:
            out[k] = max(lo, min(hi, int(dado.get(k, LOGO_PADRAO[k]))))
        except (TypeError, ValueError):
            pass
    if dado.get("modo") in ("solida", "gradiente"):
        out["modo"] = dado["modo"]
    for k in ("cor", "corA", "corB"):
        v = str(dado.get(k, "")).strip()
        if re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            out[k] = v
    return out


def _aura(ap: dict) -> dict:
    dado = ap.get("aura") or {}
    out = {}
    for k, padrao in AURA_PADRAO.items():
        lo, hi = AURA_LIMITES[k]
        try:
            v = int(dado.get(k, padrao))
        except (TypeError, ValueError):
            v = padrao
        out[k] = max(lo, min(hi, v))
    out["ativo"] = bool(dado.get("ativo", LIGADO_PADRAO["aura"]))
    return out


def _pontilhado(ap: dict) -> dict:
    dado = ap.get("pontilhado") or {}
    out = dict(PONTILHADO_PADRAO)
    for k, (lo, hi) in PONTILHADO_LIMITES.items():
        try:
            out[k] = max(lo, min(hi, int(dado.get(k, PONTILHADO_PADRAO[k]))))
        except (TypeError, ValueError):
            pass
    out["ativo"] = bool(dado.get("ativo", PONTILHADO_PADRAO["ativo"]))
    out["cor"] = _cor_valida(dado.get("cor"), PONTILHADO_PADRAO["cor"])
    return out


def _tamanhos(ap: dict) -> dict:
    dado = ap.get("iconSizes") or {}
    out = {}
    for k, padrao in TAMANHOS_PADRAO.items():
        lo, hi = TAMANHO_LIMITES[k]
        try:
            v = int(dado.get(k, padrao))
        except (TypeError, ValueError):
            v = padrao
        out[k] = max(lo, min(hi, v))
    return out


def _vocabulario() -> dict:
    """Tipos e kinds com a aparência já mesclada. Uma fonte só para a UI."""
    ap = _aparencia()
    kinds = {}
    for k, base in KIND_META_PADRAO.items():
        sob = (ap.get("kinds") or {}).get(k) or {}
        kinds[k] = {**base,
                    "color": _cor_valida(sob.get("color"), base["color"]),
                    "icon": str(sob.get("icon") or base["icon"])}
    tipos = {}
    for t, base in MEMORY_TYPES.items():
        sob = (ap.get("types") or {}).get(t) or {}
        tipos[t] = {**base,
                    "color": _cor_valida(sob.get("color"), base["color"]),
                    "icon": str(sob.get("icon") or base["icon"])}
    sistema = {}
    for chave, base in SISTEMA_PADRAO.items():
        sob = (ap.get("sistema") or {}).get(chave) or {}
        sistema[chave] = {**base,
                          "color": _cor_valida(sob.get("color"), base["color"]),
                          "icon": str(sob.get("icon") or base["icon"])}
    return {"kinds": kinds, "types": tipos, "origins": MEMORY_ORIGINS, "sistema": sistema,
            "iconSizes": _tamanhos(ap), "iconSizeLimits": TAMANHO_LIMITES,
            "aura": _aura(ap), "auraLimits": AURA_LIMITES,
            "pontilhado": _pontilhado(ap), "pontilhadoLimits": PONTILHADO_LIMITES,
            "logo": _logo(ap), "logoLimits": LOGO_LIMITES,
            "ceu": _ceu(ap), "ceuLimits": CEU_LIMITES, "ceuEstilos": list(CEU_ESTILOS),
            "vidro": bool(ap.get("vidro", LIGADO_PADRAO["vidro"])),
            "defaultType": DEFAULT_TYPE, "defaultOrigin": DEFAULT_ORIGIN}


@app.get("/api/memory-types")
def memory_types():
    """Vocabulário de tipos, kinds e origens, com a aparência personalizada."""
    return _vocabulario()


@app.put("/api/memory-types")
def save_memory_types(data: dict):
    """Guarda a cor e o ícone escolhidos para cada kind e cada tipo.

    Só o que foi personalizado é gravado: um valor igual ao padrão sai do
    arquivo, para o dia em que o padrão mudar não ficar preso no antigo.
    """
    ap = {"kinds": {}, "types": {}}
    for grupo, padroes in (("kinds", KIND_META_PADRAO), ("types", MEMORY_TYPES)):
        for chave, base in padroes.items():
            veio = (data.get(grupo) or {}).get(chave) or {}
            cor = _cor_valida(veio.get("color"), base["color"])
            ico = str(veio.get("icon") or base["icon"])
            sob = {}
            if cor != base["color"]:
                sob["color"] = cor
            if ico != base["icon"]:
                sob["icon"] = ico
            if sob:
                ap[grupo][chave] = sob
    ap["sistema"] = {}
    for chave, base in SISTEMA_PADRAO.items():
        veio = (data.get("sistema") or {}).get(chave) or {}
        cor = _cor_valida(veio.get("color"), base["color"])
        ico = str(veio.get("icon") or base["icon"])
        sob = {}
        if cor != base["color"]:
            sob["color"] = cor
        if ico != base["icon"]:
            sob["icon"] = ico
        if sob:
            ap["sistema"][chave] = sob
    if not ap["sistema"]:
        ap.pop("sistema")
    tam = _tamanhos({"iconSizes": data.get("iconSizes") or {}})
    if tam != TAMANHOS_PADRAO:
        ap["iconSizes"] = tam
    if data.get("pontilhado"):
        ap["pontilhado"] = _pontilhado({"pontilhado": data["pontilhado"]})
    if data.get("aura"):
        ap["aura"] = _aura({"aura": data["aura"]})
    if data.get("logo"):
        ap["logo"] = _logo({"logo": data["logo"]})
    if data.get("ceu"):
        ap["ceu"] = _ceu({"ceu": data["ceu"]})
    if "vidro" in data:
        ap["vidro"] = bool(data["vidro"])
    _aparencia_path().parent.mkdir(parents=True, exist_ok=True)
    _aparencia_path().write_text(json.dumps(ap, ensure_ascii=False, indent=2), encoding="utf-8")
    return _vocabulario()


def _identity_path(base: Path) -> Path:
    return base / "resources.json"


def _identity_default(kind: str) -> dict:
    voc = _vocabulario()["kinds"].get(kind, {})
    d = {"color": voc.get("color", "#3b82f6"),
         "icon": voc.get("icon", "GiBrain"),
         "active": True, "tags": []}
    # Origem vale para os quatro tipos: agente, fluxo e persona também podem ter
    # nascido de uma geração. O `type` continua exclusivo de memória.
    d["origin"] = DEFAULT_ORIGIN
    if kind == "memory":
        d["type"] = DEFAULT_TYPE
    return d


def _identity_norm(cfg: dict, kind: str) -> dict:
    d = _identity_default(kind)
    out = {
        "color":  cfg.get("color") or d["color"],
        "icon":   cfg.get("icon") or d["icon"],
        "active": bool(cfg.get("active", True)),
        "tags":   [str(t).strip() for t in (cfg.get("tags") or []) if str(t).strip()][:12],
    }
    o = str(cfg.get("origin") or "").strip()
    out["origin"] = o if o in MEMORY_ORIGINS else DEFAULT_ORIGIN
    # Quem produziu. Sem isto, um recurso "produzido" não credita ninguém no
    # progresso — e creditar errado seria pior do que não creditar.
    autor = str(cfg.get("autor") or "").strip()[:120]
    if autor:
        out["autor"] = autor
    dec = _decision_norm(cfg.get("decision"))
    if dec:
        out["decision"] = dec
    if kind == "memory":
        t = str(cfg.get("type") or "").strip()
        out["type"] = t if t in MEMORY_TYPES else DEFAULT_TYPE
    return out


def _load_identity(base: Path) -> dict:
    """Índice de identidade do projeto. Semeia a partir dos mapas na primeira vez."""
    path = _identity_path(base)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    # Migração: o canvas era o dono da identidade até aqui.
    idx = {}
    fontes = [base / CANVAS_LEGADO, base / (CANVAS_LEGADO + ".migrado")]
    fontes += sorted(_canvases_dir(base).glob("*.json")) if _canvases_dir(base).is_dir() else []
    for canvas_file in fontes:
        if not canvas_file.exists():
            continue
        try:
            raw = json.loads(canvas_file.read_text(encoding="utf-8"))
            nodes = raw.get("nodes")
            seq = nodes.values() if isinstance(nodes, dict) else (nodes or [])
            for cfg in seq:
                kind = cfg.get("kind", "memory")
                name = cfg.get("name")
                if not name:
                    continue
                idx.setdefault(f"{kind}:{name}", _identity_norm(cfg, kind))
        except Exception:
            pass
    if idx:
        _save_identity(base, idx)
    return idx


def _save_identity(base: Path, idx: dict) -> None:
    _identity_path(base).write_text(
        json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Decisão dentro de um card ────────────────────────────────────────────────
# Qualquer recurso pode carregar uma decisão: uma pergunta e as escolhas dela.
# Não é um tipo à parte — empilha com o que o card já é. Uma referência pode ter
# uma decisão pendente sem deixar de ser referência.
#
# A flag é DERIVADA da existência de escolhas: não há card marcado como decisão
# sem nada a decidir, nem decisão invisível por falta de marcação.

DECISION_MODES = ("radio", "check")   # radio: escolha única · check: várias


def _decision_norm(cfg: dict | None) -> dict | None:
    """Saneia o bloco de decisão. Devolve None quando não há escolha nenhuma —
    é isso que faz o selo e o bloco sumirem do card."""
    if not isinstance(cfg, dict):
        return None
    opcoes = []
    for i, o in enumerate(cfg.get("options") or []):
        if not isinstance(o, dict):
            continue
        rotulo = str(o.get("label") or "").strip()
        if not rotulo:
            continue
        opcoes.append({
            "id": str(o.get("id") or f"o{i + 1}"),
            "label": rotulo[:300],
            "checked": bool(o.get("checked")),
            "by": (str(o.get("by") or "").strip() or None),
            "at": (str(o.get("at") or "").strip() or None),
        })
    if not opcoes:
        return None
    modo = cfg.get("mode") if cfg.get("mode") in DECISION_MODES else "radio"
    if modo == "radio":                       # uma só; se vierem várias, vale a última
        marcadas = [o for o in opcoes if o["checked"]]
        for o in marcadas[:-1]:
            o["checked"] = False
    return {
        "mode": modo,
        "question": str(cfg.get("question") or "").strip()[:300],
        "options": opcoes[:12],
    }


def decisao_pendente(dec: dict | None) -> bool:
    return bool(dec) and not any(o["checked"] for o in dec["options"])


def marcar_origem(base: Path, kind: str, name: str, origem: str) -> None:
    """Carimba a origem de um recurso. Chamado onde o sistema gera o arquivo,
    para a pessoa não precisar marcar à mão o que ela não escreveu."""
    if origem not in MEMORY_ORIGINS:
        return
    idx = _load_identity(base)
    chave = f"{kind}:{name}"
    idx[chave] = _identity_norm({**idx.get(chave, {}), "origin": origem}, kind)
    _save_identity(base, idx)


def _identity_of(base: Path, kind: str, name: str, idx: dict | None = None) -> dict:
    idx = _load_identity(base) if idx is None else idx
    return _identity_norm(idx.get(f"{kind}:{name}", {}), kind)


def _sync_canvas(base: Path, canvas_id: str | None = None) -> dict:
    """Normaliza o canvas: lanes (frames) + nós por instância (repetíveis).

    Cada nó é uma instância com id próprio, podendo referenciar o mesmo recurso
    mais de uma vez (em lanes diferentes). Memórias são semeadas na primeira
    abertura. Órfãos (recurso ou lane inexistente) são limpos.
    """
    canvas_id = canvas_id or _canvas_default(base)
    existed = _canvas_path(base, canvas_id).exists()
    canvas = _load_canvas_file(base, canvas_id)
    raw_nodes = canvas.get("nodes")
    lanes = canvas.get("lanes") or []
    existing = _existing_resources(base)

    instances: list = []
    if isinstance(raw_nodes, dict):
        # Migra formato legado (dict chaveado por "kind:name").
        for key, cfg in raw_nodes.items():
            cfg = dict(cfg)
            if ":" in key:
                kind, name = key.split(":", 1)
            else:
                kind, name = "memory", key
            cfg["id"] = cfg.get("id", key)
            cfg["kind"] = cfg.get("kind", kind)
            cfg["name"] = cfg.get("name", name)
            cfg.setdefault("parent", None)
            instances.append(cfg)
    else:
        for cfg in (raw_nodes or []):
            cfg = dict(cfg)
            cfg.setdefault("kind", "memory")
            cfg.setdefault("parent", None)
            if not cfg.get("id"):
                cfg["id"] = f'{cfg["kind"]}:{cfg.get("name", "")}'
            instances.append(cfg)

    # Semeia memórias na primeira abertura (sem arquivo de canvas anterior).
    if not existed:
        for i, name in enumerate(sorted(existing["memory"])):
            instances.append({
                "id": f"memory:{name}", "kind": "memory", "name": name, "parent": None,
                "x": (i % 4) * 300, "y": (i // 4) * 210,
                "color": CANVAS_PALETTE[i % len(CANVAS_PALETTE)],
                "icon": "GiBrain", "active": True, "tags": [], "width": 264, "height": 176,
            })

    # Defaults + migração de ícones.
    for cfg in instances:
        cfg.setdefault("x", 0); cfg.setdefault("y", 0)
        cfg.setdefault("color", "#3b82f6")
        cfg.setdefault("active", True)
        cfg.setdefault("tags", [])
        cfg.setdefault("width", 264)
        cfg.setdefault("height", 176)
        cfg["weight"] = _weight_norm(cfg.get("weight"))
        di = KIND_DEFAULT_ICON.get(cfg["kind"], "GiBrain")
        cfg.setdefault("icon", di)
        if not str(cfg.get("icon", "")).startswith("Gi"):
            cfg["icon"] = di

    # Remove órfãos (recurso não existe mais).
    instances = [c for c in instances if c["name"] in existing.get(c["kind"], set())]

    # Valida parents contra lanes existentes.
    lanes = [_lane_norm(l) for l in lanes if l.get("id")]
    lane_ids = {l["id"] for l in lanes}
    for c in instances:
        if c.get("parent") and c["parent"] not in lane_ids:
            c["parent"] = None

    # Valida arestas (endpoints = ids de instância OU de lane).
    valid_eps = {c["id"] for c in instances} | lane_ids
    edges = []
    for e in canvas.get("edges", []):
        s, t = e.get("source"), e.get("target")
        if s in valid_eps and t in valid_eps:
            edges.append({"id": e.get("id") or f"{s}->{t}", "source": s, "target": t})

    return {"id": canvas_id, "name": canvas.get("name") or canvas_id,
            "lanes": lanes, "nodes": instances, "edges": edges}


def _agents_using_memory(base: Path) -> dict:
    """stem da memória -> lista de nomes de agentes que a utilizam."""
    usage: dict = {}
    adir = base / "agents"
    if adir.is_dir():
        for f in sorted(adir.glob("*.yaml")):
            cfg  = ler_agente_do_arquivo(f, protocolo=False)
            disp = cfg.get("name", f.stem)
            for mf in (cfg.get("memory_files") or []):
                stem = Path(str(mf)).stem
                usage.setdefault(stem, []).append(disp)
    return usage


def _memory_summary(path: Path) -> dict:
    """Extrai título, trecho e métricas de um arquivo de memória."""
    if not path.exists():
        return {"title": "", "excerpt": "", "lines": 0, "chars": 0}
    text  = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    title = ""
    for ln in lines:
        s = ln.strip()
        if s.startswith("#"):
            title = s.lstrip("#").strip()
            break

    excerpt = ""
    for ln in lines:
        s = ln.strip()
        if not s or s.startswith("#") or s.startswith("<!--") or s.startswith("<"):
            continue
        if s.startswith(">"):
            s = s.lstrip(">").strip()
        if s[:2] in ("- ", "* "):
            s = s[2:].strip()
        if s:
            excerpt = s
            break

    non_empty = sum(1 for ln in lines if ln.strip())
    return {"title": title, "excerpt": excerpt[:160],
            "lines": non_empty, "chars": len(text)}


# ── Tarefa e peça ─────────────────────────────────────────────────────────────
#
# Os dois conjuntos de estado NÃO se misturam, e confundi-los seria bug: aprovar
# a produção de uma peça não valida a aposta que ela contém. Um é o andamento do
# trabalho; o outro é a vida da coisa produzida.
ESTADOS_TASK = ("backlog", "active", "review", "done", "blocked")
ESTADOS_ARTIFACT = ("draft", "generated", "in_review", "approved", "rejected", "superseded")


def _partir_texto(texto: str) -> tuple[dict, str]:
    """O front-matter e o corpo, a partir do TEXTO — sem tocar no disco.

    A escrita precisa disto: o gate roda sobre o que está chegando, não sobre o
    que já está gravado. Ler o arquivo para decidir se pode gravar seria decidir
    sobre a versão errada.
    """
    if not texto.startswith("---"):
        return {}, texto
    fim = texto.find("\n---", 3)
    if fim < 0:
        return {}, texto
    try:
        meta = yaml.safe_load(texto[3:fim]) or {}
    except yaml.YAMLError:
        meta = {}
    return (meta if isinstance(meta, dict) else {}), texto[fim + 4:].lstrip("\n")


def _montar_texto(meta: dict, corpo: str) -> str:
    if not meta:
        return corpo
    frente = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False).strip()
    return f"---\n{frente}\n---\n\n{corpo}"


def _frente_materia(path: Path) -> tuple[dict, str]:
    """O front-matter YAML de um `.md`, e o corpo depois dele.

    A peça é um arquivo de texto legível fora do Noctis — é o princípio que faz
    um projeto ser uma pasta. Os metadados moram no topo, no formato que todo
    editor de Markdown já entende, em vez de num índice paralelo que sairia de
    sincronia com o arquivo no dia em que alguém editasse por fora.
    """
    if not path.is_file():
        return {}, ""
    return _partir_texto(path.read_text(encoding="utf-8"))


def _node_summary(base: Path, kind: str, name: str, usage: dict) -> dict:
    """Resumo exibido no card, conforme o tipo do recurso."""
    if kind == "memory":
        s = _memory_summary(base / "memory" / f"{name}.md")
        return {**s, "badge": f"{s['lines']} linhas", "usedBy": usage.get(name, []),
                **_thumbs_payload(_attachments_for(base, name))}

    if kind == "agent":
        cfg = load_yaml(base / "agents" / f"{name}.yaml")
        mem = len(cfg.get("memory_files") or [])
        tools = len(cfg.get("tools") or [])
        temp = cfg.get("temperature", "")
        return {"title": cfg.get("name", name),
                "excerpt": (cfg.get("description") or "").strip(),
                "badge": f"temp {temp} · {mem} mem · {tools} tools",
                "lines": 0, "chars": 0, "usedBy": []}

    if kind == "flow":
        cfg = load_yaml(base / "flows" / f"{name}.yaml")
        steps = len(cfg.get("steps") or [])
        return {"title": cfg.get("name", name),
                "excerpt": (cfg.get("description") or "").strip(),
                "badge": f"{steps} passo{'s' if steps != 1 else ''}",
                "lines": 0, "chars": 0, "usedBy": []}

    if kind == "persona":
        cfg = load_yaml(base / "personas" / f"{name}.yaml")
        role = cfg.get("role", "")
        age = cfg.get("age", "")
        bio = (cfg.get("bio") or "").strip().splitlines()
        return {"title": cfg.get("name", name),
                "excerpt": (bio[0] if bio else role),
                "badge": " · ".join(str(x) for x in [role, age] if x),
                "lines": 0, "chars": 0, "usedBy": []}

    if kind == "task":
        cfg = load_yaml(base / "tasks" / f"{name}.yaml")
        est = str(cfg.get("estado") or ESTADOS_TASK[0])
        quem = cfg.get("agente") or ""
        return {"title": cfg.get("titulo", name),
                "excerpt": (cfg.get("resumo") or "").strip(),
                # O estado vem PRIMEIRO no badge: numa grade de tarefas, o que
                # se procura é o que está travado, não quem é o dono.
                "badge": " · ".join(x for x in [est, quem, cfg.get("despacho") or ""] if x),
                "estado": est, "lines": 0, "chars": 0, "usedBy": []}

    if kind == "artifact":
        meta, corpo = _frente_materia(base / "artifacts" / f"{name}.md")
        est = str(meta.get("estado") or ESTADOS_ARTIFACT[0])
        ver = meta.get("versao") or 1
        linhas = [l for l in corpo.splitlines() if l.strip()]
        return {"title": meta.get("titulo", name),
                "excerpt": (linhas[0][:200] if linhas else ""),
                "badge": " · ".join(str(x) for x in [est, f"v{ver}", meta.get("task") or ""] if x),
                "estado": est, "lines": len(linhas), "chars": len(corpo), "usedBy": []}

    return {"title": name, "excerpt": "", "badge": "", "lines": 0, "chars": 0, "usedBy": []}


def _auto_edges(base: Path, canvas: dict) -> list:
    """Conexões derivadas (agente→memória, fluxo→agente), por instância e lane.

    As relações só ligam instâncias que estão na MESMA lane (ou ambas soltas),
    para refletir o agrupamento de macro-fluxo sem virar uma teia."""
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for n in canvas["nodes"]:
        groups[n.get("parent")].append(n)

    seen, edges = set(), []

    def add(source: str, target: str, rel: str):
        eid = f"auto:{source}->{target}"
        if eid in seen:
            return
        seen.add(eid)
        edges.append({"id": eid, "source": source, "target": target, "rel": rel})

    for items in groups.values():
        mems_by_name: dict = defaultdict(list)
        agents_by_name: dict = defaultdict(list)
        for n in items:
            if n["kind"] == "memory":
                mems_by_name[n["name"]].append(n)
            elif n["kind"] == "agent":
                agents_by_name[n["name"]].append(n)

        for a in [n for n in items if n["kind"] == "agent"]:
            cfg = load_yaml(base / "agents" / f'{a["name"]}.yaml')
            for mf in (cfg.get("memory_files") or []):
                stem = Path(str(mf)).stem
                for m in mems_by_name.get(stem, []):
                    add(a["id"], m["id"], "usa")

        for fl in [n for n in items if n["kind"] == "flow"]:
            cfg = load_yaml(base / "flows" / f'{fl["name"]}.yaml')
            for step in (cfg.get("steps") or []):
                for a in agents_by_name.get(step.get("agent"), []):
                    add(fl["id"], a["id"], "executa")

    return edges


@app.put("/api/projects/{project}/resources/{kind}/{name}/decision")
def save_resource_decision(project: str, kind: str, name: str, data: dict):
    """Define (ou remove) a decisão de um card.

    Mandar `options: []` apaga a decisão — e com ela o selo e o bloco somem do
    card, porque a flag é derivada da existência de escolhas. Serve tanto para a
    pessoa quanto para o agente, que escreve por aqui ao propor uma escolha.
    """
    if kind not in KIND_DIRS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    base = project_base(project)
    folder, _ = KIND_DIRS[kind]
    ext = ".md" if kind == "memory" else ".yaml"
    if not (base / folder / f"{nome_de_recurso(name)}{ext}").exists():
        raise HTTPException(404, f"{kind} '{name}' não encontrado")

    idx = _load_identity(base)
    chave = f"{kind}:{name}"
    atual = dict(idx.get(chave, {}))
    dec = _decision_norm(data)
    if dec is None:
        atual.pop("decision", None)
    else:
        atual["decision"] = dec
    idx[chave] = _identity_norm(atual, kind)
    if dec is None:
        idx[chave].pop("decision", None)
    _save_identity(base, idx)
    return {"ok": True, "decision": idx[chave].get("decision")}


@app.post("/api/projects/{project}/resources/{kind}/{name}/decision/{option_id}")
def toggle_resource_choice(project: str, kind: str, name: str, option_id: str, data: dict | None = None):
    """Marca ou desmarca uma escolha, guardando quem marcou e quando.

    A escolha só fica registrada: nada é executado a partir dela. O autor vem no
    corpo (`by`) — a pessoa manda o próprio nome, o agente manda o dele. Sem
    isso, daqui a um mês ninguém sabe se aquilo foi decidido ou chutado.
    """
    base = project_base(project)
    idx = _load_identity(base)
    chave = f"{kind}:{name}"
    cfg = dict(idx.get(chave, {}))
    dec = _decision_norm(cfg.get("decision"))
    if not dec:
        raise HTTPException(404, "este card não tem decisão")

    alvo = next((o for o in dec["options"] if o["id"] == option_id), None)
    if alvo is None:
        raise HTTPException(404, f"escolha '{option_id}' não existe")

    autor = str((data or {}).get("by") or "").strip() or "alguém"
    virar = not alvo["checked"]
    if dec["mode"] == "radio":
        for o in dec["options"]:            # única: as outras caem
            o.update(checked=False, by=None, at=None)
    alvo["checked"] = virar
    alvo["by"] = autor if virar else None
    alvo["at"] = datetime.now(timezone.utc).isoformat(timespec="seconds") if virar else None

    cfg["decision"] = dec
    idx[chave] = _identity_norm(cfg, kind)
    _save_identity(base, idx)
    return {"ok": True, "decision": idx[chave].get("decision")}


@app.get("/api/projects/{project}/canvases")
def list_canvases(project: str):
    """Os mapas do projeto. Cada um é um recorte dos mesmos recursos."""
    return _canvas_list(project_base(project))


@app.get("/api/projects/{project}/cosmos")
def get_cosmos(project: str):
    """Os mapas do projeto com a posição de cada um e as conexões entre eles.

    Mapa sem posição salva entra numa grade, para um mapa recém-criado aparecer
    em vez de ficar empilhado na origem.
    """
    base = project_base(project)
    mapas = _canvas_list(base)
    cosmos = _load_cosmos(base)
    pos = {n.get("id"): n for n in cosmos["nodes"] if n.get("id")}
    ids = {m["id"] for m in mapas}
    nodes, novos = [], 0
    for m in mapas:
        p = pos.get(m["id"])
        if p is None:
            p = {"x": 60 + (novos % 4) * 320, "y": 60 + (novos // 4) * 260}
            novos += 1
        nodes.append({**m, "x": p.get("x", 0), "y": p.get("y", 0)})
    edges = [e for e in cosmos["edges"]
             if e.get("source") in ids and e.get("target") in ids]
    return {"nodes": nodes, "edges": edges}


@app.put("/api/projects/{project}/cosmos")
def save_cosmos(project: str, data: dict):
    base = project_base(project)
    ids = {m["id"] for m in _canvas_list(base)}
    nodes = [{"id": n["id"], "x": int(n.get("x", 0)), "y": int(n.get("y", 0))}
             for n in (data.get("nodes") or []) if n.get("id") in ids]
    vistos, edges = set(), []
    for e in (data.get("edges") or []):
        s_, t_ = e.get("source"), e.get("target")
        if s_ not in ids or t_ not in ids or s_ == t_ or (s_, t_) in vistos:
            continue
        vistos.add((s_, t_))
        edges.append({"id": e.get("id") or f"{s_}->{t_}", "source": s_, "target": t_})
    _cosmos_path(base).write_text(
        json.dumps({"nodes": nodes, "edges": edges}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    return {"ok": True}


@app.post("/api/projects/{project}/canvases")
def create_canvas(project: str, data: dict):
    base = project_base(project)
    nome = (data.get("name") or "").strip()
    if not nome:
        raise HTTPException(400, "name obrigatório")
    cid = slugify(data.get("id") or nome)
    if not cid:
        raise HTTPException(400, "id inválido")
    if _canvas_path(base, cid).exists():
        raise HTTPException(409, f"mapa '{cid}' já existe")
    _save_canvas_file(base, {"id": cid, "name": nome,
                             "lanes": [], "nodes": [], "edges": []}, cid)
    return {"ok": True, "id": cid, "name": nome}


@app.post("/api/projects/{project}/canvases/{canvas_id}/rename")
def rename_canvas(project: str, canvas_id: str, data: dict):
    """Troca só o nome de exibição — o id do arquivo fica, para não quebrar
    quem tiver o mapa aberto em outra aba."""
    base = project_base(project)
    novo = (data.get("new_name") or "").strip()
    if not novo:
        raise HTTPException(400, "new_name obrigatório")
    if not _canvas_path(base, canvas_id).exists():
        raise HTTPException(404, f"mapa '{canvas_id}' não encontrado")
    dados = _load_canvas_file(base, canvas_id)
    dados["name"] = novo
    _save_canvas_file(base, dados, canvas_id)
    return {"ok": True, "id": canvas_id, "name": novo}


@app.delete("/api/projects/{project}/canvases/{canvas_id}")
def delete_canvas(project: str, canvas_id: str):
    """Apaga um mapa. Nenhum recurso é tocado: o mapa é só o arranjo.
    O último mapa não pode ser apagado — o projeto ficaria sem tela."""
    base = project_base(project)
    lista = _canvas_list(base)
    if len(lista) <= 1:
        raise HTTPException(400, "este é o único mapa do projeto")
    path = _canvas_path(base, canvas_id)
    if not path.exists():
        raise HTTPException(404, f"mapa '{canvas_id}' não encontrado")
    path.unlink()
    return {"ok": True, "next": _canvas_default(base)}


@app.post("/api/projects/{project}/canvases/{canvas_id}/duplicate")
def duplicate_canvas(project: str, canvas_id: str, data: dict):
    base = project_base(project)
    origem = _load_canvas_file(base, canvas_id)
    nome = (data.get("name") or f'{origem.get("name") or canvas_id} (cópia)').strip()
    novo_id = slugify(data.get("id") or nome)
    if not novo_id:
        raise HTTPException(400, "id inválido")
    if _canvas_path(base, novo_id).exists():
        raise HTTPException(409, f"mapa '{novo_id}' já existe")
    _save_canvas_file(base, {**origem, "id": novo_id, "name": nome}, novo_id)
    return {"ok": True, "id": novo_id, "name": nome}


@app.get("/api/projects/{project}/memory-canvas")
def get_memory_canvas(project: str, canvas: str | None = None):
    base = project_base(project)
    cid = canvas or _canvas_default(base)
    canvas = _sync_canvas(base, cid)
    _save_canvas_file(base, canvas, cid)
    usage = _agents_using_memory(base)
    idx = _load_identity(base)
    nodes = []
    for cfg in canvas["nodes"]:
        summary = _node_summary(base, cfg["kind"], cfg["name"], usage)
        # a identidade sobrescreve o que ainda estiver gravado no nó
        nodes.append({**cfg, **summary, **_identity_of(base, cfg["kind"], cfg["name"], idx)})
    return {"id": canvas.get("id"), "name": canvas.get("name"),
            "lanes": canvas["lanes"], "nodes": nodes,
            "edges": canvas["edges"], "autoEdges": _auto_edges(base, canvas)}


@app.get("/api/projects/{project}/resources")
def list_resources(project: str):
    """Todos os recursos por tipo, com resumo e identidade.

    Serve tanto o seletor de inserção do canvas (que só usa name/displayName)
    quanto as páginas em grade, que desenham o card inteiro sem precisar abrir
    o arquivo.
    """
    base = project_base(project)
    usage = _agents_using_memory(base)
    idx = _load_identity(base)

    # O nível e os Learnings de cada agente, numa conta só para a listagem
    # inteira. Sem isto, ordenar a grade por nível exigiria uma chamada por
    # card — e a ordenação é justamente o que se faz quando há muitos cards.
    fichas: dict[str, dict] = {}
    try:
        estado = prog.estado_do_projeto(base, rep.indice(rep.carregar(base)),
                                        rep.firmadas(rep.carregar(base)))
        for nome, a in (estado.get("agentes") or {}).items():
            fichas[nome] = {"nivel": a.get("nivel", 0), "xp": a.get("xp", 0),
                            "eventos": a.get("eventos", 0),
                            "progresso": a.get("progresso", 0),
                            "proximo_nivel": a.get("proximo_nivel", 0),
                            "skills": sorted((a.get("habilidades") or {}).keys())}
    except Exception:
        pass

    def items(kind: str):
        folder, pattern = KIND_DIRS[kind]
        d = base / folder
        if not d.is_dir():
            return []
        out = []
        for f in sorted(d.glob(pattern)):
            name = f.stem
            summary = _node_summary(base, kind, name, usage)
            try:
                st = f.stat()
                # No Windows, st_ctime É a criação. Em outros sistemas ele é a
                # mudança de metadados — e aí a data de criação simplesmente não
                # existe no disco; mandar mtime nos dois evita inventar.
                criado = datetime.fromtimestamp(min(st.st_ctime, st.st_mtime),
                                                timezone.utc).isoformat(timespec="seconds")
                mudado = datetime.fromtimestamp(st.st_mtime,
                                                timezone.utc).isoformat(timespec="seconds")
                tamanho = st.st_size
            except OSError:
                criado = mudado = ""
                tamanho = 0
            out.append({
                "name": name,
                "displayName": summary.get("title") or name,
                "kind": kind,
                "criado": criado, "mudado": mudado, "bytes": tamanho,
                # Agente sem evento não tem ficha no log — e "sem ficha" e
                # "nível 0" são a mesma coisa para quem ordena a grade.
                **({"ficha": fichas.get(name) or {"nivel": 0, "xp": 0, "eventos": 0,
                                                     "progresso": 0, "proximo_nivel": 0, "skills": []},
                    # O nickname vem no card porque é por ele que se chama este
                    # agente. Sai daqui já pronto: o card não deve ter de pedir
                    # um por um — a grade tem 26.
                    "nickname": nickname_de(project, name)}
                   if kind == "agent" else {}),
                **summary,
                **_identity_of(base, kind, name, idx),
            })
        return out

    # Todos os kinds declarados, e não uma lista à parte: uma segunda lista aqui
    # era o sexto espelho da tabela de kinds, e quem acrescentasse um tipo
    # veria a grade vazia sem erro nenhum.
    return {k: items(k) for k in KINDS}


# ── A visão de todos os projetos ─────────────────────────────────────────────
# O projeto base é o andar de cima: aberto nele, cada módulo pode mostrar o que
# existe em TODOS os projetos, com o projeto carimbado em cada item e um filtro
# para recortar. Nada é copiado para cá — o que se vê são os arquivos de cada
# projeto, lidos ao vivo. Copiar criaria uma segunda verdade, e duas verdades
# sobre a mesma memória é como um acervo começa a mentir.

def _projetos_visiveis() -> list[str]:
    ocultos = _ocultos()
    return [b.name for b in sorted(PROJECTS_DIR.iterdir())
            if b.is_dir() and not b.name.startswith(".") and b.name not in ocultos
            and not _e_repositorio(b)]


def _warden_base() -> Path:
    """A casa do Warden é o projeto base: é ali que moram as três camadas."""
    return PROJECTS_DIR / BASE_SLUG


# ── A camada de templates ────────────────────────────────────────────────────
# Moldes destilados de trabalho que já provou servir. O catálogo mostra o que os
# projetos produziram e muda quando eles mudam; o molde só muda quando alguém
# decide mudá-lo — é essa a diferença entre os dois.

@app.get("/api/templates")
def listar_templates(kind: str = ""):
    try:
        return {"templates": tpl.listar(_warden_base(), kind)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/templates")
def guardar_template(data: dict):
    """Salva um recurso de QUALQUER projeto como molde. O original não se mexe."""
    kind = str(data.get("kind") or "")
    if kind not in tpl.TIPOS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    origem = str(data.get("projeto") or "").strip()
    nome = str(data.get("nome") or "").strip()
    if not origem or not nome:
        raise HTTPException(400, "informe `projeto` e `nome` do recurso de origem")
    base = project_base(origem)
    folder, ext = tpl.TIPOS[kind]
    fonte = base / folder / f"{nome}{ext}"
    if not fonte.exists():
        raise HTTPException(404, f"{kind} '{nome}' não existe em '{origem}'")

    if kind == "memory":
        conteudo = fonte.read_text(encoding="utf-8")
        rotulo = str(data.get("rotulo") or nome)
    else:
        conteudo = yaml.safe_load(fonte.read_text(encoding="utf-8")) or {}
        rotulo = str(data.get("rotulo") or conteudo.get("name") or nome)
    try:
        return {"ok": True, "template": tpl.guardar(
            _warden_base(), kind, rotulo, conteudo, de=nome, de_projeto=origem)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/templates/skills")
def listar_templates_skill():
    return {"templates": skc.listar_templates(_warden_base())}


@app.post("/api/templates/skills")
def guardar_template_skill(data: dict):
    """Guarda a skill de um projeto como molde — a mesma pergunta que os
    outros fazedores fazem: de onde destilar."""
    origem = str(data.get("projeto") or "").strip()
    slug_ = str(data.get("slug") or "").strip()
    if not origem or not slug_:
        raise HTTPException(400, "informe `projeto` e `slug` da skill de origem")
    try:
        return {"ok": True, "template": skc.guardar_template(_warden_base(), project_base(origem), slug_)}
    except KeyError:
        raise HTTPException(404, f"skill '{slug_}' não existe em '{origem}'")


@app.post("/api/templates/skills/{slug}/instanciar")
def instanciar_template_skill(slug: str, data: dict):
    destino_slug = str((data or {}).get("para") or "").strip()
    if not (PROJECTS_DIR / destino_slug).is_dir():
        raise HTTPException(404, f"projeto '{destino_slug}' não encontrado")
    try:
        return {"ok": True, "para": destino_slug,
                **skc.instanciar_template(_warden_base(), slug, PROJECTS_DIR / destino_slug)}
    except KeyError:
        raise HTTPException(404, f"molde de skill '{slug}' não encontrado")


@app.post("/api/templates/{kind}/{chave}/instanciar")
def instanciar_template(kind: str, chave: str, data: dict):
    """Põe uma cópia do molde num projeto. Nome ocupado ganha sufixo."""
    if kind not in tpl.TIPOS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    destino_slug = str((data or {}).get("para") or "").strip()
    if not (PROJECTS_DIR / destino_slug).is_dir():
        raise HTTPException(404, f"projeto '{destino_slug}' não encontrado")
    try:
        r = tpl.instanciar(_warden_base(), kind, chave, PROJECTS_DIR / destino_slug,
                           str((data or {}).get("nome") or ""))
    except KeyError:
        raise HTTPException(404, f"template '{chave}' não encontrado")
    # Agente que nasce de um molde não precisa receber o protocolo aqui: ele é
    # montado na leitura, já com o projeto de destino.
    return {"ok": True, "para": destino_slug, **r}


@app.delete("/api/templates/{kind}/{chave}")
def apagar_template(kind: str, chave: str):
    if kind not in tpl.TIPOS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    try:
        tpl.apagar(_warden_base(), kind, chave)
    except KeyError:
        raise HTTPException(404, f"template '{chave}' não encontrado")
    return {"ok": True}


# ── Skill: exatamente a definição do Claude ──────────────────────────────────
# Sem XP, sem tese, sem proposta — isso é Learning. Aqui é só: o que existe de
# fato em `.claude/skills`, e o que o Noctis pode criar e vincular a Learnings.

@app.get("/api/projects/{project}/skills-claude")
def listar_skills_claude(project: str, globais: bool = True):
    """As skills que este projeto enxerga: as dele, mais as que o Claude tem
    (suas, em `~/.claude/skills`, e as de plugin). As de fora vêm marcadas
    como nativas — leitura apenas; para mexer, duplique."""
    fora = skc.listar(project_base(project))
    if globais:
        fora = fora + skc.globais()
    return {"skills": fora}


@app.post("/api/projects/{project}/skills-claude/{slug}/duplicar")
def duplicar_skill_claude(project: str, slug: str, data: dict | None = None):
    """Traz uma cópia para dentro do projeto. A original não se toca."""
    try:
        return {"ok": True, "skill": skc.duplicar(project_base(project), slug,
                                                  str((data or {}).get("origem") or ""))}
    except KeyError:
        raise HTTPException(404, f"skill '{slug}' não encontrada")


@app.put("/api/projects/{project}/skills-claude/{slug}")
def editar_skill_claude(project: str, slug: str, data: dict):
    """Reescreve nome, descrição e corpo — só nas skills do Noctis."""
    try:
        return {"ok": True, "skill": skc.editar(project_base(project), slug, data or {})}
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError:
        raise HTTPException(404, f"skill '{slug}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/projects/{project}/skills-claude/{slug}")
def ler_skill_claude(project: str, slug: str):
    try:
        return skc.ler(project_base(project), slug)
    except KeyError:
        raise HTTPException(404, f"skill '{slug}' não encontrada")


@app.post("/api/projects/{project}/skills-claude")
def criar_skill_claude(project: str, data: dict):
    """Cria uma skill nova — do zero, ou a partir de um Learning que já existe."""
    base = project_base(project)
    de_learning = str(data.get("de_learning") or "").strip()
    nome = str(data.get("nome") or "").strip()
    descricao = str(data.get("descricao") or "").strip()
    corpo = str(data.get("corpo") or "")
    if de_learning:
        # Destila o que o Learning já sabe: o nome e a descrição são um
        # convite a editar, não uma cópia obrigatória.
        chave = prog.slug(de_learning)
        rep_ = rep.carregar(base)
        if chave not in rep_:
            raise HTTPException(404, f"Learning '{de_learning}' não encontrado")
        sk = rep_[chave]
        nome = nome or sk.get("rotulo") or chave
        descricao = descricao or (sk.get("descricao") or "").strip()
        corpo = corpo or rep.ler_corpo(base, chave)
    try:
        return {"ok": True, "skill": skc.criar(base, nome, descricao, corpo,
                                               data.get("learnings") or [],
                                               prog.slug(de_learning) if de_learning else "")}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/api/projects/{project}/skills-claude/{slug}/vincular")
def vincular_skill_claude(project: str, slug: str, data: dict):
    try:
        return {"ok": True, **skc.vincular(project_base(project), slug, data.get("learnings") or [])}
    except PermissionError as e:
        raise HTTPException(403, str(e))


@app.get("/api/projects/{project}/skills-claude-perguntas")
def perguntas_skills_claude(project: str):
    """As perguntas em aberto de cada skill do Noctis, pelos Learnings que ela
    vincula — aparece mesmo vazia, de propósito (ver `perguntas_vinculadas`)."""
    return {"skills": skc.perguntas_vinculadas(project_base(project), enq.perguntas)}


@app.get("/api/todos/skills-claude-perguntas")
def perguntas_skills_claude_todos():
    """A mesma coisa, de todos os projetos — o que alimenta o destaque no
    dashboard do Warden."""
    fora = []
    for slug_p in _projetos_visiveis():
        base = PROJECTS_DIR / slug_p
        nome = _project_display_name(base)
        try:
            skills = skc.perguntas_vinculadas(base, enq.perguntas)
        except Exception:
            continue
        for s in skills:
            fora.append({**s, "projeto": slug_p, "projetoNome": nome})
    return {"skills": fora}


@app.get("/api/todos/skills-claude")
def listar_skills_claude_todos(projetos: str = ""):
    """As skills de todos os projetos — o que alimenta o Catálogo do Warden."""
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    fora = []
    for slug_p in _projetos_visiveis():
        if escolhidos and slug_p not in escolhidos:
            continue
        base = PROJECTS_DIR / slug_p
        nome = _project_display_name(base)
        try:
            for s in skc.listar(base):
                fora.append({**s, "projeto": slug_p, "projetoNome": nome})
        except Exception:
            continue
    return {"skills": fora}


@app.get("/api/todos/runtime")
def runtime_todos(projetos: str = "", minutos: int = 0,
                  cursor: str = "", por_pagina: int = 0):
    """O sistema RODANDO e o que já rodou: QUEM trabalhou, quando, em quê.

    A unidade aqui é o trabalho de um agente, não o uso de um Skill. Um
    despacho que não declarou `--skill` continua sendo trabalho e continua
    tendo de aparecer: quem trabalhou é a pergunta, e a Skill usada é um
    detalhe dela.

    `minutos` governa só o rótulo "agora" — quem está trabalhando neste
    instante. O histórico NÃO é cortado por tempo: ele é para durar, e por
    isso vem paginado. `cursor` é o `quando` do último item que você já tem,
    e a página seguinte traz o que for estritamente mais antigo que ele.
    Cursor por data, e não deslocamento, porque o log só cresce pelo fim: com
    deslocamento, um evento novo empurraria a página e duplicaria linhas.
    """
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    # Sem valor do cliente, manda a regra — é o que faz o ajuste em
    # Configurações valer de verdade, e não só quando a tela lembra de pedir.
    minutos = minutos or int(regras.valor("runtime.janela_agora") or 15)
    por_pagina = por_pagina or int(regras.valor("runtime.por_pagina") or 50)
    corte = (datetime.now(timezone.utc) - timedelta(minutes=max(1, minutos)))
    tamanho = min(200, max(1, por_pagina))

    tudo = []
    for slug in _projetos_visiveis():
        if escolhidos and slug not in escolhidos:
            continue
        base = PROJECTS_DIR / slug
        nome = _project_display_name(base)
        try:
            eventos = prog.ler_log(base)
        except Exception:
            continue
        for r in eventos:
            if r.get("registro") != "evento":
                continue
            quando = str(r.get("quando") or "")
            try:
                vivo = datetime.fromisoformat(quando.replace("Z", "+00:00")) >= corte
            except (ValueError, TypeError):
                vivo = False
            tudo.append({"id": r.get("id"), "quando": quando, "agente": r.get("agente"),
                         "tipo": r.get("tipo"), "resumo": r.get("resumo"),
                         "despacho": r.get("despacho"), "skills": r.get("skills") or [],
                         "agora": vivo, "projeto": slug, "projetoNome": nome})
    # Desempate pelo id: dois eventos podem cair no mesmo segundo, e sem um
    # critério estável a fronteira da página fica ambígua.
    tudo.sort(key=lambda u: (u["quando"], str(u["id"] or "")), reverse=True)

    # A ficha de cada agente é do histórico INTEIRO, não da página: "quem
    # trabalhou" não pode mudar de resposta só porque você rolou a lista.
    fichas: dict[tuple[str, str], dict] = {}
    for u in tudo:
        agente = u["agente"] or "(sem agente)"
        chave = (u["projeto"], agente)
        f = fichas.get(chave)
        if not f:
            f = {"agente": agente, "projeto": u["projeto"], "projetoNome": u["projetoNome"],
                 "eventos": 0, "agora": False, "ultimo": u["quando"], "primeiro": u["quando"],
                 "skills": []}
            fichas[chave] = f
        f["eventos"] += 1
        f["agora"] = f["agora"] or u["agora"]
        f["primeiro"] = u["quando"]          # a lista desce no tempo
        for sk in u["skills"]:
            if sk not in f["skills"]:
                f["skills"].append(sk)
    # Quem está trabalhando agora sobe; depois, o mais recente primeiro.
    agentes = sorted(fichas.values(), key=lambda f: (f["agora"], f["ultimo"]), reverse=True)

    # O cursor carrega data E id justamente por causa do empate acima: com só a
    # data, um evento do mesmo segundo que o último da página sumia da listagem.
    def _chave(u):
        return (u["quando"], str(u["id"] or ""))

    alvo = tuple(cursor.split("|", 1)) if cursor else None
    if alvo and len(alvo) == 1:
        alvo = (alvo[0], "")
    restantes = [u for u in tudo if not alvo or _chave(u) < alvo]
    pagina = restantes[:tamanho]
    proxima = ("|".join(_chave(pagina[-1]))
               if pagina and len(restantes) > len(pagina) else None)

    return {"usos": pagina, "proxima": proxima, "total": len(tudo),
            "janela": max(1, minutos),
            "agora": sum(1 for u in tudo if u["agora"]),
            "trabalhando": [f for f in agentes if f["agora"]],
            "agentes": agentes,
            "projetos": [{"slug": s, "nome": _project_display_name(PROJECTS_DIR / s)}
                         for s in _projetos_visiveis()]}


@app.get("/api/todos/propostas")
def propostas_todos(projetos: str = ""):
    """As propostas de Learning esperando veredito, de TODOS os projetos.

    Silêncio para sempre é o que fica proibido: recusar é resposta válida —
    aprendizado sobre o que NÃO é a competência —, não responder não é.
    """
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    fora = []
    for slug in _projetos_visiveis():
        if escolhidos and slug not in escolhidos:
            continue
        base = PROJECTS_DIR / slug
        nome = _project_display_name(base)
        try:
            todas = tse.propostas(base)
        except Exception:
            continue
        for pr in todas:
            if not pr.get("pendente"):
                continue
            fora.append({**pr, "projeto": slug, "projetoNome": nome})
    fora.sort(key=lambda p: str(p.get("quando") or ""), reverse=True)
    return {"propostas": fora, "pendentes": len(fora)}


@app.get("/api/todos/resources")
def list_resources_todos(projetos: str = ""):
    """Memórias, agentes, fluxos e personas de todos os projetos, de uma vez.

    `projetos` recorta por uma lista separada por vírgula — é o filtro, feito no
    servidor para a tela não carregar o que vai jogar fora.
    """
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    alvo = [p for p in _projetos_visiveis() if not escolhidos or p in escolhidos]
    fora: dict[str, list] = {k: [] for k in KINDS}
    for slug in alvo:
        try:
            um = list_resources(slug)
        except Exception:
            continue
        nome = _project_display_name(PROJECTS_DIR / slug)
        for k, itens in um.items():
            for it in itens:
                # O id ganha o projeto: `memory:tokens` existe em dois lugares e
                # são coisas diferentes. Sem isto a tela funde as duas.
                fora[k].append({**it, "projeto": slug, "projetoNome": nome,
                                "id": f"{slug}/{k}:{it['name']}"})
    return {**fora, "projetos": [{"slug": s, "nome": _project_display_name(PROJECTS_DIR / s)}
                                 for s in _projetos_visiveis()]}


@app.get("/api/todos/learnings")
def list_skills_todos(projetos: str = ""):
    """O repertório inteiro, de todos os projetos."""
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    fora = []
    for slug in _projetos_visiveis():
        if escolhidos and slug not in escolhidos:
            continue
        base = PROJECTS_DIR / slug
        nome = _project_display_name(base)
        try:
            for chave, sk in rep.carregar(base).items():
                fora.append({**sk, "chave": chave, "projeto": slug, "projetoNome": nome})
        except Exception:
            continue
    return {"skills": fora,
            "projetos": [{"slug": s, "nome": _project_display_name(PROJECTS_DIR / s)}
                         for s in _projetos_visiveis()]}


@app.get("/api/todos/canvases")
def list_canvases_todos(projetos: str = ""):
    """Os mapas de todos os projetos — o cosmos de cima."""
    escolhidos = [p.strip() for p in projetos.split(",") if p.strip()]
    fora = []
    for slug in _projetos_visiveis():
        if escolhidos and slug not in escolhidos:
            continue
        base = PROJECTS_DIR / slug
        nome = _project_display_name(base)
        for f in sorted((base / "canvases").glob("*.json")) if (base / "canvases").is_dir() else []:
            try:
                d = json.loads(f.read_text(encoding="utf-8")) or {}
            except json.JSONDecodeError:
                continue
            fora.append({"id": f"{slug}/{f.stem}", "canvas": f.stem,
                         "nome": d.get("name") or f.stem,
                         "cards": len(d.get("nodes") or []), "lanes": len(d.get("lanes") or []),
                         "projeto": slug, "projetoNome": nome})
    return {"mapas": fora,
            "projetos": [{"slug": s, "nome": _project_display_name(PROJECTS_DIR / s)}
                         for s in _projetos_visiveis()]}


@app.put("/api/projects/{project}/resources/{kind}/{name}/identity")
def save_resource_identity(project: str, kind: str, name: str, data: dict):
    """Grava cor, ícone, tags e ativa/inativa de um recurso."""
    if kind not in KIND_DIRS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    base = project_base(project)
    folder, _ = KIND_DIRS[kind]
    ext = ".md" if kind == "memory" else ".yaml"
    if not (base / folder / f"{name}{ext}").exists():
        raise HTTPException(404, f"{kind} '{name}' não encontrado")
    idx = _load_identity(base)
    idx[f"{kind}:{name}"] = _identity_norm({**idx.get(f"{kind}:{name}", {}), **data}, kind)
    _save_identity(base, idx)
    return {"ok": True, **idx[f"{kind}:{name}"]}


@app.put("/api/projects/{project}/memory-canvas")
def save_memory_canvas(project: str, data: dict, canvas: str | None = None):
    base = project_base(project)
    cid = canvas or data.get("id") or _canvas_default(base)
    lanes = [_lane_norm(l) for l in data.get("lanes", []) if l.get("id")]
    nodes, seen = [], set()
    for n in data.get("nodes", []):
        name = n.get("name")
        if not name:
            continue
        kind = n.get("kind", "memory")
        nid = n.get("id") or f"{kind}:{name}"
        if nid in seen:
            continue
        seen.add(nid)
        tags = [str(t).strip() for t in (n.get("tags") or []) if str(t).strip()][:12]
        nodes.append({
            "id": nid, "kind": kind, "name": name, "parent": n.get("parent") or None,
            "x": n.get("x", 0), "y": n.get("y", 0),
            "color": n.get("color", "#3b82f6"),
            "icon": n.get("icon") or KIND_DEFAULT_ICON.get(kind, "GiBrain"),
            "active": bool(n.get("active", True)),
            "tags": tags,
            "width": int(n.get("width") or 264),
            "height": int(n.get("height") or 176),
            "weight": _weight_norm(n.get("weight")),
        })
    # O que o usuário mudou no card do mapa vai para o índice de identidade, que
    # é a fonte única. MESCLA, não substitui: o payload do canvas não carrega
    # `type` nem `origin` (eles não existem no nó), e regravar a identidade
    # inteira zerava a classificação de toda memória a cada arrasto no mapa.
    idx = _load_identity(base)
    for n in nodes:
        chave = f'{n["kind"]}:{n["name"]}'
        vindos_do_no = {k: n[k] for k in ("color", "icon", "active", "tags") if k in n}
        idx[chave] = _identity_norm({**idx.get(chave, {}), **vindos_do_no}, n["kind"])
    _save_identity(base, idx)

    # `sourceHandle` diz de QUAL saída do card a seta parte: cada ligação ganha o
    # seu ponto na borda, em vez de todas brotarem do mesmo lugar.
    edges = [{"id": e.get("id"), "source": e.get("source"), "target": e.get("target"),
              "sourceHandle": e.get("sourceHandle") or None}
             for e in data.get("edges", []) if e.get("source") and e.get("target")]
    atual = _load_canvas_file(base, cid)
    _save_canvas_file(base, {"id": cid, "name": data.get("name") or atual.get("name") or cid,
                             "lanes": lanes, "nodes": nodes, "edges": edges}, cid)
    return {"ok": True}


@app.post("/api/projects/{project}/memory-canvas/lane-prompt")
def lane_prompt(project: str, data: dict):
    """Monta um prompt a partir dos recursos agrupados numa lane (macro-fluxo)."""
    base = project_base(project)
    name = (data.get("name") or "Lane").strip()
    items = data.get("items") or []

    out = [f"# Macro-fluxo: {name}", "",
           "Este agrupamento reúne os recursos abaixo do projeto. "
           "Use-os como contexto e roteiro de execução.", ""]
    titles = {"flow": "Fluxos", "agent": "Agentes", "persona": "Personas", "memory": "Memórias"}

    for kind in ("flow", "agent", "persona", "memory"):
        ks = [it for it in items if it.get("kind") == kind and it.get("name")]
        if not ks:
            continue
        out.append(f"## {titles[kind]}")
        seen = set()
        for it in ks:
            nm = it["name"]
            if nm in seen:
                continue
            seen.add(nm)
            if kind == "memory":
                p = base / "memory" / f"{nm}.md"
                out += [f"### {nm}", (p.read_text(encoding="utf-8").strip() if p.exists() else ""), ""]
            elif kind == "agent":
                cfg = load_yaml(base / "agents" / f"{nm}.yaml")
                out += [f"### {cfg.get('name', nm)} (agents/{nm}.yaml)",
                        (cfg.get("description") or "").strip(),
                        "", "System prompt:", (cfg.get("system_prompt") or "").strip(), ""]
            elif kind == "persona":
                cfg = load_yaml(base / "personas" / f"{nm}.yaml")
                out += [f"### {cfg.get('name', nm)} — {cfg.get('role', '')} ({cfg.get('age', '')})",
                        (cfg.get("bio") or "").strip(), ""]
            elif kind == "flow":
                cfg = load_yaml(base / "flows" / f"{nm}.yaml")
                out.append(f"### {cfg.get('name', nm)} (flows/{nm}.yaml)")
                if cfg.get("description"):
                    out.append(cfg["description"].strip())
                for i, st in enumerate(cfg.get("steps") or []):
                    instr = (st.get("instruction") or "").strip().replace("\n", " ")[:200]
                    out.append(f"{i + 1}. [{st.get('id')}] agente: {st.get('agent')} — {instr}")
                out.append("")
        out.append("")

    return {"prompt": "\n".join(out)}


@app.post("/api/projects/{project}/memory-canvas/lane-digest")
def lane_digest(project: str, data: dict):
    """Condensa todos os recursos de uma lane em um único texto.

    O peso de cada instância define a fatia do orçamento que ela ocupa no
    condensado. Nenhum arquivo de origem é alterado: a condensação acontece
    em memória, a cada chamada.
    """
    base   = project_base(project)
    name   = (data.get("name") or "Lane").strip()
    budget = max(1000, min(200000, int(data.get("budget") or 12000)))
    items  = data.get("items") or []
    if not items:
        raise HTTPException(400, "Lane sem recursos.")

    plan = _digest_plan(base, items, budget)
    titles = {"flow": "Fluxos", "agent": "Agentes", "persona": "Personas", "memory": "Memórias"}

    # ── Condensado determinístico (pronto para uso, sem depender de LLM) ──
    out = [f"# {name} — condensado", "",
           f"Síntese de {len([p for p in plan if p['weight'] > 0])} recursos da lane, "
           f"com peso relativo definido no mapa. Orçamento: {budget} caracteres.", ""]
    for kind in ("flow", "agent", "persona", "memory"):
        ks = [p for p in plan if p["kind"] == kind and p["weight"] > 0]
        if not ks:
            continue
        out.append(f"## {titles[kind]}")
        out.append("")
        for p in ks:
            body = _condense_md(p["_text"], p["budget"])
            if not body:
                continue
            flag = " · condensado" if p["condensed"] else " · íntegro"
            out.append(f"### {p['name']} (peso {p['weight']} · {p['share']}%{flag})")
            out.append("")
            out.append(body)
            out.append("")
    digest = "\n".join(out).strip()

    # ── Prompt de síntese (para um LLM fazer o condensado com qualidade) ──
    ln = [f"# Condensar a lane: {name}", "",
          "Produza UM texto único e coerente que sintetize os recursos abaixo. "
          "Não é um resumo por arquivo nem uma concatenação: é uma síntese do agrupamento inteiro, "
          "sem repetir a mesma informação em lugares diferentes.", "",
          f"Orçamento total: aproximadamente {budget} caracteres.", "",
          "## Peso de cada recurso",
          "",
          "O peso indica a importância relativa no condensado. Respeite a proporção: "
          "um recurso com o dobro do peso ocupa aproximadamente o dobro do espaço e "
          "prevalece em caso de conflito de informação. Peso 0 fica de fora.", ""]
    for p in plan:
        if p["weight"] <= 0:
            ln.append(f"- {p['name']} ({titles.get(p['kind'], p['kind'])}): peso 0, IGNORAR")
            continue
        ln.append(f"- {p['name']} ({titles.get(p['kind'], p['kind'])}): peso {p['weight']}, "
                  f"{p['share']}% do condensado, cerca de {p['budget']} caracteres "
                  f"(original: {p['chars']})")
    ln += ["", "## Regras", "",
           "- Preserve decisões, regras e proibições na íntegra. Corte primeiro justificativa e exemplo.",
           "- Onde dois recursos se contradisserem, prevalece o de maior peso, e registre a divergência em uma linha.",
           "- Mantenha os termos exatos do projeto. Não reescreva vocabulário consolidado.",
           "- Não invente nada que não esteja nos recursos.", "",
           "## Recursos", ""]
    for kind in ("flow", "agent", "persona", "memory"):
        ks = [p for p in plan if p["kind"] == kind and p["weight"] > 0]
        if not ks:
            continue
        ln.append(f"### {titles[kind]}")
        ln.append("")
        for p in ks:
            ln += [f"#### {p['name']} (peso {p['weight']})", "", p["_text"], ""]
    prompt = "\n".join(ln).strip()

    return {
        "name": name,
        "budget": budget,
        "plan": [{k: v for k, v in p.items() if k != "_text"} for p in plan],
        "digest": digest,
        "digestChars": len(digest),
        "sourceChars": sum(p["chars"] for p in plan),
        "prompt": prompt,
    }


# ── Personas ──────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project}/personas")
def list_personas(project: str):
    result = []
    for f in sorted(personas_dir(project).glob("*.yaml")):
        cfg = load_yaml(f)
        result.append({
            "name":        f.stem,
            "displayName": cfg.get("name", f.stem),
            "role":        cfg.get("role", ""),
            "age":         cfg.get("age", ""),
        })
    return result


@app.get("/api/projects/{project}/personas/{name}")
def get_persona(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "personas", name, ".yaml")
    if not path.exists():
        raise HTTPException(404, f"Persona '{name}' não encontrada")
    return load_yaml(path)


@app.put("/api/projects/{project}/personas/{name}")
def save_persona(project: str, name: str, data: dict):
    save_yaml(caminho_de_recurso(project_base(project), "personas", name, ".yaml"), data)
    return {"ok": True}


@app.delete("/api/projects/{project}/personas/{name}")
def delete_persona(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "personas", name, ".yaml")
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
    return {"ok": True}


@app.post("/api/projects/{project}/personas/{name}/rename")
def rename_persona(project: str, name: str, data: dict):
    new_name = (data.get("new_name") or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name obrigatório")
    old = caminho_de_recurso(project_base(project), "personas", name, ".yaml")
    new = caminho_de_recurso(project_base(project), "personas", new_name, ".yaml")
    if not old.exists():
        raise HTTPException(404)
    if new.exists():
        raise HTTPException(409, f"'{new_name}' já existe")
    old.rename(new)
    return {"ok": True}


# ── Gerador de setup (prompt para agente externo + import) ────────────────────

def _read_template(rel: str) -> str:
    path = TEMPLATES_DIR / rel
    return path.read_text(encoding="utf-8").strip() if path.exists() else "(template indisponível)"


def _build_setup_prompt(brief: dict) -> str:
    name        = (brief.get("name") or "").strip() or "Novo Projeto"
    slug        = slugify(brief.get("slug") or name)
    description = (brief.get("description") or "").strip()
    audience    = (brief.get("audience") or "").strip()
    goals       = (brief.get("goals") or "").strip()
    tone        = (brief.get("tone") or "").strip()
    stack       = (brief.get("stack") or "").strip()
    n_agents    = brief.get("num_agents") or 4
    n_personas  = brief.get("num_personas") or 4
    n_flows     = brief.get("num_flows") or 3
    extras      = (brief.get("extras") or "").strip()

    ex_agent   = _read_template("agents/redator.yaml")
    ex_flow    = _read_template("flows/exemplo_conteudo.yaml")
    ex_persona = _read_template("personas/exemplo_cliente.yaml")
    ex_memory  = _read_template("memory/sobre_mim.md")

    brief_lines = [f"- Nome do projeto: {name}", f"- Slug: {slug}"]
    if description: brief_lines.append(f"- Descrição: {description}")
    if audience:    brief_lines.append(f"- Público-alvo: {audience}")
    if goals:       brief_lines.append(f"- Objetivos: {goals}")
    if tone:        brief_lines.append(f"- Tom de voz / marca: {tone}")
    if stack:       brief_lines.append(f"- Stack técnica: {stack}")
    if extras:      brief_lines.append(f"- Notas adicionais: {extras}")
    brief_block = "\n".join(brief_lines)

    return f"""\
Você é um arquiteto de sistemas de agentes de IA. Sua tarefa é projetar o setup COMPLETO de um novo projeto para uma ferramenta chamada "Noctis".

No Noctis, um projeto é composto por quatro tipos de recurso, cada um salvo como um arquivo:
- AGENTES (agents/*.yaml): personas de IA com system_prompt, memória e parâmetros.
- FLUXOS (flows/*.yaml): encadeiam agentes em etapas, passando dados entre eles via {{{{ chave }}}}.
- PERSONAS (personas/*.yaml): perfis de usuários/clientes usados para revisões e testes de UX.
- MEMÓRIA (memory/*.md): contexto permanente em Markdown, injetado nos agentes.

## Briefing do projeto
{brief_block}

## O que você deve gerar
- {n_agents} agentes coerentes com o projeto (nomes em snake_case nos filenames).
- {n_flows} fluxos úteis que combinem esses agentes.
- {n_personas} personas realistas do público-alvo.
- Arquivos de memória essenciais (no mínimo: sobre_mim.md, projetos.md, voz_marca.md; adicione stack_tecnica.md se fizer sentido).
- Os `memory_files` de cada agente devem referenciar apenas arquivos de memória que você criou, no formato "memory/arquivo.md".
- Em flows, o campo `agent` de cada step deve referenciar um agente que você criou (pelo filename sem .yaml).

## Esquema e exemplo de cada tipo

### Agente (agents/<nome>.yaml)
Campos: name, description, system_prompt (multi-linha), memory_files (lista), tools (lista, pode ser vazia), output_format, temperature (0.2 a 0.4 técnico, 0.6 a 0.8 criativo).
Exemplo real:
```yaml
{ex_agent}
```

### Fluxo (flows/<nome>.yaml)
Campos: name, description, steps (lista de {{id, agent, input, instruction, output_key}}), output.
Use {{{{ tarefa }}}} para o input inicial e {{{{ output_key }}}} para encadear resultados.
Exemplo real:
```yaml
{ex_flow}
```

### Persona (personas/<nome>.yaml)
Campos: name, role, age, company_profile, bio, goals_on_site, tech_literacy, preferred_device, reading_pattern, trust_signals, red_flags, objections, entry_point.
Exemplo real:
```yaml
{ex_persona}
```

### Memória (memory/<nome>.md)
Markdown livre com o contexto do projeto.
Exemplo real:
```markdown
{ex_memory}
```

## Regras de escrita
- Escreva todo o conteúdo em português.
- NÃO use travessão (—) como conector; use vírgula ou ponto.
- Conteúdo concreto e específico do projeto, não placeholders genéricos.

## FORMATO DE SAÍDA (OBRIGATÓRIO)
Responda com UM ÚNICO bloco JSON válido e NADA MAIS (sem texto antes ou depois, sem ```). Estrutura exata:

{{
  "project": {{ "name": "{name}", "slug": "{slug}" }},
  "agents":   [ {{ "filename": "redator.yaml",  "content": "<conteúdo YAML completo do agente>" }} ],
  "flows":    [ {{ "filename": "exemplo.yaml",   "content": "<conteúdo YAML completo do fluxo>" }} ],
  "personas": [ {{ "filename": "ceo.yaml",       "content": "<conteúdo YAML completo da persona>" }} ],
  "memory":   [ {{ "filename": "sobre_mim.md",   "content": "<conteúdo Markdown completo>" }} ]
}}

O valor de cada "content" é a STRING com o arquivo inteiro (com quebras de linha escapadas como \\n no JSON). Garanta que o JSON seja parseável.
"""


@app.post("/api/setup/generate-prompt")
def generate_setup_prompt(brief: dict):
    if not (brief.get("name") or "").strip():
        raise HTTPException(400, "name obrigatório")
    return {"prompt": _build_setup_prompt(brief)}


def _safe_filename(raw: str, fallback: str, ext: str) -> str:
    stem = slugify(Path(raw or "").stem) or slugify(fallback) or "item"
    return f"{stem}{ext}"


@app.post("/api/setup/import")
def import_setup(payload: dict):
    """Recebe o JSON gerado por um agente externo e cria o projeto."""
    data = payload.get("data")
    if not isinstance(data, dict):
        raise HTTPException(400, "Campo 'data' deve ser o objeto JSON do setup")

    proj     = data.get("project") or {}
    raw_name = (proj.get("name") or payload.get("name") or "").strip()
    if not raw_name:
        raise HTTPException(400, "project.name ausente no JSON")
    slug = slugify(proj.get("slug") or raw_name)
    if not slug:
        raise HTTPException(400, "slug inválido")

    dest      = PROJECTS_DIR / slug
    overwrite = bool(payload.get("overwrite"))
    if dest.exists() and not overwrite:
        raise HTTPException(409, f"Projeto '{slug}' já existe")
    if dest.exists():
        shutil.rmtree(dest)

    for d in RESOURCE_DIRS:
        (dest / d).mkdir(parents=True, exist_ok=True)
    save_yaml(_project_meta_path(dest), {"name": raw_name, "slug": slug})

    counts = {}
    specs = [("agents", "agents", ".yaml"), ("flows", "flows", ".yaml"),
             ("personas", "personas", ".yaml"), ("memory", "memory", ".md")]
    for key, folder, ext in specs:
        items = data.get(key) or []
        written = 0
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                continue
            fname   = _safe_filename(it.get("filename", ""), it.get("name", f"{key}_{i+1}"), ext)
            content = it.get("content", "")
            if not isinstance(content, str):
                content = yaml.dump(content, allow_unicode=True, sort_keys=False)
            (dest / folder / fname).write_text(content, encoding="utf-8")
            # Tudo que entra por aqui saiu de uma geração, não da mão de alguém.
            marcar_origem(dest, KIND_POR_PASTA[folder], Path(fname).stem, "produzido")
            written += 1
        counts[key] = written

    return {"ok": True, "slug": slug, "displayName": raw_name, "counts": counts}


# ── Config (para dropdowns) ───────────────────────────────────────────────────

@app.get("/api/projects/{project}/config")
def get_config(project: str):
    agents       = [f.stem for f in sorted(agents_dir(project).glob("*.yaml"))]
    memory_files = [f"memory/{f.name}" for f in sorted(memory_dir(project).glob("*.md"))]
    personas     = [f.stem for f in sorted(personas_dir(project).glob("*.yaml"))]
    return {"agents": agents, "memory_files": memory_files, "personas": personas}


# ── Exportar em PDF ───────────────────────────────────────────────────────────

def _corpo_do_recurso(base: Path, kind: str, name: str) -> tuple[str, list, list]:
    """O conteúdo inteiro de um recurso, em HTML, mais anexos e imagens.

    Memória sai como markdown renderizado; agente, fluxo e persona saem como o
    YAML literal, dentro de bloco de código — reescrever a estrutura deles em
    prosa seria interpretar, e o pedido é o documento na íntegra.
    """
    folder, _ = KIND_DIRS[kind]
    ext = ".md" if kind == "memory" else ".yaml"
    caminho = caminho_de_recurso(base, folder, name, ext)
    if not caminho.exists():
        raise HTTPException(404, f"{kind} '{name}' não encontrado")
    texto = caminho.read_text(encoding="utf-8")

    if kind != "memory":
        return f"<pre><code>{html_mod.escape(texto)}</code></pre>", [], []

    anexos = _attachments_for(base, name)
    dir_anexos = _attach_dir_for(base, name)
    imagens = [dir_anexos / a["filename"] for a in anexos if a.get("isImage")]
    corpo = pdf.markdown_para_html(texto, dir_anexos if dir_anexos.is_dir() else None)
    return corpo, [a | {"name": a["filename"]} for a in anexos], imagens


def _pdf_de_recursos(base: Path, itens: list[tuple[str, str]], titulo: str,
                     meta_doc: list[str]) -> Path:
    """Monta o documento e imprime. `itens` é uma lista de (kind, nome)."""
    if EFEMERO:
        # Imprimir exige um Chrome de verdade, e não há navegador dentro de uma
        # função serverless. Melhor dizer isso do que estourar um 500 opaco.
        raise HTTPException(
            501, "A exportação em PDF só funciona no Noctis rodando na sua "
                 "máquina: ela imprime pelo Chrome instalado, que não existe aqui.")
    idx = _load_identity(base)
    tipos = _vocabulario()["types"]
    blocos = []
    for kind, nome in itens:
        corpo, anexos, imagens = _corpo_do_recurso(base, kind, nome)
        ident = _identity_of(base, kind, nome, idx)
        tipo = tipos.get(ident.get("type") or "", {})
        cor = ident.get("color") or KIND_META_COLOR.get(kind, "#3f3f46")
        meta = [KIND_META_PADRAO[kind]["label"]]
        if kind == "memory":
            if tipo:
                meta.append(f"tipo: {tipo.get('label')}")
            meta.append(ident.get("origin") or DEFAULT_ORIGIN)
        if ident.get("tags"):
            meta.append(" ".join("#" + t for t in ident["tags"]))
        blocos.append(pdf.bloco_recurso(nome, cor, tipo.get("label", ""), meta,
                                        corpo, anexos, imagens))
    doc = pdf.documento_html(titulo, meta_doc, "".join(blocos))
    destino = Path(tempfile.gettempdir()) / f"noctis-{uuid.uuid4().hex}.pdf"
    return pdf.html_para_pdf(doc, destino)


@app.get("/api/projects/{project}/export/pdf/{kind}/{name}")
def exportar_recurso_pdf(project: str, kind: str, name: str):
    """Um recurso, inteiro, em PDF."""
    if kind not in KIND_DIRS:
        raise HTTPException(400, f"tipo inválido: {kind}")
    base = project_base(project)
    arquivo = _pdf_de_recursos(base, [(kind, name)], name,
                               [base.name, datetime.now().strftime("%d/%m/%Y")])
    return FileResponse(arquivo, media_type="application/pdf",
                        filename=f"{nome_de_recurso(name)}.pdf",
                        background=BackgroundTask(lambda: arquivo.unlink(missing_ok=True)))


@app.get("/api/projects/{project}/export/pdf-lane/{lane_id}")
def exportar_lane_pdf(project: str, lane_id: str, canvas: str | None = None):
    """Uma lane inteira: todos os cards dela, na ordem em que estão no mapa.

    A ordem é a de leitura do mapa — de cima para baixo, e da esquerda para a
    direita em caso de empate —, não a ordem do arquivo. É o que faz o PDF sair
    na sequência que a pessoa arrumou com as mãos.
    """
    base = project_base(project)
    data = _load_canvas_file(base, canvas)
    lane = next((l for l in data.get("lanes", []) if l.get("id") == lane_id), None)
    if not lane:
        raise HTTPException(404, f"lane '{lane_id}' não encontrada")

    dentro = [n for n in data.get("nodes", []) if n.get("parent") == lane_id]
    dentro.sort(key=lambda n: (round(n.get("y", 0) / 40), n.get("x", 0)))
    itens = [(n.get("kind") or "memory", n["name"]) for n in dentro if n.get("name")]
    if not itens:
        raise HTTPException(400, "lane vazia")

    titulo = lane.get("name") or lane_id
    arquivo = _pdf_de_recursos(
        base, itens, titulo,
        [base.name, f"{len(itens)} card{'s' if len(itens) != 1 else ''}",
         datetime.now().strftime("%d/%m/%Y")])
    return FileResponse(arquivo, media_type="application/pdf",
                        filename=f"{nome_de_recurso(titulo)}.pdf",
                        background=BackgroundTask(lambda: arquivo.unlink(missing_ok=True)))


# ── Progresso dos agentes: XP, níveis e Learnings ───────────────────────────

@app.get("/api/projects/{project}/progresso")
def ler_progresso(project: str):
    """A ficha de todos os agentes do projeto, recalculada do log."""
    base = project_base(project)
    r = rep.sincronizar(base)
    estado = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))
    esc = regras.escopo_de_projeto(project)
    estado["curvas"] = {"agente": regras.valor("xp.curva_agente", esc), "skill": regras.valor("xp.curva_learning", esc)}
    estado["tipos"] = regras.valor("xp.base_por_tipo", esc)
    return estado


@app.get("/api/projects/{project}/progresso/{agente}")
def ler_progresso_agente(project: str, agente: str):
    base = project_base(project)
    r = rep.carregar(base)
    fichas = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))["agentes"]
    if agente not in fichas:
        # Agente sem evento ainda existe: devolve a ficha zerada em vez de 404,
        # senão a UI teria de tratar dois mundos.
        n, ini, fim, frac = prog.nivel_de(0, tuple(regras.valor("xp.curva_agente", regras.escopo_de_projeto(project))))
        return {"agente": agente, "xp": 0, "eventos": 0, "nivel": n,
                "inicio_nivel": round(ini), "proximo_nivel": round(fim),
                "progresso": frac, "habilidades": {}, "brotos": {},
                "historico": [], "topo": []}
    return fichas[agente]


@app.post("/api/projects/{project}/eventos")
def registrar_evento(project: str, data: dict):
    """Registra trabalho feito.

    O corpo diz o QUE foi feito e com que evidência; o XP é calculado no
    servidor. Mandar um campo `xp` aqui não tem efeito nenhum, de propósito.
    """
    base = project_base(project)
    kind_dir, _ = KIND_DIRS["agent"]
    nome = str(data.get("agente") or "").strip()
    if nome and not (base / kind_dir / f"{nome_de_recurso(nome)}.yaml").exists():
        raise HTTPException(404, f"agente '{nome}' não existe neste projeto")
    # Escrita de Learnings pausada nas Regras: o trabalho é registrado e rende
    # XP, mas os nomes de Learning são descartados antes de entrar no log.
    if not regras.valor("protocolo.declarar_learnings", regras.escopo_de_projeto(project)):
        data = {**data, "habilidades": [], "descricoes": {}}

    # Nível ANTES do evento: é a comparação que revela a subida, e é ela que
    # faz o CLI pedir ao agente o que ele aprendeu — no instante em que ele
    # ainda sabe.
    antes = prog.estado_do_projeto(base, rep.indice(rep.carregar(base)))["agentes"].get(nome, {})
    niveis_antes = {k: h["nivel"] for k, h in {**antes.get("habilidades", {}),
                                               **antes.get("brotos", {})}.items()}
    nivel_antes = antes.get("nivel", 1)

    try:
        ev = prog.registrar_evento(base, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    # O repertório acolhe o nome novo na hora, e não na próxima visita à página.
    rep.sincronizar(base)
    # O repertório acolhe o nome novo na hora, e não na próxima visita à página.
    r = rep.sincronizar(base)

    # Descrição escrita por quem criou o Learning, no mesmo comando. Só entra
    # onde está vazio: ninguém reescreve por cima do que já foi curado.
    idx = rep.indice(r)
    declaradas = []
    for rotulo in (data.get("habilidades") or []):
        chave = idx.get(prog.slug(str(rotulo)))
        if chave:
            declaradas.append(chave)
    especie = str(data.get("especie") or "")
    for rotulo, texto in (data.get("descricoes") or {}).items():
        chave = idx.get(prog.slug(str(rotulo)))
        if chave and str(texto).strip():
            rep.atualizar(base, chave, {"descricao": str(texto)}, nome)
    # A espécie declarada no despacho vale para o que nasceu neste evento.
    if especie:
        for chave in {idx.get(prog.slug(str(x))) for x in (data.get("habilidades") or [])}:
            if chave and chave in r and not r[chave].get("especie"):
                rep.atualizar(base, chave, {"especie": especie})
    r = rep.carregar(base)

    ficha = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))["agentes"].get(nome, {})
    agora_hab = {**ficha.get("habilidades", {}), **ficha.get("brotos", {})}

    # Só sobe quem já existia: Learning novo nasce no nível 1, e chamar isso de
    # subida faria o CLI pedir "o que mudou" sobre algo que acabou de começar.
    subiram = [{"chave": k, "rotulo": agora_hab[k]["rotulo"], "nivel": agora_hab[k]["nivel"]}
               for k in declaradas
               if k in agora_hab and k in niveis_antes and agora_hab[k]["nivel"] > niveis_antes[k]]

    # A cobrança é sobre o que ESTE evento declarou. Cobrar o repertório inteiro
    # a cada registro vira ruído, e ruído a gente aprende a ignorar.
    sem_descricao = [{"chave": k, "rotulo": agora_hab[k]["rotulo"]} for k in declaradas
                     if k in agora_hab and k in r and not (r[k].get("descricao") or "").strip()]
    return {"ok": True, "evento": ev,
            "xp": ficha.get("xp", 0), "nivel": ficha.get("nivel", 1),
            "progresso": ficha.get("progresso", 0.0),
            "subiuDeNivel": ficha.get("nivel", 1) > nivel_antes,
            "subiram": subiram, "semDescricao": sem_descricao,
            "habilidades": list(ficha.get("habilidades", {})),
            "brotos": list(ficha.get("brotos", {}))}


@app.post("/api/projects/{project}/eventos/{evento_id}/confirmar")
def confirmar_evento(project: str, evento_id: str, data: dict | None = None):
    """Valida uma entrega — é o que libera o multiplicador de confirmação."""
    base = project_base(project)
    por = str((data or {}).get("por") or "").strip() or "usuario"
    try:
        return {"ok": True, "confirmacao": prog.confirmar_evento(base, evento_id, por)}
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError:
        raise HTTPException(404, f"evento '{evento_id}' não encontrado")


@app.post("/api/projects/{project}/marcos")
def registrar_marco(project: str, data: dict):
    """O que um agente aprendeu ao subir de nível num Learning."""
    base = project_base(project)
    agente = str(data.get("agente") or "").strip()
    hab = str(data.get("habilidade") or "").strip()
    texto = str(data.get("texto") or "").strip()
    if not (agente and hab and texto):
        raise HTTPException(400, "informe agente, Learning e texto")
    autor_de_agente = True
    if autor_de_agente and not regras.valor("protocolo.declarar_learnings", regras.escopo_de_projeto(project)):
        raise HTTPException(403, "A escrita de Learnings por agentes está pausada nas Regras do Noctis.")
    r = rep.carregar(base)
    chave = rep.indice(r).get(prog.slug(hab)) or prog.slug(hab)
    m = prog.registrar_marco(base, agente, chave, texto, int(data.get("nivel") or 0))
    # Learning sem descrição herda o primeiro marco: um aprendizado escrito
    # explica melhor do que um campo vazio, e a curadoria pode melhorá-lo depois.
    if chave in r and not (r[chave].get("descricao") or "").strip():
        rep.atualizar(base, chave, {"descricao": texto}, agente)
    return {"ok": True, "marco": m}


@app.post("/api/projects/{project}/learnings/fundir")
def fundir_habilidades(project: str, data: dict):
    """Funde Learnings que são a mesma coisa com nomes diferentes.

    Vale retroativamente: a fusão entra no log e o recálculo passa a somar tudo
    no destino.
    """
    base = project_base(project)
    de = [str(d) for d in (data.get("de") or []) if str(d).strip()]
    para = str(data.get("para") or "").strip()
    if not de or not para:
        raise HTTPException(400, "informe `de` (lista) e `para`")
    prog.fundir_habilidades(base, de, para, str(data.get("rotulo") or ""))
    return {"ok": True, "estado": prog.estado_do_projeto(base)["agentes"]}


@app.put("/api/projects/{project}/learnings/{chave}/corpo")
def escrever_corpo_skill(project: str, chave: str, data: dict):
    """Reescreve o corpo inteiro com o markdown que você escreveu — curadoria.

    A partir daqui o corpo é SEU: as respostas das perguntas continuam sendo
    guardadas, mas param de remontar o documento. Sem isso, responder uma
    pergunta apagaria o markdown que você acabou de colar — e foi para isso
    que a marca de curadoria existe no resto do sistema.
    """
    base = project_base(project)
    if chave not in rep.carregar(base):
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    corpo = str(data.get("corpo") or "")
    rep.atualizar(base, chave, {"corpo_curado": bool(corpo.strip())})
    return {"ok": True, "corpo": rep.escrever_corpo(base, chave, corpo)}


@app.post("/api/projects/{project}/learnings/{chave}/corpo")
def anexar_corpo_skill(project: str, chave: str, data: dict):
    """Acrescenta um trecho assinado ao corpo. É assim que o agente contribui."""
    base = project_base(project)
    if chave not in rep.carregar(base):
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    texto = str(data.get("texto") or "").strip()
    if not texto:
        raise HTTPException(400, "texto vazio")
    autor = str(data.get("autor") or "usuario").strip()
    autor_de_agente = autor != "usuario"
    if autor_de_agente and not regras.valor("protocolo.declarar_learnings", regras.escopo_de_projeto(project)):
        raise HTTPException(403, "A escrita de Learnings por agentes está pausada nas Regras do Noctis.")

    return {"ok": True, "corpo": rep.anexar_ao_corpo(base, chave, texto, autor)}


@app.get("/api/projects/{project}/learnings-consulta")
def consultar_skills(project: str, q: str = "", agente: str = "", modo: str = "consulta",
                     limite: int = 5):
    """O que o projeto já aprendeu sobre um assunto.

    `modo=consulta` devolve o texto inteiro — é o agente perguntando no meio do
    trabalho. `modo=briefing` devolve só descrição e armadilhas — é o pedido de
    quem vai delegar, e cabe dentro de um despacho.
    """
    base = project_base(project)
    achados = rep.buscar(base, q, max(1, min(limite, 10)))
    for a in achados:
        a["origem"] = base.name
    # A base entra em toda consulta. É o que faz um aprendizado de um projeto
    # evitar o mesmo erro em outro — o motivo de ela existir.
    if base.name != BASE_SLUG:
        vistos = {a["chave"] for a in achados}
        for a in rep.buscar(PROJECTS_DIR / BASE_SLUG, q, 4):
            if a["chave"] not in vistos:
                a["origem"] = BASE_SLUG
                achados.append(a)
        achados.sort(key=lambda a: -a["nota"])
        achados = achados[:max(1, min(limite, 10))]
    if modo == "briefing":
        for a in achados:
            # No briefing, só a armadilha carrega o texto: é a que evita o erro.
            a["corpo"] = a["corpo"][:900] if a["especie"] == "armadilha" else ""
    else:
        for a in achados:
            a["corpo"] = a["corpo"][:4000]
    if agente:
        rep.registrar_consulta(base, agente, q, [a["chave"] for a in achados], modo)
    # Junto com os Learnings vai o que já foi VALIDADO nos domínios achados —
    # curto e com id, para o agente citar no fim o que aplicou. Contexto que
    # viaja inteiro a cada despacho é o desperdício que o Noctis evita.
    chaves = [x.get("chave") for x in achados if x.get("chave")]
    return {"consulta": q, "modo": modo, "achados": achados,
            "aprendizados": apr.para_o_protocolo(base, chaves) if chaves else []}


@app.get("/api/projects/{project}/aptidao")
def ler_aptidao(project: str, learnings: str = ""):
    """Quem está mais apto para um despacho, dadas os Learnings desejadas."""
    base = project_base(project)
    desejadas = [h.strip() for h in learnings.split(",") if h.strip()]
    if not desejadas:
        raise HTTPException(400, "informe ?learnings=a,b,c")
    return {"desejadas": desejadas, "ranking": prog.aptidao(base, desejadas)}


# ── Repertório de Learnings ─────────────────────────────────────────────────

@app.get("/api/projects/{project}/learnings")
def ler_skills(project: str):
    """O repertório do projeto, com quem tem cada Learning e em que nível."""
    return rep.visao(project_base(project))


@app.post("/api/projects/{project}/learnings")
def criar_skill(project: str, data: dict):
    """Cria um Learning sem evento — o aprendizado que já existe em documento."""
    base = project_base(project)
    rotulo = str(data.get("rotulo") or "").strip()
    if not rotulo:
        raise HTTPException(400, "informe `rotulo`")
    autor_de_agente = str(data.get("autor") or "usuario") != "usuario"
    # Criar Learning é seu. O agente propõe TESE sobre um Learning que já
    # existe (POST /skills/{chave}/teses) — nomear o repertório, não.
    if autor_de_agente and regras.valor("learning.so_o_dono_cria"):
        raise HTTPException(
            403, "criar Learning é do dono — o agente propõe tese sobre um Learning existente")

    # Procurar antes de criar: duas entradas para a mesma coisa são o jeito mais
    # rápido de um repertório virar pilha.
    mesma, proximas = rep.parecidas(base, rotulo)
    if mesma:
        raise HTTPException(409, f"já existe como '{mesma}'")
    try:
        sk = rep.criar(base, rotulo, str(data.get("descricao") or ""),
                       str(data.get("especie") or ""), str(data.get("autor") or "usuario"),
                       str(data.get("natureza") or ""),
                       data.get("tags") or [])
        return {"ok": True, "skill": sk, "parecidas": proximas}
    except KeyError:
        raise HTTPException(409, f"'{rotulo}' já existe no repertório")
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Propostas de Learning ──────────────────────────────────────────────────
# O agente não cria repertório, mas topa com o que o repertório não nomeia.
# Propor é dele; aceitar é seu. Sem isto, o que ele descobre só tinha dois
# destinos: virar tese forçada num Learning que não era aquela, ou sumir.

@app.get("/api/projects/{project}/propostas")
def ler_propostas(project: str, so_pendentes: bool = False):
    todas = tse.propostas(project_base(project))
    return {"propostas": [p for p in todas if p["pendente"]] if so_pendentes else todas,
            "pendentes": sum(1 for p in todas if p["pendente"])}


@app.post("/api/projects/{project}/propostas")
def propor_habilidade(project: str, data: dict):
    """O agente propõe. Nada nasce daqui sem a sua resposta."""
    if not regras.valor("learning.agente_propoe", regras.escopo_de_projeto(project)):
        raise HTTPException(403, "propor Learning está desligado nas regras do Noctis")
    try:
        return {"ok": True, "proposta": tse.propor_habilidade(project_base(project), data)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/propostas/{pid}/responder")
def responder_proposta(project: str, pid: str, data: dict):
    """Aceita, recusa ou pede ajuste. Aceitar é o único caminho que cria."""
    try:
        return {"ok": True, **tse.responder_proposta(project_base(project), pid, data)}
    except KeyError:
        raise HTTPException(404, f"proposta '{pid}' não encontrada")
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── O loop de aprendizado ────────────────────────────────────────────────────
# observação → hipótese → pergunta → sua resposta → aprendizado. O agente
# escreve só os dois primeiros; o aprendizado nasce da resposta da pessoa.

@app.get("/api/projects/{project}/teses")
def ler_teses(project: str):
    """Cada pergunta com quantos Learnings marcaram cada tese.

    Tese que ninguém nunca marca é tese ruim — ou está mal escrita, ou não
    descreve trabalho real. O painel mostra isso para você reescrever ou cortar,
    em vez de a lista crescer para sempre.
    """
    base = project_base(project)
    skills = rep.carregar(base)
    perguntas = enq._perguntas()
    saida = []
    for p in perguntas:
        respostas = [d.get("enquadramento", {}).get(p["campo"]) for d in skills.values()]
        marcadas = [r for r in respostas if isinstance(r, list)]
        contagem = {o: sum(1 for r in marcadas if o in r) for o in p["opcoes"]}
        saida.append({**p,
                      "respondidaPor": len(marcadas),
                      "dispensadaPor": sum(1 for r in marcadas if not r),
                      "usos": contagem})
    return {"perguntas": saida, "habilidades": len(skills)}


@app.get("/api/projects/{project}/enquadramento")
def ler_enquadramento(project: str):
    """As perguntas que descobrem o que cada Learning é, e quantas faltam."""
    return enq.estado(project_base(project))


@app.get("/api/projects/{project}/learnings/{chave}/enquadramento-md")
def ler_enquadramento_md(project: str, chave: str):
    """O markdown que as suas respostas renderiam — para inserir num corpo seu."""
    d = rep.carregar(project_base(project)).get(chave)
    if not d:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    return {"markdown": enq.corpo_de(d)}


@app.post("/api/projects/{project}/learnings/{chave}/enquadrar")
def enquadrar_skill(project: str, chave: str, data: dict):
    """Sua resposta a uma pergunta de enquadramento — ela preenche o Learning."""
    try:
        return {"ok": True, "skill": enq.responder(
            project_base(project), str(chave), str(data.get("campo") or ""),
            data.get("escolhas", data.get("valor") or []),
            str(data.get("por") or "usuario"))}
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/projects/{project}/aprendizado")
def ler_aprendizado(project: str):
    """Tudo do loop no projeto: observações, hipóteses com confiança, aprendizados."""
    return apr.estado(project_base(project))


@app.get("/api/projects/{project}/aprendizado/inbox")
def ler_inbox(project: str):
    """As perguntas esperando você, a mais incerta primeiro — é a que mais ensina."""
    return {"perguntas": apr.inbox(project_base(project))}


@app.get("/api/projects/{project}/aprendizado/{chave}")
def ler_aprendizado_do_dominio(project: str, chave: str):
    """O recorte de um domínio: o que se observou, o que se supõe, o que se sabe."""
    return apr.do_skill(project_base(project), chave)


@app.post("/api/projects/{project}/observacoes")
def criar_observacao(project: str, data: dict):
    """O agente registra o que viu, sem concluir nada."""
    try:
        return {"ok": True, "observacao": apr.registrar_observacao(project_base(project), data)}
    except KeyError as e:
        raise HTTPException(404, f"Learning '{e.args[0]}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/hipoteses")
def criar_hipotese(project: str, data: dict):
    """O agente propõe a generalização e a pergunta que a resolveria."""
    try:
        return {"ok": True, "hipotese": apr.propor_hipotese(project_base(project), data)}
    except KeyError as e:
        raise HTTPException(404, f"Learning '{e.args[0]}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/hipoteses/{hid}/responder")
def responder_hipotese(project: str, hid: str, data: dict):
    """Sua resposta. Em confirmar e corrigir, ela já vira aprendizado."""
    if str(data.get("por") or "usuario") != "usuario":
        raise HTTPException(403, "responder é seu: agente propõe, você conclui.")
    try:
        return {"ok": True, **apr.responder(project_base(project), hid, data)}
    except KeyError:
        raise HTTPException(404, f"hipótese '{hid}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/aprendizados")
def criar_aprendizado(project: str, data: dict):
    """Você ensinando direto, sem esperar hipótese de ninguém."""
    if str(data.get("por") or "usuario") != "usuario":
        raise HTTPException(403, "aprendizado é escrita sua — o agente propõe hipótese.")
    try:
        return {"ok": True, "aprendizado": apr.escrever_aprendizado(project_base(project), data)}
    except KeyError as e:
        raise HTTPException(404, f"Learning '{e.args[0]}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/projects/{project}/aprendizados/{aid}")
def aposentar_aprendizado(project: str, aid: str, por: str = "usuario"):
    """Aposenta sem apagar: já valeu, e isso explica decisões antigas."""
    try:
        return {"ok": True, "registro": apr.aposentar_aprendizado(project_base(project), aid, por)}
    except KeyError:
        raise HTTPException(404, f"aprendizado '{aid}' não encontrado")


# ── Teses: o executor propõe, você decide ────────────────────────────────────
# O fluxo: você cria o Learning → ela desce no despacho → o executor faz a
# tarefa e propõe teses sobre ela → volta com as perguntas → você responde →
# ele ajusta ou a tese é validada. Tese confirmada entra no documento.

@app.get("/api/projects/{project}/teses-do-learning")
def ler_teses_skill(project: str, skill: str = ""):
    """As teses propostas, com o estado que os seus vereditos deram a cada uma."""
    return {"teses": tse.estado(project_base(project), skill)}


@app.get("/api/projects/{project}/teses-inbox")
def ler_teses_inbox(project: str):
    """As teses esperando sua resposta — o que voltou dos despachos."""
    return {"teses": tse.inbox(project_base(project))}


@app.post("/api/projects/{project}/teses-do-learning")
def propor_tese(project: str, data: dict):
    """O executor propõe uma tese sobre um Learning que já existe."""
    try:
        return {"ok": True, "tese": tse.propor(project_base(project), data)}
    except KeyError as e:
        raise HTTPException(404, f"Learning '{e.args[0]}' não existe — criar Learning é do dono")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/teses-do-learning/{tid}/responder")
def responder_tese(project: str, tid: str, data: dict):
    """Sua resposta: confirma, refuta ou pede ajuste."""
    try:
        return {"ok": True, **tse.responder(project_base(project), tid, data)}
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError:
        raise HTTPException(404, f"tese '{tid}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/projects/{project}/learnings-orfaos")
def ler_orfas(project: str):
    """Nomes citados em eventos que não existem no repertório.

    Matéria-prima para você decidir: criar como Learning, virar apelido de uma
    que já existe, ou ignorar. Nada disso o agente decide.
    """
    return {"orfas": rep.orfas(project_base(project))}


@app.get("/api/projects/{project}/learnings-tags")
def ler_tags_skills(project: str):
    """O vocabulário de tags do projeto, com quantos Learnings usam cada uma.

    É o que a tela sugere antes de deixar criar uma tag nova: vocabulário que
    nasce do uso não envelhece como lista fixa, mas precisa ser mostrado para
    ninguém inventar sinônimo do que já existe.
    """
    return {"tags": rep.tags_do_projeto(project_base(project))}


@app.put("/api/projects/{project}/learnings-tags/{tag}")
def renomear_tag_skills(project: str, tag: str, data: dict):
    """Renomeia a tag em todos os Learnings. Nome que já existe funde os dois."""
    try:
        n = rep.renomear_tag(project_base(project), tag, str(data.get("para") or ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "habilidades": n}


@app.delete("/api/projects/{project}/learnings-tags/{tag}")
def apagar_tag_skills(project: str, tag: str):
    """Tira a tag de todos os Learnings. Os Learnings ficam."""
    return {"ok": True, "habilidades": rep.apagar_tag(project_base(project), tag)}


@app.get("/api/projects/{project}/learnings/{chave}")
def ler_skill(project: str, chave: str):
    """Um Learning inteira, com os eventos que a construíram."""
    try:
        return rep.detalhe(project_base(project), chave)
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")


@app.put("/api/projects/{project}/learnings/{chave}")
def editar_skill(project: str, chave: str, data: dict):
    """Renomeia, descreve, firma ou arquiva.

    `autor` diz quem está escrevendo: agente ou pessoa. Escrita de agente não
    sobrescreve texto que a pessoa curou — o resto é livre, e deve ser.
    """
    try:
        return {"ok": True, "skill": rep.atualizar(project_base(project), chave, data,
                                                   str(data.get("autor") or "usuario"))}
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/projects/{project}/learnings/{chave}")
def destruir_skill(project: str, chave: str, por: str = "usuario"):
    """Destrói o Learning: entrada, texto e nicknames. Os eventos ficam no log."""
    try:
        rep.destruir(project_base(project), chave, por)
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    return {"ok": True}


@app.post("/api/projects/{project}/learnings/{chave}/promover")
def promover_skill(project: str, chave: str, data: dict | None = None):
    """Sobe o Learning para a base de conhecimento, onde todo projeto a encontra."""
    origem = project_base(project)
    if origem.name == BASE_SLUG:
        raise HTTPException(400, "já está na base")
    try:
        sk = rep.promover(origem, PROJECTS_DIR / BASE_SLUG, chave, origem.name,
                          str((data or {}).get("por") or "usuario"))
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")
    return {"ok": True, "skill": sk}


@app.post("/api/projects/{project}/learnings/{chave}/vincular")
def vincular_skill(project: str, chave: str, data: dict):
    """Declara que um agente deve ter o Learning — sem XP, que não houve."""
    agente = str(data.get("agente") or "").strip()
    if not agente:
        raise HTTPException(400, "informe `agente`")
    try:
        return {"ok": True, "skill": rep.vincular(project_base(project), chave, agente,
                                                  bool(data.get("ligado", True)))}
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado")


# ── NOCTURN ───────────────────────────────────────────────────────────────────
# O supervisor não é escopado por projeto: as rotas dele vivem fora de
# /api/projects de propósito, porque ele atravessa todos.

def _todos_os_projetos() -> list[tuple[str, Path]]:
    if not PROJECTS_DIR.is_dir():
        return []
    return [(d.name, d) for d in sorted(PROJECTS_DIR.iterdir())
            if d.is_dir() and (d / "agents").is_dir()]


@app.get("/api/nocturn/relatorio")
def nocturn_relatorio():
    """O que o NOCTURN tem a dizer agora, varrendo todos os projetos."""
    return noc.relatorio(BASE_DIR, _todos_os_projetos())


@app.get("/api/nocturn/conversa")
def nocturn_conversa(limite: int = 200):
    return {"mensagens": noc.ler_conversa(BASE_DIR, limite)}


@app.post("/api/nocturn/conversa")
def nocturn_falar(data: dict):
    """Uma fala na conversa.

    O dock escreve como `voce`; a sessão que encarnar o NOCTURN escreve como
    `nocturn` por esta mesma rota. Nenhum dos dois precisa saber do outro.
    """
    texto = str(data.get("texto") or "").strip()
    if not texto:
        raise HTTPException(400, "mensagem vazia")
    return noc.dizer(BASE_DIR, texto, str(data.get("autor") or "voce"),
                     str(data.get("projeto") or ""), str(data.get("assunto") or ""))


@app.post("/api/nocturn/descrever")
def nocturn_descrever(data: dict):
    """Atalho do dock: dar descrição a um Learning sem sair da conversa."""
    projeto = str(data.get("projeto") or "").strip()
    chave = str(data.get("chave") or "").strip()
    descricao = str(data.get("descricao") or "").strip()
    if not (projeto and chave and descricao):
        raise HTTPException(400, "informe projeto, chave e descricao")
    try:
        skill = rep.atualizar(project_base(projeto), chave, {"descricao": descricao})
    except KeyError:
        raise HTTPException(404, f"Learning '{chave}' não encontrado em {projeto}")
    noc.dizer(BASE_DIR, f'"{skill["rotulo"]}" agora tem descrição.', "nocturn", projeto, chave)
    return {"ok": True, "skill": skill}


# ── Controle ──────────────────────────────────────────────────────────────────
# A visão de cima: todo projeto, com o que ele tem, o quanto trabalhou, o quanto
# aprendeu e o quanto esse aprendizado está sendo lido. É daqui que se governa.

def _ultima(eventos: list[dict]) -> str:
    return max((e.get("quando") or "" for e in eventos), default="")


@app.get("/api/controle")
def controle():
    projetos = []
    for base in sorted(PROJECTS_DIR.iterdir(), key=lambda b: (b.name != BASE_SLUG, b.name)):
        if not base.is_dir() or base.name.startswith("."):
            continue
        agentes = sorted((base / "agents").glob("*.yaml")) if (base / "agents").is_dir() else []
        # O protocolo é montado na leitura, então todo agente tem o dele, e
        # sempre atual. Contar o bloco no arquivo diria 0 desde que os arquivos
        # deixaram de guardá-lo — um alarme falso no lugar de uma informação.
        com_protocolo = len(agentes)
        log = prog.ler_log(base)
        r = rep.carregar(base)
        projetos.append({
            "slug": base.name,
            "nome": _project_display_name(base),
            "permanente": base.name == BASE_SLUG,
            "repositorio": _e_repositorio(base),
            "agentes": len(agentes),
            "protocolo": com_protocolo,
            "memorias": len(list((base / "memory").glob("*.md"))) if (base / "memory").is_dir() else 0,
            "fluxos": len(list((base / "flows").glob("*.yaml"))) if (base / "flows").is_dir() else 0,
            "skills": len([1 for d in r.values() if d.get("estado") != "arquivada"]),
            "firmadas": len([1 for d in r.values() if d.get("estado") == "firmada"]),
            "semDescricao": len([1 for d in r.values()
                                 if d.get("estado") != "arquivada" and not (d.get("descricao") or "").strip()]),
            "eventos": sum(1 for e in log if e.get("registro") == "evento"),
            "consultas": sum(1 for e in log if e.get("registro") == "consulta"),
            "ultima": _ultima(log),
        })
    lix = LIXEIRA.is_dir() and sum(1 for d in LIXEIRA.iterdir() if d.is_dir()) or 0
    return {"projetos": projetos, "base": BASE_SLUG, "naLixeira": lix}


# ── Regras ────────────────────────────────────────────────────────────────────
# Tudo que o Noctis exige, num lugar só, com o valor que está valendo agora.

@app.get("/api/regras")
def listar_regras(projeto: str = "", hub: str = ""):
    """As regras como valem AQUI.

    Sem escopo, o global — que é o que o painel sempre mostrou. Com `projeto`
    ou `hub`, o valor já resolvido pela cascata, mais de onde ele vem.
    """
    return regras.listar(_escopo(projeto, hub))


@app.put("/api/regras/{rid}")
def definir_regra(rid: str, data: dict, projeto: str = "", hub: str = ""):
    try:
        r = regras.definir(rid, data.get("valor"), str(data.get("por") or "usuario"),
                           esc=_escopo(projeto, hub))
    except KeyError:
        raise HTTPException(404, f"regra '{rid}' não existe")
    except PermissionError as e:
        # Duas recusas diferentes: proteção fixa, ou regra que não se escopa.
        if str(e) and "escopada" in str(e):
            raise HTTPException(403, f"{rid} vale para o sistema inteiro e não se ajusta por hub ou projeto")
        raise HTTPException(403, "esta regra é uma proteção fixa e não se edita")
    except (TypeError, ValueError, IndexError) as e:
        raise HTTPException(400, f"valor inválido: {e}")
    # Mudar uma regra do protocolo não reescreve agente nenhum: o bloco é
    # montado na leitura, então a regra nova já vale no pedido seguinte. Antes
    # isto percorria os 56 arquivos a cada clique — e ainda assim deixava para
    # trás os que o instalador não sabia editar.
    return {"ok": True, "regra": r, "protocoloAtualizadoEm": {}}


@app.delete("/api/regras/{rid}")
def restaurar_regra(rid: str, projeto: str = "", hub: str = ""):
    try:
        r = regras.restaurar(rid, esc=_escopo(projeto, hub))
    except KeyError:
        raise HTTPException(404, f"regra '{rid}' não existe")
    return {"ok": True, "regra": r, "protocoloAtualizadoEm": {}}


@app.get("/api/regras-historico")
def ler_historico_regras(regra: str = "", limite: int = 80):
    """O rastro das mudanças de regra: o que mudou, quando, de quanto para quanto.

    Append-only, como o histórico de trabalho. É o que responde "isto está
    estranho desde quando?".
    """
    return {"mudancas": regras.historico(regra)[:max(1, min(limite, 500))]}


@app.get("/api/regras/protocolo")
def ver_protocolo(projeto: str = "seu_projeto", agente: str = "seu_agente"):
    """O texto exato que os agentes recebem hoje, montado a partir das regras."""
    import sys as _sys
    pasta = str(BASE_DIR / "tools" / "xp")
    if pasta not in _sys.path:
        _sys.path.insert(0, pasta)
    import instalar_protocolo as _ip
    return {"texto": _ip.bloco_para(projeto, agente).strip()}
