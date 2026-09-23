import { useEffect, useMemo, useState } from 'react'
import { buscarIcones, getIcon, nomeLegivel, iconNames,
         carregarIcones, aoCarregarIcones } from '../memoryIcons'

/**
 * Seletor de ícone sobre o set inteiro do game-icons.net.
 *
 * São mais de quatro mil desenhos, então a busca não é um luxo: é o que torna a
 * biblioteca utilizável. Sem termo digitado, o seletor mostra a lista curada —
 * quem só quer um ícone razoável não precisa encarar tudo.
 *
 * O resultado é limitado a 240 por vez. Pintar quatro mil botões de SVG trava a
 * aba, e ninguém escolhe olhando quatro mil: quem não achou nos primeiros 240
 * refina o termo.
 */
export function SeletorIcone({ atual, cor = '#cbd5e1', onEscolher, compacto = false }: {
  atual?: string
  cor?: string
  onEscolher: (nome: string) => void
  /** Versão estreita, para dentro do menu do card. */
  compacto?: boolean
}) {
  const [termo, setTermo] = useState('')
  // Abrir o seletor é a intenção mais clara de "quero ver todos": é aqui que o
  // set completo é pedido. E é preciso ouvir a chegada dele, senão a busca
  // ficaria presa às sugestões até a pessoa digitar de novo sem saber por quê.
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    carregarIcones()
    return aoCarregarIcones(() => setVersao(v => v + 1))
  }, [])
  const achados = useMemo(() => buscarIcones(termo), [termo, versao])

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <input
          value={termo} onChange={e => setTermo(e.target.value)}
          placeholder="buscar ícone: escudo, book, star…"
          spellCheck={false}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
        <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">
          {termo ? `${achados.length}${achados.length >= 240 ? '+' : ''}` : `${iconNames().length}`}
        </span>
      </div>

      {achados.length === 0 ? (
        <p className="text-[11px] text-gray-600 py-3 text-center">
          nada com “{termo}”. Os nomes são em inglês.
        </p>
      ) : (
        <div className={`grid gap-1 overflow-y-auto pr-1 ${
          compacto ? 'grid-cols-6 max-h-32' : 'grid-cols-12 max-h-52'} bg-black/20 rounded-lg p-1`}>
          {achados.map(nm => {
            const I = getIcon(nm)
            return (
              <button key={nm} onClick={() => onEscolher(nm)} title={nomeLegivel(nm)}
                className={`grid place-items-center rounded p-1 hover:bg-gray-700 ${
                  nm === atual ? 'bg-gray-700 ring-1 ring-blue-500' : ''}`}>
                <I size={18} style={{ color: nm === atual ? cor : '#cbd5e1' }} />
              </button>
            )
          })}
        </div>
      )}

      {!termo && (
        <p className="text-[10px] text-gray-600 mt-1">
          sugestões — digite para procurar em todos os {iconNames().length}
        </p>
      )}
    </div>
  )
}
