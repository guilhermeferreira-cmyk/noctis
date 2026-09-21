import { useCallback, useEffect, useState } from 'react'
import { api, type Hipotese, type Aprendizado, type PerguntaEnquadramento } from '../api'

/**
 * A Learning Inbox: as perguntas que os agentes deixaram esperando você.
 *
 * O ciclo é observação → hipótese → PERGUNTA → sua resposta → aprendizado, e
 * esta tela é o portão. O agente propõe e nunca conclui; o que fica valendo é
 * o que você respondeu — em "corrigir", literalmente o texto que você escreveu.
 *
 * Duas escolhas de desenho que importam:
 *
 * · A ordem é por INCERTEZA, não por data. Hipótese perto de 50% é a que mais
 *   ensina quando respondida; perguntar o que já está quase certo gasta a sua
 *   atenção, que é o recurso mais caro do sistema.
 * · "A pergunta está errada" é um botão de primeira classe. Sem ele, uma
 *   pergunta mal feita só aceita sim ou não, e o sistema aprende uma causa
 *   falsa com confiança alta — foi o caso da simetria que era hierarquia.
 */

const COR_CONF = (c: number) => (c >= 0.7 ? '#10b981' : c >= 0.45 ? '#f59e0b' : '#a1a1aa')

function Barra({ c }: { c: number }) {
  return (
    <div className="flex items-center gap-1.5" title={`confiança ${Math.round(c * 100)}%`}>
      <div className="w-14 h-1 rounded-full bg-white/[0.08] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${c * 100}%`, background: COR_CONF(c) }} />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: COR_CONF(c) }}>
        {Math.round(c * 100)}%
      </span>
    </div>
  )
}

/** As perguntas que descobrem o que a habilidade é.
 *
 * Ele não quer escolher isso num formulário: digita o nome da habilidade e o
 * Noctis vai perguntando. A primeira decide o rumo sem nunca dizer a palavra
 * "natureza"; as seguintes preenchem o corpo, uma por vez.
 */
