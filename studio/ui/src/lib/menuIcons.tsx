import {
  GiEyeball, GiDirectionSigns, GiQuillInk, GiStabbedNote, GiChoice, GiCheckMark,
  GiReturnArrow, GiTrashCan, GiOrganigram, GiArchiveResearch, GiWeightScale,
  GiMagicSwirl, GiBreakingChain, GiEmptyChessboard, GiThreeLeaves, GiStack, GiIdCard, GiBookmarklet,
} from 'react-icons/gi'
import type { IconType } from 'react-icons'
import { ICON_SIZES } from './kinds'

/**
 * Ícones dos menus e botões de ação — set Game Icons (game-icons.net), o mesmo
 * de `memoryIcons`, para a interface falar a língua do resto do estúdio.
 *
 * Emoji ficou de fora porque renderiza diferente em cada sistema, não herda o
 * `currentColor` e desalinha com a linha de texto.
 *
 * Estes desenhos têm mais massa que um ícone de interface comum, então vão um
 * ponto menores que o texto e com opacidade abaixo de 1: em 14px, um Game Icon
 * cheio compete com o rótulo em vez de apoiá-lo.
 */
export const MenuIcon: Record<string, IconType> = {
  ver:          GiEyeball,
  verFluxo:     GiDirectionSigns,
  editar:       GiQuillInk,
  renomear:     GiStabbedNote,
  decisao:      GiChoice,
  decidido:     GiCheckMark,
  removerMapa:  GiReturnArrow,
  excluir:      GiTrashCan,
  organizar:    GiOrganigram,
  condensar:    GiArchiveResearch,
  orcamento:    GiWeightScale,
  prompt:       GiMagicSwirl,
  desfazerLane: GiBreakingChain,
  novaLane:     GiEmptyChessboard,
  novo:         GiThreeLeaves,
  inserir:      GiStack,
  identificador: GiIdCard,
  pdf:           GiBookmarklet,
}

/** Item de menu com ícone alinhado ao texto. */
export function ItemMenu({ icone, children, onClick, tom = 'normal', className = '' }: {
  icone: keyof typeof MenuIcon
  children: React.ReactNode
  onClick: () => void
  tom?: 'normal' | 'suave' | 'perigo'
  className?: string
}) {
  const I = MenuIcon[icone]
  const cor = tom === 'perigo' ? 'text-red-400' : tom === 'suave' ? 'text-gray-400' : 'text-gray-300'
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-1.5 ${cor} hover:bg-gray-700 flex items-center gap-2 ${className}`}>
      <I size={ICON_SIZES.menu} className="shrink-0 opacity-70" aria-hidden="true" />
      <span className="flex-1 min-w-0">{children}</span>
    </button>
  )
}
