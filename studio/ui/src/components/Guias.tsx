/**
 * Guias — a faixa de abas de um item aberto na doca.
 *
 * A doca mostrava cada item num scroll único: para um agente, isso era um
 * bloco de Progresso seguido de um despejo do YAML inteiro, e descobrir o que
 * existia ali exigia rolar até o fim.
 *
 * Com guias, a própria lista de guias é o índice — bate o olho e se sabe o que
 * o item tem, antes de ler qualquer coisa. A contagem no rótulo faz parte
 * disso: "Contexto 6" já diz que há o que ver, sem abrir.
 *
 * O componente não sabe nada sobre agente, memória ou mapa: quem abre declara
 * as guias. É o que permite reestruturar a doca uma vez e valer para todo
 * tipo de item, em vez de fazer um caso especial por vez.
 */
export type Guia = { id: string; rotulo: string; n?: number }

export function Guias({ guias, ativa, onTrocar, cor }: {
  guias: Guia[]
  ativa: string
  onTrocar: (id: string) => void
  /** A cor do tipo do item, para a guia ativa não ser genérica. */
  cor?: string
}) {
  if (guias.length < 2) return null
  return (
    <div className="flex items-center gap-0.5 px-2 border-b border-white/[0.06] shrink-0
                    overflow-x-auto [scrollbar-width:none]">
      {guias.map(g => {
        const on = g.id === ativa
        return (
          <button key={g.id} onClick={() => onTrocar(g.id)}
            className={`shrink-0 px-2 py-1.5 text-[11.5px] border-b-2 -mb-px transition-colors ${
              on ? 'text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            style={on ? { borderColor: cor || '#8b5cf6' } : undefined}>
            {g.rotulo}
            {g.n !== undefined && g.n > 0 && (
              <span className="ml-1 text-[10px] text-gray-600 tabular-nums">{g.n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
