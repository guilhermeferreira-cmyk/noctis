import { LogoNoctis } from './LogoNoctis'

/**
 * Esqueletos — a forma do que está vindo, enquanto vem.
 *
 * "carregando…" conta que algo acontece; o esqueleto conta O QUE vai aparecer,
 * e no lugar em que vai aparecer. Numa tela que lê arquivo, roda ronda e mede
 * XP, a diferença é grande: a grade não pula quando os cards chegam, e a lane
 * não nasce do nada no meio do canvas.
 *
 * Três regras que valem para todos eles:
 *
 * 1. **Mesma medida do conteúdo real.** O esqueleto de um card de recurso tem a
 *    altura de um card de recurso. Se ele mentir a medida, a tela salta — que é
 *    justamente o que o esqueleto existe para evitar.
 * 2. **Sem número inventado.** Nada de "12 cards" quando o projeto tem 2: a
 *    quantidade vem de quem chama, que sabe o que espera.
 * 3. **Quieto.** O brilho é lento e de baixo contraste, e some inteiro para
 *    quem pediu menos movimento no sistema — ver `.esqueleto` no index.css.
 */

/** O tijolo: um retângulo com o brilho passando. */
export function Bloco({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={`esqueleto rounded-md ${className}`} style={style} />
}

/** Linhas de texto — a última mais curta, como um parágrafo de verdade. */
export function EsqueletoLinhas({ linhas = 3, className = '' }: { linhas?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <Bloco key={i} className="h-3" style={{ width: i === linhas - 1 ? '62%' : '100%' }} />
      ))}
    </div>
  )
}

/** Um card da grade: ícone, título, tags e três linhas de descrição. */
export function EsqueletoCard() {
  return (
    <div className="rounded-xl border border-white/[0.06] caixa-vidro bg-[#151515] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <Bloco className="w-11 h-11 rounded-lg shrink-0" />
        <Bloco className="h-3.5 flex-1" style={{ maxWidth: '60%' }} />
      </div>
      <div className="flex gap-1.5">
        <Bloco className="h-4 w-14 rounded-full" />
        <Bloco className="h-4 w-12 rounded-full" />
      </div>
      <EsqueletoLinhas linhas={3} />
      <Bloco className="h-2.5 w-24" />
    </div>
  )
}

/** A grade de recursos. `quantos` vem de quem chama — ninguém inventa número. */
export function EsqueletoGrade({ quantos = 6 }: { quantos?: number }) {
  return (
    <div className="grid gap-3.5" role="status" aria-label="carregando"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {Array.from({ length: quantos }).map((_, i) => <EsqueletoCard key={i} />)}
    </div>
  )
}

/** Um canvas: duas lanes com cards dentro, na proporção em que eles nascem. */
export function EsqueletoCanvas() {
  return (
    <div className="absolute inset-0 p-10 flex gap-10 overflow-hidden" role="status" aria-label="carregando">
      {[0, 1].map(c => (
        <div key={c} className="w-[320px] shrink-0 rounded-2xl border border-white/[0.05] p-4 space-y-3"
          style={{ height: c === 0 ? '62%' : '44%' }}>
          <Bloco className="h-3.5 w-32" />
          {Array.from({ length: c === 0 ? 3 : 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.05] p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <Bloco className="w-7 h-7 rounded-md shrink-0" />
                <Bloco className="h-3 flex-1" style={{ maxWidth: '55%' }} />
              </div>
              <EsqueletoLinhas linhas={2} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Um painel da doca: título curto e alguns blocos. */
export function EsqueletoPainel({ itens = 3 }: { itens?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="carregando">
      {Array.from({ length: itens }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Bloco className="h-2.5 w-20" />
          <Bloco className="h-8" />
        </div>
      ))}
    </div>
  )
}

/**
 * O sol do Noctis, de espera — para as telas grandes, no lugar do esqueleto.
 *
 * Uma grade inteira de cards fingindo ser cards, ou um canvas inteiro fingindo
 * ser lanes, é ruído quando a tela é grande: o olho tenta ler forma onde não
 * há nada para ler ainda. Aqui a marca do sistema ocupa o centro, grande,
 * num tom só um degrau acima do chão — visível o bastante para dizer "isto
 * está vivo", discreta o bastante para não competir com o que vem depois dela.
 *
 * Reservado para o carregamento de UMA TELA INTEIRA — uma grade completa, um
 * canvas completo. Um valor solto no meio de um painel estreito da doca
 * continua sendo um `Bloco`/`EsqueletoLinhas`: o sol não cabe ali, e não devia.
 */
export function CarregandoNoctis({ tamanho = 220 }: { tamanho?: number }) {
  return (
    <div className="w-full h-full grid place-items-center" role="status" aria-label="carregando">
      <LogoNoctis size={tamanho} cor="#1e1e22" className="esqueleto-sol" />
    </div>
  )
}
