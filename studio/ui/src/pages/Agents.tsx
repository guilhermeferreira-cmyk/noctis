import { useState, useEffect, useCallback, useRef } from 'react'
import { api, AgentMeta, AgentConfig } from '../api'
import { ResourceGrid } from '../components/ResourceGrid'

const EMPTY: AgentConfig = {
  name: 'Novo Agente',
  description: '',
  system_prompt: '',
  memory_files: [],
  tools: [],
  output_format: 'markdown',
  temperature: 0.5,
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function AgentsPage() {
  const [view, setView] = useState<'grid' | 'editor'>('grid')
  const [gridKey, setGridKey] = useState(0)
  const [agents,     setAgents]     = useState<AgentMeta[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [isNew,      setIsNew]      = useState(false)
  const [slug,       setSlug]       = useState('')
  const [config,     setConfig]     = useState<AgentConfig>(EMPTY)
  const [allMem,     setAllMem]     = useState<string[]>([])
  const [saveState,  setSaveState]  = useState<SaveState>('idle')
  const [error,      setError]      = useState('')
  const [renaming,   setRenaming]   = useState<string | null>(null)
  const [renameVal,  setRenameVal]  = useState('')
  const [renameErr,  setRenameErr]  = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [list, cfg] = await Promise.all([api.listAgents(), api.getConfig()])
    setAgents(list)
    setAllMem(cfg.memory_files)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectAgent = async (name: string) => {
    if (renaming) return
    setIsNew(false)
    setSelected(name)
    setSaveState('idle')
    setError('')
    setConfig(await api.getAgent(name))
  }

  const startNew = () => {
    setSelected(null)
    setIsNew(true)
    setSlug('')
    setConfig({ ...EMPTY })
    setSaveState('idle')
    setError('')
  }

  const handleSave = async () => {
    const name = isNew ? slug.trim() : selected!
    if (!name) { setError('Informe o slug do agente'); return }
    setSaveState('saving')
    setError('')
    try {
      await api.saveAgent(name, config)
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
    if (!selected || !confirm(`Deletar o agente "${selected}"?`)) return
    await api.deleteAgent(selected)
    setSelected(null)
    setConfig(EMPTY)
    await refresh()
  }

  const startRename = (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenaming(name)
    setRenameVal(name)
    setRenameErr('')
    setTimeout(() => renameRef.current?.select(), 30)
  }

  const cancelRename = () => { setRenaming(null); setRenameErr('') }

  const confirmRename = async (oldName: string) => {
    const newName = renameVal.trim()
    if (!newName || newName === oldName) { cancelRename(); return }
    try {
      await api.renameAgent(oldName, newName)
      if (selected === oldName) setSelected(newName)
      await refresh()
      cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Erro ao renomear')
    }
  }

  const patch = (partial: Partial<AgentConfig>) => setConfig(c => ({ ...c, ...partial }))

  const toggleMem = (file: string) => {
    const cur = config.memory_files ?? []
    patch({ memory_files: cur.includes(file) ? cur.filter(f => f !== file) : [...cur, file] })
  }

  const updateTool = (i: number, val: string) => {
    const t = [...(config.tools ?? [])]; t[i] = val; patch({ tools: t })
  }
  const removeTool = (i: number) => {
    const t = [...(config.tools ?? [])]; t.splice(i, 1); patch({ tools: t })
  }

  const showEditor = selected !== null || isNew

  const saveBtnLabel = saveState === 'saving' ? 'Salvando…'
                      : saveState === 'saved'  ? '✓ Aplicado'
                      : saveState === 'error'  ? 'Erro!'
                      : 'Aplicar'
  const saveBtnClass = saveState === 'saved'  ? 'bg-green-700 hover:bg-green-600'
                     : saveState === 'error'  ? 'bg-red-700 hover:bg-red-600'
                     : 'bg-blue-600 hover:bg-blue-500'

  if (view === 'grid') {
    return (
      <ResourceGrid
        kind="agent"
        subtitle="Quem executa as tarefas"
        reloadKey={gridKey}
        onEdit={name => { setView('editor'); selectAgent(name) }}
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
              title="Voltar para a grade">&larr; Agentes</button>
          <button onClick={startNew}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-500 transition-colors">
            + Novo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {agents.map(a => (
            <div key={a.name}>
              {renaming === a.name ? (
                /* ── inline rename ── */
                <div className="px-2 py-1.5">
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename(a.name)
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={() => confirmRename(a.name)}
                    className="w-full bg-gray-900 border border-blue-500 rounded-lg px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none"
                  />
                  {renameErr && <p className="text-xs text-red-400 mt-1 px-1">{renameErr}</p>}
                  <p className="text-xs text-gray-700 mt-1 px-1">Enter confirmar · Esc cancelar</p>
                </div>
              ) : (
                /* ── item normal ── */
                <div
                  onClick={() => selectAgent(a.name)}
                  className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selected === a.name && !isNew
                      ? 'bg-blue-600/20 border border-blue-500/40'
                      : 'hover:bg-gray-800 border border-transparent'
                  }`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium text-sm truncate ${selected === a.name && !isNew ? 'text-gray-100' : 'text-gray-400 group-hover/item:text-gray-200'}`}>
                      {a.displayName}
                    </div>
                    <div className="text-xs text-gray-700 font-mono truncate mt-0.5">{a.name}</div>
                  </div>
                  <button
                    onClick={e => startRename(a.name, e)}
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
                {isNew ? 'Novo agente' : config.name || selected}
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
              <Field label="Identificador (nome do arquivo .yaml)">
                <input value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="ex: pesquisador"
                  className={INPUT} />
                <p className="text-xs text-gray-600 mt-1">Apenas letras minúsculas, números e _</p>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome de exibição">
                <input value={config.name ?? ''} onChange={e => patch({ name: e.target.value })} className={INPUT} />
              </Field>
              <Field label="Formato de saída">
                <select value={config.output_format ?? 'markdown'} onChange={e => patch({ output_format: e.target.value })} className={INPUT}>
                  <option value="markdown">Markdown</option>
                  <option value="json">JSON</option>
                  <option value="text">Texto puro</option>
                </select>
              </Field>
            </div>

            <Field label="Descrição">
              <textarea value={config.description ?? ''} onChange={e => patch({ description: e.target.value })}
                rows={2} className={`${INPUT} resize-none`} />
            </Field>

            <Field label="System Prompt">
              <textarea value={config.system_prompt ?? ''} onChange={e => patch({ system_prompt: e.target.value })}
                rows={14} className={`${INPUT} font-mono text-xs resize-y`} />
            </Field>

            <Field label={
              <span>
                Temperature:&nbsp;
                <span className="font-bold text-blue-400">{(config.temperature ?? 0.5).toFixed(1)}</span>
                <span className="text-gray-600 font-normal ml-1.5 text-xs">
                  {(config.temperature ?? 0.5) <= 0.35 ? '(preciso)' : (config.temperature ?? 0.5) >= 0.65 ? '(criativo)' : '(equilibrado)'}
                </span>
              </span>
            }>
              <input type="range" min={0} max={1} step={0.1}
                value={config.temperature ?? 0.5}
                onChange={e => patch({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-blue-500 mt-1" />
              <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                <span>0.0 — preciso</span><span>1.0 — criativo</span>
              </div>
            </Field>

            <Field label="Arquivos de Memória">
              {allMem.length === 0
                ? <p className="text-sm text-gray-600">Nenhum arquivo encontrado em memory/</p>
                : <div className="space-y-2 mt-1">
                    {allMem.map(file => (
                      <label key={file} className="flex items-center gap-2.5 cursor-pointer group">
                        <input type="checkbox" className="accent-blue-500 w-4 h-4"
                          checked={(config.memory_files ?? []).includes(file)}
                          onChange={() => toggleMem(file)} />
                        <span className="text-sm font-mono text-gray-400 group-hover:text-gray-200 transition-colors">{file}</span>
                      </label>
                    ))}
                  </div>
              }
            </Field>

            <Field label="Ferramentas">
              <div className="space-y-2 mt-1">
                {(config.tools ?? []).map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={t} onChange={e => updateTool(i, e.target.value)}
                      placeholder="ex: web_search"
                      className={`${INPUT} flex-1 font-mono text-xs`} />
                    <button onClick={() => removeTool(i)}
                      className="text-gray-700 hover:text-red-400 px-2 transition-colors">✕</button>
                  </div>
                ))}
                <button onClick={() => patch({ tools: [...(config.tools ?? []), ''] })}
                  className="text-xs text-blue-500 hover:text-blue-400 transition-colors mt-1">+ Adicionar ferramenta</button>
              </div>
            </Field>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-gray-700">
          <div className="text-center">
            <div className="text-5xl mb-3 opacity-40">🤖</div>
            <p className="text-sm">Selecione um agente para editar</p>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT = 'w-full border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 text-gray-200 placeholder:text-gray-600'

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
