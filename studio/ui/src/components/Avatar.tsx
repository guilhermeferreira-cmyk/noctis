import { ICON_SIZES } from '../lib/kinds'
import { getIcon } from '../memoryIcons'

/**
 * O avatar de um recurso — o quadrado que abre o card.
 *
 * Existia duas vezes, igual, no card da grade e no nó do mapa. Duas cópias de
 * uma decisão visual divergem no dia em que alguém ajusta uma, e é aqui que
 * mora a regra que a orb trouxe.
 *
 * **Ícone tem moldura; orb não.** O ícone é um desenho de uma cor só, e sem o
 * quadrado colorido atrás ele flutua sem peso no card. A orb já É a peça
 * inteira: tem volume, brilho e fundo transparente de propósito. Pôr um
 * quadrado colorido atrás dela seria emoldurar uma esfera — a cor brigaria com
 * a da própria orb, e o recorte transparente que a faz parecer solta na tela
 * viraria um retângulo.
 */

/** Um ícone cujo nome começa com `orb_` é uma orb, e não um desenho do set.
 *
 *  O mesmo CAMPO guarda os dois. Um segundo campo `orb` ao lado de `icon`
 *  obrigaria todo lugar que hoje lê identidade — resources.json, a aparência do
 *  sistema, o mapa, o PDF — a saber da existência das orbs e a decidir qual dos
 *  dois vence. Com um campo só, quem não sabe de orb continua funcionando. */
export const ehOrb = (nome?: string) => !!nome && nome.startsWith('orb_')

export const caminhoDaOrb = (nome: string) => `/orbs/${nome}.webp`

export function Avatar({ icon, color, tamanho, className = '' }: {
  icon?: string
  color: string
  /** O lado da moldura. Sem valor, acompanha Configurações › Tamanho dos ícones. */
  tamanho?: number
  className?: string
}) {
  const lado = tamanho ?? Math.max(44, ICON_SIZES.card + 14)

  if (ehOrb(icon)) {
    return (
      <img src={caminhoDaOrb(icon!)} alt="" aria-hidden="true" draggable={false}
        className={`shrink-0 select-none ${className}`}
        style={{ width: lado, height: lado, objectFit: 'contain' }} />
    )
  }

  const Icone = getIcon(icon)
  return (
    <span className={`relative shrink-0 flex items-center justify-center rounded-lg ${className}`}
      style={{ background: color + '22', color, width: lado, height: lado }}>
      <Icone size={tamanho ? Math.round(tamanho * 0.64) : ICON_SIZES.card} />
    </span>
  )
}
