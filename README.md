# Noctis

**Base de conhecimento, Learnings e aprendizado para organizações de agentes.**

Ferramenta pessoal, aberta porque pode servir a alguém com o mesmo problema: um
time de agentes de IA que trabalha todo dia e **começa do zero toda vez**.

A maioria dos sistemas de agentes trata cada execução como evento isolado.
Mesmo quando há memória, ela guarda conversa. O Noctis guarda outra coisa: o que
o trabalho deixou — e transforma correção humana em capacidade reutilizável.

```
Você → Maestro → Líder de squad → Agente
                                     ↓
                        observa · propõe hipótese
                                     ↓
                     você responde → aprendizado validado
                                     ↓
                        volta no próximo despacho, por referência
```

## O que ele faz

- **Memória de projeto** que entra no prompt dos agentes, com tipo, peso e mapa
  visual das relações.
- **Learnings** descritas por teses fechadas, não por texto livre: o sistema
  pergunta, você escolhe, e a resposta pode ser comparada entre Learnings.
- **Loop de aprendizado**: o agente observa o trabalho real e propõe hipótese com
  a pergunta que a resolveria; você confirma, refuta ou corrige; o que você
  validou volta nos despachos seguintes e o reuso é medido.
- **XP e níveis por projeto**, incluindo o trabalho de quem coordena — despachar
  vale mais quando o despacho vira entrega confirmada.
- **Organização explícita**: papéis e squads como dado, não como frase no prompt.
- **NOCTURN**, um supervisor permanente que ronda os projetos e traz o que
  apodreceu: agente parado, entrega sem confirmação, Learning sem descrição.
- **42 regras em um registro único**, todas legíveis e editáveis no painel. O
  código lê do registro: o que a tela mostra é o que acontece.

## Quatro teses de desenho

1. **Objetivos descem, conhecimento sobe.**
2. **Memória registra; aprendizado generaliza.**
3. **O humano define significado; o agente descobre padrões** — o agente propõe,
   nunca conclui.
4. **Contexto viaja por referência**, não copiado: id e uma linha, corpo sob
   demanda.

## Instalar

```bash
# API (FastAPI, porta 5501)
pip install -r studio/api/requirements.txt
python -m uvicorn main:app --port 5501 --app-dir studio/api

# Interface (Vite, porta 5502)
cd studio/ui && npm install && npm run dev
```

Ou, no Windows, `studio.bat`.

Abra http://localhost:5502. O primeiro projeto se cria na própria interface.

## Como os agentes usam

Cada agente recebe no `system_prompt` um bloco curto, montado a partir das
regras e reinstalado sozinho quando elas mudam:

```bash
# antes de começar: leia o que o projeto já aprendeu
python tools/xp/xp.py <projeto> <agente> --consultar "assunto da tarefa"

# ao terminar: registre o trabalho e o que ele exercitou
python tools/xp/xp.py <projeto> <agente> entrega "o que fez" \
    -l "learning: o que é" -a arquivo/tocado.tsx --dif media

# aplicou um aprendizado validado? cite o id
python tools/xp/xp.py <projeto> <agente> --usei apr_xxxx

# viu algo que pode virar padrão? observe, e depois proponha
python tools/xp/xp.py <projeto> <agente> --observei "dominio: o que viu"
python tools/xp/xp.py <projeto> <agente> \
    --suponho "dominio: a generalização" --pergunta "o que perguntar" \
    --opcao "causa A" --opcao "causa B"
```

O XP é calculado no servidor, a partir do histórico. Nenhum agente se pontua.

## Os dados são seus, e são arquivos

Nada de banco. Um projeto é uma pasta:

```
projects/<slug>/
  agents/*.yaml            prompt, papel, squad
  memory/*.md              as memórias
  skills.json  skills/*.md os Learnings e seus documentos
  squads.json              as squads
  canvases/*.json          os mapas
  progresso/eventos.jsonl  o histórico, append-only — nada é reescrito
```

O histórico só cresce: confirmação, fusão e destruição entram como registros
novos. O estado é recalculado a cada leitura, e é por isso que mudar uma regra
reconta o passado por ela.

**Este repositório traz a ferramenta, não os dados.** `projects/` está no
`.gitignore`: as memórias, os prompts e o histórico são de quem usa.

## Documentação

- [docs/NOCTIS.md](docs/NOCTIS.md) — referência completa: entidades, registros do
  log, regras, protocolo, endpoints, arquivos.
- [docs/PLANO-CONTROLE.md](docs/PLANO-CONTROLE.md) — o que falta e em que ordem.

## Estado

Em uso diário, e em construção. Fora do escopo por ora: compute em níveis e
escolha de provedor por tarefa, protocolo formal de despacho, e exportação das
Learnings como `SKILL.md` para o Claude Code.

Python 3.11+, Node 18+. Sem dependência de nuvem: roda na sua máquina.
