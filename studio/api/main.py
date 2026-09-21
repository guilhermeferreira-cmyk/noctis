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
from datetime import datetime, timezone
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
import repertorio as rep
import aprendizado as apr
import enquadramento as enq
import organizacao as org
import nocturn as noc
import regras

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
TEMPLATES_DIR = Path(__file__).parent.parent.parent / "_templates"
RESOURCE_DIRS = ("agents", "flows", "memory", "personas", "outputs")

PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# A base de conhecimento do Noctis: um projeto permanente, que não se apaga nem
# se renomeia, e cujas habilidades todo agente de todo projeto encontra ao
# consultar. É para onde sobe o que foi aprendido num projeto e vale para os
# outros — e é o que faz o conhecimento parar de morrer com o projeto que o gerou.
BASE_SLUG = "noctis"
BASE_NOME = "Noctis — base de conhecimento"
# Projetos excluídos vão para cá, não para o nada.
LIXEIRA = PROJECTS_DIR / ".lixeira"


def _e_repositorio(base: Path) -> bool:
    """Pasta que é repositório de código, e não projeto do Noctis.

    `projects/` também guarda clones de repositórios de código do trabalho.
    Eles têm `.git` e não têm `project.yaml`. O Noctis os lista, mas não pode
    movê-los nem apagá-los: um clique na lixeira arrancaria o repositório do lugar
    onde o resto do trabalho espera encontrá-lo.
    """
    return (base / ".git").exists() and not (base / "project.yaml").exists()


def _garantir_base() -> None:
    base = PROJECTS_DIR / BASE_SLUG
    for pasta in ("agents", "flows", "memory", "personas", "outputs"):
        (base / pasta).mkdir(parents=True, exist_ok=True)
    meta = base / "project.yaml"
    if not meta.exists():
        meta.write_text(f"name: {BASE_NOME}\nslug: {BASE_SLUG}\npermanente: true\n", encoding="utf-8")


_garantir_base()
regras.configurar(BASE_DIR)

if EFEMERO and not any(PROJECTS_DIR.iterdir()):
    # Instância nova e vazia: nasce um projeto para a pessoa ter por onde
    # começar, senão a primeira tela é um beco sem saída.
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
            '## O que não funciona aqui',
            '',
            'A exportação em PDF: ela imprime pelo Chrome instalado na máquina, e não',
            'existe navegador dentro de uma função serverless.',
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

@app.get("/api/projects")
def list_projects():
    result = []
    # A base vem primeiro: é o chão de todos os outros.
    pastas = sorted(PROJECTS_DIR.iterdir(), key=lambda b: (b.name != BASE_SLUG, b.name))
    for base in pastas:
        # Pastas com ponto são do sistema (a lixeira mora numa delas).
        if not base.is_dir() or base.name.startswith("."):
            continue
        result.append({
            "slug":        base.name,
            "displayName": _project_display_name(base),
            "permanente":  base.name == BASE_SLUG,
            "repositorio": _e_repositorio(base),
            "counts": {
                "agents":   len(list((base / "agents").glob("*.yaml")))   if (base / "agents").is_dir()   else 0,
                "flows":    len(list((base / "flows").glob("*.yaml")))    if (base / "flows").is_dir()    else 0,
                "memory":   len(list((base / "memory").glob("*.md")))     if (base / "memory").is_dir()   else 0,
                "personas": len(list((base / "personas").glob("*.yaml"))) if (base / "personas").is_dir() else 0,
            },
        })
    return result


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

    save_yaml(_project_meta_path(dest), {"name": raw_name, "slug": slug})
    return {"ok": True, "slug": slug, "displayName": raw_name}


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
    except KeyError:
        raise HTTPException(404, f"squad '{chave}' não encontrada")


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
        cfg = load_yaml(f)
        result.append({
            "name":        f.stem,
            "displayName": cfg.get("name", f.stem),
            "description": (cfg.get("description") or "").strip()[:80],
        })
    return result


