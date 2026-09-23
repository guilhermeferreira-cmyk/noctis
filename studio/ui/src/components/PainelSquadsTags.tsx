import { useCallback, useEffect, useState } from 'react'
import { api, type SquadOrg, type TagLearning } from '../api'
import { getIcon } from '../memoryIcons'
import { ICON_SIZES } from '../lib/kinds'
import { EsqueletoPainel } from './Esqueleto'

/**
 * Squads e tags em Configurações, e não só nas páginas onde nasceram.
 *
 * As duas são vocabulário do projeto: a squad diz como o trabalho se divide, a
 * tag diz como o conhecimento se agrupa. Quem vem arrumar a casa abre
 * Configurações — ter de caçar o gestor de tags dentro da página de Learnings
 * é a razão de ninguém arrumar.
 */

export function PainelSquads() {
  const [squads, setSquads] = useState<SquadOrg[]>()
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState('')
  const [nome, setNome] = useState('')

  const recarregar = useCallback(() => { api.organizacao().then(o => setSquads(o.squads)) }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!squads) return <EsqueletoPainel itens={3} />

  const criar = async () => {
    if (!nova.trim()) return
    try { await api.criarSquad(nova.trim()); setNova(''); recarregar() }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-gray-500 leading-relaxed">
        Como o trabalho se divide neste projeto. Você e os agentes criam squads a qualquer
        momento — apagar uma solta quem estava nela, e não apaga agente nenhum.
      </p>

      <div className="flex items-center gap-1.5">
        <input value={nova} onChange={e => setNova(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') criar() }}
          placeholder="nome da squad nova"
          className="flex-1 bg-black/40 border border-white/[0.1] rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/60" />
        <button onClick={criar} disabled={!nova.trim()}
          className="text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-md">
          criar
        </button>
      </div>

      {squads.length === 0 && (
        <p className="text-[11.5px] text-gray-600">
          Nenhuma squad: a organização está rasa, e todos falam direto com o Maestro.
        </p>
      )}

      {squads.map(s => {
        const Icone = getIcon(s.icone || 'GiFamilyTree')
        const gente = s.membros.length + (s.lider ? 1 : 0)
        return (
          <div key={s.chave} className="rounded-lg border border-white/[0.08] p-2.5"
            style={{ borderLeft: `3px solid ${s.cor}` }}>
            <div className="flex items-center gap-2">
              <span style={{ color: s.cor }}><Icone size={ICON_SIZES.squad} /></span>
              {editando === s.chave ? (
                <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Escape') setEditando('')
                    if (e.key === 'Enter') {
                      await api.editarSquad(s.chave, { nome }); setEditando(''); recarregar()
                    }
                  }}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[12px] text-gray-100 focus:outline-none focus:border-sky-500" />
              ) : (
                <button onClick={() => { setEditando(s.chave); setNome(s.nome) }}
                  className="text-[12.5px] text-gray-100 hover:text-white">{s.nome}</button>
              )}
              <span className="text-[10.5px] text-gray-600">
                {gente} {gente === 1 ? 'agente' : 'agentes'}
                {s.lider ? ` · ${s.lider.titulo}` : ' · sem líder'}
              </span>
              <div className="flex-1" />
              <input type="color" value={s.cor} title="cor"
                onChange={async e => { await api.editarSquad(s.chave, { cor: e.target.value }); recarregar() }}
                className="w-5 h-5 bg-transparent border border-gray-700 rounded cursor-pointer" />
              <button onClick={async () => {
                  if (!window.confirm(`Apagar a squad "${s.nome}"? Quem estava nela fica sem squad.`)) return
                  const r = await api.apagarSquad(s.chave)
                  if (r.soltos) alert(`${r.soltos} agente(s) ficaram sem squad.`)
                  recarregar()
                }}
                className="text-[11px] text-gray-500 hover:text-red-400 px-1">apagar</button>
            </div>
            {s.descricao && <p className="text-[11px] text-gray-500 mt-1">{s.descricao}</p>}
          </div>
        )
      })}
    </div>
  )
}

export function PainelTagsConfig() {
  const [tags, setTags] = useState<TagLearning[]>()
  const [editando, setEditando] = useState('')
  const [texto, setTexto] = useState('')

  const recarregar = useCallback(() => { api.tagsLearnings().then(r => setTags(r.tags)) }, [])
  useEffect(() => { recarregar() }, [recarregar])

  if (!tags) return <EsqueletoPainel itens={2} />

  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-gray-500 leading-relaxed">
        Como o conhecimento se agrupa. O vocabulário nasce do uso: não há lista fixa, e nome
        próprio de projeto ou arquivo é recusado — isso é memória, não tag. Renomear para uma
        tag que já existe funde as duas.
      </p>
      {tags.length === 0 && (
        <p className="text-[11.5px] text-gray-600">
          Nenhuma tag ainda. Ponha a primeira num card de Learning.
        </p>
      )}
      {tags.map(t => (
        <div key={t.tag} className="flex items-center gap-2 py-1.5 border-b border-white/[0.06] last:border-0">
          {editando === t.tag ? (
            <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus
              onKeyDown={async e => {
                if (e.key === 'Escape') setEditando('')
                if (e.key === 'Enter') {
                  try { await api.renomearTag(t.tag, texto); setEditando(''); recarregar() }
                  catch (err) { alert((err as Error).message) }
                }
              }}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[12px] text-gray-100 focus:outline-none focus:border-violet-500" />
          ) : (
            <button onClick={() => { setEditando(t.tag); setTexto(t.tag) }}
              className="flex-1 text-left text-[12px] text-gray-200 hover:text-white">{t.tag}</button>
          )}
          <span className={`text-[11px] tabular-nums ${t.solta ? 'text-amber-500/80' : 'text-gray-600'}`}
            title={t.solta ? 'usada uma vez só — vale fundir com outra' : `${t.usos} learnings`}>
            {t.usos}
          </span>
          <button onClick={async () => {
              if (!window.confirm(`Tirar "${t.tag}" de ${t.usos} Learning(s)? Os Learnings ficam.`)) return
              await api.apagarTagLearning(t.tag); recarregar()
            }}
            className="text-[11px] text-gray-500 hover:text-red-400 px-1">tirar</button>
        </div>
      ))}
    </div>
  )
}
