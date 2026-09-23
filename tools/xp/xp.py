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
# conhece — uma seta ou um emoji num texto de Learning derrubava a consulta
# inteira. Sair em UTF-8, trocando o que não couber, faz o texto chegar sempre.
for _fluxo in (sys.stdout, sys.stderr):
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
# Os tipos de trabalho — os três últimos são de quem coordena: despachar,
# responder ao dono e consolidar o que a squad produziu. A lista fica em código
# porque o argparse precisa dela antes de falar com o servidor; o VALOR de cada
# um em XP mora nas regras do Noctis.
TIPOS = ["entrega", "output", "correcao", "revisao", "memoria", "decisao",
         "despacho", "resposta", "consolidacao", "retrabalho"]
# Os tipos que sao TRABALHO de fato — os que precisam carregar um Learning.
# Despacho e resposta ficam de fora: quem coordena nao esta exercitando nada.
TRABALHO = ("entrega", "output", "correcao", "revisao", "retrabalho", "consolidacao")


def _regra(rid: str, padrao):
    """Le uma regra do Noctis. Servidor fora do ar: vale o padrao, sem travar."""
    try:
        with urllib.request.urlopen(f"{API}/api/regras", timeout=4) as r:
            for reg in json.loads(r.read().decode("utf-8"))["regras"]:
                if reg["id"] == rid:
                    return reg["valor"]
    except Exception:
        pass
    return padrao


def _conferir_identificador(projeto: str, agente: str) -> None:
    """O agente aplicado precisa EXISTIR no projeto em que está registrando.

    Antes isto era um aviso baseado num "projeto ligado" global: o comando
    dizia "o ligado é outro" e registrava assim mesmo. Dois problemas. O
    primeiro é que avisar depois de escrever não impede nada — e o engano é o
    mais caro do sistema, trabalho que some do lugar onde alguém vai
    procurá-lo. O segundo é que o estado era da SESSÃO, não do agente: dois
    agentes trabalhando em projetos diferentes ao mesmo tempo faziam um deles
    ser avisado para sempre, até o aviso virar ruído que ninguém lê.

    `<projeto>:<agente>` é o identificador do agente aplicado. Se ele não
    existe, não há a quem creditar o trabalho, e o certo é parar.
    """
    if not _regra("protocolo.exigir_identificador", True):
        return
    alvo = (f"{API}/api/projects/{urllib.parse.quote(projeto)}"
            f"/agents/{urllib.parse.quote(agente)}/ficha")
    try:
        with urllib.request.urlopen(alvo, timeout=6) as r:
            json.loads(r.read().decode("utf-8"))
        return
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return          # erro do servidor não é problema do identificador
    except Exception:
        return              # servidor fora do ar: quem trava é o registro, adiante

    print(f"xp: '{projeto}:{agente}' não existe — este agente não está aplicado "
          f"neste projeto.", file=sys.stderr)
    raise SystemExit(2)


def _quem(projeto: str, agente: str) -> int:
    """"Quem sou eu aqui?" — a primeira pergunta de um agente, e a mais fácil
    de errar quando o mesmo arquétipo trabalha em vários projetos.

    Substitui o antigo `--ligado`, que respondia sobre a SESSÃO ("qual projeto
    está ligado") quando a pergunta sempre foi sobre o AGENTE.
    """
    if not projeto or not agente:
        print("xp: informe <projeto> <agente> --quem", file=sys.stderr)
        return 2
    try:
        with urllib.request.urlopen(
                f"{API}/api/projects/{urllib.parse.quote(projeto)}"
                f"/agents/{urllib.parse.quote(agente)}/ficha", timeout=8) as r:
            f = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"xp: '{projeto}:{agente}' não existe.", file=sys.stderr)
            return 2
        raise
    daqui = f.get("daqui") or {}
    partes = [f"{f.get('nickname') or agente} | {f.get('identificador')}"]
    if f.get("arquetipo"):
        partes.append(f"arquétipo {f['arquetipo']}")
    if daqui.get("papel"):
        partes.append(str(daqui["papel"]))
    if daqui.get("squad"):
        partes.append(f"squad {daqui['squad']}")
    partes.append(f"nv{f.get('progresso', {}).get('nivel', 0)}")
    print(" | ".join(partes))
    return 0


def _cobrar_learning() -> bool:
    """A cobranca do fim do registro e uma REGRA do Noctis, nao do comando."""
    return bool(_regra("protocolo.cobrar_learning", True))


