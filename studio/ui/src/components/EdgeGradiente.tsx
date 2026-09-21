import { BaseEdge, getSmoothStepPath, useInternalNode, type EdgeProps } from '@xyflow/react'

/**
 * A seta pintada com as duas cores que ela liga.
 *
 * O gradiente vai da cor do card de origem à do card de destino, então a linha
 * conta de onde veio e para onde vai sem precisar segui-la com o olho. Cada
 * aresta declara o próprio `<linearGradient>`, com id derivado do id dela — um
 * gradiente compartilhado herdaria a cor da última aresta desenhada.
 *
 * `gradientUnits="userSpaceOnUse"` é obrigatório: o padrão (objectBoundingBox)
 * calcula sobre a caixa do traço, e numa curva quase reta essa caixa tem altura
 * perto de zero, o que faz o degradê sumir.
 */
export function EdgeGradiente(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY,
          sourcePosition, targetPosition, markerEnd, style } = props

  const origem = useInternalNode(props.source)
  const destino = useInternalNode(props.target)
  const corA = (origem?.data as { color?: string } | undefined)?.color || '#52525b'
  const corB = (destino?.data as { color?: string } | undefined)?.color || '#52525b'

  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12,
  })
  const gid = `grad-${id.replace(/[^\w-]/g, '_')}`

  return (
    <>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse"
          x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={corA} />
          <stop offset="100%" stopColor={corB} />
        </linearGradient>
      </defs>
      <BaseEdge id={id} path={path} markerEnd={markerEnd}
        style={{ ...style, stroke: `url(#${gid})`, strokeWidth: 2.5 }} />
    </>
  )
}
