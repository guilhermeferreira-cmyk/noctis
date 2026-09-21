import { useCallback, useEffect, useState } from 'react'
import { GiPadlock } from 'react-icons/gi'
import { api, type Regra, type RegrasView } from '../api'
import { Switch } from './Switch'

/**
 * Todas as regras do Noctis, num lugar só, com o valor que está valendo agora.
 *
 * O código lê destas mesmas regras na hora de aplicar — o que aparece aqui é o
 * que acontece, e não uma documentação que pode ter envelhecido. Mudar uma
 * regra do protocolo reescreve o prompt de todos os agentes na hora.
 */

const ONDE: Record<string, { rotulo: string; dica: string }> = {
  servidor:  { rotulo: 'servidor',  dica: 'a API recusa ou calcula' },
  protocolo: { rotulo: 'protocolo', dica: 'está escrito no prompt dos agentes' },
  cli:       { rotulo: 'comando',   dica: 'o comando que os agentes rodam cobra ou avisa' },
  nocturn:   { rotulo: 'NOCTURN',   dica: 'vira achado na ronda do supervisor' },
}

function mostrar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'ligada' : 'desligada'
  if (Array.isArray(v)) return `base ${v[0]}, expoente ${v[1]}`
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(' · ')
  return String(v)
}

function Numero({ valor, min, max, passo, onSalvar }: {
  valor: number; min?: number; max?: number; passo?: number; onSalvar: (n: number) => void
}) {
  const [t, setT] = useState(String(valor))
  useEffect(() => { setT(String(valor)) }, [valor])
  const salvar = () => {
    const n = Number(t.replace(',', '.'))
    if (!Number.isNaN(n) && n !== valor) onSalvar(n)
    else setT(String(valor))
  }
  return (
    <input value={t} onChange={e => setT(e.target.value)} onBlur={salvar}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      inputMode="decimal" title={`de ${min ?? '—'} a ${max ?? '—'}${passo ? `, passo ${passo}` : ''}`}
      className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 tabular-nums focus:outline-none focus:border-sky-500" />
  )
}

function Controle({ r, onSalvar }: { r: Regra; onSalvar: (v: unknown) => void }) {
  if (r.fixa) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-gray-500" title="Proteção fixa — não se edita">
        <GiPadlock size={13} aria-hidden="true" /> fixa
      </span>
    )
  }
  if (r.tipo === 'bool') {
    return <Switch ligado={!!r.valor} cor="#38bdf8" rotulo={r.valor ? 'ligada' : 'desligada'}
      onMudar={v => onSalvar(v)} />
  }
  if (r.tipo === 'int' || r.tipo === 'float') {
    return <Numero valor={r.valor as number} min={r.min} max={r.max} passo={r.passo}
      onSalvar={n => onSalvar(n)} />
  }
  if (r.tipo === 'mapa') {
    const m = r.valor as Record<string, number>
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-end max-w-[26rem]">
        {Object.entries(m).map(([k, x]) => (
          <label key={k} className="flex items-center gap-1.5 text-[11px] text-gray-400">
            {k}
            <Numero valor={x} min={r.min} max={r.max} passo={r.passo}
              onSalvar={n => onSalvar({ ...m, [k]: n })} />
          </label>
        ))}
      </div>
    )
  }
  if (r.tipo === 'curva') {
    const [base, expo] = r.valor as [number, number]
    const nivel = (n: number) => Math.round(base * Math.pow(n, expo))
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          base <Numero valor={base} onSalvar={n => onSalvar([n, expo])} />
          expoente <Numero valor={expo} onSalvar={n => onSalvar([base, n])} />
        </div>
        <span className="text-[10px] text-gray-600 tabular-nums">
          nv2 = {nivel(2)} · nv5 = {nivel(5)} · nv10 = {nivel(10)} XP
        </span>
      </div>
    )
  }
  return null
}

