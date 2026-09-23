import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type TrabalhoRegistrado, type AgenteNoRuntime } from '../api'
import { doSistema } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { EsqueletoLinhas } from '../components/Esqueleto'
import { FiltroProjetos, useFiltroProjetos } from '../components/FiltroProjetos'
import { desde } from '../components/Ordenar'

/**
 * Runtime — o sistema RODANDO, e o que já rodou.
 *
 * A pergunta desta tela é QUEM TRABALHOU. Antes ela só listava usos de
 * `SKILL.md`, e com isso um despacho que não declarou `--skill` simplesmente
 * não existia aqui — o que é mentira sobre o trabalho. Agora a unidade é o
 * evento de trabalho, e a Skill usada é um detalhe dele.
 *
 * Duas noções de tempo convivem, e é importante não confundi-las:
 *
 *   · "agora" é uma JANELA de minutos sobre o mesmo dado. Um Skill do Claude
 *     se consome dentro de um turno, então o evento que registra o trabalho
 *     já é o momento de declarar o uso; não há "comecei"/"terminei".
 *   · o histórico NÃO tem janela. Ele é para durar, e por isso vem paginado:
 *     a tela pede um punhado por vez e vai buscando mais conforme se rola.
 *     Sem isso, guardar tudo para sempre acabaria custando a velocidade.
 */

const JANELAS = [5, 15, 60, 240]
const POR_PAGINA = 50

function LinhaTrabalho({ u, cor }: { u: TrabalhoRegistrado; cor: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-3.5 py-2.5 flex items-start gap-3">
      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: u.agora ? cor : '#3f3f46' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-gray-200">{u.agente || '(sem agente)'}</span>
          {u.skills.map(s => (
            <code key={s} className="text-[11px] px-1.5 py-0.5 rounded-md max-w-[16rem] truncate"
              style={{ background: cor + '1e', color: cor }} title={s}>{s}</code>
          ))}
          <span className="text-[10.5px] text-gray-600">{u.projetoNome}</span>
          <span className="flex-1" />
          <span className="text-[10.5px] text-gray-600 shrink-0" title={u.quando}>{desde(u.quando)}</span>
        </div>
        <p className="text-[11.5px] text-gray-500 truncate mt-0.5">
          <span className="text-gray-600">{u.tipo}</span>
          {u.resumo ? ` · ${u.resumo}` : ''}
          {u.despacho ? ` · ${u.despacho}` : ''}
        </p>
      </div>
    </div>
  )
}

