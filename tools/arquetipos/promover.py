#!/usr/bin/env python
"""Promove um agente duplicado a arquétipo, e reduz as cópias a acoplamentos.

    python tools/arquetipos/promover.py --seco            # o que faria
    python tools/arquetipos/promover.py pen_dev           # um agente
    python tools/arquetipos/promover.py --todos           # os que passarem no corte
    python tools/arquetipos/promover.py --desfazer pen_dev

Por que existe um corte de semelhança: de 56 agentes, 18 têm o mesmo nome em
mais de um projeto, mas 3 desses são agentes DIFERENTES que só dividem o nome
(`qa` entre Sciensa e Tessera bate 17,8%). Fundir por nome comeria um deles em
silêncio. Então só é promovido o que for quase igual, e o resto exige decisão.

A comparação ignora o bloco `[noctis-xp]`: ele cita o slug do projeto e por isso
SEMPRE difere entre cópias — era a única diferença real entre as duas de
`pen_dev`. O arquétipo guarda o prompt sem o bloco; quem o gera é a leitura.
"""
from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

import yaml

RAIZ = Path(__file__).parent.parent.parent
PROJETOS = RAIZ / "projects"
WARDEN = PROJETOS / "noctis"

sys.path.insert(0, str(RAIZ / "studio" / "api"))
import arquetipos as arqs  # noqa: E402

# Identidade TOTAL, não semelhança. Os 15 "quase iguais" ficavam em 99,3–99,6%,
# e medir o que sobrava mostrou que o resto era o nome do projeto dentro do
# prompt — "Marketing da Sciensa" contra "Marketing da Tessera". Com um corte de
# 99% a promoção escolheria um dos dois e calaria o outro. Então o corte é 1.0:
# o que não for idêntico depois de tirar o protocolo exige decisão humana.
CORTE = 1.0


def _ler(p: Path) -> dict:
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}


def copias(nome: str) -> dict[str, Path]:
    """Onde este agente existe hoje."""
    fora = {}
    for d in sorted(PROJETOS.iterdir()):
        f = d / "agents" / f"{nome}.yaml"
        if f.exists():
            fora[d.name] = f
    return fora


def termos_do_projeto(slug: str) -> list[str]:
    """Como este projeto se chama dentro de um prompt, do mais longo ao mais
    curto — "Tessera Web site" precisa sair antes de "Tessera", senão sobra
    " Web site" pendurado."""
    termos = {slug}
    nome = str(_ler(PROJETOS / slug / "project.yaml").get("name") or "").strip()
    if nome:
        termos.add(nome)
        termos.add(nome.split()[0])
    return sorted((t for t in termos if len(t) > 3), key=len, reverse=True)


def generalizar(texto: str, slug: str) -> str:
    """Tira a referência ao projeto SEM tirar o sentido da frase.

    "especialista da squad Growth na frente de Marketing da Sciensa" vira
    "...na frente de Marketing". Nada se perde: de qual projeto é a frente é
    coisa que o acoplamento já responde por existir — o agente mora dentro do
    projeto. Dizer isso no prompt era redundância, não informação.

    Fatos que continuarem específicos depois disto (o nome de um mapa, por
    exemplo) NÃO são generalizáveis e têm de ir para o acoplamento. Esta função
    não tenta adivinhá-los: ela deixa a citação no texto, e a trava de promoção
    barra o agente para decisão humana.
    """
    for t in termos_do_projeto(slug):
        texto = re.sub(r" d[aeo] " + re.escape(t) + r"\b", "", texto)
    return texto


def prompt_generalizado(p: Path) -> str:
    """O prompt de uma cópia, sem protocolo e sem o nome do projeto."""
    cru = arqs.sem_protocolo(str(_ler(p).get("system_prompt") or ""))
    return generalizar(cru, p.parent.parent.name)


