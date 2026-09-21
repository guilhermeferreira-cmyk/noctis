"""XP, níveis e habilidades emergentes dos agentes.

Duas regras governam este arquivo, e o resto é consequência delas.

**O agente nunca escreve um número de XP.** Ele reporta o que fez e com que
evidência; a pontuação é calculada aqui. Se fosse o contrário, em duas semanas
todo mundo teria nível alto e o número não compararia mais ninguém.

**O log de eventos é a verdade; o estado é derivado.** Nada de snapshot em
disco: `estado_do_agente` recalcula do zero a cada leitura. A fórmula vai mudar
quando os primeiros números aparecerem, e recalcular do log é o que faz mudar a
fórmula não apagar a história.

O escopo é o projeto: um agente que aprendeu diagramação num projeto
começa do zero em outro projeto, porque lá ele é outro agente.
"""
from __future__ import annotations

import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import regras

# ── Fórmula ───────────────────────────────────────────────────────────────────

# Base por tipo de evento. "revisao" e "decisao" existem para o agente que
# orienta em vez de produzir: sem elas, o Maestro ficaria eternamente no nível 1.
BASE_POR_TIPO = {
    "entrega":    60,
    "output":     25,
    "correcao":   20,
    "revisao":    15,
    "memoria":    15,
    "decisao":    10,
    "retrabalho":  0,
}
DIFICULDADE = {"baixa": 1.0, "media": 1.3, "alta": 1.7}
MULT_CONFIRMADO = 1.25
MULT_DESCOBERTA = 1.35     # primeira vez que o agente exercita aquela habilidade
# O teto é rede de segurança contra um evento absurdo, não parte do balanceamento:
# com 1,35 na descoberta, a primeira entrega difícil passa raspando por baixo dele.
TETO_POR_EVENTO = 180
# A partir do 4º evento da mesma habilidade no mesmo dia, ela rende metade:
# repetir a mesma coisa dez vezes num dia não é aprender dez vezes.
SATURACAO_DIARIA = 3
# O fator do trabalho repetido mora nas regras (xp.fator_saturado).

# Curvas. `xp_do_nivel(n) = base * n^expo` — o degrau fica mais caro a cada
# nível, então não há teto e ainda assim 40 entregas parecem diferentes de 4.
NIVEL_AGENTE = (100.0, 1.7)
NIVEL_SKILL = (40.0, 1.6)

# Promoção de broto a habilidade. Um termo dito uma vez e nunca mais não pode
# sujar a ficha para sempre.
EVENTOS_PARA_PROMOVER = 3
# Acima disso, dois nomes são considerados a mesma habilidade.
LIMIAR_SEMELHANCA = 0.82

TIPOS = tuple(BASE_POR_TIPO)


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ── Nomes de habilidade ───────────────────────────────────────────────────────

def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", (texto or "").strip().lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:60]


