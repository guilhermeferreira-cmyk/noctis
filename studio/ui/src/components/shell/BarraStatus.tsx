import { usePreferencias } from '../../lib/preferencias'
import { useEffect, useState } from 'react'
import { api } from '../../api'

/**
 * A linha de baixo: o estado do sistema sem precisar abrir nada.
 *
 * Três números, cada um respondendo a uma pergunta que antes exigia navegar:
 * o servidor está de pé? o NOCTURN tem algo a cobrar? alguma regra está fora do
 * padrão? Clicar em cada um leva para onde se resolve.
 */
export function BarraStatus({ projetoNome, onAbrirControle, onAbrirNocturn }: {
  projetoNome: string
  onAbrirControle: () => void
  onAbrirNocturn: () => void
}) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [pendencias, setPendencias] = useState(0)
  const [alteradas, setAlteradas] = useState(0)

  const intervalo = usePreferencias().intervaloRonda
  useEffect(() => {
    let vivo = true
    const ler = () => {
      api.nocturnRelatorio()
        .then(r => { if (vivo) { setOnline(true); setPendencias(r.achados.length) } })
        .catch(() => { if (vivo) setOnline(false) })
      api.regras().then(r => { if (vivo) setAlteradas(r.regras.filter(x => x.alterada).length) }).catch(() => {})
    }
    ler()
    const t = setInterval(ler, intervalo * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [intervalo])

  return (
    <div className="h-6 shrink-0 flex items-center gap-4 px-3 text-[11px] text-gray-500 select-none">
      <span className="truncate">{projetoNome}</span>
      <span className="flex-1" />
      {alteradas > 0 && (
        <button onClick={onAbrirControle} className="hover:text-gray-200"
          title="Regras diferentes do padrão — veja em Controle">
          {alteradas} regra{alteradas !== 1 ? 's' : ''} alterada{alteradas !== 1 ? 's' : ''}
        </button>
      )}
      <button onClick={onAbrirNocturn} className="hover:text-gray-200" title="Pendências da ronda do NOCTURN">
        {pendencias} pendência{pendencias !== 1 ? 's' : ''}
      </button>
      <span className="flex items-center gap-1.5" title={online === false ? 'A API do Noctis não respondeu' : 'API do Noctis no ar'}>
        <span className="w-1.5 h-1.5 rounded-full"
          style={{ background: online === null ? '#52525b' : online ? '#10b981' : '#ef4444' }} />
        {online === false ? 'fora do ar' : 'no ar'}
      </span>
    </div>
  )
}
