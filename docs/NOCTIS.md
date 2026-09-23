# Noctis — referência

**Versão do documento:** 21/09/2026. Escrito para quem precisa entender o
sistema por dentro: cada entidade, cada arquivo, cada regra, cada endpoint.

O Noctis é uma base de conhecimento e aprendizado para organizações de agentes.
Não é um gerenciador de prompts: o que ele guarda é o que o trabalho deixou —
memórias, Learnings, aprendizados validados, e quem aprendeu o quê.

**Quatro teses que explicam quase toda decisão de desenho aqui:**

1. **Objetivos descem, conhecimento sobe.** O comando vai do dono ao Maestro, do
   Maestro à squad, da squad ao agente. O aprendizado faz o caminho inverso.
2. **Memória registra; aprendizado generaliza.** "Ele achou a home corporativa" é
   memória. "Pouca presença humana com hierarquia rígida soa corporativo" é
   aprendizado — e só existe depois que o dono validou.
3. **O humano define significado; o agente descobre padrões.** O agente observa e
   propõe hipótese. Nunca conclui.
4. **Contexto viaja por referência.** O agente recebe ids e uma linha; busca o
   corpo quando interessa.

---

## 1. As entidades

| Entidade | O que é | Onde mora |
|---|---|---|
| **Projeto** | Um escopo inteiro: agentes, memórias, Learnings, histórico | `projects/<slug>/` |
| **Agente** | Quem executa. Prompt, papel e squad | `agents/<nome>.yaml` |
| **Squad** | Como o trabalho se divide: nome, cor, ícone, do que cuida | `squads.json` |
| **Memória** | O que o projeto sabe: fatos, decisões, referências | `memory/<nome>.md` |
| **Fluxo / Persona** | Receitas de trabalho e vozes | `flows/`, `personas/` |
| **Mapa** | O arranjo visual das memórias | `canvases/<id>.json` |
| **Learning** | Um procedimento de trabalho, descrito por teses | `skills.json` + `skills/<id>.md` |
| **Observação** | O que um agente viu, sem conclusão | registro no log |
| **Hipótese** | Generalização candidata, com a pergunta que a resolve | registro no log |
| **Aprendizado** | O que o dono validou. É o que volta aos despachos | registro no log |
| **Evento** | Um trabalho registrado — a origem do XP | registro no log |

**A base permanente.** O projeto `noctis` não se apaga nem se renomeia, e toda
consulta de qualquer projeto também busca nele. É onde mora o conhecimento que
atravessa projetos.

---

## 2. O histórico de trabalho

Tudo que acontece entra em `progresso/eventos.jsonl`, **append-only**: uma linha
JSON por registro, nada é reescrito. O estado é recalculado a cada leitura — é
isso que permite mudar uma regra e ver o passado recontado por ela.

| Registro | Escrito por | O que diz |
|---|---|---|
| `evento` | agente | fez um trabalho: tipo, resumo, Learnings, evidência, dificuldade |
| `confirmacao` | dono | aquela entrega serviu |
| `marco` | agente | o que mudou para ele ao subir de nível num Learning |
| `fusao` | dono | duos Learnings eram a mesma |
| `destruicao` | dono | o Learning não volta, mesmo citada em evento antigo |
| `observacao` | agente | o que viu, sem concluir |
| `hipotese` | agente | generalização candidata + a pergunta |
| `resposta` | dono | confirma, refuta, corrige, ou "a pergunta está errada" |
| `aprendizado` | dono | o que fica valendo |
| `aposentadoria` | dono | já valeu, e explica decisões antigas |

### Os tipos de evento e o XP

`entrega` 60 · `output` 25 · `correcao` 20 · `revisao` 15 · `memoria` 15 ·
`decisao` 10 · `despacho` 12 · `resposta` 10 · `consolidacao` 20 ·
`retrabalho` 0 — valores base, editáveis em Configurações › XP e níveis.

Os três de coordenação existem porque coordenar é trabalho: sem eles, Maestro e
líderes ficavam no nível 1 para sempre. A base é baixa de propósito — quem
coordena sobe pelo **bônus de 1,8× quando o despacho vira entrega confirmada**.
Os dois lados se encontram pelo nome do despacho (`-d`).

Sobre a base incidem: dificuldade (0,9–1,7), volume de evidência (até +50%),
confirmação (×1,25), descoberta de Learning nova (×1,35), e o teto por evento.
Trabalho repetido na mesmo Learning no mesmo dia vale menos depois da
saturação diária.

**Confirmação:** autoconfirmação é recusada sempre. Por padrão, só o dono
confirma — regra `xp.confirmacao_so_do_dono`.

---

## 3. Learning

Um Learning nasce com **um nome só**. O resto o Noctis descobre perguntando, e
todas as perguntas são fechadas — tese em bool, radio ou múltipla escolha. Campo
aberto não se compara entre Learnings; tese marcada, sim.

