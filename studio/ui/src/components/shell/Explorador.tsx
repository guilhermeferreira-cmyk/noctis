import { useCallback, useEffect, useMemo, useState } from 'react'
import { GiOpenFolder, GiMagnifyingGlass, GiSkills, GiTreasureMap, GiCycle,
         GiContract } from 'react-icons/gi'
import { api, type CanvasMeta, type ResourceItem, type ResourceKind } from '../../api'
import { KIND_META, ICON_SIZES } from '../../lib/kinds'
import { copiar, textoDaReferencia } from '../../lib/referencia'
import { getIcon } from '../../memoryIcons'

/**
 * O projeto como árvore — o painel da esquerda.
 *
 * Antes, cada tipo de recurso era uma página inteira, e achar uma memória era
 * abrir "Memória" e rolar uma grade. Aqui o projeto aparece do jeito que ele é:
 * pastas por tipo, itens por nome, e um clique abre o item numa aba. É o
 * explorador de arquivos do Obsidian aplicado ao que o Noctis guarda.
 */

export type AbrirItem =
  | { tipo: 'recurso'; kind: ResourceKind; nome: string; titulo: string }
  | { tipo: 'skill'; chave: string; titulo: string }
  | { tipo: 'mapa'; mapa: string; titulo: string }

type Pasta = {
  id: string
  rotulo: string
  selo: string
  cor: string
  Icone: React.ComponentType<{ size?: number; className?: string }>
  itens: { id: string; titulo: string; abrir: AbrirItem; inativo?: boolean }[]
}

const titulo = (r: ResourceItem) => r.title || r.displayName || r.name.replace(/_/g, ' ')

