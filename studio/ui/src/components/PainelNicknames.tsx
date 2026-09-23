import { useEffect, useState } from 'react'
import { api, type NicknameAplicado } from '../api'
import { EsqueletoLinhas } from './Esqueleto'

/**
 * Arquétipos e nicknames — o que existe, e quem é quem.
 *
 * Esta tela nasceu de uma cobrança justa: muita coisa foi adicionada e virou
 * comportamento sem botão. Aqui ficam as duas que não tinham lugar nenhum — o
 * banco de nicknames e a biblioteca de arquétipos.
 *
 * O identificador aparece ao lado do nickname de propósito. São as duas caras
 * do mesmo agente aplicado, e a única regra que o nickname tem é NÃO ser
 * endereço — vê-los juntos é o que impede confundi-los.
 */

function Linha({ a, onTrocado }: { a: NicknameAplicado; onTrocado: () => void }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(a.nickname)
  const [erro, setErro] = useState('')

  const salvar = async () => {
    setErro('')
    try {
      await api.trocarNickname(a.projeto, a.agente, valor.trim())
      setEditando(false)
      onTrocado()
    } catch (e) {
      // O 409 é a regra do banco falando: nickname não se repete.
      const m = (e as Error).message
      setErro(m.includes('409') ? 'esse nickname já é de outro agente' : m)
    }
  }

  return (
    <div className="flex items-center gap-3 px-2.5 py-2 border-b border-gray-850 last:border-0"
      style={{ borderColor: '#1f1f1f' }}>
      <div className="w-[9rem] shrink-0">
        {editando ? (
          <input value={valor} autoFocus
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
            onBlur={salvar}
            className="w-full bg-black/30 border border-white/20 rounded px-1.5 py-0.5
                       text-[12px] text-gray-100 outline-none" />
        ) : (
          <button onClick={() => { setValor(a.nickname); setEditando(true) }}
            className="text-[12.5px] text-gray-100 hover:text-white text-left" title="Trocar o nickname">
            {a.nickname}
          </button>
        )}
        {erro && <div className="text-[10px] text-red-400 mt-0.5">{erro}</div>}
      </div>
      <code className="text-[11px] text-gray-500 flex-1 truncate">{a.identificador}</code>
      {!a.existe && (
        <span className="text-[10px] text-amber-500/70 shrink-0"
          title="O agente deste identificador não existe mais — o nome segue preso ao banco">
          agente sumiu
        </span>
      )}
    </div>
  )
}

export function PainelNicknames() {
  const [d, setD] = useState<{ nicknames: NicknameAplicado[]; usados: number; livres: number
                               banco: number; liberados: { identificador: string; nickname: string }[] } | null>(null)
  const [q, setQ] = useState('')

  const carregar = () => api.nicknames().then(setD).catch(() => setD(null))
  useEffect(() => { carregar() }, [])

  if (!d) return <EsqueletoLinhas linhas={6} className="opacity-40" />

  const filtro = q.trim().toLowerCase()
  const lista = filtro
    ? d.nicknames.filter(a => (a.nickname + ' ' + a.identificador).toLowerCase().includes(filtro))
    : d.nicknames

  return (
    <>
      <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
        Cada agente aplicado tem um <strong className="text-gray-300">nickname</strong>, pelo qual se
        chama, e um <strong className="text-gray-300">identificador</strong>, pelo qual se endereça.
        O nickname nunca se repete e nunca endereça nada — por isso trocá-lo não quebra referência
        nenhuma. Os nomes saem da linha do Noctis: estrelas e constelações.
      </p>

      <div className="flex items-center gap-3 mb-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="buscar nickname ou identificador"
          className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-[11.5px]
                     text-gray-200 outline-none focus:border-white/25" />
        <span className="text-[11px] text-gray-600 shrink-0 tabular-nums">
          {d.usados} em uso · {d.livres} livres de {d.banco}
        </span>
      </div>

      {/* Liberar em silêncio seria pior do que deixar preso: o nome de um
          agente aparece no histórico de quem leu. */}
      {d.liberados?.length > 0 && (
        <p className="text-[11px] text-gray-400 mb-2">
          {d.liberados.length} nickname{d.liberados.length !== 1 ? 's' : ''} voltou ao banco —
          o agente não existe mais: {d.liberados.map(l => l.nickname).join(', ')}.
        </p>
      )}
      {d.livres === 0 && (
        <p className="text-[11px] text-amber-500/80 mb-2">
          O banco acabou. Os próximos agentes recebem nome numerado — feio, mas sem repetir.
        </p>
      )}

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {lista.length === 0
          ? <p className="text-[12px] text-gray-600 px-3 py-4">Nada com esse termo.</p>
          : lista.map(a => <Linha key={a.identificador} a={a} onTrocado={carregar} />)}
      </div>
    </>
  )
}

export function PainelArquetipos() {
  const [d, setD] = useState<{ slug: string; name: string; description: string; acoplado_em: string[] }[] | null>(null)
  useEffect(() => { api.arquetipos().then(r => setD(r.arquetipos)).catch(() => setD([])) }, [])

  if (!d) return <EsqueletoLinhas linhas={5} className="opacity-40" />

  return (
    <>
      <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
        O que um agente <strong className="text-gray-300">é</strong>, sem projeto nenhum: prompt,
        ferramentas, temperatura. O que é de um projeto — papel, squad, memórias — fica no
        acoplamento. Um arquétipo nunca nomeia projeto: é isso que tira o lugar onde a contaminação
        mora.
      </p>
      {d.length === 0
        ? <p className="text-[12px] text-gray-600">Nenhum arquétipo ainda.</p>
        : <div className="rounded-xl border border-gray-800 overflow-hidden">
            {d.map(a => (
              <div key={a.slug} className="px-3 py-2 border-b last:border-0 flex items-baseline gap-3"
                style={{ borderColor: '#1f1f1f' }}>
                <span className="text-[12.5px] text-gray-100 w-[10rem] shrink-0 truncate">{a.name}</span>
                <span className="text-[11px] text-gray-500 flex-1 truncate">{a.description}</span>
                <span className="text-[11px] text-gray-600 shrink-0 tabular-nums"
                  title={a.acoplado_em.join(', ')}>
                  {a.acoplado_em.length} projeto{a.acoplado_em.length !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>}
    </>
  )
}
