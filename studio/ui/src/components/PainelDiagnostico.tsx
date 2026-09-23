import { useCallback, useEffect, useState } from 'react'
import { api, type AchadoDiagnostico, type DadosProjeto } from '../api'

/**
 * Duas perguntas que não tinham resposta em lugar nenhum:
 * "o que está inconsistente aqui?" e "onde isso é guardado?".
 *
 * O NOCTURN olha o TRABALHO — agente parado, entrega sem confirmação. Estes dois
 * painéis olham a ESTRUTURA: Learning sem tese respondida, hipótese esperando,
 * aprendizado que ninguém reusou, regra fora do padrão, e o peso de cada arquivo.
 *
 * Nada aqui impede o projeto de funcionar. É painel de saúde, não lista de erro —
 * e é por isso que cada achado diz o que fazer, e não só o que está errado.
 */

const COR: Record<string, string> = {
  alta: '#f87171', media: '#f59e0b', baixa: '#a1a1aa', info: '#38bdf8',
}

function Achado({ a }: { a: AchadoDiagnostico }) {
  const [aberto, setAberto] = useState(false)
  const cor = COR[a.gravidade] || '#a1a1aa'
  return (
    <div className="rounded-lg border border-white/[0.08] p-3"
      style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-gray-100">{a.titulo}</div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{a.detalhe}</p>
        </div>
        <span className="text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
          style={{ color: cor, background: cor + '1f' }}>{a.onde}</span>
      </div>
      {a.itens.length > 0 && (
        <button onClick={() => setAberto(v => !v)}
          className="text-[10.5px] text-gray-500 hover:text-gray-200 mt-1.5">
          {aberto ? 'esconder' : `ver ${a.itens.length}`}
        </button>
      )}
      {aberto && (
        <ul className="mt-1.5 space-y-0.5 pl-2 border-l border-white/[0.08]">
          {a.itens.map((i, k) => (
            <li key={k} className="text-[11px] text-gray-400 leading-snug">{i}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-500 mt-1.5">
        <span className="text-gray-600">o que fazer: </span>{a.acao}
      </p>
    </div>
  )
}

export function PainelDiagnostico() {
  const [achados, setAchados] = useState<AchadoDiagnostico[]>()
  const recarregar = useCallback(() => { api.diagnostico().then(r => setAchados(r.achados)) }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!achados) return <p className="text-xs text-gray-600">olhando…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11.5px] text-gray-500 flex-1 leading-relaxed">
          O estado da estrutura deste projeto agora. Nada disso impede o Noctis de funcionar —
          é o que vale a sua atenção, em ordem.
        </p>
        <button onClick={recarregar} className="text-[11px] text-gray-500 hover:text-gray-200 px-1">↻</button>
      </div>
      {achados.length === 0 ? (
        <p className="text-[12px] text-emerald-300/80 leading-relaxed">
          Nada torto: os Learnings estão descritas, as hipóteses respondidas, os aprendizados
          em uso e a organização completa.
        </p>
      ) : achados.map(a => <Achado key={a.id} a={a} />)}
    </div>
  )
}

const kb = (n: number) => n < 1024 ? `${n} B`
  : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

export function PainelDados() {
  const [d, setD] = useState<DadosProjeto>()
  useEffect(() => { api.dados().then(setD) }, [])
  if (!d) return <p className="text-xs text-gray-600">medindo…</p>

  const linha = (i: DadosProjeto['itens'][0]) => (
    <div key={i.caminho} className="flex items-start gap-3 py-2 border-b border-white/[0.06] last:border-0">
      <div className="min-w-0 flex-1">
        <code className={`text-[11.5px] ${i.existe ? 'text-gray-200' : 'text-gray-600'}`}>
          {i.caminho}
        </code>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{i.desc}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[11px] text-gray-300 tabular-nums">{i.existe ? kb(i.bytes) : '—'}</div>
        {i.arquivos > 1 && (
          <div className="text-[10px] text-gray-600 tabular-nums">{i.arquivos} arquivos</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-[11.5px] text-gray-500 leading-relaxed">
        Tudo do Noctis é arquivo legível na sua máquina — nada de banco, nada preso. Esta é a
        lista, com o que cada coisa guarda e quanto pesa.
      </p>
      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-1">
          Deste projeto <span className="text-gray-600 font-normal">· {kb(d.total)}</span>
        </h3>
        <code className="text-[10.5px] text-gray-600 break-all">{d.pasta}</code>
        <div className="mt-2">{d.itens.map(linha)}</div>
      </section>
      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-1">Do Noctis inteiro</h3>
        <p className="text-[11px] text-gray-500 mb-1.5">
          Fora de projeto: vale para todos. Nada disso vai para o git.
        </p>
        <div>{d.globais.map(linha)}</div>
      </section>
    </div>
  )
}
