# Acervo e mapas — separar quem de onde

**Data:** 21/09/2026 · **Estado:** SUPERADO no mesmo dia, antes de começar.

> O dono escolheu o caminho oposto e mais simples: **nada se mistura**. Cada
> projeto continua inteiro e fechado, com abas de projeto no casco e um só
> projeto LIGADO por vez — o play. O que atravessa a fronteira é um gesto
> explícito: enviar o **arquétipo** de um agente para outro projeto, sem papel,
> sem squad e sem histórico. Ver `docs/NOCTIS.md`, seção do projeto ligado.
>
> Este documento fica como registro do raciocínio e dos números medidos — 37
> agentes, 71 memórias, 142 eventos, 3 nomes em conflito. Se um dia a
> necessidade de acervo compartilhado voltar, a análise está aqui.

---

## 1. O que está errado hoje

A pasta do projeto é a fronteira de tudo: agente, memória, habilidade, squad, XP
e organograma moram dentro dela. Reaproveitar um agente só tem uma forma —
copiar o yaml. E então existem dois agentes que eram um: divergem no prompt, e
cada um tem um histórico que nunca soma com o outro.

O número exato do estrago, medido hoje:

| Projeto | Agentes | Memórias | Mapas | Habilidades | Eventos |
|---|---:|---:|---:|---:|---:|
| tessera_web_site | 26 | 63 | 5 | 0 | 126 |
| sciensa | 9 | 8 | 1 | 0 | 0 |
| noctis | 2 | 0 | 1 | 6 | 16 |
| *(5 pastas sem conteúdo do Noctis)* | 0 | 0 | 0 | 0 | 0 |

Três nomes já existem em dois lugares com **conteúdo diferente**: `pen_dev`
(noctis, tessera_web_site), `qa` e `redator` (sciensa, tessera_web_site). Não são
cópias desatualizadas de um mesmo agente — são agentes distintos que disputam o
mesmo nome. A migração precisa tratar isso explicitamente.

---

## 2. O modelo

Três coisas que hoje são uma só:

| Camada | O que é | Onde mora |
|---|---|---|
| **Arquétipo** | Quem o agente é: prompt, ferramentas, temperatura, tags | `acervo/agentes/<nome>.yaml` |
| **Mapa** | Um recorte de trabalho — o antigo projeto | `mapas/<slug>/` |
| **Vínculo** | O que só vale naquele mapa: apelido, papel, squad, card | `mapas/<slug>/membros.json` |

**As quatro decisões de formato, já tomadas:**

1. **O mesmo arquétipo pode aparecer mais de uma vez no mesmo mapa**, com
   apelido. Então o vínculo tem id próprio (`vin_xxxx`), e não é a chave
   (arquétipo, mapa). Dois "Engenheiro" em squads diferentes são dois vínculos
   do mesmo arquétipo, com XP separado.
2. **Memórias viram acervo único e pertencem a mapas** (N:N). Uma memória de
   marca vale no Tessera e no Sciensa sem cópia. O canvas já referencia recursos
   por id, então metade disto já existe.
3. **Habilidades são globais.** "Diagramar mock de plataforma" é conhecimento,
   não projeto. Cada tese validada anota em que mapa nasceu.
4. **XP soma nos dois.** Cada evento passa a carregar `mapa` e `vinculo`. A
   ficha do arquétipo mostra a vida inteira; a do vínculo mostra aquele
   contexto. Uma gravação, duas leituras.

### O desenho em disco

```
acervo/
  agentes/<nome>.yaml          o arquétipo, um arquivo por agente
  memoria/<nome>.md            o acervo de memórias
  habilidades/skills.json      identidade, tags, enquadramento
  habilidades/<id>.md          o documento da habilidade
  progresso/eventos.jsonl      UM log, cada evento com mapa + vinculo
mapas/<slug>/
  mapa.yaml                    nome, descrição, cor, ícone
  membros.json                 os vínculos: arquétipo, apelido, papel, squad
  squads.json                  as squads daquele mapa
  organizacao.json             o arranjo do canvas da organização
  canvases/*.json              os mapas de memória
  pertence.json                que memórias e habilidades entram neste mapa
  outputs/
```

### O vínculo, em campo

