# dna — extrator de DNA visual

Instrumenta um site num Chromium real e devolve evidência medida: computed style,
caixa, cor convertida para RGB, hover disparado com o mouse, diff de estado antes e
depois do scroll, screenshots por viewport e por seção, vetores salvos em arquivo.

Não lê o que o site declara sobre si mesmo. Só o que o browser fez.

## Uso

```bash
cd meu_sistema/tools/dna

node dna.mjs map     https://site.com                  # sitemap → taxonomia → plan.json
node dna.mjs capture ../../outputs/dna/<pasta>/plan.json --concurrency 4
node dna.mjs rollup  ../../outputs/dna/<pasta>
```

Ou uma página só, sem plano: `node dna.mjs capture https://site.com/pagina`

| flag | efeito |
|---|---|
| `--out <dir>` | destino (default `outputs/dna/<host>_<data>`) |
| `--limit <n>` | corta o plano em n páginas |
| `--only <regex>` | filtra as URLs do plano |
| `--sample <n>` | representantes por template repetido (default 3) |
| `--concurrency <n>` | páginas em paralelo (default 3) |
| `--viewports <lista>` | default `1440,768,390` |
| `--fast` | só o viewport principal, sem recorte de seção |
| `--no-shots` | nenhum screenshot, nenhum SVG salvo |

Uma página com os três viewports leva ~45s. 80 páginas com `--concurrency 4`, ~20 min.

## O que sai

```
outputs/dna/<host>_<data>/
  plan.json  urls.txt  _capture-summary.json
  _rollup.md  _rollup.json      ← o que se repete no site inteiro (ubiquidade)
  pages/<slug>/
    page.md                     ← o relatório legível da página
    page.json                   ← bruto
    shot-1440.png  shot-768.png  shot-390.png
    sections/NN_tipo.png        ← cada seção recortada
    svg/                        ← vetores inline e externos
```

**Ubiquidade** (no rollup) = em quantas páginas o valor aparece. Alto é sistema,
baixo é exceção deliberada — e a exceção costuma ser o achado.

## O que ele mede

- **Tokens** — paleta por área ocupada e por contagem, custom properties do `:root`,
  fontes efetivamente carregadas, escala tipográfica por papel (h1…legenda), raios,
  sombras, gaps, padding vertical de seção, blend, backdrop-filter, filtros.
- **Estrutura** — seções na ordem com caixa medida, tipo detectado (hero, big-numbers,
  faixa-de-logos, grid-de-cards, cta-final…), grid e gap de cada uma, larguras de
  container, header e o que muda nele ao scrollar.
- **Motion** — durações, curvas, propriedades animadas, `@keyframes` (inclusive de CSS
  cross-origin, extraídos do arquivo baixado), libs detectadas, `prefers-reduced-motion`,
  e o **diff de revelação**: estado no load × estado depois de percorrer a página.
- **Ilustração** — SVG por peça (nós, formas, razão traço/preenchimento, espessura,
  gradiente, animação, paleta interna), imagens dedupadas com proporção e densidade,
  backgrounds e gradientes, pseudo-elementos decorativos, vídeo, canvas, Lottie, e o
  inventário de composição (clip-path, máscara, blend, blur).
- **Hover** — disparado com o mouse de verdade, comparando o elemento **e a subárvore**
  (é onde vive o `group-hover` do Tailwind).
- **Responsivo** — a estrutura é remedida em cada viewport, não estimada.

## Detalhes que custaram caro

- **Chave estável no diff de scroll.** Lazy-load insere nós entre os dois snapshots;
  com índice de array o diff desalinha e some com quase tudo. Cada elemento recebe
  um `data-dna-k` no primeiro snapshot.
- **`oklab(...)`.** O Chrome computa `color-mix()`/`oklch()` para `oklab()`, ilegível e
  inútil como token. A conversão oklab → sRGB é feita à mão, injetada em toda página
  antes do carregamento (`window.__dnaToRgb`).
- **Proxy de imagem.** `/_next/image?url=…` esconde a extensão real no parâmetro.
- **Carrossel duplica slide** e inflava a contagem de imagens: dedupe por src.

## Requisitos

`playwright-core` (já instalado aqui) e um Chromium. Ele procura, nesta ordem: o
chromium do Playwright em `%LOCALAPPDATA%\ms-playwright`, o Chrome, o Edge. Para
apontar outro: `DNA_BROWSER=<caminho do exe>`.

## Quem usa

- Agente `Extrator de DNA Visual` (`~/.claude/agents/`) — faz a análise e escreve o dossiê
- Comando `/dna-visual` (`~/.claude/commands/`) — o fluxo ponta a ponta
- Fluxo `extrair_dna_visual` (Agent Studio, projeto sciensa) — a versão orquestrada
