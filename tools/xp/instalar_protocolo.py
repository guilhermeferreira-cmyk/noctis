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

import yaml
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
MARCA = "[noctis-xp]"

# O texto do bloco é MONTADO a partir das regras do Noctis (config/regras.json):
# desligar "declarar Learnings" no painel tira as linhas daqui, e o instalador
# reescreve o bloco de todo agente. O que o agente lê é sempre o que está valendo.
sys.path.insert(0, str(RAIZ / "studio" / "api"))
import regras as _regras  # noqa: E402
import organizacao as _org  # noqa: E402

_regras.configurar(RAIZ)


def _nickname(projeto: str, agente: str) -> str:
    """O nickname do agente aplicado. Falhar aqui só tira o nome do bloco — o
    identificador, que é o que endereça, continua saindo."""
    try:
        import nicknames as _nick
        return _nick.de(RAIZ, projeto, agente)
    except Exception:
        return ""


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

    # Quem ele é, antes do que ele faz.
    #
    # Um arquétipo vive em vários projetos, e o agente precisa saber QUAL dos
    # seus ele é — senão registra trabalho no lugar errado, consulta a memória
    # do outro e reporta a um líder que não é o dele. Antes isso era coberto
    # por um "projeto ligado" global, que avisava depois do erro; o
    # identificador resolve na origem, e é por agente em vez de por sessão.
    nickname = _nickname(projeto, agente)
    linhas = [f"## Protocolo do Noctis {MARCA}", ""]
    if v("protocolo.explicar_arquetipo"):
        linhas.append(f"Você é **{nickname or agente}**, identificador `{projeto}:{agente}`.")
        linhas.append(f"O nickname é como te chamam; o identificador é o seu endereço. "
                      f"Todo trabalho seu vai para o projeto `{projeto}` — nunca para outro.")
        linhas.append("")
        linhas.append("- O que você É (prompt, ferramentas, temperatura) pode vir de um ARQUÉTIPO, "
                      "em `projects/noctis/arquetipos/<slug>.yaml`, compartilhado com outros projetos. "
                      "Arquétipo nunca cita projeto: se precisar dizer algo que só vale aqui, é do acoplamento.")
        linhas.append(f"- O que é SÓ DESTE projeto (papel, squad, memórias que você carrega, instruções locais) "
                      f"está em `projects/{projeto}/agents/{agente}.yaml`.")
        linhas.append(f"- O contexto do projeto — o que já se aprendeu aqui — se consulta com o comando abaixo, "
                      f"não se adivinha do arquétipo.")
        linhas.append("")
    linhas.append(f"Do diretório {RAIZ}, com {cmd}:")
    if v("protocolo.consultar_ao_comecar"):
        linhas.append('- Ao começar: --consultar "assunto da tarefa" — leia o que o projeto já aprendeu, armadilhas primeiro.')
        linhas.append('- Ao delegar: cole no pedido a saída de --briefing "assunto".')
    if v("protocolo.registrar_trabalho"):
        tipos = ", ".join(k for k in v("xp.base_por_tipo") if k != "retrabalho")
        if v("protocolo.declarar_learnings") and not v("learning.so_o_dono_cria"):
            linhas.append('- Ao terminar: <tipo> "o que fez" -l "learning: o que é" -a arquivo --dif baixa|media|alta')
        elif v("protocolo.declarar_learnings"):
            # Com a criação restrita ao dono, `-l` é CITAÇÃO de Learning que já
            # existe. Pedir "nome: o que é" aqui convidava a batizar um novo —
            # e o comando recusa, deixando o agente contra uma porta fechada.
            linhas.append('- Ao terminar: <tipo> "o que fez" -l <learning-que-já-existe> -a arquivo --dif baixa|media|alta')
        else:
            linhas.append('- Ao terminar: <tipo> "o que fez" -a arquivo --dif baixa|media|alta')
        linhas.append(f"  (tipos: {tipos})")
        # Todo trabalho carrega um Learning: citar, observar ou propor. A recusa
        # é uma regra à parte (learning.exigir_no_trabalho); o pedido, não — ele
        # vale antes de a recusa ligar, e é o que faz o parque chegar pronto.
        if v("protocolo.declarar_learnings"):
            linhas.append('  Todo trabalho carrega um Learning: cite um com -l, observe um domínio'
                          ' com --observei, ou proponha um com --propor. Nenhum dos três = trabalho'
                          ' que não deixou nada para o próximo.')
        # O SKILL.md do Claude é outra coisa, e o agente precisa ouvir isso
        # nomeado: usar é livre, declarar o uso é o que alimenta o Runtime.
        linhas.append('- Usou um SKILL.md do Claude neste trabalho? Declare: --skill <slug-da-skill>'
                      ' (pode repetir). Não rende XP — é o registro de uso.')
    if v("protocolo.declarar_learnings"):
        linhas.append('- Algo não óbvio aconteceu? --anotar "learning: o caso e o contorno"')
        # `--nova` só entra onde abrir Learning ainda é do agente. Com
        # `so_o_dono_cria` ligada, esta linha mandava fazer o que a linha de
        # baixo proíbe e o servidor recusa — duas ordens opostas no mesmo bloco.
        if not v("learning.so_o_dono_cria"):
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
    # Os Learnings vem do dono e descem no despacho. O que se espera do
    # executor e uma TESE sobre eles, vinda do trabalho — e nao nome novo.
    if v("learning.so_o_dono_cria"):
        linhas.append('- Learning é criado pelo dono. Você não abre nem nomeia Learning.')
        # Não poder criar não é não poder dizer que falta. Sem esta linha, o que
        # o agente descobre e não tem nome vira tese forçada num Learning que
        # não é aquele — ou se perde.
        if v("learning.agente_propoe"):
            linhas.append('- Falta um Learning para o que você fez? --propor "nome: o que é"'
                          ' --porque "de onde saiu" -d "<despacho>"')
            linhas.append('  Propor não cria: o dono aceita, recusa ou pede ajuste — e ele SEMPRE responde.')
        linhas.append('- Ao fechar, proponha o que descobriu sobre o Learning que usou:')
        linhas.append('  --tese "learning: o que descobriu" --pergunta "o que perguntar"'
                      ' --opcao A --opcao B -d "<despacho>"')
        linhas.append('  O dono responde; se ele pedir ajuste, reescreva com --revisa <id>.')
    if v("aprendizado.no_protocolo"):
        minimo = v("aprendizado.evidencias_minimas")
        linhas.append('- Aplicou um aprendizado que a consulta trouxe? Cite o id ao fechar: --usei apr_xxxx')
        linhas.append('- Viu algo que pode virar padrão? --observei "dominio: o que voce viu" (so o fato, sem conclusao)')
        linhas.append(f'- Com {minimo}+ observacoes suas no mesmo dominio, proponha: --suponho "dominio: a generalizacao"'
                      ' --pergunta "o que perguntar" --opcao A --opcao B')
        linhas.append('  Voce nao conclui: a resposta e do dono, e o aprendizado nasce dela.')
    # A fronteira entre projetos, dita de dentro do prompt: quem executa não
    # tem como saber que o gesto de atravessar existe na tela do dono, e o
    # caminho errado (copiar o arquivo) é o mais fácil de tomar.
    if v("protecoes.projeto_nao_cruza"):
        linhas.append("Um projeto não conversa com outro: não copie agente, memória ou"
                      " Learning de um projeto para outro.")
    if v("learning.skills_nativas_intocaveis"):
        linhas.append("Nunca crie, edite ou apague skills nativas do Claude ou skills fora do Noctis.")
    # Antes havia aqui uma linha mandando "registre no projeto LIGADO, veja com
    # --ligado". O play saiu e a flag também: a linha virou uma ordem para usar
    # algo que não existe mais. Quem responde "onde eu registro" agora é o
    # identificador, dito no alto do bloco.
    if v("protocolo.exigir_identificador"):
        linhas.append("Registre sempre no SEU projeto — o comando recusa se o identificador"
                      " não bater. `--quem` diz quem você é aqui.")
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


