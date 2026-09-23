import {
  useCallback, useEffect, useRef, useState, createContext, useContext,
} from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, NodeResizer, Panel,
  addEdge, applyNodeChanges, applyEdgeChanges, Handle, Position, MarkerType, SelectionMode,
  useReactFlow, useUpdateNodeInternals,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  api, assetUrl, fileToBase64,
  type MemoryCanvas, type ResourceKind, type ResourceList, type FlowConfig, type CanvasMeta,
  type Decision,
  type LaneDigest, type Attachment,
} from '../api'
import { getIcon, iconNames } from '../memoryIcons'
import { abrirRecursoNaDoca, recursoRenomeado } from '../lib/doca'
import { CanvasPicker } from '../components/CanvasPicker'
import { OrigemIcone } from '../components/OrigemIcone'
import { Aura, auraPorNo } from '../components/Aura'
import { moverPanorama } from '../components/FundoEstrelado'
import { SeletorIcone } from '../components/SeletorIcone'
import { NovaMemoria } from '../components/NovaMemoria'
import { GrafoMapa, type NoGrafo, type LigacaoGrafo } from '../components/GrafoMapa'
import { BarraDoCard, DiscosDoAgente, useFicha } from '../components/Progresso'
import { Switch } from '../components/Switch'
import { copiar, textoDaReferencia } from '../lib/referencia'
import { BlocoDecisao, AUTOR_LOCAL } from '../components/BlocoDecisao'
import { EditorDecisao } from '../components/EditorDecisao'
import { CarregandoNoctis, EsqueletoLinhas, EsqueletoPainel } from '../components/Esqueleto'
import { ItemMenu, MenuIcon } from '../lib/menuIcons'
import { GiTreasureMap } from '../iconesEssenciais'
import { EdgeGradiente } from '../components/EdgeGradiente'
import { COLORS, KIND_META, KIND_ORDER, type DrawerTarget, ICON_SIZES, VIDRO, CEU, AURA, TIPO_META, PONTILHADO } from '../lib/kinds'



