import { useEffect, useState } from 'react'

/**
 * O repositório de orbs — avatares de verdade, no lugar do ícone.
 *
 * São 305 imagens quadradas de fundo transparente, servidas de `public/orbs/`.
 * **Elas não entram no bundle**: ficam como arquivo estático e só a que aparece
 * na tela é buscada. Empacotá-las custaria 3,9 MB na entrada de um app cuja
 * entrada inteira tem 479 kB.
 *
 * O índice é buscado UMA vez, e só quando alguém abre o seletor — quem nunca
 * escolhe uma orb nunca paga por ele. É o mesmo desenho do set completo de
 * ícones, pela mesma razão.
 */

export type Orb = { id: string; arquivo: string; cor: string; familia: string }

let indice: Orb[] | null = null
let buscando: Promise<Orb[]> | null = null
const ouvintes = new Set<() => void>()

export function carregarOrbs(): Promise<Orb[]> {
  if (indice) return Promise.resolve(indice)
  if (!buscando) {
    buscando = fetch('/orbs/index.json')
      .then(r => r.json())
      .then((lista: Orb[]) => {
        indice = lista
        ouvintes.forEach(f => f())
        return lista
      })
      .catch(() => { indice = []; return [] })
  }
  return buscando
}

/** As orbs que já chegaram. Lista vazia enquanto o índice não veio. */
export const orbs = (): Orb[] => indice || []

/** As famílias de cor presentes, na ordem em que mais aparecem. */
export function familias(): string[] {
  const conta = new Map<string, number>()
  for (const o of orbs()) conta.set(o.familia, (conta.get(o.familia) || 0) + 1)
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
}

/** Busca o índice ao montar e re-renderiza quando ele chega. */
export function useOrbs(): Orb[] {
  const [, setV] = useState(0)
  useEffect(() => {
    const avisar = () => setV(v => v + 1)
    ouvintes.add(avisar)
    carregarOrbs().then(avisar)
    return () => { ouvintes.delete(avisar) }
  }, [])
  return orbs()
}
