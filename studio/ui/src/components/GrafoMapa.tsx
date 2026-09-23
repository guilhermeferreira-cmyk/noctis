import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KIND_META, TIPO_META, PONTILHADO } from '../lib/kinds'
import type { ResourceKind } from '../api'

/** O kind chega como string do canvas; aqui ele é só uma chave de consulta. */
const meta = (k: string) => KIND_META[k as ResourceKind]

/**
 * O mapa visto como GRAFO — a outra leitura do mesmo material.
 *
 * O canvas mostra o ARRANJO: onde você pôs cada coisa, e o que isso quer dizer.
 * O grafo mostra a ESTRUTURA: o que está ligado a quê, quem é o centro, o que
 * ficou solto na beira. São perguntas diferentes sobre os mesmos nós, e por isso
 * ele não substitui o canvas — convive com ele, num botão.
 *
 * A simulação é escrita aqui, à mão, em vez de trazer uma biblioteca:
 *
 *   · repulsão entre todos os pares (o que espalha)
 *   · mola em cada ligação (o que aproxima quem se conhece)
 *   · gravidade fraca ao centro (o que impede a fuga para o infinito)
 *   · atrito, que faz tudo parar em vez de vibrar para sempre
 *
 * Com uma centena de nós isso roda liso, e evita uma dependência nova só para
 * fazer quatro contas. Os quatro painéis — Filtros, Grupos, Tela e Forças —
 * mexem exatamente nesses números, porque um grafo sem controle de força é um
 * emaranhado de cabelo.
 */

export type NoGrafo = {
  id: string
  label: string
  kind: string
  tipo?: string
  cor?: string
  tags?: string[]
  lane?: string
}
export type LigacaoGrafo = { source: string; target: string; auto?: boolean }

type Ponto = { x: number; y: number; vx: number; vy: number; fixo?: boolean }

// O padrão é espaçado de propósito: o grafo existe para ser LIDO, e rótulo
// encavalado não se lê. Repulsão alta, mola longa e gravidade fraca abrem o
// desenho; e a inércia BAIXA é o que mantém o grafo quieto — o nó anda para
// onde a força manda e para ali, em vez de deslizar sozinho depois do gesto.
const FORCAS_PADRAO = {
  repulsao: 4200,      // o quanto um nó empurra o outro
  ligacao: 190,        // a distância que a mola procura
  forcaLigacao: 0.022, // o quanto ela puxa
  centro: 0.004,       // a gravidade para o meio
  atrito: 0.35,        // quanto da velocidade sobrevive a cada quadro
  colisao: 130,        // o espaço mínimo entre dois nós, para o rótulo caber
}
const TELA_PADRAO = {
  rotulos: true,
  rotuloAte: 0.28,     // abaixo deste zoom, os rótulos somem
  tamanhoPorGrau: true,
  raio: 6,
  espessura: 1,
}

/** Um ajuste que sobrevive ao fechar a aba.
 *
 * As forças e a aparência do grafo são um jeito de LER — quem achou a distância
 * que enxerga não deveria reencontrá-la toda vez que abre um mapa. Fica no
 * navegador, como as outras preferências de interface: é do olho de quem olha,
 * não do projeto. Um valor guardado é mesclado sobre o padrão, então um ajuste
 * novo que eu adicione aqui depois entra com o padrão em vez de vir vazio.
 */
function useGuardado<T extends object>(chave: string, padrao: T) {
  const [v, setV] = useState<T>(() => {
    try { return { ...padrao, ...JSON.parse(localStorage.getItem(chave) || '{}') } }
    catch { return padrao }
  })
  useEffect(() => {
    try { localStorage.setItem(chave, JSON.stringify(v)) } catch { /* sem storage */ }
  }, [chave, v])
  return [v, setV] as const
}

