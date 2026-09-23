# Agentes agnósticos, memória acoplada por projeto

**Estado:** proposta, aguardando decisão · **Data:** 22/09/2026

Escrito para o dono decidir e para o engenheiro que executar. Tudo que está em
"O que foi medido" saiu de contagem no repositório, não de impressão.

---

## 1. O que foi medido

| medida | número |
|---|---|
| agentes no total | **56**, em 4 projetos |
| agentes com o mesmo nome em mais de um projeto | **18** |
| desses, com `system_prompt` 99,4–99,8% idêntico | **15** |
| desses, que são agentes *diferentes* de mesmo nome | **3** (`qa`, `redator`, `desenvolvedor`) |
| lugares no código que leem o YAML do agente | **51**, em 6 arquivos |

O dado decisivo: a **única** diferença entre as duas cópias de `pen_dev` é uma
linha dentro do bloco `[noctis-xp]`:

```
- ... `python tools/xp/xp.py noctis pen_dev`
+ ... `python tools/xp/xp.py tessera_web_site pen_dev`
```

Essa linha é **gerada** por `tools/xp/instalar_protocolo.py`. Ou seja: o prompt
desses agentes já é agnóstico na prática, e o único pedaço que não é já é
máquina que escreve.

## 2. Veredito

**Faz sentido, e o modelo de dados já pede isso.** O YAML do agente hoje mistura
duas naturezas que o próprio código já sabe separar — `enviar_agente()` remove
`papel`, `squad` e `reporta_a` ao mandar um agente para outro projeto, com o
comentário "eles não descrevem o agente, descrevem o trabalho dele naquele
projeto". A refatoração não inventa uma distinção: ela promove uma convenção
existente a modelo de dados.

O modelo atual é **cópia**. 15 agentes viram 30 arquivos que precisam ser
corrigidos em dobro e que vão derivar — é questão de tempo, não de risco.

Sobre a contaminação: o ganho real não é filtrar melhor, é **tirar o lugar onde
o vazamento mora**. Hoje, conhecimento de projeto acaba colado dentro do
`system_prompt`, e aí viaja junto na cópia. Com a separação, o arquétipo não tem
onde guardar isso — o que é do projeto só cabe no acoplamento.

## 3. O modelo

```
projects/noctis/arquetipos/<slug>.yaml        ← a biblioteca do Warden
    name, description, system_prompt, tools, output_format, temperature

projects/<projeto>/agents/<slug>.yaml         ← o acoplamento
    arquetipo: <slug>        # o vínculo; ausente = agente local (como hoje)
    papel, squad, reporta_a  # o trabalho dele AQUI
    memory_files: []         # a memória exclusiva deste projeto
    prompt_local: |          # acréscimo, nunca substituição
    desacoplado: false       # escotilha: congela uma cópia e solta o vínculo
```

O agente efetivo é resolvido na leitura: **arquétipo + acoplamento + bloco de
protocolo gerado para este projeto**. O bloco `[noctis-xp]` deixa de ser texto
gravado em 56 arquivos e passa a ser gerado na resolução — o que, de quebra,
mata o bug de protocolo desatualizado.

### Regras invioláveis

1. **Arquétipo não cita projeto.** Vira lint: o nome de qualquer projeto dentro
   de um arquétipo é erro, e o Diagnóstico aponta.
2. **`prompt_local` acrescenta, não substitui.** Se pudesse substituir, o
   arquétipo viraria decoração e a deriva voltaria pela janela.
3. **Nunca fundir por nome.** Os 3 casos de colisão provam o porquê: `qa` em
   Sciensa e em Tessera são 17,8% parecidos. Só vira arquétipo o que for
   promovido explicitamente.
4. **Um único ponto de leitura.** Todo consumidor passa por `resolver_agente()`.
   São 51 lugares hoje; nenhum pode ler o YAML cru depois.

## 4. Migração

**Fase 1 — infraestrutura, sem mexer em dado.** `resolver_agente()`, a pasta de
arquétipos, e os 51 pontos de leitura redirecionados. Nada muda de aparência.

**Fase 2 — promover os 15.** Um comando que, para cada agente 99%+ duplicado,
cria o arquétipo e reduz os dois YAMLs a acoplamentos. Reversível: o
`desacoplado: true` reconstrói o arquivo cheio.

**Fase 3 — o instalador de protocolo muda de alvo.** Deixa de escrever em cada
agente; o bloco passa a ser gerado na resolução.

**Fase 4 — a tela do agente.** Especificada na seção 7.

