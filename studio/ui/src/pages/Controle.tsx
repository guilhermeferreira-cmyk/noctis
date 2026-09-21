import { useCallback, useEffect, useState } from 'react'
import { GiControlTower } from 'react-icons/gi'
import { api, type ControleView } from '../api'
import { PainelRegras } from '../components/PainelRegras'

/**
 * Controle — o Noctis visto de cima.
 *
 * O objetivo do sistema é o trabalho com agentes ficar mais certeiro e mais
 * barato. Esta página mede as duas coisas que dizem se isso está acontecendo:
 *
 *   · os agentes estão ESCREVENDO o que aprendem? (habilidades, descrições)
 *   · os agentes estão LENDO o que foi aprendido? (consultas)
 *
 * Escrever sem ler é arquivo morto; ler sem escrever é o projeto consumindo o que
 * outro pagou para aprender. A razão entre os dois é o número que mais importa
 * aqui, e é o primeiro que a tabela mostra.
 */

function leitura(p: ControleView['projetos'][number]) {
  if (!p.eventos) return { texto: '—', cor: '#52525b', dica: 'sem trabalho registrado' }
  const r = p.consultas / p.eventos
  if (r >= 0.8) return { texto: `${p.consultas}/${p.eventos}`, cor: '#10b981', dica: 'consultam antes de trabalhar' }
  if (r >= 0.3) return { texto: `${p.consultas}/${p.eventos}`, cor: '#f59e0b', dica: 'consultam às vezes' }
  return { texto: `${p.consultas}/${p.eventos}`, cor: '#ef4444', dica: 'escrevem muito mais do que leem' }
}

