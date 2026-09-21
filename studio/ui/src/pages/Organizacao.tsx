import { useCallback, useEffect, useState } from 'react'
import { api, type Organizacao as OrgView, type AgenteOrg } from '../api'
import { KIND_META } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { abrirRecursoNaDoca } from '../lib/doca'

/**
 * A organização: quem responde a quem, e por qual domínio.
 *
 * Antes isto existia só em prosa dentro do system_prompt — o Maestro era
 * Maestro porque uma frase dizia. Aqui a cadeia é dado, e a tela é a prova:
 * bate o olho e vê se tem dono do todo, se a squad tem líder, e quem está
 * falando direto com o Maestro.
 *
 * A vista é de leitura e de ajuste ao mesmo tempo: o papel e a squad se mudam
 * no próprio card, porque descobrir que falta um líder e ter de ir para outra
 * tela arrumar é o tipo de atrito que faz ninguém arrumar.
 */

function Card({ a, papeis, squads, onMudou }: {
  a: AgenteOrg
  papeis: OrgView['papeis']
  squads: string[]
  onMudou: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const meta = papeis[a.papel]
  const Icone = getIcon(KIND_META.agent.icon)

  const mudar = async (patch: { papel?: string; squad?: string }) => {
    try { await api.definirOrganizacao(a.nome, patch); onMudou() }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="group/o rounded-xl border bg-[#161616] p-2.5 w-[15.5rem] shrink-0"
      style={{ borderColor: (meta?.cor || '#3f3f46') + '55', borderLeft: `3px solid ${meta?.cor}` }}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 w-7 h-7 rounded-md grid place-items-center"
          style={{ background: KIND_META.agent.color + '22', color: KIND_META.agent.color }}>
          <Icone size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <button onClick={() => abrirRecursoNaDoca('agent', a.nome, onMudou)}
            className="text-[12.5px] text-gray-100 font-medium leading-tight text-left hover:text-white truncate block w-full">
            {a.titulo}
          </button>
          <div className="text-[10px]" style={{ color: meta?.cor }}>{meta?.label}</div>
        </div>
        <button onClick={() => setAbrindo(v => !v)} title="Mudar papel ou squad"
          className="opacity-0 group-hover/o:opacity-100 text-gray-500 hover:text-gray-100 text-xs px-1">⋯</button>
      </div>

      {a.descricao && !abrindo && (
        <p className="text-[11px] text-gray-500 leading-snug mt-1.5 line-clamp-2">{a.descricao}</p>
      )}

      {abrindo && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1">
            {Object.entries(papeis).map(([id, p]) => (
              <button key={id} onClick={() => mudar({ papel: id })} title={p.desc}
                className={`text-[10px] px-1.5 py-1 rounded border ${
                  a.papel === id ? 'border-transparent' : 'border-gray-800 text-gray-400 hover:border-gray-700'}`}
                style={a.papel === id ? { background: p.cor + '22', color: p.cor, outline: `1px solid ${p.cor}` } : undefined}>
                {p.label.split(' ')[0]}
              </button>
            ))}
          </div>
          {a.papel !== 'maestro' && (
            <input defaultValue={a.squad} list="squads-org"
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={e => { if (e.target.value.trim() !== a.squad) mudar({ squad: e.target.value }) }}
              placeholder={a.papel === 'lider' ? 'qual squad ele lidera' : 'squad (vazio = fala direto)'}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500" />
          )}
          <datalist id="squads-org">{squads.map(s => <option key={s} value={s} />)}</datalist>
        </div>
      )}
    </div>
  )
}

export default function OrganizacaoPage() {
  const [org, setOrg] = useState<OrgView>()
  const recarregar = useCallback(() => { api.organizacao().then(setOrg) }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!org) return <p className="p-5 text-sm text-gray-600">carregando…</p>

  const squads = org.squads.map(s => s.nome)
  const comum = { papeis: org.papeis, squads, onMudou: recarregar }
  // Sem líder nenhum, a organização é rasa: o Maestro fala direto com todos, e
  // dizer isso é melhor do que desenhar uma camada que não existe.
  const rasa = org.squads.length === 0

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-4 shrink-0">
        <p className="text-xs text-gray-500 flex-1">
          {org.total} agentes · {org.squads.length} squad{org.squads.length !== 1 ? 's' : ''}
          {rasa ? ' · organização rasa: todos falam direto' : ''} · objetivos descem, conhecimento sobe
        </p>
        <button onClick={recarregar} className="text-gray-500 hover:text-gray-200 text-xs px-1.5">↻</button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="min-w-fit flex flex-col items-center gap-0">
          {/* Você no topo: a autoridade final é sua, e o desenho começa por ela. */}
          <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-[12.5px] text-gray-200">
            Você
          </div>
          <div className="w-px h-6 bg-white/[0.12]" />

          {org.maestros.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.06] px-4 py-2 text-[11.5px] text-amber-200/90">
              Sem Maestro — ninguém responde pela visão do todo
            </div>
          ) : (
            <div className="flex gap-3">
              {org.maestros.map(m => <Card key={m.nome} a={m} {...comum} />)}
            </div>
          )}

          {(org.squads.length > 0 || org.soltos.length > 0) && <div className="w-px h-6 bg-white/[0.12]" />}

          <div className="flex items-start gap-5 flex-wrap justify-center">
            {org.squads.map(s => (
              <div key={s.nome} className="flex flex-col items-center gap-0">
                <div className="text-[11px] text-gray-500 mb-1.5">{s.nome}</div>
                {s.lider
                  ? <Card a={s.lider} {...comum} />
                  : (
                    <div className="rounded-xl border border-dashed border-white/[0.14] px-3 py-2 text-[11px] text-gray-500 w-[15.5rem] text-center">
                      sem líder — falam direto com o Maestro
                    </div>
                  )}
                {s.membros.length > 0 && <div className="w-px h-5 bg-white/[0.1]" />}
                <div className="flex flex-col gap-2">
                  {s.membros.map(m => <Card key={m.nome} a={m} {...comum} />)}
                </div>
              </div>
            ))}

            {org.soltos.length > 0 && (
              <div className="flex flex-col items-center gap-0">
                <div className="text-[11px] text-gray-600 mb-1.5 italic">
                  {org.squads.length ? 'fora de squad' : 'todos os agentes'}
                </div>
                <div className="flex flex-col gap-2">
                  {org.soltos.map(m => <Card key={m.nome} a={m} {...comum} />)}
                </div>
              </div>
            )}
          </div>

          {org.lideresSemSquad.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="text-[11px] text-amber-300/80">líderes sem squad</div>
              {org.lideresSemSquad.map(l => <Card key={l.nome} a={l} {...comum} />)}
            </div>
          )}
        </div>
      </div>

      {/* Os avisos ficam embaixo, e não em cima: nada disso impede o projeto de
          funcionar — é o desenho pedindo atenção, não um erro. */}
      {org.avisos.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-2.5 space-y-1">
          {org.avisos.map((av, i) => (
            <p key={i} className="text-[11.5px] text-amber-300/80 leading-snug">{av}</p>
          ))}
        </div>
      )}
    </div>
  )
}