@app.get("/api/projects/{project}/agents/{name}")
def get_agent(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    if not path.exists():
        raise HTTPException(404, f"Agente '{name}' não encontrado")
    return load_yaml(path)


def _garantir_protocolo(caminho: Path, projeto: str) -> None:
    """Todo agente salvo pelo Noctis sai com o protocolo de aprendizado.

    É o que torna o sistema agnóstico de verdade: não depende de alguém lembrar
    de rodar o instalador, nem de o projeto ter um orquestrador. Agente novo,
    agente editado na tela, agente de projeto recém-criado — todos saem iguais.
    Idempotente: se o bloco já está lá, é atualizado, não duplicado.
    """
    if not regras.valor("protocolo.auto_instalar"):
        return
    try:
        import sys as _sys
        pasta = str(BASE_DIR / "tools" / "xp")
        if pasta not in _sys.path:
            _sys.path.insert(0, pasta)
        import instalar_protocolo as _ip
        _ip.aplicar(caminho, projeto, False)
    except Exception:
        # Instalação do protocolo nunca pode impedir o agente de ser salvo.
        pass


@app.put("/api/projects/{project}/agents/{name}")
def save_agent(project: str, name: str, data: dict):
    caminho = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    save_yaml(caminho, data)
    _garantir_protocolo(caminho, project_base(project).name)
    return {"ok": True}


@app.delete("/api/projects/{project}/agents/{name}")
def delete_agent(project: str, name: str):
    path = caminho_de_recurso(project_base(project), "agents", name, ".yaml")
    if not path.exists():
        raise HTTPException(404)
    path.unlink()
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

KIND_DEFAULT_ICON = {
    "memory":  "GiBrain",
    "agent":   "GiRobotGolem",
    "flow":    "GiDirectionSigns",
    "persona": "GiPublicSpeaker",
}
# Aparência dos quatro tipos de recurso. São os PADRÕES: o que valer de fato sai
# de `_vocabulario()`, que mescla estes com o que a pessoa escolheu em
# config/aparencia.json. Recurso que já tem cor/ícone próprios não é afetado —
# isto governa o padrão de quem nasce e a identidade da seção na interface.
KIND_META_PADRAO = {
    "memory":  {"label": "Memória", "ext": ".md",   "color": "#3b82f6", "icon": "GiBrain"},
    "agent":   {"label": "Agente",  "ext": ".yaml", "color": "#10b981", "icon": "GiRobotGolem"},
    "flow":    {"label": "Fluxo",   "ext": ".yaml", "color": "#f59e0b", "icon": "GiDirectionSigns"},
    "persona": {"label": "Persona", "ext": ".yaml", "color": "#ec4899", "icon": "GiPublicSpeaker"},
}
KIND_META_COLOR = {k: v["color"] for k, v in KIND_META_PADRAO.items()}
KIND_POR_PASTA = {"memory": "memory", "agents": "agent",
                  "flows": "flow", "personas": "persona"}
KIND_DIRS = {"memory": ("memory", "*.md"), "agent": ("agents", "*.yaml"),
             "flow": ("flows", "*.yaml"), "persona": ("personas", "*.yaml")}


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
TAMANHOS_PADRAO = {"card": 30, "menu": 15, "nav": 19, "disco": 32}
TAMANHO_LIMITES = {"card": (14, 64), "menu": (10, 26), "nav": (12, 32),
                   "disco": (22, 64)}


# A aura: o borrão de cor atrás dos cards do mapa e do cosmos.
#   difusao — o raio do blur, em px: quanto a cor se espalha
#   tamanho — o quanto a aura extravasa a borda do card, em px
AURA_PADRAO = {"difusao": 26, "tamanho": 24}
# Ligar/desligar mora junto do ajuste: quem regula é quem apaga.
LIGADO_PADRAO = {"aura": True, "vidro": True, "ceu": True}
AURA_LIMITES = {"difusao": (0, 80), "tamanho": (0, 90)}


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
    return {"kinds": kinds, "types": tipos, "origins": MEMORY_ORIGINS,
            "iconSizes": _tamanhos(ap), "iconSizeLimits": TAMANHO_LIMITES,
            "aura": _aura(ap), "auraLimits": AURA_LIMITES,
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
    tam = _tamanhos({"iconSizes": data.get("iconSizes") or {}})
    if tam != TAMANHOS_PADRAO:
        ap["iconSizes"] = tam
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
            cfg  = load_yaml(f)
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

    def items(kind: str):
        folder, pattern = KIND_DIRS[kind]
        d = base / folder
        if not d.is_dir():
            return []
        out = []
        for f in sorted(d.glob(pattern)):
            name = f.stem
            summary = _node_summary(base, kind, name, usage)
            out.append({
                "name": name,
                "displayName": summary.get("title") or name,
                "kind": kind,
                **summary,
                **_identity_of(base, kind, name, idx),
            })
        return out

    return {k: items(k) for k in ("memory", "agent", "flow", "persona")}


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


# ── Progresso dos agentes: XP, níveis e habilidades ───────────────────────────

@app.get("/api/projects/{project}/progresso")
def ler_progresso(project: str):
    """A ficha de todos os agentes do projeto, recalculada do log."""
    base = project_base(project)
    r = rep.sincronizar(base)
    estado = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))
    estado["curvas"] = {"agente": regras.valor("xp.curva_agente"), "skill": regras.valor("xp.curva_skill")}
    estado["tipos"] = regras.valor("xp.base_por_tipo")
    return estado