/** A ficha de um agente: é este bloco que "documenta quem trabalhou". */
function CardAgente({ f, cor }: { f: AgenteNoRuntime; cor: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 bg-[#151515] min-w-0"
      style={{ borderColor: f.agora ? cor + '55' : 'rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2">
        {f.agora && <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
          style={{ background: cor }} />}
        <span className="text-[12px] text-gray-100 truncate flex-1">{f.agente}</span>
        <span className="text-[11px] tabular-nums shrink-0" style={{ color: cor }}>{f.eventos}</span>
      </div>
      <p className="text-[10.5px] text-gray-600 truncate mt-0.5">{f.projetoNome}</p>
      <p className="text-[10.5px] text-gray-500 mt-1" title={`último: ${f.ultimo}`}>
        {f.agora ? 'trabalhando agora' : `último há ${desde(f.ultimo)}`}
      </p>
      {f.skills.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {f.skills.slice(0, 3).map(s => (
            <code key={s} className="text-[10px] px-1 py-0.5 rounded max-w-[11rem] truncate
                                     text-gray-500 bg-white/[0.04]" title={s}>{s}</code>
          ))}
          {f.skills.length > 3 && (
            <span className="text-[10px] text-gray-600">+{f.skills.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function RuntimePage() {
  const icone = doSistema('secao.runtime', 'GiPulse', '#f472b6')
  const Icone = getIcon(icone.icon)
  const { projetos, setProjetos, ativos, alternar, limpar } = useFiltroProjetos('runtime')

  const [janela, setJanela] = useState(15)
  const [lista, setLista] = useState<TrabalhoRegistrado[] | null>(null)
  const [agentes, setAgentes] = useState<AgenteNoRuntime[]>([])
  const [total, setTotal] = useState(0)
  const [proxima, setProxima] = useState<string | null>(null)
  const [buscandoMais, setBuscandoMais] = useState(false)

  // A primeira página (e as recargas automáticas) trocam a lista inteira; as
  // seguintes só acrescentam. Guardar o cursor em ref evita que o timer de
  // recarga feche sobre um valor velho.
  const cursor = useRef<string | null>(null)

  const recarregar = useCallback(() => {
    api.runtime(janela, ativos, '', POR_PAGINA)
      .then(r => {
        setLista(r.usos)
        setAgentes(r.agentes)
        setTotal(r.total)
        setProxima(r.proxima)
        cursor.current = r.proxima
        setProjetos(r.projetos)
      })
      .catch(() => setLista([]))
  }, [janela, ativos, setProjetos])

  const carregarMais = useCallback(() => {
    const c = cursor.current
    if (!c || buscandoMais) return
    setBuscandoMais(true)
    api.runtime(janela, ativos, c, POR_PAGINA)
      .then(r => {
        // Concatenar sem confiar no servidor: se uma recarga tiver passado no
        // meio, um id repetido entraria duas vezes na tela.
        setLista(atual => {
          const vistos = new Set((atual || []).map(u => u.id))
          return [...(atual || []), ...r.usos.filter(u => !vistos.has(u.id))]
        })
        setProxima(r.proxima)
        cursor.current = r.proxima
      })
      .finally(() => setBuscandoMais(false))
  }, [janela, ativos, buscandoMais])

  // Uma tela chamada Runtime não pode ser um retrato parado: ela relê sozinha,
  // porque a pergunta que responde ("o que está rodando?") muda sem ninguém
  // clicar. A recarga volta à primeira página de propósito.
  useEffect(() => {
    recarregar()
    const t = setInterval(recarregar, 20000)
    return () => clearInterval(t)
  }, [recarregar])

  // Rolar até o fim busca a página seguinte, em vez de exigir um clique.
  const fim = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = fim.current
    if (!el || !proxima) return
    const obs = new IntersectionObserver(e => { if (e[0]?.isIntersecting) carregarMais() },
                                         { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [proxima, carregarMais])

  const trabalhando = agentes.filter(a => a.agora)
  const jaTrabalharam = agentes.filter(a => !a.agora)
  const contagem: Record<string, number> = {}
  for (const a of agentes) contagem[a.projeto] = (contagem[a.projeto] || 0) + a.eventos

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <span style={{ color: icone.color }}><Icone size={16} /></span>
        <p className="text-xs text-gray-500 flex-1">
          {trabalhando.length} agente{trabalhando.length !== 1 ? 's' : ''} trabalhando nos
          {' '}últimos {janela} min · {agentes.length} no histórico ·
          {' '}{total} registro{total !== 1 ? 's' : ''} guardados
        </p>
        <div className="flex items-center gap-1">
          {JANELAS.map(j => (
            <button key={j} onClick={() => setJanela(j)}
              title="A janela vale só para “agora”; o histórico é inteiro"
              className={`text-[11px] px-2 py-1 rounded-lg border ${
                j === janela ? 'border-white/20 bg-white/[0.08] text-gray-100'
                             : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
              {j < 60 ? `${j}min` : `${j / 60}h`}
            </button>
          ))}
        </div>
      </div>

      <FiltroProjetos projetos={projetos} ativos={ativos} contagem={contagem}
        onAlternar={alternar} onLimpar={limpar} />

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[12.5px]" style={{ color: icone.color }}>Trabalhando agora</h2>
            <span className="text-[11px] text-gray-600">janela de {janela} minutos</span>
          </div>
          {lista === null ? <EsqueletoLinhas linhas={2} className="max-w-sm opacity-40" />
            : trabalhando.length === 0 ? (
              <p className="text-[12px] text-gray-600">
                Nenhum agente registrou trabalho nos últimos {janela} minutos.
              </p>
            ) : (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
                {trabalhando.map(f => (
                  <CardAgente key={f.projeto + f.agente} f={f} cor={icone.color} />
                ))}
              </div>
            )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[12.5px] text-gray-300">Quem já trabalhou</h2>
            <span className="text-[11px] text-gray-600">
              o histórico inteiro, não só a janela
            </span>
          </div>
          {jaTrabalharam.length === 0 ? (
            <p className="text-[12px] text-gray-600">Nada registrado ainda.</p>
          ) : (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
              {jaTrabalharam.map(f => (
                <CardAgente key={f.projeto + f.agente} f={f} cor={icone.color} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[12.5px] text-gray-300">Registro</h2>
            <span className="text-[11px] text-gray-600">
              {lista ? `${lista.length} de ${total}` : '…'} · vai buscando mais conforme você rola
            </span>
          </div>
          {lista === null ? <EsqueletoLinhas linhas={4} className="opacity-40" />
            : lista.length === 0 ? (
              <p className="text-[12px] text-gray-600">
                Nada registrado ainda. Um agente registra trabalho com
                {' '}<code>xp.py &lt;projeto&gt; &lt;agente&gt; entrega "..."</code>.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {lista.map(u => <LinhaTrabalho key={u.id} u={u} cor={icone.color} />)}
                </div>
                <div ref={fim} className="h-8 grid place-items-center">
                  {buscandoMais && <span className="text-[11px] text-gray-600">carregando…</span>}
                  {!proxima && lista.length > 0 && (
                    <span className="text-[11px] text-gray-700">fim do histórico</span>
                  )}
                </div>
              </>
            )}
        </section>
      </div>
    </div>
  )
}
