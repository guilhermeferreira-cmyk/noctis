# Skill vira Learning — e aprendizado passa a ser obrigatório

**Data:** 22/09/2026 · **Estado:** EXECUTADO de ponta a ponta em 22/09/2026
(F0 revisada, F1+F2, F3, F4, F5). As decisões que o plano deixou em aberto,
resolvidas: prefixo das regras = `learning.*`; nenhum alias retrocompatível no
CLI, porque `-s/--skill` foi REAPROVEITADO para o `SKILL.md` do Claude (F5) e um
alias silencioso passaria Learning como Skill; a escrita no log continua usando
a chave `habilidades` e ganha a chave nova `skills`; recusar-sem-Learning nasce
atrás da regra `learning.exigir_no_trabalho`, desligada (aviso primeiro).

---

## 1. O problema, em uma frase

A palavra "skill" está fazendo dois trabalhos que não são o mesmo trabalho: o
repertório que o Noctis vem construindo a sessão inteira (XP, portadores,
teses, propostas) usa o nome "skill/habilidade" — e é exatamente o nome que o
Claude usa para uma coisa diferente e concreta: um `SKILL.md` empacotado,
descoberto e executado pelo Claude Code. As duas coisas vão continuar
existindo lado a lado no mesmo projeto — por isso não dá para a mesma palavra
seguir servindo às duas.

**A decisão, como foi dada:**

| Nome | O que é | Onde vive |
|---|---|---|
| **Skill** | Exatamente a definição do Claude: um procedimento em `SKILL.md`, empacotado, que o Claude Code descobre e roda | Visível também dentro dos projetos do Noctis, mas não é gerido por XP/tese — é o formato nativo |
| **Learning** | O que hoje se chama habilidade/skill no Noctis: conhecimento que nasce do trabalho, com portador, XP, tese, proposta | `repertorio.py` / `skills.json` por baixo (nome de arquivo não muda agora — ver §4) |

E duas regras novas, ditas quase como requisito de protocolo:

1. **Todo comando de trabalho (`xp.py … entrega|output|correcao|…`) precisa
   carregar um Learning** — citar um que já existe, observar um domínio, ou
   propor um novo. Não é mais opcional.