**As cinco perguntas de fábrica:** quando entra · tem passo a passo · onde se
erra · como se prova · o que pesa no julgamento. Editáveis, uma a uma, em
Configurações › Perguntas e teses, com a contagem de quantos Learnings
marcaram cada tese — tese com zero é tese ruim.

"Nenhuma delas" fecha a pergunta e ela não volta. As escolhas viram frases no
documento do Learning, que é o texto que os agentes leem na consulta.

**Documento próprio.** Você pode escrever markdown inteiro no lugar disso. Ao
salvar, o documento passa a ser seu: as teses continuam guardadas, mas param de
remontá-lo (`corpo_curado`).

**Tags, não categorias.** Agrupamento livre, vocabulário nascido do uso, até 8
por Learning. Nome próprio de projeto, cliente ou arquivo é recusado — isso é
memória. Agente não cria tag; usa as que existem.

**Estados:** broto → firmada (3 eventos no projeto, por quem for) → arquivada.

---

## 4. O loop de aprendizado

```
trabalho real
   ↓  o agente observa                 --observei "dominio: o que viu"
observação
   ↓  com 2+ observações, ele propõe   --suponho "..." --pergunta "..." --opcao A --opcao B
hipótese  (confiança calculada)
   ↓  pergunta na Learning Inbox       aba Aprender, no NOCTURN
sua resposta   confirma · refuta · corrige (escolhendo a causa) · a pergunta está errada
   ↓
aprendizado  (escopo: agente, projeto ou global)
   ↓  volta por referência na consulta  APRENDIZADOS: apr_xxxx
próximo trabalho   --usei apr_xxxx  → conta como reuso
```

**Confiança** = base + 0,06 × observações (até 6) + 0,20 × confirmações − 0,30 ×
refutações, entre 0,02 e 0,95. Refutar pesa mais do que confirmar: derrubar é
mais informativo, e o sistema deve desconfiar rápido. Nunca chega a 1 — nada
aqui é verdade, só probabilidade. Abaixo de 0,7 o aprendizado é **frágil**.

**A fila é ordenada por incerteza**, não por data: hipótese perto de 50% é a que
mais ensina quando respondida.

**"A pergunta está errada"** é botão de primeira classe. Sem ele, uma pergunta
mal feita só aceita sim ou não, e o sistema aprende uma causa falsa com confiança
alta — foi o caso real da simetria que era hierarquia.

**Reuso é a medida que importa.** Aprendizado validado que ninguém aplica é
enfeite, e o Diagnóstico cobra isso.

---

## 5. A organização

```
Você → Maestro → Líder de squad → Agente
```

Dois campos no yaml do agente: `papel` (maestro, lider, agente) e `squad`. A
identidade da squad mora em `squads.json`. Squad citada num yaml e ausente do
registro é adotada na leitura, então nada se perde quando um agente inventa uma
squad no meio de um despacho.

**Você e os agentes** criam e editam squads. Diferente dos Learnings, aqui não
há o que proteger de palpite: desenhar a organização é parte do trabalho deles, e
o desenho errado aparece na hora na vista.

**Papel não é capacidade.** O Maestro não precisa ser o modelo mais forte — ele
é o que tem a visão do todo. Compute por papel ainda não existe no Noctis.

**Organização rasa é legítima:** sem squad nenhuma, todos falam com o Maestro.

O protocolo é sensível ao papel: Maestro e líderes recebem no prompt as linhas de
despachar, responder e consolidar; agentes comuns não, para não gastar contexto.

---

## 6. As regras

**42 regras, 8 áreas**, em `studio/api/regras.py` (catálogo) e
`config/regras.json` (o que você alterou). O código lê sempre do registro: o que
o painel mostra é o que acontece.

| Área | Governa |
|---|---|
| protocolo | o que todo agente é obrigado a fazer, e quando |
| learning | como um Learning nasce, funde, e quem mexe nela |
| perguntas | as perguntas e teses que descobrem um Learning |
| aprendizado | como hipótese vira conhecimento validado |
| xp | quanto cada trabalho vale e quanto custa subir |
| organizacao | cores dos papéis e o que a vista cobra |
| nocturn | o que o supervisor cobra, e quais rondas ele faz |
| protecoes | o que o Noctis nunca deixa acontecer (fixas) |

Tipos de regra: `bool`, `int`, `float`, `mapa`, `curva`, `flags` (liga/desliga em
lote), `cores`, `perguntas` (editor próprio).

**Seis proteções fixas,** que não se desligam: a base não se apaga, repositório
de código não é projeto, excluir vai para a lixeira, o log só cresce, agentes só
mexem em skills criadas pelo Noctis, e o agente propõe mas você conclui.

---

## 7. O protocolo dos agentes

Bloco marcado `[noctis-xp]` instalado no `system_prompt` de todo agente, montado
a partir das regras e reinstalado sozinho quando elas mudam. O agente recebe:

- **ao começar:** `--consultar "assunto"` — e a consulta devolve os Learnings e
  os **aprendizados validados**, com id;
