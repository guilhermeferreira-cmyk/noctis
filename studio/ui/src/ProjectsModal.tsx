import { useEffect } from 'react'
import { type ProjectMeta } from './api'

export default function ProjectsModal({
  projects, current, onSelect, onCreate, onDelete, onRename, onClose,
}: {
  projects: ProjectMeta[]
  current: string
  onSelect: (slug: string) => void
  onCreate: () => void
  onDelete: (slug: string) => void
  onRename: (slug: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#141414] border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85%] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-gray-100 font-semibold text-base">Projetos</h2>
            <p className="text-xs text-gray-600 mt-0.5">{projects.length} projeto{projects.length !== 1 ? 's' : ''} · clique para ativar</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCreate} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">+ Novo projeto</button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl leading-none px-1">✕</button>
          </div>
        </div>

        <div className="p-4 overflow-auto grid grid-cols-2 gap-3">
          {projects.map(p => {
            const active = p.slug === current
            return (
              <div
                key={p.slug}
                onClick={() => onSelect(p.slug)}
                className={`group relative text-left rounded-xl border p-3.5 cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/40'
                    : 'border-gray-800 bg-[#1a1a1a] hover:border-gray-700 hover:bg-[#1f1f1f]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📁</span>
                      <span className="text-sm font-semibold text-gray-100 truncate">{p.displayName}</span>
                    </div>
                    <div className="text-[11px] font-mono text-gray-600 mt-0.5 truncate">{p.slug}</div>
                  </div>
                  {active && <span className="shrink-0 text-[10px] font-bold text-blue-400 flex items-center gap-1">● ATIVO</span>}
                </div>

                <div className="text-[11px] text-gray-500 mt-2.5">
                  {p.counts.agents} agentes · {p.counts.flows} fluxos · {p.counts.personas} personas · {p.counts.memory} memórias
                </div>

                {/* Ações */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); onRename(p.slug) }}
                    title="Renomear projeto"
                    className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs"
                  >✎</button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(p.slug) }}
                    title="Excluir projeto"
                    disabled={projects.length <= 1}
                    className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 hover:bg-red-700 text-gray-300 hover:text-white text-xs disabled:opacity-30 disabled:hover:bg-gray-800"
                  >🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