@app.get("/api/projects/{project}/progresso/{agente}")
def ler_progresso_agente(project: str, agente: str):
    base = project_base(project)
    r = rep.carregar(base)
    fichas = prog.estado_do_projeto(base, rep.indice(r), rep.firmadas(r))["agentes"]
    if agente not in fichas:
        # Agente sem evento ainda existe: devolve a ficha zerada em vez de 404,
        # senão a UI teria de tratar dois mundos.
        n, ini, fim, frac = prog.nivel_de(0, tuple(regras.valor("xp.curva_agente")))
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
    # Escrita de habilidades pausada nas Regras: o trabalho é registrado e rende
    # XP, mas os nomes de habilidade são descartados antes de entrar no log.
    if not regras.valor("protocolo.declarar_habilidades"):
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

    # Descrição escrita por quem criou a habilidade, no mesmo comando. Só entra
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

    # Só sobe quem já existia: habilidade nova nasce no nível 1, e chamar isso de
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
    """O que um agente aprendeu ao subir de nível numa habilidade."""
    base = project_base(project)
    agente = str(data.get("agente") or "").strip()
    hab = str(data.get("habilidade") or "").strip()
    texto = str(data.get("texto") or "").strip()
    if not (agente and hab and texto):
        raise HTTPException(400, "informe agente, habilidade e texto")
    autor_de_agente = True
    if autor_de_agente and not regras.valor("protocolo.declarar_habilidades"):
        raise HTTPException(403, "A escrita de habilidades por agentes está pausada nas Regras do Noctis.")
    r = rep.carregar(base)
    chave = rep.indice(r).get(prog.slug(hab)) or prog.slug(hab)
    m = prog.registrar_marco(base, agente, chave, texto, int(data.get("nivel") or 0))
    # Habilidade sem descrição herda o primeiro marco: um aprendizado escrito
    # explica melhor do que um campo vazio, e a curadoria pode melhorá-lo depois.
    if chave in r and not (r[chave].get("descricao") or "").strip():
        rep.atualizar(base, chave, {"descricao": texto}, agente)
    return {"ok": True, "marco": m}


