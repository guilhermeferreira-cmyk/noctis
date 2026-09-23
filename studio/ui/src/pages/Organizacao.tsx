import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Panel,
  NodeResizer, Handle, Position, MarkerType,
  useNodesState, useReactFlow, type Node, type NodeProps, type Edge, type Connection,
} from '@xyflow/react'
import { api, getProject, type Organizacao as OrgView, type AgenteOrg, type SquadOrg } from '../api'
import { KIND_META, ICON_SIZES, PONTILHADO, doSistema } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { DiscosDoAgente } from '../components/Progresso'
import { abrirRecursoNaDoca } from '../lib/doca'
import { CarregandoNoctis } from '../components/Esqueleto'

/**
 * A organização como CANVAS, e não como organograma fixo.
 *
 * Ela nasceu como colunas automáticas, e o arranjo era do código. Ele pediu o
 * contrário: manipular como se manipula o mapa de memória — arrastar, afastar,
 * agrupar por proximidade, dar zoom. Faz sentido, e por um motivo que o mapa já
 * provou: a posição carrega significado que nenhuma regra de layout adivinha.
 *
 * Duas verdades separadas, como sempre neste sistema:
 *
 *     agents/*.yaml + squads.json    quem responde a quem   (a cadeia)
 *     organizacao.json               onde cada card está    (o arranjo)
 *
 * O arranjo se grava sozinho meio segundo depois de soltar o card. Card sem
 * posição salva entra num lugar calculado: a primeira abertura parece um
 * organograma, e dali em diante é seu.
 */

const LARGURA = 268

/** O nome que você digita vira o arquivo do agente.
 *
 * Os yaml existentes são snake_case sem acento (`pen_dev`), e o resto do
 * sistema — despacho, XP, citação de Learning — referencia o agente por esse
 * nome. Escrever "Líder de Conteúdo" e receber `lider_de_conteudo` mantém a
 * regra sem fazer você pensar nela.
 */
function comoArquivo(nome: string): string {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
}

