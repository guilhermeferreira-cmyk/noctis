"""Nicknames dos agentes aplicados — o nome pelo qual se chama, nunca o pelo
qual se endereça.

Um arquétipo vive em vários projetos. Dizer "o redator" deixou de bastar no dia
em que passaram a existir três redatores, um por projeto, com níveis, memórias
e histórico diferentes. Então cada AGENTE APLICADO ganha duas coisas:

    identificador   <projeto>:<agente>   endereço, único por projeto, derivado
    nickname         Vega                 nome, único no sistema inteiro, do banco

A separação é deliberada e é a regra: **nickname não endereça nada**. Quem
renomeia um nickname não quebra referência nenhuma, porque nada aponta para ele.
Quem muda de projeto muda de identificador, e isso é o certo — é outro agente
aplicado, com outro histórico.

Os nomes saem da linha do Noctis: estrelas, constelações e coisas do céu
noturno. Não é enfeite — é o que faz "Vega entregou" soar como uma pessoa da
equipe, e não como uma linha de log.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

# O banco. Estrelas e constelações, sem nome de projeto, sem nome de pessoa.
# A ordem é a de saída: os primeiros são os mais sonoros de propósito, porque
# os primeiros agentes de um projeto são os que mais se citam em conversa.
BANCO = [
    "Vega", "Lyra", "Altair", "Rigel", "Deneb", "Mira", "Polaris", "Sirius",
    "Antares", "Arcturus", "Capella", "Bellatrix", "Spica", "Aldebaran",
    "Castor", "Pollux", "Regulus", "Procyon", "Canopus", "Achernar",
    "Atria", "Alcor", "Mizar", "Merak", "Dubhe", "Phecda", "Megrez", "Alioth",
    "Alkaid", "Thuban", "Kochab", "Pherkad", "Elnath", "Alnitak", "Alnilam",
    "Mintaka", "Saiph", "Meissa", "Hatysa", "Nair", "Sadr", "Albireo",
    "Vindemiatrix", "Porrima", "Zavijava", "Syrma", "Zaniah", "Heze",
    "Sheliak", "Sulafat", "Aladfar", "Alathfar", "Tarazed", "Alshain",
    "Sadalsuud", "Sadalmelik", "Skat", "Situla", "Ancha", "Albali",
    "Nashira", "Dabih", "Algedi", "Deneb Algedi", "Alshat",
    "Hamal", "Sheratan", "Mesarthim", "Botein", "Menkar", "Mirach",
    "Almach", "Alpheratz", "Scheat", "Markab", "Algenib", "Enif", "Homam",
    "Matar", "Sadalbari", "Kerb", "Salm", "Biham",
    "Alcyone", "Maia", "Electra", "Taygeta", "Asterope", "Celaeno", "Merope",
    "Atlas", "Pleione", "Aludra", "Wezen", "Adhara", "Furud", "Muliphein",
    "Gomeisa", "Talitha", "Tania", "Alula", "Muscida", "Alhena", "Mebsuta",
    "Mekbuda", "Propus", "Tejat", "Wasat", "Alzirr", "Nihal", "Arneb",
    "Zaurak", "Rana", "Azha", "Acamar", "Beid", "Keid", "Cursa",
    "Izar", "Muphrid", "Seginus", "Nekkar", "Alkalurops", "Merga",
]

_SLUG = re.compile(r"[^a-z0-9]+")


def identificador(projeto: str, agente: str) -> str:
    """O endereço do agente aplicado. Derivado, nunca guardado: dois lugares
    guardando a mesma verdade é como ela começa a divergir."""
    return f"{projeto}:{agente}"


def _caminho(base: Path) -> Path:
    return base / "config" / "nicknames.json"


def _ler(base: Path) -> dict:
    p = _caminho(base)
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _gravar(base: Path, d: dict) -> None:
    p = _caminho(base)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def todos(base: Path) -> dict:
    """identificador -> nickname."""
    return _ler(base)


def de(base: Path, projeto: str, agente: str) -> str:
    return _ler(base).get(identificador(projeto, agente), "")


def usados(base: Path) -> set:
    return {v.lower() for v in _ler(base).values() if v}


def livres(base: Path) -> list[str]:
    ja = usados(base)
    return [n for n in BANCO if n.lower() not in ja]


def atribuir(base: Path, projeto: str, agente: str) -> str:
    """Dá o próximo nickname livre, se este agente ainda não tem um.

    Idempotente de propósito: chamar de novo devolve o mesmo nickname. Quem
    acopla um agente não precisa saber se já passou por aqui.
    """
    d = _ler(base)
    ident = identificador(projeto, agente)
    if d.get(ident):
        return d[ident]
    disponiveis = livres(base)
    if not disponiveis:
        # Banco esgotado: em vez de repetir — o que quebraria a única promessa
        # que o nickname faz —, numera a partir do banco. Feio e honesto.
        n = len(d) + 1
        nome = f"{BANCO[n % len(BANCO)]} {n // len(BANCO) + 2}"
    else:
        nome = disponiveis[0]
    d[ident] = nome
    _gravar(base, d)
    return nome


def definir(base: Path, projeto: str, agente: str, nickname: str) -> str:
    """Troca o nickname à mão. Recusa repetido — é a regra do banco."""
    nome = (nickname or "").strip()
    if not nome:
        raise ValueError("nickname vazio")
    d = _ler(base)
    ident = identificador(projeto, agente)
    for k, v in d.items():
        if k != ident and str(v).lower() == nome.lower():
            raise ValueError(f"'{nome}' já é o nickname de {k}")
    d[ident] = nome
    _gravar(base, d)
    return nome


def soltar(base: Path, projeto: str, agente: str) -> None:
    """Agente apagado devolve o nickname ao banco."""
    d = _ler(base)
    if d.pop(identificador(projeto, agente), None) is not None:
        _gravar(base, d)


def orfaos(base: Path, projetos: Path) -> list[tuple[str, str]]:
    """Nicknames presos a agentes que não existem mais no disco.

    Apagar pela tela já devolve o nome ao banco. Mas um agente também some de
    outras formas — projeto renomeado, pasta movida, arquivo apagado na mão —,
    e aí o nickname fica reservado para um fantasma. Num banco finito, isso é
    vazamento: os nomes acabam sem que ninguém os esteja usando.
    """
    fora = []
    for ident, nome in _ler(base).items():
        proj, _, agente = ident.partition(":")
        if not (projetos / proj / "agents" / f"{agente}.yaml").exists():
            fora.append((ident, nome))
    return fora


def liberar_orfaos(base: Path, projetos: Path) -> list[tuple[str, str]]:
    """Devolve ao banco todo nickname sem agente. Devolve o que liberou.

    O nome volta para o FIM da fila natural: `livres()` respeita a ordem do
    banco, então um nome liberado só é reusado quando chegar a vez dele. Isso
    evita o reuso imediato, que faria dois agentes diferentes aparecerem com o
    mesmo nome no histórico de quem estava lendo.
    """
    perdidos = orfaos(base, projetos)
    if not perdidos:
        return []
    d = _ler(base)
    for ident, _ in perdidos:
        d.pop(ident, None)
    _gravar(base, d)
    return perdidos
