"""O loop de aprendizado: observação → hipótese → pergunta → validação → aprendizado.

Por que isto existe: o Noctis tinha memória e não tinha aprendizado. O agente
registrava o trabalho, e o que ele descobria fazendo morria ali — ou pior, virava
uma "habilidade" com nome de arquivo do projeto. Memória guarda o que aconteceu;
aprendizado generaliza o que volta a servir, e generalizar sozinho é chute.

A divisão de trabalho é a que ele cravou em 18/09 e vale como lei aqui:

    agente   observa e PROPÕE hipótese. Nunca cria habilidade, nunca conclui.
    pessoa   responde a pergunta. O aprendizado nasce da resposta dela.
    NOCTURN  junta, mede confiança e escolhe a pergunta que vale perguntar.

Tudo vive no mesmo `progresso/eventos.jsonl`, append-only, com quatro registros
novos — `observacao`, `hipotese`, `resposta`, `aprendizado`. Nada é reescrito:
uma hipótese refutada continua no log, porque saber o que NÃO era é parte do que
se aprendeu. O estado é sempre recalculado na leitura, como no resto do sistema.

Qualquer habilidade aprende. Já houve aqui uma divisão entre "procedimento" e
"domínio", e ela caiu no dia em que ele disse "poderia ser os dois": o mesmo
trabalho tem passo a passo E sensibilidade que só se apura com o caso concreto.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import progresso as prog
import regras
import enquadramento as enq
import repertorio as rep

# Os tipos de pergunta. A escolha do tipo é do agente que propõe, e ela muda o
# quanto se aprende: "você gostou?" não reduz incerteza nenhuma, enquanto "o que
# mais pesou?" com quatro opções separa as causas concorrentes.
TIPOS_PERGUNTA = {
    "bool":    {"label": "Sim ou não", "desc": "confirma ou nega a hipótese inteira"},
    "escolha": {"label": "Uma escolha", "desc": "qual causa pesou mais, entre as candidatas"},
    "multi":   {"label": "Várias escolhas", "desc": "quais fatores contribuíram"},
    "escala":  {"label": "Escala", "desc": "quanto, de 1 a 7"},
}

# O veredito da pessoa. `invalida` é o que salva o sistema de aprender errado com
# elegância: a resposta certa para uma pergunta mal feita não é sim nem não, e
# sem esta saída o agente registraria uma causa falsa com confiança alta.
VEREDITOS = ("confirma", "refuta", "corrige", "invalida")

ESCOPOS = ("agente", "projeto", "global")


def _lim(x: float, a: float, b: float) -> float:
    return max(a, min(b, x))


# ── Escrita ───────────────────────────────────────────────────────────────────

def registrar_observacao(base: Path, dados: dict) -> dict:
    """O que o agente viu, sem conclusão nenhuma.

    Observação é matéria-prima: "a versão recusada tinha simetria alta e nenhuma
    presença humana". Ela não afirma relação — quem afirma é a hipótese, e é por
    isso que as duas são registros diferentes.
    """
    skill = prog.slug(str(dados.get("skill") or ""))
    texto = str(dados.get("texto") or "").strip()
    if not skill:
        raise ValueError("observação sem habilidade: diga de qual domínio ela é")
    if not texto:
        raise ValueError("observação sem texto")
    if skill not in rep.carregar(base):
        raise KeyError(skill)
    return prog._anexar(base, {
        "id": "obs_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "observacao", "skill": skill,
        "agente": str(dados.get("agente") or "").strip()[:120],
        "texto": texto[:600],
        "contexto": str(dados.get("contexto") or "").strip()[:300],
        "evento": (str(dados.get("evento"))[:40] if dados.get("evento") else None),
    })


def propor_hipotese(base: Path, dados: dict) -> dict:
    """A generalização candidata, com a pergunta que a resolveria.

    Duas exigências, e as duas são sobre honestidade: a hipótese precisa apontar
    as observações que a sugeriram, e precisa vir com a pergunta que a confirma
    ou derruba. Hipótese sem pergunta é opinião; com pergunta, é trabalho.
    """
    skill = prog.slug(str(dados.get("skill") or ""))
    texto = str(dados.get("texto") or "").strip()
    if not texto:
        raise ValueError("hipótese sem afirmação")
    if skill not in rep.carregar(base):
        raise KeyError(skill)

    p = dados.get("pergunta") or {}
    tipo = str(p.get("tipo") or "bool")
    if tipo not in TIPOS_PERGUNTA:
        raise ValueError(f"tipo de pergunta inválido: {tipo!r}")
    ptexto = str(p.get("texto") or "").strip()
    if not ptexto:
        raise ValueError("hipótese sem pergunta: diga o que perguntar para resolvê-la")
    opcoes = [str(o).strip()[:120] for o in (p.get("opcoes") or []) if str(o).strip()][:8]
    if tipo in ("escolha", "multi") and len(opcoes) < 2:
        raise ValueError("pergunta de escolha precisa de pelo menos duas opções")

    evid = [str(e)[:40] for e in (dados.get("evidencias") or [])][:20]
    minimo = regras.valor("aprendizado.evidencias_minimas")
    if len(evid) < minimo:
        raise ValueError(
            f"hipótese com {len(evid)} evidência(s): o mínimo é {minimo}. "
            "Registre as observações antes de generalizar.")

    return prog._anexar(base, {
        "id": "hip_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "hipotese", "skill": skill,
        "agente": str(dados.get("agente") or "").strip()[:120],
        "texto": texto[:400],
        "evidencias": evid,
        "pergunta": {"tipo": tipo, "texto": ptexto[:300], "opcoes": opcoes},
    })


def responder(base: Path, hipotese_id: str, dados: dict) -> dict:
    """A resposta da pessoa — e, quando ela confirma ou corrige, o aprendizado.

    O aprendizado NÃO é a hipótese aprovada: é o texto que a pessoa validou.
    Em `corrige` ela reescreve, e é a versão dela que fica. Foi o caso do
    exemplo do documento: o agente achou que era a simetria, e a causa era a
    hierarquia. Aprender a hipótese ali teria ensinado a coisa errada.
    """
    hip = next((h for h in ler_hipoteses_cruas(base) if h["id"] == hipotese_id), None)
    if not hip:
        raise KeyError(hipotese_id)
    veredito = str(dados.get("veredito") or "").strip()
    if veredito not in VEREDITOS:
        raise ValueError(f"veredito inválido: use um de {', '.join(VEREDITOS)}")

    por = str(dados.get("por") or "usuario").strip()[:120]
    resp = prog._anexar(base, {
        "id": "rsp_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "resposta", "hipotese": hipotese_id, "skill": hip["skill"],
        "veredito": veredito, "por": por,
        "escolhas": [str(e)[:120] for e in (dados.get("escolhas") or [])][:8],
        "escala": (int(dados["escala"]) if str(dados.get("escala") or "").strip().isdigit() else None),
        "texto": str(dados.get("texto") or "").strip()[:600],
    })

    aprendizado = None
    if veredito in ("confirma", "corrige"):
        # Corrigir é ESCOLHER a causa certa entre as opções da pergunta, e não
        # redigir. O aprendizado se monta da escolha: assim duas correções sobre
        # a mesma causa viram o mesmo dado, e não duas frases parecidas.
        if veredito == "corrige" and resp["escolhas"]:
            causa = ", ".join(resp["escolhas"])
            texto = f"{hip['pergunta']['texto']} → {causa}"
        else:
            texto = (resp["texto"] if veredito == "corrige" and resp["texto"] else hip["texto"])
        aprendizado = _gravar_aprendizado(base, hip["skill"], texto, hipotese_id,
                                          str(dados.get("escopo") or "projeto"), por)
    return {"resposta": resp, "aprendizado": aprendizado}


def _gravar_aprendizado(base: Path, skill: str, texto: str, de_hipotese: str,
                        escopo: str, por: str) -> dict:
    return prog._anexar(base, {
        "id": "apr_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "aprendizado", "skill": skill, "texto": texto[:600],
        "de_hipotese": de_hipotese, "por": por,
        "escopo": escopo if escopo in ESCOPOS else "projeto",
    })


def escrever_aprendizado(base: Path, dados: dict) -> dict:
    """A pessoa escrevendo direto, sem hipótese nenhuma no caminho.

    Conhecimento explícito dela tem precedência sobre inferência do sistema —
    então ela não precisa esperar um agente adivinhar para ensinar algo.
    """
    skill = prog.slug(str(dados.get("skill") or ""))
    texto = str(dados.get("texto") or "").strip()
    if not texto:
        raise ValueError("aprendizado sem texto")
    if skill not in rep.carregar(base):
        raise KeyError(skill)
    return _gravar_aprendizado(base, skill, texto, "", str(dados.get("escopo") or "projeto"),
                               str(dados.get("por") or "usuario"))


def aposentar_aprendizado(base: Path, apr_id: str, por: str = "usuario") -> dict:
    """Preferência muda, e aprendizado velho passa a atrapalhar.

    Aposentar é outro registro, não uma remoção: o histórico de que aquilo já
    valeu explica decisões antigas do projeto.
    """
    if not any(a["id"] == apr_id for a in ler_aprendizados_crus(base)):
        raise KeyError(apr_id)
    return prog._anexar(base, {
        "id": "apo_" + uuid.uuid4().hex[:12], "quando": prog.agora(),
        "registro": "aposentadoria", "aprendizado": apr_id, "por": por[:120]})


# ── Leitura ───────────────────────────────────────────────────────────────────

def ler_hipoteses_cruas(base: Path) -> list[dict]:
    return [r for r in prog.ler_log(base) if r.get("registro") == "hipotese"]


def ler_aprendizados_crus(base: Path) -> list[dict]:
    return [r for r in prog.ler_log(base) if r.get("registro") == "aprendizado"]


def confianca(evidencias: int, confirmacoes: int, refutacoes: int) -> float:
    """Quanto se pode contar com esta hipótese, entre 0 e 1.

    Deliberadamente simples e legível: evidência conta pouco (ver junto não é
    causa), confirmação conta muito e refutação conta mais ainda — derrubar é
    mais informativo do que sustentar, e o sistema deve desconfiar rápido.
    Nunca chega a 1: nada aqui é verdade, só probabilidade.
    """
    return round(_lim(0.20 + 0.06 * min(evidencias, 6)
                      + 0.20 * confirmacoes - 0.30 * refutacoes, 0.02, 0.95), 2)


def estado(base: Path) -> dict:
    """Tudo do loop, recalculado: observações, hipóteses com confiança e aprendizados."""
    log = prog.ler_log(base)
    obs = [r for r in log if r.get("registro") == "observacao"]
    respostas = [r for r in log if r.get("registro") == "resposta"]
    aposentados = {r.get("aprendizado") for r in log if r.get("registro") == "aposentadoria"}
    destruidas = prog.destruidas(base)
    porObs = {o["id"]: o for o in obs}

    hipoteses = []
    for h in ler_hipoteses_cruas(base):
        if h.get("skill") in destruidas:
            continue
        minhas = [r for r in respostas if r.get("hipotese") == h["id"]]
        conf = sum(1 for r in minhas if r["veredito"] == "confirma")
        ref = sum(1 for r in minhas if r["veredito"] == "refuta")
        invalida = any(r["veredito"] == "invalida" for r in minhas)
        corrigida = any(r["veredito"] == "corrige" for r in minhas)
        hipoteses.append({
            **h,
            "confianca": confianca(len(h.get("evidencias") or []), conf, ref),
            "confirmacoes": conf, "refutacoes": ref,
            "invalida": invalida, "corrigida": corrigida,
            # Pendente é o que ainda vale perguntar: ninguém respondeu, e a
            # pergunta não foi declarada mal feita.
            "pendente": not minhas,
            "respostas": minhas,
            "observacoes": [porObs[e] for e in (h.get("evidencias") or []) if e in porObs],
        })

    # Reuso: quantos eventos declararam ter aplicado cada aprendizado. É a
    # métrica do §48.2 do documento, e a única que diz se o loop valeu a pena.
    reusos: dict[str, list[dict]] = {}
    for e in log:
        if e.get("registro") != "evento":
            continue
        for aid in (e.get("aprendizados") or []):
            reusos.setdefault(aid, []).append(
                {"evento": e["id"], "agente": e.get("agente"), "quando": e.get("quando")})

    limiar = regras.valor("aprendizado.confianca_para_promover")
    porHip = {h["id"]: h for h in hipoteses}
    aprendizados = []
    for a in ler_aprendizados_crus(base):
        if a.get("skill") in destruidas:
            continue
        h = porHip.get(a.get("de_hipotese") or "")
        # Escrito por você não é frágil: conhecimento explícito seu tem
        # precedência sobre inferência do sistema.
        conf = h["confianca"] if h else 1.0
        aprendizados.append({**a, "aposentado": a["id"] in aposentados,
                             "confianca": conf, "fragil": conf < limiar,
                             "usos": reusos.get(a["id"], [])})

    hipoteses.sort(key=lambda h: (not h["pendente"], -h["confianca"], h.get("quando") or ""))
    aprendizados.sort(key=lambda a: (a["aposentado"], a.get("quando") or ""), reverse=False)
    return {
        "observacoes": sorted(obs, key=lambda o: o.get("quando") or "", reverse=True),
        "hipoteses": hipoteses,
        "aprendizados": aprendizados,
        "tiposPergunta": TIPOS_PERGUNTA,
        "vereditos": list(VEREDITOS),
        "escopos": list(ESCOPOS),
        "promoverEm": regras.valor("aprendizado.confianca_para_promover"),
        "evidenciasMinimas": regras.valor("aprendizado.evidencias_minimas"),
    }


def inbox(base: Path) -> list[dict]:
    """As perguntas que esperam você, mais valiosas primeiro.

    A ordem é por incerteza: hipótese perto de 0,5 é a que mais ensina quando
    respondida — perguntar o que já está quase certo gasta a sua atenção, que é
    o recurso mais caro do sistema.
    """
    pend = [h for h in estado(base)["hipoteses"] if h["pendente"] and not h["invalida"]]
    pend.sort(key=lambda h: abs(h["confianca"] - 0.5))
    for h in pend:
        h.setdefault("tipo_fila", "hipotese")
    # Descobrir o que uma habilidade É vem antes de julgar palpite sobre ela:
    # sem o enquadramento, o agente nem sabe o que consultar.
    return enq.perguntas(base) + pend


def do_skill(base: Path, chave: str) -> dict:
    """O recorte de um domínio: o que se observou, o que se supõe, o que se sabe."""
    e = estado(base)
    return {
        "observacoes": [o for o in e["observacoes"] if o.get("skill") == chave],
        "hipoteses": [h for h in e["hipoteses"] if h.get("skill") == chave],
        "aprendizados": [a for a in e["aprendizados"] if a.get("skill") == chave],
    }


def para_o_protocolo(base: Path, skills: list[str], limite: int = 6) -> list[dict]:
    """Os aprendizados que o agente recebe — por referência, curtos e vivos.

    Contexto que viaja inteiro a cada despacho é o desperdício que o Noctis
    existe para evitar: aqui vai id e uma linha, e o corpo se busca quando
    interessa.
    """
    e = estado(base)
    vivos = [a for a in e["aprendizados"] if not a["aposentado"] and a.get("skill") in skills]
    vivos.sort(key=lambda a: a.get("quando") or "", reverse=True)
    return [{"id": a["id"], "skill": a["skill"], "texto": a["texto"]} for a in vivos[:limite]]
