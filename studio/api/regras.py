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
from pathlib import Path

_CONFIG: Path | None = None
_cache: dict = {"mtime": None, "valores": {}}


def configurar(raiz: Path) -> None:
    global _CONFIG
    _CONFIG = raiz / "config" / "regras.json"


# ── O catálogo ────────────────────────────────────────────────────────────────
# `onde` diz em que ponto a regra é aplicada, para ninguém ter de adivinhar:
#   servidor  — a API recusa ou calcula
#   protocolo — está escrito no prompt dos agentes
#   cli       — o comando que os agentes rodam cobra ou avisa
#   nocturn   — vira achado na ronda do supervisor

AREAS = [
    ("protocolo",   "Protocolo dos agentes", "o que todo agente é obrigado a fazer, e em que momento"),
    ("habilidades", "Habilidades",           "como uma habilidade nasce, se funde e quem pode mexer nela"),
    ("xp",          "XP e níveis",           "quanto cada trabalho vale e quanto custa subir de nível"),
    ("perguntas",   "Perguntas e teses",     "o que o Noctis pergunta para descobrir o que uma habilidade é"),
    ("aprendizado", "Aprendizado",           "como uma hipótese do agente vira conhecimento validado por você"),
    ("organizacao", "Organização",           "os papéis da cadeia de comando e o que a vista cobra de você"),
    ("nocturn",     "Supervisão",            "o que o NOCTURN cobra, e a partir de quando"),
    ("protecoes",   "Proteções",             "o que o Noctis nunca deixa acontecer"),
]

