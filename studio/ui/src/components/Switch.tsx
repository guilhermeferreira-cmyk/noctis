/**
 * Liga/desliga em forma de chave.
 *
 * Substituiu a caixa de seleção na face do card: a caixa parecia item de lista
 * múltipla — dava a entender que servia para selecionar o card, não para mudar
 * o estado dele. A chave diz o que faz só pela forma, e por isso saiu do rosto
 * do card e foi morar nas propriedades, onde as outras mudanças já moram.
 */
export function Switch({ ligado, onMudar, rotulo, cor = '#3b82f6', titulo }: {
  ligado: boolean
  onMudar: (v: boolean) => void
  rotulo?: string
  cor?: string
  titulo?: string
}) {
  return (
    <button type="button" role="switch" aria-checked={ligado} title={titulo}
      onClick={e => { e.stopPropagation(); onMudar(!ligado) }}
      className="nodrag flex items-center gap-2 group/sw">
      <span className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
        style={{ background: ligado ? cor : '#3f3f46' }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all"
          style={{ left: ligado ? 16 : 2 }} />
      </span>
      {rotulo && <span className="text-xs text-gray-300 group-hover/sw:text-gray-100">{rotulo}</span>}
    </button>
  )
}
