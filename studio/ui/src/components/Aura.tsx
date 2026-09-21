import { AURA } from '../lib/kinds'

/**
 * A aura do card: um borrão de cor por trás dele, contando com quem ele fala.
 *
 * A leitura é posicional e sempre a mesma:
 *   esquerda — as cores de quem CHEGA nele (as entradas)
 *   centro   — a cor dele mesmo
 *   direita  — as cores de para onde ele SAI
 *
 * Só entram cores que já existem no vocabulário do mapa (tipos de card e lanes
 * ativas): a aura não inventa cor nenhuma, só repete as que já estão em cena, e
 * cores repetidas de vários vizinhos contam uma vez só.
 *
 * Ela vive FORA do card, atrás e sangrando pelas bordas, nunca sob o texto: o
 * corpo do card é opaco e fica por cima. Por isso é exclusiva do mapa e do
 * cosmos — no grid de memórias os cards se encostam e o borrão de um invadiria
 * o vizinho.
 */
export function Aura({ entrada, propria, saida, intensidade = 1, escala = 1 }: {
  entrada: string[]
  propria: string
  saida: string[]
  /** 0 apaga; 1 é o padrão discreto. */
  intensidade?: number
  /** Multiplica difusão e tamanho. A lane é grande e pede aura mais aberta. */
  escala?: number
}) {
  const camadas: string[] = []

  // Cada lado distribui suas cores na vertical, para duas entradas não virarem
  // uma mancha só. `transparent 72%` é o que mantém o miolo do card limpo.
  const lado = (cores: string[], x: number) => {
    const n = cores.length
    cores.forEach((c, i) => {
      const y = n === 1 ? 50 : 22 + (i * 56) / (n - 1)
      camadas.push(`radial-gradient(38% 46% at ${x}% ${y}%, ${c}, transparent 72%)`)
    })
  }

  lado(entrada, 2)
  lado(saida, 98)
  camadas.push(`radial-gradient(52% 60% at 50% 50%, ${propria}, transparent 70%)`)

  const solto = entrada.length + saida.length
  // Quanto mais vizinhos, mais o borrão pesa; o teto impede que um card muito
  // ligado vire um farol no meio do mapa.
  const opacidade = Math.min(0.34, 0.16 + solto * 0.035) * intensidade

  // Difusão e tamanho vêm da tela de aparência; tamanho 0 encosta a aura na
  // borda e difusão 0 a deixa dura, que é uma escolha legítima.
  const tamanho = AURA.tamanho * escala
  return (
    <div
      aria-hidden="true"
      className="aura pointer-events-none absolute -z-10"
      style={{
        inset: -tamanho,
        borderRadius: tamanho + 12,
        backgroundImage: camadas.join(', '),
        filter: `blur(${AURA.difusao * escala}px)`,
        // A opacidade vai numa variável: o hover a multiplica no CSS, que não
        // tem como ler um valor inline. `opacity` sozinha não bastaria.
        ['--aura-op' as string]: opacidade,
        opacity: 'var(--aura-op)',
      }}
    />
  )
}

/**
 * As cores que cercam cada nó, olhando as arestas.
 *
 * Devolve, por id: as cores distintas de quem entra e de quem sai. Deriva das
 * arestas e das cores dos nós — não há estado paralelo para desencontrar.
 */
export function auraPorNo(
  edges: { source: string; target: string }[],
  corDe: (id: string) => string | undefined,
) {
  const mapa = new Map<string, { entrada: string[]; saida: string[] }>()
  const em = (id: string) => {
    let v = mapa.get(id)
    if (!v) { v = { entrada: [], saida: [] }; mapa.set(id, v) }
    return v
  }
  for (const e of edges) {
    if (!e.source || !e.target || e.source === e.target) continue
    const cs = corDe(e.source), ct = corDe(e.target)
    if (ct && !em(e.source).saida.includes(ct)) em(e.source).saida.push(ct)
    if (cs && !em(e.target).entrada.includes(cs)) em(e.target).entrada.push(cs)
  }
  return mapa
}
