import { useState } from 'react'
import type { Decision, ResourceItem } from '../api'

/**
 * Editor das escolhas de um card.
 *
 * Apagar todas as opções remove a decisão — é assim que o card deixa de ser
 * decisão, já que a flag é derivada da existência de escolhas.
 */
export function EditorDecisao({ item, onSalvar, onFechar }: {
  item: ResourceItem
  onSalvar: (d: Partial<Decision>) => Promise<void> | void
  onFechar: () => void
}) {
  const inicial = item.decision
  const [modo, setModo] = useState<'radio' | 'check'>(inicial?.mode || 'radio')
  const [pergunta, setPergunta] = useState(inicial?.question || '')
  const [opcoes, setOpcoes] = useState<string[]>(
    inicial?.options.map(o => o.label) || ['', ''])
  const [salvando, setSalvando] = useState(false)

  const validas = opcoes.map(o => o.trim()).filter(Boolean)

  const salvar = async () => {
    setSalvando(true)
    try {
      // Preserva o que já estava marcado, casando pelo rótulo: reescrever a
      // lista não pode apagar uma decisão que alguém já tomou.
      const antes = new Map((inicial?.options || []).map(o => [o.label, o]))
      await onSalvar({
        mode: modo,
        question: pergunta.trim(),
        options: validas.map((label, i) => {
          const velho = antes.get(label)
          return { id: velho?.id || `o${i + 1}`, label,
                   checked: !!velho?.checked, by: velho?.by, at: velho?.at }
        }),
      })
      onFechar()
    } finally { setSalvando(false) }
  }

  const remover = async () => {
    if (!window.confirm('Remover a decisão deste card?\n\nAs escolhas e quem as marcou são perdidas. O arquivo não é tocado.')) return
    setSalvando(true)
    try { await onSalvar({ options: [] }); onFechar() } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6"
      onClick={onFechar}>
      <div className="w-[30rem] max-w-full bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-100">
            {inicial ? 'Editar decisão' : 'Criar decisão'}
          </h3>
          <p className="text-[11px] text-gray-600 mt-0.5 truncate">
            {item.title || item.name}
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pergunta</label>
            <input value={pergunta} onChange={e => setPergunta(e.target.value)}
              placeholder="O que precisa ser decidido?"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Como se escolhe</label>
            <div className="flex gap-1">
              {([['radio', 'Uma só'], ['check', 'Várias']] as const).map(([id, rot]) => (
                <button key={id} onClick={() => setModo(id)}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-lg border ${
                    modo === id ? 'bg-gray-700 border-gray-600 text-gray-100'
                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                  <span className={`inline-block w-3 h-3 mr-1.5 align-middle border ${
                    id === 'radio' ? 'rounded-full' : 'rounded-[3px]'} ${
                    modo === id ? 'bg-blue-600 border-blue-500' : 'border-gray-600'}`} />
                  {rot}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Escolhas</label>
            <div className="space-y-1.5">
              {opcoes.map((o, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={o}
                    onChange={e => setOpcoes(v => v.map((x, j) => j === i ? e.target.value : x))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && i === opcoes.length - 1 && opcoes.length < 12) {
                        e.preventDefault(); setOpcoes(v => [...v, ''])
                      }
                    }}
                    placeholder={`Escolha ${i + 1}`}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
                  <button onClick={() => setOpcoes(v => v.filter((_, j) => j !== i))}
                    disabled={opcoes.length <= 1}
                    className="text-gray-600 hover:text-red-400 px-1 disabled:opacity-30">×</button>
                </div>
              ))}
            </div>
            {opcoes.length < 12 && (
              <button onClick={() => setOpcoes(v => [...v, ''])}
                className="text-xs text-blue-400 hover:underline mt-1.5">+ escolha</button>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
          {inicial && (
            <button onClick={remover} disabled={salvando}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40">Remover decisão</button>
          )}
          <div className="flex-1" />
          <button onClick={onFechar} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5">Cancelar</button>
          <button onClick={salvar} disabled={salvando || validas.length === 0}
            title={validas.length === 0 ? 'Escreva ao menos uma escolha' : undefined}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
            {salvando ? 'salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