export function Explorador({ projeto, projetoNome, onAbrir, onAbrirPagina, onTrocarProjeto,
                             versao }: {
  projeto: string
  projetoNome: string
  onAbrir: (i: AbrirItem) => void
  onAbrirPagina: (pagina: string) => void
  onTrocarProjeto: () => void
  /** Muda quando algo foi criado ou apagado em outro lugar e a árvore precisa reler. */
  versao: number
}) {
  const [aba, setAba] = useState<'arquivos' | 'busca'>('arquivos')
  const [recursos, setRecursos] = useState<Record<string, ResourceItem[]>>({})
  const [mapas, setMapas] = useState<CanvasMeta[]>([])
  const [skills, setSkills] = useState<{ chave: string; rotulo: string; estado: string }[]>([])
  const [abertas, setAbertas] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('noctis.pastas') || '["memory","agent"]')) }
    catch { return new Set(['memory', 'agent']) }
  })
  const [busca, setBusca] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; i: Pasta['itens'][number]; p: Pasta } | null>(null)

  // Fecha o menu em qualquer clique fora dele ou no Esc.
  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(null)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('mousedown', fechar)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', fechar); window.removeEventListener('keydown', esc) }
  }, [menu])

  const recarregar = useCallback(() => {
    api.getResources().then(r => setRecursos(r as unknown as Record<string, ResourceItem[]>)).catch(() => {})
    api.listCanvases().then(setMapas).catch(() => setMapas([]))
    api.learnings().then(v => setSkills(Object.values(v.skills)
      .filter(s => s.estado !== 'arquivada')
      .map(s => ({ chave: s.chave, rotulo: s.rotulo, estado: s.estado })))).catch(() => setSkills([]))
  }, [])
  useEffect(() => { recarregar() }, [recarregar, projeto, versao])

  useEffect(() => {
    try { localStorage.setItem('noctis.pastas', JSON.stringify([...abertas])) } catch { /* sem storage */ }
  }, [abertas])

  const pastas: Pasta[] = useMemo(() => {
    const deKind = (k: ResourceKind, id: string, rotulo: string): Pasta => ({
      id, rotulo, selo: KIND_META[k].label.toUpperCase(), cor: KIND_META[k].color,
      Icone: getIcon(KIND_META[k].icon),
      itens: (recursos[k] || []).map(r => ({
        id: `${k}:${r.name}`, titulo: titulo(r), inativo: r.active === false,
        abrir: { tipo: 'recurso', kind: k, nome: r.name, titulo: titulo(r) } as AbrirItem,
      })),
    })
    return [
      deKind('agent', 'agent', 'Agentes'),
      deKind('memory', 'memory', 'Memórias'),
      deKind('flow', 'flow', 'Fluxos'),
      deKind('persona', 'persona', 'Personas'),
      { id: 'learning', rotulo: 'Learning', selo: 'LEARNING', cor: '#10b981', Icone: GiSkills,
        itens: skills.map(s => ({ id: `skill:${s.chave}`, titulo: s.rotulo,
          abrir: { tipo: 'skill', chave: s.chave, titulo: s.rotulo } as AbrirItem })) },
      { id: 'mapas', rotulo: 'Mapas', selo: 'MAPA', cor: '#06b6d4', Icone: GiTreasureMap,
        itens: mapas.map(m => ({ id: `mapa:${m.id}`, titulo: m.name,
          abrir: { tipo: 'mapa', mapa: m.id, titulo: m.name } as AbrirItem })) },
    ]
  }, [recursos, mapas, skills])

  // A página de grade de cada pasta, para quem quer a visão de conjunto.
  const PAGINA_DA_PASTA: Record<string, string> = {
    agent: 'agents', memory: 'memory', flow: 'flows', persona: 'personas', skills: 'learning', mapas: 'canvas',
  }

  const alternar = (id: string) => setAbertas(a => {
    const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  const achados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return []
    return pastas.flatMap(p => p.itens.filter(i => i.titulo.toLowerCase().includes(q))
      .map(i => ({ ...i, pasta: p })))
  }, [busca, pastas])

  const Item = ({ i, p }: { i: Pasta['itens'][number]; p: Pasta }) => (
    <button onClick={() => onAbrir(i.abrir)} title={i.titulo}
      onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, i, p }) }}
      // O item acende na cor do tipo dele, como os cards: a árvore fala a mesma
      // língua de cor do resto do Noctis.
      onMouseEnter={e => { e.currentTarget.style.background = p.cor + '1a' }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
      className="w-full flex items-center gap-2 pl-7 pr-2 py-[3px] rounded-md text-left text-[12.5px]
                 text-gray-400 hover:text-gray-100 group/item">
      <span className={`truncate flex-1 ${i.inativo ? 'opacity-50' : ''}`}>{i.titulo}</span>
      <span className="text-[9px] tracking-wider text-gray-600 shrink-0 transition-colors"
        style={{ color: undefined }}>
        <span className="group-hover/item:hidden">{p.selo}</span>
        <span className="hidden group-hover/item:inline" style={{ color: p.cor }}>{p.selo}</span>
      </span>
    </button>
  )

  const renomear = async (i: Pasta['itens'][number]) => {
    const a = i.abrir
    const atual = a.titulo
    const novo = window.prompt('Novo nome:', a.tipo === 'recurso' ? a.nome : atual)?.trim()
    if (!novo) return
    try {
      if (a.tipo === 'recurso') {
        const fn = { agent: api.renameAgent, memory: api.renameMemory, flow: api.renameFlow,
                     persona: api.renamePersona }[a.kind]
        await fn(a.nome, novo)
      } else if (a.tipo === 'mapa') {
        await api.renameCanvas(a.mapa, novo)
      } else {
        await api.editarLearning(a.chave, { rotulo: novo })
      }
      recarregar()
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="h-full flex flex-col">
      {/* O cabeçalho do painel: duas vistas, como no Obsidian (arquivos e busca). */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1.5 border-b border-white/[0.06] shrink-0">
        {([['arquivos', GiOpenFolder, 'Arquivos'], ['busca', GiMagnifyingGlass, 'Buscar']] as const).map(([id, I, rot]) => (
          <button key={id} onClick={() => setAba(id)} title={rot}
            className={`p-1.5 rounded-md ${aba === id ? 'bg-white/[0.08] text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
            <I size={15} />
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={recarregar} title="Reler o projeto" className="p-1.5 rounded-md text-gray-500 hover:text-gray-200">
          <GiCycle size={14} />
        </button>
        <button onClick={() => setAbertas(new Set())} title="Recolher tudo" className="p-1.5 rounded-md text-gray-500 hover:text-gray-200">
          <GiContract size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {aba === 'busca' ? (
          <>
            <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
              placeholder="buscar no projeto"
              className="w-full mb-2 bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-gray-200
                         focus:outline-none focus:border-violet-500/60 placeholder:text-gray-600" />
            {busca && achados.length === 0 && <p className="text-[11px] text-gray-600 px-2">nada com “{busca}”</p>}
            {achados.map(i => <Item key={i.id} i={i} p={i.pasta} />)}
          </>
        ) : pastas.map(p => {
          const aberta = abertas.has(p.id)
          return (
            <div key={p.id} className="mb-0.5">
              <div className="flex items-center group/pasta">
                <button onClick={() => alternar(p.id)}
                  className="flex-1 flex items-center gap-1.5 px-2 py-[3px] rounded-md text-left text-[12.5px]
                             text-gray-300 hover:bg-white/[0.05]">
                  <span className={`text-gray-600 text-[10px] transition-transform ${aberta ? 'rotate-90' : ''}`}>▶</span>
                  <span style={{ color: p.cor }} className="shrink-0 grid place-items-center"><p.Icone size={ICON_SIZES.arvore} /></span>
                  <span className="truncate">{p.rotulo}</span>
                  <span className="text-[10px] text-gray-600 tabular-nums ml-auto">{p.itens.length}</span>
                </button>
                <button onClick={() => onAbrirPagina(PAGINA_DA_PASTA[p.id])} title={`Abrir ${p.rotulo} em grade`}
                  className="opacity-0 group-hover/pasta:opacity-100 text-gray-600 hover:text-gray-200 px-1.5 text-xs">↗</button>
              </div>
              {aberta && (p.itens.length
                ? p.itens.map(i => <Item key={i.id} i={i} p={p} />)
                : <p className="pl-7 py-1 text-[11px] text-gray-700">vazio</p>)}
            </div>
          )
        })}
      </div>

      {menu && (() => {
        const { i, p } = menu
        const a = i.abrir
        const ref = a.tipo === 'recurso' ? textoDaReferencia({ tipo: 'recurso', kind: a.kind, nome: a.nome, rotulo: i.titulo })
          : a.tipo === 'skill' ? `skill:${a.chave}` : `mapa:${a.mapa} · ${a.titulo}`
        const opcao = (rotulo: string, fn: () => void, perigo = false) => (
          <button onMouseDown={e => { e.stopPropagation(); setMenu(null); fn() }}
            className={`w-full text-left px-3 py-1.5 text-[12px] rounded-md hover:bg-white/[0.07] ${perigo ? 'text-red-400' : 'text-gray-300'}`}>
            {rotulo}
          </button>
        )
        return (
          <div onMouseDown={e => e.stopPropagation()}
            className="fixed z-[90] w-52 p-1 rounded-lg border border-white/[0.08] bg-[#1b1b1f]/95 backdrop-blur-xl shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 216), top: Math.min(menu.y, window.innerHeight - 200) }}>
            <div className="px-3 pt-1 pb-1.5 text-[10px] tracking-wider truncate" style={{ color: p.cor }}>
              {p.selo} · {i.titulo}
            </div>
            {opcao('Abrir', () => onAbrir(a))}
            {opcao(`Abrir ${p.rotulo.toLowerCase()} em grade`, () => onAbrirPagina(PAGINA_DA_PASTA[p.id]))}
            {opcao('Copiar identificador', () => { copiar(ref) })}
            {a.tipo === 'recurso' && opcao('Exportar PDF', () => window.open(api.pdfRecursoUrl(a.kind, a.nome), '_blank'))}
            <div className="h-px bg-white/[0.06] my-1" />
            {opcao('Renomear', () => renomear(i))}
          </div>
        )
      })()}

      {/* O "vault" do Obsidian: o projeto aberto, e o que vale para todos eles. */}
      <div className="border-t border-white/[0.06] px-2 py-1.5 flex items-center gap-1 shrink-0">
        <button onClick={onTrocarProjeto} title="Trocar de projeto"
          className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.05] text-left">
          <span className="text-gray-500 text-[10px]">⇅</span>
          <span className="text-[12.5px] text-gray-200 truncate">{projetoNome}</span>
        </button>
      </div>
    </div>
  )
}
