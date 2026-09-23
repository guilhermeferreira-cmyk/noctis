import { useSyncExternalStore } from 'react'

/**
 * Os diálogos do Noctis — confirmar, pedir um texto, escolher, avisar.
 *
 * Por que um store, e não estado de componente. Praticamente toda pergunta que
 * o app faz acontece DENTRO de um callback async: `deleteProject` no App, o
 * menu de um card em `ResourceGrid`, o fazedor de molde. Passar `aberto`,
 * `resolver`, `titulo` por prop até lá atravessaria quatro camadas de
 * componente e obrigaria cada página a hospedar a própria casca de modal.
 *
 * Então a API é imperativa e devolve Promise — o chamador escreve a mesma linha
 * que escrevia com `window.confirm`, só que com `await`:
 *
 *     if (!await confirmar({ titulo: 'Apagar?' })) return
 *
 * ATENÇÃO ao converter um `window.confirm`: ele era SÍNCRONO. Trocar por
 * `await` insere um tick, e qualquer `e.currentTarget` lido depois disso já é
 * `null` — leia o que precisa do evento ANTES da pergunta.
 *
 * O molde é o `lib/doca.ts`: store externo, `useSyncExternalStore`, e um único
 * hospedeiro montado no `App`.
 */

export type Pedido =
  | {
      id: number; tipo: 'confirmar'
      titulo: string; corpo?: string
      confirmar?: string; cancelar?: string
      /** Ação destrutiva: o botão fica vermelho em vez de neutro. */
      perigo?: boolean
      resolver: (v: boolean) => void
    }
  | {
      id: number; tipo: 'texto'
      titulo: string; corpo?: string
      rotulo?: string; valor?: string; dica?: string; confirmar?: string
      resolver: (v: string | null) => void
    }
  | {
      id: number; tipo: 'escolher'
      titulo: string; corpo?: string
      itens: ItemEscolha[]
      resolver: (v: string | null) => void
    }

export type ItemEscolha = {
  /** O que volta para o chamador. */
  valor: string
  rotulo: string
  /** Segunda linha: de onde vem, o que é. */
  detalhe?: string
  icone?: string
  cor?: string
}

export type Aviso = { id: number; texto: string; erro: boolean }

type Estado = { fila: Pedido[]; avisos: Aviso[] }

let estado: Estado = { fila: [], avisos: [] }
const ouvintes = new Set<() => void>()
let proximo = 1

function emitir(novo: Partial<Estado>) {
  estado = { ...estado, ...novo }
  ouvintes.forEach(f => f())
}

/** Um de cada vez: o segundo pedido espera a vez em vez de engolir o primeiro. */
function enfileirar<T>(monta: (id: number, resolver: (v: T) => void) => Pedido): Promise<T> {
  return new Promise<T>(resolve => {
    const id = proximo++
    emitir({ fila: [...estado.fila, monta(id, resolve)] })
  })
}

export function confirmar(o: {
  titulo: string; corpo?: string; confirmar?: string; cancelar?: string; perigo?: boolean
}): Promise<boolean> {
  return enfileirar<boolean>((id, resolver) => ({ id, tipo: 'confirmar', ...o, resolver }))
}

export function pedirTexto(o: {
  titulo: string; corpo?: string; rotulo?: string; valor?: string; dica?: string; confirmar?: string
}): Promise<string | null> {
  return enfileirar<string | null>((id, resolver) => ({ id, tipo: 'texto', ...o, resolver }))
}

export function escolher(o: {
  titulo: string; corpo?: string; itens: ItemEscolha[]
}): Promise<string | null> {
  return enfileirar<string | null>((id, resolver) => ({ id, tipo: 'escolher', ...o, resolver }))
}

/** Responde o pedido da frente e tira ele da fila. */
export function responder(id: number, valor: boolean | string | null) {
  const p = estado.fila.find(x => x.id === id)
  if (!p) return
  emitir({ fila: estado.fila.filter(x => x.id !== id) })
  ;(p.resolver as (v: unknown) => void)(valor)
}

/**
 * O aviso não pergunta nada: ele conta o que aconteceu e some.
 *
 * Erro fica mais tempo que sucesso de propósito — "molde guardado" se confirma
 * olhando a tela, mas uma mensagem do servidor é a única cópia do que deu errado.
 */
function avisar(texto: string, erro: boolean) {
  const id = proximo++
  emitir({ avisos: [...estado.avisos, { id, texto, erro }] })
  setTimeout(() => emitir({ avisos: estado.avisos.filter(a => a.id !== id) }), erro ? 8000 : 3500)
}

export const aviso = {
  ok: (texto: string) => avisar(texto, false),
  erro: (e: unknown) => avisar(e instanceof Error ? e.message : String(e), true),
}

export function fecharAviso(id: number) {
  emitir({ avisos: estado.avisos.filter(a => a.id !== id) })
}

export function useDialogos(): Estado {
  return useSyncExternalStore(f => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => estado, () => estado)
}
