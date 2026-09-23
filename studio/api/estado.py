"""O estado declarado de um projeto — e o rastro de como ele chegou aqui.

O estado de uma frente existia, e existia como prosa: um `.md` de seiscentas
linhas escrito à mão, misturando o que muda a cada rodada com o que quase nunca
muda. Um arquivo assim é bom para uma pessoa ler e impossível para um gate ler —
e foi por isso que o gate do playbook nunca passou de uma frase no prompt.

A separação É o mecanismo, e são três arquivos por taxa de mudança:

    state/state.yaml     o cabeçalho, para a MÁQUINA — fase, gate, hipóteses,
                         bloqueios. Pequeno de propósito: é o que o gate lê e o
                         que o briefing injeta.
    state/state.md       a prosa, para VOCÊ. O que não cabe no yaml.
    state/changes.jsonl  append-only, um StateChange por linha. Nunca reescrito,
                         como o log de trabalho — é o que responde "isto mudou
                         quando, por quem, e com que evidência".

**Agente não promove estado.** Ele escreve `proposto`; quem aplica é você. E um
agente que registra algo como aplicado precisa dizer de qual peça aquilo saiu —
sem a origem, é opinião com carimbo de fato.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

# O que uma mudança pode estar esperando. `proposto` é o estado em que tudo que
# vem de agente nasce.
VEREDITOS = ("proposto", "aplicado", "recusado")

# O esqueleto de um estado novo. Existe para que o arquivo nasça dizendo o que
# ele quer saber, em vez de nascer vazio e virar prosa de novo.
PADRAO: dict = {
    "fase": "",
    "gate": "",
    "hipoteses": [],
    "bloqueios": [],
    "atualizado_em": "",
}


def _dir(base: Path) -> Path:
    return base / "state"


def caminho_yaml(base: Path) -> Path:
    return _dir(base) / "state.yaml"


def caminho_prosa(base: Path) -> Path:
    return _dir(base) / "state.md"


def caminho_mudancas(base: Path) -> Path:
    return _dir(base) / "changes.jsonl"


def ler(base: Path) -> dict:
    """O estado como está. Projeto sem estado devolve o esqueleto, não erro."""
    p = caminho_yaml(base)
    dados = dict(PADRAO)
    if p.is_file():
        try:
            lido = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
            if isinstance(lido, dict):
                dados.update(lido)
        except yaml.YAMLError:
            pass
    prosa = caminho_prosa(base)
    return {
        **dados,
        "prosa": prosa.read_text(encoding="utf-8") if prosa.is_file() else "",
        "existe": p.is_file(),
    }


def mudancas(base: Path, limite: int = 200) -> list[dict]:
    """As mudanças, da mais recente para a mais antiga."""
    p = caminho_mudancas(base)
    if not p.is_file():
        return []
    fora = []
    for linha in p.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            fora.append(json.loads(linha))
        except json.JSONDecodeError:
            continue
    fora.reverse()
    return fora[:max(1, min(limite, 2000))]


def _anotar(base: Path, linha: dict) -> None:
    p = caminho_mudancas(base)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")


def gravar(base: Path, novo: dict, ator: str = "usuario",
           motivo: str = "", origem: str = "") -> dict:
    """Aplica um estado novo e registra CADA campo que mudou.

    `origem` é a peça de onde a mudança saiu. Ela é obrigatória quando quem
    escreve é um agente: sem ela, o registro diria que algo foi aplicado sem
    dizer com base em quê — que é o formato de uma conclusão sem evidência.
    """
    de_agente = ator not in ("usuario", "")
    if de_agente and not origem:
        raise ValueError("agente que muda o estado precisa dizer de que peça a mudança saiu")

    antes = ler(base)
    campos = {k: v for k, v in novo.items() if k in PADRAO and k != "atualizado_em"}
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")

    mudou = {k: v for k, v in campos.items() if antes.get(k) != v}
    if not mudou and "prosa" not in novo:
        return ler(base)

    for campo, para in mudou.items():
        _anotar(base, {
            "quando": agora, "campo": campo,
            "de": antes.get(campo), "para": para,
            "ator": (ator or "usuario")[:120],
            # Agente propõe; você aplica. É a mesma regra do resto do Noctis,
            # aqui como campo do registro em vez de promessa no prompt.
            "veredito": "proposto" if de_agente else "aplicado",
            "motivo": str(motivo or "")[:400],
            "origem": str(origem or "")[:200],
        })

    # **A proposta do agente NÃO toca o arquivo.** Registrar como `proposto` e
    # escrever assim mesmo faria de "proposto" um rótulo numa mudança que já
    # aconteceu — que é exatamente o defeito do gate escrito no prompt. O estado
    # só se move quando você responde `aplicado`.
    if de_agente:
        return ler(base)

    _aplicar(base, {k: novo.get(k, antes.get(k)) for k in PADRAO}, agora)
    if isinstance(novo.get("prosa"), str):
        caminho_prosa(base).write_text(novo["prosa"], encoding="utf-8")
    return ler(base)


def _aplicar(base: Path, dados: dict, agora: str) -> None:
    dados = dict(dados)
    dados["atualizado_em"] = agora
    p = caminho_yaml(base)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(yaml.safe_dump(dados, allow_unicode=True, sort_keys=False), encoding="utf-8")


def responder(base: Path, indice: int, veredito: str, por: str = "usuario") -> dict:
    """O seu veredito sobre uma mudança proposta por agente.

    Não reescreve a linha original — o log é append-only. Acrescenta outra, que
    é como o resto do sistema já registra mudança de opinião.
    """
    if veredito not in VEREDITOS:
        raise ValueError(f"veredito inválido: {veredito!r}")
    todas = mudancas(base, limite=2000)
    if not 0 <= indice < len(todas):
        raise IndexError(indice)
    alvo = todas[indice]
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    campo = alvo.get("campo")

    # É AQUI que a proposta vira estado, e só aqui. Antes disto ela era uma
    # linha no log dizendo o que um agente acha que deveria ser.
    if veredito == "aplicado" and campo in PADRAO:
        atual = ler(base)
        _aplicar(base, {**{k: atual.get(k) for k in PADRAO}, campo: alvo.get("para")}, agora)

    _anotar(base, {
        "quando": agora,
        "campo": campo, "de": alvo.get("de"), "para": alvo.get("para"),
        "ator": (por or "usuario")[:120], "veredito": veredito,
        "motivo": f"veredito sobre a proposta de {alvo.get('ator')}",
        "origem": alvo.get("origem", ""),
    })
    return {"ok": True, "veredito": veredito, "campo": campo}
