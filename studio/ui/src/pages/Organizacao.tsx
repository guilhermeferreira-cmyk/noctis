import { useCallback, useEffect, useState } from 'react'
import { api, type Organizacao as OrgView, type AgenteOrg, type SquadOrg } from '../api'
import { KIND_META } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { SeletorIcone } from '../components/SeletorIcone'
import { DiscosDoAgente, useFicha } from '../components/Progresso'
import { abrirRecursoNaDoca } from '../lib/doca'

/**
 * A organização: quem responde a quem, e por qual domínio.
 *
 * Duas coisas que esta tela aprendeu depois da primeira versão, as duas por
 * reclamação justa dele:
 *
 * · **Squad é coisa, não rótulo.** Dava para ver a organização e não dava para
 *   montá-la. Agora se cria, renomeia, pinta e apaga aqui — e os agentes também
 *   podem, porque desenhar a própria organização é parte do trabalho deles.
 * · **O card é o agente de verdade.** Mesma cor, mesmo ícone, mesmas tags e o
 *   mesmo disco de nível que aparecem na grade e no mapa. Dois desenhos para a
 *   mesma coisa é como se perde a confiança na tela.
 */

function CardAgente({ a, papeis, squads, onMudou }: {
  a: AgenteOrg
  papeis: OrgView['papeis']
  squads: SquadOrg[]
  onMudou: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const meta = papeis[a.papel]
  const cor = a.cor || KIND_META.agent.color
  const Icone = getIcon(a.icone || KIND_META.agent.icon)
  // O disco de nível é a mesma leitura da grade: quem olha a organização quer
  // saber quem está experiente, não só quem está onde.
  const ficha = useFicha(a.nome)

  const mudar = async (patch: { papel?: string; squad?: string }) => {
    try { await api.definirOrganizacao(a.nome, patch); onMudou() }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className={`group/o acende rounded-xl border bg-[#161616] p-2.5 w-[16.5rem] shrink-0 ${
      a.ativo ? '' : 'opacity-50'}`}
      style={{ borderColor: cor + '44', borderLeft: `3px solid ${meta?.cor || cor}`,
               ['--cor-card' as string]: cor }}>
      <div className="flex items-start gap-2">
        {a.papel === 'agente' || a.papel === 'lider'
          ? <DiscosDoAgente ficha={ficha} cor={cor} />
          : null}
        <span className="shrink-0 w-8 h-8 rounded-md grid place-items-center"
          style={{ background: cor + '22', color: cor }}>
          <Icone size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <button onClick={() => abrirRecursoNaDoca('agent', a.nome, onMudou)}
            className="text-[12.5px] text-gray-100 font-medium leading-tight text-left hover:text-white block w-full truncate">
            {a.titulo}
          </button>
          <div className="text-[10px]" style={{ color: meta?.cor }}>
            {meta?.label}{a.modelo ? ` · ${a.modelo}` : ''}
          </div>
        </div>
        <button onClick={() => setAbrindo(v => !v)} title="Mudar papel ou squad"
          className="opacity-0 group-hover/o:opacity-100 text-gray-500 hover:text-gray-100 text-xs px-1">⋯</button>
      </div>

      {!abrindo && (
        <>
          {a.descricao && (
            <p className="text-[11px] text-gray-500 leading-snug mt-1.5 line-clamp-2">{a.descricao}</p>
          )}
          {a.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {a.tags.slice(0, 4).map(t => (
                <span key={t} className="text-[9.5px] text-gray-500 bg-white/[0.05] rounded-full px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
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
            <select value={a.squad} onChange={e => mudar({ squad: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500">
              <option value="">{a.papel === 'lider' ? '— sem squad —' : '— fala direto com o Maestro —'}</option>
              {squads.map(s => <option key={s.chave} value={s.nome}>{s.nome}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

/** O cabeçalho da squad: nome, cor, ícone e o que ela cuida — tudo editável. */
function CabecaSquad({ s, onMudou }: { s: SquadOrg; onMudou: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(s.nome)
  const [desc, setDesc] = useState(s.descricao || '')
  const Icone = getIcon(s.icone || 'GiFamilyTree')

  const salvar = async () => {
    await api.editarSquad(s.chave, { nome, descricao: desc })
    setEditando(false); onMudou()
  }

  if (editando) {
    return (
      <div className="w-[16.5rem] rounded-lg border p-2 space-y-1.5 mb-1.5"
        style={{ borderColor: s.cor + '66' }}>
        <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-100 focus:outline-none focus:border-sky-500" />
        <input value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="de que esta squad cuida"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-sky-500" />
        <div className="flex items-center gap-1.5">
          <SeletorIcone atual={s.icone || 'GiFamilyTree'} cor={s.cor} compacto
            onEscolher={async (ic: string) => { await api.editarSquad(s.chave, { icone: ic }); onMudou() }} />
          <input type="color" value={s.cor} title="cor da squad"
            onChange={async e => { await api.editarSquad(s.chave, { cor: e.target.value }); onMudou() }}
            className="w-6 h-6 bg-transparent border border-gray-700 rounded cursor-pointer" />
          <div className="flex-1" />
          <button onClick={salvar}
            className="text-[11px] bg-sky-600 hover:bg-sky-500 text-white px-2 py-0.5 rounded">salvar</button>
          <button onClick={async () => {
              const r = await api.apagarSquad(s.chave)
              if (r.soltos) alert(`${r.soltos} agente(s) ficaram sem squad.`)
              onMudou()
            }}
            className="text-[11px] text-red-400 hover:underline px-1">apagar</button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => setEditando(true)} title="Renomear, pintar, apagar"
      className="group/sq flex items-center gap-1.5 mb-1.5 max-w-[16.5rem]">
      <span className="shrink-0" style={{ color: s.cor }}><Icone size={13} /></span>
      <span className="text-[11.5px] text-gray-300 group-hover/sq:text-white truncate">{s.nome}</span>
      <span className="text-[10px] text-gray-600">
        {s.membros.length + (s.lider ? 1 : 0)}
      </span>
      <span className="text-[10px] text-gray-700 opacity-0 group-hover/sq:opacity-100">editar</span>
    </button>
  )
}

export default function OrganizacaoPage() {
  const [org, setOrg] = useState<OrgView>()
  const [nova, setNova] = useState('')
  const [criando, setCriando] = useState(false)
  const recarregar = useCallback(() => { api.organizacao().then(setOrg) }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!org) return <p className="p-5 text-sm text-gray-600">carregando…</p>

  const comum = { papeis: org.papeis, squads: org.squads, onMudou: recarregar }
  const rasa = org.squads.length === 0

  const criar = async () => {
    if (!nova.trim()) return
    try { await api.criarSquad(nova.trim()); setNova(''); setCriando(false); recarregar() }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <p className="text-xs text-gray-500 flex-1 truncate">
          {org.total} agentes · {org.squads.length} squad{org.squads.length !== 1 ? 's' : ''}
          {rasa ? ' · organização rasa: todos falam direto' : ''} · objetivos descem, conhecimento sobe
        </p>
        {criando ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input value={nova} onChange={e => setNova(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') setCriando(false) }}
              placeholder="nome da squad"
              className="w-40 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-sky-500" />
            <button onClick={criar} className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-2.5 py-1 rounded">criar</button>
            <button onClick={() => { setCriando(false); setNova('') }}
              className="text-xs text-gray-400 hover:text-gray-200 px-1">✕</button>
          </div>
        ) : (
          <button onClick={() => setCriando(true)}
            className="text-xs bg-sky-600/80 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg shrink-0">
            + Squad
          </button>
        )}
        <button onClick={recarregar} className="text-gray-500 hover:text-gray-200 text-xs px-1">↻</button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="min-w-fit flex flex-col items-center gap-0">
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
              {org.maestros.map(m => <CardAgente key={m.nome} a={m} {...comum} />)}
            </div>
          )}

          {(org.squads.length > 0 || org.soltos.length > 0) && <div className="w-px h-6 bg-white/[0.12]" />}

          <div className="flex items-start gap-5 flex-wrap justify-center">
            {org.squads.map(s => (
              <div key={s.chave} className="flex flex-col items-center gap-0">
                <CabecaSquad s={s} onMudou={recarregar} />
                {s.lider
                  ? <CardAgente a={s.lider} {...comum} />
                  : (
                    <div className="rounded-xl border border-dashed border-white/[0.14] px-3 py-2 text-[11px] text-gray-500 w-[16.5rem] text-center">
                      sem líder — falam direto com o Maestro
                    </div>
                  )}
                {s.membros.length > 0 && <div className="w-px h-5 bg-white/[0.1]" />}
                <div className="flex flex-col gap-2">
                  {s.membros.map(m => <CardAgente key={m.nome} a={m} {...comum} />)}
                </div>
                {!s.membros.length && (
                  <p className="text-[10.5px] text-gray-700 mt-1.5 w-[16.5rem] text-center">
                    vazia — mova um agente pelo ⋯ do card
                  </p>
                )}
              </div>
            ))}

            {org.soltos.length > 0 && (
              <div className="flex flex-col items-center gap-0">
                <div className="text-[11px] text-gray-600 mb-1.5 italic">
                  {org.squads.length ? 'fora de squad' : 'todos os agentes'}
                </div>
                <div className="flex flex-col gap-2">
                  {org.soltos.map(m => <CardAgente key={m.nome} a={m} {...comum} />)}
                </div>
              </div>
            )}
          </div>

          {org.lideresSemSquad.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="text-[11px] text-amber-300/80">líderes sem squad</div>
              {org.lideresSemSquad.map(l => <CardAgente key={l.nome} a={l} {...comum} />)}
            </div>
          )}
        </div>
      </div>

      {org.avisos.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-2.5 space-y-1 max-h-28 overflow-y-auto">
          {org.avisos.map((av, i) => (
            <p key={i} className="text-[11.5px] text-amber-300/80 leading-snug">{av}</p>
          ))}
        </div>
      )}
    </div>
  )
}
