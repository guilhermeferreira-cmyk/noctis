import { useEffect, useState } from 'react'
import { api, getProject, type ResourceItem, type ResourceList } from '../api'
import { KINDS_TODOS } from '../lib/kinds'

/**
 * O filtro por projeto — a barra que só existe no andar de cima.
 *
 * O projeto base é a visão de todos: aberto nele, cada módulo mostra o que
 * existe em TODOS os projetos. Isso é útil e é perigoso pela mesma razão — são
 * muitos itens, e eles vêm de contextos diferentes. O filtro é o que torna a
 * visão utilizável: recortar por projeto é a primeira pergunta que se faz
 * diante de uma lista que atravessa clientes.
 *
 * A seleção é do NAVEGADOR e por módulo: filtrar memórias por Sciensa não
 * deveria filtrar os agentes junto, e o recorte de ontem não deveria voltar
 * decidindo o que você vê hoje em outra tela.
 */
export function ehVisaoGlobal(): boolean {
  return getProject() === 'noctis'
}

/**
 * O catálogo, montado no NAVEGADOR a partir do que já está preloadado.
 *
 * A rota `/api/todos/resources` existe e funciona, mas ela relê e recomputa a
 * ficha de XP de cada projeto DE NOVO a cada chamada — o mesmo trabalho que o
 * preload de abertura (`App.tsx`) já fez uma vez e guardou em cache. Chamar
 * aquela rota toda vez que o Warden abre, ou toda vez que a camada Catálogo é
 * escolhida, paga esse trabalho outra vez, e é isso que fazia o catálogo — e
 * a home, que o usa para "mexidos por último" — demorarem para abrir.
 *
 * Aqui a montagem usa `api.recursosDoProjeto`, a MESMA função que o preload
 * chama: se o projeto já foi lido (o caso comum, alguns segundos depois de
 * abrir o Noctis), a resposta vem do cache na hora, sem rede nem recálculo.
 * Só um projeto nunca lido — por exemplo, criado nesta sessão — paga uma
 * leitura de verdade, e só dele.
 */
export async function catalogoLocal(
  projetos: Projeto[],
): Promise<ResourceList> {
  // Todos os kinds, e não uma lista à parte: uma lista aqui envelheceria no dia
  // em que o servidor ganhasse um tipo novo, e a grade dele viria vazia.
  const fora = Object.fromEntries(KINDS_TODOS.map(k => [k, [] as ResourceItem[]])) as ResourceList
  const listas = await Promise.all(projetos.map(async p => {
    try { return { p, r: await api.recursosDoProjeto(p.slug) } }
    catch { return null }
  }))
  for (const item of listas) {
    if (!item) continue
    const { p, r } = item
    for (const k of ['agent', 'memory', 'flow', 'persona'] as const) {
      for (const it of r[k] || []) fora[k].push({ ...it, kind: k, projeto: p.slug, projetoNome: p.nome })
    }
  }
  return fora
}

export type Projeto = { slug: string; nome: string }

export function useFiltroProjetos(modulo: string) {
  const chave = `noctis.filtro.${modulo}`
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [ativos, setAtivos] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(chave) || '[]') } catch { return [] }
  })
  useEffect(() => {
    try { sessionStorage.setItem(chave, JSON.stringify(ativos)) } catch { /* sem storage */ }
  }, [chave, ativos])

  const alternar = (slug: string) =>
    setAtivos(a => a.includes(slug) ? a.filter(s => s !== slug) : [...a, slug])

  return { projetos, setProjetos, ativos, alternar, limpar: () => setAtivos([]) }
}

export function FiltroProjetos({ projetos, ativos, contagem, onAlternar, onLimpar }: {
  projetos: Projeto[]
  ativos: string[]
  /** Quantos itens cada projeto tem nesta tela — número vazio não se clica à toa. */
  contagem?: Record<string, number>
  onAlternar: (slug: string) => void
  onLimpar: () => void
}) {
  if (projetos.length < 2) return null
  return (
    <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-1.5 shrink-0 overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wide text-amber-400/70 shrink-0 mr-1">
        todos os projetos
      </span>
      <button onClick={onLimpar}
        className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
          ativos.length === 0
            ? 'bg-white/[0.1] border-white/20 text-gray-100'
            : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
        todos
      </button>
      {projetos.map(p => {
        const n = contagem?.[p.slug]
        return (
          <button key={p.slug} onClick={() => onAlternar(p.slug)}
            title={n === 0 ? 'nada deste tipo neste projeto' : undefined}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
              ativos.includes(p.slug)
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                : `border-gray-800 hover:text-gray-300 ${n === 0 ? 'text-gray-700' : 'text-gray-500'}`}`}>
            {p.nome}
            {n !== undefined && <span className="text-gray-600 tabular-nums">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A etiqueta do projeto no card — de onde aquele item veio. */
export function SeloProjeto({ nome }: { nome?: string }) {
  if (!nome) return null
  return (
    <span className="text-[9.5px] uppercase tracking-wide text-amber-300/70 border border-amber-500/25
                     rounded-full px-1.5 py-0.5 shrink-0">
      {nome}
    </span>
  )
}

/** Carrega a lista de projetos uma vez, para quem só precisa dos nomes. */
export function useProjetos(): Projeto[] {
  const [ps, setPs] = useState<Projeto[]>([])
  useEffect(() => {
    api.listProjects()
      .then(l => setPs(l.map(p => ({ slug: p.slug, nome: p.displayName }))))
      .catch(() => {})
  }, [])
  return ps
}
