import { useCallback, useEffect, useState } from 'react'
import { api, type PerguntaTese } from '../api'

/**
 * O editor das perguntas que descobrem o que uma habilidade é.
 *
 * Isto era código fixo até agora: as cinco perguntas e as teses de cada uma
 * viviam em `enquadramento.py`, fora do alcance dele. E são justamente elas que
 * definem o que o Noctis entende por habilidade — a coisa que ele mais precisa
 * controlar.
 *
 * Duas escolhas de desenho:
 *
 * · **A contagem de uso ao lado de cada tese.** Tese que nenhuma habilidade
 *   marcou não descreve trabalho real: está mal escrita ou não existe. Sem o
 *   número, a lista só cresce e ninguém sabe o que podar.
 * · **Salvar é explícito, e a lista inteira vai junto.** São perguntas que os
 *   agentes vão ler; meia edição gravada por engano vira pergunta sem sentido
 *   na fila de alguém.
 */

const TIPOS: { id: PerguntaTese['tipo']; label: string; dica: string }[] = [
  { id: 'bool', label: 'sim/não', dica: 'a tese vale ou não vale aqui' },
  { id: 'radio', label: 'uma só', dica: 'qual das teses descreve esta habilidade' },
  { id: 'multi', label: 'várias', dica: 'quais teses valem' },
]

