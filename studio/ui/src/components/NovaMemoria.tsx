import { useEffect, useState } from 'react'
import { api, type MemoryVocab } from '../api'
import { getIcon } from '../memoryIcons'

/**
 * Criar memória: nome e tipo, no mesmo passo.
 *
 * O tipo é obrigatório e governa o que entra no prompt, o peso e a validade da
 * memória — deixá-lo para depois fazia toda memória nascer "nota" e envelhecer
 * assim. Aqui ele é escolhido antes de o arquivo existir.
 *
 * Substitui o `window.prompt`, que não tinha como perguntar duas coisas.
 */
export function NovaMemoria({ onCriar, onFechar }: {
  onCriar: (nome: string, tipo: string) => Promise<void> | void
  onFechar: () => void
}) {
  const [vocab, setVocab] = useState<MemoryVocab>()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api.memoryTypes().then(v => { setVocab(v); setTipo(t => t || v.defaultType) })
  }, [])

  const criar = async () => {
    const n = nome.trim()
    if (!n || !tipo) return
    setSalvando(true)
    try { await onCriar(n, tipo); onFechar() }
    finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-6" onClick={onFechar}>
      <div className="w-[34rem] max-w-full bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-100">Nova memória</h3>
          <p className="text-[11px] text-gray-600 mt-0.5">
            O tipo governa o que entra no prompt, o peso e a validade.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Nome</label>
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') criar() }}
              placeholder="como você chamaria numa conversa"
              className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-600">Tipo</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {vocab && Object.entries(vocab.types).map(([id, t]) => {
                const I = getIcon(t.icon)
                const on = id === tipo
                return (
                  <button key={id} onClick={() => setTipo(id)} title={t.desc}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${
                      on ? 'border-transparent' : 'border-gray-800 hover:border-gray-700'}`}
                    style={on ? { background: t.color + '22', outline: `1px solid ${t.color}` } : undefined}>
                    <I size={18} style={{ color: t.color }} className="shrink-0" />
                    <span className="text-xs text-gray-200 truncate">{t.label}</span>
                  </button>
                )
              })}
            </div>
            {vocab && tipo && (
              <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">{vocab.types[tipo]?.desc}</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5">Cancelar</button>
          <button onClick={criar} disabled={!nome.trim() || salvando}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
            {salvando ? 'criando…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
