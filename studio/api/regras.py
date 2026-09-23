"""O registro de regras do Noctis — o único lugar onde elas moram.

Antes disto, as regras eram constantes espalhadas pelo código: três eventos para
firmar, teto de XP, quem pode sobrescrever o quê, o texto que os agentes recebem.
Funcionavam, mas ninguém além de quem escreveu o código sabia quais eram. Um
sistema que exige coisas que o dono não consegue ler não está sob controle dele.

Duas garantias, e o resto é consequência:

  · **Toda regra que o Noctis aplica está aqui.** Se uma regra existir no código
    e não aqui, é defeito.
  · **O valor que o painel mostra é o valor que o código usa.** O código lê desta
    tabela na hora de aplicar — não há cópia em outro lugar para desatualizar.

Regras `fixas` são mostradas mas não se editam: são proteções (a base não se
apaga, repositório não vai para a lixeira) cujo desligamento abriria caminho
para perda de dados.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

_CONFIG: Path | None = None
_PROJECTS: Path | None = None
# Um cache por ARQUIVO de override, não um só: agora são vários (o global, o de
# cada hub, o de cada projeto) e eles mudam em momentos diferentes.
_cache: dict[str, dict] = {}


def configurar(raiz: Path) -> None:
    global _CONFIG, _PROJECTS
    _CONFIG = raiz / "config" / "regras.json"
    _PROJECTS = raiz / "projects"


# ── Escopo ────────────────────────────────────────────────────────────────────
#
# O Noctis virou suíte: o mesmo motor serve mais de um hub, e um hub cujo
# objetivo é PRODUZIR não pode herdar as regras de um hub cujo objetivo é
# GOVERNAR. Saturação diária é anomalia num e meta no outro.
#
# Uma regra passa a ser resolvida em cascata, do mais específico para o mais
# geral:
#
#     fixa → projeto → hub → global → padrão do catálogo
#
# O global continua sendo `config/regras.json`, exatamente como era: quem já
# ajustou alguma coisa não perde nada.
#
# **Nem toda regra pode ser escopada, e isso não é opcional.** Escopar uma
# proteção reabriria o buraco que `fixa` fechou — por isso a área `protecoes`
# nunca escapa, e qualquer regra pode se recusar com `escopavel: False`.

AREAS_NAO_ESCOPAVEIS = {"protecoes"}


class Escopo:
    """Onde uma regra está sendo lida: um hub, um projeto, ou nada."""

    __slots__ = ("hub", "projeto")

    def __init__(self, hub: str = "", projeto: str = ""):
        self.hub = (hub or "").strip()
        self.projeto = (projeto or "").strip()

    def __repr__(self) -> str:
        return f"Escopo(hub={self.hub!r}, projeto={self.projeto!r})"

    def __bool__(self) -> bool:
        return bool(self.hub or self.projeto)


def _hub_do_dir(d: Path) -> str:
    """O hub declarado no `project.yaml`. Ausente = o hub de origem, `noctis`."""
    p = d / "project.yaml"
    try:
        for linha in p.read_text(encoding="utf-8").splitlines():
            if linha.startswith("hub:"):
                return linha.split(":", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return "noctis"


def escopo_de_projeto(slug: str) -> Escopo:
    """O escopo de um projeto pelo slug — o hub sai do `project.yaml` dele."""
    if not slug or not _PROJECTS:
        return Escopo()
    return Escopo(hub=_hub_do_dir(_PROJECTS / slug), projeto=slug)


def escopo_de_base(base: Path) -> Escopo:
    """O mesmo, para quem só tem o caminho da pasta do projeto na mão.

    `progresso.py` e `repertorio.py` recebem `base: Path` e não o slug; derivar
    daí é mais barato do que mudar a assinatura de todas as funções deles.
    """
    if not base:
        return Escopo()
    return Escopo(hub=_hub_do_dir(base), projeto=base.name)


def _escopavel(r: dict) -> bool:
    return (not r.get("fixa")
            and r.get("area") not in AREAS_NAO_ESCOPAVEIS
            and r.get("escopavel", True) is not False)


def _arquivos_de(esc: Escopo | None) -> list[Path]:
    """Os arquivos de override, do MAIS específico para o mais geral."""
    fora: list[Path] = []
    if esc and esc.projeto and _PROJECTS:
        fora.append(_PROJECTS / esc.projeto / "config" / "regras.json")
    if esc and esc.hub and _CONFIG:
        fora.append(_CONFIG.parent / f"regras.{esc.hub}.json")
    if _CONFIG:
        fora.append(_CONFIG)
    return fora


# ── O catálogo ────────────────────────────────────────────────────────────────
# `onde` diz em que ponto a regra é aplicada, para ninguém ter de adivinhar:
#   servidor  — a API recusa ou calcula
#   protocolo — está escrito no prompt dos agentes
#   cli       — o comando que os agentes rodam cobra ou avisa
#   nocturn   — vira achado na ronda do supervisor

AREAS = [
    ("protocolo",   "Protocolo dos agentes", "o que todo agente é obrigado a fazer, e em que momento"),
    ("learning",    "Learnings",             "como um Learning nasce, se funde e quem pode mexer nele"),
    ("xp",          "XP e níveis",           "quanto cada trabalho vale e quanto custa subir de nível"),
    ("perguntas",   "Perguntas e teses",     "o que o Noctis pergunta para descobrir o que um Learning é"),
    ("aprendizado", "Aprendizado",           "como uma hipótese do agente vira conhecimento validado por você"),
    ("organizacao", "Organização",           "os papéis da cadeia de comando e o que a vista cobra de você"),
    ("agentes",     "Agentes aplicados",     "arquétipos, nicknames e o que atravessa projeto"),
    ("runtime",     "Runtime",               "o que a tela do que está rodando mostra, e quanto de cada vez"),
    ("nocturn",     "Supervisão",            "o que o NOCTURN cobra, e a partir de quando"),
    ("protecoes",   "Proteções",             "o que o Noctis nunca deixa acontecer"),
]

CATALOGO: list[dict] = [
    # ── Protocolo ─────────────────────────────────────────────────────────────
    {"id": "protocolo.explicar_arquetipo", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Dizer ao agente quem ele é e onde procurar",
     "faz": "O bloco abre dizendo o nickname e o identificador `<projeto>:<agente>`, e aponta os dois lugares: o arquétipo (o que ele É, compartilhado) e o acoplamento (o que é só deste projeto).",
     "porque": "Um arquétipo vive em vários projetos. Sem saber qual dos seus ele é, o agente consulta a memória do outro e reporta a um líder que não é o dele.",
     "onde": ["protocolo"]},
    {"id": "protocolo.consultar_ao_comecar", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Consultar o repertório antes de começar",
     "faz": "O protocolo manda o agente rodar --consultar com o assunto da tarefa antes de agir.",
     "porque": "É a metade que deixa o trabalho mais barato: não reaprender o que outro agente já pagou para aprender.",
     "onde": ["protocolo"]},
    {"id": "protocolo.registrar_trabalho", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Registrar o trabalho ao terminar",
     "faz": "O protocolo manda o agente registrar o que fez (tipo, resumo, evidência, dificuldade). É o que gera XP.",
     "porque": "Sem registro não há XP, não há histórico, e o NOCTURN não sabe quem está trabalhando.",
     "onde": ["protocolo"]},
    {"id": "protocolo.declarar_learnings", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Agentes declaram e escrevem Learnings",
     "faz": "Liga -s, --nova e --anotar: o agente nomeia Learnings ao registrar trabalho e escreve o texto deles. Desligado, o protocolo não fala disso e o servidor recusa as três operações — o trabalho continua sendo registrado e continua gerando XP.",
     "porque": "É a chave para pausar a escrita enquanto o formato de Learning é redefinido, sem parar o registro de trabalho.",
     "onde": ["protocolo", "servidor"]},

    # ── Learnings ───────────────────────────────────────────────────────────
    {"id": "learning.usar_firmar", "area": "learning", "tipo": "bool", "padrao": True,
     "titulo": "Separar broto de Learning firmado",
     "faz": "Um Learning só conta cheio na aptidão depois de exercitado N vezes no projeto; antes disso é broto e pesa 0,45.",
     "porque": "Filtro contra ruído num vocabulário sem critério. Com um formato de Learning bem definido, pode ser dispensável.",
     "onde": ["servidor"]},
    {"id": "learning.eventos_para_firmar", "area": "learning", "tipo": "int", "padrao": 3,
     "min": 1, "max": 20,
     "titulo": "Eventos para firmar",
     "faz": "Quantas vezes o projeto precisa exercitar um Learning para ele deixar de ser broto.",
     "porque": "Separa algo feito uma vez de algo que se repete.",
     "onde": ["servidor"], "depende": "learning.usar_firmar"},
    {"id": "learning.limiar_fusao", "area": "learning", "tipo": "float", "padrao": 0.82,
     "min": 0.6, "max": 1.0, "passo": 0.01,
     "titulo": "Semelhança para fundir nomes sozinho",
     "faz": "Dois nomes com semelhança igual ou maior que isto viram o mesmo Learning automaticamente, e o nome novo vira apelido.",
     "porque": "Impede que \"diagramação SVG\" e \"diagramas em SVG\" virem duas coisas que nunca sobem de nível. Alto demais deixa duplicatas passarem; baixo demais funde coisas diferentes.",
     "onde": ["servidor"]},
    {"id": "learning.faixa_parecidas", "area": "learning", "tipo": "float", "padrao": 0.68,
     "min": 0.4, "max": 0.95, "passo": 0.01,
     "titulo": "Semelhança para sugerir fusão",
     "faz": "Entre este valor e o limiar de fusão, os nomes não se fundem sozinhos, mas o NOCTURN aponta como possível duplicata (mesma regra, agora sobre Learnings).",
     "porque": "A faixa que o casamento automático deixa passar e precisa de olho humano.",
     "onde": ["nocturn", "servidor"]},
    {"id": "learning.curadoria_protegida", "area": "learning", "tipo": "bool", "padrao": True,
     "titulo": "Agente não sobrescreve texto que você editou",
     "faz": "Descrição editada por você fica marcada como curada; escrita de agente sobre ela é ignorada. Texto de agente pode ser melhorado por outro agente.",
     "porque": "Curadoria não pode ser desfeita por um despacho.",
     "onde": ["servidor"]},
    {"id": "learning.max_tags", "area": "learning", "tipo": "int", "padrao": 8,
     "min": 1, "max": 20,
     "titulo": "Máximo de tags por Learning",
     "faz": "Tags além deste número são cortadas ao salvar.",
     "porque": "Learning com dez tags não está agrupado em lugar nenhum — está em todos, o que é o mesmo que em nenhum.",
     "onde": ["servidor"]},
    {"id": "learning.peso_da_tag", "area": "learning", "tipo": "mapa",
     "padrao": {"armadilha": 1.35, "padrao": 1.15},
     "min": 0.5, "max": 3.0, "passo": 0.05,
     "titulo": "Peso de cada tag na consulta",
     "faz": "Multiplica a nota do Learning na busca quando ele tem aquela tag.",
     "porque": "Armadilha pesa mais porque é o que evita o erro — é por isso que se consulta antes de começar.",
     "onde": ["servidor"]},
    {"id": "learning.min_termo_busca", "area": "learning", "tipo": "int", "padrao": 3,
     "min": 2, "max": 6,
     "titulo": "Tamanho mínimo do termo de busca",
     "faz": "Palavras menores que isto são ignoradas na consulta.",
     "porque": "Palavra de duas letras casa com tudo e não diz nada — traria o repertório inteiro como resposta.",
     "onde": ["servidor"]},
    {"id": "learning.so_o_dono_cria", "area": "learning", "tipo": "bool",
     "padrao": True, "fixa": True,
     "titulo": "Só você cria Learning",
     "faz": "A API recusa criação de Learning por agente. Nome de Learning citado num evento que não existe no repertório NÃO abre entrada nova: fica como citação órfã, e o NOCTURN traz na ronda.",
     "porque": "O agente nomeia o que acabou de fazer, e sai disso nome de arquivo do projeto — foi o que encheu o repertório de coisa específica e nos obrigou a zerar tudo. Quem decide o que é Learning é quem enxerga o conjunto.",
     "onde": ["servidor", "protocolo"]},
    {"id": "learning.agente_propoe", "area": "learning", "tipo": "bool", "padrao": True,
     "titulo": "Agente pode PROPOR Learning novo",
     "faz": "O agente manda uma proposta com nome, descrição e o trabalho de onde ela saiu. Ela não vira Learning: fica esperando você aceitar, recusar ou pedir ajuste.",
     "porque": "Criar continua sendo do dono, mas quem está na tarefa é quem topa com o que o repertório não nomeia. Sem este caminho, o que ele descobre vira tese forçada num Learning errado — ou se perde.",
     "onde": ["protocolo", "servidor", "cli"]},
    {"id": "learning.exigir_no_trabalho", "area": "learning", "tipo": "bool", "padrao": False,
     "titulo": "Recusar trabalho que não carrega Learning",
     "faz": "Ligado, o xp.py RECUSA entrega, output, correção, revisão, retrabalho e consolidação sem -l, --observei, --propor ou --tese. Desligado, o comando registra mesmo assim e avisa em stderr.",
     "porque": "Trabalho que não deixa nada para o próximo é o buraco que o repertório tenta tapar. Nasce desligada de propósito: despacho já aberto com o protocolo antigo tomaria recusa no meio do caminho — ligue depois que o parque estiver reinstalado.",
     "onde": ["cli", "protocolo"]},
    {"id": "learning.proposta_exige_resposta", "area": "learning", "tipo": "bool", "padrao": True,
     "titulo": "Proposta de Learning não pode ficar sem veredito",
     "faz": "Proposta pendente entra no relatório do NOCTURN e no contador da barra de status, e fica em destaque na Home até você aceitar, recusar ou pedir ajuste.",
     "porque": "Recusar É resposta — é aprendizado sobre o que NÃO é a competência. O que não pode existir é o silêncio para sempre: o agente propôs a partir de trabalho real e nunca soube o que aconteceu.",
     "onde": ["nocturn", "servidor"]},
    {"id": "learning.skills_nativas_intocaveis", "area": "learning", "tipo": "bool", "padrao": True,
     "fixa": True,
     "titulo": "Agentes só mexem em skills criadas pelo Noctis",
     "faz": "Skills nativas do Claude e qualquer skill sua fora do Noctis nunca são criadas, editadas ou apagadas por agente nem pelo exportador.",
     "porque": "O Noctis não pode sobrescrever ferramenta que não é dele. Decisão de 18/09.",
     "onde": ["protocolo"],
     "estado": "valerá integralmente quando a exportação para SKILL.md existir; hoje o Noctis não escreve em pasta de skill nenhuma"},

    # ── Perguntas e teses ─────────────────────────────────────────────────────
    # A lista inteira é editável: acrescentar pergunta, reescrever tese, mudar a
    # ordem. O `campo` é a identidade da pergunta — mudá-lo faz o Noctis perguntar
    # de novo, porque as respostas antigas estão guardadas por ele.
    {"id": "perguntas.learning", "area": "perguntas", "tipo": "perguntas",
     "padrao": [
         {"campo": "momento", "titulo": "Quando entra", "tipo": "multi",
          "texto": "Em que momento do trabalho este Learning entra?",
          "opcoes": ["Antes de começar, para decidir o caminho",
                     "Durante a execução, a cada passo",
                     "Ao fechar, antes de entregar",
                     "Quando algo deu errado",
                     "Só quando alguém pede"],
          "frase": "Entra {escolhas}."},
         {"campo": "tem_passos", "titulo": "Tem passo a passo", "tipo": "bool",
          "texto": "Isto se faz seguindo uma sequência fixa de passos?",
          "opcoes": ["Sim, tem sequência fixa", "Não, depende do caso"],
          "frase": "{escolhas}."},
         {"campo": "erro_tipico", "titulo": "Onde se erra", "tipo": "multi",
          "texto": "Como se erra nisto, normalmente?",
          "opcoes": ["Acreditando no que o código ou o documento declara, sem medir",
                     "Pulando a verificação por pressa",
                     "Copiando de um caso anterior sem conferir se cabe",
                     "Decidindo sem consultar o que o projeto já aprendeu",
                     "Tratando exceção como regra",
                     "Parando no primeiro resultado que parece bom"],
          "frase": "Erra-se {escolhas}."},
         {"campo": "prova", "titulo": "Como se prova", "tipo": "multi",
          "texto": "O que prova que ficou bom?",
          "opcoes": ["Uma medida no artefato final, não no código-fonte",
                     "Comparação com um alvo declarado antes",
                     "Revisão de outro agente",
                     "Teste automatizado passando",
                     "Aprovação sua, e só ela"],
          "frase": "Está pronto quando existe {escolhas}."},
         {"campo": "julgamento", "titulo": "O que pesa no julgamento", "tipo": "radio",
          "texto": "Acertar isto depende mais de quê?",
          "opcoes": ["Seguir o procedimento com disciplina",
                     "Sensibilidade que se apura com os casos",
                     "Conhecer o contexto do projeto",
                     "Domínio de uma ferramenta"],
          "frase": "Acertar depende de {escolhas}."},
     ],
     "titulo": "As perguntas que descobrem o que um Learning é",
     "faz": "A fila que aparece em Aprender e na doca do Learning. Cada pergunta é uma tese ou um conjunto de teses, respondida por escolha — bool, radio ou múltipla. A `frase` é como a escolha aparece no documento que os agentes leem.",
     "porque": "São perguntas fechadas para a resposta poder ser COMPARADA entre Learnings e projetos: cinco Learnings marcando a mesma tese são um padrão; cinco frases digitadas são cinco strings. E a lista é sua porque ela define o que o Noctis entende por Learning.",
     "onde": ["servidor"]},

    # ── Aprendizado ───────────────────────────────────────────────────────────
    {"id": "aprendizado.evidencias_minimas", "area": "aprendizado", "tipo": "int", "padrao": 2,
     "min": 1, "max": 10,
     "titulo": "Observações mínimas para propor uma hipótese",
     "faz": "O agente só pode propor uma generalização apontando ao menos este número de observações registradas.",
     "porque": "Observação isolada não é padrão. Sem este corte, a primeira coincidência vira regra do projeto.",
     "onde": ["servidor", "protocolo"]},
    {"id": "aprendizado.confianca_para_promover", "area": "aprendizado", "tipo": "float",
     "padrao": 0.7, "min": 0.3, "max": 0.95, "passo": 0.05,
     "titulo": "Confiança para o aprendizado valer sozinho",
     "faz": "Abaixo desta confiança o aprendizado aparece marcado como frágil e pede mais evidência antes de ser injetado nos despachos.",
     "porque": "Aprendizado fraco tratado como certo é pior do que aprendizado nenhum: ele desloca a decisão sem aviso.",
     "onde": ["servidor", "nocturn"]},
    {"id": "aprendizado.pesos_da_confianca", "area": "aprendizado", "tipo": "mapa",
     "padrao": {"base": 0.20, "por_evidencia": 0.06, "por_confirmacao": 0.20, "por_refutacao": 0.30},
     "min": 0.0, "max": 1.0, "passo": 0.01,
     "titulo": "Como a confiança de uma hipótese é calculada",
     "faz": "confiança = base + por_evidencia × observações (até 6) + por_confirmacao × confirmações − por_refutacao × refutações, limitada entre 0,02 e 0,95.",
     "porque": "Evidência conta pouco (ver junto não é causa), confirmação conta muito, e refutação conta mais ainda: derrubar é mais informativo do que sustentar, e o sistema deve desconfiar rápido. Nunca chega a 1 porque nada aqui é verdade, só probabilidade.",
     "onde": ["servidor"]},
    {"id": "aprendizado.tipos_de_pergunta", "area": "aprendizado", "tipo": "flags",
     "padrao": {"bool": True, "escolha": True, "multi": True, "escala": True},
     "titulo": "Formatos de pergunta que o agente pode propor",
     "faz": "Desligar um formato faz a API recusar hipótese que o use.",
     "porque": "Escala rende número e pouca causa; se ela virar o formato preferido dos agentes, você responde mais e aprende menos.",
     "onde": ["servidor", "protocolo"]},
    {"id": "aprendizado.escopos", "area": "aprendizado", "tipo": "flags",
     "padrao": {"agente": True, "projeto": True, "global": True},
     "titulo": "Até onde um aprendizado pode valer",
     "faz": "Os escopos disponíveis ao validar: só para um agente, para o projeto, ou global entre projetos.",
     "porque": "Aprendizado global atravessa projeto e é o mais perigoso de errar; desligá-lo obriga tudo a ficar no escopo do projeto.",
     "onde": ["servidor"]},
    {"id": "aprendizado.no_protocolo", "area": "aprendizado", "tipo": "bool", "padrao": True,
     "titulo": "Pedir observação e hipótese aos agentes",
     "faz": "O protocolo instrui o agente a registrar o que observou nos domínios e a propor hipótese quando houver evidência bastante — e a citar qual aprendizado aplicou ao fechar o trabalho.",
     "porque": "Sem isto o loop existe e ninguém alimenta: foi exatamente o que aconteceu com os Learnings, que ficaram vazias porque nada no prompt as pedia.",
     "onde": ["protocolo", "cli"]},
    {"id": "aprendizado.agente_nunca_conclui", "area": "aprendizado", "tipo": "bool",
     "padrao": True, "fixa": True,
     "titulo": "Agente propõe, você conclui",
     "faz": "Agente registra observação e propõe hipótese. Aprendizado só nasce da sua resposta — e em 'corrigir' vale o texto que você escreveu, não o dele.",
     "porque": "O humano define significado; o agente descobre padrões. Foi a decisão de 18/09, e é o que impede o sistema de aprender a coisa errada com confiança alta.",
     "onde": ["servidor", "protocolo"]},

    # ── XP ────────────────────────────────────────────────────────────────────
    {"id": "xp.base_por_tipo", "area": "xp", "tipo": "mapa", "padrao": {
        "entrega": 60, "output": 25, "correcao": 20, "revisao": 15, "memoria": 15, "decisao": 10,
        "despacho": 12, "resposta": 10, "consolidacao": 20, "retrabalho": 0},
     "min": 0, "max": 500,
     "titulo": "XP base por tipo de trabalho",
     "faz": "O ponto de partida de cada registro, antes dos multiplicadores. `despacho`, `resposta` e `consolidacao` são o trabalho de quem coordena: delegar, responder ao dono e consolidar o que a squad produziu.",
     "porque": "Coordenar é trabalho e não aparecia em lugar nenhum: Maestro e líderes ficavam no nível 1 para sempre, como se não fizessem nada. A base é baixa de propósito — quem coordena sobe pelo BÔNUS de o despacho dar certo, não por despachar muito.",
     "onde": ["servidor"]},
    {"id": "xp.confirmacao_so_do_dono", "area": "xp", "tipo": "bool", "padrao": True,
     "titulo": "Só você confirma entrega",
     "faz": "A confirmação de trabalho é recusada a qualquer agente. Autoconfirmação é recusada sempre, mesmo com esta regra desligada.",
     "porque": "Confirmação vale XP — e, desde que o despacho cumprido dá bônus, dois agentes poderiam confirmar um ao outro e inflar os dois. A prova de que o trabalho serviu é sua.",
     "onde": ["servidor", "cli"]},
    {"id": "xp.mult_despacho_cumprido", "area": "xp", "tipo": "float", "padrao": 1.8,
     "min": 1.0, "max": 4.0, "passo": 0.1,
     "titulo": "Bônus quando o despacho vira entrega confirmada",
     "faz": "O `despacho` de quem coordena recebe este multiplicador quando existe trabalho confirmado citando o mesmo despacho.",
     "porque": "Sem isto, delegar dez vezes valeria mais do que delegar bem uma vez. Com isto, o XP de quem coordena depende do resultado de quem executou — que é exatamente a responsabilidade do papel.",
     "onde": ["servidor"]},
    {"id": "xp.dificuldade", "area": "xp", "tipo": "mapa", "padrao": {"baixa": 1.0, "media": 1.3, "alta": 1.7},
     "min": 0.1, "max": 5, "passo": 0.05,
     "titulo": "Multiplicador por dificuldade",
     "faz": "A dificuldade declarada no registro multiplica o XP.",
     "porque": "Trabalho difícil e fácil não podem valer igual.",
     "onde": ["servidor"]},
    {"id": "xp.mult_confirmado", "area": "xp", "tipo": "float", "padrao": 1.25, "min": 1.0, "max": 3.0, "passo": 0.05,
     "titulo": "Bônus de entrega confirmada",
     "faz": "Quando alguém confirma a entrega, o XP dela é multiplicado por isto.",
     "porque": "Trabalho revisado vale mais que trabalho só declarado.",
     "onde": ["servidor"]},
    {"id": "xp.mult_descoberta", "area": "xp", "tipo": "float", "padrao": 1.35, "min": 1.0, "max": 3.0, "passo": 0.05,
     "titulo": "Bônus de Learning novo",
     "faz": "A primeira vez que um agente exercita um Learning, o XP do registro é multiplicado por isto.",
     "porque": "Aprender algo novo vale mais que repetir.",
     "onde": ["servidor"]},
    {"id": "xp.teto_por_evento", "area": "xp", "tipo": "int", "padrao": 180, "min": 10, "max": 2000,
     "titulo": "Teto de XP por registro",
     "faz": "Nenhum registro vale mais que isto, somados todos os multiplicadores.",
     "porque": "Rede de segurança contra um registro absurdo; não deveria ser atingido no uso normal.",
     "onde": ["servidor"]},
    {"id": "xp.saturacao_diaria", "area": "xp", "tipo": "int", "padrao": 3, "min": 1, "max": 50,
     "titulo": "Repetições no mesmo dia antes de render menos",
     "faz": "A partir do registro seguinte a este número, o mesmo Learning no mesmo dia rende metade.",
     "porque": "Repetir a mesma coisa dez vezes num dia não é aprender dez vezes.",
     "onde": ["servidor"]},
    {"id": "xp.fator_saturado", "area": "xp", "tipo": "float", "padrao": 0.5,
     "min": 0.0, "max": 1.0, "passo": 0.05,
     "titulo": "Quanto vale o trabalho repetido no mesmo dia",
     "faz": "Depois da saturação diária, cada novo registro no mesmo Learning vale este fator do normal.",
     "porque": "Cortar para zero puniria o dia produtivo de verdade; manter cheio premiaria picar o mesmo trabalho em dez registros.",
     "onde": ["servidor"]},
    {"id": "protocolo.exigir_identificador", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Recusar registro fora do projeto do agente",
     "faz": "O `xp.py` confere `<projeto>:<agente>` antes de escrever e RECUSA se aquele agente não estiver aplicado ali.",
     "porque": "Substituiu o aviso do projeto ligado, que avisava depois de já ter gravado e falava da sessão, não do agente. Trabalho no projeto errado some do lugar onde alguém vai procurá-lo.",
     "onde": ["cli"]},
    {"id": "protocolo.cobrar_learning", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Cobrar Learning ao fechar entrega",
     "faz": "O comando avisa quando entrega, output ou correção são registrados sem dizer qual Learning foi exercitado.",
     "porque": "É a cobrança mais barata do sistema: uma linha no terminal, no momento em que a pessoa ainda lembra o que fez.",
     "onde": ["cli"]},
    {"id": "xp.curva_agente", "area": "xp", "tipo": "curva", "padrao": [100.0, 1.7],
     "titulo": "Curva de nível do agente",
     "faz": "XP acumulado para o nível n = base × n^expoente. Não há nível máximo.",
     "porque": "Cada nível custa mais que o anterior: 40 entregas precisam parecer diferentes de 4.",
     "onde": ["servidor"]},
    {"id": "xp.curva_learning", "area": "xp", "tipo": "curva", "padrao": [40.0, 1.6],
     "titulo": "Curva de nível de Learning",
     "faz": "XP de um Learning para o nível n = base × n^expoente.",
     "porque": "Mais barata que a do agente: o Learning sobe antes, e é isso que mostra em que o agente é bom.",
     "onde": ["servidor"]},

    # ── Supervisão ────────────────────────────────────────────────────────────
    {"id": "nocturn.dias_para_ocioso", "area": "nocturn", "tipo": "int", "padrao": 14, "min": 1, "max": 365,
     "titulo": "Dias sem trabalho para agente parado",
     "faz": "Agente que não registra trabalho há mais que isto entra na ronda como parado.",
     "porque": "Agente parado é time que você acha que tem e não tem.",
     "onde": ["nocturn"]},
    {"id": "nocturn.dias_para_cobrar_confirmacao", "area": "nocturn", "tipo": "int", "padrao": 2, "min": 0, "max": 60,
     "titulo": "Dias até cobrar confirmação",
     "faz": "Entrega sem confirmação há mais que isto vira achado na ronda.",
     "porque": "Entrega que ninguém revisa fica sem o bônus e sem revisor.",
     "onde": ["nocturn"]},

    # ── Organização ───────────────────────────────────────────────────────────
    {"id": "organizacao.cores_dos_papeis", "area": "organizacao", "tipo": "cores",
     "padrao": {"warden": "#f59e0b", "maestro": "#a78bfa", "lider": "#38bdf8", "agente": "#10b981"},
     "titulo": "Cor de cada papel",
     "faz": "A cor da borda e do rótulo no card da vista de Organização.",
     "porque": "Bater o olho no organograma e saber quem coordena e quem executa, sem ler.",
     "onde": ["servidor"]},
    {"id": "organizacao.avisos", "area": "organizacao", "tipo": "flags",
     "padrao": {"sem_maestro": True, "dois_maestros": True, "squad_sem_lider": True,
                "squad_vazia": True, "lider_sem_squad": True, "fora_de_squad": True},
     "titulo": "O que a vista de Organização cobra",
     "faz": "Cada aviso no rodapé da vista: sem Maestro, dois Maestros, squad sem líder, squad vazia, líder sem squad, agentes fora de squad.",
     "porque": "Aviso que você já decidiu ignorar vira ruído, e ruído faz você parar de ler o rodapé inteiro.",
     "onde": ["servidor"]},

    # ── Supervisão ────────────────────────────────────────────────────────────
    {"id": "nocturn.rondas", "area": "nocturn", "tipo": "flags",
     "padrao": {"vocabulario": True, "trabalho": True, "agentes": True, "memoria": True},
     "titulo": "Quais rondas o NOCTURN faz",
     "faz": "Desligar uma ronda tira a aba dela e para de gerar achados daquele tipo.",
     "porque": "Num projeto onde a memória é intocada, a ronda de memória só produz pendência que nunca vai ser resolvida.",
     "onde": ["nocturn"]},

    # ── Proteções ─────────────────────────────────────────────────────────────
    # ── Agentes aplicados ───────────────────────────────────────────────────
    {"id": "agentes.nickname_automatico", "area": "agentes", "tipo": "bool", "padrao": True,
     "titulo": "Dar nickname a todo agente aplicado",
     "faz": "Ao acoplar um agente a um projeto, ele recebe o próximo nickname livre do banco (estrelas e constelações).",
     "porque": "O mesmo arquétipo vive em vários projetos, e 'o redator' deixa de bastar quando há três. O nickname é como se chama; quem endereça é o identificador.",
     "onde": ["servidor"]},
    {"id": "agentes.nickname_unico", "area": "agentes", "tipo": "bool", "padrao": True,
     "fixa": True,
     "titulo": "Nickname nunca se repete",
     "faz": "Dois agentes aplicados jamais têm o mesmo nickname, em nenhum projeto.",
     "porque": "É a única promessa que o nickname faz. Se repetir, ele deixa de identificar e vira enfeite — e alguém vai acabar usando como endereço.",
     "onde": ["servidor"]},
    {"id": "agentes.liberar_nickname_orfao", "area": "agentes", "tipo": "bool", "padrao": True,
     "titulo": "Devolver ao banco o nickname sem agente",
     "faz": "Nickname preso a um agente que não existe mais é liberado, e o nome volta a ficar disponível.",
     "porque": "Apagar pela tela já devolve. Mas agente também some por projeto renomeado, pasta movida ou arquivo apagado na mão — e aí o nome fica reservado para um fantasma. Num banco finito, isso é vazamento.",
     "onde": ["servidor"]},
    {"id": "agentes.arquetipo_sem_projeto", "area": "agentes", "tipo": "bool", "padrao": True,
     "fixa": True,
     "titulo": "Arquétipo nunca cita projeto",
     "faz": "O que é do projeto (nome, mapa, repositório) fica no acoplamento, nunca no arquétipo compartilhado.",
     "porque": "É o que tira o LUGAR onde o vazamento mora. Conhecimento de projeto colado no prompt viaja junto na cópia; no arquétipo, não tem onde morar.",
     "onde": ["servidor", "cli"]},

    # ── Runtime ─────────────────────────────────────────────────────────────
    {"id": "runtime.janela_agora", "area": "runtime", "tipo": "int", "padrao": 15,
     "min": 1, "max": 1440,
     "titulo": "Janela do \"trabalhando agora\", em minutos",
     "faz": "Define quanto tempo atrás ainda conta como 'agora' na tela de Runtime.",
     "porque": "Não existe 'comecei' e 'terminei': o evento que registra o trabalho é o único sinal. 'Agora' é uma janela sobre ele, e o tamanho certo depende do ritmo dos seus despachos.",
     "onde": ["servidor"]},
    {"id": "runtime.por_pagina", "area": "runtime", "tipo": "int", "padrao": 50,
     "min": 10, "max": 200,
     "titulo": "Registros por página no histórico",
     "faz": "Quantos eventos o Runtime busca de cada vez ao rolar.",
     "porque": "O histórico é para durar e não tem corte por tempo. Trazer tudo de uma vez custaria a velocidade que a paginação existe para proteger.",
     "onde": ["servidor"]},

    {"id": "protecoes.base_permanente", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "A base de conhecimento não se apaga nem se renomeia",
     "faz": "O projeto `noctis` recusa exclusão e renomeação.",
     "porque": "É o chão dos outros projetos; perder a base é perder o que eles compartilham.",
     "onde": ["servidor"]},
    {"id": "protecoes.repositorios", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "Repositório de código não é projeto do Noctis",
     "faz": "Pasta em projects/ com .git e sem project.yaml aparece na lista, mas o Noctis não move nem apaga.",
     "porque": "Mandar o repositório do site para a lixeira o arrancaria do lugar onde o resto do trabalho o procura.",
     "onde": ["servidor"]},
    {"id": "protecoes.lixeira", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "Excluir projeto manda para a lixeira",
     "faz": "Só \"apagar de vez\", na lixeira, remove um projeto do disco.",
     "porque": "Um clique não pode apagar meses de trabalho sem volta.",
     "onde": ["servidor"]},
    {"id": "protecoes.projeto_nao_cruza", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "Um projeto não conversa com outro",
     "faz": "Nenhum agente copia agente, memória ou Learning entre projetos. O que atravessa é o arquétipo de um agente, enviado pelo dono na tela — sem papel, squad ou histórico.",
     "porque": "A fronteira do projeto é o que garante que o contexto de um cliente não vaze no outro. Se atravessar virar gesto de agente, a fronteira deixa de existir sem ninguém decidir isso.",
     "onde": ["protocolo", "servidor"]},
    {"id": "protecoes.log_append_only", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "O histórico de trabalho só cresce",
     "faz": "Confirmação, fusão e destruição entram como registros novos; nenhum registro antigo é reescrito.",
     "porque": "É o que permite recalcular tudo quando uma regra muda sem perder a história.",
     "onde": ["servidor"]},
]

_POR_ID = {r["id"]: r for r in CATALOGO}


# ── Leitura e escrita ─────────────────────────────────────────────────────────

def _ler_arquivo(p: Path) -> dict:
    if not p or not p.exists():
        return {}
    chave = str(p)
    try:
        mtime = p.stat().st_mtime
    except OSError:
        return {}
    c = _cache.get(chave)
    if not c or c["mtime"] != mtime:
        try:
            valores = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            valores = {}
        c = {"mtime": mtime, "valores": valores if isinstance(valores, dict) else {}}
        _cache[chave] = c
    return c["valores"]


def _valores_salvos(esc: Escopo | None = None) -> dict:
    """Os overrides já compostos, do mais geral para o mais específico."""
    fora: dict = {}
    for p in reversed(_arquivos_de(esc)):
        fora.update(_ler_arquivo(p))
    return fora


def valor(rid: str, esc: Escopo | None = None):
    """O valor que o código deve usar AGORA. É a única forma de ler uma regra.

    Sem `esc`, lê o global — que é o que todo chamador antigo continua fazendo,
    e por isso nada muda para quem não passou a escopar ainda.
    """
    r = _POR_ID[rid]
    if r.get("fixa"):
        return r["padrao"]
    arquivos = _arquivos_de(esc if _escopavel(r) else None)
    if r["tipo"] in ("mapa", "flags", "cores"):
        # Mapa salvo é complemento, não substituição: chave nova que eu
        # acrescentar no código aparece com o padrão dela, em vez de faltar.
        # Com escopo, as camadas se empilham na mesma lógica — o projeto
        # complementa o hub, que complementa o global.
        out = dict(r["padrao"])
        for p in reversed(arquivos):
            salvo = _ler_arquivo(p).get(rid)
            if isinstance(salvo, dict):
                out.update(salvo)
        return out
    for p in arquivos:
        salvo = _ler_arquivo(p).get(rid)
        if salvo is not None:
            return salvo
    return r["padrao"]


def _validar(r: dict, v):
    t = r["tipo"]
    if t == "bool":
        return bool(v)
    if t in ("int", "float"):
        n = int(v) if t == "int" else float(v)
        return max(r.get("min", n), min(r.get("max", n), n))
    if t == "mapa":
        if not isinstance(v, dict):
            raise ValueError("esperado um mapa de valores")
        out = {}
        for k in r["padrao"]:
            if k in v:
                n = float(v[k])
                out[k] = max(r.get("min", n), min(r.get("max", n), n))
        return out
    if t == "flags":
        if not isinstance(v, dict):
            raise ValueError("esperado um mapa de liga/desliga")
        return {k: bool(v[k]) for k in r["padrao"] if k in v}
    if t == "cores":
        if not isinstance(v, dict):
            raise ValueError("esperado um mapa de cores")
        out = {}
        for k in r["padrao"]:
            if k in v:
                cor = str(v[k]).strip()[:9]
                if not cor.startswith("#"):
                    raise ValueError(f"cor inválida em {k}: {cor!r}")
                out[k] = cor
        return out
    if t == "perguntas":
        if not isinstance(v, list) or not v:
            raise ValueError("a lista de perguntas não pode ficar vazia")
        vistos, out = set(), []
        for item in v[:20]:
            if not isinstance(item, dict):
                raise ValueError("cada pergunta é um objeto")
            campo = str(item.get("campo") or "").strip()[:40]
            texto = str(item.get("texto") or "").strip()[:300]
            tipo = str(item.get("tipo") or "multi")
            opcoes = [str(o).strip()[:160] for o in (item.get("opcoes") or []) if str(o).strip()][:12]
            if not campo:
                raise ValueError("pergunta sem `campo` — ele é a identidade dela")
            if campo in vistos:
                raise ValueError(f"campo repetido: {campo!r}")
            if not texto:
                raise ValueError(f"a pergunta {campo!r} está sem texto")
            if tipo not in ("bool", "radio", "multi"):
                raise ValueError(f"tipo de pergunta inválido em {campo!r}: {tipo!r}")
            if len(opcoes) < 2:
                raise ValueError(f"a pergunta {campo!r} precisa de pelo menos duas teses")
            vistos.add(campo)
            out.append({"campo": campo, "titulo": str(item.get("titulo") or campo)[:60],
                        "tipo": tipo, "texto": texto, "opcoes": opcoes,
                        "frase": str(item.get("frase") or "{escolhas}.")[:200]})
        return out
    if t == "curva":
        base, expo = float(v[0]), float(v[1])
        return [max(1.0, min(10000.0, base)), max(1.0, min(4.0, expo))]
    raise ValueError(f"tipo desconhecido: {t}")


# ── O rastro ──────────────────────────────────────────────────────────────────
# Uma regra mudava e não havia como saber quando, nem de quanto para quanto. O
# rastro é append-only, como o histórico de trabalho: cada mudança é uma linha, e
# nenhuma linha é reescrita. Sem ele, "o XP está estranho desde ontem" não tinha
# resposta.

def _rastro_path() -> Path | None:
    return (_CONFIG.parent / "config.jsonl") if _CONFIG else None


def _anotar(rid: str, de, para, por: str, acao: str, esc: Escopo | None = None) -> None:
    p = _rastro_path()
    if not p:
        return
    linha = {
        "quando": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "regra": rid, "acao": acao, "de": de, "para": para,
        "por": (por or "usuario")[:120],
    }
    # Sem o escopo o rastro fica ambíguo: "o XP mudou ontem" deixaria de dizer
    # se mudou para todo mundo ou só para um hub.
    if esc and (esc.hub or esc.projeto):
        linha["escopo"] = {"hub": esc.hub, "projeto": esc.projeto}
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except OSError:
        pass          # rastro nunca pode impedir a mudança de acontecer


def historico(rid: str = "") -> list[dict]:
    """As mudanças, da mais recente para a mais antiga."""
    p = _rastro_path()
    if not p or not p.exists():
        return []
    out = []
    for linha in p.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            r = json.loads(linha)
        except json.JSONDecodeError:
            continue
        if not rid or r.get("regra") == rid:
            out.append(r)
    out.reverse()
    return out


def ultima_mudanca(rid: str) -> dict | None:
    h = historico(rid)
    return h[0] if h else None


def _alvo_da_escrita(r: dict, esc: Escopo | None) -> Path:
    """Em QUE arquivo a mudança é gravada.

    Escopo pedido mas regra não escopável não vira erro silencioso nem grava no
    lugar errado: levanta, porque gravar no global o que se pediu para um hub é
    mudar o sistema inteiro sem avisar.
    """
    if esc and (esc.projeto or esc.hub):
        if not _escopavel(r):
            raise PermissionError(f"{r['id']} não pode ser escopada")
        if esc.projeto and _PROJECTS:
            return _PROJECTS / esc.projeto / "config" / "regras.json"
        return _CONFIG.parent / f"regras.{esc.hub}.json"
    return _CONFIG


def _gravar(p: Path, valores: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(valores, ensure_ascii=False, indent=2), encoding="utf-8")
    _cache.pop(str(p), None)


def definir(rid: str, v, por: str = "usuario", esc: Escopo | None = None) -> dict:
    r = _POR_ID.get(rid)
    if not r:
        raise KeyError(rid)
    if r.get("fixa"):
        raise PermissionError(rid)
    alvo = _alvo_da_escrita(r, esc)
    antes = valor(rid, esc)
    valores = dict(_ler_arquivo(alvo))
    valores[rid] = _validar(r, v)
    _gravar(alvo, valores)
    depois = valor(rid, esc)
    if depois != antes:
        _anotar(rid, antes, depois, por, "mudou", esc)
    return listar_uma(rid, esc)


def restaurar(rid: str, por: str = "usuario", esc: Escopo | None = None) -> dict:
    r = _POR_ID[rid]
    alvo = _alvo_da_escrita(r, esc)
    antes = valor(rid, esc)
    valores = dict(_ler_arquivo(alvo))
    tinha = rid in valores
    valores.pop(rid, None)
    _gravar(alvo, valores)
    if tinha:
        _anotar(rid, antes, valor(rid, esc), por, "voltou ao padrão", esc)
    return listar_uma(rid, esc)


def listar_uma(rid: str, esc: Escopo | None = None) -> dict:
    r = _POR_ID[rid]
    atual = valor(rid, esc)
    escopavel = _escopavel(r)
    # `alterada` compara com o PADRÃO. `escopada` responde outra pergunta: existe
    # um override ESCRITO neste hub ou neste projeto? Comparar valores não serve
    # — um override que por acaso coincide com o global apareceria como ausente,
    # e você não teria como restaurá-lo.
    onde = ""
    if escopavel and esc:
        for p in _arquivos_de(esc)[:-1]:      # todos menos o global
            if rid in _ler_arquivo(p):
                onde = "projeto" if (esc.projeto and p.parent.parent.name == esc.projeto) else "hub"
                break
    return {**r, "valor": atual,
            "alterada": (not r.get("fixa")) and atual != r["padrao"],
            "escopavel": escopavel,
            "escopada": bool(onde), "escopadaEm": onde,
            "ultimaMudanca": ultima_mudanca(rid)}


def listar(esc: Escopo | None = None) -> dict:
    return {"areas": [{"id": i, "titulo": t, "desc": d} for i, t, d in AREAS],
            "escopo": {"hub": esc.hub, "projeto": esc.projeto} if esc else None,
            "regras": [listar_uma(r["id"], esc) for r in CATALOGO]}
