import { useState, useEffect, useCallback, useRef } from 'react'
import { api, FlowMeta, FlowConfig, FlowStep } from '../api'
import { ResourceGrid } from '../components/ResourceGrid'

const makeStep = (): FlowStep => ({
  id:          `step_${Date.now()}`,
  agent:       '',
  input:       '{{ tarefa }}',
  instruction: '',
  output_key:  `output_${Date.now()}`,
})

const EMPTY: FlowConfig = { name: 'Novo Fluxo', description: '', steps: [], output: '' }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function FlowsPage() {
  const [view, setView] = useState<'grid' | 'editor'>('grid')
  const [gridKey, setGridKey] = useState(0)
  const [flows,      setFlows]      = useState<FlowMeta[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [isNew,      setIsNew]      = useState(false)
  const [slug,       setSlug]       = useState('')
  const [config,     setConfig]     = useState<FlowConfig>(EMPTY)
  const [agents,     setAgents]     = useState<string[]>([])
  const [saveState,  setSaveState]  = useState<SaveState>('idle')
  const [error,      setError]      = useState('')
  const [renaming,   setRenaming]   = useState<string | null>(null)
  const [renameVal,  setRenameVal]  = useState('')
  const [renameErr,  setRenameErr]  = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [list, cfg] = await Promise.all([api.listFlows(), api.getConfig()])
    setFlows(list)
    setAgents(cfg.agents)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectFlow = async (name: string) => {
    if (renaming) return
    setIsNew(false)
    setSelected(name)
    setSaveState('idle')
    setError('')
    setConfig(await api.getFlow(name))
  }

  const startNew = () => {
    setSelected(null); setIsNew(true); setSlug('')
    setConfig({ ...EMPTY, steps: [] }); setSaveState('idle'); setError('')
  }

  const handleSave = async () => {
    const name = isNew ? slug.trim() : selected!
    if (!name) { setError('Informe o slug do fluxo'); return }
    setSaveState('saving'); setError('')
    try {
      await api.saveFlow(name, config)
      setSaveState('saved')
      await refresh()
      if (isNew) { setSelected(name); setIsNew(false) }
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (e: unknown) {
      setSaveState('error')
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  const handleDelete = async () => {
    if (!selected || !confirm(`Deletar o fluxo "${selected}"?`)) return
    await api.deleteFlow(selected)
    setSelected(null); setConfig(EMPTY); await refresh()
  }

  const startRename = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenaming(name); setRenameVal(name); setRenameErr('')
    setTimeout(() => renameRef.current?.select(), 30)
  }
  const cancelRename = () => { setRenaming(null); setRenameErr('') }

  const confirmRename = async (oldName: string) => {
    const newName = renameVal.trim()
    if (!newName || newName === oldName) { cancelRename(); return }
    try {
      await api.renameFlow(oldName, newName)
      if (selected === oldName) setSelected(newName)
      await refresh(); cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Erro ao renomear')
    }
  }

  const patch = (partial: Partial<FlowConfig>) => setConfig(c => ({ ...c, ...partial }))

  const updateStep = (i: number, field: keyof FlowStep, val: string) => {
    const steps = [...(config.steps ?? [])]; steps[i] = { ...steps[i], [field]: val }; patch({ steps })
  }
  const addStep    = () => patch({ steps: [...(config.steps ?? []), makeStep()] })
  const removeStep = (i: number) => {
    const steps = [...(config.steps ?? [])]; steps.splice(i, 1); patch({ steps })
  }
  const moveStep = (i: number, dir: -1 | 1) => {
    const steps = [...(config.steps ?? [])]; const j = i + dir
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]; patch({ steps })
  }

  const varsUpTo = (i: number): string[] => [
    'tarefa',
    ...(config.steps ?? []).slice(0, i).map(s => s.output_key).filter(Boolean) as string[],
  ]
  const allVars    = varsUpTo((config.steps ?? []).length)
  const showEditor = selected !== null || isNew

  const saveBtnLabel = saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? '✓ Aplicado' : saveState === 'error' ? 'Erro!' : 'Aplicar'
  const saveBtnClass = saveState === 'saved' ? 'bg-green-700 hover:bg-green-600' : saveState === 'error' ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'

  if (view === 'grid') {
    return (
      <ResourceGrid
        kind="flow"
        subtitle="Passos encadeados entre agentes"
        reloadKey={gridKey}
        onEdit={name => { setView('editor'); selectFlow(name) }}
        onNew={() => { setView('editor'); startNew() }}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <div className="w-60 border-r border-gray-800 bg-[#111111] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <button onClick={() => { setView('grid'); setGridKey(k => k + 1) }}
              className="font-semibold text-gray-300 text-sm hover:text-white flex items-center gap-1.5"
              title="Voltar para a grade">&larr; Fluxos</button>
          <button onClick={startNew}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-500 transition-colors">
            + Novo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {flows.map(f => (
            <div key={f.name}>
              {renaming === f.name ? (
                <div className="px-2 py-1.5">
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename(f.name)
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={() => confirmRename(f.name)}
                    className="w-full bg-gray-900 border border-blue-500 rounded-lg px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none"
                  />
                  {renameErr && <p className="text-xs text-red-400 mt-1 px-1">{renameErr}</p>}
                  <p className="text-xs text-gray-700 mt-1 px-1">Enter confirmar · Esc cancelar</p>
                </div>
              ) : (
                <div
                  onClick={() => selectFlow(f.name)}
                  className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selected === f.name && !isNew
                      ? 'bg-blue-600/20 border border-blue-500/40'
                      : 'hover:bg-gray-800 border border-transparent'
                  }`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium text-sm truncate ${selected === f.name && !isNew ? 'text-gray-100' : 'text-gray-400 group-hover/item:text-gray-200'}`}>
                      {f.displayName}
                    </div>
                    <div className="text-xs text-gray-700 font-mono truncate mt-0.5">{f.name}</div>
                  </div>
                  <button
                    onClick={e => startRename(f.name, e)}
                    title="Renomear arquivo"
                    className="opacity-0 group-hover/item:opacity-100 text-gray-600 hover:text-gray-300 ml-1 px-1 py-0.5 rounded transition-all text-xs shrink-0">
                    ✎
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      {showEditor ? (
        <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
          <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-100">
                {isNew ? 'Novo fluxo' : config.name || selected}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {!isNew && (
                  <button onClick={handleDelete}
                    className="text-sm text-gray-600 hover:text-red-400 px-2 py-1 transition-colors">
                    Deletar
                  </button>
                )}
                <button onClick={handleSave} disabled={saveState === 'saving'}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${saveBtnClass}`}>
                  {saveBtnLabel}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 px-3 py-2 rounded-lg">{error}</p>
            )}

            {isNew && (
              <div>
                <label className={LABEL}>Slug (nome do arquivo .yaml)</label>
                <input value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="ex: onboarding_completo" className={INPUT} />
              </div>
            )}

            <div>
              <label className={LABEL}>Nome de exibição</label>
              <input value={config.name ?? ''} onChange={e => patch({ name: e.target.value })} className={INPUT} />
            </div>

            <div>
              <label className={LABEL}>Descrição</label>
              <textarea value={config.description ?? ''} onChange={e => patch({ description: e.target.value })}
                rows={2} className={`${INPUT} resize-none`} />
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Steps <span className="text-gray-700 font-normal normal-case">({(config.steps ?? []).length})</span>
                </span>
                <button onClick={addStep}
                  className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-gray-300 transition-colors">
                  + Adicionar step
                </button>
              </div>

              {(config.steps ?? []).length > 0 && (
                <div className="flex items-center gap-1.5 mb-4 flex-wrap p-3 bg-gray-900 rounded-xl border border-gray-800">
                  {(config.steps ?? []).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="bg-blue-950/60 border border-blue-800/50 rounded-lg px-3 py-1.5 text-xs text-center">
                        <div className="font-mono text-blue-400">{s.id || `step_${i+1}`}</div>
                        <div className="text-gray-500 mt-0.5">{s.agent || '—'}</div>
                      </div>
                      {i < (config.steps ?? []).length - 1 && (
                        <span className="text-gray-700 text-base">→</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {(config.steps ?? []).map((step, i) => (
                  <div key={i} className="border border-gray-800 rounded-xl p-4 bg-gray-900/60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono bg-gray-800 text-gray-500 px-2 py-0.5 rounded border border-gray-700">step {i + 1}</span>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-gray-700 hover:text-gray-300 disabled:opacity-20 p-1 transition-colors">▲</button>
                        <button onClick={() => moveStep(i, 1)} disabled={i === (config.steps ?? []).length - 1} className="text-gray-700 hover:text-gray-300 disabled:opacity-20 p-1 transition-colors">▼</button>
                        <button onClick={() => removeStep(i)} className="text-gray-700 hover:text-red-400 p-1 ml-1 transition-colors">✕</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={LABEL}>ID</label>
                        <input value={step.id} onChange={e => updateStep(i, 'id', e.target.value)} className={`${INPUT} font-mono text-xs`} />
                      </div>
                      <div>
                        <label className={LABEL}>Agente</label>
                        <select value={step.agent} onChange={e => updateStep(i, 'agent', e.target.value)} className={INPUT}>
                          <option value="">— selecionar —</option>
                          {agents.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className={LABEL}>Input <span className="text-gray-700 font-normal normal-case">vars: {varsUpTo(i).map(k => `{{${k}}}`).join(', ')}</span></label>
                      <input value={step.input ?? ''} onChange={e => updateStep(i, 'input', e.target.value)} className={`${INPUT} font-mono text-xs`} />
                    </div>

                    <div className="mb-3">
                      <label className={LABEL}>Instrução adicional</label>
                      <textarea value={step.instruction ?? ''} onChange={e => updateStep(i, 'instruction', e.target.value)} rows={3} className={`${INPUT} text-xs resize-none`} />
                    </div>

                    <div>
                      <label className={LABEL}>output_key</label>
                      <input value={step.output_key ?? ''} onChange={e => updateStep(i, 'output_key', e.target.value)} className={`${INPUT} font-mono text-xs`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={LABEL}>Output final <span className="text-gray-700 font-normal normal-case">vars: {allVars.map(k => `{{${k}}}`).join(', ')}</span></label>
              <input value={config.output ?? ''} onChange={e => patch({ output: e.target.value })} className={`${INPUT} font-mono text-xs`} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-gray-700">
          <div className="text-center">
            <div className="text-5xl mb-3 opacity-40">🔄</div>
            <p className="text-sm">Selecione um fluxo para editar</p>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT = 'w-full border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 text-gray-200 placeholder:text-gray-600'
const LABEL = 'block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5'
