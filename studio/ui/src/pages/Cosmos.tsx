import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  addEdge, applyNodeChanges, applyEdgeChanges, Handle, Position, MarkerType,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, type Cosmos as CosmosData, type PreviewShape } from '../api'
import { abrirMapaNaDoca } from '../lib/doca'
import { GiTreasureMap } from 'react-icons/gi'
import { MenuIcon } from '../lib/menuIcons'
import { copiar, textoDaReferencia } from '../lib/referencia'
import { Aura, auraPorNo } from '../components/Aura'
import { VIDRO, CEU, AURA, KIND_META, KIND_ORDER } from '../lib/kinds'
import { moverPanorama } from '../components/FundoEstrelado'

/**
 * Cosmos — a camada acima do mapa de memória.
 *
 * Cada mapa é um card, e as setas dizem como um leva ao outro. Aqui não se mexe
 * no conteúdo de mapa nenhum: só no arranjo entre eles. Entrar num mapa é o
 * drill down — duplo clique no card, ou o botão "abrir".
 */

type MapaData = {
  nome: string
  cards: number
  lanes: number
  preview: PreviewShape[]
  /** Cor dominante do que o mapa contém — o mapa não tem cor própria. */
  cor: string
  aura: { entrada: string[]; saida: string[] }
  abrir: (id: string) => void
  renomear: (id: string, nome: string) => void
  excluir: (id: string, nome: string) => void
}

/** Miniatura do arranjo do mapa: lanes como moldura, cards como blocos. */
function Miniatura({ preview }: { preview: PreviewShape[] }) {
  if (!preview.length) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center text-gray-700 text-xs">
        mapa vazio
      </div>
    )
  }
  return (
    <div className="flex-1 min-h-0 relative rounded-lg bg-black/40 border border-gray-800 overflow-hidden">
      {preview.map((s, i) => (
        <div key={i}
          className="absolute rounded-[2px]"
          style={{
            left: `${s.x * 100}%`, top: `${s.y * 100}%`,
            width: `${Math.max(1.5, s.w * 100)}%`, height: `${Math.max(1.5, s.h * 100)}%`,
            background: s.lane ? 'transparent' : (s.color || '#3b82f6') + 'cc',
            border: s.lane ? '1px dashed #3f3f46' : 'none',
          }}
        />
      ))}
    </div>
  )
}

function MapaNode({ id, data, selected }: NodeProps) {
  const d = data as MapaData
  return (
    <div
      onDoubleClick={() => d.abrir(id)}
      style={{ ['--cor-card' as string]: d.cor }}
      title="Duplo clique para abrir este mapa"
      className={`acende corpo-vidro relative h-full w-full flex flex-col rounded-xl border bg-[#161616] shadow-lg p-3 gap-2 transition-colors ${
        selected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'}`}
    >
      <div aria-hidden="true" className="camada-vidro pointer-events-none absolute inset-0 rounded-xl" style={{ zIndex: -1 }} />
      {AURA.ativo && <Aura entrada={d.aura.entrada} propria={d.cor} saida={d.aura.saida} />}
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-gray-500 !border-0" />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-gray-500 !border-0" />

      <div className="flex items-center gap-2 shrink-0">
        <GiTreasureMap size={20} className="text-cyan-400 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-100 truncate flex-1" title={d.nome}>{d.nome}</span>
      </div>

      <Miniatura preview={d.preview} />

      <div className="flex items-center gap-2 shrink-0 text-[11px] text-gray-500">
        <span>{d.cards} card{d.cards !== 1 ? 's' : ''}</span>
        <span className="text-gray-700">·</span>
        <span>{d.lanes} lane{d.lanes !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button onClick={e => { e.stopPropagation(); copiar(textoDaReferencia({ tipo: 'mapa', id, nome: d.nome })) }}
          title="Copiar identificador" className="nodrag hover:text-gray-200 px-1">
          <MenuIcon.identificador size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); d.renomear(id, d.nome) }}
          title="Renomear" className="nodrag hover:text-gray-200 px-1">
          <MenuIcon.renomear size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); d.excluir(id, d.nome) }}
          title="Excluir mapa" className="nodrag hover:text-red-400 px-1">
          <MenuIcon.excluir size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); d.abrir(id) }}
          className="nodrag text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-500/10">
          abrir →
        </button>
      </div>
    </div>
  )
}

const nodeTypes = { mapa: MapaNode }

