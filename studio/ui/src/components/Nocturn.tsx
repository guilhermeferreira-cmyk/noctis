import { usePreferencias } from '../lib/preferencias'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type NocturnRelatorio, type NocturnAchado, type NocturnMensagem } from '../api'
import { LogoNoctis } from './LogoNoctis'
import { Aprender } from './Aprender'

/**
 * NOCTURN — o supervisor, ancorado no canto da tela.
 *
 * Ele é o único agente que não pertence a projeto nenhum: o que cada projeto tem
 * é um time, o que o Noctis tem é ele. Por isso mora no canto e não numa página
 * — supervisão que exige navegar até ela não supervisiona coisa alguma.
 *
 * A varredura é regra pura, feita no servidor: habilidade sem descrição, entrega
 * sem confirmação, agente parado. Regra não precisa de modelo, e o que é
 * determinístico deve continuar determinístico mesmo quando houver um modelo do
 * outro lado.
 *
 * A conversa é um arquivo. O dock escreve como `voce`; a sessão que encarnar o
 * NOCTURN escreve como `nocturn` pela mesma rota. Nenhum dos dois precisa saber
 * quem está do outro lado — é o que vai permitir abri-lo no IDE sem mexer aqui.
 */

const COR = '#a78bfa'

const ROTULO_TIPO: Record<string, string> = {
  skill_sem_descricao: 'sem descrição',
  skill_parecida: 'possível fusão',
  sem_confirmacao: 'sem confirmação',
  decisao_pendente: 'decisão aberta',
  agente_parado: 'parado',
  agente_sem_trabalho: 'nunca trabalhou',
  memoria_sem_autor: 'sem autor',
  memoria_sem_uso: 'ninguém lê',
  skill_sem_leitura: 'nunca consultada',
  skill_sem_corpo: 'sem texto',
}

/** Um achado da ronda. Quando dá para resolver, resolve-se aqui mesmo. */
function Achado({ a, onResolvido }: { a: NocturnAchado; onResolvido: () => void }) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const agir = async (fn: () => Promise<unknown>) => {
    setOcupado(true)
    try { await fn(); onResolvido() } finally { setOcupado(false) }
  }

  const botao = (rotulo: string, fn: () => Promise<unknown>, desabilitado = false) => (
    <button onClick={() => agir(fn)} disabled={ocupado || desabilitado}
      className="text-[11px] px-2 py-1 rounded disabled:opacity-30 shrink-0"
      style={{ background: COR + '22', color: COR }}>
      {ocupado ? '…' : rotulo}
    </button>
  )

  return (
    <div className="rounded-lg border border-gray-800 bg-[#141414] p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color: a.urgencia === 'alta' ? '#fbbf24' : '#a1a1aa',
            background: a.urgencia === 'alta' ? '#fbbf2415' : '#3f3f4640',
          }}>
          {ROTULO_TIPO[a.tipo] || a.tipo}
        </span>
        <span className="text-[10px] text-gray-600 truncate">{a.projeto}</span>
      </div>
      <p className="text-[11px] text-gray-300 leading-snug">{a.texto}</p>

      {a.tipo === 'skill_sem_descricao' && (
        <div className="flex gap-1.5">
          <input value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && texto.trim() && a.chave) {
                agir(() => api.nocturnDescrever(a.projeto, a.chave!, texto.trim()))
              }
            }}
            placeholder="o que esta habilidade é, em uma frase"
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500 placeholder:text-gray-600" />
          {botao('ok', () => api.nocturnDescrever(a.projeto, a.chave!, texto.trim()), !texto.trim())}
        </div>
      )}

      {/* Fundir é escolha de direção: quem absorve quem. Por isso dois botões. */}
      {a.tipo === 'skill_parecida' && (
        <div className="flex flex-wrap gap-1.5">
          {botao('manter "' + a.rotulo + '"', () => api.fundirSkillsEm(a.projeto, [a.outra!], a.chave!))}
          {botao('manter "' + a.outroRotulo + '"', () => api.fundirSkillsEm(a.projeto, [a.chave!], a.outra!))}
        </div>
      )}

      {a.tipo === 'sem_confirmacao' &&
        botao('confirmar entrega', () => api.confirmarEventoEm(a.projeto, a.evento!))}

      {a.tipo === 'memoria_sem_autor' && (
        <select defaultValue="" disabled={ocupado}
          onChange={e => e.target.value &&
            agir(() => api.identidadeEm(a.projeto, 'memory', a.recurso!, { autor: e.target.value }))}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-violet-500">
          <option value="">quem produziu?</option>
          {(a.agentes || []).map(ag => <option key={ag} value={ag}>{ag}</option>)}
        </select>
      )}
    </div>
  )
}

