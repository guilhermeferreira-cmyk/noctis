#!/usr/bin/env python
"""Registra trabalho feito no Noctis. Uma linha, sem dependências.

    python tools/xp/xp.py <projeto> <agente> <tipo> "<resumo>" [opções]

Por que um CLI e não um `curl`: o corpo tem acento e aspas, e montar JSON na mão
no terminal do Windows quebra na primeira cedilha — eu mesmo perdi uma chamada
assim. Aqui o que o agente escreve é texto solto, e a montagem é problema nosso.

E por que ele é curto: este texto vira contexto em TODO despacho. Cada linha a
mais aqui é paga para sempre, em todos os agentes.

Saída: uma linha só, do tipo
    frontend_senior | nv2 | 437 XP | 44% para nv3 | brotando: glass-nos-cards
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("NOCTIS_API", "http://127.0.0.1:5501")

# O console do Windows escreve em cp1252 e morre no primeiro caractere que não
# conhece — uma seta ou um emoji num texto de habilidade derrubava a consulta
# inteira. Sair em UTF-8, trocando o que não couber, faz o texto chegar sempre.
for _fluxo in (sys.stdout, sys.stderr):
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
TIPOS = ["entrega", "output", "correcao", "revisao", "memoria", "decisao", "retrabalho"]


def _slug(texto: str) -> str:
    """O mesmo slug do servidor, para o agente poder digitar o nome do dominio."""
    import re
    import unicodedata
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")


def ler(rota: str) -> dict:
    with urllib.request.urlopen(f"{API}/api/projects/{rota}", timeout=20) as r:
        return json.load(r)


def chamar(rota: str, corpo: dict) -> dict:
    req = urllib.request.Request(
        f"{API}/api/projects/{rota}", method="POST",
        data=json.dumps(corpo, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def main() -> int:
    p = argparse.ArgumentParser(
        prog="xp", description="Registra trabalho de um agente no Noctis.",
        epilog="O XP é calculado no servidor: você reporta o que fez, não quanto vale.")
    p.add_argument("projeto")
    p.add_argument("agente")
    # Opcionais porque `--confirmar` e `--aptidao` não registram trabalho nenhum;
    # exigi-los ali obrigaria a inventar um tipo e um resumo falsos.
    p.add_argument("tipo", nargs="?", choices=TIPOS)
    p.add_argument("resumo", nargs="?", help="o que foi feito, numa frase")
    p.add_argument("-s", "--skill", action="append", default=[],
                   help='habilidade exercitada; use "nome: o que ela é" para descrever a nova (repita)')
    p.add_argument("-a", "--arquivo", action="append", default=[], help="evidência (repita)")
    p.add_argument("-m", "--memoria", action="append", default=[], help="memória produzida (repita)")
    p.add_argument("-d", "--despacho", default="", help="qual despacho isto atende")
    p.add_argument("-l", "--linhas", type=int, default=0)
    p.add_argument("--dif", choices=["baixa", "media", "alta"], default="media")
    p.add_argument("--especie", choices=["competencia", "armadilha", "metodo", "ferramenta",
                                         "padrao", "dominio"],
                   help="que espécie de aprendizado nasceu aqui (vale para as novas)")
    p.add_argument("--confirmar", metavar="EVT", help="confirma a entrega de outro (libera o bônus)")
    p.add_argument("--aptidao", metavar="HABILIDADES",
                   help='quem está mais apto, ex.: --aptidao "diagramação SVG, tokens"')
    p.add_argument("--consultar", metavar="ASSUNTO",
                   help="o que o projeto já aprendeu sobre isto — texto inteiro, para ler antes de agir")
    p.add_argument("--briefing", metavar="ASSUNTO",
                   help="versão curta, para colar no pedido quando você delega a outro agente")
    p.add_argument("--nova", metavar="NOME: O QUE É", action="append", default=[],
                   help="abre uma habilidade sem evento — serve para relatório retroativo (repita)")
    p.add_argument("--anotar", metavar="SKILL: TEXTO", action="append", default=[],
                   help="acrescenta um trecho ao corpo da habilidade, assinado (repita)")
    p.add_argument("--usei", metavar="APR", action="append", default=[],
                   help="id de aprendizado que voce aplicou neste trabalho (repita)")
    p.add_argument("--observei", metavar="DOMINIO: O QUE VIU", action="append", default=[],
                   help="registra uma observacao num dominio — o fato, sem conclusao")
    p.add_argument("--suponho", metavar="DOMINIO: GENERALIZACAO",
                   help="propoe uma hipotese; exige --pergunta e as observacoes ja registradas")
    p.add_argument("--pergunta", default="", help="a pergunta que resolveria a hipotese")
    p.add_argument("--opcao", action="append", default=[],
                   help="opcao de resposta (repita; 2+ viram pergunta de escolha)")
    p.add_argument("--evidencia", action="append", default=[],
                   help="id de observacao que sustenta a hipotese (repita); vazio usa as suas mais recentes")
    p.add_argument("--aprendi", metavar="SKILL: FRASE", action="append", default=[],
                   help='o que mudou ao subir de nível, ex.: --aprendi "diagramação SVG: fundo transparente pede contraste próprio"')
    a = p.parse_args()

    if not (a.confirmar or a.aptidao or a.aprendi or a.nova or a.anotar or a.consultar
            or a.briefing or a.observei or a.suponho) \
            and not (a.tipo and a.resumo):
        p.error("informe <tipo> e <resumo> — ou use --confirmar / --aptidao")

    # "nome: descrição" numa string só, para a descrição não custar outra chamada
    # — e, principalmente, para ser escrita enquanto quem escreve ainda lembra.
    skills, descricoes = [], {}
    for item in a.skill:
        nome, sep, desc = item.partition(":")
        nome = nome.strip()
        if not nome:
            continue
        skills.append(nome)
        if sep and desc.strip():
            descricoes[nome] = desc.strip()

    try:
        # Ler vem antes de escrever: quem consulta ao começar não reaprende o que
        # outro já pagou para aprender.
        if a.consultar or a.briefing:
            modo = "briefing" if a.briefing else "consulta"
            termos = a.briefing or a.consultar
            q = urllib.parse.quote(termos)
            r = ler(f"{a.projeto}/skills-consulta?q={q}&agente={urllib.parse.quote(a.agente)}&modo={modo}")
            if not r["achados"]:
                print(f'nada no repertorio sobre "{termos}" — se aprender algo, registre com --nova')
                return 0
            # O que ja foi VALIDADO pelo dono vem primeiro e com id: e o que se
            # aplica sem pensar duas vezes, e o id e o que ele cita depois.
            if r.get("aprendizados"):
                print("Aprendizados validados neste projeto (cite o id com --usei):")
                for ap in r["aprendizados"]:
                    print(f'- [{ap["id"]}] {ap["texto"]}')
                print()
            if modo == "briefing":
                print(f'O que o projeto ja sabe sobre "{termos}":')
                for h in r["achados"]:
                    base = " [base]" if h.get("origem") == "noctis" else ""
                    print(f'- {h["rotulo"]} ({h["especie"]}){base}: {h["descricao"] or "sem descricao"}')
                    if h["corpo"]:
                        for linha in h["corpo"].strip().splitlines()[:8]:
                            if linha.strip():
                                print(f'    {linha.strip()}')
            else:
                for h in r["achados"]:
                    base = ", da base" if h.get("origem") == "noctis" else ""
                    print(f'=== {h["rotulo"]}  [{h["especie"]}, {h["estado"]}{base}]')
                    if h["descricao"]:
                        print(h["descricao"])
                    if h["corpo"].strip():
                        print()
                        print(h["corpo"].strip())
                    print()
            return 0

        if a.nova:
            for item in a.nova:
                nome, _, desc = item.partition(":")
                if not nome.strip():
                    continue
                corpo = {"rotulo": nome.strip(), "descricao": desc.strip(),
                         "autor": a.agente, "especie": a.especie or ""}
                try:
                    r = chamar(f"{a.projeto}/skills", corpo)
                    print(f'habilidade aberta: {nome.strip()}')
                    for par in r.get("parecidas", []):
                        print(f'   parecida com "{par}" — se for a mesma coisa, use --anotar nela')
                except urllib.error.HTTPError as e:
                    if e.code == 409:
                        msg = json.loads(e.read().decode("utf-8", "replace")).get("detail", "")
                        print(f'{nome.strip()}: {msg} — acrescente com --anotar em vez de abrir outra')
                    else:
                        raise
            if not (a.tipo and a.resumo or a.aprendi):
                return 0

        # O agente alimentando o loop: observa o fato, e so depois generaliza.
        if a.observei:
            for item in a.observei:
                dom, _, texto = item.partition(":")
                if not (dom.strip() and texto.strip()):
                    print('xp: use --observei "dominio: o que voce viu"', file=sys.stderr)
                    return 1
                r = chamar(f"{a.projeto}/observacoes",
                           {"skill": dom.strip(), "agente": a.agente, "texto": texto.strip()})
                print(f'observado em {dom.strip()}: {r["observacao"]["id"]}')
            # Observar sozinho é um comando completo: sem tipo e resumo, nada
            # de cair no registro de evento e falhar por tipo vazio.
            if not (a.suponho or (a.tipo and a.resumo)):
                return 0

        if a.suponho:
            dom, _, texto = a.suponho.partition(":")
            if not (dom.strip() and texto.strip()):
                print('xp: use --suponho "dominio: a generalizacao"', file=sys.stderr)
                return 1
            if not a.pergunta.strip():
                print('xp: hipotese exige --pergunta "o que perguntar ao dono"', file=sys.stderr)
                return 1
            evid = list(a.evidencia)
            if not evid:
                # Sem ids na mao, valem as observacoes recentes DELE naquele
                # dominio: quem observou e quem generaliza sao o mesmo agente.
                todas = ler(f"{a.projeto}/aprendizado/{_slug(dom.strip())}")["observacoes"]
                evid = [o["id"] for o in todas if o.get("agente") == a.agente][:4]
            tipo = "multi" if len(a.opcao) > 2 else "escolha" if len(a.opcao) == 2 else "bool"
            try:
                r = chamar(f"{a.projeto}/hipoteses", {
                    "skill": dom.strip(), "agente": a.agente, "texto": texto.strip(),
                    "evidencias": evid,
                    "pergunta": {"tipo": tipo, "texto": a.pergunta.strip(), "opcoes": a.opcao}})
                print(f'hipotese proposta: {r["hipotese"]["id"]} — o dono responde na doca do NOCTURN')
            except urllib.error.HTTPError as e:
                print("xp: " + json.loads(e.read().decode("utf-8", "replace")).get("detail", ""),
                      file=sys.stderr)
                return 1
            if not (a.tipo and a.resumo):
                return 0

        if a.anotar:
            for item in a.anotar:
                hab, _, texto = item.partition(":")
                if not (hab.strip() and texto.strip()):
                    print('xp: use --anotar "habilidade: texto"', file=sys.stderr)
                    return 1
                # O slug é o id da habilidade; o servidor aceita o rótulo também
                # porque quem escreve digita o nome, não o identificador.
                chave = ler(f"{a.projeto}/skills")["skills"]
                alvo = next((k for k, v in chave.items()
                             if v["rotulo"].lower() == hab.strip().lower() or k == hab.strip()), None)
                if not alvo:
                    print(f'xp: habilidade "{hab.strip()}" nao existe', file=sys.stderr)
                    return 1
                chamar(f"{a.projeto}/skills/{alvo}/corpo", {"texto": texto.strip(), "autor": a.agente})
                print(f"anotado em {hab.strip()}")
            if not (a.tipo and a.resumo or a.aprendi):
                return 0

        if a.aprendi:
            for item in a.aprendi:
                hab, _, texto = item.partition(":")
                if not (hab.strip() and texto.strip()):
                    print('xp: use --aprendi "habilidade: o que mudou"', file=sys.stderr)
                    return 1
                chamar(f"{a.projeto}/marcos", {"agente": a.agente, "habilidade": hab.strip(),
                                               "texto": texto.strip()})
                print(f"marco registrado em {hab.strip()}")
            if not (a.tipo and a.resumo):
                return 0

        if a.aptidao:
            q = urllib.parse.quote(a.aptidao)
            r = ler(f"{a.projeto}/aptidao?habilidades={q}")
            for linha in r["ranking"][:5]:
                cobre = ", ".join(f'{c["rotulo"]} nv{c["nivel"]}{"*" if c["broto"] else ""}'
                                  for c in linha["cobre"]) or "nada ainda"
                print(f'{linha["nota"]:>6.2f}  {linha["agente"]:<22} {cobre}'
                      + (f'  | falta: {len(linha["falta"])}' if linha["falta"] else ""))
            print("(* = broto: ainda aprendendo)")
            return 0

        if a.confirmar:
            chamar(f"{a.projeto}/eventos/{a.confirmar}/confirmar", {"por": a.agente})
            print(f"{a.agente} confirmou {a.confirmar}")
            return 0

        r = chamar(f"{a.projeto}/eventos", {
            "agente": a.agente, "tipo": a.tipo, "resumo": a.resumo,
            "despacho": a.despacho, "dificuldade": a.dif, "habilidades": skills,
            # Quais aprendizados do projeto ele aplicou: e o que mede se o loop
            # serve para algo. Conhecimento validado que ninguem reusa e enfeite.
            "aprendizados": a.usei,
            "descricoes": descricoes, "especie": a.especie or "",
            "evidencia": {"arquivos": a.arquivo, "memorias": a.memoria, "linhas": a.linhas},
        })
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", "replace")[:200]
        print(f"xp: falhou ({e.code}) {detalhe}", file=sys.stderr)
        return 1
    except OSError as e:
        # O Noctis não estar de pé não pode derrubar o trabalho de ninguém.
        print(f"xp: Noctis fora do ar em {API} ({e}) — evento não registrado", file=sys.stderr)
        return 1

    if a.tipo in ("entrega", "output", "correcao") and not skills:
        print("   nenhuma habilidade declarada — o que este trabalho deixou para o proximo?")

    # O CLI cobra na hora as duas escritas que só quem trabalhou sabe fazer.
    # Cobrar aqui é o que impede a habilidade de envelhecer sem significado.
    for s_ in r.get("semDescricao", []):
        print(f'   falta descrever "{s_["rotulo"]}" — repita com -s "{s_["rotulo"]}: o que ela é"')
    for s_ in r.get("subiram", []):
        print(f'   {s_["rotulo"]} subiu para nv{s_["nivel"]} — diga o que mudou: '
              f'--aprendi "{s_["rotulo"]}: ..."')

    brotos = ", ".join(r.get("brotos", [])[-2:])
    # Separador em ASCII de propósito: o terminal do Windows escreve em cp1252 e
    # transformaria um "·" em ruído bem no lugar onde o agente lê o resultado.
    print(f'{a.agente} | nv{r["nivel"]} | {r["xp"]:.0f} XP | '
          f'{r["progresso"]:.0%} para nv{r["nivel"] + 1}'
          + (f' | brotando: {brotos}' if brotos else ''))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
