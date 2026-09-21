/**
 * Diz de onde o card veio: gerado por IA ou colocado por uma pessoa.
 *
 * Os dois estados aparecem, não só o gerado. Marcar apenas um deixaria a
 * ausência ambígua — "foi uma pessoa" e "ninguém classificou ainda" ficariam
 * com a mesma cara, que é justamente o que se quer distinguir.
 */
export function OrigemIcone({ origem, size = 13, className = '' }: {
  origem?: string; size?: number; className?: string
}) {
  const produzido = origem === 'produzido'
  return (
    <span
      title={produzido
        ? 'Gerado por um agente ou fluxo'
        : 'Criado ou colado por uma pessoa'}
      aria-label={produzido ? 'gerado por IA' : 'criado por pessoa'}
      className={`shrink-0 inline-flex ${produzido ? 'text-violet-400' : 'text-gray-600'} ${className}`}
    >
      {produzido ? (
        // faísca: o sinal de "isto saiu de uma geração"
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
          <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" opacity=".7" />
        </svg>
      ) : (
        // pessoa
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  )
}
