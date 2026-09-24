import { useEffect, useMemo, useState } from 'react'
import { buscarIcones, getIcon, nomeLegivel, iconNames,
         carregarIcones, aoCarregarIcones } from '../memoryIcons'
import { useOrbs, familias, type Orb } from '../lib/orbs'
import { caminhoDaOrb, ehOrb } from './Avatar'

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
/** Quantas orbs se pinta de uma vez. Ver a nota em `teto`. */
const TETO_ORBS = 48

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
        on ? 'border-white/25 bg-white/[0.10] text-gray-100'
           : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
      {children}
    </button>
  )
}

function Abas({ fonte, onTrocar, n }: {
  fonte: 'icone' | 'orb'; onTrocar: (f: 'icone' | 'orb') => void; n: number
}) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      {(['icone', 'orb'] as const).map(f => (
        <button key={f} onClick={() => onTrocar(f)}
          className={`text-[11px] px-2 py-0.5 rounded-md border ${
            fonte === f ? 'border-white/20 bg-white/[0.09] text-gray-100'
                        : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
          {f === 'icone' ? 'ícones' : `orbs${n ? ` ${n}` : ''}`}
        </button>
      ))}
    </div>
  )
}

export function SeletorIcone({ atual, cor = '#cbd5e1', onEscolher, compacto = false }: {
  atual?: string
  cor?: string
  onEscolher: (nome: string) => void
  /** Versão estreita, para dentro do menu do card. */
  compacto?: boolean
}) {
  // Duas fontes no mesmo seletor, e não dois seletores: card, mapa e
  // Configurações já chamam este componente, então ensinar orb a ele dá orb
  // nos três de uma vez.
  const [fonte, setFonte] = useState<'icone' | 'orb'>(ehOrb(atual) ? 'orb' : 'icone')
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

  // O índice das orbs só é buscado quando esta aba é aberta.
  const todasOrbs = useOrbs()
  const [familia, setFamilia] = useState('')
  const daFamilia = useMemo(
    () => (familia ? todasOrbs.filter(o => o.familia === familia) : todasOrbs),
    [todasOrbs, familia])
  // **Teto de renderização, e ele não é enfeite.** `loading="lazy"` não segurou:
  // medido, abrir o seletor buscava as 304 de uma vez — 3 MB. O navegador
  // considera "visível" o que está num contêiner que ainda não foi medido, e
  // pinta tudo. Com teto, o custo de abrir é um punhado; quem quer mais filtra
  // por família ou pede mais. É o mesmo desenho do set de ícones, que já corta
  // em 240 pelo mesmo motivo.
  const [teto, setTeto] = useState(TETO_ORBS)
  useEffect(() => { setTeto(TETO_ORBS) }, [familia])
  const orbsVistas = daFamilia.slice(0, teto)
  const restam = daFamilia.length - orbsVistas.length

  if (fonte === 'orb') {
    return (
      <div>
        <Abas fonte={fonte} onTrocar={setFonte} n={todasOrbs.length} />
        {/* Sem o filtro por família isto é uma parede de trezentas bolinhas.
            A família sai da cor do MIOLO de cada orb, calculada no índice. */}
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          <Chip on={!familia} onClick={() => setFamilia('')}>todas</Chip>
          {familias().map(f => (
            <Chip key={f} on={familia === f} onClick={() => setFamilia(f)}>{f}</Chip>
          ))}
        </div>
        <div className={`grid gap-1 overflow-y-auto pr-1 bg-black/20 rounded-lg p-1 ${
          compacto ? 'grid-cols-5 max-h-40' : 'grid-cols-10 max-h-56'}`}>
          {orbsVistas.map(o => (
            <button key={o.id} onClick={() => onEscolher(o.id)} title={o.familia}
              className={`grid place-items-center rounded p-0.5 hover:bg-gray-700 ${
                o.id === atual ? 'bg-gray-700 ring-1 ring-blue-500' : ''}`}>
              {/* `loading=lazy` não é detalhe: são 305 arquivos, e sem isto
                  abrir o seletor pediria todos de uma vez. */}
              <img src={caminhoDaOrb(o.id)} alt="" loading="lazy" draggable={false}
                className="w-full aspect-square object-contain" />
            </button>
          ))}
          {todasOrbs.length === 0 && (
            <p className="col-span-full text-[11px] text-gray-600 py-3 text-center">carregando…</p>
          )}
        </div>
        {restam > 0 && (
          <button onClick={() => setTeto(t => t + TETO_ORBS)}
            className="mt-1 w-full text-[10.5px] text-gray-500 hover:text-gray-200 py-1">
            mostrar mais {Math.min(restam, TETO_ORBS)} de {restam}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <Abas fonte={fonte} onTrocar={setFonte} n={todasOrbs.length} />
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
