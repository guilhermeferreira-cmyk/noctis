/**
 * Gera `src/iconesEssenciais.ts` — os ícones que o CÓDIGO nomeia, vendorizados.
 *
 * Por que isto existe. O set do game-icons tem 4 mil desenhos num módulo só,
 * e a busca do seletor precisa deles todos. Mas um módulo importado ESTÁTICA e
 * dinamicamente no mesmo projeto é resolvido como estático pelo empacotador —
 * o `import()` vira letra morta e os 4 mil caem na entrada. Foi o que
 * aconteceu: 7,1 MB para desenhar as duas dúzias de ícones da tela.
 *
 * A saída é separar as duas necessidades em DOIS módulos distintos. Os ícones
 * que o código nomeia saem daqui, num arquivo local pequeno. O pacote inteiro
 * continua existindo, mas só é buscado quando alguém abre o seletor.
 *
 * Rode depois de nomear um ícone novo no código:
 *
 *     node gerar-icones-essenciais.mjs
 *
 * Ele lê os nomes do próprio código-fonte, então não há lista para manter à
 * mão — uma lista à mão sairia do ar no dia em que alguém esquecesse dela.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'
const PACOTE = 'node_modules/react-icons/gi/index.mjs'
const SAIDA = 'src/iconesEssenciais.ts'

function arquivos(dir) {
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...arquivos(p))
    else if (/\.tsx?$/.test(n) && !n.endsWith('iconesEssenciais.ts')) out.push(p)
  }
  return out
}

// 1. Todo nome GiXxx citado no código, venha de import, de string ou de JSX.
const nomes = new Set()
for (const f of arquivos(SRC)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bGi[A-Z][A-Za-z0-9]*/g)) nomes.add(m[0])
}

// 2. A definição de cada um, extraída do pacote.
const fonte = readFileSync(PACOTE, 'utf8')
const defs = new Map()
for (const m of fonte.matchAll(
  /export function (Gi[A-Za-z0-9]+)\s*\(props\)\s*\{\s*return GenIcon\((\{[\s\S]*?\})\)\(props\);\s*\}/g)) {
  defs.set(m[1], m[2])
}

const achados = [...nomes].filter(n => defs.has(n)).sort()
const perdidos = [...nomes].filter(n => !defs.has(n)).sort()

const linhas = [
  '// GERADO por gerar-icones-essenciais.mjs — não edite à mão.',
  '//',
  '// Os ícones que o código nomeia, vendorizados para NÃO depender de um import',
  '// estático de `react-icons/gi`. É esse import que arrastava os 4 mil desenhos',
  '// para a entrada e anulava o carregamento sob demanda do seletor.',
  "import { GenIcon } from 'react-icons/lib'",
  "import type { IconType } from 'react-icons'",
  '',
  '// Cada ícone sai como export nomeado, para quem já escrevia',
  "// `import { GiBrain } from 'react-icons/gi'` só trocar o caminho — e o mapa",
  '// junto, para o registro por nome do `memoryIcons`.',
  ...achados.map(n =>
    `export const ${n}: IconType = (props) => GenIcon(${defs.get(n)} as never)(props)`),
  '',
  'export const ESSENCIAIS: Record<string, IconType> = {',
  ...achados.map(n => `  ${n},`),
  '}',
  '',
]
writeFileSync(SAIDA, linhas.join('\n'), 'utf8')

console.log(`${achados.length} ícones vendorizados em ${SAIDA}`)
if (perdidos.length) console.log(`   ${perdidos.length} nome(s) citados que não existem no pacote: ${perdidos.join(', ')}`)
console.log(`   arquivo: ${(readFileSync(SAIDA, 'utf8').length / 1024).toFixed(0)} KB`)