## 5. A segunda parte: mapas e organizações agnósticos

Aqui eu **discordo em parte** de como você juntou as duas coisas. Elas não têm a
mesma dificuldade.

**Organizações são fáceis, e vêm quase de graça.** Uma organização é papéis,
squads e linhas de reporte — ou seja, um grafo *sobre agentes*. Se o agente vira
arquétipo, um molde de organização é um grafo sobre slugs de arquétipo, e
instanciar é criar os acoplamentos no projeto destino. O desenho
(`organizacao.json`, que guarda só coordenadas) viaja junto de brinde. Isto é
consequência da Fase 2, não projeto separado.

**Mapas são difíceis, e você está certo.** Um mapa aponta para *recursos que
existem naquele projeto*. Um mapa agnóstico não pode referenciar conteúdo — só
pode referenciar **forma**. O modo de fazer isso funcionar é o mapa de **vagas
tipadas**: em vez de "o nó aponta para a memória X", o nó diz "aqui vai uma
memória do tipo *fundação*". O Noctis já tem essa tipagem (fundação, decisão,
referência, estado, output, nota), então o molde se apoia numa distinção que já
existe, em vez de inventar outra.

Instanciar um mapa passa a ser preencher vagas: o que existir liga, o que não
existir nasce como memória vazia daquele tipo. O modo de falhar feio — nós
pendurados apontando para nada — fica contido, porque a vaga vazia é um estado
legítimo e visível.

**Recomendação:** organizações junto com a Fase 2. Mapas só depois que a camada
de arquétipos estiver de pé e provada, como frente própria.

## 6. Riscos

1. **Deriva ao contrário.** Mudar o arquétipo muda todos os projetos de uma vez.
   Mitigação: `desacoplado`, e a tela do agente avisando "isto afeta N projetos"
   antes de salvar.
2. **O ponto único de leitura.** Se um dos 51 lugares continuar lendo o YAML
   cru, ele vê um agente sem cabeça — sem prompt, sem descrição. O sintoma é
   silencioso. Mitigação: o campo `system_prompt` some do acoplamento, então
   quem ler cru lê `None` e quebra alto em vez de quebrar quieto.
3. **O Warden vira dependência de todos.** Perder a pasta de arquétipos
   descabeça a frota inteira. Mitigação: `desacoplado` como plano de fuga, e o
   Diagnóstico acusando arquétipo faltando.
4. **Os 26 agentes de projeto único.** Não viram arquétipo agora. Continuam
   locais, e isso é correto: promover é decisão, não automação.


## 7. A tela do agente

### 7.1 O que o Noctis sabe de um agente hoje (levantado, não suposto)

| fonte | o que tem | escopo |
|---|---|---|
| YAML do agente | `name`, `description`, `system_prompt`, `tools`, `output_format`, `temperature` | vira **arquétipo** |
| YAML do agente | `papel`, `squad`, `reporta_a`, `memory_files` | vira **acoplamento** |
| `/progresso/{agente}` | `xp`, `nivel`, `inicio_nivel`, `proximo_nivel`, `progresso`, `eventos`, `primeira`, `ultima`, `historico[]`, `brotos`, `topo` | **par (agente, projeto)** |
| `skills.json` do projeto | Learnings com `vinculados: [agente]`, cada um com `estado`, `especie`, `natureza`, `tags`, `xp`, `eventos`, `nivel_maximo`, `enquadramento`, `marcos` | projeto |
| `/todos/runtime` | eventos de trabalho, skills declaradas com `--skill`, quem trabalha agora | atravessa projetos |
| `organizacao.json` | posição no desenho, quem reporta a quem | projeto |
| `/propostas`, `/teses` | o que ele propôs e ainda espera veredito | projeto |
| `.claude/skills/` | **nada** — não existe vínculo agente ↔ SKILL.md | — |

### 7.2 O buraco: XP, nível e skills mal endereçados

Três escopos hoje se confundem, e é isso que faz a informação parecer solta:

- **XP e nível** são do par (agente, projeto) — nascem de trabalho registrado,
  e trabalho acontece dentro de um projeto.
- **Learnings** são do projeto e apontam para agentes por `vinculados`.
- **Skills** não apontam para agente nenhum. O caminho existente é indireto —
  agente → Learning → Skill — e por isso a pergunta "que skills este agente
  tem?" não tem resposta direta no sistema.

**Recomendação, encaixando no modelo da seção 3:**

