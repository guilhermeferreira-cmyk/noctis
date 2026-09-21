import { useEffect, useRef } from 'react'
import { CEU } from '../lib/kinds'

/**
 * O fundo do canvas: constelação e nebulosas, com parallax invertido.
 *
 * O campo é desenhado num `<canvas>` só, em três profundidades. Ao mover o
 * mouse, cada camada desliza no sentido CONTRÁRIO ao do cursor, e quanto mais
 * "perto" a camada, mais ela anda — é o que dá a sensação de o olhar atravessar
 * o campo, em vez de o campo seguir o ponteiro.
 *
 * Decisões de custo, porque isto vive atrás de um canvas que já é pesado:
 *   · uma tela só, não uma camada de DOM por profundidade;
 *   · as estrelas nascem uma vez e ficam guardadas — a cada quadro só muda o
 *     deslocamento, nunca as posições;
 *   · o desenho é agendado por `requestAnimationFrame` e um quadro pendente não
 *     enfileira outro, então mexer o mouse depressa não acumula trabalho;
 *   · o campo é gerado maior que a tela (a margem `FOLGA`), senão o parallax
 *     descobriria a borda e apareceria uma faixa vazia.
 *
 * Quem pediu menos movimento no sistema (`prefers-reduced-motion`) recebe o
 * campo parado: as estrelas continuam lá, o parallax não.
 */

type Estrela = { x: number; y: number; r: number; a: number; camada: number }
type Nebulosa = { x: number; y: number; r: number; cor: string; camada: number }
/** Par de pontos vizinhos o bastante para merecer um fio, com a opacidade já
 *  resolvida na geração — a malha vive numa profundidade só, então a distância
 *  entre dois pontos nunca muda e não precisa ser recalculada por quadro. */
type Fio = { a: number; b: number; alfa: number }
const ALCANCE = 132
/** Teto de pontos da malha. Ligar todos com todos é O(n²): com 900 pontos, a
 *  geração passaria de um milhão de comparações e travaria a tela. */
const MALHA_MAX = 240

/** Byte de alfa em hex, para montar cores no formato #rrggbbaa. */
const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')

// As três profundidades. `parte` é a fatia do total de estrelas que cabe a cada
// uma, e `fator` o quanto ela anda em relação à amplitude escolhida.
const CAMADAS = [
  { fator: 0.11, parte: 0.60, raio: [0.4, 0.9] },
  { fator: 0.29, parte: 0.29, raio: [0.7, 1.5] },
  { fator: 0.61, parte: 0.11, raio: [1.1, 2.2] },
]
const FOLGA = 140

/**
 * O arrasto da tela, avisado de fora.
 *
 * O ReactFlow move a viewport dezenas de vezes por segundo. Guardar isso em
 * estado React redesenharia a página inteira a cada quadro do arrasto, então o
 * valor vive aqui fora e o fundo é avisado por chamada direta — nenhum
 * componente re-renderiza por causa do pan.
 */
const ouvintes = new Set<(x: number, y: number) => void>()
export function moverPanorama(x: number, y: number) {
  for (const f of ouvintes) f(x, y)
}