@app.post("/api/projects/{project}/habilidades/fundir")
def fundir_habilidades(project: str, data: dict):
    """Funde habilidades que são a mesma coisa com nomes diferentes.

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


@app.put("/api/projects/{project}/skills/{chave}/corpo")
def escrever_corpo_skill(project: str, chave: str, data: dict):
    """Reescreve o corpo inteiro com o markdown que você escreveu — curadoria.

    A partir daqui o corpo é SEU: as respostas das perguntas continuam sendo
    guardadas, mas param de remontar o documento. Sem isso, responder uma
    pergunta apagaria o markdown que você acabou de colar — e foi para isso
    que a marca de curadoria existe no resto do sistema.
    """
    base = project_base(project)
    if chave not in rep.carregar(base):
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    corpo = str(data.get("corpo") or "")
    rep.atualizar(base, chave, {"corpo_curado": bool(corpo.strip())})
    return {"ok": True, "corpo": rep.escrever_corpo(base, chave, corpo)}


@app.post("/api/projects/{project}/skills/{chave}/corpo")
def anexar_corpo_skill(project: str, chave: str, data: dict):
    """Acrescenta um trecho assinado ao corpo. É assim que o agente contribui."""
    base = project_base(project)
    if chave not in rep.carregar(base):
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    texto = str(data.get("texto") or "").strip()
    if not texto:
        raise HTTPException(400, "texto vazio")
    autor = str(data.get("autor") or "usuario").strip()
    autor_de_agente = autor != "usuario"
    if autor_de_agente and not regras.valor("protocolo.declarar_habilidades"):
        raise HTTPException(403, "A escrita de habilidades por agentes está pausada nas Regras do Noctis.")

    return {"ok": True, "corpo": rep.anexar_ao_corpo(base, chave, texto, autor)}


@app.get("/api/projects/{project}/skills-consulta")
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
    # Junto com as habilidades vai o que já foi VALIDADO nos domínios achados —
    # curto e com id, para o agente citar no fim o que aplicou. Contexto que
    # viaja inteiro a cada despacho é o desperdício que o Noctis evita.
    chaves = [x.get("chave") for x in achados if x.get("chave")]
    return {"consulta": q, "modo": modo, "achados": achados,
            "aprendizados": apr.para_o_protocolo(base, chaves) if chaves else []}


@app.get("/api/projects/{project}/aptidao")
def ler_aptidao(project: str, habilidades: str = ""):
    """Quem está mais apto para um despacho, dadas as habilidades desejadas."""
    base = project_base(project)
    desejadas = [h.strip() for h in habilidades.split(",") if h.strip()]
    if not desejadas:
        raise HTTPException(400, "informe ?habilidades=a,b,c")
    return {"desejadas": desejadas, "ranking": prog.aptidao(base, desejadas)}


# ── Repertório de habilidades ─────────────────────────────────────────────────

@app.get("/api/projects/{project}/skills")
def ler_skills(project: str):
    """O repertório do projeto, com quem tem cada habilidade e em que nível."""
    return rep.visao(project_base(project))


@app.post("/api/projects/{project}/skills")
def criar_skill(project: str, data: dict):
    """Cria uma habilidade sem evento — o aprendizado que já existe em documento."""
    base = project_base(project)
    rotulo = str(data.get("rotulo") or "").strip()
    if not rotulo:
        raise HTTPException(400, "informe `rotulo`")
    autor_de_agente = str(data.get("autor") or "usuario") != "usuario"
    if autor_de_agente and not regras.valor("protocolo.declarar_habilidades"):
        raise HTTPException(403, "A escrita de habilidades por agentes está pausada nas Regras do Noctis.")

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


# ── O loop de aprendizado ────────────────────────────────────────────────────
# observação → hipótese → pergunta → sua resposta → aprendizado. O agente
# escreve só os dois primeiros; o aprendizado nasce da resposta da pessoa.

@app.get("/api/projects/{project}/teses")
def ler_teses(project: str):
    """Cada pergunta com quantas habilidades marcaram cada tese.

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
    """As perguntas que descobrem o que cada habilidade é, e quantas faltam."""
    return enq.estado(project_base(project))


@app.get("/api/projects/{project}/skills/{chave}/enquadramento-md")
def ler_enquadramento_md(project: str, chave: str):
    """O markdown que as suas respostas renderiam — para inserir num corpo seu."""
    d = rep.carregar(project_base(project)).get(chave)
    if not d:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    return {"markdown": enq.corpo_de(d)}


@app.post("/api/projects/{project}/skills/{chave}/enquadrar")
def enquadrar_skill(project: str, chave: str, data: dict):
    """Sua resposta a uma pergunta de enquadramento — ela preenche a habilidade."""
    try:
        return {"ok": True, "skill": enq.responder(
            project_base(project), str(chave), str(data.get("campo") or ""),
            data.get("escolhas", data.get("valor") or []),
            str(data.get("por") or "usuario"))}
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
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
        raise HTTPException(404, f"habilidade '{e.args[0]}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/projects/{project}/hipoteses")
