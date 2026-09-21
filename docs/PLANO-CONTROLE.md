# Plano: documentar o Noctis e pôr tudo sob controle do dono

**Data:** 21/09/2026 · **Estado:** aprovado na conversa, não iniciado
**Objetivo do dono, nas palavras dele:** *"eu quero entender e controlar todos os
aspectos do Noctis até aqui"*.

Este documento existe porque o plano vivia só no chat. Ele é o que fica.

---

## 1. Onde estamos

**29 regras** no registro (`config/regras.json`, catálogo em `studio/api/regras.py`),
em seis áreas: protocolo (4), habilidades (6), aprendizado (4), XP (9),
supervisão (2), proteções (4). Seis são fixas — proteções que não se desligam.

O painel de Configurações já cobre: Interface, Projetos e lixeira, Aparência
(tipos, ícones, logo, céu, aura) e Agentes e aprendizado (protocolo, habilidades,
XP, NOCTURN, proteções).

## 2. O que ainda é código fixo, fora do alcance do dono

| Coisa | Arquivo | Por que importa |
|---|---|---|
| As 5 perguntas de habilidade e todas as teses de cada uma | `enquadramento.py` | É o que define o que uma habilidade é |
| Tipos de pergunta, vereditos, escopos do aprendizado | `aprendizado.py` | Governa o loop inteiro |
| Fórmula de confiança e corte de "frágil" | `aprendizado.py` | Decide em que o sistema confia |
| Papéis (Maestro, Líder, Agente): rótulo, cor, significado | `organizacao.py` | A cadeia de comando |
| Avisos da organização | `organizacao.py` | O que a tela cobra dele |
| Máximo de tags, peso de tag na consulta, mínimo de termo | `repertorio.py` | Como a consulta ordena |
| Espécie antiga (legado vivo) | `repertorio.py` | Resto da divisão que caiu |

**Cinco regras já prometidas e não entregues:** tipos de memória, pesos da
consulta, cobranças do CLI, rondas do NOCTURN ligáveis, meia-vida da saturação.

## 3. As quatro fases

### Fase 1 — Tudo no registro de regras

Toda constante da tabela acima vira regra legível e editável. Três áreas novas:

- **Perguntas** — texto e teses das cinco perguntas, editáveis; acrescentar,
  remover e reescrever tese. Exige um tipo novo de regra, `lista_de_teses`, com
  editor próprio.
- **Organização** — papéis e quais avisos aparecem.
- **Aprendizado** (expandir) — tipos de pergunta permitidos, escopos, pesos da
  fórmula de confiança, corte de frágil.

Mais as cinco pendentes, nas áreas que já existem.

**Critério de pronto:** nenhuma regra do Noctis mora só no código; o painel de
Regras é a verdade inteira.

### Fase 2 — As seções que faltam em Configurações

1. **Perguntas e teses** — editor das teses, com quantas habilidades marcaram
   cada uma. Tese que ninguém marca é tese ruim, e aparece como solta.
2. **Organização** — papéis, avisos, e as squads do projeto (criar, renomear,
   pintar, apagar) também aqui, não só na vista.
3. **Diagnóstico** — o que está inconsistente agora: habilidade sem tese
   respondida, hipótese esperando há dias, aprendizado sem reuso, agente sem
   squad, regra alterada em relação ao padrão.
4. **Dados** — onde cada coisa é gravada (`eventos.jsonl`, `skills.json`,
   `squads.json`, `skills/*.md`, `resources.json`, `canvases/`), com o tamanho
   de cada arquivo. Exportar em zip: **cortado por ora** — os dados já são
   arquivos legíveis na máquina dele.
5. **Habilidades** — o vocabulário de tags (fundir, renomear) que hoje só existe
   dentro da página.

### Fase 3 — Documentação, em três camadas

1. **`docs/NOCTIS.md`** — referência: cada entidade (agente, squad, memória,
   habilidade, tese, observação, hipótese, aprendizado), o ciclo de aprendizado,
   a organização, o formato de cada arquivo, cada endpoint, cada tipo de evento.
2. **`README.md` reescrito** — o repositório é público e o README ainda é
   interno. Passa a ter o que o Noctis é, as teses do produto, instalação e uso.
3. **Ajuda na tela** — um parágrafo por seção de Configurações dizendo o que
   aquilo governa, e uma seção **Manual** com o ciclo desenhado e os atalhos.
   Documentação fora do produto envelhece; a de dentro se lê na hora da dúvida.

### Fase 4 — Rastro de mudança

`config.jsonl`: o que mudou, quando, por quem, de que valor para qual. Hoje uma
regra muda e não há como saber quando. Cada seção passa a mostrar "alterada em
21/09, era 3". **Versionar teses com histórico fica fora** — pesado, e o rastro
já responde o essencial.

## 4. O que entrou depois do plano original

Estes itens são de 21/09, posteriores ao plano, e entram nas fases acima:

- **Squads com identidade própria** (`squads.json`): nome, cor, ícone, do que
  cuida. Você e os agentes criam e editam. → Fase 2, seção Organização.
- **Cards da organização mostrando o agente de verdade**: mesma cor, ícone, tags
  e disco de nível da grade. → nada a configurar, só documentar.
- **Perguntas fechadas por tese** (bool, radio, multi), com "nenhuma delas", e
  correção de hipótese por escolha em vez de texto. → Fase 1, área Perguntas.
- **Documento da habilidade em markdown livre**, marcado como curado: as teses
  param de remontá-lo. → documentar em `NOCTIS.md`.
- **XP de orquestração**: os tipos `despacho`, `resposta` e `consolidacao`, e o
  multiplicador de 1,8× quando o despacho vira entrega confirmada. O protocolo
  passou a ser sensível ao papel do agente. → já está no registro (2 regras);
  documentar e explicar na seção XP.

## 5. Ordem e por quê

1. **Fase 1** — é a base: sem as regras no registro, as seções da Fase 2 não têm
   o que editar.
2. **Fase 2**, nesta ordem: Perguntas e teses → Organização → Diagnóstico →
   Dados → tags em Habilidades.
3. **Fase 3** — documentação, quando o que se documenta parar de mudar toda hora.
4. **Fase 4** — rastro.

## 6. Decisões em aberto

- Começar pela Fase 1 inteira, ou entregar **Perguntas e teses** ponta a ponta
  primeiro, para ele sentir o desenho antes de eu migrar o resto?
- O README público apresenta o Noctis como **projeto pessoal** dele ou como
  **produto**?
- Confirmação de entrega: hoje qualquer agente confirma o trabalho de outro
  (foi o que o teste do XP de orquestração usou). Deve ser só dele?
