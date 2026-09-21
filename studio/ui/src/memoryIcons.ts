// Registro de ícones do set "Game Icons" (game-icons.net) via react-icons/gi.
//
// O set inteiro — mais de quatro mil desenhos — já vinha no pacote; o que havia
// era uma lista curada de setenta escondendo o resto. Agora a biblioteca toda
// está disponível, e o que separa o joio do trigo é a BUSCA no seletor, não uma
// lista fechada aqui.
//
// Os curados continuam existindo, só que como SUGESTÕES: é o que o seletor
// mostra antes de a pessoa digitar qualquer coisa, para quem só quer um ícone
// razoável não ter de encarar quatro mil.
import * as Gi from 'react-icons/gi'
import type { IconType } from 'react-icons'

const GiMap = Gi as unknown as Record<string, IconType>

/** Sugestões: conhecimento, memória, projeto, tech, criativo. */
const CURADOS = [
  'GiBrain', 'GiBrainstorm', 'GiBrainTentacle', 'GiThink',
  'GiSpellBook', 'GiBookCover', 'GiBookmarklet', 'GiBookmark', 'GiBookshelf',
  'GiBookPile', 'GiBlackBook', 'GiNotebook', 'GiScrollUnfurled', 'GiScrollQuill',
  'GiArchiveResearch', 'GiInkSwirl', 'GiQuillInk', 'GiFeather', 'GiFountainPen',
  'GiLightBulb', 'GiIdea', 'GiToolbox', 'GiGears', 'GiCog', 'GiCircuitry',
  'GiProcessor', 'GiComputing', 'GiArtificialIntelligence', 'GiRobotGolem',
  'GiRobotAntennas', 'GiCompass', 'GiTreasureMap', 'GiWorld', 'GiEarthAmerica',
  'GiPuzzle', 'GiArcheryTarget', 'GiBullseye', 'GiTargetDummy', 'GiRocket',
  'GiRocketThruster', 'GiAtom', 'GiDna1', 'GiDna2', 'GiChemicalDrop',
  'GiKey', 'GiPadlock', 'GiLockedChest', 'GiTreasureChest', 'GiCrystalGrowth',
  'GiCrystalCluster', 'GiDiamondHard', 'GiStarFormation', 'GiStarsStack',
  'GiPaintBrush', 'GiPalette', 'GiPaintRoller', 'GiMagnifyingGlass',
  'GiBinoculars', 'GiEyeTarget', 'GiChart', 'GiHive', 'GiFamilyTree',
  'GiTreeBranch', 'GiFlowerPot', 'GiPlantSeed', 'GiPriceTag', 'GiLabels',
  'GiFiles', 'GiPapers', 'GiStack', 'GiCardboardBox', 'GiPin',
].filter(n => typeof GiMap[n] === 'function')

export const ICONES_SUGERIDOS: string[] = CURADOS

/** Todos os ícones do set, em ordem alfabética. */
export const ICON_NAMES: string[] = Object.keys(GiMap)
  .filter(n => n.startsWith('Gi') && typeof GiMap[n] === 'function')
  .sort()

export const DEFAULT_ICON: string =
  ICON_NAMES.includes('GiBrain') ? 'GiBrain' : (ICON_NAMES[0] || 'GiBrain')

/**
 * Busca por nome. "escudo", "shield", "book fire" — os termos são casados em
 * qualquer ordem contra o nome partido em palavras, então "fogo" não é preciso
 * mas "fire book" acha `GiBookFire`.
 */
export function buscarIcones(termo: string, limite = 240): string[] {
  const q = termo.trim().toLowerCase()
  if (!q) return ICONES_SUGERIDOS
  const partes = q.split(/\s+/)
  const out: string[] = []
  for (const nome of ICON_NAMES) {
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
  return (name && GiMap[name]) || GiMap[DEFAULT_ICON]
}