def semelhanca(caminhos: list[Path]) -> float:
    """O menor par entre todas as cópias — o elo mais fraco é que decide."""
    prompts = [prompt_generalizado(p) for p in caminhos]
    pior = 1.0
    for i in range(len(prompts)):
        for j in range(i + 1, len(prompts)):
            pior = min(pior, difflib.SequenceMatcher(None, prompts[i], prompts[j]).ratio())
    return pior


def _nomes_de_projeto() -> dict[str, set[str]]:
    """Slug e nome de exibição de cada projeto — os dois vazam para prompts."""
    fora = {}
    for d in sorted(PROJETOS.iterdir()):
        if not d.is_dir():
            continue
        termos = {d.name}
        meta = _ler(d / "project.yaml")
        nome = str(meta.get("name") or "").strip()
        if nome:
            # "Tessera Web site" vaza como "Tessera"; o primeiro termo basta.
            termos.add(nome.split()[0])
        fora[d.name] = {t.lower() for t in termos if len(t) > 3}
    return fora


def _cita_projeto(texto: str, projetos: set[str]) -> set[str]:
    """Quais projetos este texto nomeia. Um arquétipo não pode nomear nenhum."""
    mapa = _nomes_de_projeto()
    baixo = (texto or "").lower()
    achados = set()
    for slug in projetos:
        for termo in mapa.get(slug, {slug}):
            if termo in baixo:
                achados.add(termo)
    return achados


def candidatos() -> list[tuple[str, dict[str, Path], float]]:
    nomes: dict[str, list[str]] = {}
    for d in sorted(PROJETOS.iterdir()):
        if not (d / "agents").is_dir():
            continue
        for f in (d / "agents").glob("*.yaml"):
            nomes.setdefault(f.stem, []).append(d.name)
    fora = []
    for nome, projs in sorted(nomes.items()):
        if len(projs) < 2:
            continue
        cop = copias(nome)
        fora.append((nome, cop, semelhanca(list(cop.values()))))
    return fora