function CardAgente({ data }: NodeProps) {
  const a = data.agente as AgenteOrg
  const outros = (data.outrosProjetos as { slug: string; nome: string }[]) || []
  const papeis = data.papeis as OrgView['papeis']
  const squads = data.squads as SquadOrg[]
  const onMudou = data.onMudou as () => void
  const [abrindo, setAbrindo] = useState(false)
  const meta = papeis[a.papel]
  const cor = a.cor || KIND_META.agent.color
  const Icone = getIcon(a.icone || KIND_META.agent.icon)

  const mudar = async (patch: { papel?: string; squad?: string }) => {
    try {
      const r = await api.definirOrganizacao(a.nome, patch)
      // O Noctis tem UM Maestro: promover alguém rebaixa quem estava lá, e
      // você precisa saber disso sem ir procurar.
      if (r.agente?.rebaixado) alert(r.agente.rebaixado)
      onMudou()
    } catch (e) { alert((e as Error).message) }
  }

  const apagado = data.apagado as boolean | undefined
  return (
    <div className={`group/o acende rounded-xl border bg-[#161616] p-2.5 shadow-lg transition-opacity
                     ${a.ativo ? '' : 'opacity-50'} ${apagado ? 'opacity-20' : ''}`}
      style={{ width: LARGURA, borderColor: cor + '44', borderLeft: `3px solid ${meta?.cor || cor}`,
               ['--cor-card' as string]: cor }}>
      {/* As alças: puxar de uma para outra desenha um conector. A cadeia de
          comando continua em papel + squad; o conector é a relação que você
          quer marcar e que nenhuma regra descreve. */}
      {/* A alça de CIMA sai dele para quem ele olha para cima — a quem reporta.
          A de BAIXO recebe quem olha para ele. A seta segue o olhar, e não o
          fluxo de comando: é assim que ele lê o desenho. */}
      <Handle type="source" position={Position.Top} className="!w-2 !h-2 !bg-white/30 !border-0" />
      <Handle type="target" position={Position.Bottom} className="!w-2 !h-2 !bg-white/30 !border-0" />
      <div className="flex items-start gap-2">
        {/* A Organização não traz ficha embutida no card (o endpoint dela é
            outro, mais leve de propósito). Poucos agentes por squad, então
            buscar de cara continua barato — é só a grade cheia de recursos
            que não podia mais fazer isso. */}
        {a.papel !== 'maestro' && <DiscosDoAgente agente={a.nome} cor={cor} eager />}
        <span className="shrink-0 rounded-md grid place-items-center"
          style={{ background: cor + '22', color: cor,
                   width: ICON_SIZES.organizacao + 14, height: ICON_SIZES.organizacao + 14 }}>
          <Icone size={ICON_SIZES.organizacao} />
        </span>
        {/* O título abre a doca, então é `nodrag`. Ele encolhe até o texto de
            propósito: ocupando a linha inteira, sobrava pouco cabeçalho para
            pegar o card e arrastar — e arrastar é o gesto principal aqui. */}
        <div className="min-w-0 flex-1">
          <button onClick={() => abrirRecursoNaDoca('agent', a.nome, onMudou)}
            className="nodrag text-[12.5px] text-gray-100 font-medium leading-tight text-left hover:text-white block max-w-full truncate">
            {a.titulo}
          </button>
          <div className="text-[10px] flex items-center gap-1" style={{ color: meta?.cor }}>
            {(() => {
              const pp = doSistema(`papel.${a.papel}`, '', meta?.cor || '#a1a1aa')
              if (!pp.icon) return null
              const I = getIcon(pp.icon)
              return <I size={11} />
            })()}
            {meta?.label}{a.modelo ? ` · ${a.modelo}` : ''}
          </div>
        </div>
        <button onClick={() => setAbrindo(v => !v)} title="Mudar papel ou squad"
          className="nodrag opacity-0 group-hover/o:opacity-100 text-gray-500 hover:text-gray-100 text-xs px-1">⋯</button>
      </div>

      {!abrindo && (
        <>
          {a.descricao && (
            <p className="text-[11px] text-gray-500 leading-snug mt-1.5 line-clamp-2">{a.descricao}</p>
          )}
          {a.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {a.tags.slice(0, 4).map(t => (
                <span key={t} className="text-[9.5px] text-gray-500 bg-white/[0.05] rounded-full px-1.5 py-0.5">{t}</span>
              ))}
            </div>
          )}
        </>
      )}

      {abrindo && (
        <div className="nodrag mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1">
            {Object.entries(papeis).map(([id, p]) => (
              <button key={id} onClick={() => mudar({ papel: id })} title={p.desc}
                className={`text-[10px] px-1.5 py-1 rounded border ${
                  a.papel === id ? 'border-transparent' : 'border-gray-800 text-gray-400 hover:border-gray-700'}`}
                style={a.papel === id ? { background: p.cor + '22', color: p.cor, outline: `1px solid ${p.cor}` } : undefined}>
                {p.label.split(' ')[0]}
              </button>
            ))}
          </div>
          {/* Tirar do desenho não apaga nada: o agente continua no projeto e na
              squad dele, e volta pelo "+ Agente" quando você quiser. */}
          <button onClick={() => (data.onTirar as (() => void) | undefined)?.()}
            className="w-full text-[10.5px] text-gray-500 hover:text-red-400 text-left px-0.5">
            tirar do desenho
          </button>
          {/* Mandar para outro projeto leva só o ARQUÉTIPO: o que o agente é.
              Papel, squad e histórico são deste trabalho e ficam aqui — do
              outro lado ele chega sem mandar em ninguém e sem passado. */}
          {outros.length > 0 && (
            <select value="" title="Enviar o arquétipo deste agente para outro projeto"
              onChange={async e => {
                const para = e.target.value
                if (!para) return
                const nome = outros.find(o => o.slug === para)?.nome || para
                if (!window.confirm(`Enviar o arquétipo de "${a.titulo}" para ${nome}?

`
                  + 'Vai o prompt, as ferramentas e a temperatura. Papel, squad, memórias e XP ficam neste projeto.')) return
                try {
                  const r = await api.enviarAgente(a.nome, para)
                  alert(r.renomeado
                    ? `Chegou em ${nome} como "${r.nome}" — já havia um com o nome antigo.`
                    : `"${a.titulo}" chegou em ${nome}.`)
                } catch (err) { alert((err as Error).message) }
              }}
              className="nodrag w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-400 focus:outline-none focus:border-sky-500">
              <option value="">— enviar arquétipo para… —</option>
              {outros.map(o => <option key={o.slug} value={o.slug}>{o.nome}</option>)}
            </select>
          )}
          {a.papel !== 'maestro' && (
            <select value={a.squad} onChange={e => mudar({ squad: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500">
              <option value="">{a.papel === 'lider' ? '— sem squad —' : '— fala direto com o Maestro —'}</option>
              {squads.map(s => <option key={s.chave} value={s.nome}>{s.nome}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

/** A squad como moldura, atrás dos cards: arrastá-la move a área, não a gente. */
function MolduraSquad({ data, selected }: NodeProps) {
  const s = data.squad as SquadOrg
  const onMudou = data.onMudou as () => void
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(s.nome)
  const Icone = getIcon(s.icone || 'GiFamilyTree')

  return (
    <div className="w-full h-full rounded-2xl border-2 border-dashed"
      style={{ borderColor: s.cor + '55', background: s.cor + '0b' }}>
      {/* Esticar a lane é como no mapa: as alças aparecem quando ela está
          selecionada, e o tamanho fica salvo. */}
      <NodeResizer isVisible={selected} minWidth={220} minHeight={120}
        color={s.cor} handleClassName="!w-2 !h-2" lineClassName="!border-dashed" />
      {/* A LANE é quem reporta: ela se liga ao líder, ou ao Maestro se a squad
          não tiver líder. E recebe a ligação de quem executa. */}
      <Handle type="source" position={Position.Top} id="acima"
        className="!w-2.5 !h-2.5 !-top-1.5" style={{ background: s.cor, border: 0 }} />
      <Handle type="target" position={Position.Bottom} id="abaixo"
        className="!w-2.5 !h-2.5 !-bottom-1.5" style={{ background: s.cor + 'aa', border: 0 }} />
      <div className="flex items-center gap-2 px-3 py-1.5 whitespace-nowrap overflow-hidden">
        <span style={{ color: s.cor }}><Icone size={ICON_SIZES.squad} /></span>
        {editando ? (
          <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
            className="nodrag bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[12px] text-gray-100 focus:outline-none focus:border-sky-500"
            onKeyDown={async e => {
              if (e.key === 'Escape') setEditando(false)
              if (e.key === 'Enter') { await api.editarSquad(s.chave, { nome }); setEditando(false); onMudou() }
            }} />
        ) : (
          <button onClick={() => setEditando(true)}
            className="nodrag text-[12.5px] text-gray-200 hover:text-white">{s.nome}</button>
        )}
        <span className="text-[10px] text-gray-500">
          {s.membros.length} {s.membros.length === 1 ? 'agente' : 'agentes'}
        </span>
        <span className="text-[10px] text-gray-600 truncate">
          {s.lider ? `↑ ${s.lider.titulo}` : s.pai ? '↑ sem líder — reporta à squad-mãe' : '↑ sem líder — reporta ao Maestro'}
        </span>
        {(s.filhas?.length ?? 0) > 0 && (
          <span className="text-[10px] text-gray-600">· {s.filhas!.length} sub</span>
        )}
        {s.descricao && <span className="text-[10px] text-gray-600 truncate">· {s.descricao}</span>}
        <div className="flex-1" />
        <input type="color" value={s.cor} title="cor da squad"
          onChange={async e => { await api.editarSquad(s.chave, { cor: e.target.value }); onMudou() }}
          className="nodrag w-4 h-4 bg-transparent border border-gray-700 rounded cursor-pointer" />
        <button onClick={async () => {
            if (!window.confirm(`Apagar a squad "${s.nome}"? Quem estava nela fica sem squad.`)) return
            const r = await api.apagarSquad(s.chave)
            if (r.soltos) alert(`${r.soltos} agente(s) ficaram sem squad.`)
            onMudou()
          }}
          className="nodrag text-[10px] text-gray-600 hover:text-red-400">apagar</button>
      </div>
    </div>
  )
}

function CardVoce() {
  return (
    <div className="relative rounded-xl border border-white/[0.14] bg-white/[0.05] px-5 py-2.5 text-[12.5px] text-gray-200 shadow-lg">
      {/* Você está no alto da cadeia: só recebe. */}
      <Handle type="target" position={Position.Bottom} className="!w-2 !h-2 !bg-white/30 !border-0" />
      Você
    </div>
  )
}

const nodeTypes = { agente: CardAgente, squad: MolduraSquad, voce: CardVoce }

const MARGEM = 18

/** A lane cresce até caber o que está dentro dela.
 *
 * Um card empurrado para baixo, ou arrastado para a borda, ficava com metade
 * do corpo fora da squad — e "estar dentro" é justamente o que o desenho usa
 * para dizer a que squad ele pertence. Então a lane acompanha: mede o filho
 * mais distante e se estica. De dentro para fora, para a squad-mãe caber as
 * filhas já crescidas.
 */
function acomodar(ns: Node[]): Node[] {
  const profundidade = (n: Node) => {
    let d = 0, cursor = n.parentId, guarda = 0
    while (cursor && guarda < 10) { d++; cursor = ns.find(k => k.id === cursor)?.parentId; guarda++ }
    return d
  }
  const lanes = ns.filter(n => n.type === 'squad').sort((a, b) => profundidade(b) - profundidade(a))
  const tamanho = new Map(ns.map(n => [n.id, {
    w: n.width ?? n.measured?.width ?? LARGURA,
    h: n.height ?? n.measured?.height ?? 110,
  }]))
  for (const lane of lanes) {
    let larg = 0, alt = 0
    for (const f of ns.filter(n => n.parentId === lane.id)) {
      const t = tamanho.get(f.id)!
      larg = Math.max(larg, f.position.x + t.w + MARGEM)
      alt = Math.max(alt, f.position.y + t.h + MARGEM)
    }
    const atual = tamanho.get(lane.id)!
    tamanho.set(lane.id, { w: Math.max(atual.w, larg), h: Math.max(atual.h, alt) })
  }
  return ns.map(n => {
    if (n.type !== 'squad') return n
    const t = tamanho.get(n.id)!
    if (t.w === (n.width ?? 0) && t.h === (n.height ?? 0)) return n
    return { ...n, width: t.w, height: t.h, style: { ...n.style, width: t.w, height: t.h } }
  })
}

/** Mãe antes de filha, sempre.
 *
 * O xyflow lê a lista em ordem: um card que aparece antes da lane dele vai
 * parar no canto errado da tela. Enquanto o arranjo nasce do cálculo isso se
 * resolve sozinho, mas arrastar um card de uma lane para outra troca o pai sem
 * trocar o lugar na lista — daí vinham os saltos. Reordenar é barato.
 */
function ordenar(ns: Node[]): Node[] {
  const filhas = new Map<string, Node[]>()
  const raiz: Node[] = []
  for (const n of ns) {
    if (n.parentId) filhas.set(n.parentId, [...(filhas.get(n.parentId) || []), n])
    else raiz.push(n)
  }
  const saida: Node[] = []
  const descer = (n: Node, guarda = 0) => {
    saida.push(n)
    if (guarda > 10) return
    for (const f of filhas.get(n.id) || []) descer(f, guarda + 1)
  }
  raiz.forEach(n => descer(n))
  // Quem ficou de fora tinha um pai que não existe mais: volta para a raiz.
  if (saida.length < ns.length) {
    const vistos = new Set(saida.map(n => n.id))
    for (const n of ns) if (!vistos.has(n.id)) saida.push({ ...n, parentId: undefined })
  }
  return saida
}

function Tela() {
  const [org, setOrg] = useState<OrgView>()
  // Para onde dá para mandar um arquétipo: todo projeto menos este.
  const [outrosProjetos, setOutrosProjetos] = useState<{ slug: string; nome: string }[]>([])
  const [links, setLinks] = useState<{ source: string; target: string; rotulo?: string }[]>([])
  // Quem foi tirado do desenho. Continua no projeto e na squad; só não tem card.
  const [fora, setFora] = useState<string[]>([])
  const [carregado, setCarregado] = useState(false)
  const [nova, setNova] = useState('')
  const [criando, setCriando] = useState<'squad' | 'agente' | null>(null)
  // Na organização o filtro não ESCONDE: ele REALÇA. Sumir com um card de dentro
  // de uma lane mentiria sobre o tamanho da squad, e o desenho é justamente o
  // que se veio ler aqui. Quem não passa fica apagado, e continua no lugar.
  const [realce, setRealce] = useState('')
  const [recorte, setRecorte] = useState<'' | 'trabalharam' | 'parados' | 'lideram'>('')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const { fitView, zoomIn, zoomOut, getViewport } = useReactFlow()
  const pano = useRef<HTMLDivElement>(null)
  const agendado = useRef<ReturnType<typeof setTimeout>>(undefined)

  // O arranjo salvo vive num REF, não no estado.
  //
  // Era daqui que vinha o comportamento errático: guardar a posição num estado
  // fazia o desenho inteiro ser recalculado a cada arraste, e o card recém-solto
  // voltava para onde o cálculo automático o queria. No mapa de memória nunca
  // foi assim — lá os nós SÃO o estado, e o cálculo só serve para semear quem
  // ainda não tem lugar. É o que passa a valer aqui.
  const salvo = useRef<{ pos: Record<string, { x: number; y: number }>
                         tam: Record<string, { w: number; h: number }> }>({ pos: {}, tam: {} })

  const recarregar = useCallback(() => {
    Promise.all([api.organizacao(), api.layoutOrganizacao()]).then(([o, l]) => {
      salvo.current = { pos: l.pos || {}, tam: l.tam || {} }
      setLinks(l.links || [])
      setFora(l.fora || [])
      setOrg(o)
      setCarregado(true)
    })
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => {
    api.listProjects()
      .then(ps => setOutrosProjetos(ps.filter(p => p.slug !== getProject())
                                      .map(p => ({ slug: p.slug, nome: p.displayName }))))
      .catch(() => {})
  }, [])

  /** Tira o card do desenho. O agente fica: some da vista, não do projeto. */
  const tirarDoDesenho = useCallback((nome: string) => {
    setFora(atual => {
      const novo = atual.includes(nome) ? atual : [...atual, nome]
      api.salvarLayoutOrganizacao({ pos: salvo.current.pos, tam: salvo.current.tam,
                                    links, fora: novo }).catch(() => {})
      return novo
    })
  }, [links])

  /** O desenho de partida: só para quem ainda não tem lugar guardado.
   *
   * Lane = squad. O líder fica DENTRO da lane que ele lidera, no primeiro
   * lugar; os membros abaixo dele; as sub-squads abaixo dos cards, dentro da
   * mãe. Estar dentro é pertencer — nenhum conector diz o que o desenho já diz.
   */
  const semente = useMemo(() => {
    if (!org) return { nodes: [] as Node[] }
    const pos = salvo.current.pos, tam = salvo.current.tam
    const ns: Node[] = []
    const P = (id: string, x: number, y: number) => pos[id] || { x, y }
    const q = realce.trim().toLowerCase()
    const combina = (a: AgenteOrg) => {
      if (q && !((a.titulo + ' ' + a.nome + ' ' + (a.tags || []).join(' ') + ' ' + a.descricao)
          .toLowerCase().includes(q))) return false
      if (recorte === 'lideram') return a.papel === 'lider' || a.papel === 'maestro'
      return true
    }
    const dados = (a: AgenteOrg) =>
      ({ agente: a, papeis: org.papeis, squads: org.squads, onMudou: recarregar,
         onTirar: () => tirarDoDesenho(a.nome), outrosProjetos,
         apagado: (q || recorte) ? !combina(a) : false })
    // Quem está fora não vira card. A squad continua contando com ele — o
    // desenho é uma vista da organização, não a organização.
    const noDesenho = (a: AgenteOrg) => !fora.includes(a.nome)

    ns.push({ id: 'voce', type: 'voce', position: P('voce', 40, 0), data: {} })
    // O Warden fica entre você e o Maestro: é o degrau que responde por todos
    // os projetos. Ele só tem card no projeto base, que é onde mora.
    const wardens = (org.wardens || []).filter(noDesenho)
    wardens.forEach((w, i) => {
      ns.push({ id: `a:${w.nome}`, type: 'agente',
                position: P(`a:${w.nome}`, i * (LARGURA + 30), 110), data: dados(w) })
    })
    const yMaestro = wardens.length ? 260 : 110
    org.maestros.filter(noDesenho).forEach((m, i) => {
      ns.push({ id: `a:${m.nome}`, type: 'agente',
                position: P(`a:${m.nome}`, i * (LARGURA + 30), yMaestro), data: dados(m) })
    })

    const porChave = new Map(org.squads.map(s => [s.chave, s]))
    const raizes = org.squads.filter(s => !s.pai)
    const ALTURA_CARD = 132
    const ALTURA_CABECA = 44
    const PAD = 18
    const GAP = 22

    const filhasDe = (s: SquadOrg): SquadOrg[] =>
      (s.filhas || []).map(k => porChave.get(k)).filter(Boolean) as SquadOrg[]
    const cardsDe = (s: SquadOrg) => (s.lider ? 1 : 0) + s.membros.length

    const alturaDe = (s: SquadOrg, guarda = 0): number => {
      if (guarda > 8) return 180
      const dasFilhas = filhasDe(s).reduce((t, f) => t + alturaDe(f, guarda + 1) + GAP, 0)
      return Math.max(150, ALTURA_CABECA + PAD + cardsDe(s) * ALTURA_CARD + dasFilhas + PAD)
    }
    const larguraDe = (s: SquadOrg, guarda = 0): number => {
      if (guarda > 8) return LARGURA + PAD * 2
      return Math.max(LARGURA + PAD * 2,
                      ...filhasDe(s).map(f => larguraDe(f, guarda + 1) + PAD * 2))
    }

    let x = 0
    const yTopo = 400

    const desenhar = (s: SquadOrg, px_: number, py: number, guarda = 0) => {
      const t = tam[`s:${s.chave}`]
      const larg = t?.w ?? larguraDe(s)
      const alt = t?.h ?? alturaDe(s)
      ns.push({ id: `s:${s.chave}`, type: 'squad',
                ...(s.pai ? { parentId: `s:${s.pai}` } : {}),
                position: P(`s:${s.chave}`, px_, py),
                data: { squad: s, onMudou: recarregar },
                width: larg, height: alt,
                style: { width: larg, height: alt, zIndex: -10 + guarda } })

      const dentro = (s.lider ? [s.lider] : []).concat(s.membros).filter(noDesenho)
      dentro.forEach((m, i) => {
        ns.push({ id: `a:${m.nome}`, type: 'agente', parentId: `s:${s.chave}`,
                  position: P(`a:${m.nome}`, PAD, ALTURA_CABECA + i * ALTURA_CARD),
                  data: dados(m) })
      })

      let fy = ALTURA_CABECA + PAD + cardsDe(s) * ALTURA_CARD
      for (const f of filhasDe(s)) {
        desenhar(f, PAD, fy, guarda + 1)
        fy += (tam[`s:${f.chave}`]?.h ?? alturaDe(f)) + GAP
      }
    }

    for (const s of raizes) {
      desenhar(s, x, yTopo)
      x += (tam[`s:${s.chave}`]?.w ?? larguraDe(s)) + 90
    }

    org.soltos.concat(org.lideresSemSquad).filter(noDesenho).forEach((m, i) => {
      ns.push({ id: `a:${m.nome}`, type: 'agente',
                position: P(`a:${m.nome}`, x, yTopo + i * 132), data: dados(m) })
    })
    return { nodes: ns }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, recarregar, fora, outrosProjetos, realce, recorte])

  /** As linhas. Só o que o desenho NÃO diz sozinho vira linha.
   *
   * Quem está dentro de uma lane já mostrou a que squad pertence. Sobra a parte
   * que atravessa fronteira: o líder que responde ao líder de cima, a squad sem
   * líder que responde ao Maestro, quem está fora de tudo, e os conectores que
   * você puxou na mão.
   */
  const edges = useMemo(() => {
    if (!org) return [] as Edge[]
    const es: Edge[] = []
    const maestro = org.maestros[0] ? `a:${org.maestros[0].nome}` : ''
    const porChave = new Map(org.squads.map(s => [s.chave, s]))

    // A cadeia do topo: Maestro → Warden → você. Sem Warden no projeto, o
    // Maestro fala direto com você, como sempre foi.
    const warden = (org.wardens || [])[0]
    org.wardens?.forEach(w => {
      es.push({ id: `e:voce:${w.nome}`, source: `a:${w.nome}`, target: 'voce',
                style: { stroke: '#f59e0b55' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b66' } })
    })
    org.maestros.forEach(m => {
      if (warden) {
        es.push({ id: `e:w:${m.nome}`, source: `a:${m.nome}`, target: `a:${warden.nome}`,
                  style: { stroke: '#f59e0b44' },
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b55' } })
        return
      }
      es.push({ id: `e:voce:${m.nome}`, source: `a:${m.nome}`, target: 'voce',
                style: { stroke: '#ffffff33' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff44' } })
    })

    for (const s of org.squads) {
      if (s.lider && !fora.includes(s.lider.nome)) {
        let cursor = s.pai ? porChave.get(s.pai) : undefined
        let acima = ''
        let voltas = 0
        while (cursor && voltas < 12) {
          if (cursor.lider && cursor.lider.nome !== s.lider.nome) { acima = `a:${cursor.lider.nome}`; break }
          cursor = cursor.pai ? porChave.get(cursor.pai) : undefined
          voltas++
        }
        if (!acima) acima = maestro
        if (acima) {
          es.push({ id: `e:l:${s.chave}`, source: `a:${s.lider.nome}`, target: acima,
                    style: { stroke: (s.cor || '#ffffff') + '88', strokeWidth: 1.5 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: (s.cor || '#ffffff') + '88' } })
        }
      } else if (!s.pai && maestro) {
        es.push({ id: `e:sq:${s.chave}`, source: `s:${s.chave}`, sourceHandle: 'acima', target: maestro,
                  style: { stroke: (s.cor || '#ffffff') + '66', strokeWidth: 1.4, strokeDasharray: '5 4' },
                  markerEnd: { type: MarkerType.ArrowClosed, color: (s.cor || '#ffffff') + '66' } })
      }
    }

    org.soltos.concat(org.lideresSemSquad).filter(m => !fora.includes(m.nome)).forEach(m => {
      if (maestro) es.push({ id: `e:s:${m.nome}`, source: `a:${m.nome}`, target: maestro,
                             style: { stroke: '#ffffff26', strokeDasharray: '4 4' } })
    })

    for (const l of links) {
      es.push({ id: `l:${l.source}->${l.target}`, source: l.source, target: l.target,
                label: l.rotulo || undefined,
                style: { stroke: '#a78bfa99', strokeWidth: 1.6 },
                labelStyle: { fill: '#c4b5fd', fontSize: 10 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa99' } })
    }
    return es
  }, [org, links, fora])

  /** Casa o desenho com os dados sem mexer em nada que já está na tela.
   *
   * Card que já existe mantém posição, lane e tamanho — inclusive logo depois
   * de você arrastá-lo, que é quando o servidor responde e os dados chegam
   * novos. Card que nasceu agora entra pelo lugar calculado. Card que sumiu do
   * projeto sai. É o mesmo contrato do mapa: o arranjo é seu, os dados são do
   * sistema, e um não reescreve o outro.
   */
  useEffect(() => {
    if (!carregado) return
    setNodes(atuais => {
      const antes = new Map(atuais.map(n => [n.id, n]))
      return ordenar(semente.nodes.map(n => {
        const v = antes.get(n.id)
        if (!v) return n
        const w = v.width ?? n.width, h = v.height ?? n.height
        return {
          ...n,
          position: v.position,
          parentId: v.parentId,
          selected: v.selected,
          ...(n.type === 'squad'
            ? { width: w, height: h, style: { ...n.style, width: w, height: h } }
            : {}),
        }
      }))
    })
  }, [semente, carregado, setNodes])

  /** Grava o arranjo: no ref na hora, no servidor meio segundo depois. */
  const guardar = useCallback((ns: Node[], ls = links, fr = fora) => {
    const pos: Record<string, { x: number; y: number }> = {}
    const tam: Record<string, { w: number; h: number }> = {}
    for (const n of ns) {
      pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
      if (n.type === 'squad') {
        const w = n.width ?? n.measured?.width, h = n.height ?? n.measured?.height
        if (w && h) tam[n.id] = { w: Math.round(w), h: Math.round(h) }
      }
    }
    salvo.current = { pos, tam }
    clearTimeout(agendado.current)
    agendado.current = setTimeout(() => {
      api.salvarLayoutOrganizacao({ pos, tam, links: ls, fora: fr }).catch(() => {})
    }, 400)
  }, [links, fora])

  /** Soltou o card: o CENTRO dele decide a lane, como no mapa de memória.
   *
   * Entre lanes aninhadas ganha a mais funda — soltar em "Conteúdo", que está
   * dentro de "Marketing", quer dizer Conteúdo. A troca de lane acontece na
   * tela na mesma hora, com a posição recalculada em relação à lane nova; o
   * servidor é avisado depois. Nada é redesenhado para isso.
   */
  const soltar = useCallback((no: Node, ns: Node[]) => {
    const absoluto = (n: Node) => {
      let x = n.position.x, y = n.position.y, cursor = n.parentId, guarda = 0
      while (cursor && guarda < 10) {
        const m = ns.find(k => k.id === cursor)
        if (!m) break
        x += m.position.x; y += m.position.y; cursor = m.parentId; guarda++
      }
      return { x, y }
    }
    const profundidade = (n: Node) => {
      let d = 0, cursor = n.parentId, guarda = 0
      while (cursor && guarda < 10) { d++; cursor = ns.find(k => k.id === cursor)?.parentId; guarda++ }
      return d
    }
    const descendentes = (id: string, acc = new Set<string>()): Set<string> => {
      for (const n of ns) if (n.parentId === id && !acc.has(n.id)) { acc.add(n.id); descendentes(n.id, acc) }
      return acc
    }

    const atual = ns.find(n => n.id === no.id)
    if (!atual || atual.id === 'voce') { guardar(ns); return }

    const abs = absoluto(atual)
    const w = atual.width ?? atual.measured?.width ?? LARGURA
    const h = atual.height ?? atual.measured?.height ?? 110
    // Agente entra pela lane onde o CENTRO dele caiu, como no mapa. Uma lane
    // entra pelo canto de cima — que é por onde se pega e o que o olho usa
    // para dizer "esta está dentro daquela".
    const px = atual.type === 'squad' ? abs.x + 24 : abs.x + w / 2
    const py = atual.type === 'squad' ? abs.y + 16 : abs.y + h / 2

    const proibidos = atual.type === 'squad' ? descendentes(atual.id) : new Set<string>()
    const lane = ns
      .filter(n => {
        if (n.type !== 'squad' || n.id === atual.id || proibidos.has(n.id)) return false
        const a = absoluto(n)
        const lw = n.width ?? n.measured?.width ?? 0
        const lh = n.height ?? n.measured?.height ?? 0
        return px >= a.x && px <= a.x + lw && py >= a.y && py <= a.y + lh
      })
      .sort((a, b) => profundidade(b) - profundidade(a))[0]

    const destino = lane ? (lane.data.squad as SquadOrg) : null
    const mudou = (lane?.id || undefined) !== (atual.parentId || undefined)

    // A tela primeiro: trocar de lane é recalcular a posição em relação à lane
    // nova, e nada mais. Nenhum redesenho, nenhum card voltando ao lugar.
    /** Soltar em cima de outro card não empilha: desce até o primeiro vão.
     *
     * O lugar exato do gesto vale — menos quando ele esconderia um card atrás
     * do outro, e aí o card cai logo abaixo de quem já estava lá. Só acontece
     * na troca de lane; arrastar dentro da mesma lane continua livre.
     */
    const semEncostar = (id: string, alvo: string, x: number, y: number) => {
      const irmaos = ns.filter(n => n.id !== id && n.parentId === alvo && n.type === 'agente')
      let py2 = y
      for (let i = 0; i < 12; i++) {
        const bate = irmaos.some(o => {
          const ow = o.width ?? o.measured?.width ?? LARGURA
          const oh = o.height ?? o.measured?.height ?? 110
          return x < o.position.x + ow && o.position.x < x + w && py2 < o.position.y + oh && o.position.y < py2 + h
        })
        if (!bate) break
        const abaixo = irmaos
          .filter(o => o.position.y + (o.height ?? o.measured?.height ?? 110) > py2)
          .map(o => o.position.y + (o.height ?? o.measured?.height ?? 110) + 14)
        py2 = Math.min(...abaixo)
      }
      return { x, y: py2 }
    }

    const proximos = mudou
      ? ns.map(n => {
          if (n.id !== atual.id) return n
          const alvo = lane ? absoluto(lane) : { x: 0, y: 0 }
          return lane
            ? { ...n, parentId: lane.id,
                position: semEncostar(n.id, lane.id, abs.x - alvo.x, abs.y - alvo.y) }
            : { ...n, parentId: undefined, position: abs }
        })
      : ns
    const arrumados = acomodar(ordenar(proximos))
    setNodes(arrumados)
    guardar(arrumados)
    if (!mudou) return

    // Só agora o servidor: a cadeia acompanha o gesto, o gesto não espera a
    // cadeia. A releitura traz os avisos e os papéis atualizados; o arranjo na
    // tela sobrevive a ela, porque quem já existe mantém posição e lane.
    const feito = () => api.organizacao().then(setOrg).catch(() => {})
    if (atual.type === 'squad') {
      const eu = atual.data.squad as SquadOrg
      api.editarSquad(eu.chave, { pai: destino ? destino.chave : '' })
        .then(feito)
        .catch(e => { alert((e as Error).message); recarregar() })
      return
    }
    if (atual.type !== 'agente') return
    api.definirOrganizacao(atual.id.slice(2), { squad: destino ? destino.nome : '' })
      .then(feito)
      .catch(e => { alert((e as Error).message); recarregar() })
  }, [guardar, recarregar, setNodes])

  /** Todo agente do projeto, com a squad em que ele está.
   *
   * Todo mundo já tem card no desenho — então "escolher um agente pronto" é
   * ACHAR o card dele, que é o problema real quando a organização cresce e a
   * tela está cheia. Escolher traz a vista até ele e o deixa selecionado,
   * pronto para ser arrastado para dentro de uma lane.
   */
  const prontos = useMemo(() => {
    if (!org) return [] as { nome: string; titulo: string; onde: string }[]
    const lista: { nome: string; titulo: string; onde: string }[] = []
    org.maestros.forEach(a => lista.push({ nome: a.nome, titulo: a.titulo, onde: 'Maestro' }))
    org.squads.forEach(sq => {
      if (sq.lider) lista.push({ nome: sq.lider.nome, titulo: sq.lider.titulo, onde: `lidera ${sq.nome}` })
      sq.membros.forEach(a => lista.push({ nome: a.nome, titulo: a.titulo, onde: sq.nome }))
    })
    org.soltos.concat(org.lideresSemSquad)
      .forEach(a => lista.push({ nome: a.nome, titulo: a.titulo, onde: 'sem squad' }))
    return lista.sort((a, b) => a.titulo.localeCompare(b.titulo))
  }, [org])

  /** Os dois grupos, lado a lado: o que está no desenho e o que não está.
   *
   * Ver só metade era o problema — na hora de inserir, o que você procura é
   * justamente quem ficou de fora, e ele não aparecia em lugar nenhum.
   */
  const achados = useMemo(() => {
    const q = nova.trim().toLowerCase()
    const casa = (a: { nome: string; titulo: string }) =>
      !q || (a.titulo + ' ' + a.nome).toLowerCase().includes(q)
    const lista = prontos.filter(casa)
    return {
      dentro: lista.filter(a => !fora.includes(a.nome)).slice(0, 8),
      fora: lista.filter(a => fora.includes(a.nome)).slice(0, 8),
    }
  }, [prontos, nova, fora])

  /** Escolheu um que já existe: a vista vai até ele e ele fica selecionado. */
  const irAte = useCallback((nome: string) => {
    setCriando(null); setNova('')
    setNodes(ns => ns.map(n => n.id === `a:${nome}` ? { ...n, selected: true }
                                                    : n.selected ? { ...n, selected: false } : n))
    setTimeout(() => fitView({ nodes: [{ id: `a:${nome}` }], duration: 500, maxZoom: 1.1, padding: 0.6 }), 30)
  }, [fitView, setNodes])

  /** Traz o card de volta, no meio do que você está vendo. */
  const inserirNoDesenho = useCallback((nome: string) => {
    const v = getViewport()
    const r = pano.current?.getBoundingClientRect()
    const centro = {
      x: Math.round((-v.x + (r?.width || 900) / 2) / v.zoom) - LARGURA / 2,
      y: Math.round((-v.y + (r?.height || 600) / 2) / v.zoom) - 50,
    }
    const pos = { ...salvo.current.pos, [`a:${nome}`]: centro }
    salvo.current = { ...salvo.current, pos }
    setFora(atual => {
      const novo = atual.filter(n => n !== nome)
      api.salvarLayoutOrganizacao({ pos, tam: salvo.current.tam, links, fora: novo }).catch(() => {})
      return novo
    })
    setCriando(null); setNova('')
    setTimeout(() => fitView({ nodes: [{ id: `a:${nome}` }], duration: 500, maxZoom: 1.1, padding: 0.6 }), 120)
  }, [fitView, getViewport, links])

  const criarSquad = async () => {
    if (!nova.trim()) return
    try { await api.criarSquad(nova.trim()); setNova(''); setCriando(null); recarregar() }
    catch (e) { alert((e as Error).message) }
  }

  /** Um agente novo, criado de dentro do desenho.
   *
   * Ele nasce fora de qualquer squad e no meio da tela — de onde você o arrasta
   * para a lane que quiser, que é como a pertinência se decide aqui. O resto do
   * yaml (prompt, ferramentas, memórias) continua sendo trabalho da tela de
   * Agentes: isto cria a peça e a põe no organograma, não configura o agente.
   */
  const criarAgente = async () => {
    const titulo = nova.trim()
    if (!titulo) return
    const nome = comoArquivo(titulo)
    if (!nome) { alert('Esse nome não vira um arquivo — use letras ou números.'); return }
    const existentes = [...(org?.maestros || []), ...(org?.soltos || []), ...(org?.lideresSemSquad || []),
                        ...(org?.squads || []).flatMap(s => [...(s.lider ? [s.lider] : []), ...s.membros])]
    if (existentes.some(a => a.nome === nome)) { alert(`Já existe um agente "${nome}".`); return }
    try {
      await api.saveAgent(nome, {
        name: titulo, description: '', system_prompt: '',
        memory_files: [], tools: [], output_format: 'markdown', temperature: 0.5,
      })
      // No meio do que você está vendo, e não num canto calculado.
      const v = getViewport()
      const r = pano.current?.getBoundingClientRect()
      const centro = {
        x: Math.round((-v.x + (r?.width || 900) / 2) / v.zoom) - LARGURA / 2,
        y: Math.round((-v.y + (r?.height || 600) / 2) / v.zoom) - 50,
      }
      const pos = { ...salvo.current.pos, [`a:${nome}`]: centro }
      salvo.current = { ...salvo.current, pos }
      await api.salvarLayoutOrganizacao({ pos, tam: salvo.current.tam, links })
      setNova(''); setCriando(null); recarregar()
    } catch (e) { alert((e as Error).message) }
  }

  // O canvas em fantasma: quem abre a Organização vê a forma dela — lanes e
  // cards — antes de os yaml serem lidos, e nada salta quando chegam.
  if (!org) return <div className="relative h-full"><CarregandoNoctis /></div>

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <p className="text-xs text-gray-500 flex-1 truncate">
          {org.total} agentes · {org.squads.length} squad{org.squads.length !== 1 ? 's' : ''} ·
          {' '}arraste para dentro de uma lane para mudar de squad · puxe as alças para ligar
        </p>
        {criando ? (
          <div className="relative flex items-center gap-1.5 shrink-0">
            <input value={nova} onChange={e => setNova(e.target.value)} autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') (criando === 'squad' ? criarSquad() : criarAgente())
                if (e.key === 'Escape') { setCriando(null); setNova('') }
              }}
              placeholder={criando === 'squad' ? 'nome da squad' : 'nome novo, ou busque um pronto'}
              className="w-56 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-sky-500" />
            {criando === 'agente' && nova.trim() && (
              <span className="text-[10.5px] text-gray-600 font-mono">{comoArquivo(nova)}.yaml</span>
            )}
            <button onClick={() => (criando === 'squad' ? criarSquad() : criarAgente())}
              className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-1 rounded">criar</button>
            <button onClick={() => { setCriando(null); setNova('') }}
              className="text-xs text-gray-400 hover:text-gray-200 px-1">✕</button>

            {/* Os que já existem. Criar um agente é raro; achar um é o dia a
                dia — então a lista fica aberta, e digitar filtra. */}
            {criando === 'agente' && (achados.dentro.length > 0 || achados.fora.length > 0) && (
              <div className="absolute top-8 right-0 z-50 w-80 rounded-xl bg-[#18181c]/95 backdrop-blur-xl
                              border border-white/[0.08] shadow-2xl shadow-black/50 py-1
                              max-h-[60vh] overflow-y-auto">
                {achados.fora.length > 0 && (
                  <>
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-emerald-400/70">
                      fora do desenho · clique para inserir
                    </p>
                    {achados.fora.map(a => (
                      <button key={a.nome} onClick={() => inserirNoDesenho(a.nome)}
                        className="w-full flex items-baseline gap-2 px-3 py-1.5 text-left hover:bg-emerald-400/[0.08]">
                        <span className="text-emerald-400/80 text-[11px]">+</span>
                        <span className="text-[12px] text-gray-200 truncate">{a.titulo}</span>
                        <span className="text-[10px] text-gray-600 ml-auto shrink-0">{a.onde}</span>
                      </button>
                    ))}
                  </>
                )}
                {achados.dentro.length > 0 && (
                  <>
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-600">
                      no desenho · clique para achar
                    </p>
                    {achados.dentro.map(a => (
                      <button key={a.nome} onClick={() => irAte(a.nome)}
                        className="group/l w-full flex items-baseline gap-2 px-3 py-1.5 text-left hover:bg-white/[0.06]">
                        <span className="text-[12px] text-gray-200 truncate">{a.titulo}</span>
                        <span className="text-[10px] text-gray-600 ml-auto shrink-0">{a.onde}</span>
                        <span role="button" tabIndex={-1} title="Tirar do desenho"
                          onClick={e => { e.stopPropagation(); tirarDoDesenho(a.nome) }}
                          className="opacity-0 group-hover/l:opacity-100 text-[10px] text-gray-500 hover:text-red-400 shrink-0">
                          tirar
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => setCriando('agente')}
              title="Cria o agente e põe o card no desenho; arraste-o para dentro de uma squad"
              className="text-xs bg-white/[0.07] hover:bg-white/[0.12] text-gray-200 px-3 py-1.5 rounded-lg shrink-0">
              + Agente
            </button>
            <button onClick={() => setCriando('squad')}
              className="text-xs bg-sky-600/80 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg shrink-0">
              + Squad
            </button>
          </>
        )}
        {/* Reorganizar joga fora o arranjo salvo e volta ao desenho que o Noctis
            calcula: Maestro em cima, líder entre ele e a lane, membros dentro.
            Existe porque mudar a REGRA do desenho não mexe em quem já arrastou. */}
        <button onClick={async () => {
            if (!window.confirm('Reorganizar o desenho? As posições e os tamanhos que você ajustou são descartados; os conectores ficam.')) return
            await api.salvarLayoutOrganizacao({ pos: {}, tam: {}, links })
            salvo.current = { pos: {}, tam: {} }
            setNodes([]); recarregar()
            setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 400)
          }}
          title="Voltar ao desenho automático: Maestro › líder › squad"
          className="text-[11px] text-gray-500 hover:text-gray-200 px-1.5">reorganizar</button>
        <input value={realce} onChange={e => setRealce(e.target.value)}
          placeholder="realçar agente"
          className="w-40 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200
                     focus:outline-none focus:border-sky-500 placeholder:text-gray-600 shrink-0" />
        {([['', 'todos'], ['lideram', 'quem coordena']] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setRecorte(id)}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${
              recorte === id ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                             : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
            {rotulo}
          </button>
        ))}
        <button onClick={() => fitView({ duration: 300, padding: 0.15 })}
          title="Enquadrar tudo" className="text-gray-500 hover:text-gray-200 text-xs px-1">⤢</button>
        <button onClick={recarregar} className="text-gray-500 hover:text-gray-200 text-xs px-1">↻</button>
      </div>

      <div ref={pano} className="flex-1 min-h-0 relative">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={ch => {
            onNodesChange(ch)
            // Redimensionar não passa por drag: quem avisa é a mudança de
            // dimensão, e ela só vale quando o arraste da alça terminou.
            if (ch.some(c => c.type === 'dimensions' && c.resizing === false)) {
              setNodes(atuais => { guardar(atuais); return atuais })
            }
          }}
          onNodeDragStop={(_, no) => soltar(no, nodes)}
          onConnect={(c: Connection) => {
            if (!c.source || !c.target || c.source === c.target) return
            // A cadeia tem forma, e o canvas a respeita: agente liga em lane de
            // squad; líder liga no Maestro; lane liga no líder ou, sem líder, no
            // Maestro. O resto seria desenhar uma hierarquia que o sistema não
            // sabe executar.
            const papelDe = (id: string) => id.startsWith('s:') ? 'squad'
              : id === 'voce' ? 'voce'
              : (nodes.find(n => n.id === id)?.data?.agente as AgenteOrg | undefined)?.papel || ''
            const de = papelDe(c.source), para = papelDe(c.target)
            const vale =
              (de === 'agente' && para === 'squad') ||
              (de === 'squad' && (para === 'lider' || para === 'maestro')) ||
              (de === 'lider' && para === 'maestro') ||
              (de === 'maestro' && para === 'voce')
            if (!vale) {
              alert('Ligações possíveis: agente → lane de squad · lane → líder '
                  + '(ou Maestro, sem líder) · líder → Maestro.')
              return
            }
            const novos = [...links.filter(l => !(l.source === c.source && l.target === c.target)),
                           { source: c.source, target: c.target }]
            setLinks(novos); guardar(nodes, novos)
          }}
          onEdgeClick={(_, e) => {
            if (!e.id.startsWith('l:')) return
            if (!window.confirm('Remover este conector?')) return
            const novos = links.filter(l => `l:${l.source}->${l.target}` !== e.id)
            setLinks(novos); guardar(nodes, novos)
          }}
          fitView minZoom={0.25} maxZoom={1.8} deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}>
          {/* O pontilhado: opacidade, espaço, tamanho e cor vêm de Aparência */}
          {PONTILHADO.ativo && (
            <Background variant={BackgroundVariant.Dots} gap={PONTILHADO.espaco}
              size={PONTILHADO.tamanho} color={PONTILHADO.cor}
              style={{ opacity: PONTILHADO.opacidade / 100 }} />
          )}
          <Panel position="top-right" className="!m-3">
            <div className="flex flex-col gap-0.5 rounded-xl p-1 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08]">
              {([
                ['Aproximar', () => zoomIn({ duration: 200 }), 'M12 5v14M5 12h14'],
                ['Afastar', () => zoomOut({ duration: 200 }), 'M5 12h14'],
                ['Enquadrar tudo', () => fitView({ duration: 300, padding: 0.15 }), 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4'],
              ] as const).map(([rot, fn, d]) => (
                <button key={rot} onClick={fn} title={rot}
                  className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.07]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                </button>
              ))}
            </div>
          </Panel>
          <MiniMap pannable zoomable
            className="!bg-[#18181c]/80 !rounded-xl !border !border-white/[0.08] overflow-hidden"
            maskColor="rgba(0,0,0,0.55)" />
        </ReactFlow>
      </div>

      {org.avisos.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-2 space-y-1 max-h-24 overflow-y-auto">
          {org.avisos.map((av, i) => (
            <p key={i} className="text-[11.5px] text-amber-300/80 leading-snug">{av}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrganizacaoPage() {
  return <ReactFlowProvider><Tela /></ReactFlowProvider>
}