export default function ControlePage({ onAbrirProjeto }: { onAbrirProjeto: (slug: string) => void }) {
  const [dados, setDados] = useState<ControleView>()
  const [lixo, setLixo] = useState<{ id: string; slug: string; quando: string; nome: string }[]>([])
  const [ocupado, setOcupado] = useState('')
  const [aba, setAba] = useState<'regras' | 'projetos'>('regras')

  const recarregar = useCallback(() => {
    api.controle().then(setDados)
    api.lixeira().then(r => setLixo(r.itens))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const agir = async (id: string, fn: () => Promise<unknown>) => {
    setOcupado(id)
    try { await fn(); recarregar() }
    catch (e) { alert((e as Error).message) }
    finally { setOcupado('') }
  }

  const totais = (dados?.projetos || []).reduce((t, p) => ({
    agentes: t.agentes + p.agentes, skills: t.skills + p.skills,
    eventos: t.eventos + p.eventos, consultas: t.consultas + p.consultas,
  }), { agentes: 0, skills: 0, eventos: 0, consultas: 0 })

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent shrink-0">
        <p className="text-xs text-gray-500">
          {totais.agentes} agentes · {totais.skills} habilidades · {totais.eventos} trabalhos registrados ·
          {' '}{totais.consultas} consultas
        </p>
      </div>

      {/* Regras primeiro: é o que diz o que o Noctis exige. Projetos é o que
          acontece sob essas regras. */}
      <div className="flex border-b border-gray-800 bg-[#111111] px-5 shrink-0 text-xs">
        {([['regras', 'Regras'], ['projetos', 'Projetos e lixeira']] as const).map(([id, rot]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-3 py-2 border-b-2 -mb-px ${aba === id
              ? 'text-gray-100 border-sky-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {rot}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {aba === 'regras' ? <PainelRegras /> : <>
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Projetos</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-xs">
              <thead className="bg-[#141414] text-gray-500">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Projeto</th>
                  <th className="px-3 py-2 font-medium" title="consultas / trabalhos registrados">Leitura</th>
                  <th className="px-3 py-2 font-medium">Habilidades</th>
                  <th className="px-3 py-2 font-medium" title="agentes com o protocolo de aprendizado instalado">Protocolo</th>
                  <th className="px-3 py-2 font-medium">Agentes</th>
                  <th className="px-3 py-2 font-medium">Memórias</th>
                  <th className="px-3 py-2 font-medium">Última atividade</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(dados?.projetos || []).map(p => {
                  const l = leitura(p)
                  const semProtocolo = p.agentes - p.protocolo
                  return (
                    <tr key={p.slug} className="border-t border-gray-800 hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5">
                        <button onClick={() => onAbrirProjeto(p.slug)}
                          className="text-gray-200 hover:text-white font-medium text-left">
                          {p.nome}
                        </button>
                        {p.repositorio && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-gray-500 bg-gray-800"
                            title="Repositório de código dentro de projects/. O Noctis não move nem apaga.">
                            repositório
                          </span>
                        )}
                        {p.permanente && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ color: '#a78bfa', background: '#a78bfa1f' }}
                            title="A base de conhecimento: não se apaga, e todo projeto a consulta">
                            base
                          </span>
                        )}
                        <div className="text-[10px] text-gray-600 font-mono">{p.slug}</div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" title={l.dica} style={{ color: l.cor }}>{l.texto}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-300">
                        {p.skills}
                        {p.skills > 0 && (
                          <span className="text-gray-600"> · {p.firmadas} firmada{p.firmadas !== 1 ? 's' : ''}</span>
                        )}
                        {p.semDescricao > 0 && (
                          <span className="text-amber-500/80"> · {p.semDescricao} sem descrição</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {p.agentes === 0 ? <span className="text-gray-700">—</span>
                          : semProtocolo === 0
                            ? <span className="text-emerald-500">{p.protocolo}/{p.agentes}</span>
                            : <button disabled={ocupado === p.slug}
                                onClick={() => agir(p.slug, () => api.instalarProtocolo(p.slug))}
                                className="text-amber-400 hover:underline">
                                {p.protocolo}/{p.agentes} · instalar
                              </button>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-400">{p.agentes}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-400">{p.memorias}</td>
                      <td className="px-3 py-2.5 text-gray-500 tabular-nums">
                        {p.ultima ? p.ultima.slice(0, 10) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!p.permanente && !p.repositorio && (
                          <button disabled={ocupado === p.slug}
                            onClick={() => {
                              if (!window.confirm(`Mandar "${p.nome}" para a lixeira? Dá para restaurar depois.`)) return
                              agir(p.slug, () => api.deleteProject(p.slug))
                            }}
                            className="text-[11px] text-gray-600 hover:text-red-400">
                            lixeira
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-600 mt-2 leading-snug max-w-3xl">
            <b className="text-gray-500">Leitura</b> é consultas por trabalho registrado. Verde quando os
            agentes consultam antes de agir; vermelho quando escrevem muito mais do que leem — aprendizado
            que ninguém lê não está deixando o trabalho mais barato.
          </p>
        </section>

        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
            Lixeira {lixo.length > 0 && <span className="text-gray-600">({lixo.length})</span>}
          </h3>
          {lixo.length === 0 ? (
            <p className="text-xs text-gray-600">
              Vazia. Projeto excluído vem para cá, e só sai de verdade quando você apaga daqui.
            </p>
          ) : (
            <div className="space-y-1.5">
              {lixo.map(i => (
                <div key={i.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-[#141414] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-300">{i.nome}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{i.slug} · excluído em {i.quando}</div>
                  </div>
                  <button disabled={ocupado === i.id}
                    onClick={() => agir(i.id, () => api.restaurarProjeto(i.id))}
                    className="text-[11px] text-sky-400 hover:underline">restaurar</button>
                  <button disabled={ocupado === i.id}
                    onClick={() => {
                      if (!window.confirm(`Apagar "${i.nome}" de vez? Esta é a única ação sem volta.`)) return
                      agir(i.id, () => api.apagarDeVez(i.id))
                    }}
                    className="text-[11px] text-red-400 hover:underline">apagar de vez</button>
                </div>
              ))}
            </div>
          )}
        </section>
        </>}
      </div>
    </div>
  )
}