def promover(nome: str, seco: bool = False) -> bool:
    cop = copias(nome)
    if len(cop) < 2:
        print(f"  {nome}: só existe em {len(cop)} projeto — nada a promover")
        return False

    # Já promovido é caso de PARAR, não de refazer. Um acoplamento não tem
    # `system_prompt` — ele vive no arquétipo —, então promover de novo geraria
    # um arquétipo com prompt vazio e apagaria o original em silêncio.
    ja = [p for p, f in cop.items() if _ler(f).get("arquetipo")]
    if ja:
        print(f"  {nome}: já acoplado em {', '.join(ja)} — nada a fazer "
              f"(use --desfazer para reverter).")
        return False
    s = semelhanca(list(cop.values()))
    if s < CORTE:
        print(f"  {nome}: semelhança {s*100:.1f}% < {CORTE*100:.0f}% — são agentes "
              f"diferentes de mesmo nome. NÃO promovido.")
        return False

    # O prompt do arquétipo é o GENERALIZADO: sem protocolo e sem o nome do
    # projeto. As cópias já foram conferidas como idênticas nessa forma, então
    # tanto faz de qual delas ele sai.
    fonte = max(cop.values(), key=lambda p: len(str(_ler(p).get("system_prompt") or "")))
    cfg = _ler(fonte)
    arq, _ = arqs.partir(cfg)
    # TODO campo de texto é generalizado, não só o prompt. `description` foi
    # esquecido na primeira versão e passou "site da Tessera" para dentro de um
    # arquétipo — a barreira olhava só o prompt e deixou passar.
    slug_fonte = fonte.parent.parent.name
    for campo in ("system_prompt", "description", "name"):
        if campo == "system_prompt":
            arq[campo] = prompt_generalizado(fonte).rstrip() + "\n"
        elif arq.get(campo):
            arq[campo] = generalizar(str(arq[campo]), slug_fonte)

    # Duas perguntas diferentes, e confundi-las uma vez já quase custou caro:
    #
    #  1. As cópias DIVERGEM no nome do projeto? Aí promover corrompe: o
    #     arquétipo levaria "Marketing da Sciensa" e o agente do Tessera
    #     passaria a cuidar do marketing do outro projeto. Isso é barrado.
    #  2. As cópias CONCORDAM e as duas citam um projeto? É contaminação que já
    #     existe no dado. Promover não piora nada — o arquétipo fica idêntico
    #     ao que os dois já diziam. Isso é avisado e anotado como dívida.
    #
    # A checagem da 1 é a própria semelhança: `CORTE` é identidade total, e a
    # única coisa que separava as cópias era justamente o nome do projeto.
    # Regra nº 1 do plano, agora como barreira: arquétipo não nomeia projeto.
    # O que sobreviveu à generalização é fato específico de verdade — o nome de
    # um mapa, um caminho, um cliente — e fato específico é do ACOPLAMENTO.
    # Deixar passar seria mandar o agente de um projeto trabalhar com a
    # referência do outro, que é a contaminação que isto existe para matar.
    sujo = _cita_projeto(" ".join(str(v) for v in arq.values()), set(cop))
    if sujo:
        print(f"  {nome}: depois de generalizar, o prompt ainda nomeia "
              f"{', '.join(sorted(sujo))}.")
        print(f"       Isso é fato do projeto e tem de virar `prompt_local` no "
              f"acoplamento. NÃO promovido.")
        return False

    print(f"  {nome}: semelhança {s*100:.1f}% · fonte {fonte.parent.parent.name} · "
          f"{len(cop)} acoplamentos")
    if seco:
        return True

    arqs.gravar(WARDEN, nome, arq)
    for proj, f in cop.items():
        atual = _ler(f)
        _, aco = arqs.partir(atual)
        aco["arquetipo"] = nome
        f.write_text(yaml.safe_dump(aco, allow_unicode=True, sort_keys=False, width=88),
                     encoding="utf-8")
    return True


def desfazer(nome: str) -> bool:
    """Devolve cada acoplamento a um arquivo cheio e apaga o arquétipo."""
    arq = arqs.ler(WARDEN, nome)
    if arq is None:
        print(f"  {nome}: não há arquétipo")
        return False
    for proj, f in copias(nome).items():
        aco = _ler(f)
        if aco.get("arquetipo") != nome:
            continue
        cheio = arqs.resolver(aco, WARDEN, projeto=proj, agente=nome)
        cheio.pop("arquetipo", None)
        f.write_text(yaml.safe_dump(cheio, allow_unicode=True, sort_keys=False, width=88),
                     encoding="utf-8")
        print(f"  {nome} devolvido a {proj}")
    arqs.caminho(WARDEN, nome).unlink(missing_ok=True)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("nomes", nargs="*")
    ap.add_argument("--todos", action="store_true")
    ap.add_argument("--seco", action="store_true", help="só diz o que faria")
    ap.add_argument("--desfazer", action="store_true")
    a = ap.parse_args()

    arqs.configurar(WARDEN)

    if a.desfazer:
        for n in a.nomes:
            desfazer(n)
        return 0

    if a.todos or not a.nomes:
        cands = candidatos()
        print(f"{len(cands)} nomes em mais de um projeto:\n")
        aptos = [c for c in cands if c[2] >= CORTE]
        for nome, cop, s in cands:
            marca = "promove" if s >= CORTE else ("difere no nome do projeto" if s > 0.9 else "agentes diferentes")
            print(f"  {nome:34} {s*100:6.1f}%  {len(cop)} projetos  {marca}")
        print(f"\naptos: {len(aptos)} · fora do corte: {len(cands)-len(aptos)}")
        if not a.todos:
            return 0
        print()
        for nome, _, _ in aptos:
            promover(nome, a.seco)
        return 0

    for n in a.nomes:
        promover(n, a.seco)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