CATALOGO: list[dict] = [
    # ── Protocolo ─────────────────────────────────────────────────────────────
    {"id": "protocolo.auto_instalar", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Instalar o protocolo em todo agente salvo",
     "faz": "Todo agente criado ou editado pelo Noctis sai com o bloco de protocolo no system_prompt.",
     "porque": "Sem isso, o sistema depende de alguém lembrar de rodar o instalador — e um agente sem protocolo não registra trabalho nem lê o que foi aprendido.",
     "onde": ["servidor"]},
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
    {"id": "protocolo.declarar_habilidades", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Agentes declaram e escrevem habilidades",
     "faz": "Liga -s, --nova e --anotar: o agente nomeia habilidades ao registrar trabalho e escreve o texto delas. Desligado, o protocolo não fala disso e o servidor recusa as três operações — o trabalho continua sendo registrado e continua gerando XP.",
     "porque": "É a chave para pausar a escrita enquanto o formato de habilidade é redefinido, sem parar o registro de trabalho.",
     "onde": ["protocolo", "servidor"]},

    # ── Habilidades ───────────────────────────────────────────────────────────
    {"id": "habilidades.usar_firmar", "area": "habilidades", "tipo": "bool", "padrao": True,
     "titulo": "Separar broto de habilidade firmada",
     "faz": "Uma habilidade só conta cheio na aptidão depois de exercitada N vezes no projeto; antes disso é broto e pesa 0,45.",
     "porque": "Filtro contra ruído num vocabulário sem critério. Com um formato de habilidade bem definido, pode ser dispensável.",
     "onde": ["servidor"]},
    {"id": "habilidades.eventos_para_firmar", "area": "habilidades", "tipo": "int", "padrao": 3,
     "min": 1, "max": 20,
     "titulo": "Eventos para firmar",
     "faz": "Quantas vezes o projeto precisa exercitar uma habilidade para ela deixar de ser broto.",
     "porque": "Separa algo feito uma vez de algo que se repete.",
     "onde": ["servidor"], "depende": "habilidades.usar_firmar"},
    {"id": "habilidades.limiar_fusao", "area": "habilidades", "tipo": "float", "padrao": 0.82,
     "min": 0.6, "max": 1.0, "passo": 0.01,
     "titulo": "Semelhança para fundir nomes sozinho",
     "faz": "Dois nomes com semelhança igual ou maior que isto viram a mesma habilidade automaticamente, e o nome novo vira apelido.",
     "porque": "Impede que \"diagramação SVG\" e \"diagramas em SVG\" virem duas coisas que nunca sobem de nível. Alto demais deixa duplicatas passarem; baixo demais funde coisas diferentes.",
     "onde": ["servidor"]},
    {"id": "habilidades.faixa_parecidas", "area": "habilidades", "tipo": "float", "padrao": 0.68,
     "min": 0.4, "max": 0.95, "passo": 0.01,
     "titulo": "Semelhança para sugerir fusão",
     "faz": "Entre este valor e o limiar de fusão, os nomes não se fundem sozinhos, mas o NOCTURN aponta como possível duplicata.",
     "porque": "A faixa que o casamento automático deixa passar e precisa de olho humano.",
     "onde": ["nocturn", "servidor"]},
    {"id": "habilidades.curadoria_protegida", "area": "habilidades", "tipo": "bool", "padrao": True,
     "titulo": "Agente não sobrescreve texto que você editou",
     "faz": "Descrição editada por você fica marcada como curada; escrita de agente sobre ela é ignorada. Texto de agente pode ser melhorado por outro agente.",
     "porque": "Curadoria não pode ser desfeita por um despacho.",
     "onde": ["servidor"]},
    {"id": "habilidades.max_tags", "area": "habilidades", "tipo": "int", "padrao": 8,
     "min": 1, "max": 20,
     "titulo": "Máximo de tags por habilidade",
     "faz": "Tags além deste número são cortadas ao salvar.",
     "porque": "Habilidade com dez tags não está agrupada em lugar nenhum — está em todos, o que é o mesmo que em nenhum.",
     "onde": ["servidor"]},
    {"id": "habilidades.peso_da_tag", "area": "habilidades", "tipo": "mapa",
     "padrao": {"armadilha": 1.35, "padrao": 1.15},
     "min": 0.5, "max": 3.0, "passo": 0.05,
     "titulo": "Peso de cada tag na consulta",
     "faz": "Multiplica a nota da habilidade na busca quando ela tem aquela tag.",
     "porque": "Armadilha pesa mais porque é o que evita o erro — é por isso que se consulta antes de começar.",
     "onde": ["servidor"]},
    {"id": "habilidades.min_termo_busca", "area": "habilidades", "tipo": "int", "padrao": 3,
     "min": 2, "max": 6,
     "titulo": "Tamanho mínimo do termo de busca",
     "faz": "Palavras menores que isto são ignoradas na consulta.",
     "porque": "Palavra de duas letras casa com tudo e não diz nada — traria o repertório inteiro como resposta.",
     "onde": ["servidor"]},
    {"id": "habilidades.skills_nativas_intocaveis", "area": "habilidades", "tipo": "bool", "padrao": True,
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
    {"id": "perguntas.habilidade", "area": "perguntas", "tipo": "perguntas",
     "padrao": [
         {"campo": "momento", "titulo": "Quando entra", "tipo": "multi",
          "texto": "Em que momento do trabalho esta habilidade entra?",
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
     "titulo": "As perguntas que descobrem o que uma habilidade é",
     "faz": "A fila que aparece em Aprender e na doca da habilidade. Cada pergunta é uma tese ou um conjunto de teses, respondida por escolha — bool, radio ou múltipla. A `frase` é como a escolha aparece no documento que os agentes leem.",
     "porque": "São perguntas fechadas para a resposta poder ser COMPARADA entre habilidades e projetos: cinco habilidades marcando a mesma tese são um padrão; cinco frases digitadas são cinco strings. E a lista é sua porque ela define o que o Noctis entende por habilidade.",
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
     "porque": "Sem isto o loop existe e ninguém alimenta: foi exatamente o que aconteceu com as habilidades, que ficaram vazias porque nada no prompt as pedia.",
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
     "titulo": "Bônus de habilidade nova",
     "faz": "A primeira vez que um agente exercita uma habilidade, o XP do registro é multiplicado por isto.",
     "porque": "Aprender algo novo vale mais que repetir.",
     "onde": ["servidor"]},
    {"id": "xp.teto_por_evento", "area": "xp", "tipo": "int", "padrao": 180, "min": 10, "max": 2000,
     "titulo": "Teto de XP por registro",
     "faz": "Nenhum registro vale mais que isto, somados todos os multiplicadores.",
     "porque": "Rede de segurança contra um registro absurdo; não deveria ser atingido no uso normal.",
     "onde": ["servidor"]},
    {"id": "xp.saturacao_diaria", "area": "xp", "tipo": "int", "padrao": 3, "min": 1, "max": 50,
     "titulo": "Repetições no mesmo dia antes de render menos",
     "faz": "A partir do registro seguinte a este número, a mesma habilidade no mesmo dia rende metade.",
     "porque": "Repetir a mesma coisa dez vezes num dia não é aprender dez vezes.",
     "onde": ["servidor"]},
    {"id": "xp.fator_saturado", "area": "xp", "tipo": "float", "padrao": 0.5,
     "min": 0.0, "max": 1.0, "passo": 0.05,
     "titulo": "Quanto vale o trabalho repetido no mesmo dia",
     "faz": "Depois da saturação diária, cada novo registro na mesma habilidade vale este fator do normal.",
     "porque": "Cortar para zero puniria o dia produtivo de verdade; manter cheio premiaria picar o mesmo trabalho em dez registros.",
     "onde": ["servidor"]},
    {"id": "protocolo.cobrar_habilidade", "area": "protocolo", "tipo": "bool", "padrao": True,
     "titulo": "Cobrar habilidade ao fechar entrega",
     "faz": "O comando avisa quando entrega, output ou correção são registrados sem dizer qual habilidade foi exercitada.",
     "porque": "É a cobrança mais barata do sistema: uma linha no terminal, no momento em que a pessoa ainda lembra o que fez.",
     "onde": ["cli"]},
    {"id": "xp.curva_agente", "area": "xp", "tipo": "curva", "padrao": [100.0, 1.7],
     "titulo": "Curva de nível do agente",
     "faz": "XP acumulado para o nível n = base × n^expoente. Não há nível máximo.",
     "porque": "Cada nível custa mais que o anterior: 40 entregas precisam parecer diferentes de 4.",
     "onde": ["servidor"]},
    {"id": "xp.curva_skill", "area": "xp", "tipo": "curva", "padrao": [40.0, 1.6],
     "titulo": "Curva de nível de habilidade",
     "faz": "XP de uma habilidade para o nível n = base × n^expoente.",
     "porque": "Mais barata que a do agente: a habilidade sobe antes, e é isso que mostra em que o agente é bom.",
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
     "padrao": {"maestro": "#a78bfa", "lider": "#38bdf8", "agente": "#10b981"},
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
    {"id": "protecoes.log_append_only", "area": "protecoes", "tipo": "bool", "padrao": True, "fixa": True,
     "titulo": "O histórico de trabalho só cresce",
     "faz": "Confirmação, fusão e destruição entram como registros novos; nenhum registro antigo é reescrito.",
     "porque": "É o que permite recalcular tudo quando uma regra muda sem perder a história.",
     "onde": ["servidor"]},
]

_POR_ID = {r["id"]: r for r in CATALOGO}


# ── Leitura e escrita ─────────────────────────────────────────────────────────

def _valores_salvos() -> dict:
    if not _CONFIG or not _CONFIG.exists():
        return {}
    mtime = _CONFIG.stat().st_mtime
    if _cache["mtime"] != mtime:
        try:
            _cache["valores"] = json.loads(_CONFIG.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            _cache["valores"] = {}
        _cache["mtime"] = mtime
    return _cache["valores"]


def valor(rid: str):
    """O valor que o código deve usar AGORA. É a única forma de ler uma regra."""
    r = _POR_ID[rid]
    if r.get("fixa"):
        return r["padrao"]
    salvo = _valores_salvos().get(rid)
    if salvo is None:
        return r["padrao"]
    if r["tipo"] in ("mapa", "flags", "cores"):
        # Mapa salvo é complemento, não substituição: chave nova que eu
        # acrescentar no código aparece com o padrão dela, em vez de faltar.
        return {**r["padrao"], **salvo}
    return salvo


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


def definir(rid: str, v) -> dict:
    r = _POR_ID.get(rid)
    if not r:
        raise KeyError(rid)
    if r.get("fixa"):
        raise PermissionError(rid)
    valores = dict(_valores_salvos())
    valores[rid] = _validar(r, v)
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(valores, ensure_ascii=False, indent=2), encoding="utf-8")
    _cache["mtime"] = None
    return listar_uma(rid)


def restaurar(rid: str) -> dict:
    valores = dict(_valores_salvos())
    valores.pop(rid, None)
    _CONFIG.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG.write_text(json.dumps(valores, ensure_ascii=False, indent=2), encoding="utf-8")
    _cache["mtime"] = None
    return listar_uma(rid)


def listar_uma(rid: str) -> dict:
    r = _POR_ID[rid]
    atual = valor(rid)
    return {**r, "valor": atual, "alterada": (not r.get("fixa")) and atual != r["padrao"]}


def listar() -> dict:
    return {"areas": [{"id": i, "titulo": t, "desc": d} for i, t, d in AREAS],
            "regras": [listar_uma(r["id"]) for r in CATALOGO]}