export function GrafoMapa({ nos, ligacoes, onAbrir, titulo }: {
  nos: NoGrafo[]
  ligacoes: LigacaoGrafo[]
  onAbrir?: (id: string) => void
  titulo?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const pontos = useRef<Map<string, Ponto>>(new Map())
  const [, repintar] = useState(0)
  const [vista, setVista] = useState({ x: 0, y: 0, k: 1 })
  const [sobre, setSobre] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  // A simulação dorme por padrão; um gesto seu a acorda por alguns quadros.
  const [acordar, setAcordar] = useState(0)

  const [forcas, setForcas] = useGuardado('noctis.grafo.forcas', FORCAS_PADRAO)
  const [tela, setTela] = useGuardado('noctis.grafo.tela', TELA_PADRAO)
  const [busca, setBusca] = useState('')
  const [kindsOff, setKindsOff] = useState<string[]>([])
  const [semLigacao, setSemLigacao] = useState(true)
  const [mostrarAuto, setMostrarAuto] = useState(true)
  const [grupo, setGrupo] = useState<'kind' | 'tipo' | 'lane' | 'tag'>('kind')
  const [aberto, setAberto] = useState<string>('Forças')

  // ── o conjunto que está em cena ───────────────────────────────────────────
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let lista = nos.filter(n => !kindsOff.includes(n.kind))
    if (q) lista = lista.filter(n => (n.label + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q))
    const ids = new Set(lista.map(n => n.id))
    const ligs = ligacoes.filter(l => ids.has(l.source) && ids.has(l.target)
      && (mostrarAuto || !l.auto))
    if (!semLigacao) {
      const ligados = new Set<string>()
      for (const l of ligs) { ligados.add(l.source); ligados.add(l.target) }
      lista = lista.filter(n => ligados.has(n.id))
    }
    return { nos: lista, ligacoes: ligs }
  }, [nos, ligacoes, busca, kindsOff, semLigacao, mostrarAuto])

  const grau = useMemo(() => {
    const g = new Map<string, number>()
    for (const l of visiveis.ligacoes) {
      g.set(l.source, (g.get(l.source) || 0) + 1)
      g.set(l.target, (g.get(l.target) || 0) + 1)
    }
    return g
  }, [visiveis])

  const vizinhos = useMemo(() => {
    const v = new Map<string, Set<string>>()
    for (const l of visiveis.ligacoes) {
      if (!v.has(l.source)) v.set(l.source, new Set())
      if (!v.has(l.target)) v.set(l.target, new Set())
      v.get(l.source)!.add(l.target)
      v.get(l.target)!.add(l.source)
    }
    return v
  }, [visiveis])

  // ── a cor, conforme o agrupamento escolhido ───────────────────────────────
  const corDe = useCallback((n: NoGrafo) => {
    if (grupo === 'kind') return meta(n.kind)?.color || n.cor || '#9ca3af'
    if (grupo === 'tipo') return TIPO_META[n.tipo || '']?.color || '#6b7280'
    if (grupo === 'lane') {
      if (!n.lane) return '#52525b'
      let h = 0
      for (const c of n.lane) h = (h * 31 + c.charCodeAt(0)) % 360
      return `hsl(${h} 65% 60%)`
    }
    const t = (n.tags || [])[0]
    if (!t) return '#52525b'
    let h = 0
    for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360
    return `hsl(${h} 60% 62%)`
  }, [grupo])

  // ── a simulação ───────────────────────────────────────────────────────────
  useEffect(() => {
    const p = pontos.current
    // Quem entra nasce numa espiral de ângulo áureo, DETERMINÍSTICA: mesma
    // entrada, mesmo desenho. Sorteio na posição inicial fazia o grafo sair
    // diferente a cada abertura, e um mapa que muda sozinho não se aprende.
    visiveis.nos.forEach((n, i) => {
      if (!p.has(n.id)) {
        const a = i * 2.39996323      // ângulo áureo
        const r = 60 + 34 * Math.sqrt(i + 1)
        p.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 })
      }
    })
    for (const id of [...p.keys()]) if (!visiveis.nos.some(n => n.id === id)) p.delete(id)
  }, [visiveis])

  // Um passo da simulação. Separado do laço para poder rodar em rajada, fora
  // da tela, antes de mostrar qualquer coisa.
  const passo = useCallback(() => {
    const p = pontos.current
    const lista = visiveis.nos
    for (let i = 0; i < lista.length; i++) {
      const a = p.get(lista[i].id)
      if (!a) continue
      for (let j = i + 1; j < lista.length; j++) {
        const b = p.get(lista[j].id)
        if (!b) continue
        let dx = b.x - a.x, dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        // Dois nós no mesmo ponto: afasta num eixo fixo, em vez de sortear —
        // o desenho continua o mesmo a cada abertura.
        if (d2 < 1) { dx = 0.5; dy = 0.5; d2 = 0.5 }
        const d = Math.sqrt(d2)
        let f = forcas.repulsao / d2
        if (d < forcas.colisao) f += (forcas.colisao - d) * 0.9
        const fx = (dx / d) * f, fy = (dy / d) * f
        a.vx -= fx; a.vy -= fy
        b.vx += fx; b.vy += fy
      }
    }
    for (const l of visiveis.ligacoes) {
      const a = p.get(l.source), b = p.get(l.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const f = (d - forcas.ligacao) * forcas.forcaLigacao
      const fx = (dx / d) * f, fy = (dy / d) * f
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    let energia = 0
    for (const n of lista) {
      const a = p.get(n.id)
      if (!a) continue
      if (a.fixo) { a.vx = 0; a.vy = 0; continue }
      a.vx -= a.x * forcas.centro
      a.vy -= a.y * forcas.centro
      a.vx *= forcas.atrito; a.vy *= forcas.atrito
      a.x += a.vx; a.y += a.vy
      energia += Math.abs(a.vx) + Math.abs(a.vy)
    }
    return energia / Math.max(1, lista.length)
  }, [visiveis, forcas])

  // O grafo ABRE PARADO: a simulação roda em rajada, fora da tela, e só então
  // o primeiro quadro é pintado. Grafo que se acomoda na frente de quem está
  // lendo é o mesmo que texto que se reescreve sozinho.
  useEffect(() => {
    for (let i = 0; i < 600; i++) if (passo() < 0.05) break
    repintar(v => v + 1)
  }, [passo])

  // Só há animação quando VOCÊ mexe: arrastando um nó, ou logo depois de mudar
  // uma força. Fora isso, nada se move.
  useEffect(() => {
    if (!arrastando && !acordar) return
    let vivo = true
    let quadros = 0
    const laco = () => {
      if (!vivo) return
      const e = passo()
      repintar(v => v + 1)
      quadros++
      if (!arrastando && (e < 0.05 || quadros > 240)) return
      raf = requestAnimationFrame(laco)
    }
    let raf = requestAnimationFrame(laco)
    return () => { vivo = false; cancelAnimationFrame(raf) }
  }, [arrastando, acordar, passo])

  // ── pan, zoom e arraste ───────────────────────────────────────────────────
  const paraMundo = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (cx - r.left - r.width / 2 - vista.x) / vista.k,
             y: (cy - r.top - r.height / 2 - vista.y) / vista.k }
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const roda = (e: WheelEvent) => {
      e.preventDefault()
      setVista(v => ({ ...v, k: Math.max(0.15, Math.min(4, v.k * (e.deltaY < 0 ? 1.12 : 0.89))) }))
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [])

  useEffect(() => {
    if (!arrastando) return
    const mover = (e: MouseEvent) => {
      const m = paraMundo(e.clientX, e.clientY)
      const p = pontos.current.get(arrastando)
      if (p) { p.x = m.x; p.y = m.y; p.vx = 0; p.vy = 0 }
    }
    const soltar = () => {
      const p = pontos.current.get(arrastando)
      if (p) p.fixo = false
      setArrastando(null)
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar) }
  }, [arrastando]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrastar a tela: o gesto começa em qualquer lugar que NÃO seja um nó, e
  // continua no window — soltar o botão fora da caixa antes deixava o grafo
  // grudado no ponteiro. O pan é o gesto mais usado aqui: exigir acertar o
  // fundo exato entre as linhas era pedir pontaria para andar no mapa.
  const arrastarTela = useRef<{ x: number; y: number } | null>(null)
  const [panorando, setPanorando] = useState(false)

  useEffect(() => {
    if (!panorando) return
    const mover = (e: MouseEvent) => {
      const a = arrastarTela.current
      if (a) setVista(v => ({ ...v, x: e.clientX - a.x, y: e.clientY - a.y }))
    }
    const soltar = () => { arrastarTela.current = null; setPanorando(false) }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar) }
  }, [panorando])

  const kinds = useMemo(() => [...new Set(nos.map(n => n.kind))], [nos])

  const Secao = ({ nome, children }: { nome: string; children: React.ReactNode }) => (
    <div className="border-b border-white/[0.06] last:border-0">
      <button onClick={() => setAberto(a => a === nome ? '' : nome)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-gray-200 hover:text-white">
        <span className={`text-gray-600 transition-transform ${aberto === nome ? 'rotate-90' : ''}`}>›</span>
        {nome}
      </button>
      {aberto === nome && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )

  const Faixa = ({ rotulo, valor, min, max, passo = 1, onMudar }: {
    rotulo: string; valor: number; min: number; max: number; passo?: number
    onMudar: (v: number) => void
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-400 flex-1 truncate">{rotulo}</span>
      <input type="range" min={min} max={max} step={passo} value={valor}
        onChange={e => onMudar(Number(e.target.value))} className="w-28 accent-violet-500" />
    </div>
  )

  return (
    <div ref={box}
      className={`relative w-full h-full overflow-hidden select-none ${panorando ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={e => {
        // Nó e painel têm dono; o resto — fundo, pontilhado, linhas — é tela.
        const alvo = e.target as Element
        if (alvo.closest('[data-no]') || alvo.closest('[data-painel]')) return
        arrastarTela.current = { x: e.clientX - vista.x, y: e.clientY - vista.y }
        setPanorando(true)
      }}>

      <svg className="absolute inset-0 w-full h-full">
        {PONTILHADO.ativo && (
          <>
            <defs>
              <pattern id="gpontos" width={PONTILHADO.espaco} height={PONTILHADO.espaco} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={PONTILHADO.tamanho} fill={PONTILHADO.cor}
                  opacity={PONTILHADO.opacidade / 100} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gpontos)" />
          </>
        )}
        <g transform={`translate(${(box.current?.clientWidth || 0) / 2 + vista.x}, ${(box.current?.clientHeight || 0) / 2 + vista.y}) scale(${vista.k})`}>
          {visiveis.ligacoes.map((l, i) => {
            const a = pontos.current.get(l.source), b = pontos.current.get(l.target)
            if (!a || !b) return null
            const perto = sobre && (l.source === sobre || l.target === sobre)
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={perto ? '#c4b5fd' : '#ffffff'}
                strokeOpacity={sobre ? (perto ? 0.55 : 0.06) : (l.auto ? 0.1 : 0.18)}
                strokeWidth={tela.espessura} strokeDasharray={l.auto ? '3 3' : undefined} />
            )
          })}
          {visiveis.nos.map(n => {
            const p = pontos.current.get(n.id)
            if (!p) return null
            const g = grau.get(n.id) || 0
            const r = tela.tamanhoPorGrau ? tela.raio + Math.min(14, Math.sqrt(g) * 3) : tela.raio + 2
            const vizinho = sobre ? (sobre === n.id || vizinhos.get(sobre)?.has(n.id)) : true
            return (
              <g key={n.id} data-no={n.id} transform={`translate(${p.x}, ${p.y})`}
                onMouseEnter={() => setSobre(n.id)} onMouseLeave={() => setSobre(null)}
                onMouseDown={e => { e.stopPropagation()
                  const pt = pontos.current.get(n.id); if (pt) pt.fixo = true
                  setArrastando(n.id); setAcordar(a => a + 1) }}
                onDoubleClick={() => onAbrir?.(n.id)}
                className="cursor-pointer">
                <circle r={r} fill={corDe(n)} fillOpacity={vizinho ? 0.95 : 0.18}
                  stroke={sobre === n.id ? '#fff' : 'transparent'} strokeWidth={1.5} />
                {/* O rótulo vai INTEIRO: cortar nome é esconder justamente o que
                    o grafo existe para mostrar. O espaço para ele vem da força
                    de colisão, e o traço escuro por baixo o separa das linhas. */}
                {tela.rotulos && vista.k > tela.rotuloAte && (
                  <text y={r + 12} textAnchor="middle" fontSize={10.5}
                    fill={vizinho ? '#e4e4e7' : '#52525b'} className="pointer-events-none"
                    style={{ paintOrder: 'stroke', stroke: '#0b0b0d', strokeWidth: 3,
                             strokeLinejoin: 'round' }}>
                    {n.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Os quatro painéis do canto, como no grafo do Obsidian: o que aparece,
          como se agrupa, como se desenha, e com que força se organiza. */}
      <div data-painel className="absolute top-3 right-3 w-60 rounded-xl bg-[#18181c]/90 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40 text-gray-300">
        <Secao nome="Filtros">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar no grafo…"
            className="w-full bg-black/40 border border-white/[0.1] rounded-md px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500/60" />
          <div className="space-y-1">
            {kinds.map(k => (
              <label key={k} className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                <input type="checkbox" checked={!kindsOff.includes(k)}
                  onChange={e => setKindsOff(o => e.target.checked ? o.filter(x => x !== k) : [...o, k])}
                  className="accent-violet-600" />
                <span className="w-2 h-2 rounded-full" style={{ background: meta(k)?.color || '#888' }} />
                {meta(k)?.label || k}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input type="checkbox" checked={semLigacao} onChange={e => setSemLigacao(e.target.checked)}
              className="accent-violet-600" /> mostrar os soltos
          </label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input type="checkbox" checked={mostrarAuto} onChange={e => setMostrarAuto(e.target.checked)}
              className="accent-violet-600" /> ligações sugeridas
          </label>
        </Secao>

        <Secao nome="Grupos">
          <p className="text-[10.5px] text-gray-600 leading-snug">A cor do ponto sai daqui.</p>
          {([['kind', 'por tipo de recurso'], ['tipo', 'por tipo de memória'],
             ['lane', 'por lane'], ['tag', 'pela primeira tag']] as const).map(([id, rot]) => (
            <label key={id} className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
              <input type="radio" checked={grupo === id} onChange={() => setGrupo(id)}
                className="accent-violet-600" /> {rot}
            </label>
          ))}
        </Secao>

        <Secao nome="Tela">
          <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input type="checkbox" checked={tela.rotulos}
              onChange={e => setTela(t => ({ ...t, rotulos: e.target.checked }))}
              className="accent-violet-600" /> mostrar rótulos
          </label>
          <Faixa rotulo="rótulos a partir de" valor={tela.rotuloAte} min={0.2} max={1.5} passo={0.05}
            onMudar={v => setTela(t => ({ ...t, rotuloAte: v }))} />
          <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
            <input type="checkbox" checked={tela.tamanhoPorGrau}
              onChange={e => setTela(t => ({ ...t, tamanhoPorGrau: e.target.checked }))}
              className="accent-violet-600" /> tamanho pelo nº de ligações
          </label>
          <Faixa rotulo="tamanho do ponto" valor={tela.raio} min={2} max={14}
            onMudar={v => setTela(t => ({ ...t, raio: v }))} />
          <Faixa rotulo="espessura da linha" valor={tela.espessura} min={0.5} max={4} passo={0.5}
            onMudar={v => setTela(t => ({ ...t, espessura: v }))} />
        </Secao>

        <Secao nome="Forças">
          <Faixa rotulo="repulsão" valor={forcas.repulsao} min={100} max={8000} passo={50}
            onMudar={v => { setForcas(f => ({ ...f, repulsao: v })); setAcordar(a => a + 1) }} />
          <Faixa rotulo="distância da ligação" valor={forcas.ligacao} min={20} max={300} passo={5}
            onMudar={v => { setForcas(f => ({ ...f, ligacao: v })); setAcordar(a => a + 1) }} />
          <Faixa rotulo="força da ligação" valor={forcas.forcaLigacao} min={0.005} max={0.3} passo={0.005}
            onMudar={v => { setForcas(f => ({ ...f, forcaLigacao: v })); setAcordar(a => a + 1) }} />
          <Faixa rotulo="gravidade ao centro" valor={forcas.centro} min={0} max={0.08} passo={0.002}
            onMudar={v => { setForcas(f => ({ ...f, centro: v })); setAcordar(a => a + 1) }} />
          <Faixa rotulo="inércia" valor={forcas.atrito} min={0.1} max={0.95} passo={0.01}
            onMudar={v => { setForcas(f => ({ ...f, atrito: v })); setAcordar(a => a + 1) }} />
          <Faixa rotulo="espaço mínimo" valor={forcas.colisao} min={22} max={262} passo={4}
            onMudar={v => { setForcas(f => ({ ...f, colisao: v })); setAcordar(a => a + 1) }} />
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => { pontos.current.clear(); setAcordar(a => a + 1) }}
              title="Refazer o desenho do zero, com as forças atuais"
              className="text-[10.5px] text-gray-500 hover:text-gray-200">reorganizar</button>
          </div>
          <button onClick={() => { setForcas({ ...FORCAS_PADRAO }); setAcordar(a => a + 1) }}
            title="Descarta os seus ajustes e volta às forças de fábrica"
            className="text-[10.5px] text-gray-500 hover:text-gray-200">voltar ao padrão</button>
        </Secao>
      </div>

      {/* Zoom e enquadrar, na mesma linguagem do canvas */}
      <div data-painel className="absolute top-3 left-3 flex flex-col gap-0.5 rounded-xl p-1 bg-[#18181c]/80 backdrop-blur-xl border border-white/[0.08]">
        {([['Aproximar', () => setVista(v => ({ ...v, k: Math.min(4, v.k * 1.2) })), 'M12 5v14M5 12h14'],
           ['Afastar', () => setVista(v => ({ ...v, k: Math.max(0.15, v.k * 0.83) })), 'M5 12h14'],
           ['Centralizar', () => setVista({ x: 0, y: 0, k: 1 }), 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4']] as const)
          .map(([rot, fn, d]) => (
            <button key={rot} onClick={fn} title={rot}
              className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/[0.07]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            </button>
          ))}
      </div>

      <div className="absolute bottom-3 left-3 text-[11px] text-gray-500">
        {titulo ? `${titulo} · ` : ''}{visiveis.nos.length} nós · {visiveis.ligacoes.length} ligações
        {sobre && <span className="text-gray-300"> · {nos.find(n => n.id === sobre)?.label}</span>}
      </div>
    </div>
  )
}