- **ao terminar:** `<tipo> "o que fez" -l "learning: o que é" -a arquivo`;
- **ao aplicar aprendizado:** `--usei apr_xxxx`;
- **ao declarar Skill do Claude:** `--skill <slug>` — o uso de um `SKILL.md`,
  que não rende XP e alimenta o Runtime;
- **ao observar:** `--observei "dominio: o que viu"`;
- **ao supor:** `--suponho "..." --pergunta "..." --opcao A --opcao B`;
- **quem coordena:** `despacho`, `resposta`, `consolidacao`.

---

## 8. Os comandos

```bash
# consultar, registrar, aprender
python tools/xp/xp.py <projeto> <agente> --consultar "assunto"
python tools/xp/xp.py <projeto> <agente> --briefing "assunto"
python tools/xp/xp.py <projeto> <agente> entrega "o que fez" -l "learning: o que é" -a arquivo
python tools/xp/xp.py <projeto> <agente> entrega "o que fez" -l learning --skill slug-do-skill-md
python tools/xp/xp.py <projeto> <agente> --usei apr_xxxx
python tools/xp/xp.py <projeto> <agente> --observei "dominio: o que viu"
python tools/xp/xp.py <projeto> <agente> --suponho "dominio: tese" --pergunta "?" --opcao A --opcao B
python tools/xp/xp.py <projeto> usuario --confirmar evt_xxxx
python tools/xp/xp.py <projeto> <agente> --aptidao "a,b,c"

# o supervisor
python tools/nocturn/nocturn.py ronda
python tools/nocturn/nocturn.py ouvir
python tools/nocturn/nocturn.py dizer "texto"

# o protocolo
python tools/xp/instalar_protocolo.py <projeto> [--remover] [--seco]
```

---

## 9. A API

Servida por `studio/api/main.py` (FastAPI, porta 5501). A interface é
`studio/ui` (Vite, porta 5502).

**Recursos** — `GET|POST|PUT|DELETE /api/projects/{p}/{agents|memory|flows|personas}[/{nome}]`,
mais `rename`, anexos de memória e exportação em PDF.

**Trabalho e XP** — `POST /eventos`, `POST /eventos/{id}/confirmar`,
`POST /marcos`, `GET /progresso`, `GET /aptidao`.

**Learnings** — `GET|POST /learnings`, `GET|PUT|DELETE /learnings/{chave}`,
`PUT|POST /learnings/{chave}/corpo`, `/promover`, `/vincular`,
`GET /learnings-consulta`, `GET|PUT|DELETE /learnings-tags[/{tag}]`,
`GET /teses`, `GET /enquadramento`, `POST /learnings/{chave}/enquadrar`,
`GET|POST /teses-do-learning`, `GET /learnings-orfaos`.

**Skill (do Claude) e Runtime** — `GET|POST /skills-claude`,
`PUT /skills-claude/{slug}/vincular`, `GET /api/todos/runtime` (quem usou qual
`SKILL.md`, com a janela de "agora" em minutos).

**O que espera por você** — `GET /api/todos/propostas`: as propostas de
Learning sem veredito, de todos os projetos.

**Aprendizado** — `GET /aprendizado`, `/aprendizado/inbox`, `/aprendizado/{chave}`,
`POST /observacoes`, `POST /hipoteses`, `POST /hipoteses/{id}/responder`,
`POST /aprendizados`, `DELETE /aprendizados/{id}`.

**Organização** — `GET /organizacao`, `PUT /organizacao/{agente}`,
`GET /organizacao/{agente}/cadeia`, `POST /squads`, `PUT|DELETE /squads/{chave}`.

**Sistema** — `GET /api/regras`, `PUT|DELETE /api/regras/{id}`,
`GET /api/regras/protocolo`, `GET /api/controle`, `GET /api/lixeira`,
`GET /diagnostico`, `GET /dados`, `GET /api/nocturn/relatorio`.

---

## 10. Os arquivos

```
projects/<slug>/
  project.yaml            nome e descrição
  agents/*.yaml           prompt, papel, squad
  memory/*.md             as memórias
  flows/*.yaml            os fluxos
  personas/*.yaml         as personas
  skills.json             identidade dos Learnings
  skills/*.md             o documento de cada uma
  squads.json             as squads
  resources.json          cor, ícone, tags, ativo de cada recurso
  canvases/*.json         o arranjo de cada mapa
  progresso/eventos.jsonl o histórico, append-only
  outputs/                o que os agentes produziram

config/
  regras.json             só o que você alterou
  aparencia.json          cores, ícones, logo, céu
  nocturn/conversa.jsonl  a conversa com o supervisor
```

Configurações › Dados e arquivos mostra isso com o tamanho de cada coisa.

---

## 11. O que ainda não existe

Do documento de produto, seguem fora: compute em níveis (L0–L3) e escolha de
provedor por tarefa, Command Envelope como protocolo formal de despacho,
Maestro Core e Squad Leader Core como System Skills, exportação dos Learnings
para `SKILL.md` no Claude Code, e o rastro de mudança das regras
(`config.jsonl`). O plano está em [PLANO-CONTROLE.md](PLANO-CONTROLE.md).
