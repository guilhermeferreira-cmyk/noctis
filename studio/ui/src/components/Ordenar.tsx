import { useEffect, useState } from 'react'

/**
 * Ordenar e recortar — o mesmo controle para todos os módulos.
 *
 * A grade nasceu com uma ordem só, a do disco: alfabética pelo nome do arquivo.
 * Isso responde "onde está o X" e mais nada. As perguntas que aparecem quando o
 * projeto cresce são outras — o que mudou esta semana, quem está no topo, o que
 * nunca foi usado — e cada uma delas é uma ordem diferente sobre a mesma lista.
 *
 * Três decisões que valem para todos os módulos:
 *
 * 1. **A ordem é do módulo, e fica lembrada por aba.** Ordenar agentes por
 *    nível não deveria ordenar memórias por nível (que nem existe lá), e o
 *    recorte de ontem não deveria voltar decidindo o que você vê hoje.
 * 2. **Cada módulo declara os seus campos.** Nada de uma lista genérica com
 *    opções que não se aplicam: "por nível" só aparece onde há nível.
 * 3. **Ordem e filtro moram juntos**, porque são a mesma pergunta feita de dois
 *    jeitos: "o que importa primeiro" e "o que nem precisa aparecer".
 */

export type CampoOrdem<T> = {
  id: string
  rotulo: string
  /** Número, texto ou data — o que sair daqui é comparado como vier. */
  valor: (item: T) => number | string
  /** A ordem natural deste campo: nível começa do maior, nome do menor. */
  desc?: boolean
}

export type Recorte<T> = {
  id: string
  rotulo: string
  dica?: string
  passa: (item: T) => boolean
}

export function useOrdem(modulo: string, padrao: string) {
  const chave = `noctis.ordem.${modulo}`
  const [estado, setEstado] = useState<{ campo: string; desc: boolean | null; recortes: string[] }>(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(chave) || 'null')
      if (d && typeof d.campo === 'string') return { desc: null, recortes: [], ...d }
    } catch { /* sem storage */ }
    return { campo: padrao, desc: null, recortes: [] }
  })
  useEffect(() => {
    try { sessionStorage.setItem(chave, JSON.stringify(estado)) } catch { /* sem storage */ }
  }, [chave, estado])
  return {
    ...estado,
    definirCampo: (campo: string) => setEstado(e => ({ ...e, campo, desc: null })),
    inverter: () => setEstado(e => ({ ...e, desc: e.desc === null ? true : !e.desc })),
    alternarRecorte: (id: string) =>
      setEstado(e => ({ ...e, recortes: e.recortes.includes(id)
        ? e.recortes.filter(r => r !== id) : [...e.recortes, id] })),
    limparRecortes: () => setEstado(e => ({ ...e, recortes: [] })),
  }
}

/** Aplica a ordem e os recortes escolhidos. */
export function aplicar<T>(itens: T[], campos: CampoOrdem<T>[], recortes: Recorte<T>[],
                           estado: { campo: string; desc: boolean | null; recortes: string[] }): T[] {
  const ativos = recortes.filter(r => estado.recortes.includes(r.id))
  const filtrados = ativos.length ? itens.filter(i => ativos.every(r => r.passa(i))) : itens
  const campo = campos.find(c => c.id === estado.campo) || campos[0]
  if (!campo) return filtrados
  const desc = estado.desc === null ? !!campo.desc : estado.desc
  return [...filtrados].sort((a, b) => {
    const x = campo.valor(a), y = campo.valor(b)
    const n = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' })
    return desc ? -n : n
  })
}

export function BarraOrdem<T>({ campos, recortes, estado, contagem, total }: {
  campos: CampoOrdem<T>[]
  recortes: Recorte<T>[]
  estado: ReturnType<typeof useOrdem>
  contagem: number
  total: number
}) {
  const campo = campos.find(c => c.id === estado.campo) || campos[0]
  const desc = estado.desc === null ? !!campo?.desc : estado.desc
  return (
    <div className="px-5 py-1.5 border-b border-white/[0.06] flex items-center gap-2 shrink-0 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wide text-gray-600 shrink-0">ordem</span>
      <select value={estado.campo} onChange={e => estado.definirCampo(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-[11px] text-gray-300
                   focus:outline-none focus:border-sky-600">
        {campos.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
      </select>
      {/* A seta diz para onde a lista cresce, e é clicável: inverter é a
          segunda coisa que se quer depois de escolher o campo. */}
      <button onClick={estado.inverter} title={desc ? 'do maior para o menor' : 'do menor para o maior'}
        className="w-6 h-6 grid place-items-center rounded-md text-gray-500 hover:text-gray-100 hover:bg-white/[0.06]">
        {desc ? '↓' : '↑'}
      </button>

      {recortes.length > 0 && <span className="w-px h-4 bg-white/[0.08] mx-1 shrink-0" />}
      {recortes.map(r => (
        <button key={r.id} onClick={() => estado.alternarRecorte(r.id)} title={r.dica}
          className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
            estado.recortes.includes(r.id)
              ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
              : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
          {r.rotulo}
        </button>
      ))}
      {estado.recortes.length > 0 && (
        <button onClick={estado.limparRecortes}
          className="text-[11px] text-gray-600 hover:text-gray-300 px-1">limpar</button>
      )}
      <span className="flex-1" />
      <span className="text-[11px] text-gray-600 tabular-nums shrink-0">
        {contagem === total ? `${total}` : `${contagem} de ${total}`}
      </span>
    </div>
  )
}

/** Quanto tempo faz — para o card dizer a data sem ocupar uma linha inteira. */
export function desde(iso?: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const dias = Math.floor((Date.now() - t) / 86400000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `${dias}d`
  if (dias < 365) return `${Math.floor(dias / 30)}m`
  return `${Math.floor(dias / 365)}a`
}