function Tela({ onAbrirMapa }: { onAbrirMapa: (id: string) => void }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [carregando, setCarregando] = useState(true)
  // Mesmos interruptores do mapa, e no mesmo lugar: a tela de aparência.
  const vidro = VIDRO.ativo
  const ceuLigado = CEU.ativo
  const prontoRef = useRef(false)
  const ultimoRef = useRef('')

  const paraRF = useCallback((c: CosmosData, acoes: Pick<MapaData, 'abrir' | 'renomear' | 'excluir'>) => {
    // O mapa não tem cor própria: ele empresta a cor mais frequente entre os
    // cards que guarda. Um mapa de referências acende diferente de um de fluxos.
    const cores = new Map<string, string>()
    for (const m of c.nodes) {
      const conta = new Map<string, number>()
      for (const s of m.preview || []) {
        if (s.lane || !s.color) continue
        conta.set(s.color, (conta.get(s.color) || 0) + 1)
      }
      const top = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]
      cores.set(m.id, top?.[0] || '#06b6d4')
    }
    const auras = auraPorNo(c.edges, id => cores.get(id))

    setNodes(c.nodes.map(m => ({
      id: m.id, type: 'mapa',
      position: { x: m.x, y: m.y }, width: 270, height: 210,
      data: { nome: m.name, cards: m.nodes ?? 0, lanes: m.lanes ?? 0,
              preview: m.preview || [], cor: cores.get(m.id) || '#06b6d4',
              aura: auras.get(m.id) || { entrada: [], saida: [] }, ...acoes },
    })))
    setEdges(c.edges.map(e => ({
      id: e.id || `${e.source}->${e.target}`, source: e.source, target: e.target,
      type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#52525b', strokeWidth: 2 },
    })))
  }, [])

  const recarregar = useCallback(async () => {
    prontoRef.current = false
    ultimoRef.current = ''
    const c = await api.getCosmos()
    paraRF(c, { abrir: onAbrirMapa, renomear: renomearMapa, excluir: excluirMapa })
    setCarregando(false)
    setTimeout(() => { prontoRef.current = true }, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paraRF, onAbrirMapa])

  async function renomearMapa(id: string, atual: string) {
    const nome = window.prompt('Novo nome do mapa:', atual)?.trim()
    if (!nome || nome === atual) return
    try { await api.renameCanvas(id, nome); await recarregar() }
    catch (e) { alert('Erro ao renomear:\n' + (e as Error).message) }
  }

  async function excluirMapa(id: string, nome: string) {
    if (!window.confirm(`Excluir o mapa "${nome}"?\n\nSó o arranjo é apagado — nenhum arquivo do projeto é tocado.`)) return
    try { await api.deleteCanvas(id); await recarregar() }
    catch (e) { alert('Erro ao excluir:\n' + (e as Error).message) }
  }

  const criarMapa = async () => {
    const nome = window.prompt('Nome do novo mapa:', 'Novo mapa')?.trim()
    if (!nome) return
    try { await api.createCanvas(nome); await recarregar() }
    catch (e) { alert('Erro ao criar:\n' + (e as Error).message) }
  }

  useEffect(() => { recarregar() }, [recarregar])

  // Só o arranjo é salvo daqui: posição dos mapas e as setas entre eles.
  useEffect(() => {
    if (!prontoRef.current) return
    const payload = {
      nodes: nodes.map(n => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }
    const json = JSON.stringify(payload)
    if (json === ultimoRef.current) return
    const t = setTimeout(() => { ultimoRef.current = json; api.saveCosmos(payload) }, 600)
    return () => clearTimeout(t)
  }, [nodes, edges])

  // A aura tem de acompanhar a ligação recém-feita, não só o que veio do disco.
  useEffect(() => {
    setNodes(ns => {
      const cor = (id: string) => (ns.find(n => n.id === id)?.data as MapaData | undefined)?.cor
      const auras = auraPorNo(edges.map(e => ({ source: e.source, target: e.target })), cor)
      let mudou = false
      const out = ns.map(n => {
        const d = n.data as unknown as MapaData
        const a = auras.get(n.id) || { entrada: [], saida: [] }
        const igual = a.entrada.join('|') === d.aura.entrada.join('|')
          && a.saida.join('|') === d.aura.saida.join('|')
        if (igual) return n
        mudou = true
        return { ...n, data: { ...d, aura: a } }
      })
      return mudou ? out : ns
    })
  }, [edges])

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes(ns => applyNodeChanges(c, ns)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges(es => applyEdgeChanges(c, es)), [])
  const onConnect = useCallback((c: Connection) =>
    setEdges(es => addEdge({ ...c, id: `${c.source}->${c.target}`, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#52525b', strokeWidth: 2 } }, es)), [])

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs text-gray-500">
            {carregando ? 'carregando…'
              : `${nodes.length} mapa${nodes.length !== 1 ? 's' : ''} · duplo clique abre · arraste de uma borda à outra para ligar`}
          </p>
        </div>
        <div className="flex items-center gap-3">
        <button onClick={criarMapa}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <MenuIcon.novo size={13} aria-hidden="true" /> Novo mapa
        </button>
        </div>
      </div>

      <div className={`flex-1 relative ${vidro ? 'vidro' : ''}`}>
        {/* O céu mora atrás da casca inteira agora — aqui ele só recebe o pan. */}
        <ReactFlow
          onMove={(_, vp) => moverPanorama(vp.x, vp.y)}
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(e, n) => {
            if ((e.target as HTMLElement).closest('button,a,input')) return
            const d = n.data as MapaData
            abrirMapaNaDoca(n.id, d.nome, { cards: d.cards, lanes: d.lanes, cor: d.cor }, () => onAbrirMapa(n.id))
          }}
          onEdgeClick={(_, e) => { if (window.confirm('Remover esta ligação?')) setEdges(es => es.filter(x => x.id !== e.id)) }}
          deleteKeyCode={null} fitView minZoom={0.3} maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#222" gap={20} />
          <Controls className="!bg-[#1a1a1a] !border-gray-700" />
          <MiniMap pannable zoomable nodeColor="#0891b2" className="!bg-[#111]" maskColor="rgba(0,0,0,0.6)" />
          {!carregando && nodes.length === 0 && (
            <Panel position="top-center" className="!mt-24">
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-2">Nenhum mapa neste projeto ainda.</p>
                <button onClick={criarMapa} className="text-xs text-blue-400 hover:underline">criar o primeiro</button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  )
}

export default function CosmosPage({ onAbrirMapa }: { onAbrirMapa: (id: string) => void }) {
  return (
    <ReactFlowProvider>
      <Tela onAbrirMapa={onAbrirMapa} />
    </ReactFlowProvider>
  )
}
