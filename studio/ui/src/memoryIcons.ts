// Registro de ícones do set "Game Icons" (game-icons.net) via react-icons/gi.
//
// O set inteiro tem mais de quatro mil desenhos, e a busca do seletor precisa
// deles todos — isso é decisão de produto, não descuido. O problema é que um
// `import * as Gi` põe os quatro mil no bundle inicial: eram 7,5 MB num
// arquivo só, carregados para desenhar as duas dúzias de ícones que a tela
// realmente usa.
//
// Então o set passou a ter DOIS estados. O ESSENCIAL é estático: os curados,
// que cobrem os padrões do sistema e as sugestões do seletor. O RESTO chega
// sob demanda, num pedaço próprio, quando alguém abre o seletor ou quando
// aparece um nome que o essencial não tem.
//
// `getIcon` continua SÍNCRONO de propósito: dezessete arquivos o chamam no meio
// do render, e transformá-lo em promessa contaminaria todos eles. Quem pede um
// ícone que ainda não chegou recebe o padrão e um pedido de carga; quando o
// pacote entra, os assinantes re-renderizam e o desenho certo aparece.
import type { IconType } from 'react-icons'
import { ESSENCIAIS } from './iconesEssenciais'

// O ESSENCIAL vem de um arquivo LOCAL, gerado por `gerar-icones-essenciais.mjs`
// a partir dos nomes que o próprio código cita. Importar `react-icons/gi` aqui
// — mesmo só os nomes usados — faria o empacotador tratar o `import()` de baixo
// como estático e arrastar os 4 mil desenhos para a entrada. Foi medido: 7,1 MB
// contra 505 kB. Dois módulos distintos é o que mantém os dois comportamentos.
const ESSENCIAL: Record<string, IconType> = ESSENCIAIS

/** O mapa vivo: começa no essencial e cresce quando o set completo chega. */
let MAPA: Record<string, IconType> = { ...ESSENCIAL }
let completo = false
let carregando: Promise<void> | null = null

const ouvintes = new Set<() => void>()

/** Avisa quem depende de ícone que o mapa mudou. */
export function aoCarregarIcones(fn: () => void): () => void {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}

/**
 * Traz o set completo. Idempotente e seguro de chamar em render: a segunda
 * chamada devolve a mesma promessa, e a carga só avisa os ouvintes no fim.
 */
export function carregarIcones(): Promise<void> {
  if (completo) return Promise.resolve()
  if (carregando) return carregando
  carregando = import('react-icons/gi').then(mod => {
    const todos = mod as unknown as Record<string, IconType>
    const novo: Record<string, IconType> = { ...MAPA }
    for (const n of Object.keys(todos)) {
      if (n.startsWith('Gi') && typeof todos[n] === 'function') novo[n] = todos[n]
    }
    MAPA = novo
    completo = true
    ouvintes.forEach(f => f())
  }).catch(() => { carregando = null })
  return carregando
}

export const iconesCompletos = () => completo

/**
 * Sugestões: o que o seletor mostra antes de a pessoa digitar.
 *
 * É uma lista de NOMES, não de imports — e isso é o que faz o gerador dos
 * essenciais encontrá-los sozinho: ele varre o código atrás de `GiXxx`, em
 * import, em string ou em JSX. Nomear aqui basta para o ícone existir.
 */
const CURADOS = [
  'GiBrain', 'GiBrainstorm', 'GiBrainTentacle', 'GiThink',
  'GiSpellBook', 'GiBookCover', 'GiBookmarklet', 'GiBookmark', 'GiBookshelf',
  'GiBookPile', 'GiBlackBook', 'GiNotebook', 'GiScrollUnfurled', 'GiScrollQuill',
  'GiArchiveResearch', 'GiInkSwirl', 'GiQuillInk', 'GiFeather', 'GiFountainPen',
  'GiLightBulb', 'GiToolbox', 'GiGears', 'GiCog', 'GiCircuitry',
  'GiProcessor', 'GiArtificialIntelligence', 'GiRobotGolem', 'GiRobotAntennas',
  'GiCompass', 'GiTreasureMap', 'GiWorld', 'GiEarthAmerica',
  'GiBinoculars', 'GiEyeTarget', 'GiChart', 'GiHive', 'GiFamilyTree',
  'GiTreeBranch', 'GiFlowerPot', 'GiPlantSeed', 'GiPriceTag',
  'GiFiles', 'GiPapers', 'GiStack', 'GiCardboardBox', 'GiPin',
]

export const ICONES_SUGERIDOS: string[] =
  CURADOS.filter(n => ESSENCIAL[n]).concat(
    Object.keys(ESSENCIAL).filter(n => !CURADOS.includes(n)))

/** Todos os ícones disponíveis AGORA, em ordem. Cresce depois da carga. */
export function iconNames(): string[] {
  return Object.keys(MAPA).sort()
}

export const DEFAULT_ICON = 'GiBrain'

/**
 * Busca por nome. "escudo", "shield", "book fire" — os termos são casados em
 * qualquer ordem contra o nome partido em palavras, então "fogo" não é preciso
 * mas "fire book" acha `GiBookFire`.
 *
 * Buscar sem o set completo daria resultado pela metade e ninguém saberia por
 * quê — então a busca pede a carga. Quem chama trata o "ainda vindo" pelo
 * `iconesCompletos()`.
 */
export function buscarIcones(termo: string, limite = 240): string[] {
  const q = termo.trim().toLowerCase()
  if (!q) return ICONES_SUGERIDOS
  if (!completo) carregarIcones()
  const partes = q.split(/\s+/)
  const out: string[] = []
  for (const nome of iconNames()) {
    // `GiBookFire` → "book fire"; assim cada palavra pode ser buscada sozinha.
    const legivel = nome.slice(2).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
    if (partes.every(p => legivel.includes(p))) {
      out.push(nome)
      if (out.length >= limite) break
    }
  }
  return out
}

/** Nome legível de um ícone, para título e rótulo. */
export function nomeLegivel(nome: string): string {
  return nome.slice(2).replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

/** Retorna o componente do ícone, com fallback para o padrão. */
export function getIcon(name: string | undefined): IconType {
  if (name && MAPA[name]) return MAPA[name]
  // Nome fora do essencial: pede o resto e entrega o padrão por enquanto. Sem
  // isto, um ícone escolhido por você no seletor apareceria errado para sempre.
  if (name && !completo) carregarIcones()
  return MAPA[DEFAULT_ICON]
}
