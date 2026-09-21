import { useState, useEffect, useCallback, useRef } from 'react'
import { api, MemoryFile } from '../api'
import { ResourceGrid } from '../components/ResourceGrid'
import { NovaMemoria } from '../components/NovaMemoria'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function MemoryPage() {
  const [view, setView] = useState<'grid' | 'editor'>('grid')
  const [novaAberta, setNovaAberta] = useState(false)
  const [gridKey, setGridKey] = useState(0)
  const [files,      setFiles]      = useState<MemoryFile[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [isNew,      setIsNew]      = useState(false)
  const [slug,       setSlug]       = useState('')
  const [content,    setContent]    = useState('')
  const [saveState,  setSaveState]  = useState<SaveState>('idle')
  const [error,      setError]      = useState('')
  const [renaming,   setRenaming]   = useState<string | null>(null)
  const [renameVal,  setRenameVal]  = useState('')
  const [renameErr,  setRenameErr]  = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => api.listMemory().then(setFiles), [])
  useEffect(() => { refresh() }, [refresh])

  const selectFile = async (name: string) => {
    if (renaming) return
    setIsNew(false); setSelected(name); setSaveState('idle'); setError('')
    setContent((await api.getMemory(name)).content)
  }

  // Nome e tipo antes de o arquivo existir: uma memória sem tipo nasceria "nota"
  // e provavelmente ficaria assim.
  const criarComTipo = async (nome: string, tipo: string) => {
    await api.saveMemory(nome, `# ${nome}

Descreva o contexto aqui...
`)
    await api.saveIdentity('memory', nome, { type: tipo })
    await refresh()
    setIsNew(false); setSelected(nome); setSlug(nome)
    setContent(`# ${nome}

Descreva o contexto aqui...
`)
    setSaveState('idle'); setError(''); setView('editor')
  }

  const startNew = () => setNovaAberta(true)

  const handleSave = async () => {
    const name = isNew ? slug.trim() : selected!
    if (!name) { setError('Informe o nome do arquivo'); return }
    setSaveState('saving'); setError('')
    try {
      await api.saveMemory(name, content)
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
    if (!selected || !confirm(`Deletar o arquivo "${selected}.md"?`)) return
    await api.deleteMemory(selected)
    setSelected(null); setContent(''); await refresh()
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
      await api.renameMemory(oldName, newName)
      if (selected === oldName) setSelected(newName)
      await refresh(); cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : 'Erro ao renomear')
    }
  }

  const pendingCount = (content.match(/<!--|<--|^\s*[A-Z][a-z]+:\s*$/gm) ?? []).length
    + (content.match(/\[preencha|preencha este|seu |coloque |descreva /gi) ?? []).length
  const lines = content.split('\n').length
  const chars = content.length

  const saveBtnLabel = saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? '✓ Aplicado' : saveState === 'error' ? 'Erro!' : 'Aplicar'
  const saveBtnClass = saveState === 'saved' ? 'bg-green-700 hover:bg-green-600' : saveState === 'error' ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'

  const showEditor = selected !== null || isNew

  const modalNova = novaAberta && (
    <NovaMemoria onCriar={criarComTipo} onFechar={() => setNovaAberta(false)} />
  )

  if (view === 'grid') {
    return (
      <>
        <ResourceGrid
          kind="memory"
          subtitle="Contexto injetado nos agentes"
          reloadKey={gridKey}
          onEdit={name => { setView('editor'); selectFile(name) }}
          onNew={startNew}
        />
        {modalNova}
      </>
    )
  }

  return (
    <div className="flex h-full">
      {modalNova}
      {/* Lista */}
      <div className="w-60 border-r border-gray-800 bg-[#111111] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <button onClick={() => { setView('grid'); setGridKey(k => k + 1) }}
              className="font-semibold text-gray-300 text-sm hover:text-white flex items-center gap-1.5"
              title="Voltar para a grade">← Memória</button>
            <p className="text-xs text-gray-600 mt-0.5">Contexto injetado nos agentes</p>
          </div>
          <button onClick={startNew}
            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-500 transition-colors shrink-0">
            + Nova
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {files.map(f => (
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
                  onClick={() => selectFile(f.name)}
                  className={`group/item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selected === f.name && !isNew
                      ? 'bg-blue-600/20 border border-blue-500/40'
                      : 'hover:bg-gray-800 border border-transparent'
                  }`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium text-sm truncate ${selected === f.name && !isNew ? 'text-gray-100' : 'text-gray-400 group-hover/item:text-gray-200'}`}>
                      {f.name}
                    </div>
                    <div className="text-xs text-gray-700 font-mono truncate mt-0.5">{f.filename}</div>
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
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
          Novos arquivos aparecem nos agentes automaticamente
        </div>
      </div>

      {/* Editor */}
      {showEditor ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-gray-800 bg-[#111111] flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {isNew ? (
                <div className="flex items-center gap-2">
                  <input
                    value={slug}
                    onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                    placeholder="nome_do_arquivo"
                    autoFocus
                    className="font-mono text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 placeholder:text-gray-600"
                  />
                  <span className="text-gray-600 text-sm">.md</span>
                </div>
              ) : (
                <>
                  <span className="font-mono text-sm font-medium text-gray-300 truncate">{selected}.md</span>
                  <span className="text-xs text-gray-600 shrink-0">{lines} linhas · {chars} chars</span>
                  {pendingCount > 0 && (
                    <span className="text-xs bg-amber-950/60 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full shrink-0">
                      ⚠ {pendingCount} campo{pendingCount > 1 ? 's' : ''} a preencher
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {error && <span className="text-xs text-red-400">{error}</span>}
              {!isNew && selected && (
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

          {/* Textarea */}
          <div className="flex-1 overflow-hidden relative bg-[#0a0a0a]">
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setSaveState('idle') }}
              className="absolute inset-0 w-full h-full p-6 font-mono text-sm resize-none focus:outline-none bg-transparent text-gray-300 leading-relaxed placeholder:text-gray-700"
              spellCheck={false}
              placeholder={isNew
                ? `# ${slug || 'novo_arquivo'}\n\nDescreva o conteúdo aqui em Markdown...`
                : 'Escreva o conteúdo em Markdown...'}
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-2 border-t border-gray-800 bg-[#111111] text-xs text-gray-700 shrink-0">
            <kbd className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 font-mono text-gray-500">Ctrl+S</kbd>
            <span className="ml-1.5">para salvar · arquivos criados aparecem como checkboxes nos agentes</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-gray-700">
          <div className="text-center">
            <div className="text-5xl mb-3 opacity-40">🧠</div>
            <p className="text-sm">Selecione um arquivo de memória para editar</p>
            <p className="text-xs text-gray-700 mt-1">O conteúdo é injetado no system prompt dos agentes</p>
          </div>
        </div>
      )}
    </div>
  )
}