export function PainelRegras({ area, mostrarProtocolo = true }: {
  /** Mostra só uma área (Protocolo, Habilidades…). Sem ela, todas. */
  area?: string
  /** O texto que os agentes recebem — faz sentido junto do Protocolo. */
  mostrarProtocolo?: boolean
} = {}) {
  const [dados, setDados] = useState<RegrasView>()
  const [protocolo, setProtocolo] = useState('')
  const [aviso, setAviso] = useState('')

  const recarregar = useCallback(() => {
    api.regras().then(setDados)
    api.protocoloAtual().then(r => setProtocolo(r.texto))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const salvar = async (r: Regra, v: unknown) => {
    try {
      const res = await api.definirRegra(r.id, v)
      const n = Object.values(res.protocoloAtualizadoEm || {}).reduce((a, b) => a + b, 0)
      setAviso(n ? `"${r.titulo}" mudou — o protocolo foi reescrito em ${n} agentes.` : `"${r.titulo}" mudou.`)
      recarregar()
    } catch (e) { alert((e as Error).message) }
  }
  const restaurar = async (r: Regra) => {
    await api.restaurarRegra(r.id)
    setAviso(`"${r.titulo}" voltou ao padrão.`)
    recarregar()
  }

  if (!dados) return <p className="text-xs text-gray-600">carregando regras…</p>

  const alteradas = dados.regras.filter(r => r.alterada).length

  return (
    <div className="space-y-6">
      {!area && <p className="text-xs text-gray-500 max-w-3xl leading-relaxed">
        Estas são <b className="text-gray-300">todas</b> as regras que o Noctis aplica — {dados.regras.length} no
        total, {alteradas} diferente{alteradas !== 1 ? 's' : ''} do padrão. O código lê daqui na hora de aplicar:
        o que está escrito é o que acontece.
      </p>}

      {aviso && (
        <div className="text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2 flex items-center">
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso('')} className="text-sky-400/60 hover:text-sky-200">✕</button>
        </div>
      )}

      {/* O que os agentes leem: é a regra mais importante, porque é a única que
          eles de fato veem. Montada a partir das regras abaixo. */}
      {mostrarProtocolo && <section>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">O que todo agente recebe hoje</h3>
        <pre className="text-[11px] leading-relaxed text-gray-300 bg-[#0f0f0f] border border-gray-800 rounded-xl p-3.5 whitespace-pre-wrap font-mono">
          {protocolo}
        </pre>
        <p className="text-[10px] text-gray-600 mt-1.5">
          Montado a partir das regras de Protocolo. Muda sozinho quando elas mudam.
        </p>
      </section>}

      {dados.areas.filter(a => !area || a.id === area).map(area => {
        const lista = dados.regras.filter(r => r.area === area.id)
        if (!lista.length) return null
        return (
          <section key={area.id}>
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-gray-200">{area.titulo}</h3>
              <p className="text-[11px] text-gray-600">{area.desc}</p>
            </div>
            <div className="rounded-xl border border-gray-800 divide-y divide-gray-800">
              {lista.map(r => {
                const dependeDesligada = r.depende
                  && dados.regras.find(x => x.id === r.depende)?.valor === false
                return (
                  <div key={r.id} className={`px-4 py-3 flex gap-4 ${dependeDesligada ? 'opacity-40' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-100">{r.titulo}</span>
                        {r.alterada && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-amber-300 bg-amber-500/15"
                            title={`padrão: ${mostrar(r.padrao)}`}>
                            alterada
                          </span>
                        )}
                        {r.onde.map(o => (
                          <span key={o} title={ONDE[o]?.dica}
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded text-gray-500 bg-gray-800">
                            {ONDE[o]?.rotulo || o}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-snug">{r.faz}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
                        <span className="text-gray-500">Por quê:</span> {r.porque}
                      </p>
                      {r.estado && (
                        <p className="text-[11px] text-amber-500/70 mt-0.5 leading-snug">{r.estado}</p>
                      )}
                      {dependeDesligada && (
                        <p className="text-[11px] text-gray-500 mt-0.5">sem efeito enquanto a regra de que depende está desligada</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                      <Controle r={r} onSalvar={v => salvar(r, v)} />
                      {r.alterada && (
                        <button onClick={() => restaurar(r)} className="text-[10px] text-gray-500 hover:text-gray-200">
                          voltar ao padrão ({mostrar(r.padrao)})
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
