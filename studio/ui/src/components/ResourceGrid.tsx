import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Decision, type MemoryVocab, type ResourceItem, type ResourceKind } from '../api'
import { KIND_META } from '../lib/kinds'
import { ResourceCard, type CardActions } from './ResourceCard'
import { abrirRecursoNaDoca } from '../lib/doca'
import { EditorDecisao } from './EditorDecisao'
import { AUTOR_LOCAL } from './BlocoDecisao'

/**
 * A grade de cards que ocupa a tela, com o detalhe aberto na doca da direita.
 *
 * Os quatro tipos usam esta mesma tela: o que muda entre memória, agente, fluxo
 * e persona é o `kind` e o que a página faz ao editar. A edição continua na
 * página de origem — o drawer só edita memória, e trocar as outras por ele
 * apagaria os editores de agente, fluxo e persona.
 */
export function ResourceGrid({ kind, subtitle, onEdit, onNew, reloadKey }: {
  kind: ResourceKind
  subtitle: string
  onEdit: (name: string) => void
  onNew: () => void
  /** Muda para forçar recarga depois que a página salvou algo. */
  reloadKey?: number
}) {
  const [items, setItems] = useState<ResourceItem[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [vocab, setVocab] = useState<MemoryVocab>()
  const [tipoFiltro, setTipoFiltro] = useState<string>('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [editandoDecisao, setEditandoDecisao] = useState<ResourceItem | null>(null)
  const meta = KIND_META[kind]

  // O vocabulário é do sistema, não do projeto: carrega uma vez.
  useEffect(() => { api.memoryTypes().then(setVocab).catch(() => {}) }, [])

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try { setItems((await api.getResources())[kind] || []) }
    finally { setCarregando(false) }
  }, [kind])
  useEffect(() => { recarregar() }, [recarregar, reloadKey])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let porTipo = tipoFiltro ? items.filter(i => (i.type || '') === tipoFiltro) : items
    if (soPendentes) porTipo = porTipo.filter(i => i.decision && !i.decision.options.some(o => o.checked))
    if (!q) return porTipo
    return porTipo.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.title || '').toLowerCase().includes(q) ||
      (i.excerpt || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q)))
  }, [items, busca, tipoFiltro, soPendentes])

  const pendentes = useMemo(
    () => items.filter(i => i.decision && !i.decision.options.some(o => o.checked)).length,
    [items])

  // Quantas de cada tipo, para as abas do filtro mostrarem o número.
  const porTipo = useMemo(() => {
    const c: Record<string, number> = {}
    items.forEach(i => { if (i.type) c[i.type] = (c[i.type] || 0) + 1 })
    return c
  }, [items])

  // Otimista: o card responde na hora e o servidor confirma depois.
  const patchLocal = (name: string, patch: Partial<ResourceItem>) =>
    setItems(is => is.map(i => i.name === name ? { ...i, ...patch } : i))

  const actions: CardActions = {
    onOpen:   it => abrirRecursoNaDoca(kind, it.name, recarregar),
    onEdit:   it => onEdit(it.name),
    onRename: async it => {
      // O nome vai como a pessoa escreveu: acento, espaço e maiúscula ficam.
      // Quem recusa caractere impossível é o backend, em nome_de_recurso().
      const nv = window.prompt(`Novo nome (${meta.label}):`, it.name)?.trim()
      if (!nv || nv === it.name) return
      const fn = { memory: api.renameMemory, agent: api.renameAgent,
                   flow: api.renameFlow, persona: api.renamePersona }[kind]
      try { await fn(it.name, nv); await recarregar() }
      catch (e) { alert('Erro ao renomear:\n' + (e as Error).message) }
    },
    onDelete: async it => {
      if (!window.confirm(`Excluir ${meta.label.toLowerCase()} "${it.name}${meta.ext}"? Apaga o arquivo.`)) return
      const fn = { memory: api.deleteMemory, agent: api.deleteAgent,
                   flow: api.deleteFlow, persona: api.deletePersona }[kind]
      try { await fn(it.name); await recarregar() }
      catch (e) { alert('Erro ao excluir:\n' + (e as Error).message) }
    },
    onToggleChoice: async (it, optionId) => {
      // O servidor decide o resultado (radio desmarca as outras), então o card
      // espera a resposta em vez de adivinhar.
      try {
        const r = await api.toggleChoice(kind, it.name, optionId, AUTOR_LOCAL)
        patchLocal(it.name, { decision: r.decision })
      } catch { await recarregar() }
    },
    onEditDecision: it => setEditandoDecisao(it),
    onIdentity: async (it, patch) => {
      patchLocal(it.name, patch)
      try { await api.saveIdentity(kind, it.name, patch) }
      catch { await recarregar() }
    },
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent flex items-center justify-between shrink-0 gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            {carregando ? 'carregando…' : `${filtrados.length}${filtrados.length !== items.length ? ` de ${items.length}` : ''} · ${subtitle}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="buscar nome, texto ou #tag"
            className="w-64 bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          {pendentes > 0 && (
            <button onClick={() => setSoPendentes(v => !v)}
              title="Cards com escolha em aberto"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                soPendentes ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'border-amber-500/30 text-amber-400/80 hover:text-amber-300'}`}>
              ◉ {pendentes} a decidir
            </button>
          )}
          <button onClick={onNew}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg">
            + {meta.label}
          </button>
        </div>
      </div>

      {kind === 'memory' && vocab && (
        <div className="px-5 py-2 border-b border-gray-800 bg-[#0f0f0f] flex items-center gap-1.5 shrink-0 overflow-x-auto">
          <button onClick={() => setTipoFiltro('')}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
              !tipoFiltro ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
            todas {items.length}
          </button>
          {Object.entries(vocab.types).map(([id, t]) => (
            <button key={id} onClick={() => setTipoFiltro(tipoFiltro === id ? '' : id)}
              title={`${t.desc} · no prompt: ${t.prompt}`}
              className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                tipoFiltro === id ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-300'}`}
              style={tipoFiltro === id
                ? { background: t.color, borderColor: t.color }
                : { borderColor: t.color + '55' }}>
              {t.label} {porTipo[id] || 0}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {!carregando && filtrados.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2">
            <p className="text-gray-500 text-sm">
              {items.length === 0
                ? `Nenhum recurso deste tipo ainda.`
                : `Nada encontrado para "${busca}".`}
            </p>
            {items.length === 0 && (
              <button onClick={onNew} className="text-xs text-blue-400 hover:underline">criar o primeiro</button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
            {filtrados.map(it => (
              <ResourceCard key={it.name} item={it} kind={kind} actions={actions} vocab={vocab} />
            ))}
          </div>
        )}
      </div>


      {editandoDecisao && (
        <EditorDecisao
          item={editandoDecisao}
          onFechar={() => setEditandoDecisao(null)}
          onSalvar={async (d: Partial<Decision>) => {
            const r = await api.saveDecision(kind, editandoDecisao.name, d)
            patchLocal(editandoDecisao.name, { decision: r.decision })
          }}
        />
      )}
    </div>
  )
}