export function PainelTeses() {
  const [perguntas, setPerguntas] = useState<PerguntaTese[]>()
  const [habilidades, setHabilidades] = useState(0)
  const [rascunho, setRascunho] = useState<PerguntaTese[]>([])
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')

  const recarregar = useCallback(() => {
    api.teses().then(r => {
      setPerguntas(r.perguntas); setRascunho(r.perguntas.map(p => ({ ...p, opcoes: [...p.opcoes] })))
      setHabilidades(r.habilidades)
    })
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!perguntas) return <p className="text-xs text-gray-600">carregando…</p>

  const sujo = JSON.stringify(rascunho.map(({ usos, respondidaPor, dispensadaPor, ...p }) => p))
    !== JSON.stringify(perguntas.map(({ usos, respondidaPor, dispensadaPor, ...p }) => p))

  const mexer = (i: number, patch: Partial<PerguntaTese>) =>
    setRascunho(r => r.map((p, j) => j === i ? { ...p, ...patch } : p))

  const salvar = async () => {
    setSalvando(true); setAviso('')
    try {
      await api.definirRegra('perguntas.habilidade',
        rascunho.map(p => ({ campo: p.campo, titulo: p.titulo, tipo: p.tipo,
                             texto: p.texto, opcoes: p.opcoes, frase: p.frase })))
      setAviso('salvo — a próxima pergunta da fila já usa isto')
      recarregar()
    } catch (e) { setAviso((e as Error).message) } finally { setSalvando(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-gray-500 leading-relaxed">
        A fila que aparece em <b className="text-gray-300">Aprender</b> e na doca da habilidade.
        Cada pergunta é uma tese, ou um conjunto de teses, respondida por escolha — nunca por
        texto livre, para a resposta poder ser comparada entre habilidades. O número ao lado de
        cada tese é quantas das {habilidades} habilidades a marcaram.
      </p>

      {rascunho.map((p, i) => (
        <section key={p.campo} className="rounded-xl border border-white/[0.08] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={p.titulo} onChange={e => mexer(i, { titulo: e.target.value })}
              className="w-44 bg-black/40 border border-white/[0.1] rounded-md px-2 py-1 text-[12px] text-gray-100 focus:outline-none focus:border-violet-500/60" />
            <div className="flex gap-1">
              {TIPOS.map(t => (
                <button key={t.id} onClick={() => mexer(i, { tipo: t.id })} title={t.dica}
                  className={`text-[10px] px-2 py-1 rounded border ${p.tipo === t.id
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
                    : 'border-white/[0.08] text-gray-500 hover:text-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <span className="text-[10px] text-gray-600">
              respondida por {p.respondidaPor}
              {p.dispensadaPor ? ` · dispensada por ${p.dispensadaPor}` : ''}
            </span>
            {/* Mover é o que decide a ordem em que ele é perguntado, e a ordem
                importa: "quando entra" antes de tudo, senão o resto não serve. */}
            <button onClick={() => setRascunho(r => {
                if (i === 0) return r
                const c = [...r]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c
              })}
              disabled={i === 0} title="subir"
              className="text-[11px] text-gray-500 hover:text-gray-200 disabled:opacity-25">↑</button>
            <button onClick={() => setRascunho(r => {
                if (i === r.length - 1) return r
                const c = [...r]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c
              })}
              disabled={i === rascunho.length - 1} title="descer"
              className="text-[11px] text-gray-500 hover:text-gray-200 disabled:opacity-25">↓</button>
            <button onClick={() => {
                if (!window.confirm(`Tirar a pergunta "${p.titulo}"? As respostas já dadas ficam guardadas.`)) return
                setRascunho(r => r.filter((_, j) => j !== i))
              }}
              title="tirar a pergunta" className="text-[11px] text-gray-500 hover:text-red-400">×</button>
          </div>

          <input value={p.texto} onChange={e => mexer(i, { texto: e.target.value })}
            placeholder="a pergunta, como ele vai ler"
            className="w-full bg-black/40 border border-white/[0.1] rounded-md px-2 py-1.5 text-[11.5px] text-gray-200 focus:outline-none focus:border-violet-500/60" />

          <div className="space-y-1">
            {p.opcoes.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-6 text-right tabular-nums"
                  title={`${p.usos?.[o] ?? 0} habilidade(s) marcaram esta tese`}>
                  {p.usos?.[o] ?? 0}
                </span>
                <input value={o}
                  onChange={e => mexer(i, { opcoes: p.opcoes.map((x, j) => j === k ? e.target.value : x) })}
                  className={`flex-1 bg-black/40 border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-violet-500/60 ${
                    (p.usos?.[o] ?? 0) === 0 ? 'border-amber-500/30 text-gray-400' : 'border-white/[0.1] text-gray-200'}`} />
                <button onClick={() => mexer(i, { opcoes: p.opcoes.filter((_, j) => j !== k) })}
                  className="text-[11px] text-gray-600 hover:text-red-400 px-1">×</button>
              </div>
            ))}
            <button onClick={() => mexer(i, { opcoes: [...p.opcoes, ''] })}
              className="text-[10.5px] text-gray-500 hover:text-gray-200 ml-8">+ tese</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 shrink-0">no documento</span>
            <input value={p.frase} onChange={e => mexer(i, { frase: e.target.value })}
              placeholder="Entra {escolhas}."
              className="flex-1 bg-black/40 border border-white/[0.1] rounded-md px-2 py-1 font-mono text-[10.5px] text-gray-300 focus:outline-none focus:border-violet-500/60" />
          </div>
          <p className="text-[10px] text-gray-600">
            {'{escolhas}'} vira as teses marcadas, em português. É esta frase que os agentes leem.
          </p>
        </section>
      ))}

      <button onClick={() => {
          const campo = window.prompt('Identificador da pergunta (sem espaço, ex.: dependencias):')?.trim()
          if (!campo) return
          setRascunho(r => [...r, { campo, titulo: campo, tipo: 'multi', texto: '',
                                    opcoes: ['', ''], frase: '{escolhas}.', usos: {},
                                    respondidaPor: 0, dispensadaPor: 0 }])
        }}
        className="text-[11px] text-gray-400 hover:text-gray-100 border border-white/[0.1] rounded-md px-2.5 py-1.5">
        + pergunta
      </button>

      <div className="sticky bottom-0 bg-[#141417]/95 pt-2 flex items-center gap-2">
        <button onClick={salvar} disabled={!sujo || salvando}
          className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-md">
          salvar as perguntas
        </button>
        {sujo && (
          <button onClick={() => setRascunho(perguntas.map(p => ({ ...p, opcoes: [...p.opcoes] })))}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">descartar</button>
        )}
        <button onClick={async () => {
            if (!window.confirm('Voltar às perguntas de fábrica? As respostas já dadas ficam guardadas.')) return
            await api.restaurarRegra('perguntas.habilidade'); recarregar()
          }}
          className="text-[11px] text-gray-500 hover:text-gray-200 px-1">voltar ao padrão</button>
        <div className="flex-1" />
        <span className="text-[11px] text-gray-500">{aviso}</span>
      </div>
    </div>
  )
}