def criar_hipotese(project: str, data: dict):
    """O agente propõe a generalização e a pergunta que a resolveria."""
    try:
        return {"ok": True, "hipotese": apr.propor_hipotese(project_base(project), data)}
    except KeyError as e:
        raise HTTPException(404, f"habilidade '{e.args[0]}' não encontrada")
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
        raise HTTPException(404, f"habilidade '{e.args[0]}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/projects/{project}/aprendizados/{aid}")
def aposentar_aprendizado(project: str, aid: str, por: str = "usuario"):
    """Aposenta sem apagar: já valeu, e isso explica decisões antigas."""
    try:
        return {"ok": True, "registro": apr.aposentar_aprendizado(project_base(project), aid, por)}
    except KeyError:
        raise HTTPException(404, f"aprendizado '{aid}' não encontrado")


@app.get("/api/projects/{project}/skills-tags")
def ler_tags_skills(project: str):
    """O vocabulário de tags do projeto, com quantas habilidades usam cada uma.

    É o que a tela sugere antes de deixar criar uma tag nova: vocabulário que
    nasce do uso não envelhece como lista fixa, mas precisa ser mostrado para
    ninguém inventar sinônimo do que já existe.
    """
    return {"tags": rep.tags_do_projeto(project_base(project))}


@app.put("/api/projects/{project}/skills-tags/{tag}")
def renomear_tag_skills(project: str, tag: str, data: dict):
    """Renomeia a tag em todas as habilidades. Nome que já existe funde as duas."""
    try:
        n = rep.renomear_tag(project_base(project), tag, str(data.get("para") or ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "habilidades": n}


@app.delete("/api/projects/{project}/skills-tags/{tag}")
def apagar_tag_skills(project: str, tag: str):
    """Tira a tag de todas as habilidades. As habilidades ficam."""
    return {"ok": True, "habilidades": rep.apagar_tag(project_base(project), tag)}


@app.get("/api/projects/{project}/skills/{chave}")
def ler_skill(project: str, chave: str):
    """Uma habilidade inteira, com os eventos que a construíram."""
    try:
        return rep.detalhe(project_base(project), chave)
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")


@app.put("/api/projects/{project}/skills/{chave}")
def editar_skill(project: str, chave: str, data: dict):
    """Renomeia, descreve, firma ou arquiva.

    `autor` diz quem está escrevendo: agente ou pessoa. Escrita de agente não
    sobrescreve texto que a pessoa curou — o resto é livre, e deve ser.
    """
    try:
        return {"ok": True, "skill": rep.atualizar(project_base(project), chave, data,
                                                   str(data.get("autor") or "usuario"))}
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/projects/{project}/skills/{chave}")
def destruir_skill(project: str, chave: str, por: str = "usuario"):
    """Destrói a habilidade: entrada, texto e apelidos. Os eventos ficam no log."""
    try:
        rep.destruir(project_base(project), chave, por)
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    return {"ok": True}


@app.post("/api/projects/{project}/skills/{chave}/promover")
def promover_skill(project: str, chave: str, data: dict | None = None):
    """Sobe a habilidade para a base de conhecimento, onde todo projeto a encontra."""
    origem = project_base(project)
    if origem.name == BASE_SLUG:
        raise HTTPException(400, "já está na base")
    try:
        sk = rep.promover(origem, PROJECTS_DIR / BASE_SLUG, chave, origem.name,
                          str((data or {}).get("por") or "usuario"))
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")
    return {"ok": True, "skill": sk}


@app.post("/api/projects/{project}/skills/{chave}/vincular")
def vincular_skill(project: str, chave: str, data: dict):
    """Declara que um agente deve ter a habilidade — sem XP, que não houve."""
    agente = str(data.get("agente") or "").strip()
    if not agente:
        raise HTTPException(400, "informe `agente`")
    try:
        return {"ok": True, "skill": rep.vincular(project_base(project), chave, agente,
                                                  bool(data.get("ligado", True)))}
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada")


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
    """Atalho do dock: dar descrição a uma habilidade sem sair da conversa."""
    projeto = str(data.get("projeto") or "").strip()
    chave = str(data.get("chave") or "").strip()
    descricao = str(data.get("descricao") or "").strip()
    if not (projeto and chave and descricao):
        raise HTTPException(400, "informe projeto, chave e descricao")
    try:
        skill = rep.atualizar(project_base(projeto), chave, {"descricao": descricao})
    except KeyError:
        raise HTTPException(404, f"habilidade '{chave}' não encontrada em {projeto}")
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
        com_protocolo = sum(1 for f in agentes if "[noctis-xp]" in f.read_text(encoding="utf-8"))
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


@app.post("/api/projects/{project}/protocolo")
def instalar_protocolo_rota(project: str, data: dict | None = None):
    """Instala (ou remove) o protocolo de aprendizado em todos os agentes do projeto."""
    base = project_base(project)
    remover = bool((data or {}).get("remover"))
    import sys as _sys
    pasta = str(BASE_DIR / "tools" / "xp")
    if pasta not in _sys.path:
        _sys.path.insert(0, pasta)
    import instalar_protocolo as _ip
    resultado = {}
    for f in sorted((base / "agents").glob("*.yaml")):
        resultado[f.stem] = _ip.aplicar(f, base.name, remover)
    return {"ok": True, "agentes": resultado}


# ── Regras ────────────────────────────────────────────────────────────────────
# Tudo que o Noctis exige, num lugar só, com o valor que está valendo agora.

def _reinstalar_protocolo_em_todos() -> dict:
    """Mudou uma regra do protocolo: todo agente precisa receber o texto novo.

    Senão o painel diria uma coisa e o prompt dos agentes, outra — exatamente o
    desencontro que o registro de regras existe para impedir.
    """
    import sys as _sys
    pasta = str(BASE_DIR / "tools" / "xp")
    if pasta not in _sys.path:
        _sys.path.insert(0, pasta)
    import instalar_protocolo as _ip
    feitos = {}
    for base in sorted(PROJECTS_DIR.iterdir()):
        if not base.is_dir() or base.name.startswith(".") or not (base / "agents").is_dir():
            continue
        n = 0
        for f in sorted((base / "agents").glob("*.yaml")):
            if "[noctis-xp]" in f.read_text(encoding="utf-8"):
                _ip.aplicar(f, base.name, False)
                n += 1
        if n:
            feitos[base.name] = n
    return feitos


@app.get("/api/regras")
def listar_regras():
    return regras.listar()


@app.put("/api/regras/{rid}")
def definir_regra(rid: str, data: dict):
    try:
        r = regras.definir(rid, data.get("valor"))
    except KeyError:
        raise HTTPException(404, f"regra '{rid}' não existe")
    except PermissionError:
        raise HTTPException(403, "esta regra é uma proteção fixa e não se edita")
    except (TypeError, ValueError, IndexError) as e:
        raise HTTPException(400, f"valor inválido: {e}")
    reinstalados = _reinstalar_protocolo_em_todos() if rid.startswith(("protocolo.", "habilidades.skills_nativas")) \
        or rid == "xp.base_por_tipo" else {}
    return {"ok": True, "regra": r, "protocoloAtualizadoEm": reinstalados}


@app.delete("/api/regras/{rid}")
def restaurar_regra(rid: str):
    try:
        r = regras.restaurar(rid)
    except KeyError:
        raise HTTPException(404, f"regra '{rid}' não existe")
    reinstalados = _reinstalar_protocolo_em_todos() if rid.startswith("protocolo.") else {}
    return {"ok": True, "regra": r, "protocoloAtualizadoEm": reinstalados}


@app.get("/api/regras/protocolo")
def ver_protocolo(projeto: str = "seu_projeto", agente: str = "seu_agente"):
    """O texto exato que os agentes recebem hoje, montado a partir das regras."""
    import sys as _sys
    pasta = str(BASE_DIR / "tools" / "xp")
    if pasta not in _sys.path:
        _sys.path.insert(0, pasta)
    import instalar_protocolo as _ip
    return {"texto": _ip.bloco_para(projeto, agente).strip()}