function Enquadrar({ p, onRespondido }: { p: PerguntaEnquadramento; onRespondido: () => void }) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const responder = async (valor: string) => {
    if (!valor.trim()) return
    setSalvando(true)
    try { await api.enquadrar(p.skill, p.campo, valor); onRespondido() }
    catch (e) { alert((e as Error).message); setSalvando(false) }
  }

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 space-y-2.5">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-violet-300/70 mb-1">
          descobrindo · {p.titulo || 'o que é'}
        </div>
        <div className="text-[12.5px] text-gray-100 leading-snug">{p.pergunta.texto}</div>
        {p.ajuda && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{p.ajuda}</p>}
      </div>

      {p.pergunta.tipo === 'escolha' ? (
        <div className="space-y-1">
          {p.pergunta.opcoes.map(o => (
            <button key={o} disabled={salvando} onClick={() => responder(o)}
              className="w-full text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-white/[0.08] text-gray-200 hover:bg-white/[0.06] hover:border-violet-500/50">
              {o}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) responder(texto) }}
            placeholder="responda com as suas palavras — é este texto que os agentes vão ler"
            className="w-full bg-black/40 border border-white/[0.1] rounded-md px-2 py-1.5 text-[11.5px] text-gray-200 focus:outline-none focus:border-violet-500/60 resize-none" />
          <div className="flex items-center gap-1.5">
            <button disabled={salvando || !texto.trim()} onClick={() => responder(texto)}
              className="text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-2.5 py-1 rounded">
              responder
            </button>
            <button disabled={salvando} onClick={() => responder('—')}
              title="Esta pergunta não cabe nesta habilidade — não volta a ser feita"
              className="text-[11px] text-gray-500 hover:text-gray-200 px-2 py-1">
              não se aplica
            </button>
            <div className="flex-1" />
            <span className="text-[10px] text-gray-600">Ctrl+Enter</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Pergunta({ h, onRespondido }: { h: Hipotese; onRespondido: () => void }) {
  const [escolhas, setEscolhas] = useState<string[]>([])
  const [escala, setEscala] = useState(4)
  const [corrigindo, setCorrigindo] = useState(false)
  const [texto, setTexto] = useState(h.texto)
  const [vendo, setVendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const responder = async (veredito: string, extra: Record<string, unknown> = {}) => {
    setSalvando(true)
    try {
      await api.responderHipotese(h.id, { veredito, escolhas, escala, ...extra })
      onRespondido()
    } catch (e) { alert((e as Error).message) } finally { setSalvando(false) }
  }

  const tipo = h.pergunta.tipo
  const marcar = (o: string) =>
    setEscolhas(es => tipo === 'multi'
      ? (es.includes(o) ? es.filter(x => x !== o) : [...es, o])
      : [o])

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-gray-100 leading-snug">{h.pergunta.texto}</div>
          <div className="text-[11px] text-gray-500 mt-1 leading-snug">
            <span className="text-gray-600">hipótese:</span> {h.texto}
          </div>
        </div>
        <Barra c={h.confianca} />
      </div>

      <div className="flex items-center gap-2 text-[10px] text-gray-600">
        <span>{h.skill}</span>
        <span>·</span>
        <span>{h.agente || 'sem autor'}</span>
        <span>·</span>
        <button onClick={() => setVendo(v => !v)} className="hover:text-gray-300 underline decoration-dotted">
          {h.observacoes.length} observação{h.observacoes.length !== 1 ? 'ões' : ''}
        </button>
      </div>

      {/* A evidência aberta: responder sem ver no que a hipótese se baseou é
          chutar junto com o agente. */}
      {vendo && (
        <ul className="space-y-1 pl-2 border-l border-white/[0.08]">
          {h.observacoes.map(o => (
            <li key={o.id} className="text-[11px] text-gray-400 leading-snug">
              {o.texto}
              {o.contexto && <span className="text-gray-600"> — {o.contexto}</span>}
            </li>
          ))}
        </ul>
      )}

      {(tipo === 'escolha' || tipo === 'multi') && (
        <div className="space-y-1">
          {h.pergunta.opcoes.map(o => (
            <button key={o} onClick={() => marcar(o)}
              className={`w-full text-left text-[11.5px] px-2.5 py-1.5 rounded-md border ${
                escolhas.includes(o)
                  ? 'border-violet-500/60 bg-violet-500/15 text-violet-100'
                  : 'border-white/[0.08] text-gray-300 hover:bg-white/[0.04]'}`}>
              {tipo === 'multi' ? (escolhas.includes(o) ? '☑' : '☐') : (escolhas.includes(o) ? '●' : '○')} {o}
            </button>
          ))}
        </div>
      )}

      {tipo === 'escala' && (
        <div className="flex items-center gap-2">
          <input type="range" min={1} max={7} value={escala} onChange={e => setEscala(Number(e.target.value))}
            className="flex-1 accent-violet-500" />
          <span className="text-[11px] text-gray-300 tabular-nums w-3">{escala}</span>
        </div>
      )}

      {corrigindo ? (
        <div className="space-y-1.5">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} autoFocus
            placeholder="O aprendizado como ele é de verdade — é este texto que fica valendo."
            className="w-full bg-black/40 border border-white/[0.1] rounded-md px-2 py-1.5 text-[11.5px] text-gray-200 focus:outline-none focus:border-violet-500/60 resize-none" />
          <div className="flex gap-1.5">
            <button disabled={salvando || !texto.trim()} onClick={() => responder('corrige', { texto })}
              className="text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-2.5 py-1 rounded">
              gravar o aprendizado
            </button>
            <button onClick={() => { setCorrigindo(false); setTexto(h.texto) }}
              className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button disabled={salvando} onClick={() => responder('confirma')}
            className="text-[11px] bg-emerald-600/90 hover:bg-emerald-500 text-white px-2.5 py-1 rounded">
            confirmar
          </button>
          <button disabled={salvando} onClick={() => responder('refuta')}
            className="text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 px-2.5 py-1 rounded">
            não é isso
          </button>
          <button disabled={salvando} onClick={() => setCorrigindo(true)}
            className="text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-gray-200 px-2.5 py-1 rounded">
            corrigir
          </button>
          <div className="flex-1" />
          <button disabled={salvando} onClick={() => responder('invalida')}
            title="A hipótese olhou para a variável errada — nem sim nem não resolvem"
            className="text-[11px] text-gray-500 hover:text-amber-300 px-1.5 py-1">
            a pergunta está errada
          </button>
        </div>
      )}
    </div>
  )
}

export function Aprender() {
  const [perguntas, setPerguntas] = useState<(Hipotese | PerguntaEnquadramento)[]>()
  const [aprendizados, setAprendizados] = useState<Aprendizado[]>([])
  const [ver, setVer] = useState<'perguntas' | 'sabido'>('perguntas')

  const recarregar = useCallback(() => {
    api.inboxAprendizado().then(r => setPerguntas(r.perguntas))
    api.aprendizado().then(r => setAprendizados(r.aprendizados))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const vivos = aprendizados.filter(a => !a.aposentado)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 text-[11px] shrink-0">
        {([['perguntas', `Perguntas ${perguntas?.length ?? ''}`],
           ['sabido', `Aprendido ${vivos.length || ''}`]] as const).map(([id, rot]) => (
          <button key={id} onClick={() => setVer(id)}
            className={`px-2 py-1 rounded-md ${ver === id ? 'bg-white/[0.08] text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
            {rot}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={recarregar} title="Reler" className="text-gray-500 hover:text-gray-200 px-1">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {ver === 'perguntas' ? (
          !perguntas ? <p className="text-[11px] text-gray-600">lendo…</p>
            : perguntas.length === 0 ? (
              <p className="text-[11.5px] text-gray-500 leading-relaxed pt-2">
                Nenhuma pergunta esperando. Elas aparecem aqui de dois jeitos: quando você cria
                uma habilidade e o Noctis precisa descobrir o que ela é, e quando um agente
                observa o trabalho e propõe uma generalização.
              </p>
            ) : perguntas.map(q => 'tipo_fila' in q && q.tipo_fila === 'enquadramento'
              ? <Enquadrar key={q.id} p={q as PerguntaEnquadramento} onRespondido={recarregar} />
              : <Pergunta key={q.id} h={q as Hipotese} onRespondido={recarregar} />)
        ) : (
          vivos.length === 0 ? (
            <p className="text-[11.5px] text-gray-500 leading-relaxed pt-2">
              Nada validado ainda. O que você confirmar ou corrigir nas perguntas fica aqui,
              e passa a viajar nos despachos por referência.
            </p>
          ) : vivos.map(a => (
            <div key={a.id} className="group/a rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
              <p className="text-[11.5px] text-gray-200 leading-snug">{a.texto}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-600">
                <span>{a.skill}</span><span>·</span><span>{a.escopo}</span>
                {!a.de_hipotese && <><span>·</span><span>escrito por você</span></>}
                <div className="flex-1" />
                <button onClick={async () => {
                    if (!window.confirm('Aposentar este aprendizado? Ele para de viajar nos despachos, mas fica no histórico.')) return
                    await api.aposentarAprendizado(a.id); recarregar()
                  }}
                  className="opacity-0 group-hover/a:opacity-100 hover:text-amber-300">aposentar</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