class _Literal(str):
    """Uma string que volta ao arquivo como bloco `|`, e nao entre aspas."""


yaml.add_representer(_Literal,
                     lambda d, v: d.represent_scalar("tag:yaml.org,2002:str", v, style="|"))


def _sem_bloco(caminho: Path, projeto: str, remover: bool) -> str:
    """O caminho para quem NAO tem `system_prompt: |`.

    Agente salvo pela tela sai do `yaml.safe_dump` com o prompt numa string
    entre aspas, com \n no meio. O instalador so sabia mexer no bloco literal,
    entao esses agentes ficavam de fora sem ninguem perceber: o bloco entrava
    uma vez, na criacao, e nunca mais era atualizado — prompt velho mandando em
    agente novo.

    Aqui o arquivo e lido como dado, o prompt e trocado como texto, e volta em
    bloco literal — que e a forma legivel, e a que o resto do instalador
    entende da proxima vez.
    """
    try:
        cfg = yaml.safe_load(caminho.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return "yaml ilegivel"
    if not isinstance(cfg, dict) or not isinstance(cfg.get("system_prompt"), str):
        return "sem system_prompt"

    corpo = cfg["system_prompt"]
    marca = corpo.find("## Protocolo do Noctis " + MARCA)
    tinha = marca >= 0
    if tinha:
        corpo = corpo[:marca].rstrip()
    elif remover:
        return "nada a remover"
    if not remover:
        corpo = corpo.rstrip() + chr(10) + bloco_para(projeto, caminho.stem).strip(chr(10)) + chr(10)

    cfg["system_prompt"] = _Literal(corpo)
    caminho.write_text(yaml.dump(cfg, allow_unicode=True, sort_keys=False, width=88,
                                 default_flow_style=False),
                       encoding="utf-8")
    return "removido" if remover else ("atualizado" if tinha else "instalado")



def aplicar(caminho: Path, projeto: str, remover: bool) -> str:
    texto = caminho.read_text(encoding="utf-8")
    linhas = texto.split("\n")
    linhas, ini, fim = recortar(linhas)
    if ini < 0:
        return _sem_bloco(caminho, projeto, remover)

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
            texto = f.read_text(encoding="utf-8")
            if MARCA not in texto:
                estado = "entraria"
            else:
                # "já tem" escondia o caso que mais importa: tem, mas VELHO. O
                # bloco de um agente salvo pela tela ficou congelado por semanas
                # sem ninguém ver, porque a listagem dizia que estava lá.
                atual = [l.strip() for l in bloco_para(a.projeto, f.stem).split(chr(10)) if l.strip()]
                falta = [l for l in atual if l not in texto and l.replace("\\", "\\\\") not in texto]
                estado = "já tem" if not falta else f"desatualizado ({len(falta)} linha(s) novas)"
            print(f"{f.stem}: {estado}")
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
