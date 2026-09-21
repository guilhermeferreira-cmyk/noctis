import { useSyncExternalStore } from 'react'
import type { ResourceKind } from '../api'

/**
 * A doca da direita — onde se abre o detalhe de qualquer coisa, sem tapar a tela.
 *
 * Antes cada página abria o próprio drawer por cima do conteúdo. Agora qualquer
 * canto do Noctis (grade, mapa, repertório) chama `abrirNaDoca` e o item vira
 * o conteúdo do botão Detalhe da doca, ao lado de Contexto e do NOCTURN. Um item
 * por vez: selecionar outro troca o que o botão mostra.
 */

export type ItemDoca =
  | { id: string; tipo: 'recurso'; kind: ResourceKind; nome: string }
  | { id: string; tipo: 'skill'; chave: string; nome: string }
  | { id: string; tipo: 'mapa'; mapa: string; nome: string; cards: number; lanes: number; cor: string; abrir: () => void }

export type AbaFixa = 'contexto' | 'nocturn' | 'detalhe'

type Estado = { itens: ItemDoca[]; ativa: string; pedido: number }

let estado: Estado = { itens: [], ativa: '', pedido: 0 }
const ouvintes = new Set<() => void>()
/** Quem abriu o item quer saber quando ele muda (para recarregar a grade, o mapa…). */
const aoMudar = new Map<string, () => void>()

function emitir(novo: Partial<Estado>) {
  estado = { ...estado, ...novo }
  ouvintes.forEach(f => f())
}

const idDe = (i: { tipo: 'recurso'; kind: ResourceKind; nome: string } | { tipo: 'skill'; chave: string }) =>
  i.tipo === 'recurso' ? `r:${i.kind}:${i.nome}` : `s:${i.chave}`

export function abrirRecursoNaDoca(kind: ResourceKind, nome: string, onMudou?: () => void) {
  abrir({ tipo: 'recurso', kind, nome, id: idDe({ tipo: 'recurso', kind, nome }) }, onMudou)
}
export function abrirSkillNaDoca(chave: string, nome: string, onMudou?: () => void) {
  abrir({ tipo: 'skill', chave, nome, id: idDe({ tipo: 'skill', chave }) }, onMudou)
}

export function abrirMapaNaDoca(mapa: string, nome: string,
  info: { cards: number; lanes: number; cor: string }, abrirMapa: () => void) {
  abrir({ tipo: 'mapa', mapa, nome, id: `m:${mapa}`, ...info, abrir: abrirMapa })
}

function abrir(item: ItemDoca, onMudou?: () => void) {
  aoMudar.clear()
  if (onMudou) aoMudar.set(item.id, onMudou)
  const itens = [item]
  // `pedido` sobe a cada abertura: é o sinal para o App mostrar a doca se estiver fechada.
  emitir({ itens, ativa: 'detalhe', pedido: estado.pedido + 1 })
}

export function focarNaDoca(id: string) { emitir({ ativa: id }) }

export function fecharNaDoca(id: string) {
  const idx = estado.itens.findIndex(i => i.id === id)
  if (idx < 0) return
  aoMudar.delete(id)
  const itens = estado.itens.filter(i => i.id !== id)
  const ativa = estado.ativa === 'detalhe' ? 'contexto' : estado.ativa
  emitir({ itens, ativa })
}

/** O recurso foi renomeado ou apagado em outro lugar: a aba acompanha. */
export function recursoRenomeado(kind: ResourceKind, de: string, para: string | null) {
  const id = idDe({ tipo: 'recurso', kind, nome: de })
  if (!estado.itens.some(i => i.id === id)) return
  if (para === null) { fecharNaDoca(id); return }
  const novoId = idDe({ tipo: 'recurso', kind, nome: para })
  const cb = aoMudar.get(id); aoMudar.delete(id); if (cb) aoMudar.set(novoId, cb)
  emitir({
    itens: estado.itens.map(i => i.id === id ? { ...i, id: novoId, nome: para } as ItemDoca : i),
  })
}

export function avisarMudanca(id: string) { aoMudar.get(id)?.() }

export function useDoca(): Estado {
  return useSyncExternalStore(f => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => estado, () => estado)
}