def _semelhanca(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def casar_habilidade(rotulo: str, conhecidas: dict) -> str | None:
    """Em qual habilidade já existente este nome cai — ou None se for nova.

    A cascata é: slug exato → apelido conhecido → semelhança alta. É ela que
    impede "diagramação SVG", "SVG diagrams" e "diagramar em svg" de virarem
    três habilidades que nunca sobem de nível.
    """
    s = slug(rotulo)
    if not s:
        return None
    if s in conhecidas:
        return s
    for chave, dados in conhecidas.items():
        if s in dados.get("aliases", []):
            return chave
    melhor, nota = None, 0.0
    for chave, dados in conhecidas.items():
        for candidato in [chave, *dados.get("aliases", [])]:
            r = _semelhanca(s, candidato)
            if r > nota:
                melhor, nota = chave, r
    return melhor if nota >= regras.valor("habilidades.limiar_fusao") else None


# ── Níveis ────────────────────────────────────────────────────────────────────

def nivel_de(xp: float, curva: tuple[float, float]) -> tuple[int, float, float, float]:
    """Devolve (nível, início do nível, início do próximo, fração percorrida)."""
    base, expo = curva
    n = 1 if xp < base else int((xp / base) ** (1.0 / expo))
    n = max(1, n)
    inicio = 0.0 if n == 1 else base * (n ** expo)
    fim = base * ((n + 1) ** expo)
    fracao = 0.0 if fim <= inicio else min(1.0, max(0.0, (xp - inicio) / (fim - inicio)))
    return n, inicio, fim, fracao


# ── Log ───────────────────────────────────────────────────────────────────────

def _dir(base: Path) -> Path:
    d = base / "progresso"
    d.mkdir(parents=True, exist_ok=True)
    return d


def caminho_log(base: Path) -> Path:
    return _dir(base) / "eventos.jsonl"


def ler_log(base: Path) -> list[dict]:
    p = caminho_log(base)
    if not p.exists():
        return []
    out = []
    for linha in p.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            out.append(json.loads(linha))
        except json.JSONDecodeError:
            continue          # uma linha corrompida não derruba a ficha inteira
    return out


def _anexar(base: Path, registro: dict) -> dict:
    with caminho_log(base).open("a", encoding="utf-8") as f:
        f.write(json.dumps(registro, ensure_ascii=False) + "\n")
    return registro


def registrar_evento(base: Path, dados: dict) -> dict:
    """Valida e grava um evento. O XP não vem daqui — vem da fórmula, na leitura."""
    tipo = str(dados.get("tipo") or "").strip()
    agente = str(dados.get("agente") or "").strip()
    if tipo not in regras.valor("xp.base_por_tipo"):
        raise ValueError(f"tipo inválido: {tipo!r}; use um de {', '.join(TIPOS)}")
    if not agente:
        raise ValueError("evento sem agente")

    ev = dados.get("evidencia") or {}
    registro = {
        "id": "evt_" + uuid.uuid4().hex[:12],
        "quando": dados.get("quando") or agora(),
        "registro": "evento",
        "agente": agente,
        "tipo": tipo,
        "despacho": (dados.get("despacho") or "").strip()[:200],
        "resumo": (dados.get("resumo") or "").strip()[:400],
        "habilidades": [str(h).strip()[:80] for h in (dados.get("habilidades") or []) if str(h).strip()][:8],
        # Quais aprendizados do projeto ele aplicou neste trabalho. É a única
        # medida honesta de que o loop serve para algo: conhecimento validado
        # que nunca é reusado não passou de anotação bonita.
        "aprendizados": [str(x).strip()[:40] for x in (dados.get("aprendizados") or []) if str(x).strip()][:8],
        "dificuldade": dados["dificuldade"] if dados.get("dificuldade") in regras.valor("xp.dificuldade") else "media",
        "evidencia": {
            "arquivos": [str(a)[:300] for a in (ev.get("arquivos") or [])][:40],
            "memorias": [str(m)[:300] for m in (ev.get("memorias") or [])][:40],
            "linhas": max(0, int(ev.get("linhas") or 0)),
            "commit": (str(ev.get("commit")) if ev.get("commit") else None),
            "url": (str(ev.get("url"))[:400] if ev.get("url") else None),
        },
    }
    return _anexar(base, registro)


def confirmar_evento(base: Path, evento_id: str, por: str) -> dict:
    """Confirmação é um registro NOVO, não uma edição.

    O log é append-only: reescrever um evento para marcá-lo confirmado destruiria
    a auditoria, que é justamente o que dá peso ao número.
    """
    ev = next((e for e in ler_log(base)
               if e.get("registro") == "evento" and e.get("id") == evento_id), None)
    if not ev:
        raise KeyError(evento_id)
    quem = (por or "").strip()
    # Ninguém confirma o próprio trabalho. Com o bônus de despacho cumprido,
    # autoconfirmação virou caminho para inflar XP — e confirmação que o próprio
    # autor assina não prova nada.
    if quem and quem == ev.get("agente"):
        raise PermissionError("ninguém confirma o próprio trabalho")
    if regras.valor("xp.confirmacao_so_do_dono") and quem not in ("usuario", ""):
        raise PermissionError(
            "só você confirma entrega — a regra está em Configurações › XP e níveis")
    return _anexar(base, {"id": "cfm_" + uuid.uuid4().hex[:12], "quando": agora(),
                          "registro": "confirmacao", "evento": evento_id,
                          "por": (por or "").strip()[:120]})


def registrar_marco(base: Path, agente: str, habilidade: str, texto: str,
                    nivel: int = 0) -> dict:
    """O que o agente aprendeu ao subir de nível numa habilidade.

    Não substitui a descrição: a descrição diz o que a habilidade é, e é a mesma
    para todo mundo; o marco diz o que MUDOU para aquele agente, e é dele. Um
    sobre "diagramação SVG" pode ser "aprendi que fundo transparente exige
    contraste próprio" — inútil como definição, precioso como história.
    """
    return _anexar(base, {"id": "mrc_" + uuid.uuid4().hex[:12], "quando": agora(),
                          "registro": "marco", "agente": agente.strip()[:120],
                          "habilidade": slug(habilidade), "nivel": int(nivel or 0),
                          "texto": str(texto).strip()[:600]})


def destruir_habilidade(base: Path, chave: str, por: str = "usuario") -> dict:
    """Registra que a habilidade foi destruída — e por isso não volta.

    Sem isto ela ressuscitaria: o repertório é reconstruído a partir do log, e os
    eventos antigos continuam citando o nome. A lápide diz ao recálculo para
    ignorá-lo. Os eventos ficam: o trabalho aconteceu, e o XP do agente continua
    sendo dele. Some só a habilidade.
    """
    return _anexar(base, {"id": "dst_" + uuid.uuid4().hex[:12], "quando": agora(),
                          "registro": "destruicao", "habilidade": slug(chave), "por": por[:120]})


def destruidas(base: Path) -> set[str]:
    return {r.get("habilidade") for r in ler_log(base) if r.get("registro") == "destruicao"}


def fundir_habilidades(base: Path, de: list[str], para: str, rotulo: str = "") -> dict:
    """Funde habilidades — resultado de uma consolidação aprovada.

    Também é um registro no log, e por isso a fusão vale retroativamente: o
    recálculo passa a somar tudo na habilidade de destino.
    """
    return _anexar(base, {"id": "fus_" + uuid.uuid4().hex[:12], "quando": agora(),
                          "registro": "fusao",
                          "de": [slug(d) for d in de if slug(d)],
                          "para": slug(para), "rotulo": rotulo.strip()[:80]})


# ── Estado ────────────────────────────────────────────────────────────────────

def _xp_do_evento(ev: dict, confirmado: bool, descoberta: bool,
                  despacho_cumprido: bool = False) -> float:
    # Tudo aqui vem do registro de regras: o que o painel mostra é o que conta.
    base = regras.valor("xp.base_por_tipo").get(ev["tipo"], 0)
    if base == 0:
        return 0.0
    e = ev.get("evidencia") or {}
    # A evidência pesa, mas com retorno decrescente e teto: volume não pode ser
    # o caminho fácil para subir de nível.
    volume = 1.0 + min(0.5,
                       (e.get("linhas") or 0) / 1200.0
                       + len(e.get("arquivos") or []) * 0.04
                       + len(e.get("memorias") or []) * 0.06)
    xp = base * regras.valor("xp.dificuldade").get(ev.get("dificuldade", "media"), 1.3) * volume
    if confirmado:
        xp *= regras.valor("xp.mult_confirmado")
    if descoberta:
        xp *= regras.valor("xp.mult_descoberta")
    # Coordenar bem é o despacho virar entrega confirmada. Quem só distribui
    # tarefa fica com a base, que é baixa de propósito.
    if despacho_cumprido:
        xp *= regras.valor("xp.mult_despacho_cumprido")
    return min(regras.valor("xp.teto_por_evento"), xp)


def _dia(iso: str) -> str:
    return (iso or "")[:10]


def estado_do_projeto(base: Path, indice: dict | None = None,
                      firmadas: set[str] | None = None) -> dict:
    """Recalcula a ficha de todos os agentes a partir do log.

    `indice` é o mapa apelido → id canônico do repertório. Com ele, dois agentes
    que escreveram o mesmo nome de formas diferentes caem na MESMA habilidade —
    sem ele, o casamento acontece só dentro de cada agente, e a mesma competência
    vira duas coisas que nunca se encontram.
    """
    indice = indice or {}
    mortas = destruidas(base)
    # Quem decide se um nome já é habilidade é o PROJETO, no repertório: três
    # eventos, por quem for. Sem isto, a mesma palavra teria duas contas — uma
    # no card do agente e outra na página de habilidades.
    firmadas = firmadas if firmadas is not None else None
    eventos = ler_log(base)
    confirmados = {r["evento"]: r.get("por") for r in eventos if r.get("registro") == "confirmacao"}
    # Quem despachou e quem executou se encontram pelo NOME do despacho: o
    # executor já o cita ao registrar (`--despacho`), e é assim que o XP de
    # quem coordena passa a depender do resultado de quem fez.
    despachos_cumpridos = {
        (e.get("despacho") or "").strip().lower()
        for e in eventos
        if e.get("registro") == "evento" and e["id"] in confirmados
        and e.get("tipo") not in ("despacho", "resposta", "consolidacao")
        and (e.get("despacho") or "").strip()
    }
    despachos_cumpridos.discard("")
    fusoes: dict[str, str] = {}
    rotulos_fundidos: dict[str, str] = {}
    for r in eventos:
        if r.get("registro") != "fusao":
            continue
        for d in r.get("de", []):
            fusoes[d] = r["para"]
        if r.get("rotulo"):
            rotulos_fundidos[r["para"]] = r["rotulo"]

    def destino(s: str) -> str:
        visto = set()
        while s in fusoes and s not in visto:
            visto.add(s)
            s = fusoes[s]
        return s

    marcos: dict[tuple, list] = {}
    for r in eventos:
        if r.get("registro") == "marco":
            marcos.setdefault((r.get("agente"), r.get("habilidade")), []).append(
                {"quando": r.get("quando"), "nivel": r.get("nivel"), "texto": r.get("texto")})

    agentes: dict[str, dict] = {}
    por_dia: dict[tuple, int] = {}

    for ev in sorted((e for e in eventos if e.get("registro") == "evento"),
                     key=lambda e: e.get("quando") or ""):
        nome = ev["agente"]
        a = agentes.setdefault(nome, {"agente": nome, "xp": 0.0, "eventos": 0,
                                      "habilidades": {}, "historico": [],
                                      "primeira": ev.get("quando"), "ultima": None})
        hab = a["habilidades"]

        # Casa cada nome declarado: primeiro pelo repertório do projeto, depois
        # pelo que o próprio agente já tem, por último abre habilidade nova.
        alvos: list[tuple[str, str, bool]] = []   # (chave, rótulo, é descoberta)
        for rotulo in ev.get("habilidades", []):
            s_rot = slug(rotulo)
            chave = destino(indice.get(s_rot) or casar_habilidade(rotulo, hab) or s_rot)
            if not chave or chave in mortas or s_rot in mortas:
                continue
            nova = chave not in hab
            if nova:
                hab[chave] = {"rotulo": rotulo, "xp": 0.0, "eventos": 0, "aliases": [],
                              "primeira": ev.get("quando"), "ultima": None}
            elif s_rot != chave and s_rot not in hab[chave]["aliases"]:
                hab[chave]["aliases"].append(s_rot)
            alvos.append((chave, rotulo, nova))

        descoberta = any(nova for _, _, nova in alvos)
        # O despacho de quem coordena vale mais quando virou entrega confirmada.
        cumprido = (ev.get("tipo") == "despacho"
                    and (ev.get("despacho") or "").strip().lower() in despachos_cumpridos)
        xp = _xp_do_evento(ev, ev["id"] in confirmados, descoberta, cumprido)

        a["xp"] += xp
        a["eventos"] += 1
        a["ultima"] = ev.get("quando")

        # O XP do evento é repartido entre as habilidades exercitadas. A curva
        # delas é mais barata, então elas sobem antes do agente — e é isso que
        # faz a ficha contar em que ele é bom, não só o quanto trabalhou.
        if alvos:
            fatia = xp / len(alvos)
            for chave, _, _ in alvos:
                k = (nome, chave, _dia(ev.get("quando", "")))
                por_dia[k] = por_dia.get(k, 0) + 1
                f = (regras.valor("xp.fator_saturado")
                     if por_dia[k] > regras.valor("xp.saturacao_diaria") else 1.0)
                h = hab[chave]
                h["xp"] += fatia * f
                h["eventos"] += 1
                h["ultima"] = ev.get("quando")

        a["historico"].append({
            "id": ev["id"], "quando": ev.get("quando"), "tipo": ev["tipo"],
            "despacho": ev.get("despacho"), "resumo": ev.get("resumo"),
            "habilidades": [c for c, _, _ in alvos], "xp": round(xp, 1),
            "confirmado_por": confirmados.get(ev["id"]),
        })

    # Fechamento: níveis, promoção de brotos e ordenação.
    for a in agentes.values():
        n, ini, fim, frac = nivel_de(a["xp"], tuple(regras.valor("xp.curva_agente")))
        a.update(xp=round(a["xp"], 1), nivel=n, inicio_nivel=round(ini),
                 proximo_nivel=round(fim), progresso=round(frac, 3))
        habilidades, brotos = {}, {}
        for chave, h in a["habilidades"].items():
            h["marcos"] = marcos.get((a["agente"], chave), [])
            hn, hini, hfim, hfrac = nivel_de(h["xp"], tuple(regras.valor("xp.curva_skill")))
            h.update(xp=round(h["xp"], 1), nivel=hn, inicio_nivel=round(hini),
                     proximo_nivel=round(hfim), progresso=round(hfrac, 3),
                     rotulo=rotulos_fundidos.get(chave, h["rotulo"]))
            h["marcos"] = marcos.get((a["agente"], chave), [])
            if not regras.valor("habilidades.usar_firmar"):
                firme = True
            elif firmadas is not None:
                firme = chave in firmadas
            else:
                firme = h["eventos"] >= regras.valor("habilidades.eventos_para_firmar")
            (habilidades if firme else brotos)[chave] = h
        a["habilidades"] = dict(sorted(habilidades.items(),
                                       key=lambda kv: (-kv[1]["xp"], kv[0])))
        a["brotos"] = dict(sorted(brotos.items(), key=lambda kv: (-kv[1]["xp"], kv[0])))
        a["historico"] = a["historico"][-40:][::-1]
        a["topo"] = [{"chave": k, **v} for k, v in list(a["habilidades"].items())[:3]]

    return {"agentes": dict(sorted(agentes.items(), key=lambda kv: -kv[1]["xp"])),
            "eventos": sum(1 for e in eventos if e.get("registro") == "evento")}


# ── Aptidão ───────────────────────────────────────────────────────────────────

def _recencia(ultima: str | None) -> float:
    """Habilidade não desaprende — mas a mais recente conta mais na escolha."""
    if not ultima:
        return 0.7
    try:
        dias = (datetime.now(timezone.utc) - datetime.fromisoformat(ultima)).days
    except ValueError:
        return 0.7
    return 1.0 if dias <= 30 else (0.85 if dias <= 90 else 0.7)


def aptidao(base: Path, desejadas: list[str]) -> list[dict]:
    """Ranqueia os agentes para um despacho. É o pagamento de todo o sistema.

    Sem isto, XP é vitrine; com isto, "quem está mais apto" vira uma pergunta
    com resposta.
    """
    estado = estado_do_projeto(base)
    alvos = [slug(d) for d in desejadas if slug(d)]
    saida = []
    for nome, a in estado["agentes"].items():
        tudo = {**a["habilidades"], **a["brotos"]}
        nota, casadas, faltando = 0.0, [], []
        for alvo in alvos:
            chave = alvo if alvo in tudo else casar_habilidade(alvo, tudo)
            if not chave:
                faltando.append(alvo)
                continue
            h = tudo[chave]
            # Brotos contam menos: poucos eventos ainda não são competência.
            peso = 1.0 if (not regras.valor("habilidades.usar_firmar")
                           or h["eventos"] >= regras.valor("habilidades.eventos_para_firmar")) else 0.45
            nota += (h["nivel"] + h["progresso"]) * peso * _recencia(h.get("ultima"))
            casadas.append({"chave": chave, "rotulo": h["rotulo"], "nivel": h["nivel"],
                            "broto": peso < 1.0})
        saida.append({"agente": nome, "nota": round(nota, 2), "nivel": a["nivel"],
                      "cobre": casadas, "falta": faltando})
    return sorted(saida, key=lambda r: (-r["nota"], r["agente"]))
