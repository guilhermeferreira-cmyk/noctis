import { useEffect, useRef, useState } from 'react'
import { useDialogos, responder, fecharAviso, type Pedido } from '../../lib/dialogos'
import { getIcon } from '../../memoryIcons'

/**
 * O hospedeiro dos diálogos — montado UMA vez, no App.
 *
 * Desenha o pedido da frente da fila e a pilha de avisos. Veste o mesmo que as
 * cascas que já existiam (`NovaMemoria`, `EditorDecisao`, `ProjectsModal`):
 * fundo preto a 70%, caixa `#1a1a1a` com borda `gray-700`, cabeçalho separado
 * por linha. Fica acima de todas elas (`z-[200]`) porque pode ser chamado de
 * dentro de qualquer uma — apagar um molde pergunta por cima do modal que o
 * listou.
 */

const CAIXA = 'w-[30rem] max-w-full bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl'
const BOTAO = 'text-[12px] px-3 py-1.5 rounded-lg border transition-colors'

function Cabecalho({ titulo, corpo }: { titulo: string; corpo?: string }) {
  return (
    <div className="px-5 py-3 border-b border-gray-800">
      <h3 className="text-sm font-semibold text-gray-100">{titulo}</h3>
      {corpo && <p className="text-[11.5px] text-gray-500 mt-1 leading-snug">{corpo}</p>}
    </div>
  )
}

function Confirmar({ p }: { p: Extract<Pedido, { tipo: 'confirmar' }> }) {
  // O foco cai no CANCELAR quando a ação é destrutiva: apertar Enter por
  // reflexo não pode ser o gesto que apaga um arquivo.
  const cancelar = useRef<HTMLButtonElement>(null)
  const confirmar = useRef<HTMLButtonElement>(null)
  useEffect(() => { (p.perigo ? cancelar : confirmar).current?.focus() }, [p.perigo])

  return (
    <div className={CAIXA}>
      <Cabecalho titulo={p.titulo} corpo={p.corpo} />
      <div className="px-5 py-3 flex items-center justify-end gap-2">
        <button ref={cancelar} onClick={() => responder(p.id, false)}
          className={`${BOTAO} border-gray-700 text-gray-400 hover:text-gray-100 hover:bg-white/[0.06]`}>
          {p.cancelar || 'cancelar'}
        </button>
        <button ref={confirmar} onClick={() => responder(p.id, true)}
          className={`${BOTAO} ${p.perigo
            ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
            : 'border-white/20 bg-white/[0.09] text-gray-100 hover:bg-white/[0.14]'}`}>
          {p.confirmar || 'confirmar'}
        </button>
      </div>
    </div>
  )
}

function PedirTexto({ p }: { p: Extract<Pedido, { tipo: 'texto' }> }) {
  const [v, setV] = useState(p.valor || '')
  // Seleciona o valor que já estava: renomear é quase sempre trocar tudo, e
  // quem quer emendar só precisa de uma seta.
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { campo.current?.select() }, [])

  const ok = () => { const t = v.trim(); if (t) responder(p.id, t) }

  return (
    <div className={CAIXA}>
      <Cabecalho titulo={p.titulo} corpo={p.corpo} />
      <div className="px-5 py-4">
        {p.rotulo && (
          <label className="text-[10px] uppercase tracking-wider text-gray-600">{p.rotulo}</label>
        )}
        <input ref={campo} autoFocus value={v} onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ok() }}
          placeholder={p.dica}
          className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm
                     text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
      </div>
      <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
        <button onClick={() => responder(p.id, null)}
          className={`${BOTAO} border-gray-700 text-gray-400 hover:text-gray-100 hover:bg-white/[0.06]`}>
          cancelar
        </button>
        <button onClick={ok} disabled={!v.trim()}
          className={`${BOTAO} border-white/20 bg-white/[0.09] text-gray-100 hover:bg-white/[0.14]
                      disabled:opacity-40 disabled:hover:bg-white/[0.09]`}>
          {p.confirmar || 'ok'}
        </button>
      </div>
    </div>
  )
}

function Escolher({ p }: { p: Extract<Pedido, { tipo: 'escolher' }> }) {
  const [q, setQ] = useState('')
  const termo = q.trim().toLowerCase()
  // A busca existe porque a lista pode ter dezenas de itens — era exatamente o
  // que o `window.prompt` do fazedor de molde resolvia imprimindo 40 nomes e
  // mandando você digitar um deles de cabeça.
  const vistos = termo
    ? p.itens.filter(i => (i.rotulo + ' ' + (i.detalhe || '')).toLowerCase().includes(termo))
    : p.itens

  return (
    <div className={`${CAIXA} w-[34rem]`}>
      <Cabecalho titulo={p.titulo} corpo={p.corpo} />
      <div className="px-5 pt-3">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="buscar"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-[12px]
                     text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
      </div>
      <div className="px-5 py-3 max-h-[22rem] overflow-y-auto space-y-1">
        {vistos.length === 0 ? (
          <p className="text-[12px] text-gray-600 py-4 text-center">nada com “{q}”.</p>
        ) : vistos.map(i => {
          const I = i.icone ? getIcon(i.icone) : null
          return (
            <button key={i.valor} onClick={() => responder(p.id, i.valor)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left
                         border border-transparent hover:border-white/[0.12] hover:bg-white/[0.05]">
              {I && <I size={15} style={{ color: i.cor || '#a1a1aa' }} className="shrink-0" />}
              <span className="text-[12.5px] text-gray-200 truncate flex-1">{i.rotulo}</span>
              {i.detalhe && (
                <span className="text-[10.5px] text-gray-600 shrink-0 truncate max-w-[10rem]">{i.detalhe}</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-end">
        <button onClick={() => responder(p.id, null)}
          className={`${BOTAO} border-gray-700 text-gray-400 hover:text-gray-100 hover:bg-white/[0.06]`}>
          cancelar
        </button>
      </div>
    </div>
  )
}

export function Dialogos() {
  const { fila, avisos } = useDialogos()
  const p = fila[0]

  // Esc responde "não" ao que estiver na frente. Sem isto um diálogo aberto por
  // engano no meio de um fluxo async ficaria segurando a fila inteira.
  useEffect(() => {
    if (!p) return
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      responder(p.id, p.tipo === 'confirmar' ? false : null)
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [p])

  return (
    <>
      {p && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-6"
          onClick={() => responder(p.id, p.tipo === 'confirmar' ? false : null)}>
          <div onClick={e => e.stopPropagation()}>
            {p.tipo === 'confirmar' ? <Confirmar p={p} />
              : p.tipo === 'texto' ? <PedirTexto p={p} />
                : <Escolher p={p} />}
          </div>
        </div>
      )}

      {/* Os avisos NÃO bloqueiam: ficam no canto e sobem. Erro do servidor era
          um `alert` que travava a tela para dizer algo que você só queria ler. */}
      {avisos.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[210] flex flex-col-reverse gap-2 max-w-[24rem]">
          {avisos.map(a => (
            <button key={a.id} onClick={() => fecharAviso(a.id)} role="status"
              className={`text-left text-[12px] px-3.5 py-2.5 rounded-xl border shadow-2xl
                          backdrop-blur-xl transition-colors ${a.erro
                  ? 'border-red-500/30 bg-red-950/70 text-red-200 hover:bg-red-950/90'
                  : 'border-white/[0.10] bg-[#151515]/90 text-gray-300 hover:bg-[#1a1a1a]'}`}>
              {a.texto}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