const uid = (prefix: string) => `${prefix}:${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

type MemData = {
  kind: ResourceKind; label: string; color: string; icon: string; active: boolean; tags: string[]
  title: string; excerpt: string; badge: string; lines: number; usedBy: string[]
  /** Quantos arquivos acompanham a memória, quantos são imagem, e a grade de miniaturas. */
  attachments: number; images: number; thumbs: string[]
  /** De onde veio: 'inserido' por uma pessoa, 'produzido' por agente ou fluxo. */
  origin: string
  /** Tipo da memória. Governa prompt, peso e validade. */
  mtype?: string
  /** Só quando há escolhas — é o que faz o card virar decisão. */
  decision?: Decision
  /** Ids das saídas deste card: uma por ligação existente, mais uma livre no fim.
   *  Cada seta parte do seu próprio ponto, em vez de todas brotarem do mesmo. */
  saidas: string[]
  /** Cores dos vizinhos: quem chega pela esquerda, para onde sai pela direita.
   *  Alimenta a aura; vazio quando o card não está ligado a nada. */
  aura?: { entrada: string[]; saida: string[] }
  /** Peso desta instância no condensado da lane. 1 = neutro, 0 = fora. */
  weight: number
  /** Fatia do condensado, calculada ao vivo. -1 = card fora de qualquer lane. */
  share: number
}
type LaneData = { name: string; color: string; budget: number; tags: string[]
                  /** Cores dos vizinhos ligados à lane, como nos cards. */
                  aura?: { entrada: string[]; saida: string[] } }

// ── Ações expostas aos nós via contexto ───────────────────────────────────────
interface NodeActions {
  toggleActive:  (id: string) => void
  toggleChoice:  (id: string, optionId: string) => void
  editDecision:  (id: string) => void
  open:          (id: string) => void
  remove:        (id: string) => void
  removeFromMap: (id: string) => void
  rename:        (id: string) => void
  setColor:      (id: string, color: string) => void
  setIcon:       (id: string, icon: string) => void
  setTipo:       (id: string, tipo: string) => void
  /** Id do mapa aberto — a exportação da lane precisa dizer de qual mapa. */
  mapaAtual:     () => string
  addTag:        (id: string, tag: string) => void
  removeTag:     (id: string, tag: string) => void
  setWeight:     (id: string, weight: number) => void
  openMenuId:    string | null
  toggleMenu:    (id: string) => void
  closeMenu:     () => void
  // Lanes
  renameLane:       (id: string, name: string) => void
  setLaneColor:     (id: string, color: string) => void
  deleteLane:       (id: string) => void
  autoLayoutLane:   (id: string) => void
  extractLanePrompt:(id: string) => void
  condenseLane:     (id: string) => void
  setLaneBudget:    (id: string) => void
}
const ActionsCtx = createContext<NodeActions | null>(null)

// ── Lane (frame que agrupa cards) ─────────────────────────────────────────────
function LaneNode({ id, data, selected }: NodeProps) {
  const a = useContext(ActionsCtx)!
  const { name, color, budget, aura } = data as LaneData
  const tags = (data as LaneData).tags || []
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const [tagInput, setTagInput] = useState('')
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const commit = () => { const v = val.trim(); if (v && v !== name) a.renameLane(id, v); setEditing(false) }
  const commitTag = () => { const t = tagInput.trim().replace(/^#/, ''); if (t) a.addTag(id, t); setTagInput('') }

  return (
    <div className="acende corpo-vidro-lane h-full w-full rounded-xl border-2 border-dashed relative" style={{ borderColor: color + '99', background: color + '0d', ['--cor-card' as string]: color }}>
      {/* camada de vidro: fica entre a aura e o conteúdo, e some quando desligado */}
      <div aria-hidden="true" className="camada-vidro camada-vidro-lane pointer-events-none absolute inset-0 rounded-[10px]" style={{ zIndex: -1 }} />
      {/* a lane é grande: a aura vai numa escala maior, senão vira um filete */}
      {AURA.ativo && <Aura entrada={aura?.entrada || []} propria={color} saida={aura?.saida || []} escala={1.8} intensidade={0.8} />}
      <NodeResizer color={color} isVisible={!!selected} minWidth={260} minHeight={180} handleClassName="!w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left}  className="!w-3 !h-3 !bg-gray-400 !border-0" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-400 !border-0" />

      <div className="lane-header flex items-center gap-2 px-3 py-1.5 rounded-t-[10px]" style={{ background: color + '26' }}>
        <span className="text-xs shrink-0 flex items-center gap-1" style={{ color }}>
          <MenuIcon.novaLane size={12} aria-hidden="true" /> Lane
        </span>
        {editing
          ? <input autoFocus value={val}
              onChange={e => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              className="nodrag flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-sm text-gray-100 focus:outline-none" />
          : <span onDoubleClick={() => { setVal(name); setEditing(true) }}
              className="text-sm font-bold text-gray-100 flex-1 truncate cursor-text" title="Duplo-clique para renomear">{name}</span>}
        {tags.length > 0 && (
          <div className="nodrag flex items-center gap-1 shrink-0 max-w-[45%] overflow-hidden">
            {tags.map(t => (
              <span key={t} className="group/tag inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                style={{ color, borderColor: color + '66', background: color + '14' }}>
                #{t}
                <button onClick={e => { e.stopPropagation(); a.removeTag(id, t) }}
                  className="opacity-0 group-hover/tag:opacity-100 hover:text-red-400 leading-none">×</button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); a.autoLayoutLane(id) }}
          title="Organizar pelos vínculos — colunas no sentido das setas, sem sobreposição"
          className="nodrag nopan text-gray-300 hover:text-white px-1 leading-none"
        ><MenuIcon.organizar size={14} aria-hidden="true" /></button>
        <button ref={btnRef} onClick={() => setMenu(m => !m)} className="nodrag text-gray-300 hover:text-white px-1 text-base leading-none">⋯</button>
      </div>

      {menu && (
        <div ref={menuRef} className="lane-menu nodrag nopan absolute top-9 right-1 z-50 w-48 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl py-1 text-sm">
          <ItemMenu icone="organizar" onClick={() => { setMenu(false); a.autoLayoutLane(id) }}>Organizar pelos vínculos</ItemMenu>
          <ItemMenu icone="condensar" onClick={() => { setMenu(false); a.condenseLane(id) }}>Condensar lane</ItemMenu>
          <ItemMenu icone="orcamento" tom="suave" className="!text-xs"
            onClick={() => { setMenu(false); a.setLaneBudget(id) }}>Orçamento: {Math.round((budget || 12000) / 1000)}k chars</ItemMenu>
          <ItemMenu icone="prompt" onClick={() => { setMenu(false); a.extractLanePrompt(id) }}>Extrair prompt (integral)</ItemMenu>
          <ItemMenu icone="renomear" onClick={() => { setMenu(false); setVal(name); setEditing(true) }}>Renomear</ItemMenu>
          <ItemMenu icone="pdf"
            onClick={() => { setMenu(false); window.open(api.pdfLaneUrl(id, a.mapaAtual()), '_blank') }}>
            Exportar PDF da lane
          </ItemMenu>
          <ItemMenu icone="identificador"
            onClick={() => copiar(textoDaReferencia({ tipo: 'lane', id, nome: name }))}>
            Copiar identificador
          </ItemMenu>
          <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
            <div className="text-xs text-gray-500 mb-1">Tags</div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-200">
                    #{t}<button onClick={() => a.removeTag(id, t)} className="hover:text-red-400 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
            <input value={tagInput}
              onChange={e => setTagInput(e.target.value.replace(/[^a-zA-Z0-9_\- ]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTag() } }}
              placeholder="nova tag + Enter"
              className="nodrag w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>

          <div className="px-3 py-1.5 border-t border-gray-800">
            <div className="text-xs text-gray-500 mb-1">Cor</div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => a.setLaneColor(id, c)} className="w-4 h-4 rounded-full border border-black/40"
                  style={{ background: c, outline: c === color ? '2px solid #fff' : 'none' }} />
              ))}
            </div>
          </div>
          <ItemMenu icone="desfazerLane" className="border-t border-gray-700 mt-1"
            onClick={() => { setMenu(false); a.deleteLane(id) }}>
            Desfazer lane <span className="text-gray-600 text-xs">(os cards ficam)</span>
          </ItemMenu>
        </div>
      )}
    </div>
  )
}

// ── Nó de recurso ─────────────────────────────────────────────────────────────
function ResourceNode({ id, data, selected }: NodeProps) {
  const a = useContext(ActionsCtx)!
  const { kind, label, color, icon, active, tags, title, excerpt, badge, lines, usedBy, weight, share, attachments, images, thumbs, origin, decision, saidas, aura, mtype } = data as MemData
  const [tagInput, setTagInput] = useState('')
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menu = a.openMenuId === id
  const heading = title || label.replace(/_/g, ' ')
  const meta = KIND_META[kind]

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return
      a.closeMenu()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') a.closeMenu() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  const commitTag = () => { const t = tagInput.trim().replace(/^#/, ''); if (t) a.addTag(id, t); setTagInput('') }
  const Icon = getIcon(icon)
  // Só a barra de baixo (borda fina de XP) ainda usa isto direto; os discos,
  // acima, buscam por conta própria — ver o comentário deles.
  const ficha = useFicha(kind === 'agent' ? label : undefined)
  const tipoMem = TIPO_META[mtype || 'nota']

  return (
    <div
      className={`acende corpo-vidro relative h-full w-full flex flex-col rounded-xl border bg-[#161616] shadow-lg transition-opacity ${active ? 'border-gray-700' : 'border-gray-800 opacity-60'} ${selected ? 'ring-1 ring-blue-500/60' : ''}`}
      style={{ borderLeft: `4px solid ${color}`, ['--cor-card' as string]: color }}
    >
      <div aria-hidden="true" className="camada-vidro pointer-events-none absolute inset-0 rounded-xl" style={{ zIndex: -1 }} />
      {/* atrás do card e sangrando pelas bordas; o corpo é opaco e fica por cima */}
      {active && AURA.ativo && <Aura entrada={aura?.entrada || []} propria={color} saida={aura?.saida || []} />}
      <NodeResizer color={color} isVisible={!!selected} minWidth={220} minHeight={150} handleClassName="!w-2.5 !h-2.5" />
      {/* Entrada: uma só. Tudo o que chega ao card entra pelo mesmo ponto. */}
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-gray-500 !border-0" />

      {/* Saídas: uma por ligação, mais a última livre para puxar a próxima.
          Distribuídas na altura para as setas não se sobreporem ao sair. */}
      {saidas.map((hid, i) => {
        const livre = i === saidas.length - 1
        return (
          <Handle
            key={hid} id={hid} type="source" position={Position.Right}
            title={livre ? 'Puxe para ligar a outro card' : 'Ligação'}
            style={{ top: `${((i + 1) / (saidas.length + 1)) * 100}%`,
                     background: livre ? '#3f3f46' : color,
                     borderColor: livre ? '#52525b' : color }}
            className={`!w-2.5 !h-2.5 ${livre ? '!border !border-dashed' : '!border-0'}`}
          />
        )
      })}

      <div className="flex items-start gap-2.5 px-3 pt-3 pb-1.5 shrink-0">
        {/* O nó do canvas não traz resumo consigo (o mapa guarda posição, não
            ficha); poucos agentes soltos no mapa, então buscar de cara é
            barato — não é a mesma multidão que a grade de Agentes tem. */}
        {kind === 'agent' && <DiscosDoAgente agente={label} cor={color} eager />}
        {/* a moldura acompanha o ícone: sem isso, um ícone grande vaza da caixa */}
        <span className="relative shrink-0 flex items-center justify-center rounded-lg"
          style={{ background: color + '22', color,
                   width: Math.max(44, ICON_SIZES.card + 14), height: Math.max(44, ICON_SIZES.card + 14) }}>
          <Icon size={ICON_SIZES.card} />
        </span>
        <span className="text-sm text-gray-100 font-semibold flex-1 capitalize leading-tight line-clamp-2" title={heading}>{heading}</span>
        {!active && <span title="Inativa" className="text-xs shrink-0">🔒</span>}
        <button ref={menuBtnRef} onClick={() => a.toggleMenu(id)}
          className="nodrag text-gray-500 hover:text-gray-200 px-1 shrink-0 text-base leading-none self-start">⋯</button>
      </div>

      <div className="px-3 pb-1.5 shrink-0 flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ color, background: color + '1f' }}>{meta.label}</span>
        {/* o tipo da memória, no mesmo lugar e no mesmo desenho do grid */}
        {kind === 'memory' && tipoMem && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            title={`${tipoMem.desc} · no prompt: ${tipoMem.prompt}`}
            style={{ color: tipoMem.color, background: tipoMem.color + '1f' }}>{tipoMem.label}</span>
        )}
        {decision && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
            decision.options.some(o => o.checked) ? 'text-gray-400 bg-gray-700/60' : 'text-amber-300 bg-amber-500/20'}`}
            >{decision.options.some(o => o.checked) ? 'decidido' : 'a decidir'}</span>
        )}
        <OrigemIcone origem={origin} size={12} />
        <span className="text-[11px] font-mono text-gray-600 truncate">{label}{meta.ext}</span>
      </div>

      {tags.length > 0 && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-1 shrink-0">
          {tags.map(t => (
            <span key={t} className="nodrag group/tag inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ color, borderColor: color + '66', background: color + '14' }}>
              #{t}<button onClick={() => a.removeTag(id, t)} className="opacity-0 group-hover/tag:opacity-100 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="px-3 pb-2 flex-1 min-h-0 overflow-y-auto nowheel flex flex-col gap-1.5">
        {decision && (
          <div className="nodrag shrink-0">
            <BlocoDecisao decision={decision} compacto
              onToggle={oid => a.toggleChoice(id, oid)} />
          </div>
        )}
        {excerpt
          ? <p className={`text-xs text-gray-400 leading-snug shrink-0 ${thumbs.length ? 'line-clamp-2' : 'line-clamp-4'}`} title={excerpt}>{excerpt}</p>
          : <p className="text-xs text-gray-700 italic shrink-0">sem descrição</p>}

        {thumbs.length > 0 && (
          /* A grade toma a altura que sobrar do card em vez de fixar a sua:
             o nó é redimensionável, e é assim que as miniaturas crescem junto
             quando alguém puxa a borda. `auto-rows-fr` mantém as duas fileiras
             com a mesma altura; `min-h-0` deixa o flex encolher a grade em vez
             de estourar o card. */
          <div className="grid grid-cols-3 gap-1 flex-1 min-h-[46px] auto-rows-fr">
            {thumbs.map((t, i) => {
              const resto = images - thumbs.length
              const ultima = i === thumbs.length - 1 && resto > 0
              return (
                <div key={t} className="relative rounded-md overflow-hidden border border-gray-800 bg-[#0f0f0f]">
                  <img src={assetUrl(t)} alt="" loading="lazy" draggable={false}
                    className="w-full h-full object-cover" />
                  {ultima && (
                    <span className="absolute inset-0 bg-black/65 flex items-center justify-center text-[11px] font-semibold text-gray-100">
                      +{resto}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {kind === 'agent' && <BarraDoCard resumo={ficha} cor={color} />}
      <div className={`flex items-center gap-3 px-3 pt-1.5 border-t border-gray-800 text-[11px] text-gray-500 shrink-0 ${kind === 'agent' ? 'pb-2.5' : 'pb-1.5'}`}>
        {kind === 'memory' ? (
          <>
            <span title={`${lines} linhas`}>📝 {lines} ln</span>
            {usedBy.length > 0
              ? <span className="text-gray-400" title={'Usada por: ' + usedBy.join(', ')}>🤖 {usedBy.length} ag.</span>
              : <span className="text-gray-700">🤖 sem uso</span>}
            {attachments > 0 && (
              <span className="text-gray-400" title={`${attachments} ${attachments === 1 ? 'anexo' : 'anexos'}`}>
                📎 {attachments}
              </span>
            )}
          </>
        ) : <span className="truncate" title={badge}>{badge || meta.label}</span>}
        {!active && <span className="text-amber-500/80">inativa</span>}
        {share >= 0 && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0"
            title={`Peso ${weight} nesta lane · ocupa ${share.toFixed(1)}% do condensado`}>
            <span className="w-10 h-1 rounded-full bg-gray-800 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: weight > 0 ? color : '#52525b' }} />
            </span>
            <span className={weight > 0 ? 'text-gray-300 font-medium tabular-nums' : 'text-gray-700'}>
              {weight > 0 ? `${share.toFixed(0)}%` : 'fora'}
            </span>
          </span>
        )}
      </div>

      {menu && (
        <div ref={menuRef} className="nodrag nopan nowheel absolute top-9 right-1 z-50 w-52 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl py-1 text-sm">
          <ItemMenu icone={kind === 'flow' ? 'verFluxo' : 'ver'} onClick={() => { a.closeMenu(); a.open(id) }}>
            {kind === 'flow' ? 'Visualizar fluxo' : 'Visualizar'}
          </ItemMenu>
          <ItemMenu icone="renomear" onClick={() => { a.closeMenu(); a.rename(id) }}>Renomear</ItemMenu>
          <ItemMenu icone="pdf"
            onClick={() => { a.closeMenu(); window.open(api.pdfRecursoUrl(kind, label), '_blank') }}>
            Exportar PDF
          </ItemMenu>
          <ItemMenu icone="identificador"
            onClick={() => copiar(textoDaReferencia({ tipo: 'recurso', kind, nome: label }))}>
            Copiar identificador
          </ItemMenu>
          <ItemMenu icone={decision ? 'decidido' : 'decisao'} onClick={() => { a.closeMenu(); a.editDecision(id) }}>
            {decision ? 'Editar decisão' : 'Criar decisão'}
          </ItemMenu>

          <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Peso no condensado</span>
              <span className="text-xs font-mono tabular-nums" style={{ color: weight > 0 ? color : '#71717a' }}>{weight}</span>
            </div>
            <input type="range" min={0} max={10} step={0.5} value={weight}
              onChange={e => a.setWeight(id, Number(e.target.value))}
              className="nodrag w-full accent-blue-600 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>0 · fora</span><span>1 · neutro</span><span>10</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-1.5 leading-snug">
              {share >= 0
                ? <>Ocupa <span className="text-gray-300">{share.toFixed(1)}%</span> do condensado desta lane. O arquivo não é alterado.</>
                : <span className="text-gray-600">Arraste para dentro de uma lane para o peso valer.</span>}
            </div>
          </div>

          <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
            <div className="text-xs text-gray-500 mb-1">Tags</div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-200">
                    #{t}<button onClick={() => a.removeTag(id, t)} className="hover:text-red-400 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
            <input value={tagInput}
              onChange={e => setTagInput(e.target.value.replace(/[^a-zA-Z0-9_\- ]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTag() } }}
              placeholder="nova tag + Enter"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>

          <div className="px-3 py-2 border-t border-gray-800 mt-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">Estado</span>
            <Switch ligado={active} cor={color} onMudar={() => a.toggleActive(id)}
              rotulo={active ? 'Ativa' : 'Inativa'}
              titulo={active ? 'Desativar: sai das consultas dos agentes' : 'Ativar'} />
          </div>
          <div className="px-3 py-1.5">
            <div className="text-xs text-gray-500 mb-1">Cor</div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => a.setColor(id, c)} className="w-4 h-4 rounded-full border border-black/40"
                  style={{ background: c, outline: c === color ? '2px solid #fff' : 'none' }} />
              ))}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-xs text-gray-500 mb-1">Ícone</div>
            <SeletorIcone compacto atual={icon} cor={color} onEscolher={nm => a.setIcon(id, nm)} />
          </div>
          {kind === 'memory' && (
            <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
              <div className="text-xs text-gray-500 mb-1">Tipo</div>
              <select value={mtype || 'nota'} onChange={e => a.setTipo(id, e.target.value)}
                className="nodrag w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
                {Object.entries(TIPO_META).map(([tid, t]) => (
                  <option key={tid} value={tid}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t border-gray-700 mt-1">
            <ItemMenu icone="removerMapa" onClick={() => { a.closeMenu(); a.removeFromMap(id) }}>Remover do mapa</ItemMenu>
            <ItemMenu icone="excluir" tom="perigo" onClick={() => { a.closeMenu(); a.remove(id) }}>Excluir arquivo</ItemMenu>
          </div>
        </div>
      )}
    </div>
  )
}

const nodeTypes = { resource: ResourceNode, lane: LaneNode }
const edgeTypes = { gradiente: EdgeGradiente }

// ── Visualizador genérico (agente / persona) ──────────────────────────────────

// ── Markdown ──────────────────────────────────────────────────────────────────
//
// Um renderizador pequeno, e não uma biblioteca: o drawer só precisa de título,
// lista, tabela, citação, código e ênfase, e o estúdio não tem dependência de
// markdown hoje. O texto continua disponível cru no modo de edição.




// ── Anexos ────────────────────────────────────────────────────────────────────



/** Visualizador em tela cheia para o anexo clicado. */

// ── Drawer ────────────────────────────────────────────────────────────────────

// ── Modal de fluxo ────────────────────────────────────────────────────────────
function FlowModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [flow, setFlow] = useState<FlowConfig | null>(null)
  useEffect(() => { api.getFlow(name).then(setFlow) }, [name])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const steps = flow?.steps || []

  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#141414] border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85%] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-xs" style={{ color: KIND_META.flow.color }}>🔄 Fluxo</div>
            <div className="text-base font-semibold text-gray-100 truncate">{flow?.name || name}</div>
            <div className="text-[11px] font-mono text-gray-600">{name}.yaml</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-5 overflow-auto">
          {!flow ? <EsqueletoLinhas linhas={6} /> : (
            <>
              {flow.description && <p className="text-sm text-gray-400 mb-4 leading-relaxed">{flow.description.trim()}</p>}
              <div className="space-y-0">
                {steps.map((s, i) => (
                  <div key={s.id || i}>
                    <div className="rounded-lg border border-gray-800 bg-[#1a1a1a] p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-sm font-semibold text-gray-200">{s.id}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/50">🤖 {s.agent}</span>
                        {s.output_key && <span className="text-[11px] text-gray-600 ml-auto font-mono">→ {s.output_key}</span>}
                      </div>
                      {s.input && <div className="text-[11px] text-gray-500 mb-1"><span className="text-gray-600">input:</span> <span className="font-mono">{s.input}</span></div>}
                      {s.instruction && <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-snug font-sans">{s.instruction.trim()}</pre>}
                    </div>
                    {i < steps.length - 1 && <div className="flex justify-center text-gray-600 py-1">↓</div>}
                  </div>
                ))}
                {steps.length === 0 && <div className="text-gray-600 text-sm">Fluxo sem passos.</div>}
              </div>
              {flow.output && <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-500"><span className="text-gray-600">saída:</span> <span className="font-mono text-gray-400">{flow.output}</span></div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal de prompt (extraído de lane) ────────────────────────────────────────
function PromptModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#141414] border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85%] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-xs text-blue-400">✨ Prompt da lane</div>
            <div className="text-base font-semibold text-gray-100 truncate">{title}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copy} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${copied ? 'bg-green-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}`}>{copied ? '✓ Copiado' : 'Copiar'}</button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl leading-none px-1">✕</button>
          </div>
        </div>
        <div className="p-4 overflow-hidden flex-1">
          <textarea readOnly value={text} className="w-full h-full min-h-[300px] bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 resize-none focus:outline-none leading-relaxed" />
        </div>
      </div>
    </div>
  )
}