def _exigir_learning() -> bool:
    """Recusar trabalho sem Learning, ou so avisar?

    A regra nasce DESLIGADA de proposito: despacho ja aberto com o protocolo
    velho tomaria recusa no meio do caminho. O aviso vem sempre; a recusa e o
    segundo degrau, ligado no catalogo quando o parque ja estiver atualizado.
    """
    return bool(_regra("learning.exigir_no_trabalho", False))


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
    # --ligado responde "onde estou?" sem exigir inventar um registro. É a
    # primeira coisa que um agente precisa saber, e a mais fácil de errar.
    p.add_argument("--quem", action="store_true",
                   help="diz quem você é neste projeto (nickname e identificador), e sai")
    p.add_argument("projeto", nargs="?")
    p.add_argument("agente", nargs="?")
    # Opcionais porque `--confirmar` e `--aptidao` não registram trabalho nenhum;
    # exigi-los ali obrigaria a inventar um tipo e um resumo falsos.
    p.add_argument("tipo", nargs="?", choices=TIPOS)
    p.add_argument("resumo", nargs="?", help="o que foi feito, numa frase")
    p.add_argument("-l", "--learning", action="append", default=[],
                   help='Learning exercitado; use "nome: o que ele é" para descrever (repita)')
    # --skill é OUTRA coisa: o SKILL.md do Claude que o agente usou neste turno.
    # Não rende XP e não vira repertório — é só o registro de uso, que alimenta o
    # Runtime. Por isso -s deixou de significar Learning: seria ambíguo.
    p.add_argument("-s", "--skill", action="append", default=[],
                   help="SKILL.md do Claude usado neste trabalho, pelo slug (repita)")
    p.add_argument("-a", "--arquivo", action="append", default=[], help="evidência (repita)")
    p.add_argument("-m", "--memoria", action="append", default=[], help="memória produzida (repita)")
    p.add_argument("-d", "--despacho", default="", help="qual despacho isto atende")
    # --linhas perdeu o -l para --learning: um atalho só, e ele vale mais ali.
    p.add_argument("--linhas", type=int, default=0)
    p.add_argument("--dif", choices=["baixa", "media", "alta"], default="media")
    p.add_argument("--especie", choices=["competencia", "armadilha", "metodo", "ferramenta",
                                         "padrao", "dominio"],
                   help="que espécie de aprendizado nasceu aqui (vale para as novas)")
    p.add_argument("--confirmar", metavar="EVT", help="confirma a entrega de outro (libera o bônus)")
    p.add_argument("--aptidao", metavar="LEARNINGS",
                   help='quem está mais apto, ex.: --aptidao "diagramação SVG, tokens"')
    p.add_argument("--consultar", metavar="ASSUNTO",
                   help="o que o projeto já aprendeu sobre isto — texto inteiro, para ler antes de agir")
    p.add_argument("--briefing", metavar="ASSUNTO",
                   help="versão curta, para colar no pedido quando você delega a outro agente")
    # --nova existia para o agente abrir Learning. Criar é do dono agora; o
    # comando continua aceitando a flag para dar o recado certo em vez de erro.
    p.add_argument("--nova", metavar="NOME: O QUE É", action="append", default=[],
                   help="abre um Learning sem evento — serve para relatório retroativo (repita)")
    # Propor e criar sao coisas diferentes: propor e dele, criar e do dono.
    p.add_argument("--propor", metavar="NOME: O QUE E", action="append", default=[],
                   help="propoe um Learning que falta; o dono aceita ou nao (repita)")
    p.add_argument("--porque", default="",
                   help="de onde a proposta saiu: o que voce estava fazendo quando ela apareceu")
    p.add_argument("--anotar", metavar="LEARNING: TEXTO", action="append", default=[],
                   help="acrescenta um trecho ao corpo do Learning, assinado (repita)")
    p.add_argument("--usei", metavar="APR", action="append", default=[],
                   help="id de aprendizado que voce aplicou neste trabalho (repita)")
    p.add_argument("--tese", metavar="LEARNING: O QUE DESCOBRIU",
                   help="propoe uma tese sobre o Learning, a partir do trabalho que acabou de fazer")
    p.add_argument("--revisa", metavar="TSE", default="",
                   help="id da tese anterior, quando o dono pediu ajuste")
    p.add_argument("--observei", metavar="DOMINIO: O QUE VIU", action="append", default=[],
                   help="registra uma observacao num dominio — o fato, sem conclusao")
    p.add_argument("--suponho", metavar="DOMINIO: GENERALIZACAO",
                   help="propoe uma hipotese; exige --pergunta e as observacoes ja registradas")
    p.add_argument("--pergunta", default="", help="a pergunta que resolveria a hipotese")
    p.add_argument("--opcao", action="append", default=[],
                   help="opcao de resposta (repita; 2+ viram pergunta de escolha)")
    p.add_argument("--evidencia", action="append", default=[],
                   help="id de observacao que sustenta a hipotese (repita); vazio usa as suas mais recentes")
    p.add_argument("--aprendi", metavar="LEARNING: FRASE", action="append", default=[],
                   help='o que mudou ao subir de nível, ex.: --aprendi "diagramação SVG: fundo transparente pede contraste próprio"')
    a = p.parse_args()

    # "onde eu estou?" é a única pergunta que se responde sem registrar nada.
    if a.quem:
        return _quem(a.projeto, a.agente)
    if not a.projeto or not a.agente:
        p.error("informe <projeto> e <agente>")
    _conferir_identificador(a.projeto, a.agente)

    if not (a.confirmar or a.aptidao or a.aprendi or a.nova or a.anotar or a.consultar
            or a.briefing or a.observei or a.suponho or a.tese or a.propor) \
            and not (a.tipo and a.resumo):
        p.error("informe <tipo> e <resumo> — ou use --confirmar / --aptidao")

    # "nome: descrição" numa string só, para a descrição não custar outra chamada
    # — e, principalmente, para ser escrita enquanto quem escreve ainda lembra.
    learnings, descricoes = [], {}
    for item in a.learning:
        nome, sep, desc = item.partition(":")
        nome = nome.strip()
        if not nome:
            continue
        learnings.append(nome)
        if sep and desc.strip():
            descricoes[nome] = desc.strip()

    # Todo comando de TRABALHO carrega um Learning: citar um que existe (-l),
    # observar um domínio (--observei) ou propor um novo (--propor). Propor uma
    # TESE sobre um Learning também conta — é aprendizado sobre um que existe.
    # Sem nenhum dos quatro, o trabalho não deixa nada para o próximo.
    if a.tipo in TRABALHO and a.resumo and not (learnings or a.observei
                                                or a.propor or a.tese):
        recado = ('este trabalho não carrega Learning nenhum — cite um com -l, '
                  'observe um domínio com --observei "dominio: o que viu", ou '
                  'proponha um com --propor "nome: o que e"')
        if _exigir_learning():
            print(f"xp: {recado}", file=sys.stderr)
            return 1
        print(f"aviso: {recado}", file=sys.stderr)

    try:
        # Ler vem antes de escrever: quem consulta ao começar não reaprende o que
        # outro já pagou para aprender.
        if a.consultar or a.briefing:
            modo = "briefing" if a.briefing else "consulta"
            termos = a.briefing or a.consultar
            q = urllib.parse.quote(termos)
            r = ler(f"{a.projeto}/learnings-consulta?q={q}&agente={urllib.parse.quote(a.agente)}&modo={modo}")
            if not r["achados"]:
                print(f'nada no repertorio sobre "{termos}" — se aprender algo, proponha com --propor')
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
            print('xp: criar Learning e do dono. Use --propor "nome: o que e" para '
                  "propor, -l para citar um que ja existe, ou --tese sobre ele.",
                  file=sys.stderr)
            if not (a.tipo and a.resumo):
                return 1
            a.nova = []
        if a.nova:
            for item in a.nova:
                nome, _, desc = item.partition(":")
                if not nome.strip():
                    continue
                corpo = {"rotulo": nome.strip(), "descricao": desc.strip(),
                         "autor": a.agente, "especie": a.especie or ""}
                try:
                    r = chamar(f"{a.projeto}/learnings", corpo)
                    print(f'Learning aberto: {nome.strip()}')
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

        # A proposta de Learning novo. Ela NAO cria nada: fica esperando o
        # dono aceitar, recusar ou pedir ajuste, e ele ve isso na tela de
        # Learning. Exige dizer de onde saiu — proposta sem trabalho atras
        # e palpite.
        if a.propor:
            if not (a.despacho or a.porque):
                print("xp: diga de onde a proposta saiu — use --porque ou -d <despacho>",
                      file=sys.stderr)
                return 1
            for item in a.propor:
                nome, _, desc = item.partition(":")
                if not nome.strip() or not desc.strip():
                    print('xp: escreva "nome: o que e" — faltou a descricao em '
                          + repr(item), file=sys.stderr)
                    continue
                try:
                    r = chamar(a.projeto + "/propostas", {
                        "rotulo": nome.strip(), "o_que_e": desc.strip(), "agente": a.agente,
                        "porque": a.porque, "despacho": a.despacho, "revisa": a.revisa})
                    prop = r["proposta"]
                    print("proposta enviada: " + prop["rotulo"] + " (" + prop["id"]
                          + ") — o dono decide")
                    if prop.get("parecida_com"):
                        print('   ja existe algo chamado "' + prop["parecida_com"]
                              + '" — pode ser que ele use aquela em vez desta')
                except urllib.error.HTTPError as e:
                    corpo = e.read().decode("utf-8", "replace")
                    try:
                        corpo = json.loads(corpo).get("detail", corpo)
                    except json.JSONDecodeError:
                        pass
                    print("xp: " + str(corpo), file=sys.stderr)
            if not (a.tipo and a.resumo):
                return 0

        # A tese sobre um Learning, vinda do trabalho. Este e o caminho
        # principal: o dono cria o Learning, ele desce no despacho, e quem
        # executou volta com o que descobriu — com a pergunta.
        if a.tese:
            hab, _, texto = a.tese.partition(":")
            if not (hab.strip() and texto.strip()):
                print('xp: use --tese "learning: o que voce descobriu"', file=sys.stderr)
                return 1
            if not a.pergunta.strip():
                print('xp: tese exige --pergunta "o que perguntar ao dono"', file=sys.stderr)
                return 1
            tipo = "multi" if len(a.opcao) > 2 else "radio" if len(a.opcao) == 2 else "bool"
            corpo = {"skill": _slug(hab.strip()), "agente": a.agente, "texto": texto.strip(),
                     "pergunta": {"tipo": tipo, "texto": a.pergunta.strip(), "opcoes": a.opcao},
                     "eventos": a.evidencia, "despacho": a.despacho, "revisa": a.revisa}
            try:
                r = chamar(f"{a.projeto}/teses-do-learning", corpo)
                print(f'tese proposta: {r["tese"]["id"]} — o dono responde na doca do NOCTURN')
            except urllib.error.HTTPError as e:
                print("xp: " + json.loads(e.read().decode("utf-8", "replace")).get("detail", ""),
                      file=sys.stderr)
                return 1
            if not (a.tipo and a.resumo):
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
                    print('xp: use --anotar "learning: texto"', file=sys.stderr)
                    return 1
                # O slug é o id do Learning; o servidor aceita o rótulo também
                # porque quem escreve digita o nome, não o identificador.
                chave = ler(f"{a.projeto}/learnings")["skills"]
                alvo = next((k for k, v in chave.items()
                             if v["rotulo"].lower() == hab.strip().lower() or k == hab.strip()), None)
                if not alvo:
                    print(f'xp: Learning "{hab.strip()}" nao existe', file=sys.stderr)
                    return 1
                chamar(f"{a.projeto}/learnings/{alvo}/corpo", {"texto": texto.strip(), "autor": a.agente})
                print(f"anotado em {hab.strip()}")
            if not (a.tipo and a.resumo or a.aprendi):
                return 0

        if a.aprendi:
            for item in a.aprendi:
                hab, _, texto = item.partition(":")
                if not (hab.strip() and texto.strip()):
                    print('xp: use --aprendi "learning: o que mudou"', file=sys.stderr)
                    return 1
                chamar(f"{a.projeto}/marcos", {"agente": a.agente, "habilidade": hab.strip(),
                                               "texto": texto.strip()})
                print(f"marco registrado em {hab.strip()}")
            if not (a.tipo and a.resumo):
                return 0

        if a.aptidao:
            q = urllib.parse.quote(a.aptidao)
            r = ler(f"{a.projeto}/aptidao?learnings={q}")
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
            "despacho": a.despacho, "dificuldade": a.dif, "habilidades": learnings,
            # O SKILL.md do Claude usado — lista nova no MESMO evento, que e
            # o que o Runtime le. A chave "habilidades" fica: o log e
            # append-only, e reescrever o nome dela quebraria a leitura do
            # historico inteiro.
            "skills": [x.strip() for x in a.skill if x.strip()],
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

    if a.tipo in TRABALHO and not learnings and _cobrar_learning():
        print("   nenhum Learning declarado — o que este trabalho deixou para o proximo?")

    # O CLI cobra na hora as duas escritas que só quem trabalhou sabe fazer.
    # Cobrar aqui é o que impede o Learning de envelhecer sem significado.
    for s_ in r.get("semDescricao", []):
        print(f'   falta descrever "{s_["rotulo"]}" — repita com -l "{s_["rotulo"]}: o que ele é"')
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
