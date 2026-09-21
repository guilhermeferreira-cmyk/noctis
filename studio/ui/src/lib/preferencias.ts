import { useSyncExternalStore } from 'react'

/**
 * Preferências de interface — como a tela se arruma para quem está olhando.
 *
 * Diferente das regras (que são do sistema e valem para os agentes) e da
 * aparência (que é do servidor e vale em qualquer máquina), isto é do NAVEGADOR:
 * esconder a barra de status numa tela pequena não deveria esconder na outra.
 *
 * Uma loja mínima em cima do localStorage. `usePreferencias` re-renderiza quem a
 * usa quando algo muda — inclusive em outra aba do navegador.
 */
export type Preferencias = {
  mostrarFaixa: boolean
  mostrarCabecalhoAba: boolean
  mostrarBarraStatus: boolean
  /** Seções escondidas da faixa de ícones. */
  secoesOcultas: string[]
  restaurarAbas: boolean
  painelDireitoInicial: 'nocturn' | 'contexto'
  /** Zoom da interface inteira, em %. */
  zoom: number
  /** De quanto em quanto tempo o NOCTURN refaz a ronda, em segundos. */
  intervaloRonda: number
}

export const PADRAO: Preferencias = {
  mostrarFaixa: true,
  mostrarCabecalhoAba: true,
  mostrarBarraStatus: true,
  secoesOcultas: [],
  restaurarAbas: true,
  painelDireitoInicial: 'nocturn',
  zoom: 100,
  intervaloRonda: 60,
}

const CHAVE = 'noctis.preferencias'
const ouvintes = new Set<() => void>()
let cache: Preferencias | null = null

function ler(): Preferencias {
  if (cache) return cache
  try { cache = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') } }
  catch { cache = { ...PADRAO } }
  return cache!
}

export function preferencias(): Preferencias { return ler() }

export function definirPreferencia<K extends keyof Preferencias>(k: K, v: Preferencias[K]) {
  cache = { ...ler(), [k]: v }
  try { localStorage.setItem(CHAVE, JSON.stringify(cache)) } catch { /* sem storage */ }
  ouvintes.forEach(f => f())
}

export function restaurarPreferencias() {
  cache = { ...PADRAO }
  try { localStorage.removeItem(CHAVE) } catch { /* sem storage */ }
  ouvintes.forEach(f => f())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === CHAVE) { cache = null; ouvintes.forEach(f => f()) }
  })
}

export function usePreferencias(): Preferencias {
  return useSyncExternalStore(
    f => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    ler, ler)
}