export function FundoEstrelado({ cores, cfg = CEU }: {
  /** Cores das nebulosas. Recebem as do vocabulário para o fundo pertencer ao mapa. */
  cores?: string[]
  /** Quantidade e movimento. Por padrão o que está salvo; a tela de aparência
   *  passa o rascunho para a prévia responder enquanto se arrasta a régua. */
  cfg?: typeof CEU
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const campo = useRef<{ estrelas: Estrela[]; nebulosas: Nebulosa[]; fios: Fio[]; w: number; h: number } | null>(null)
  const alvo = useRef({ x: 0, y: 0 })
  /** Contribuição do arrasto da tela, somada à do mouse. */
  const pan = useRef({ x: 0, y: 0 })
  const atual = useRef({ x: 0, y: 0 })
  const pendente = useRef(false)
  const refazer = useRef<null | (() => void)>(null)
  const coresRef = useRef(cores)
  coresRef.current = cores
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const gerar = (w: number, h: number) => {
      const rnd = (a: number, b: number) => a + Math.random() * (b - a)
      const estrelas: Estrela[] = []
      const fios: Fio[] = []
      const total = cfgRef.current.estrelas
      if (cfgRef.current.estilo === 'malha') {
        // Uma profundidade só: os fios têm de manter o comprimento, e camadas
        // com fatores diferentes esticariam cada linha a cada quadro.
        const n = Math.min(total, MALHA_MAX)
        for (let i = 0; i < n; i++) {
          estrelas.push({
            x: rnd(-FOLGA, w + FOLGA), y: rnd(-FOLGA, h + FOLGA),
            r: rnd(1, 1.9), a: rnd(0.4, 0.9), camada: 1,
          })
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = estrelas[i].x - estrelas[j].x, dy = estrelas[i].y - estrelas[j].y
            const d = Math.hypot(dx, dy)
            if (d < ALCANCE) fios.push({ a: i, b: j, alfa: (1 - d / ALCANCE) * 0.22 })
          }
        }
      } else {
        CAMADAS.forEach((c, i) => {
          for (let n = 0; n < Math.round(total * c.parte); n++) {
            estrelas.push({
              x: rnd(-FOLGA, w + FOLGA), y: rnd(-FOLGA, h + FOLGA),
              r: rnd(c.raio[0], c.raio[1]), a: rnd(0.25, 0.9), camada: i,
            })
          }
        })
      }
      const paleta = coresRef.current?.length ? coresRef.current : ['#3b82f6', '#8b5cf6', '#06b6d4']
      const nebulosas: Nebulosa[] = []
      for (let n = 0; n < cfgRef.current.nebulosas; n++) {
        nebulosas.push({
          x: rnd(0, w), y: rnd(0, h), r: rnd(Math.max(w, h) * 0.22, Math.max(w, h) * 0.45),
          cor: paleta[n % paleta.length], camada: n % CAMADAS.length,
        })
      }
      campo.current = { estrelas, nebulosas, fios, w, h }
    }

    const desenhar = () => {
      pendente.current = false
      const c = campo.current
      if (!c) return
      // Aproximação suave: o campo persegue o alvo, então parar o mouse não trava
      // o movimento de repente.
      atual.current.x += (alvo.current.x - atual.current.x) * 0.08
      atual.current.y += (alvo.current.y - atual.current.y) * 0.08
      // O mouse empurra o campo ao contrário; o arrasto o leva JUNTO, só que
      // devagar. É a diferença entre olhar de lado e caminhar: no pan, o céu faz
      // parte da cena e ficar para trás é o que dá a profundidade.
      const px = atual.current.x + pan.current.x
      const py = atual.current.y + pan.current.y

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, c.w, c.h)

      // Nebulosas primeiro: são o fundo do fundo.
      ctx.globalCompositeOperation = 'lighter'
      // A deriva é um vagar próprio, lento e em círculo, com fase por nebulosa
      // para nenhuma acompanhar a outra. Em 0 o céu só se mexe com o mouse — e
      // aí o desenho para de vez quando o campo alcança o alvo.
      const d = cfgRef.current.deriva
      const t = d > 0 ? performance.now() / 1000 : 0
      const opN = cfgRef.current.opacidadeNebulosa / 100
      for (const n of c.nebulosas) {
        const f = CAMADAS[n.camada].fator * (cfgRef.current.movNebulosa / 100)
        // A fase precisa ser um número pequeno: `n.x + n.y` chega à casa dos
        // milhares e o cosseno disso, somado a um t que anda devagar, mal saía
        // do lugar — era por isso que a deriva parecia não existir. Aqui ela
        // completa uma volta em cerca de 25 segundos.
        const fase = (n.x + n.y) * 0.002
        const dx = d > 0 ? Math.cos(t * 0.25 + fase) * d : 0
        const dy = d > 0 ? Math.sin(t * 0.31 + fase) * d : 0
        const x = n.x + px * f + dx, y = n.y + py * f + dy
        const g = ctx.createRadialGradient(x, y, 0, x, y, n.r)
        g.addColorStop(0, n.cor + hex(0x22 * opN))
        g.addColorStop(0.55, n.cor + hex(0x0b * opN))
        g.addColorStop(1, n.cor + '00')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, n.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // Os fios primeiro, para os pontos ficarem por cima das junções.
      const op = cfgRef.current.opacidade / 100
      if (c.fios.length) {
        const f = CAMADAS[1].fator
        ctx.lineWidth = 1
        for (const fio of c.fios) {
          const a = c.estrelas[fio.a], b = c.estrelas[fio.b]
          ctx.strokeStyle = `rgba(147,197,253,${Math.min(1, fio.alfa * op)})`
          ctx.beginPath()
          ctx.moveTo(a.x + px * f, a.y + py * f)
          ctx.lineTo(b.x + px * f, b.y + py * f)
          ctx.stroke()
        }
      }

      for (const e of c.estrelas) {
        const f = CAMADAS[e.camada].fator
        ctx.globalAlpha = Math.min(1, e.a * op)
        ctx.fillStyle = '#dbeafe'
        ctx.beginPath()
        ctx.arc(e.x + px * f, e.y + py * f, e.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Continua enquanto não tiver alcançado o alvo — ou para sempre, se as
      // nebulosas estiverem vagando.
      if (d > 0
        || Math.abs(alvo.current.x - atual.current.x) > 0.3
        || Math.abs(alvo.current.y - atual.current.y) > 0.3) {
        agendar()
      }
    }

    const agendar = () => {
      if (pendente.current) return
      pendente.current = true
      requestAnimationFrame(desenhar)
    }

    const medir = () => {
      const pai = cv.parentElement
      if (!pai) return
      const w = pai.clientWidth, h = pai.clientHeight
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      cv.style.width = w + 'px'; cv.style.height = h + 'px'
      gerar(w, h)
      agendar()
    }

    const onMove = (ev: MouseEvent) => {
      if (parado) return
      const c = campo.current
      if (!c) return
      // O sinal negativo é a regra: o campo anda ao contrário do cursor.
      const amp = cfgRef.current.movimento
      alvo.current.x = -((ev.clientX / window.innerWidth) - 0.5) * 2 * amp
      alvo.current.y = -((ev.clientY / window.innerHeight) - 0.5) * 2 * amp
      agendar()
    }

    // O arrasto entra numa fração do movimento escolhido: mover a tela mil
    // pixels não pode arrastar o céu junto na mesma medida.
    const onPan = (x: number, y: number) => {
      if (parado) return
      const k = cfgRef.current.movimento / 90
      pan.current.x = x * 0.35 * k
      pan.current.y = y * 0.35 * k
      agendar()
    }
    ouvintes.add(onPan)

    medir()
    const ro = new ResizeObserver(medir)
    if (cv.parentElement) ro.observe(cv.parentElement)
    window.addEventListener('mousemove', onMove)
    refazer.current = medir
    return () => { ro.disconnect(); ouvintes.delete(onPan); window.removeEventListener('mousemove', onMove); refazer.current = null }
  }, [])

  // Quantidade mudou: o campo precisa nascer de novo. Amplitude e deriva não —
  // essas são lidas a cada quadro.
  useEffect(() => {
    refazer.current?.()
  }, [cfg.estrelas, cfg.nebulosas, cfg.estilo, cores?.join(',')])

  return (
    <canvas ref={ref} aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 0 }} />
  )
}