| o quê | onde mora | por quê |
|---|---|---|
| **Skills** (`SKILL.md`) | no **arquétipo** | um `SKILL.md` é procedimento, agnóstico pela definição do próprio Claude. É o que o agente *sabe fazer*, independente de onde. |
| **Learnings** | no **acoplamento** | é conhecimento apanhado *naquele* trabalho. Subir para o arquétipo reabriria a porta da contaminação. |
| **XP e nível** | no **acoplamento** | nível cross-projeto seria mentira: o agente "subiria de nível" num projeto onde nunca trabalhou. |

No Warden pode existir um número derivado — *"nível mais alto: 4, em Tessera"* —
mas ele **nomeia o projeto sempre**. Número somado sem projeto é o começo da
mentira.

Isso também dá a primeira resposta direta a "que skills este agente tem?", e
cria uma leitura nova e útil: o **vão** entre as skills que o arquétipo declara
e as que ele de fato declarou usar no Runtime. "Tem a skill, nunca usou" é
informação de gestão.

### 7.3 Os dois modos

**Modo cru — aberto do Warden.** É o arquétipo, sem projeto nenhum.

```
┌ Redator ─────────────────────── arquétipo · 3 projetos ─┐
│ Identidade    description, system_prompt, tools,        │
│               output_format, temperature                │
│               ⚠ editar aqui afeta 3 projetos            │
│ Skills        os SKILL.md que ele sabe rodar            │
│ Onde trabalha  ← a resposta a "todos os contextos"      │
│   ┌────────────┬──────┬─────┬───────────┬─────────────┐ │
│   │ projeto    │nível │ XP  │ Learnings │ último      │ │
│   ├────────────┼──────┼─────┼───────────┼─────────────┤ │
│   │ Tessera    │  4   │ 820 │    6      │ há 2h       │ │
│   │ Sciensa    │  2   │ 210 │    1      │ há 18d      │ │
│   │ Projeto    │  0   │   0 │    0      │ nunca       │ │
│   └────────────┴──────┴─────┴───────────┴─────────────┘ │
└──────────────────────────────────────────────────────────┘
```

A linha com **nunca** é das mais úteis: agente acoplado que jamais trabalhou ali
é um acoplamento a desfazer.

**Modo acoplado — aberto de dentro de um projeto.** Arquétipo + este projeto:

1. **Identidade** — herdada, recolhida por padrão, com o selo *"herdado de
   redator · editar afeta 3 projetos"* e um atalho para o modo cru. Se for
   agente local, o selo diz *"local deste projeto"* e a edição é direta.
2. **Aqui neste projeto** — `papel`, `squad`, `reporta_a`, `prompt_local`.
3. **Contexto acoplado** — os `memory_files` que ele carrega, com o selo do tipo
   de memória (fundação/decisão/referência/estado). É *o* pedido: ver o contexto
   acoplado a ele neste projeto, e só dele.
4. **XP e nível** — o disco, nível, progresso para o próximo, primeira e última
   entrega. Sempre rotulado *neste projeto*.
5. **Learnings** — os `vinculados` a ele, separados por estado (broto/firmada),
   com XP de cada.
6. **Skills** — as do arquétipo, marcando quais ele já declarou usar aqui (o vão
   da seção 7.2).
7. **Histórico** — os eventos dele, paginados, reaproveitando o cursor composto
   que o Runtime já usa.

### 7.4 Decisões de tela que vale fixar

- **Nunca misturar as duas metades no mesmo bloco.** O que é herdado e o que é
  daqui ficam visualmente separados, sempre. Se isso borrar, a pessoa edita o
  arquétipo achando que mexe só no projeto — que é exatamente o acidente que a
  refatoração existe para evitar.
- **Toda edição de arquétipo mostra antes o que vai mudar e onde.**
- **A tela é a mesma nos dois modos**, só que a de projeto tem as seções 2–7 e a
  crua tem a tabela de contextos. Duas telas separadas virariam duas verdades.
- **Nada de número somado sem projeto ao lado.**

### 7.5 O que falta no backend para a tela existir

1. `GET /api/arquetipos/{slug}` — o arquétipo e a lista de projetos onde está
   acoplado, com nível, XP, contagem de Learnings e último trabalho de cada.
2. `GET /api/projects/{p}/agents/{nome}/ficha` — a visão acoplada resolvida,
   num pedido só (hoje seriam quatro: agente, progresso, learnings, runtime).
   Uma tela que faz quatro idas volta a ser lenta, e já pagamos esse preço.
3. Vínculo **arquétipo ↔ skills** em `skills_claude.py`, que hoje não existe.
4. O histórico do agente paginado, com o mesmo cursor `data|id` do Runtime.