```json
{ "id": "vin_7c21", "arquetipo": "pen_dev", "apelido": "Pen Dev · Tessera",
  "papel": "lider", "squad": "conteudo", "desde": "2026-09-21" }
```

O apelido é opcional: sem ele, o card mostra o nome do arquétipo. Nada aqui
descreve o agente — descreve o lugar dele naquele trabalho.

---

## 3. O que quebra, e o que fazer

| Quebra | Tratamento |
|---|---|
| `xp.py <projeto> <agente> …` | O primeiro argumento passa a ser o mapa. Quando o agente tem mais de um vínculo ali, o comando exige `--vinculo`; com um só, resolve sozinho. |
| `/api/projects/<slug>/…` | Continua respondendo, apontando para `mapas/<slug>`. Rota nova `/api/acervo/…` para o que é global. |
| 142 eventos sem `mapa` | Migração carimba o mapa de origem pela pasta em que o evento estava. Nada é reescrito além disso. |
| 3 nomes em conflito | Viram arquétipos distintos com sufixo do mapa de origem (`qa_sciensa`, `qa_tessera`), e você decide depois se algum par vira um só. Fundir é fácil; separar depois de fundir, não. |
| Sessões abertas do Studio | A migração roda com a UI fechada. Com ela aberta, o canvas em memória sobrescreve o disco — já aconteceu nesta máquina. |
| `projects/` com repositórios de código | Continuam protegidos e fora da migração: pasta com `.git` e sem `project.yaml` não é mapa. |

---

## 4. As fases

Cada fase entrega algo utilizável e é reversível sozinha. Nenhuma depende de a
seguinte existir.

**F0 · O evento aprende onde aconteceu.** Todo registro novo grava `mapa`. O log
segue onde está. Sem isso, nenhuma leitura dupla de XP é possível depois.
*Entrega:* `progresso.py` e `xp.py` gravando o campo; leitura tolerante a
eventos velhos sem ele.

**F1 · O acervo de agentes.** Os 37 yaml sobem para `acervo/agentes/`, com os 3
conflitos resolvidos por sufixo. Cada mapa ganha `membros.json` com um vínculo
por agente que tinha. *Entrega:* a tela de Agentes lê o acervo; a Organização lê
os vínculos. O gesto de arrastar continua igual.

**F2 · Vínculo é coisa na tela.** Apelido, e o mesmo arquétipo mais de uma vez no
mapa. O card passa a mostrar apelido + arquétipo em cima. *Entrega:* "+ Agente"
ganha um terceiro grupo — os arquétipos do acervo que ainda não estão neste mapa.

**F3 · Memória vira acervo.** As 71 memórias sobem para `acervo/memoria/`, e cada
mapa guarda em `pertence.json` quais entram nele. O canvas não muda: ele já
referencia por id. *Entrega:* uma memória pode estar em dois mapas sem cópia, e a
doca mostra em quais.

**F4 · Habilidade global.** `skills.json` sobe para o acervo. As teses passam a
anotar o mapa de origem. *Entrega:* a habilidade aprendida no Tessera aparece
para o agente que trabalha no Sciensa.

**F5 · A dupla leitura do XP.** Ficha do arquétipo (a vida) e ficha do vínculo (o
contexto), lado a lado. *Entrega:* os discos do card mostram o XP do vínculo, e a
doca mostra os dois.

**F6 · Projeto vira mapa na linguagem.** Renomear na UI, no NOCTIS.md e nos
comandos. Último de propósito: trocar nome antes de o modelo estar de pé só
confunde.

---

## 5. O que este plano não resolve

- **Isolamento entre clientes.** Com memória em acervo único, nada impede que
  uma memória do Sciensa seja posta num mapa da Tessera — é um gesto seu, não um
  acidente, mas não há trava. Se isso virar risco, a trava é uma marca de
  confidencialidade na memória, não um retorno às pastas.
- **Merge de arquétipos.** Fundir `qa_sciensa` e `qa_tessera` depois exige
  decidir o que fazer com dois históricos. Fica para quando você quiser.
- **Quem herda o quê.** Um arquétipo com aprendizados validados em três mapas
  leva os três para o quarto. Pode ser exatamente o que você quer, ou ruído.
  Só dá para saber medindo, depois da F4.