2. **Toda proposta de Learning exige resposta do dono, sempre** — aceitar,
   recusar ou pedir ajuste. Recusar também é aprendizado ("isto não é a
   competência"), e por isso conta como resposta válida, não como ausência
   dela. O que fica proibido é o silêncio: uma proposta sem veredito para
   sempre.
3. **O dashboard (Home/Warden) precisa destacar essas dúvidas coletadas** —
   as propostas de Learning esperando você, em destaque, não escondidas numa
   aba.

---

## 2. O que "Skill" (Claude) ganha agora

Hoje o Noctis não lê nem lista `SKILL.md` nenhum, e não sabe quando um agente
usa um — a regra `habilidades.skills_nativas_intocaveis` só *proíbe* agentes
de MEXEREM nisso (criar, editar, apagar), não fala de USAR. O pedido que
chegou depois deste plano ser escrito muda o corte: o agente precisa poder
usar Skills e avisar que está usando, e você precisa de um lugar para ver
isso — ao vivo e no histórico. Esse lugar é o **Runtime**, descrito na F5
(§5), que passou a ser parte deste plano e não uma frente à parte.

---

## 3. O que "Learning" herda do que já existe

Learning é o mesmo modelo de dados de hoje, com nome novo e duas obrigações
novas. Ele herda inteiro:

- portador, XP, nível, curva (`xp.curva_skill` → `xp.curva_learning`);
- estado (broto/firmada/arquivada);
- tags livres;
- **teses** (o executor propõe o que descobriu sobre um Learning que já
  existe, o dono confirma/refuta/ajusta) — sem mudança de comportamento, só
  de nome;
- **propostas** (o agente propõe um Learning novo, o dono decide) — aqui é
  onde as duas obrigações novas encostam.

---

## 4. A superfície do rename — medida, não estimada

Grep feito nesta sessão, antes de escrever este plano:

| Camada | Quantidade | Exemplos |
|---|---:|---|
| Rotas no backend (`/skills*`, `/teses-da-skill*`) | ~20 | `/skills`, `/skills/{chave}`, `/skills-tags`, `/skills-consulta`, `/skills-orfas`, `/skills/{chave}/promover`, `/skills/{chave}/vincular`, `/teses-da-skill*` |
| Regras do catálogo (`habilidades.*`, `protocolo.*habilidade*`) | 12 | `habilidades.so_o_dono_cria`, `habilidades.agente_propoe`, `habilidades.skills_nativas_intocaveis`, `protocolo.declarar_habilidades`, `protocolo.cobrar_habilidade` |
| Arquivos Python que mencionam skill/habilidade | 11 | `repertorio.py`, `teses.py`, `enquadramento.py`, `aprendizado.py`, `progresso.py`, `nocturn.py`, `diagnostico.py`, `main.py`, `regras.py`, `xp.py`, `instalar_protocolo.py` |
| Arquivos TS/TSX que mencionam skill/habilidade | 22 | `Habilidades.tsx`, `DrawerSkill.tsx`, `PainelSquadsTags.tsx`, `PainelTeses.tsx`, `Progresso.tsx`, `ResourceCard.tsx`, `api.ts`, `Home.tsx`, `Organizacao.tsx`, `Aprender.tsx`, `Controle.tsx`… |
| Flags do CLI (`tools/xp/xp.py`) | 6 | `-s/--skill`, `--anotar SKILL:TEXTO`, `--tese "HABILIDADE: …"`, `--propor`, `--especie`, `--nova` (já morta) |
| O bloco de protocolo instalado em TODO agente | 1 texto, N agentes | `instalar_protocolo.py::bloco_para` — precisa reinstalar em cada projeto depois |

Não é um find-and-replace de uma palavra: rotas, chaves de JSON salvas em
disco (`skills.json`, os `chave` dentro dos eventos do log), flags de CLI que
já estão documentadas no `system_prompt` de cada agente, e o texto que
aparece para você na tela — tudo isso muda junto ou fica inconsistente.

---

## 5. As fases

Cada fase é um commit possível sozinho, e a ordem existe para nunca deixar o
sistema num estado em que agente e tela discordam sobre o nome da coisa.

### F0 — Vocabulário: só o texto que você lê
Troca **label**, sem tocar em rota, campo ou arquivo: toda tela que hoje diz
"Habilidade"/"Skill" (referindo-se ao repertório) passa a dizer "Learning".
Nenhuma URL muda, nenhum dado migra. É reversível trocando strings de volta.
*Risco:* zero. *Entrega:* você já vê "Learning" em vez de "Habilidade" em
toda a UI, e os agentes ainda falam com as rotas antigas por baixo.

### F1 — As rotas e os campos, de uma vez
Renomeia de fato: `/skills*` → `/learnings*`, `skills.json` → mantém o
arquivo (só o conteúdo interno já usa `learning` como termo em textos
gerados, não como chave JSON — chave JSON muda seria reescrever todo
histórico), regras `habilidades.*` → `aprendizado.*` ou similar (a decidir o
prefixo exato quando for executar), `xp.curva_skill` → `xp.curva_learning`.
*Risco:* médio — é o commit que quebra qualquer coisa apontando para a rota
velha. *Mitigação:* como só esta máquina consome a API, não há cliente
externo a avisar; o risco real é esquecer uma referência. *Entrega:*
`api.ts` e o backend concordam nos nomes novos; `tsc --noEmit` e um teste
manual por módulo confirmam.

### F2 — O CLI e o protocolo
`xp.py`: `-s/--skill` → `-l/--learning`, `--tese "HABILIDADE: …"` → `--tese
"LEARNING: …"`, `--propor` continua (já era genérico). O bloco de protocolo
(`instalar_protocolo.py`) é reescrito com a linguagem nova e **reinstalado
em todo agente de todo projeto** — é o mesmo comando que já rodamos várias
vezes nesta sessão (`python tools/xp/instalar_protocolo.py <projeto>`), só
que agora em `noctis`, `sciensa` e `tessera_web_site`, não só no primeiro.
*Risco:* um agente com o prompt antigo tentando `-s` depois de a rota mudar
falha alto — por isso F1 e F2 andam no mesmo commit na prática.

### F3 — As duas obrigações novas
1. **`xp.py` exige Learning em toda chamada de trabalho.** Sem `-l`
   (citando um Learning existente), `--observei`, ou `--proponho-learning`
   (novo nome de `--propor` só neste contexto, a decidir), o comando recusa
   com uma mensagem que diz o que falta — do mesmo jeito que hoje já recusa
   sem tipo/resumo.
2. **Toda proposta de Learning fica sem "silêncio possível".** Hoje uma
   proposta pode ficar `pendente` para sempre sem consequência visível fora
   da tela de Habilidades. Aqui: o NOCTURN passa a contar isso como pendência
   de primeira classe (já existe `pendentes` em `/api/projects/{p}/propostas`
   — o que falta é ele entrar no relatório do NOCTURN e no contador da barra
   de status).
*Risco:* alto de fricção — agentes em despachos já abertos vão começar a
tomar recusa do `xp.py` se o protocolo deles não foi atualizado (daí F2 vir
antes). *Decisão pendente:* se **recusar** o registro de trabalho sem
Learning, ou **aceitar com aviso** por um período de transição — recomendo
aviso primeiro, recusa depois de um dia de uso, para não travar despacho em
andamento no meio da mudança.

### F4 — O destaque no dashboard
Home ganha uma seção **acima** de "Mexidos por último" — não dentro dela —
listando as propostas de Learning pendentes de TODOS os projetos (mesmo
padrão do catálogo: lido do cache local, com o selo do projeto de origem).
Cada linha abre direto no card de decisão que já existe em Habilidades
(aceitar/recusar/ajustar), sem precisar navegar até lá primeiro.
*Entrega:* abrir o Warden e ver, em destaque, "3 Learnings esperando você",
sem precisar caçar.

### F5 — Skill (Claude), em uso: o Runtime

Revisto depois do pedido seguinte: não basta LISTAR os `SKILL.md` que
existem — o agente precisa poder **usá-los** e **avisar que está usando**, e
você precisa de um lugar para ver isso acontecer, ao vivo e no histórico.
Chamo esse lugar de **Runtime**, porque é isso que ele mostra: o sistema
rodando, não o repertório guardado.

**O que não muda:** Skill continua sem XP, sem tese, sem proposta — ele é o
formato do Claude, o Noctis não é dono dele. O que este runtime adiciona é
só **observação**: quem usou o quê, quando, em qual despacho.

**O desenho, reaproveitando o que já existe.** O evento de trabalho
(`registrar_evento`, em `progresso.py`) já carrega uma lista por evento —
`habilidades: [...]` são os Learnings citados, `aprendizados: [...]` são os
`apr_xxxx` aplicados. Um Skill usado é a mesma forma de dado: **uma lista
nova no mesmo evento**, `skills: [...]` (nomes ou ids dos `SKILL.md`
usados), gravada no mesmo fôlego do `xp.py` que já registra o resto do
trabalho — não é preciso inventar um segundo ciclo de "comecei a usar /
terminei de usar": o Skill do Claude é consumido dentro de UM turno de
trabalho, então declarar no momento em que o trabalho é registrado já é o
momento certo.

    xp.py <projeto> <agente> entrega "o que fez" --skill nome-do-skill-md

**O Runtime, como tela:**

- **Agora** — os eventos de todos os projetos (mesmo padrão do catálogo do
  Warden: lido do cache, sem recomputar nada pesado) que citaram algum
  Skill nos últimos minutos, com o agente, o despacho e o skill, num pulso
  vivo — literalmente os eventos mais recentes com `skills` não vazio, sem
  precisar de heartbeat nem de um "terminei" explícito.
- **Histórico** — a mesma lista, sem o corte de tempo, agrupável por Skill
  (qual é mais usado, por quem, em qual projeto) ou por agente (o que cada
  um anda usando). É consulta sobre o log append-only — nada novo para
  gravar além do campo `skills` no evento.

**O que falta para além do campo no evento:**

1. Um jeito de o CLI **descobrir os nomes válidos** de Skill para sugerir ou
   validar (`--skill` livre hoje aceitaria `--skill algo-que-nem-existe`
   sem aviso) — depende de onde os `SKILL.md` do projeto ficam no disco; a
   listagem somente-leitura que era o F5 antigo continua sendo um
   pré-requisito deste, só que agora alimenta o autocompletar/validação em
   vez de ser o produto final.
2. A tela Runtime em si (`pages/Runtime.tsx`, um ícone novo na faixa,
   registro em Configurações › Ícones e cores como as outras seções) — o
   "Agora" no topo, o "Histórico" abaixo, com o mesmo filtro por projeto
   que Cosmos e Habilidades já ganharam.
3. Decisão em aberto: **"agora" é definido por quê.** Sugiro uma janela fixa
   (por exemplo, eventos dos últimos 15 minutos) em vez de um sinal
   explícito de início/fim, porque é o que o dado já dá de graça; se um
   despacho realista demorar mais que isso e ainda estiver "rodando", o
   Runtime já teria passado a mostrá-lo como histórico recente — aceitável
   para a primeira versão, revisitável se a janela se mostrar curta ou
   longa na prática.

---

## 6. O que este plano não resolve, e por quê

- **Chave JSON dos eventos antigos** (`{"skill": "..."}` no log append-only)
  não é reescrita — o log é append-only por regra fixa, e reescrever
  histórico para trocar uma palavra quebraria essa garantia. A LEITURA passa
  a entender os dois nomes (compatibilidade de leitura), a ESCRITA nova só
  usa o nome novo.
- **O prefixo exato das regras novas** (`aprendizado.*` vs `learning.*`) fica
  para a hora de executar — é escolha de estilo, não de arquitetura, e o
  catálogo de regras já mistura português e inglês pontualmente
  (`xp`, `nocturn`); decido no commit olhando o que soa melhor ao lado do
  resto.
- **Recusar vs avisar** no F3 (ver acima) — decisão de rollout, não de
  design; proponho aviso-depois-recusa e sigo com isso se não vier
  objeção.

---

## 7. Ordem sugerida de execução

F0 → F1+F2 juntas → F3 → F4. **F5 (o Runtime) pode andar em paralelo com F3/
F4** — ela mexe em código diferente (o campo `skills` do evento, uma tela
nova) e não depende do rename de Learning estar pronto para existir; só
depende de o campo novo ter sido acrescentado ao evento. Cada fase termina
com `tsc --noEmit` limpo e um teste manual do fluxo completo — para o
Runtime, isso é: registrar um evento com `--skill`, ver aparecer em "Agora",
esperar a janela passar, ver aparecer em "Histórico".
