import { useEffect, useRef, useState } from 'react'
import { api, type CanvasMeta } from '../api'
import { GiTreasureMap, GiFiles } from '../iconesEssenciais'
import { MenuIcon } from '../lib/menuIcons'
import { copiar, textoDaReferencia } from '../lib/referencia'

/**
 * Seletor dos mapas do projeto.
 *
 * Um mapa é um recorte: os mesmos recursos podem aparecer em vários, cada um
 * com sua lane e seu peso. O que descreve o recurso — cor, ícone, tags,
 * ativa/inativa — é o mesmo em todos, porque mora no `resources.json`.
 */
export function CanvasPicker({ atual, mapas, onTrocar, onMudou }: {
  atual: string
  mapas: CanvasMeta[]
  onTrocar: (id: string) => void
  onMudou: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || btn.current?.contains(t)) return
      setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const corrente = mapas.find(m => m.id === atual)

  const criar = async () => {
    const nome = window.prompt('Nome do novo mapa:', 'Novo mapa')?.trim()
    if (!nome) return
    setAberto(false)
    try {
      const novo = await api.createCanvas(nome)
      onMudou(); onTrocar(novo.id)
    } catch (e) { alert('Erro ao criar:\n' + (e as Error).message) }
  }

  const duplicar = async (m: CanvasMeta) => {
    const nome = window.prompt('Nome da cópia:', `${m.name} (cópia)`)?.trim()
    if (!nome) return
    setAberto(false)
    try {
      const novo = await api.duplicateCanvas(m.id, nome)
      onMudou(); onTrocar(novo.id)
    } catch (e) { alert('Erro ao duplicar:\n' + (e as Error).message) }
  }

  const renomear = async (m: CanvasMeta) => {
    const nome = window.prompt('Novo nome do mapa:', m.name)?.trim()
    if (!nome || nome === m.name) return
    try { await api.renameCanvas(m.id, nome); onMudou() }
    catch (e) { alert('Erro ao renomear:\n' + (e as Error).message) }
  }

  const excluir = async (m: CanvasMeta) => {
    if (mapas.length <= 1) { alert('Este é o único mapa do projeto.'); return }
    if (!window.confirm(
      `Excluir o mapa "${m.name}"?\n\nSó o arranjo é apagado — nenhum arquivo do projeto é tocado.`)) return
    try {
      const r = await api.deleteCanvas(m.id)
      setAberto(false); onMudou()
      if (m.id === atual) onTrocar(r.next)
    } catch (e) { alert('Erro ao excluir:\n' + (e as Error).message) }
  }

  return (
    <div className="relative">
      <button ref={btn} onClick={() => setAberto(a => !a)}
        title="Trocar de mapa"
        className="flex items-center gap-2 text-xs bg-[#1a1a1a] hover:bg-gray-800 border border-gray-700 text-gray-200 px-3 py-1.5 rounded-lg">
        <GiTreasureMap size={13} className="text-gray-500 shrink-0" aria-hidden="true" />
        <span className="font-medium max-w-[13rem] truncate">{corrente?.name || atual}</span>
        {mapas.length > 1 && <span className="text-gray-600">{mapas.length}</span>}
        <span className="text-gray-500 text-[10px]">▼</span>
      </button>

      {aberto && (
        <div ref={ref}
          className="absolute top-9 left-0 z-50 w-72 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl py-1 text-sm">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-600">Mapas do projeto</div>
          <div className="max-h-72 overflow-y-auto">
            {mapas.map(m => (
              <div key={m.id}
                className={`group/m flex items-center gap-1 px-2 py-1.5 hover:bg-gray-800 ${m.id === atual ? 'bg-gray-800/60' : ''}`}>
                <button onClick={() => { setAberto(false); onTrocar(m.id) }}
                  className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    {m.id === atual && <span className="text-blue-400 text-[10px]">●</span>}
                    <span className="text-gray-200 truncate">{m.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {m.nodes ?? 0} card{(m.nodes ?? 0) !== 1 ? 's' : ''} · {m.lanes ?? 0} lane{(m.lanes ?? 0) !== 1 ? 's' : ''}
                  </div>
                </button>
                <div className="flex items-center opacity-0 group-hover/m:opacity-100 shrink-0">
                  <button onClick={() => renomear(m)} title="Renomear"
                    className="text-gray-500 hover:text-gray-200 px-1"><MenuIcon.renomear size={13} /></button>
                  <button onClick={() => copiar(textoDaReferencia({ tipo: 'mapa', id: m.id, nome: m.name }))}
                    title="Copiar identificador do mapa"
                    className="text-gray-500 hover:text-gray-200 px-1"><MenuIcon.identificador size={13} /></button>
                  <button onClick={() => duplicar(m)} title="Duplicar"
                    className="text-gray-500 hover:text-gray-200 px-1"><GiFiles size={13} /></button>
                  <button onClick={() => excluir(m)} title="Excluir mapa"
                    className="text-gray-600 hover:text-red-400 px-1"><MenuIcon.excluir size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={criar}
            className="w-full text-left px-3 py-1.5 text-blue-400 hover:bg-gray-800 border-t border-gray-800 mt-1 flex items-center gap-2">
            <MenuIcon.novo size={13} aria-hidden="true" /> Novo mapa
          </button>
          <p className="px-3 py-1.5 text-[10px] text-gray-600 leading-snug border-t border-gray-800">
            Cada mapa é um recorte. Cor, ícone e tags são do recurso e valem em todos.
          </p>
        </div>
      )}
    </div>
  )
}
