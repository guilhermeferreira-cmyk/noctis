import type { Decision } from '../api'

/** Quem marca, quando é a pessoa no Studio. O agente manda o nome dele. */
export const AUTOR_LOCAL = 'você'

const quando = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(+d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/**
 * As escolhas de um card, no corpo dele.
 *
 * Só aparece quando existe decisão — é a presença de escolhas que faz o card
 * virar decisão, não uma marcação à parte. Marcar apenas registra: nada é
 * executado a partir daqui, e por isso guardamos quem marcou e quando, senão
 * daqui a um mês ninguém sabe se aquilo foi decidido ou chutado.
 */
export function BlocoDecisao({ decision, onToggle, compacto = false }: {
  decision: Decision
  onToggle: (optionId: string) => void
  compacto?: boolean
}) {
  const pendente = !decision.options.some(o => o.checked)
  const unica = decision.mode === 'radio'

  return (
    <div className={`rounded-lg border ${pendente ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-gray-800 bg-black/20'} px-2.5 py-2`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`text-[9px] font-bold uppercase tracking-wider ${pendente ? 'text-amber-400' : 'text-gray-500'}`}>
          {pendente ? 'decisão pendente' : 'decidido'}
        </span>
        <span className="text-[9px] text-gray-600">{unica ? 'escolha uma' : 'marque quantas quiser'}</span>
      </div>

      {decision.question && (
        <p className={`text-xs text-gray-300 mb-1.5 leading-snug ${compacto ? 'line-clamp-2' : ''}`}>
          {decision.question}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {decision.options.map(o => (
          <button
            key={o.id}
            onClick={e => { e.stopPropagation(); onToggle(o.id) }}
            title={o.checked && o.by ? `marcado por ${o.by}${o.at ? ` em ${quando(o.at)}` : ''}` : 'marcar'}
            className={`group/op flex items-start gap-2 text-left rounded px-1.5 py-1 transition-colors ${
              o.checked ? 'bg-gray-800/70' : 'hover:bg-gray-800/40'}`}
          >
            <span
              aria-hidden="true"
              className={`mt-[2px] shrink-0 w-3.5 h-3.5 border flex items-center justify-center text-[9px] leading-none ${
                unica ? 'rounded-full' : 'rounded-[3px]'
              } ${o.checked ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-600 text-transparent group-hover/op:border-gray-500'}`}
            >
              {unica ? '●' : '✓'}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-xs leading-snug ${o.checked ? 'text-gray-100' : 'text-gray-400'}`}>
                {o.label}
              </span>
              {o.checked && o.by && (
                <span className="block text-[10px] text-gray-600 mt-0.5">
                  {o.by}{o.at ? ` · ${quando(o.at)}` : ''}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
