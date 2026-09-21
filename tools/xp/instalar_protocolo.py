#!/usr/bin/env python
"""Instala (ou remove) o protocolo de fechamento no system_prompt dos agentes.

    python tools/xp/instalar_protocolo.py <projeto> [--remover] [--seco]

O bloco é o MESMO para todo agente, de todo projeto — com ou sem orquestrador.
Nenhuma linha supõe um Maestro: quem consulta ao começar é o próprio agente, e a
linha de delegação vale para qualquer um que passe trabalho adiante.

Ele é curto de propósito: entra no prompt de TODO despacho, então cada linha
custa contexto para sempre. O `--help` do CLI guarda o resto.

A edição é feita no TEXTO, não relendo e regravando o YAML: `yaml.dump` reflui o
arquivo inteiro e destrói os blocos literais `|` que guardam os prompts.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
MARCA = "[noctis-xp]"

# O texto do bloco é MONTADO a partir das regras do Noctis (config/regras.json):
# desligar "declarar habilidades" no painel tira as linhas daqui, e o instalador
# reescreve o bloco de todo agente. O que o agente lê é sempre o que está valendo.
sys.path.insert(0, str(RAIZ / "studio" / "api"))
import regras as _regras  # noqa: E402
import organizacao as _org  # noqa: E402

_regras.configurar(RAIZ)


def _papel(projeto: str, agente: str) -> str:
    """O papel do agente na organização — maestro, lider ou agente.

    O bloco continua o mesmo para todos no essencial; o que muda é que quem
    coordena ganha as linhas do trabalho DELE. Sem isso, Maestro e líder não
    tinham como registrar nada e ficavam no nível 1 para sempre, como se
    coordenar não fosse trabalho.
    """
    try:
        base = RAIZ / "projects" / projeto
        return next((a["papel"] for a in _org._agentes(base) if a["nome"] == agente), "agente")
    except Exception:
        return "agente"


def bloco_para(projeto: str, agente: str) -> str:
    v = _regras.valor
    cmd = f"`python tools/xp/xp.py {projeto} {agente}`"
    linhas = [f"## Protocolo do Noctis {MARCA}", f"Do diretório {RAIZ}, com {cmd}:"]
    if v("protocolo.consultar_ao_comecar"):
        linhas.append('- Ao começar: --consultar "assunto da tarefa" — leia o que o projeto já aprendeu, armadilhas primeiro.')
        linhas.append('- Ao delegar: cole no pedido a saída de --briefing "assunto".')
    if v("protocolo.registrar_trabalho"):
        tipos = ", ".join(k for k in v("xp.base_por_tipo") if k != "retrabalho")
        if v("protocolo.declarar_habilidades"):
            linhas.append('- Ao terminar: <tipo> "o que fez" -s "habilidade: o que é" -a arquivo --dif baixa|media|alta')
        else:
            linhas.append('- Ao terminar: <tipo> "o que fez" -a arquivo --dif baixa|media|alta')
        linhas.append(f"  (tipos: {tipos})")
    if v("protocolo.declarar_habilidades"):
        linhas.append('- Algo não óbvio aconteceu? --anotar "habilidade: o caso e o contorno"')
        linhas.append('- Aprendeu algo fora da tarefa? --nova "nome: o que é" --especie armadilha|metodo|ferramenta|padrao|dominio')
    # O loop de aprendizado na ponta do agente. A ordem das linhas é a ordem do
     # trabalho: consultar antes, observar durante, supor no fim — e nunca
     # concluir, porque concluir é dele.
    # Quem coordena registra o trabalho de coordenar: despachar, responder ao
    # dono e consolidar o que a squad produziu. O bônus vem de o despacho virar
    # entrega confirmada — então citar o MESMO nome de despacho nos dois lados
    # não é burocracia, é o que liga o resultado a quem pediu.
    if _papel(projeto, agente) in ("maestro", "lider") and v("protocolo.registrar_trabalho"):
        linhas.append('- Despachou tarefa? despacho "o que pediu" -d "<nome-do-despacho>"')
        linhas.append('  Quem executa cita o mesmo -d; quando aquilo virar entrega confirmada,'
                      ' o seu despacho vale mais.')
        linhas.append('- Respondeu um pedido do dono? resposta "o que respondeu"')
        linhas.append('- Consolidou o que a squad produziu? consolidacao "o que subiu, e para quem"')
    if v("aprendizado.no_protocolo"):
        minimo = v("aprendizado.evidencias_minimas")
        linhas.append('- Aplicou um aprendizado que a consulta trouxe? Cite o id ao fechar: --usei apr_xxxx')
        linhas.append('- Viu algo que pode virar padrão? --observei "dominio: o que voce viu" (so o fato, sem conclusao)')
        linhas.append(f'- Com {minimo}+ observacoes suas no mesmo dominio, proponha: --suponho "dominio: a generalizacao"'
                      ' --pergunta "o que perguntar" --opcao A --opcao B')
        linhas.append('  Voce nao conclui: a resposta e do dono, e o aprendizado nasce dela.')
    if v("habilidades.skills_nativas_intocaveis"):
        linhas.append("Nunca crie, edite ou apague skills nativas do Claude ou skills fora do Noctis.")
    if v("protocolo.registrar_trabalho"):
        linhas.append("O XP é calculado no servidor, não por você.")
    return "\n" + "\n".join(linhas)


def recortar(linhas: list[str]) -> tuple[list[str], int, int]:
    """Acha o bloco escalar de `system_prompt:` e devolve (linhas, início, fim)."""
    ini = next((i for i, l in enumerate(linhas)
                if l.startswith("system_prompt:") and l.rstrip().endswith(("|", ">", "|-", ">-"))), -1)
    if ini < 0:
        return linhas, -1, -1
    fim = len(linhas)
    for i in range(ini + 1, len(linhas)):
        l = linhas[i]
        if l.strip() and not l.startswith((" ", "\t")):
            fim = i
            break
    while fim > ini + 1 and not linhas[fim - 1].strip():
        fim -= 1
    return linhas, ini, fim


def indentacao(linhas: list[str], ini: int, fim: int) -> str:
    for l in linhas[ini + 1:fim]:
        if l.strip():
            return l[:len(l) - len(l.lstrip())]
    return "  "


def aplicar(caminho: Path, projeto: str, remover: bool) -> str:
    texto = caminho.read_text(encoding="utf-8")
    linhas = texto.split("\n")
    linhas, ini, fim = recortar(linhas)
    if ini < 0:
        return "sem system_prompt em bloco"

    ident = indentacao(linhas, ini, fim)
    corpo = linhas[ini + 1:fim]

    # Tira o bloco antigo, se houver: reinstalar é atualizar, não duplicar.
    marcado = next((i for i, l in enumerate(corpo) if MARCA in l), -1)
    if marcado >= 0:
        corte = marcado
        while corte > 0 and not corpo[corte - 1].strip():
            corte -= 1
        corpo = corpo[:corte]
        if remover:
            novas = linhas[:ini + 1] + corpo + linhas[fim:]
            caminho.write_text("\n".join(novas), encoding="utf-8")
            return "removido"
    elif remover:
        return "nada a remover"

    novo = [ident + l if l.strip() else "" for l in bloco_para(projeto, caminho.stem).split("\n")]
    novas = linhas[:ini + 1] + corpo + novo + linhas[fim:]
    caminho.write_text("\n".join(novas), encoding="utf-8")
    return "atualizado" if marcado >= 0 else "instalado"


def main() -> int:
    p = argparse.ArgumentParser(prog="instalar_protocolo")
    p.add_argument("projeto")
    p.add_argument("--remover", action="store_true")
    p.add_argument("--seco", action="store_true", help="só lista o que faria")
    a = p.parse_args()

    pasta = RAIZ / "projects" / a.projeto / "agents"
    if not pasta.is_dir():
        print(f"projeto sem pasta de agentes: {pasta}", file=sys.stderr)
        return 1
    arquivos = sorted(pasta.glob("*.yaml"))
    if a.seco:
        for f in arquivos:
            print(f"{f.stem}: {'já tem' if MARCA in f.read_text(encoding='utf-8') else 'entraria'}")
        return 0

    # Uma cópia antes de mexer: os prompts não estão em git e são o ativo mais
    # caro do projeto.
    backup = RAIZ / "projects" / a.projeto / "progresso" / f"backup-agents-{date.today():%Y-%m-%d}"
    backup.mkdir(parents=True, exist_ok=True)
    for f in arquivos:
        if not (backup / f.name).exists():
            shutil.copy2(f, backup / f.name)

    for f in arquivos:
        print(f"{f.stem}: {aplicar(f, a.projeto, a.remover)}")
    print(f"backup em {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
