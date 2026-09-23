#!/usr/bin/env python
"""Teste de fumaça do Noctis. Sem dependências, roda em segundos.

    python tools/fumaca.py

Existe por causa de quatro coisas que quebraram e passaram batido:

  · uma remoção levou junto ~200 linhas de funções centrais, e `import main`
    passou limpo — Python só resolve nome na hora da chamada;
  · uma aba salva com id de página antigo derrubava a tela inteira;
  · o renderizador de Markdown entrava em laço infinito numa linha de tabela
    solta, e congelava a aba;
  · gerar o bloco de protocolo por agente fez a listagem ir a 1,3 s.

Nenhuma delas precisava de teste sofisticado. Todas precisavam de ALGUÉM
bater nas rotas e olhar o relógio.

Não substitui teste de verdade. É o mínimo que impede um estrago silencioso.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "studio" / "api"))

FALHAS: list[str] = []
LENTAS: list[tuple[float, str]] = []
# Acima disto, algo está sendo recalculado por item em vez de uma vez só.
LIMITE_MS = 700


def falha(o_que: str) -> None:
    FALHAS.append(o_que)
    print(f"   FALHOU  {o_que}")


def main() -> int:
    t0 = time.perf_counter()
    import main as app_main                                    # noqa: E402
    from fastapi.testclient import TestClient                  # noqa: E402
    c = TestClient(app_main.app)
    print(f"1. a API sobe ............................. {(time.perf_counter()-t0)*1000:.0f} ms")

    # 2. Toda rota GET responde, e nenhuma explode. É o teste que teria pego a
    #    remoção grande: `import` passa, a chamada é que descobre.
    subs = {"{project}": "noctis", "{name}": "pen_dev", "{agente}": "pen_dev",
            "{slug}": "pen_dev", "{chave}": "x", "{kind}": "agent",
            "{rid}": "protocolo.registrar_trabalho", "{item}": "x",
            "{canvas_id}": "principal", "{lane_id}": "x", "{filename}": "x",
            "{hid}": "x", "{pid}": "x", "{tid}": "x"}
    rotas = sorted({r.path for r in app_main.app.routes
                    if getattr(r, "path", "").startswith("/api")
                    and "GET" in getattr(r, "methods", set())})
    ok = 0
    for r in rotas:
        u = r
        for k, v in subs.items():
            u = u.replace(k, v)
        if "{" in u:
            continue
        try:
            t = time.perf_counter()
            x = c.get(u)
            ms = (time.perf_counter() - t) * 1000
        except Exception as e:
            falha(f"{u} estourou: {type(e).__name__}: {e}")
            continue
        if x.status_code >= 500:
            falha(f"{u} devolveu {x.status_code}")
        else:
            ok += 1
            if ms > LIMITE_MS and "export/pdf" not in u:
                LENTAS.append((ms, u))
    print(f"2. {ok} rotas GET responderam sem 500 ....... {len(FALHAS)} falha(s)")

    # 3. O agente resolvido tem cabeça. Um acoplamento lido cru viria sem
    #    prompt e sem descrição, e o sintoma seria silencioso.
    d = c.get("/api/projects/noctis/agents/pen_dev/ficha")
    if d.status_code != 200:
        falha("a ficha do agente não abre")
    else:
        f = d.json()
        for campo in ("identificador", "nickname"):
            if not f.get(campo):
                falha(f"a ficha veio sem {campo}")
        if not str((f.get("herdado") or {}).get("system_prompt") or
                   (f.get("daqui") or {}).get("system_prompt") or ""):
            falha("o agente resolvido veio sem system_prompt")
        print("3. o agente resolvido tem identificador, nickname e prompt")

    # 4. Todo agente entrega protocolo. Já houve três sem, e ninguém viu.
    sem = []
    for p in c.get("/api/projects").json():
        for a in c.get(f"/api/projects/{p['slug']}/agents").json():
            sp = str(c.get(f"/api/projects/{p['slug']}/agents/{a['name']}")
                     .json().get("system_prompt") or "")
            if "## Protocolo do Noctis" not in sp:
                sem.append(f"{p['slug']}:{a['name']}")
    if sem:
        falha(f"{len(sem)} agente(s) sem protocolo: {', '.join(sem[:4])}")
    else:
        print("4. todo agente entrega o bloco de protocolo")

    # 5. Nickname não repete. É a única promessa que ele faz.
    n = c.get("/api/nicknames").json()
    nomes = [x["nickname"].lower() for x in n["nicknames"]]
    if len(nomes) != len(set(nomes)):
        falha("há nicknames repetidos")
    else:
        print(f"5. {n['usados']} nicknames, nenhum repetido")

    # 6. Arquétipo não cita projeto. A regra que sustenta o modelo inteiro.
    #
    # A comparação é com o SLUG e com o NOME COMPLETO, nunca com o primeiro
    # pedaço deles. A primeira versão fazia isso e acusou 14 arquétipos no dia
    # em que nasceu um projeto chamado `marketing_machine`: "marketing" está em
    # "frente de Marketing", que é vocabulário de domínio, não nome de projeto.
    # Alarme que toca sozinho toda semana é alarme que se aprende a ignorar.
    alvos = []
    for p in c.get("/api/projects").json():
        alvos.append(p["slug"].lower())
        nome = str(p.get("displayName") or "").strip().lower()
        if len(nome) > 3:
            alvos.append(nome)

    corpos = {}
    for a in c.get("/api/arquetipos").json()["arquetipos"]:
        corpos[a["slug"]] = str(c.get(f"/api/arquetipos/{a['slug']}").json()["arquetipo"]).lower()

    # Um termo que aparece em QUASE TODO arquétipo é vocabulário, não nome de
    # projeto — foi o caso de "projeto", que é slug de um projeto e também está
    # em "o contexto do projeto", que o protocolo escreve em todos. Deixar o
    # próprio corpus decidir evita uma lista de exceções que envelhece sozinha.
    # Segunda fonte, e a decisiva: o que o PRÓPRIO sistema escreve em todo
    # prompt. O bloco de protocolo diz "o contexto do projeto" — então
    # "projeto", que por acaso também é o slug de um projeto, é palavra da
    # casa. Um slug que é palavra comum não dá para distinguir por texto, e
    # fingir que dá produziria um alarme permanente.
    try:
        sys.path.insert(0, str(RAIZ / "tools" / "xp"))
        import instalar_protocolo as _ip
        neutro = _ip.bloco_para("__x__", "__y__").lower()
    except Exception:
        neutro = ""

    n = max(1, len(corpos))
    vocabulario = {t for t in alvos
                   if t in neutro
                   or sum(1 for c_ in corpos.values() if t in c_) > n * 0.4}

    sujos = []
    for slug, texto in corpos.items():
        achado = next((t for t in alvos if t not in vocabulario and t in texto), None)
        if achado:
            sujos.append(f"{slug} cita '{achado}'")
    if sujos:
        falha(f"{len(sujos)} arquétipo(s) citando projeto: {sujos[0]}")
    else:
        print("6. nenhum arquétipo nomeia projeto")

    if LENTAS:
        print(f"\n   LENTAS (> {LIMITE_MS} ms):")
        for ms, u in sorted(LENTAS, reverse=True)[:5]:
            print(f"      {ms:6.0f} ms  {u}")

    print()
    if FALHAS:
        print(f"FUMAÇA: {len(FALHAS)} falha(s).")
        return 1
    print(f"FUMAÇA: tudo de pé ({(time.perf_counter()-t0):.1f}s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
