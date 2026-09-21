import { useState, useEffect, useCallback, useRef } from 'react'
import { api, PersonaMeta, PersonaConfig } from '../api'
import { ResourceGrid } from '../components/ResourceGrid'

const EMPTY: PersonaConfig = {
  name: 'Nova Persona',
  role: '',
  age: '',
  company_profile: '',
  bio: '',
  goals_on_site: [],
  tech_literacy: 'alto',
  preferred_device: 'desktop',
  reading_pattern: '',
  trust_signals: [],
  red_flags: [],
  objections: [],
  entry_point: '',
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const TECH_OPTIONS = ['baixo', 'médio', 'alto', 'muito alto']
const DEVICE_OPTIONS = ['desktop', 'mobile', 'ambos']

export default function PersonasPage() {
  const [view, setView] = useState<'grid' | 'editor'>('grid')
  const [gridKey, setGridKey] = useState(0)
  const [personas,   setPersonas]   = useState<PersonaMeta[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [isNew,      setIsNew]      = useState(false)
  const [slug,       setSlug]       = useState('')
  const [config,     setConfig]     = useState<PersonaConfig>(EMPTY)
  const [saveState,  setSaveState]  = useState<SaveState>('idle')
  const [error,      setError]      = useState('')
  const [renaming,   setRenaming]   = useState<string | null>(null)
  const [renameVal,  setRenameVal]  = useState('')
  const [renameErr,  setRenameErr]  = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setPersonas(await api.listPersonas())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectPersona = async (name: string) => {
    if (renaming) return
    setIsNew(false); setSelected(name); setSaveState('idle'); setError('')
    setConfig(await api.getPersona(name))
  }

  const startNew = () => {
    setSelected(null); setIsNew(true); setSlug('')
    setConfig({ ...EMPTY }); setSaveState('idle'); setError('')
  }

  const handleSave = async () => {
    const name = isNew ? slug.trim() : selected!
    if (!name) { setError('Informe o slug da persona'); return }
    setSaveState('saving'); setError('')
    try {
      await api.savePersona(name, config)
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
    if (!selected || !confirm(`Deletar a persona "${selected}"?`)) return
    await api.deletePersona(selected)
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
      await api.renamePersona(oldName, newName)
      if (selected === oldName) setSelected(newName)
      await refresh(); cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Erro ao renomear')
    }
  }

  const patch = (partial: Partial<PersonaConfig>) => setConfig(c => ({ ...c, ...partial }))

  const updateList = (key: keyof PersonaConfig, i: number, val: string) => {
    const arr = [...((config[key] as string[]) ?? [])]; arr[i] = val
    patch({ [key]: arr })
  }
  const removeFromList = (key: keyof PersonaConfig, i: number) => {
    const arr = [...((config[key] as string[]) ?? [])]; arr.splice(i, 1)
    patch({ [key]: arr })
  }
  const addToList = (key: keyof PersonaConfig) => {
    patch({ [key]: [...((config[key] as string[]) ?? []), ''] })
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
        kind="persona"
        subtitle="Perfis para teste de UX"
        reloadKey={gridKey}
        onEdit={name => { setView('editor'); selectPersona(name) }}
        onNew={() => { setView('editor'); startNew() }}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <div className="w-60 border-r border-gray-800 bg-[#111111] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <button onClick={() => { setView('grid'); setGridKey(k => k + 1) }}
              className="font-semibold text-gray-300 text-sm hover:text-white flex items-center gap-1.5"
              title="Voltar para a grade">&larr; Personas</button>
            <p className="text-xs text-gray-600 mt-0.5">Perfis para teste de UX</p>
          </div>
          <button onClick={startNew}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-500 transition-colors shrink-0">
            + Nova
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {personas.map(p => (
            <div key={p.name}>
              {renaming === p.name ? (
                <div className="px-2 py-1.5">
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename(p.name)
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={() => confirmRename(p.name)}
                    className="w-full bg-gray-900 border border-blue-500 rounded-lg px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none"
                  />
                  {renameErr && <p className="text-xs text-red-400 mt-1 px-1">{renameErr}</p>}
                  <p className="text-xs text-gray-700 mt-1 px-1">Enter confirmar · Esc cancelar</p>
                </div>
              ) : (
                <div
                  onClick={() => selectPersona(p.name)}
                  className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selected === p.name && !isNew
                      ? 'bg-blue-600/20 border border-blue-500/40'
                      : 'hover:bg-gray-800 border border-transparent'
                  }`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium text-sm truncate ${selected === p.name && !isNew ? 'text-gray-100' : 'text-gray-400 group-hover/item:text-gray-200'}`}>
                      {p.displayName}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-600 truncate">{p.role}</span>
                      {p.age && <span className="text-xs text-gray-700 shrink-0">· {p.age}a</span>}
                    </div>
                  </div>
                  <button
                    onClick={e => startRename(p.name, e)}
                    title="Renomear arquivo"
                    className="opacity-0 group-hover/item:opacity-100 text-gray-600 hover:text-gray-300 ml-1 px-1 py-0.5 rounded transition-all text-xs shrink-0">
                    ✎
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
          Use slug no --personas do orquestrador
        </div>
      </div>

      {/* Editor */}
      {showEditor ? (
        <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
          <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-100">
                {isNew ? 'Nova persona' : config.name || selected}
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
              <Field label="Slug (nome do arquivo .yaml)">
                <input value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="ex: cto"
                  className={INPUT} />
                <p className="text-xs text-gray-600 mt-1">Apenas letras minúsculas, números e _</p>
              </Field>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="Nome de exibição">
                  <input value={config.name ?? ''} onChange={e => patch({ name: e.target.value })} className={INPUT} />
                </Field>
              </div>
              <Field label="Idade">
                <input type="number" value={config.age ?? ''} onChange={e => patch({ age: e.target.value })} className={INPUT} />
              </Field>
            </div>

            <Field label="Cargo / Função">
              <input value={config.role ?? ''} onChange={e => patch({ role: e.target.value })} className={INPUT} />
            </Field>

            <Field label="Perfil da Empresa">
              <input value={config.company_profile ?? ''} onChange={e => patch({ company_profile: e.target.value })}
                placeholder="Setor, porte, cidade..." className={INPUT} />
            </Field>

            <Field label="Bio">
              <textarea value={config.bio ?? ''} onChange={e => patch({ bio: e.target.value })}
                rows={4} className={`${INPUT} resize-none`}
                placeholder="Quem é essa pessoa, carreira, contexto, mentalidade..." />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Maturidade digital">
                <select value={config.tech_literacy ?? 'alto'} onChange={e => patch({ tech_literacy: e.target.value })} className={INPUT}>
                  {TECH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Dispositivo preferido">
                <select value={config.preferred_device ?? 'desktop'} onChange={e => patch({ preferred_device: e.target.value })} className={INPUT}>
                  {DEVICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Padrão de leitura">
              <textarea value={config.reading_pattern ?? ''} onChange={e => patch({ reading_pattern: e.target.value })}
                rows={2} className={`${INPUT} resize-none`}
                placeholder="Como essa persona navega e lê a página..." />
            </Field>

            <Field label="Ponto de entrada">
              <input value={config.entry_point ?? ''} onChange={e => patch({ entry_point: e.target.value })}
                placeholder="Como ela chegou até o site..." className={INPUT} />
            </Field>

            <ListField label="Objetivos no site" items={config.goals_on_site ?? []}
              placeholder="O que ela quer encontrar ou resolver..."
              onChange={(i, v) => updateList('goals_on_site', i, v)}
              onRemove={i => removeFromList('goals_on_site', i)}
              onAdd={() => addToList('goals_on_site')} />

            <ListField label="Gatilhos de confiança" items={config.trust_signals ?? []}
              placeholder="O que a convence e cria confiança..."
              onChange={(i, v) => updateList('trust_signals', i, v)}
              onRemove={i => removeFromList('trust_signals', i)}
              onAdd={() => addToList('trust_signals')} />

            <ListField label="Gatilhos de saída (red flags)" items={config.red_flags ?? []}
              placeholder="O que a faz fechar a aba..."
              onChange={(i, v) => updateList('red_flags', i, v)}
              onRemove={i => removeFromList('red_flags', i)}
              onAdd={() => addToList('red_flags')} />

            <ListField label="Objeções típicas" items={config.objections ?? []}
              placeholder="Dúvidas e resistências antes de converter..."
              onChange={(i, v) => updateList('objections', i, v)}
              onRemove={i => removeFromList('objections', i)}
              onAdd={() => addToList('objections')} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-gray-700">
          <div className="text-center">
            <div className="text-5xl mb-3 opacity-40">👤</div>
            <p className="text-sm">Selecione uma persona para editar</p>
            <p className="text-xs text-gray-700 mt-1">Use os slugs no fluxo ux_persona_review</p>
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

function ListField({ label, items, placeholder, onChange, onRemove, onAdd }: {
  label: string
  items: string[]
  placeholder: string
  onChange: (i: number, v: string) => void
  onRemove: (i: number) => void
  onAdd: () => void
}) {
  return (
    <Field label={label}>
      <div className="space-y-2 mt-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input value={item} onChange={e => onChange(i, e.target.value)}
              placeholder={placeholder}
              className={`${INPUT} flex-1`} />
            <button onClick={() => onRemove(i)}
              className="text-gray-700 hover:text-red-400 px-2 transition-colors">✕</button>
          </div>
        ))}
        <button onClick={onAdd}
          className="text-xs text-blue-500 hover:text-blue-400 transition-colors mt-1">
          + Adicionar
        </button>
      </div>
    </Field>
  )
}
