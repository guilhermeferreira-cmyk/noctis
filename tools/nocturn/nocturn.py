#!/usr/bin/env python
"""O lado de fora do NOCTURN: por onde uma sessão encarna o supervisor.

    python tools/nocturn/nocturn.py ronda            # o que está pendente, em todos os projetos
    python tools/nocturn/nocturn.py ouvir            # o que te perguntaram e ainda não foi respondido
    python tools/nocturn/nocturn.py dizer "texto"    # responde no dock, como NOCTURN
    python tools/nocturn/nocturn.py descrever <projeto> <chave> "descrição"

O dock e a sessão conversam pelo mesmo arquivo, e nenhum dos dois sabe quem está
do outro lado. É isso que permite abrir o NOCTURN no IDE sem mexer na interface.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import os

API = os.environ.get("NOCTIS_API", "http://127.0.0.1:5501")

# O console do Windows escreve em cp1252 e morre no primeiro caractere que não
# conhece — uma seta ou um emoji num texto de habilidade derrubava a consulta
# inteira. Sair em UTF-8, trocando o que não couber, faz o texto chegar sempre.
for _fluxo in (sys.stdout, sys.stderr):
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def chamar(rota: str, corpo=None):
    req = urllib.request.Request(
        API + rota, method="POST" if corpo is not None else "GET",
        data=json.dumps(corpo, ensure_ascii=False).encode("utf-8") if corpo is not None else None,
        headers={"Content-Type": "application/json; charset=utf-8"} if corpo is not None else {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ronda():
    r = chamar("/api/nocturn/relatorio")
    s = r["resumo"]
    print(f'{s["semDescricao"]} sem descricao | {s["semConfirmacao"]} sem confirmacao | {s["parados"]} parados')
    for a in r["achados"]:
        alvo = a.get("chave") or a.get("evento") or a.get("agente") or ""
        print(f'  [{a["urgencia"]:<5}] {a["projeto"]:<20} {a["tipo"]:<20} {alvo:<28} {a["texto"]}')
    return 0


def ouvir():
    msgs = chamar("/api/nocturn/conversa")["mensagens"]
    pendentes = []
    for m in msgs:
        if m["autor"] == "voce":
            pendentes.append(m)
        else:
            pendentes.clear()      # respondeu: o que veio antes já foi tratado
    if not pendentes:
        print("nada a responder")
        return 0
    for m in pendentes:
        print(f'{m["quando"][:16]} | {m["texto"]}')
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip())
        return 2
    cmd = sys.argv[1]
    try:
        if cmd == "ronda":
            return ronda()
        if cmd == "ouvir":
            return ouvir()
        if cmd == "dizer" and len(sys.argv) > 2:
            m = chamar("/api/nocturn/conversa", {"texto": " ".join(sys.argv[2:]), "autor": "nocturn"})
            print("dito:", m["id"])
            return 0
        if cmd == "descrever" and len(sys.argv) > 4:
            chamar("/api/nocturn/descrever", {"projeto": sys.argv[2], "chave": sys.argv[3],
                                              "descricao": " ".join(sys.argv[4:])})
            print("descrita:", sys.argv[3])
            return 0
    except urllib.error.HTTPError as e:
        print(f"nocturn: falhou ({e.code}) {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"nocturn: Noctis fora do ar em {API} ({e})", file=sys.stderr)
        return 1
    print(__doc__.strip())
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