export function Nocturn({ embutido = false }: {
  /** No painel direito: sempre aberto, ocupando o painel, sem botão flutuante. */
  embutido?: boolean
} = {}) {
  const [aberto, setAberto] = useState(embutido)
  const [rel, setRel] = useState<NocturnRelatorio>()
  const [msgs, setMsgs] = useState<NocturnMensagem[]>([])
  const [texto, setTexto] = useState('')
  const [aba, setAba] = useState<string>('vocabulario')
  const [perguntasPendentes, setPerguntasPendentes] = useState(0)
  const fim = useRef<HTMLDivElement>(null)

  const recarregar = useCallback(() => {
    api.nocturnRelatorio().then(setRel).catch(() => {})
    api.nocturnConversa().then(r => setMsgs(r.mensagens)).catch(() => {})
  }, [])

  const intervaloRonda = usePreferencias().intervaloRonda
  useEffect(() => { recarregar() }, [recarregar])
  // O número na aba Aprender: quantas perguntas esperam resposta agora.
  useEffect(() => {
    api.inboxAprendizado().then(r => setPerguntasPendentes(r.perguntas.length)).catch(() => {})
  }, [aba])
  // A ronda se repete sozinha: supervisão que só olha quando alguém pede não é
  // supervisão. Um minuto é frequente o bastante e barato — é leitura de arquivo.
  useEffect(() => {
    const t = setInterval(recarregar, intervaloRonda * 1000)
    return () => clearInterval(t)
  }, [recarregar, intervaloRonda])
  useEffect(() => { if (aberto && aba === 'conversa') fim.current?.scrollIntoView() }, [aberto, aba, msgs])

  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    setTexto('')
    const m = await api.nocturnFalar(t)
    setMsgs(ms => [...ms, m])
  }

  const achados = rel?.achados || []
  const pendentes = achados.length
  const daAba = achados.filter(a => a.ronda === aba)
  const semResposta = msgs.length > 0 && msgs[msgs.length - 1].autor === 'voce'

  if (!aberto && !embutido) {
    return (
      <button onClick={() => setAberto(true)} title="NOCTURN — supervisor do Noctis"
        className="fixed bottom-5 right-5 z-[80] w-14 h-14 rounded-full grid place-items-center
                   border shadow-2xl transition-transform hover:scale-105"
        style={{ background: '#151515', borderColor: COR + '55', boxShadow: `0 0 30px -8px ${COR}` }}>
        <LogoNoctis size={30} className="text-violet-300" />
        {pendentes > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 grid place-items-center
                           rounded-full text-[10px] font-bold text-black tabular-nums"
            style={{ background: COR }}>
            {pendentes > 99 ? '99+' : pendentes}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={embutido
        ? 'h-full flex flex-col overflow-hidden'
        : `fixed bottom-5 right-5 z-[80] w-[26rem] max-w-[calc(100vw-2.5rem)]
           h-[32rem] max-h-[calc(100vh-6rem)] flex flex-col
           bg-[#111111] border rounded-2xl shadow-2xl overflow-hidden`}
      style={embutido ? undefined : { borderColor: COR + '44' }}>

      <div className="px-3.5 py-2.5 border-b border-gray-800 flex items-center gap-2.5 shrink-0">
        <LogoNoctis size={26} className="text-violet-300 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-gray-100 leading-none">NOCTURN</div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            supervisor · {rel?.projetos.length ?? 0} projeto{(rel?.projetos.length ?? 0) !== 1 ? 's' : ''} sob a vista
          </div>
        </div>
        <button onClick={recarregar} title="Rondar agora"
          className="text-gray-500 hover:text-gray-200 text-xs px-1.5">↻</button>
        {!embutido && (
          <button onClick={() => setAberto(false)} className="text-gray-500 hover:text-gray-200 text-lg leading-none px-1">✕</button>
        )}
      </div>

      {/* Uma aba por ronda: perguntas diferentes não se misturam numa lista só,
          e a contagem de cada uma é o que decide por onde começar. */}
      <div className="flex border-b border-gray-800 shrink-0 text-[11px] overflow-x-auto">
        {[...(rel?.rondas || []),
          // A Inbox do aprendizado é do NOCTURN por natureza: ele é quem junta
          // as observações dos agentes e escolhe o que vale perguntar.
          { id: 'aprender', rotulo: 'Aprender', desc: 'as perguntas dos agentes esperando você', total: perguntasPendentes },
          { id: 'conversa', rotulo: 'Conversa', desc: 'fale com ele', total: 0 }]
          .map(r => (
            <button key={r.id} onClick={() => setAba(r.id)} title={r.desc}
              className={`px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${aba === r.id
                ? 'text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              style={aba === r.id ? { borderColor: COR } : undefined}>
              {r.rotulo}
              {r.total > 0 && (
                <span className="ml-1 tabular-nums" style={{ color: aba === r.id ? COR : undefined }}>
                  {r.total}
                </span>
              )}
            </button>
          ))}
      </div>

      {aba === 'aprender' ? <Aprender /> : aba !== 'conversa' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!rel ? <p className="text-xs text-gray-600">rondando…</p>
            : daAba.length === 0 ? (
              <div className="h-full grid place-items-center text-center px-6">
                <div>
                  <LogoNoctis size={34} className="text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Nada nesta ronda.</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {rel.rondas.find(r => r.id === aba)?.desc}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-gray-500">
                  {daAba.length} nesta ronda · {pendentes} no total
                </p>
                {daAba.slice(0, 40).map((a, i) => (
                  <Achado key={a.projeto + (a.chave || a.evento || a.recurso || a.agente || '') + i}
                    a={a} onResolvido={recarregar} />
                ))}
                {daAba.length > 40 && (
                  <p className="text-[10px] text-gray-600 text-center pt-1">
                    e mais {daAba.length - 40} — resolva estes primeiro
                  </p>
                )}
              </>
            )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {msgs.length === 0 && (
            <p className="text-[11px] text-gray-600 leading-snug">
              Fale com o NOCTURN. Ele responde quando estiver aberto numa sessão —
              o que você escrever aqui fica esperando por ele.
            </p>
          )}
          {msgs.map(m => (
            <div key={m.id} className={`flex ${m.autor === 'voce' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-[11px] leading-snug ${
                m.autor === 'voce' ? 'bg-gray-800 text-gray-200' : 'text-gray-200'}`}
                style={m.autor === 'nocturn' ? { background: COR + '1a', border: `1px solid ${COR}33` } : undefined}>
                {m.projeto && <div className="text-[9px] text-gray-500 mb-0.5">{m.projeto}</div>}
                {m.texto}
              </div>
            </div>
          ))}
          {semResposta && (
            <p className="text-[10px] text-gray-600 text-center">esperando o NOCTURN</p>
          )}
          <div ref={fim} />
        </div>
      )}

      <div className="p-2.5 border-t border-gray-800 flex gap-2 shrink-0">
        <input value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setAba('conversa'); enviar() } }}
          placeholder="falar com o NOCTURN"
          className="flex-1 min-w-0 bg-[#1a1a1a] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-500 placeholder:text-gray-600" />
        <button onClick={() => { setAba('conversa'); enviar() }} disabled={!texto.trim()}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30"
          style={{ background: COR, color: '#0a0a0a' }}>
          enviar
        </button>
      </div>
    </div>
  )
}