// ── Modal do condensado da lane ──────────────────────────────────
function DigestModal({ data, onClose, onSaved }: { data: LaneDigest; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'digest' | 'prompt'>('digest')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const text = tab === 'digest' ? data.digest : data.prompt

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const saveAsMemory = async () => {
    const slug = `${data.name} — condensado`
    if (!window.confirm(`Salvar como memory/${slug}.md?\n\nOs arquivos de origem continuam intactos.`)) return
    setSaving(true)
    try { await api.saveMemory(slug, data.digest); onSaved(); onClose() }
    catch (e) { alert('Erro ao salvar:\n' + (e as Error).message) }
    finally { setSaving(false) }
  }

  const ratio = data.sourceChars > 0 ? Math.round((data.digestChars / data.sourceChars) * 100) : 0
  const kindColor = (k: ResourceKind) => KIND_META[k].color

  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#141414] border border-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[88%] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-xs text-cyan-400">🗜 Condensado da lane</div>
            <div className="text-base font-semibold text-gray-100 truncate">{data.name}</div>
            <div className="text-[11px] text-gray-600 tabular-nums">
              {data.sourceChars.toLocaleString('pt-BR')} → {data.digestChars.toLocaleString('pt-BR')} chars
              <span className="text-gray-700"> · {ratio}% do original · orçamento {data.budget.toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={saveAsMemory} disabled={saving}
              className="text-xs bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? 'Salvando…' : 'Salvar como memória'}
            </button>
            <button onClick={copy} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${copied ? 'bg-green-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}`}>{copied ? '✓ Copiado' : 'Copiar'}</button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl leading-none px-1">✕</button>
          </div>
        </div>

        <div className="px-5 py-2.5 border-b border-gray-800 shrink-0 space-y-1">
          {data.plan.map(it => (
            <div key={it.kind + ':' + it.name} className="flex items-center gap-2 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: it.weight > 0 ? kindColor(it.kind) : '#3f3f46' }} />
              <span className={`font-mono truncate w-52 shrink-0 ${it.weight > 0 ? 'text-gray-300' : 'text-gray-700 line-through'}`}>{it.name}</span>
              <span className="w-28 h-1.5 rounded-full bg-gray-800 overflow-hidden shrink-0">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, it.share)}%`, background: kindColor(it.kind) }} />
              </span>
              <span className="text-gray-400 tabular-nums w-12 shrink-0">{it.share.toFixed(1)}%</span>
              <span className="text-gray-600 tabular-nums shrink-0">peso {it.weight}</span>
              <span className="text-gray-700 tabular-nums truncate">
                {it.weight <= 0 ? 'fora do condensado' : `${it.chars.toLocaleString('pt-BR')} → ${it.budget.toLocaleString('pt-BR')} chars · ${it.condensed ? 'condensado' : 'íntegro'}`}
              </span>
            </div>
          ))}
        </div>

        <div className="px-5 pt-2 flex gap-1 shrink-0">
          {(['digest', 'prompt'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs px-3 py-1.5 rounded-t-lg border-b-2 ${tab === t ? 'border-cyan-500 text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {t === 'digest' ? 'Condensado' : 'Prompt de síntese'}
            </button>
          ))}
          <span className="ml-auto self-center text-[10px] text-gray-600">
            {tab === 'digest' ? 'Gerado aqui, pronto para uso' : 'Cole num LLM para uma síntese melhor'}
          </span>
        </div>

        <div className="px-5 pb-4 pt-1 overflow-hidden flex-1">
          <textarea readOnly value={text} className="w-full h-full min-h-[280px] bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 resize-none focus:outline-none leading-relaxed" />
        </div>
      </div>
    </div>
  )
}

// ── Modal de inserção (permite repetição) ─────────────────────────────────────
function InsertModal({ counts, onInsert, onClose }: {
  counts: Record<string, number>; onInsert: (kind: ResourceKind, name: string) => void; onClose: () => void
}) {
  const [res, setRes] = useState<ResourceList | null>(null)
  useEffect(() => { api.getResources().then(setRes) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#141414] border border-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[85%] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="text-sm font-semibold text-gray-200">Inserir recurso no mapa <span className="text-gray-600 font-normal">(pode repetir)</span></div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-4 overflow-auto space-y-5">
          {!res ? <EsqueletoPainel itens={4} /> : KIND_ORDER.map(kind => {
            const meta = KIND_META[kind]
            const items = res[kind]
            return (
              <div key={kind}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: meta.color }}>{meta.label}s</div>
                {items.length === 0 ? <div className="text-xs text-gray-700">nenhum</div> : (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map(it => {
                      const n = counts[`${kind}:${it.name}`] || 0
                      return (
                        <button key={it.name} onClick={() => onInsert(kind, it.name)}
                          className="text-left px-3 py-2 rounded-lg border text-sm transition-colors border-gray-700 bg-[#1a1a1a] text-gray-200 hover:border-gray-600 hover:bg-[#1f1f1f]">
                          <div className="truncate font-medium">{it.displayName}{n > 0 && <span className="text-[10px] text-gray-500 ml-1">×{n}</span>}</div>
                          <div className="text-[11px] font-mono text-gray-600 truncate">{it.name}{meta.ext}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Auto-layout de uma lane, seguindo os vínculos ─────────────────────────────
/**
 * Arruma os cards em colunas no sentido das setas (target à esquerda, source à
 * direita), como um grafo em camadas:
 *   1. quem não recebe seta nenhuma abre a primeira coluna;
 *   2. cada card cai uma coluna à frente do seu predecessor mais distante;
 *   3. dentro da coluna, ordena pelo baricentro dos vizinhos para cruzar menos setas;
 *   4. quem não tem vínculo nenhum vai para uma grade embaixo — ninguém fica escondido.
 * Ciclos não travam: o que sobrar da ordenação topológica entra depois do maior
 * predecessor já resolvido.
 */
function layoutByLinks(
  items: { id: string; w: number; h: number }[],
  links: { source: string; target: string }[],
  opt: { gapX: number; gapY: number; padX: number; padTop: number },
) {
  const ids = new Set(items.map(i => i.id))
  const outs = new Map<string, string[]>(), ins = new Map<string, string[]>()
  items.forEach(i => { outs.set(i.id, []); ins.set(i.id, []) })
  const seen = new Set<string>()
  for (const l of links) {
    if (!ids.has(l.source) || !ids.has(l.target) || l.source === l.target) continue
    const k = `${l.source}>${l.target}`
    if (seen.has(k)) continue
    seen.add(k)
    outs.get(l.source)!.push(l.target)
    ins.get(l.target)!.push(l.source)
  }

  const grau = (id: string) => outs.get(id)!.length + ins.get(id)!.length
  const ligados = items.filter(i => grau(i.id) > 0)
  const soltos  = items.filter(i => grau(i.id) === 0).sort((a, b) => a.id.localeCompare(b.id))

  // camadas: caminho mais longo via Kahn
  const nivel = new Map<string, number>()
  const entrada = new Map<string, number>()
  ligados.forEach(i => entrada.set(i.id, ins.get(i.id)!.length))
  const fila = ligados.filter(i => entrada.get(i.id) === 0).map(i => i.id)
  fila.forEach(id => nivel.set(id, 0))
  for (let h = 0; h < fila.length; h++) {
    const u = fila[h]
    for (const v of outs.get(u)!) {
      nivel.set(v, Math.max(nivel.get(v) ?? 0, (nivel.get(u) ?? 0) + 1))
      entrada.set(v, (entrada.get(v) ?? 1) - 1)
      if (entrada.get(v) === 0) fila.push(v)
    }
  }
  ligados.forEach(i => {                       // sobrou de ciclo
    if (nivel.has(i.id)) return
    const ps = ins.get(i.id)!.map(p => nivel.get(p)).filter((v): v is number => v !== undefined)
    nivel.set(i.id, ps.length ? Math.max(...ps) + 1 : 0)
  })

  const porNivel = new Map<number, string[]>()
  ligados.forEach(i => {
    const L = nivel.get(i.id)!
    if (!porNivel.has(L)) porNivel.set(L, [])
    porNivel.get(L)!.push(i.id)
  })
  porNivel.forEach(arr => arr.sort())          // base determinística
  const niveis = [...porNivel.keys()].sort((a, b) => a - b)

  // baricentro: 4 passadas alternando o sentido
  const idx = new Map<string, number>()
  const reindexar = () => porNivel.forEach(arr => arr.forEach((id, i) => idx.set(id, i)))
  reindexar()
  for (let passo = 0; passo < 4; passo++) {
    const paraFrente = passo % 2 === 0
    const ordem = paraFrente ? niveis.slice(1) : [...niveis].reverse().slice(1)
    for (const L of ordem) {
      const arr = porNivel.get(L)!
      const bar = (id: string) => {
        const viz = paraFrente ? ins.get(id)! : outs.get(id)!
        const ps = viz.map(v => idx.get(v)).filter((v): v is number => v !== undefined)
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : (idx.get(id) ?? 0)
      }
      arr.sort((a, b) => bar(a) - bar(b) || a.localeCompare(b))
      reindexar()
    }
  }

  const colW = Math.max(...items.map(i => i.w), 264) + opt.gapX
  const rowH = Math.max(...items.map(i => i.h), 176) + opt.gapY
  const altura = Math.max(0, ...niveis.map(L => porNivel.get(L)!.length))
  const pos = new Map<string, { x: number; y: number }>()

  niveis.forEach((L, coluna) => {
    const arr = porNivel.get(L)!
    const centro = (altura - arr.length) / 2    // centraliza a coluna na mais alta
    arr.forEach((id, linha) => pos.set(id, {
      x: opt.padX + coluna * colW,
      y: opt.padTop + (centro + linha) * rowH,
    }))
  })

  if (soltos.length) {
    const topo = opt.padTop + (altura ? altura * rowH + opt.gapY : 0)
    const colunas = Math.max(1, niveis.length || Math.ceil(Math.sqrt(soltos.length)))
    soltos.forEach((it, k) => pos.set(it.id, {
      x: opt.padX + (k % colunas) * colW,
      y: topo + Math.floor(k / colunas) * rowH,
    }))
  }

  let maxX = 0, maxY = 0
  for (const i of items) {
    const p = pos.get(i.id); if (!p) continue
    maxX = Math.max(maxX, p.x + i.w); maxY = Math.max(maxY, p.y + i.h)
  }
  return { pos, size: { width: maxX + opt.padX, height: maxY + opt.padX } }
}

// ── Botão da barra de ferramentas (setinha / mãozinha) ────────────────────────
function ToolButton({ active, label, hint, kbd, onClick, children }: {
  active: boolean; label: string; hint: string; kbd: string
  onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} (${hint})`}
      aria-label={label}
      aria-pressed={active}
      className={`relative w-9 h-9 grid place-items-center rounded-lg transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className={`absolute bottom-0.5 right-1 text-[9px] font-semibold leading-none ${
        active ? 'text-blue-200' : 'text-gray-600'
      }`}>{kbd}</span>
    </button>
  )
}

// ── Lista de atalhos do canvas ────────────────────────────────────────────────
const ATALHOS: [string, string][] = [
  ['V',            'ferramenta de seleção'],
  ['H',            'ferramenta de mão'],
  ['espaço',       'mão temporária — segure e arraste'],
  ['arrastar',     'no vazio, laça vários cards'],
  ['⇧ / ctrl',     'clique somando à seleção'],
  ['Del',          'remove os selecionados do mapa'],
  ['Esc',          'limpa a seleção'],
  ['botão do meio','arrasta o mapa em qualquer modo'],
]

function AtalhosPopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as HTMLElement)) onClose() }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [onClose])
  return (
    <div ref={ref} className="nodrag nopan absolute left-11 top-0 w-64 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl p-3 z-50">
      <div className="text-xs font-semibold text-gray-200 mb-2">Atalhos do mapa</div>
      <div className="space-y-1.5">
        {ATALHOS.map(([k, d]) => (
          <div key={k} className="flex items-baseline gap-2 text-[11px]">
            <kbd className="shrink-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-gray-200 font-mono text-[10px]">{k}</kbd>
            <span className="text-gray-400">{d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Canvas ────────────────────────────────────────────────────────────────────
function Canvas({ mapaInicial }: { mapaInicial?: string }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [autoEdges, setAutoEdges] = useState<{ id: string; source: string; target: string; rel?: string }[]>([])
  const [showAuto, setShowAuto] = useState(true)
  // O mapa em fantasma enquanto o arquivo do canvas é lido. Trocar de mapa
  // também passa por aqui: sem isso, o mapa antigo fica na tela até o novo
  // chegar, e por um instante você lê o mapa errado achando que é o certo.
  const [carregandoMapa, setCarregandoMapa] = useState(true)
  // Arranjo é onde você pôs cada coisa; grafo é o que está ligado a quê. Duas
  // leituras do mesmo material, e a escolha fica lembrada por projeto.
  const [vista, setVista] = useState<'arranjo' | 'grafo'>(
    () => (localStorage.getItem('noctis.mapa.vista') as 'arranjo' | 'grafo') || 'arranjo')
  useEffect(() => { try { localStorage.setItem('noctis.mapa.vista', vista) } catch { /* */ } }, [vista])
  const [novaMem, setNovaMem] = useState(false)
  // Vidro e céu vêm da tela de aparência, junto de cor, ícone e tamanho.
  const vidro = VIDRO.ativo
  const ceuLigado = CEU.ativo
  const [flowModal, setFlowModal] = useState<string | null>(null)
  const [insertOpen, setInsertOpen] = useState(false)
  const [promptModal, setPromptModal] = useState<{ title: string; text: string } | null>(null)
  const [digestModal, setDigestModal] = useState<LaneDigest | null>(null)
  const [decisaoDe, setDecisaoDe] = useState<{ kind: ResourceKind; name: string; decision?: Decision } | null>(null)
  const loadedRef = useRef(false)

  // Qual mapa está aberto. Guardado por projeto: trocar de projeto não pode
  // herdar o mapa do anterior, que nem existe lá.
  const chaveMapa = `agentStudio.canvas.${localStorage.getItem('agentStudio.currentProject') || 'noctis'}`
  const [mapas, setMapas] = useState<CanvasMeta[]>([])
  // A aba diz qual mapa abrir; sem aba (a página "Mapa de Memória"), vale o
  // último mapa usado neste projeto. Passar por parâmetro, e não só pelo
  // localStorage, é o que deixa duas abas de mapa abertas ao mesmo tempo.
  const [mapaId, setMapaId] = useState<string>(() =>
    mapaInicial || localStorage.getItem(chaveMapa) || 'principal')

  /** De qual mapa são os nós que estão em memória agora. Sem isso, trocar de
   *  mapa dispara o autosave com os nós do mapa ANTERIOR e o id do NOVO — foi
   *  o que sobrescreveu um mapa inteiro com o conteúdo de outro. */
  const mapaDosNodesRef = useRef('')

  const trocarMapa = useCallback((id: string) => {
    if (id === mapaId) return
    loadedRef.current = false          // trava o autosave já, não depois do fetch
    localStorage.setItem(chaveMapa, id)
    setMapaId(id)
  }, [chaveMapa, mapaId])

  const recarregarMapas = useCallback(async () => {
    try {
      const lst = await api.listCanvases()
      setMapas(lst)
      // o mapa guardado pode ter sido apagado noutra aba
      if (lst.length && !lst.some(m => m.id === mapaId)) trocarMapa(lst[0].id)
    } catch { /* projeto sem mapas ainda */ }
  }, [mapaId, trocarMapa])

  // ── Ferramenta ativa: seleção (setinha) ou mão (arrastar o mapa) ────────────
  // Espaço segurado dá a mão temporariamente, como no Figma.
  const { fitView, getNode, zoomIn, zoomOut } = useReactFlow()
  const [tool, setTool] = useState<'select' | 'pan'>('select')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [atalhos, setAtalhos] = useState(false)
  const panning = tool === 'pan' || spaceHeld

  const toRF = (c: MemoryCanvas) => {
    const laneNodes: Node[] = (c.lanes || []).map(l => ({
      id: l.id, type: 'lane', position: { x: l.x, y: l.y }, width: l.width, height: l.height,
      data: { name: l.name, color: l.color, budget: l.budget ?? 12000, tags: l.tags || [] },
    }))
    const resNodes: Node[] = c.nodes.map(n => {
      const kind = (n.kind || 'memory') as ResourceKind
      return {
        id: n.id || `${kind}:${n.name}`, type: 'resource',
        parentId: n.parent || undefined,   // sem extent: o card pode sair da lane arrastando
        position: { x: n.x, y: n.y }, width: n.width || 264, height: n.height || 176,
        data: {
          kind, label: n.name, color: n.color, icon: n.icon, active: n.active, tags: n.tags || [],
          title: n.title || '', excerpt: n.excerpt || '', badge: n.badge || '',
          lines: n.lines || 0, usedBy: n.usedBy || [], origin: n.origin || 'inserido',
          mtype: n.type,
          decision: n.decision,
          attachments: n.attachments || 0, images: n.images || 0, thumbs: n.thumbs || [],
          weight: n.weight ?? 1, share: -1,
        },
      }
    })
    setNodes([...laneNodes, ...resNodes])
    setEdges(c.edges.map(e => ({ id: e.id || `${e.source}->${e.target}`,
      source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined,
      type: 'gradiente', markerEnd: { type: MarkerType.ArrowClosed } })))
    setAutoEdges((c.autoEdges || []).map(e => ({ id: e.id, source: e.source, target: e.target, rel: e.rel })))
  }

  const reload = useCallback(async () => {
    setCarregandoMapa(true)
    loadedRef.current = false
    lastSavedRef.current = ''          // mapa novo: o payload anterior não vale
    const alvo = mapaId
    toRF(await api.getMemoryCanvas(alvo))
    mapaDosNodesRef.current = alvo
    setCarregandoMapa(false)
    setTimeout(() => { loadedRef.current = true }, 50)
  }, [mapaId])
  useEffect(() => { reload() }, [reload])
  useEffect(() => { recarregarMapas() }, [recarregarMapas])

  const buildPayload = (ns: Node[], es: Edge[]): MemoryCanvas => ({
    lanes: ns.filter(n => n.type === 'lane').map(n => {
      const d = n.data as LaneData
      return { id: n.id, name: d.name, color: d.color, budget: d.budget ?? 12000, tags: d.tags || [], x: Math.round(n.position.x), y: Math.round(n.position.y), width: Math.round(n.width || 460), height: Math.round(n.height || 320) }
    }),
    nodes: ns.filter(n => n.type === 'resource').map(n => {
      const d = n.data as MemData
      return {
        id: n.id, kind: d.kind, name: d.label, parent: n.parentId || null,
        x: Math.round(n.position.x), y: Math.round(n.position.y),
        width: Math.round(n.width || 264), height: Math.round(n.height || 176),
        color: d.color, icon: d.icon, active: d.active, tags: d.tags, weight: d.weight ?? 1,
      }
    }),
    edges: es.map(e => ({ id: e.id, source: e.source, target: e.target,
                          sourceHandle: e.sourceHandle || undefined })),
  })

  // Só grava se o payload mudou de verdade: selecionar um card altera `nodes`
  // mas não muda nada do que é persistido.
  const lastSavedRef = useRef<string>('')
  useEffect(() => {
    if (!loadedRef.current) return
    // Cinto de segurança: nunca gravar num mapa os nós de outro.
    if (mapaDosNodesRef.current !== mapaId) return
    const t = setTimeout(() => {
      if (mapaDosNodesRef.current !== mapaId) return
      const payload = buildPayload(nodes, edges)
      const json = JSON.stringify(payload)
      if (json === lastSavedRef.current) return
      lastSavedRef.current = json
      api.saveMemoryCanvas(payload, mapaId)
    }, 600)
    return () => clearTimeout(t)
  }, [nodes, edges, mapaId])

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes(ns => applyNodeChanges(c, ns)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges(es => applyEdgeChanges(c, es)), [])
  const onConnect = useCallback((c: Connection) => {
    // A saída livre não pode ficar amarrada à aresta: ela precisa continuar
    // livre para a próxima. A aresta leva um handle próprio, criado agora.
    const id = `${c.source}->${c.target}-${Date.now().toString(36)}`
    const handle = c.sourceHandle?.startsWith('livre-') ? `out-${id}` : (c.sourceHandle || `out-${id}`)
    setEdges(es => addEdge({ ...c, id, sourceHandle: handle }, es))
  }, [])

  // Cada ligação nova acrescenta um ponto de saída ao card, e o ReactFlow só
  // sabe onde os handles ficam depois de medi-los. Sem este aviso, a aresta
  // recém-criada aponta para um handle que ele ainda não mediu e não é
  // desenhada — o que só aparecia da segunda ligação em diante.
  const updateNodeInternals = useUpdateNodeInternals()
  const assinaturaSaidas = useRef(new Map<string, string>())
  useEffect(() => {
    const agora = new Map<string, string[]>()
    for (const e of edges) {
      if (!e.source) continue
      const arr = agora.get(e.source) || []
      arr.push(e.sourceHandle || `out-${e.id}`)
      agora.set(e.source, arr)
    }
    const mudou: string[] = []
    for (const [id, arr] of agora) {
      const chave = arr.join('|')
      if (assinaturaSaidas.current.get(id) !== chave) { mudou.push(id); assinaturaSaidas.current.set(id, chave) }
    }
    for (const id of assinaturaSaidas.current.keys()) {
      if (!agora.has(id)) { mudou.push(id); assinaturaSaidas.current.delete(id) }
    }
    // Card dentro de lane tem posição relativa ao pai: remedir só o filho deixa
    // o handle no lugar errado, então a lane vai junto.
    if (mudou.length) {
      const comPais = new Set(mudou)
      for (const id of mudou) {
        const pai = getNode(id)?.parentId
        if (pai) comPais.add(pai)
      }
      requestAnimationFrame(() => comPais.forEach(id => updateNodeInternals(id)))
    }
  }, [edges, updateNodeInternals, getNode])

  // Atribui/solta o card de uma lane ao terminar de arrastar.
  const onNodeDragStop = useCallback((_: unknown, dragged: Node) => {
    if (dragged.type === 'lane') return
    setNodes(ns => {
      const cur = ns.find(n => n.id === dragged.id)
      if (!cur) return ns
      const parentLane = cur.parentId ? ns.find(n => n.id === cur.parentId) : null
      const abs = parentLane
        ? { x: parentLane.position.x + cur.position.x, y: parentLane.position.y + cur.position.y }
        : { x: cur.position.x, y: cur.position.y }
      const w = (cur.width as number) || 264, h = (cur.height as number) || 176
      const cx = abs.x + w / 2, cy = abs.y + h / 2
      const lane = ns.filter(n => n.type === 'lane').find(L => {
        const lw = (L.width as number) || 460, lh = (L.height as number) || 320
        return cx >= L.position.x && cx <= L.position.x + lw && cy >= L.position.y && cy <= L.position.y + lh
      })
      const newParent = lane?.id
      if ((newParent || undefined) === (cur.parentId || undefined)) return ns
      return ns.map(n => {
        if (n.id !== dragged.id) return n
        return lane
          ? { ...n, parentId: lane.id, position: { x: abs.x - lane.position.x, y: abs.y - lane.position.y } }
          : { ...n, parentId: undefined, extent: undefined, position: abs }
      })
    })
  }, [])

  // ── Seleção em massa ───────────────────────────────────────────────────────
  // Só cards entram na ação em massa. Laçar dentro de uma lane pega a lane pela
  // geometria, e remover em massa levaria a lane junto — que não é o que se quer.
  // Lane sai do mapa pelo menu dela.
  const selected = nodes.filter(n => n.selected && n.type === 'resource')
  const selCount = selected.length
  const selBreak = (() => {
    const byKind: Partial<Record<ResourceKind, number>> = {}
    selected.forEach(n => { const k = (n.data as MemData).kind; byKind[k] = (byKind[k] || 0) + 1 })
    return KIND_ORDER.filter(k => byKind[k]).map(k => `${byKind[k]} ${KIND_META[k].label.toLowerCase()}`).join(' · ')
  })()

  const clearSelection = useCallback(() =>
    setNodes(ns => ns.some(n => n.selected) ? ns.map(n => n.selected ? { ...n, selected: false } : n) : ns), [])

  /** Tira os selecionados do mapa. NÃO apaga arquivo — só o card e as setas dele.
   *  Lane removida devolve os cards de dentro para o canvas, em posição absoluta. */
  const removeSelectedFromMap = useCallback(() => {
    setNodes(ns => {
      const sel = new Set(ns.filter(n => n.selected && n.type === 'resource').map(n => n.id))
      if (!sel.size) return ns
      setEdges(es => es.filter(e => !sel.has(e.source) && !sel.has(e.target)))
      return ns.filter(n => !sel.has(n.id)).map(n => {
        if (n.parentId && sel.has(n.parentId)) {
          const lane = ns.find(l => l.id === n.parentId)
          return {
            ...n, parentId: undefined, extent: undefined, selected: false,
            position: lane
              ? { x: lane.position.x + n.position.x, y: lane.position.y + n.position.y }
              : n.position,
          }
        }
        return n.selected ? { ...n, selected: false } : n
      })
    })
  }, [])

  const selectAllOfKind = useCallback((kind: ResourceKind) =>
    setNodes(ns => ns.map(n =>
      n.type === 'resource' && (n.data as MemData).kind === kind
        ? { ...n, selected: true } : n)), [])

  // Atalhos: V seleção · H mão · Espaço mão temporária · Del remove do mapa · Esc limpa
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setSpaceHeld(true); return }
      if (e.key === 'v' || e.key === 'V') setTool('select')
      else if (e.key === 'h' || e.key === 'H') setTool('pan')
      else if (e.key === 'Escape') clearSelection()
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelectedFromMap() }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false) }
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [clearSelection, removeSelectedFromMap])

  const patchData = (id: string, patch: Partial<MemData>) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const toggleMenu = useCallback((id: string) => setOpenMenuId(c => (c === id ? null : id)), [])
  const closeMenu  = useCallback(() => setOpenMenuId(null), [])
  const nodeOf = (id: string) => nodes.find(n => n.id === id)

  // Tipo sem rota própria cai na genérica. Antes isto era um Record fechado nos
  // quatro kinds — e um tipo novo quebrava a compilação aqui, que é o melhor
  // jeito de descobrir, mas exigia uma entrada a mais a cada vez.
  const RENAME: Record<ResourceKind, (n: string, nv: string) => Promise<unknown>> = {
    memory: api.renameMemory, agent: api.renameAgent, flow: api.renameFlow, persona: api.renamePersona,
    task: (n, nv) => api.renomearRecurso('task', n, nv),
    artifact: (n, nv) => api.renomearRecurso('artifact', n, nv),
    midia: (n, nv) => api.renomearRecurso('midia', n, nv),
  }
  const DELETE: Record<ResourceKind, (n: string) => Promise<unknown>> = {
    memory: api.deleteMemory, agent: api.deleteAgent, flow: api.deleteFlow, persona: api.deletePersona,
    task: n => api.apagarRecurso('task', n),
    artifact: n => api.apagarRecurso('artifact', n),
    midia: n => api.apagarRecurso('midia', n),
  }

  const actions: NodeActions = {
    openMenuId, toggleMenu, closeMenu,
    toggleActive: id => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, active: !(n.data as MemData).active } } : n)),
    editDecision: id => {
      const n = nodes.find(x => x.id === id)
      if (!n) return
      const d = n.data as MemData
      setDecisaoDe({ kind: d.kind, name: d.label, decision: d.decision })
    },
    toggleChoice: async (id, optionId) => {
      const n = nodes.find(x => x.id === id)
      if (!n) return
      const d = n.data as MemData
      // quem resolve o efeito é o servidor: em radio, marcar uma desmarca as outras
      try {
        const r = await api.toggleChoice(d.kind, d.label, optionId, AUTOR_LOCAL)
        setNodes(ns => ns.map(x => x.id === id ? { ...x, data: { ...x.data, decision: r.decision } } : x))
      } catch (e) { alert('Erro ao marcar:\n' + (e as Error).message) }
    },
    open: id => {
      const n = nodeOf(id); if (!n) return
      const d = n.data as MemData
      if (d.kind === 'flow') setFlowModal(d.label); else abrirRecursoNaDoca(d.kind, d.label, reload)
    },
    mapaAtual: () => mapaId,
    setColor: (id, color) => patchData(id, { color }),
    setIcon:  (id, icon)  => patchData(id, { icon }),
    // O tipo é identidade: vai direto ao resources.json, não ao arranjo do mapa.
    setTipo: (id, tipo) => {
      patchData(id, { mtype: tipo })
      setNodes(ns => {
        const d = ns.find(x => x.id === id)?.data as MemData | undefined
        if (d) api.saveIdentity('memory', d.label, { type: tipo }).catch(e => alert('Erro: ' + e.message))
        return ns
      })
    },
    addTag: (id, tag) => setNodes(ns => ns.map(n => {
      if (n.id !== id) return n
      const cur = (n.data as MemData).tags; const t = tag.trim()
      if (!t || cur.includes(t) || cur.length >= 12) return n
      return { ...n, data: { ...n.data, tags: [...cur, t] } }
    })),
    removeTag: (id, tag) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, tags: (n.data as MemData).tags.filter(t => t !== tag) } } : n)),
    setWeight: (id, weight) => patchData(id, { weight: Math.max(0, Math.min(10, Math.round(weight * 2) / 2)) }),
    removeFromMap: id => {
      setNodes(ns => ns.filter(n => n.id !== id))
      setEdges(es => es.filter(e => e.source !== id && e.target !== id))
    },
    rename: async id => {
      const n = nodeOf(id); if (!n) return
      const { kind, label } = n.data as MemData
      const nv = window.prompt(`Novo nome (${KIND_META[kind].label}):`, label)?.trim()
      if (!nv || nv === label) return
      const slug = nv
      try {
        await RENAME[kind](label, slug)
        recursoRenomeado(kind, label, slug)
        if (flowModal === label && kind === 'flow') setFlowModal(slug)
        await reload()
      } catch (e) { alert('Erro ao renomear:\n' + (e as Error).message) }
    },
    remove: async id => {
      const n = nodeOf(id); if (!n) return
      const { kind, label } = n.data as MemData
      if (!window.confirm(`Excluir ${KIND_META[kind].label} "${label}${KIND_META[kind].ext}"? Apaga o arquivo (todas as instâncias somem).`)) return
      try {
        await DELETE[kind](label)
        recursoRenomeado(kind, label, null)
        if (flowModal === label && kind === 'flow') setFlowModal(null)
        await reload()
      } catch (e) { alert('Erro ao excluir:\n' + (e as Error).message) }
    },
    renameLane:   (id, name) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, name } } : n)),
    setLaneColor: (id, color) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, color } } : n)),
    autoLayoutLane: id => {
      setNodes(ns => {
        const lane = ns.find(n => n.id === id)
        if (!lane) return ns
        const dentro = ns.filter(n => n.parentId === id && n.type === 'resource')
        if (!dentro.length) { alert('Lane vazia. Arraste cards para dentro dela primeiro.'); return ns }
        const items = dentro.map(n => ({ id: n.id, w: (n.width as number) || 264, h: (n.height as number) || 176 }))
        // vínculos = setas manuais + as derivadas (agente→memórias, fluxo→agentes)
        const links = [...edges, ...autoEdges].map(e => ({ source: e.source, target: e.target }))
        const { pos, size } = layoutByLinks(items, links, { gapX: 72, gapY: 36, padX: 24, padTop: 56 })
        return ns.map(n => {
          if (n.id === id) {
            return { ...n, width: Math.max(size.width, 300), height: Math.max(size.height, 200) }
          }
          const p = pos.get(n.id)
          return p ? { ...n, position: p } : n
        })
      })
      // mostra o resultado: sem isso a lane cresce fora da vista
      setTimeout(() => fitView({ nodes: [{ id }], padding: 0.15, duration: 400 }), 60)
    },
    deleteLane: id => {
      if (!window.confirm('Excluir esta lane? Os cards dentro dela voltam para o canvas.')) return
      setNodes(ns => {
        const lane = ns.find(n => n.id === id); if (!lane) return ns
        return ns.filter(n => n.id !== id).map(n => n.parentId === id
          ? { ...n, parentId: undefined, extent: undefined, position: { x: lane.position.x + n.position.x, y: lane.position.y + n.position.y } }
          : n)
      })
      setEdges(es => es.filter(e => e.source !== id && e.target !== id))
    },
    extractLanePrompt: async id => {
      const lane = nodeOf(id); if (!lane) return
      const items = nodes.filter(n => n.parentId === id && n.type === 'resource')
        .map(n => ({ kind: (n.data as MemData).kind, name: (n.data as MemData).label }))
      if (items.length === 0) { alert('Lane vazia. Arraste cards para dentro dela primeiro.'); return }
      try {
        const r = await api.laneExtractPrompt((lane.data as LaneData).name, items)
        setPromptModal({ title: (lane.data as LaneData).name, text: r.prompt })
      } catch (e) { alert('Erro ao extrair prompt:\n' + (e as Error).message) }
    },
    condenseLane: async id => {
      const lane = nodeOf(id); if (!lane) return
      const d = lane.data as LaneData
      const items = nodes.filter(n => n.parentId === id && n.type === 'resource')
        .map(n => { const m = n.data as MemData; return { kind: m.kind, name: m.label, weight: m.weight ?? 1 } })
      if (items.length === 0) { alert('Lane vazia. Arraste cards para dentro dela primeiro.'); return }
      try { setDigestModal(await api.laneDigest(d.name, d.budget ?? 12000, items)) }
      catch (e) { alert('Erro ao condensar:\n' + (e as Error).message) }
    },
    setLaneBudget: id => {
      const lane = nodeOf(id); if (!lane) return
      const cur = (lane.data as LaneData).budget ?? 12000
      const v = window.prompt('Or\u00e7amento do condensado desta lane, em caracteres (1000 a 200000):', String(cur))
      if (!v) return
      const num = Number(v.replace(/\D/g, ''))
      if (!Number.isFinite(num) || num <= 0) return
      const b = Math.max(1000, Math.min(200000, Math.round(num)))
      setNodes(ns => ns.map(x => x.id === id ? { ...x, data: { ...x.data, budget: b } } : x))
    },
  }

  const addLane = () => {
    const name = window.prompt('Nome da lane (macro-fluxo):', 'Novo macro-fluxo')?.trim()
    if (!name) return
    const node: Node = { id: uid('lane'), type: 'lane', position: { x: 60, y: 60 }, width: 500, height: 360, data: { name, color: '#64748b', budget: 12000, tags: [] } }
    setNodes(ns => [node, ...ns])
  }

  const addMemory = async () => {
    // O nome vai como a pessoa escreveu. Quem recusa caractere impossível é o
    // backend, em nome_de_recurso() — aqui não se mutila mais nada.
    const nv = window.prompt('Nome da nova memória:')?.trim()
    if (!nv) return
    const slug = nv
    try { await api.saveMemory(slug, `# ${slug}\n\nDescreva o contexto aqui...\n`); await reload(); abrirRecursoNaDoca('memory', slug, reload) }
    catch (e) { alert('Erro ao criar:\n' + (e as Error).message) }
  }

  const insertResource = async (kind: ResourceKind, name: string) => {
    const meta = KIND_META[kind]
    const k = nodes.length
    const node: Node = {
      id: uid(`${kind}:${name}`), type: 'resource',
      position: { x: 140 + (k % 6) * 50, y: 130 + (k % 6) * 44 }, width: 264, height: 176,
      data: { kind, label: name, color: meta.color, icon: meta.icon, active: true, tags: [], title: name, excerpt: '', badge: '', lines: 0, usedBy: [], attachments: 0, images: 0, thumbs: [], weight: 1, share: -1 },
    }
    const next = [...nodes, node]
    setNodes(next); setInsertOpen(false)
    // O recurso entra no mapa que está aberto. Sem passar o id, isto gravava
    // sempre no mapa padrão e o card ia parar no lugar errado.
    try { await api.saveMemoryCanvas(buildPayload(next, edges), mapaId); await reload() }
    catch (e) { alert('Erro ao inserir:\n' + (e as Error).message) }
  }

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.data?.auto) return
    if (window.confirm('Remover esta conexão?')) setEdges(es => es.filter(e => e.id !== edge.id))
  }, [])

  const counts = nodes.reduce((acc, n) => {
    if (n.type !== 'resource') return acc
    const d = n.data as MemData
    acc[d.kind] = (acc[d.kind] || 0) + 1
    acc[`${d.kind}:${d.label}`] = (acc[`${d.kind}:${d.label}`] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const laneCount = nodes.filter(n => n.type === 'lane').length
  const existingIds = new Set(nodes.map(n => n.id))

  // Fatia de cada card no condensado da sua lane. Recalculada a cada mudança de peso.
  const laneWeight = new Map<string, number>()
  for (const n of nodes) {
    if (n.type !== 'resource' || !n.parentId) continue
    const w = Math.max(0, (n.data as MemData).weight ?? 1)
    laneWeight.set(n.parentId, (laneWeight.get(n.parentId) || 0) + w)
  }
  // Uma saída por aresta que parte do card, mais uma livre no fim. Derivado das
  // arestas: não há estado paralelo para sair de sincronia.
  const saidasPorNo = new Map<string, string[]>()
  for (const e of edges) {
    if (!e.source) continue
    const arr = saidasPorNo.get(e.source) || []
    arr.push(e.sourceHandle || `out-${e.id}`)
    saidasPorNo.set(e.source, arr)
  }

  const corPorNo = new Map(nodes.map(n => [n.id, (n.data as { color?: string }).color || '#52525b']))
  const auras = auraPorNo(edges as { source: string; target: string }[], id => corPorNo.get(id))

  const withShare = nodes.map(n => {
    if (n.type === 'lane') {
      const d = n.data as LaneData
      const a = auras.get(n.id) || { entrada: [], saida: [] }
      const igual = (d.aura?.entrada.join('|') || '') === a.entrada.join('|')
        && (d.aura?.saida.join('|') || '') === a.saida.join('|')
      return igual ? n : { ...n, data: { ...d, aura: a } }
    }
    if (n.type !== 'resource') return n
    const d = n.data as MemData
    const total = n.parentId ? (laneWeight.get(n.parentId) || 0) : 0
    const share = n.parentId && total > 0 ? (Math.max(0, d.weight ?? 1) / total) * 100 : -1
    const saidas = [...(saidasPorNo.get(n.id) || []), `livre-${n.id}`]
    const aura = auras.get(n.id) || { entrada: [], saida: [] }
    const chaveAura = aura.entrada.join('|') + '>' + aura.saida.join('|')
    const auraAtual = (d.aura?.entrada.join('|') || '') + '>' + (d.aura?.saida.join('|') || '')
    const igual = share === d.share && chaveAura === auraAtual && d.saidas?.length === saidas.length
      && saidas.every((h, i) => d.saidas[i] === h)
    return igual ? n : { ...n, data: { ...d, share, saidas, aura } }
  })

  // Lanes primeiro (parent antes do filho), depois recursos. Eleva o nó com menu aberto.
  const ordered = [...withShare].sort((a, b) => (a.type === 'lane' ? 0 : 1) - (b.type === 'lane' ? 0 : 1))
  const displayNodes = openMenuId ? ordered.map(n => (n.id === openMenuId ? { ...n, zIndex: 1000 } : n)) : ordered

  const manualPairs = new Set(edges.map(e => `${e.source}->${e.target}`))
  const autoVisible: Edge[] = showAuto
    ? autoEdges.filter(ae => existingIds.has(ae.source) && existingIds.has(ae.target) && !manualPairs.has(`${ae.source}->${ae.target}`))
        .map(ae => ({
          id: ae.id, source: ae.source, target: ae.target, type: 'smoothstep',
          selectable: false, deletable: false, focusable: false, data: { auto: true },
          style: { stroke: '#3f3f46', strokeWidth: 1.5, strokeDasharray: '5 5', opacity: 0.8 },
          markerEnd: { type: MarkerType.Arrow, color: '#3f3f46' },
        }))
    : []
  const autoCount = autoEdges.filter(ae => existingIds.has(ae.source) && existingIds.has(ae.target)).length
  const displayEdges = [...autoVisible, ...edges]

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="h-full flex flex-col relative">
        <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <span>{laneCount} lane{laneCount !== 1 ? 's' : ''}</span>
              {KIND_ORDER.map(k => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="text-gray-700">·</span>
                  <button
                    onClick={() => selectAllOfKind(k)}
                    disabled={!counts[k]}
                    title={counts[k] ? `Selecionar ${KIND_META[k].label.toLowerCase()}s do mapa` : undefined}
                    className="hover:text-gray-300 hover:underline underline-offset-2 disabled:hover:text-gray-600 disabled:hover:no-underline disabled:cursor-default"
                  >
                    {counts[k] || 0} {KIND_META[k].label.toLowerCase()}
                  </button>
                </span>
              ))}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CanvasPicker atual={mapaId} mapas={mapas} onTrocar={trocarMapa} onMudou={recarregarMapas} />
            <div className="flex items-center rounded-lg border border-white/[0.08] overflow-hidden">
              {([['arranjo', 'arranjo'], ['grafo', 'grafo']] as const).map(([id, rot]) => (
                <button key={id} onClick={() => setVista(id)}
                  title={id === 'arranjo' ? 'O mapa como você arrumou'
                    : 'O mesmo material como grafo: o que está ligado a quê'}
                  className={`text-[11px] px-2.5 py-1 ${vista === id
                    ? 'bg-white/[0.09] text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
                  {rot}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none" title="Conexões derivadas (por lane): agente→memórias, fluxo→agentes">
              <input type="checkbox" checked={showAuto} onChange={e => setShowAuto(e.target.checked)} className="accent-blue-600" />
              <span className="inline-block w-4 border-t border-dashed border-gray-500" /> auto ({autoCount})
            </label>
          </div>
        </div>

        {vista === 'grafo' ? (
          <div className="flex-1 relative">
            <GrafoMapa
              titulo={mapas.find(m => m.id === mapaId)?.name}
              nos={nodes.filter(n => n.type === 'resource').map(n => {
                const d = n.data as MemData
                const lane = nodes.find(l => l.id === n.parentId)
                return {
                  id: n.id, label: d.title || d.label, kind: d.kind, tipo: d.mtype,
                  cor: d.color, tags: d.tags,
                  lane: lane ? String((lane.data as { name?: string }).name || '') : '',
                } as NoGrafo
              })}
              ligacoes={[
                ...edges.map(e => ({ source: e.source, target: e.target })),
                ...(showAuto ? autoEdges.map(e => ({ source: e.source, target: e.target, auto: true })) : []),
              ] as LigacaoGrafo[]}
              onAbrir={id => {
                const n = nodes.find(x => x.id === id)
                const d = n?.data as MemData | undefined
                if (d) abrirRecursoNaDoca(d.kind, d.label, reload)
              }} />
          </div>
        ) : (
        <div className={`flex-1 relative ${panning ? 'tool-pan' : 'tool-select'} ${vidro ? 'vidro' : ''}`}>
          {/* céu por baixo de tudo; as nebulosas pegam as cores dos tipos de card.
              Desligado, o componente sai da árvore: nenhum ouvinte, nenhum quadro. */}
          {/* O céu mora atrás da casca inteira agora — aqui ele só recebe o pan. */}
          <style>{`
            .tool-pan .react-flow__pane { cursor: grab }
            .tool-pan .react-flow__pane.dragging { cursor: grabbing }
            .tool-select .react-flow__pane { cursor: default }
            /* O corpo da lane não intercepta o mouse no modo seleção: sem isso,
               arrastar dentro dela move a lane e o laço nunca pega os cards.
               Cabeçalho, menu, handles e alças de resize seguem clicáveis. */
            /* !important porque o ReactFlow escreve pointer-events inline no nó,
               e style inline vence qualquer seletor. */
            .tool-select .react-flow__node-lane { pointer-events: none !important }
            .tool-select .react-flow__node-lane .lane-header,
            .tool-select .react-flow__node-lane .lane-menu,
            .tool-select .react-flow__node-lane .react-flow__handle,
            .tool-select .react-flow__node-lane .react-flow__resize-control { pointer-events: all !important }
            .react-flow__selection { background: rgba(59,130,246,.12); border: 1px solid #3b82f6 }
            .react-flow__node.selected > div { outline: 2px solid #3b82f6; outline-offset: 2px; border-radius: 12px }
          `}</style>
          {carregandoMapa && (
            <div className="absolute inset-0 z-20 bg-[#0c0c0c]/70 backdrop-blur-[1px]">
              <CarregandoNoctis />
            </div>
          )}
          <ReactFlow
            onMove={(_, vp) => moverPanorama(vp.x, vp.y)}
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onEdgeClick={onEdgeClick}
            // Clicou num card: o detalhe dele vai para a doca. Com Shift/Ctrl é
            // seleção múltipla, e aí a doca não troca.
            onNodeClick={(e, n) => {
              if (n.type !== 'resource' || e.shiftKey || e.ctrlKey || e.metaKey) return
              if ((e.target as HTMLElement).closest('button,a,input,textarea,select,label')) return
              const d = n.data as MemData
              abrirRecursoNaDoca(d.kind, d.label, reload)
            }}
            onPaneClick={closeMenu}
            deleteKeyCode={null}
            fitView
            minZoom={0.2}
            maxZoom={2}
            /* mão: arrasta o mapa com o botão esquerdo.
               seleção: o esquerdo faz laço; o meio e o direito ainda arrastam. */
            panOnDrag={panning ? true : [1, 2]}
            selectionOnDrag={!panning}
            nodesDraggable={!panning}
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={panning ? 'Shift' : null}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'gradiente', markerEnd: { type: MarkerType.ArrowClosed } }}
            proOptions={{ hideAttribution: true }}
          >
            {/* O mesmo pontilhado da organização, ajustável em Aparência. */}
            {PONTILHADO.ativo && (
              <Background variant={BackgroundVariant.Dots} gap={PONTILHADO.espaco}
                size={PONTILHADO.tamanho} color={PONTILHADO.cor}
                style={{ opacity: PONTILHADO.opacidade / 100 }} />
            )}
            {/* Zoom numa faixa vertical à direita, como no canvas do Obsidian. */}
            <Panel position="top-right" className="!m-3">
              <div className="flex flex-col gap-0.5 rounded-xl p-1 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40">
                {([
                  ['Aproximar', () => zoomIn({ duration: 200 }), 'M12 5v14M5 12h14'],
                  ['Afastar', () => zoomOut({ duration: 200 }), 'M5 12h14'],
                  ['Enquadrar tudo', () => fitView({ duration: 300, padding: 0.15 }), 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4'],
                ] as const).map(([rot, fn, d]) => (
                  <button key={rot} onClick={fn} title={rot}
                    className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.07]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
                  </button>
                ))}
              </div>
            </Panel>
            <MiniMap pannable zoomable nodeColor={n => (n.data as MemData).color || (n.data as LaneData).color || '#555'} className="!bg-[#18181c]/80 !rounded-xl !border !border-white/[0.08] overflow-hidden" maskColor="rgba(0,0,0,0.55)" />

            {/* Ferramentas: setinha e mãozinha */}
            <Panel position="top-left" className="!m-3">
              <div className="relative flex flex-col gap-1 rounded-xl p-1 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40">
                <ToolButton
                  active={!panning} label="Selecionar" hint="V — arraste para laçar vários" kbd="V"
                  onClick={() => setTool('select')}
                >
                  <path d="M5 3l13 8-6 1.5L9.5 19 5 3z" />
                </ToolButton>
                <ToolButton
                  active={panning} label="Mover o mapa" hint="H — ou segure espaço" kbd="H"
                  onClick={() => setTool('pan')}
                >
                  <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4.5c0 3-2.2 5.5-5.5 5.5h-1c-2 0-3-.6-4.2-1.9l-3-3.4a1.5 1.5 0 012.2-2l1.5 1.6V7a1.5 1.5 0 013 0v4.5" />
                </ToolButton>
                <div className="h-px bg-gray-700 mx-1.5" />
                <button
                  onClick={() => setAtalhos(a => !a)}
                  title="Atalhos do mapa"
                  aria-label="Atalhos do mapa"
                  className={`w-9 h-7 grid place-items-center rounded-lg text-xs transition-colors ${
                    atalhos ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                  }`}
                >?</button>
                {atalhos && <AtalhosPopover onClose={() => setAtalhos(false)} />}
              </div>
            </Panel>

            {/* dica passageira enquanto o espaço está segurado */}
            {spaceHeld && (
              <Panel position="top-center" className="!mt-3 pointer-events-none">
                <div className="bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg">
                  mão temporária — solte o espaço para voltar à seleção
                </div>
              </Panel>
            )}

            {/* Paleta de criação: o que dá para pôr no mapa, sempre à mão. */}
            {selCount === 0 && (
              <Panel position="bottom-center" className="!mb-5">
                <div className="flex items-center gap-1 rounded-xl p-1 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40">
                  <button onClick={addLane} title="Nova lane"
                    className="flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] text-gray-300 hover:text-white hover:bg-white/[0.07]">
                    <MenuIcon.novaLane size={16} aria-hidden="true" /> Lane
                  </button>
                  <button onClick={() => setNovaMem(true)} title="Nova memória"
                    className="flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] text-gray-300 hover:text-white hover:bg-white/[0.07]"
                    style={{ color: KIND_META.memory.color }}>
                    <MenuIcon.novo size={16} aria-hidden="true" /> <span className="text-gray-300">Memória</span>
                  </button>
                  <div className="w-px h-5 bg-white/[0.08] mx-0.5" />
                  <button onClick={() => setInsertOpen(true)} title="Pôr no mapa um recurso que já existe"
                    className="flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] text-white bg-violet-600/80 hover:bg-violet-500">
                    <MenuIcon.inserir size={16} aria-hidden="true" /> Inserir recurso
                  </button>
                </div>
              </Panel>
            )}

            {/* Ação em massa sobre a seleção */}
            {selCount > 0 && (
              <Panel position="bottom-center" className="!mb-8">
                <div className="flex items-center gap-4 rounded-xl pl-4 pr-2 py-2 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40">
                  <div className="leading-tight">
                    <div className="text-sm text-gray-100 font-medium">
                      {selCount} selecionado{selCount > 1 ? 's' : ''}
                    </div>
                    {selBreak && <div className="text-[11px] text-gray-500">{selBreak}</div>}
                  </div>
                  <button
                    onClick={removeSelectedFromMap}
                    title="Tira os cards do mapa. Os arquivos continuam no projeto."
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-100 px-3 py-1.5 rounded-lg"
                  >
                    Remover do mapa <span className="text-gray-500">· Del</span>
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1.5"
                  >
                    Limpar
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-1.5">
                  não apaga arquivo — só o card e as setas dele
                </p>
              </Panel>
            )}
          </ReactFlow>


          {flowModal && <FlowModal name={flowModal} onClose={() => setFlowModal(null)} />}
          {novaMem && <NovaMemoria onCriar={addMemory} onFechar={() => setNovaMem(false)} />}
          {insertOpen && <InsertModal counts={counts} onInsert={insertResource} onClose={() => setInsertOpen(false)} />}
          {promptModal && <PromptModal title={promptModal.title} text={promptModal.text} onClose={() => setPromptModal(null)} />}
          {digestModal && <DigestModal data={digestModal} onClose={() => setDigestModal(null)} onSaved={reload} />}
          {decisaoDe && (
            <EditorDecisao
              item={{ name: decisaoDe.name, displayName: decisaoDe.name, decision: decisaoDe.decision }}
              onFechar={() => setDecisaoDe(null)}
              onSalvar={async d => {
                const r = await api.saveDecision(decisaoDe.kind, decisaoDe.name, d)
                // reflete no nó sem recarregar o mapa inteiro
                setNodes(ns => ns.map(x => (x.data as MemData)?.label === decisaoDe.name
                  ? { ...x, data: { ...x.data, decision: r.decision } } : x))
              }}
            />
          )}
        </div>
        )}
      </div>
    </ActionsCtx.Provider>
  )
}

export default function MemoryCanvasPage({ mapaInicial }: { mapaInicial?: string } = {}) {
  return (
    <ReactFlowProvider>
      <Canvas mapaInicial={mapaInicial} />
    </ReactFlowProvider>
  )
}
