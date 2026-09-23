import { useCallback, useEffect, useState } from 'react'
// (o ícone do cabeçalho vem de Configurações › Ícones e cores, ver `iconeSecao` abaixo)
import { api, getProject, type LearningsView, type LearningCard, type EspecieSkill, type PropostaLearning } from '../api'
import { getIcon } from '../memoryIcons'
import { Disco } from '../components/Progresso'
import { ItemMenu } from '../lib/menuIcons'
import { KIND_META, doSistema } from '../lib/kinds'
import { Switch } from '../components/Switch'
import { abrirSkillNaDoca } from '../lib/doca'
import { CarregandoNoctis } from '../components/Esqueleto'
import { BarraOrdem, aplicar, useOrdem, type CampoOrdem, type Recorte } from '../components/Ordenar'

/** O que se pergunta a um repertório quando ele cresce.
 *
 * "Quem carrega isto e em que nível" é a pergunta do despacho: quero mandar a
 * tarefa para quem já sabe. "O que ninguém nunca exercitou" é a pergunta da
 * curadoria: entrou no repertório e não virou trabalho. As duas são ordens
 * sobre a mesma lista.
 */
const ORDENS_SKILL: CampoOrdem<LearningCard>[] = [
  { id: 'nome', rotulo: 'nome (A→Z)', valor: s => s.rotulo },
  { id: 'nivel', rotulo: 'maior nível de um portador',
    valor: s => Math.max(0, ...(s.portadores || []).map(p => p.nivel)), desc: true },
  { id: 'portadores', rotulo: 'nº de portadores', valor: s => (s.portadores || []).length, desc: true },
  { id: 'eventos', rotulo: 'trabalho acumulado',
    valor: s => (s.portadores || []).reduce((n, p) => n + (p.eventos || 0), 0), desc: true },
  { id: 'ultima', rotulo: 'exercitada por último',
    valor: s => (s.portadores || []).map(p => p.ultima || '').sort().pop() || '', desc: true },
  { id: 'nasceu', rotulo: 'mais nova', valor: s => s.nasceu_em || '', desc: true },
  { id: 'antiga', rotulo: 'mais antiga', valor: s => s.nasceu_em || '' },
]

const RECORTES_SKILL: Recorte<LearningCard>[] = [
  { id: 'firmadas', rotulo: 'firmadas', dica: 'Já provaram existir no trabalho',
    passa: s => s.estado === 'firmada' },
  { id: 'brotos', rotulo: 'brotos', dica: 'Ainda descobrindo o que são',
    passa: s => s.estado === 'broto' },
  { id: 'sem_portador', rotulo: 'ninguém exercita', dica: 'Entrou no repertório e não virou trabalho',
    passa: s => (s.portadores || []).length === 0 },
  { id: 'sem_descricao', rotulo: 'sem descrição', dica: 'Falta dizer o que ela é, em uma frase',
    passa: s => !(s.descricao || '').trim() },
  { id: 'sem_tag', rotulo: 'sem tag', dica: 'A fila de arrumação do vocabulário',
    passa: s => (s.tags || []).length === 0 },
]

/**
 * O repertório: os Learnings como coisas, não como texto solto nos eventos.
 *
 * Elas não entram no mapa de propósito — Learning é informação implícita do
 * agente, e oito agentes com cinco Learnings cada virariam quarenta nós ali
 * dentro. Aqui cada uma tem card próprio: quem a tem, em que nível, desde
 * quando, e o que ela significa.
 *
 * Quem escreve aqui é a pessoa. O agente só declara texto livre ao fechar um
 * despacho; renomear, descrever, firmar e arquivar é curadoria.
 */

// As cores dos estados são configuráveis (Configurações › Ícones e cores ›
// Learnings). Estavam cravadas aqui, e por isso o grupo inteiro daquele painel
// não pintava nada. O valor no código passa a ser só a reserva.
const corDoEstado = (estado: string) =>
  doSistema(`estado.${estado}`, 'GiSkills',
    { firmada: '#10b981', broto: '#a1a1aa', arquivada: '#52525b' }[estado] || '#a1a1aa').color

function CardSkill({ s, agentes, tagsDoProjeto, onAbrir, onMudou, onTag }: {
  s: LearningCard; agentes: string[]
  tagsDoProjeto: string[]
  onAbrir: () => void; onMudou: () => void
  onTag: (tag: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const [desc, setDesc] = useState(s.descricao || '')
  // Quanto dela já foi dito. Enquanto falta campo, ela está sendo descoberta —
  // e isso é estado normal, não defeito.
  const dito = s.enquadramento ? Object.keys(s.enquadramento).length : 0
  const descobrindo = dito < 5
  const [novaTag, setNovaTag] = useState('')
  const [pondoTag, setPondoTag] = useState(false)

  const mexerTags = async (tags: string[]) => {
    try { await api.editarLearning(s.chave, { tags }); onMudou() }
    catch (e) { alert((e as Error).message) }
  }
  // A cor vem da ESPÉCIE, não do tipo de recurso: bater o olho na página tem de
  // dizer o que é aprendizado apanhado e o que é competência.
  const cor = s.estado === 'arquivada' ? corDoEstado('arquivada')
    : descobrindo ? doSistema('estado.descobrindo', 'GiSkills', '#8b5cf6').color
    : (s.cor || KIND_META.agent.color)
  const IconeEspecie = getIcon('GiSkills')
  const vinculados = s.vinculados || []
  const exercitam = new Set(s.portadores.map(p => p.agente))

  const salvarDesc = async () => {
    await api.editarLearning(s.chave, { descricao: desc })
    setEditando(false); onMudou()
  }

  return (
    <div className={`acende relative flex flex-col rounded-xl border bg-[#161616] shadow-lg p-3 gap-2.5 cursor-pointer
                     ${s.estado === 'arquivada' ? 'border-gray-800 opacity-50' : 'border-gray-700'}`}
      style={{ borderLeft: `4px solid ${cor}`, ['--cor-card' as string]: cor }}
      onClick={e => { if (!(e.target as HTMLElement).closest('button,a,input,textarea,select,label,[contenteditable],[role=menu]')) onAbrir() }}>

      <div className="flex items-start gap-2.5">
        <Disco numero={s.nivel_maximo || '—'} cor={cor} tamanho={34}
          apagado={s.estado !== 'firmada'}
          titulo={`maior nível entre os agentes: ${s.nivel_maximo}`} />
        <div className="min-w-0 flex-1">
          <button onClick={onAbrir}
            className="text-sm font-semibold text-gray-100 leading-tight text-left hover:text-white">
            {s.rotulo}
          </button>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: corDoEstado(s.estado), background: corDoEstado(s.estado) + '1f' }}>
              {s.estado}
            </span>
            {descobrindo && (
              <span className="flex items-center gap-1 text-[10px] text-violet-300"
                title="Ainda falta dizer coisas sobre ela — responda em Aprender, no NOCTURN">
                descobrindo {dito}/5
              </span>
            )}
            <span className="text-[10px] text-gray-600">{s.eventos} ev · {Math.round(s.xp)} XP</span>
            {s.temCorpo && (
              <span className="text-[10px] text-gray-500" title="tem documento escrito">≡</span>
            )}
          </div>
          {/* As tags: agrupamento livre, e cada uma filtra a página ao clicar */}
          <div className="flex items-center gap-1 flex-wrap mt-1.5">
            {(s.tags || []).map(tg => (
              <span key={tg}
                className="group/tg flex items-center gap-1 text-[10px] text-gray-400 bg-white/[0.06] rounded-full pl-2 pr-1 py-0.5">
                <button onClick={() => onTag(tg)} className="hover:text-gray-100" title={`ver tudo com "${tg}"`}>
                  {tg}
                </button>
                <button onClick={() => mexerTags((s.tags || []).filter(x => x !== tg))}
                  title="tirar esta tag"
                  className="opacity-0 group-hover/tg:opacity-100 text-gray-500 hover:text-red-400 px-0.5">×</button>
              </span>
            ))}
            {pondoTag ? (
              <input value={novaTag} onChange={e => setNovaTag(e.target.value)} autoFocus list={`tags-${s.chave}`}
                onBlur={() => { setPondoTag(false); setNovaTag('') }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setPondoTag(false); setNovaTag('') }
                  if (e.key === 'Enter' && novaTag.trim()) {
                    mexerTags([...(s.tags || []), novaTag.trim()]); setPondoTag(false); setNovaTag('')
                  }
                }}
                placeholder="tag…"
                className="w-24 bg-gray-900 border border-gray-700 rounded-full px-2 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-blue-500" />
            ) : (
              <button onClick={() => setPondoTag(true)} title="Pôr uma tag"
                className="text-[10px] text-gray-600 hover:text-gray-300 px-1">+ tag</button>
            )}
            {/* Sugerir o que já existe é o que evita sinônimo novo para a mesma ideia */}
            <datalist id={`tags-${s.chave}`}>
              {tagsDoProjeto.map(tg => <option key={tg} value={tg} />)}
            </datalist>
          </div>
        </div>
        <button onClick={() => setMenu(m => !m)}
          className="text-gray-500 hover:text-gray-200 px-1 text-base leading-none">⋯</button>
      </div>

      {editando ? (
        <div className="space-y-1.5">
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} autoFocus
            placeholder="o que este Learning é, em uma frase"
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 resize-none" />
          <div className="flex gap-1.5">
            <button onClick={salvarDesc} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded">Salvar</button>
            <button onClick={() => { setDesc(s.descricao || ''); setEditando(false) }}
              className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">Cancelar</button>
          </div>
        </div>
      ) : (
        <p onClick={() => setEditando(true)}
          className={`text-xs leading-snug cursor-text ${s.descricao ? 'text-gray-400' : 'text-gray-700 italic'}`}>
          {s.descricao || 'sem descrição — clique e diga o que ela é'}
        </p>
      )}

      {/* O corpo do Learning: o que se aprendeu nele, por quem. Um Learning
          sem isto é rótulo — e rótulo foi o que o repertório veio evitar. */}
      {s.marcos.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-600">
            Aprendizados ({s.marcos.length})
          </div>
          {s.marcos.slice(0, 4).map((m, i) => (
            <div key={i} className="border-l-2 pl-2 py-0.5" style={{ borderColor: cor + '66' }}>
              <p className="text-[11px] text-gray-300 leading-snug">{m.texto}</p>
              <p className="text-[10px] text-gray-600">
                {m.agente}{m.nivel ? ` · nv${m.nivel}` : ''} · {(m.quando || '').slice(0, 10)}
              </p>
            </div>
          ))}
        </div>
      )}

      {s.portadores.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-600">Quem exercita</div>
          {s.portadores.map(p => (
            <div key={p.agente} className="flex items-center gap-2">
              <Disco numero={p.nivel} progresso={p.progresso} cor={cor} tamanho={24}
                titulo={`${p.eventos} eventos · ${Math.round(p.xp)} XP`} />
              <span className="text-[11px] text-gray-300 truncate flex-1">{p.agente}</span>
              <span className="text-[10px] font-mono text-gray-600">{Math.round(p.xp)}</span>
            </div>
          ))}
        </div>
      )}

      {vinculados.filter(v => !exercitam.has(v)).length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">
            Vinculados <span className="normal-case tracking-normal">— sem exercício ainda</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {vinculados.filter(v => !exercitam.has(v)).map(v => (
              <span key={v} className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-700 text-gray-500">{v}</span>
            ))}
          </div>
        </div>
      )}

      {s.aliases.length > 0 && (
        <div className="text-[10px] text-gray-700 truncate" title={s.aliases.join(' · ')}>
          também: {s.aliases.join(', ')}
        </div>
      )}

      {menu && (
        <div className="absolute top-10 right-2 z-50 w-56 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl py-1 text-sm">
          <ItemMenu icone="renomear" onClick={async () => {
            const n = window.prompt('Novo nome do Learning:', s.rotulo)?.trim()
            setMenu(false)
            if (n && n !== s.rotulo) { await api.editarLearning(s.chave, { rotulo: n }); onMudou() }
          }}>Renomear</ItemMenu>
          <ItemMenu icone={s.estado === 'firmada' ? 'decidido' : 'decisao'} onClick={async () => {
            setMenu(false)
            await api.editarLearning(s.chave, { estado: s.estado === 'firmada' ? 'broto' : 'firmada' })
            onMudou()
          }}>{s.estado === 'firmada' ? 'Voltar a broto' : 'Firmar agora'}</ItemMenu>
          {getProject() !== 'noctis' && (
            <ItemMenu icone="inserir" onClick={async () => {
              setMenu(false)
              await api.promoverLearning(s.chave)
              alert(`"${s.rotulo}" subiu para a base. Todo projeto passa a encontrá-la ao consultar.`)
            }}>Promover à base</ItemMenu>
          )}
          <ItemMenu icone="desfazerLane" onClick={async () => {
            setMenu(false)
            await api.editarLearning(s.chave, { estado: s.estado === 'arquivada' ? 'broto' : 'arquivada' })
            onMudou()
          }}>{s.estado === 'arquivada' ? 'Desarquivar' : 'Arquivar'}</ItemMenu>
          {/* Destruir não é arquivar: some a entrada, o texto e os apelidos.
              Os eventos ficam no log, e o XP que eles deram ao agente também. */}
          <ItemMenu icone="excluir" tom="perigo" onClick={async () => {
            setMenu(false)
            if (!window.confirm(`Destruir "${s.rotulo}"?\n\nSome o Learning, o texto dele e os apelidos. `
              + 'Os eventos ficam no histórico e o XP dos agentes é mantido. Não há como desfazer.')) return
            await api.destruirLearning(s.chave)
            onMudou()
          }}>Destruir</ItemMenu>

          <div className="px-3 py-2 border-t border-gray-800 max-h-48 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">
              Vincular agente
            </div>
            <div className="space-y-1.5">
              {agentes.map(a => (
                <div key={a} className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] truncate ${exercitam.has(a) ? 'text-gray-300' : 'text-gray-500'}`}>
                    {a}{exercitam.has(a) ? ' · exercita' : ''}
                  </span>
                  <Switch ligado={vinculados.includes(a)} cor={cor}
                    titulo={exercitam.has(a)
                      ? 'Já exercita: o vínculo não muda o XP'
                      : 'Declarar que este agente deve ter este Learning'}
                    onMudar={async v => { await api.vincularLearning(s.chave, a, v); onMudou() }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** O vocabulário de tags: fundir, renomear e tirar — sem lista fixa. */
function PainelTags({ dados, onMudou, onFechar, selecionadas, onToggle }: {
  dados: LearningsView; onMudou: () => void; onFechar: () => void
  selecionadas: string[]; onToggle: (tag: string) => void
}) {
  const [editando, setEditando] = useState('')
  const [texto, setTexto] = useState('')

  const renomear = async (de: string) => {
    const para = texto.trim()
    setEditando('')
    if (!para || para === de) return
    try {
      const r = await api.renomearTag(de, para)
      onMudou()
      if (r.habilidades) setTimeout(() => {}, 0)
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="w-64 shrink-0 border-l border-white/[0.06] flex flex-col">
      <div className="px-3 py-2 flex items-center border-b border-white/[0.06]">
        <div className="flex-1 text-[12px] text-gray-200">Tags do projeto</div>
        <button onClick={onFechar} className="text-gray-500 hover:text-gray-100 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {dados.tags.length === 0 && (
          <p className="text-[11px] text-gray-600 p-1 leading-relaxed">
            Nenhuma tag ainda. Ponha a primeira num card: o vocabulário nasce do uso, e não de uma lista.
          </p>
        )}
        {dados.tags.map(tg => (
          <div key={tg.tag} className="group/t flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/[0.04]">
            {editando === tg.tag ? (
              <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus
                onBlur={() => renomear(tg.tag)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') setEditando('') }}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-blue-500" />
            ) : (
              <button onClick={() => onToggle(tg.tag)}
                className={`flex-1 min-w-0 text-left text-[11.5px] truncate ${
                  selecionadas.includes(tg.tag) ? 'text-violet-300' : 'text-gray-300 hover:text-white'}`}>
                {tg.tag}
              </button>
            )}
            <span className={`text-[10px] tabular-nums ${tg.solta ? 'text-amber-500/70' : 'text-gray-600'}`}
              title={tg.solta ? 'usada uma vez só — vale fundir com outra' : `${tg.usos} learnings`}>
              {tg.usos}
            </span>
            <button onClick={() => { setEditando(tg.tag); setTexto(tg.tag) }}
              title="Renomear — nome que já existe funde as duas"
              className="opacity-0 group-hover/t:opacity-100 text-[10px] text-gray-500 hover:text-gray-200">✎</button>
            <button onClick={async () => {
                if (!window.confirm(`Tirar "${tg.tag}" de ${tg.usos} learning(s)? Os learnings ficam.`)) return
                await api.apagarTagLearning(tg.tag); onMudou()
              }}
              title="Tirar de todas" className="opacity-0 group-hover/t:opacity-100 text-[10px] text-gray-500 hover:text-red-400">×</button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 px-3 py-2 border-t border-white/[0.06] leading-relaxed">
        Renomear para uma tag que já existe funde as duas. Tag em amarelo é solta: usada uma vez só.
      </p>
    </div>
  )
}

/** O card do Learning que ainda não existe — e é só o nome.
 *
 * Tinha natureza, descrição e tags aqui. Ele cortou: "eu só quero digitar uma
 * Learning para eles aprenderem e eles mesmos irem descobrindo o que é essa
 * Learning, com perguntas". Então nasce com nome e mais nada, e o Noctis
 * abre na Inbox a fila de perguntas que descobre o resto — a primeira delas
 * decide o rumo sem nunca mostrar a palavra "natureza".
 */
function CardNovo({ onCriada, onCancelar }: {
  onCriada: (chave: string, rotulo: string) => void
  onCancelar: () => void
}) {
  const [rotulo, setRotulo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const criar = async () => {
    if (!rotulo.trim()) return
    setSalvando(true); setErro('')
    try {
      const r = await api.criarLearning(rotulo.trim())
      onCriada(r.skill.chave, rotulo.trim())
    } catch (e) { setErro((e as Error).message); setSalvando(false) }
  }

  return (
    <div className="acende relative flex flex-col rounded-xl border border-dashed border-violet-500/40 bg-violet-500/[0.04] p-3 gap-2"
      style={{ ['--cor-card' as string]: '#8b5cf6' }}>
      <input value={rotulo} onChange={e => setRotulo(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') onCancelar() }}
        placeholder="o que eles devem aprender?"
        className="bg-transparent text-sm font-semibold text-gray-100 placeholder:text-gray-600 focus:outline-none" />
      <p className="text-[11px] text-gray-500 leading-snug">
        Só o nome. O Noctis pergunta o resto — o que ela é, quando usar, o que dá errado — e
        as perguntas aparecem em <span className="text-gray-400">Aprender</span>, no NOCTURN.
      </p>
      {erro && <p className="text-[11px] text-red-400 leading-snug">{erro}</p>}
      <div className="flex items-center gap-1.5">
        <button onClick={criar} disabled={salvando || !rotulo.trim()}
          className="text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-2.5 py-1 rounded">
          criar
        </button>
        <button onClick={onCancelar} className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">
          cancelar
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-600">Enter cria · Esc sai</span>
      </div>
    </div>
  )
}

/**
 * Um Learning que um agente acha que falta.
 *
 * Ela mora aqui, e não numa caixa de entrada à parte, porque a pergunta que ela
 * faz é sobre ESTE repertório: "falta isto aqui?". Ver a proposta ao lado do
 * que já existe é o que permite responder — inclusive percebendo que a coisa já
 * tem nome, e o nome é outro.
 *
 * O seletor tem três saídas, e as três são decisão sua:
 *
 *     aceitar  →  o Learning nasce, com você como autor, e o que o agente
 *                 escreveu entra no corpo dela assinado por ele
 *     recusar  →  fica no histórico com o motivo; saber o que não vira conta
 *     ajustar  →  volta para ele reescrever, citando esta
 *
 * O nome e a frase são editáveis antes de aceitar: aceitar não é assinar
 * embaixo do texto dele, é dizer que a coisa existe e merece nome.
 */
function CardProposta({ p, onDecidiu }: { p: PropostaLearning; onDecidiu: () => void }) {
  const [rotulo, setRotulo] = useState(p.rotulo)
  const [descricao, setDescricao] = useState(p.o_que_e)
  const [motivo, setMotivo] = useState('')
  const [indo, setIndo] = useState('')

  const responder = async (veredito: 'aceita' | 'recusa' | 'ajusta') => {
    if (veredito !== 'aceita' && !motivo.trim()) {
      alert(veredito === 'recusa'
        ? 'Diga por que não: é o que faz a recusa ensinar alguma coisa.'
        : 'Diga o que ajustar — ele reescreve a partir disso.')
      return
    }
    setIndo(veredito)
    try {
      const r = await api.responderProposta(p.id, { veredito, rotulo, descricao, motivo })
      if (veredito === 'aceita' && r.criada) abrirSkillNaDoca(r.criada, rotulo, onDecidiu)
      onDecidiu()
    } catch (e) { alert((e as Error).message) } finally { setIndo('') }
  }

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] uppercase tracking-wide text-amber-300/80 border border-amber-500/30 rounded-full px-1.5 py-0.5">
          proposta
        </span>
        <span className="text-[11px] text-gray-500 truncate">{p.agente}</span>
        <span className="flex-1" />
        <span className="text-[10.5px] text-gray-600">{(p.quando || '').slice(0, 10)}</span>
      </div>

      <input value={rotulo} onChange={e => setRotulo(e.target.value)}
        className="w-full bg-transparent border-b border-white/[0.08] pb-1 text-[13px] text-gray-100
                   focus:outline-none focus:border-amber-400/60" />
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
        className="w-full bg-[#141414] border border-white/[0.07] rounded-lg px-2.5 py-1.5
                   text-[11.5px] text-gray-300 leading-snug resize-none
                   focus:outline-none focus:border-amber-400/50" />

      {/* De onde ela saiu. É o que separa proposta de palpite, então aparece
          sem ter que abrir nada. */}
      {(p.porque || p.despacho) && (
        <p className="text-[11px] text-gray-500 leading-snug">
          {p.porque}{p.porque && p.despacho ? ' · ' : ''}
          {p.despacho && <span className="text-gray-600">despacho: {p.despacho}</span>}
        </p>
      )}
      {p.parecida_com && (
        <p className="text-[11px] text-amber-300/70 leading-snug">
          Já existe algo chamado “{p.parecida_com}” — pode ser a mesma coisa com outro nome.
        </p>
      )}

      <input value={motivo} onChange={e => setMotivo(e.target.value)}
        placeholder="por que não, ou o que ajustar"
        className="w-full bg-[#141414] border border-white/[0.07] rounded-lg px-2.5 py-1.5
                   text-[11px] text-gray-300 focus:outline-none focus:border-white/20
                   placeholder:text-gray-600" />

      <div className="flex items-center gap-1.5">
        <button onClick={() => responder('aceita')} disabled={!!indo}
          title="Cria o Learning, com você como autor"
          className="text-[11.5px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1 rounded-lg">
          {indo === 'aceita' ? 'criando…' : 'aceitar'}
        </button>
        <button onClick={() => responder('ajusta')} disabled={!!indo}
          title="Volta para o agente reescrever"
          className="text-[11.5px] text-gray-300 hover:text-white hover:bg-white/[0.07] px-2.5 py-1 rounded-lg">
          pedir ajuste
        </button>
        <span className="flex-1" />
        <button onClick={() => responder('recusa')} disabled={!!indo}
          className="text-[11.5px] text-gray-500 hover:text-red-400 px-2 py-1 rounded-lg">
          recusar
        </button>
      </div>
    </div>
  )
}

export default function LearningsPage() {
  const iconeSecao = doSistema('secao.learning', 'GiSkills', '#10b981')
  const IconeSecaoVazia = getIcon(iconeSecao.icon)
  const [dados, setDados] = useState<LearningsView>()
  const [agentes, setAgentes] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [agrupar, setAgrupar] = useState(true)
  const [vocab, setVocab] = useState(false)
  const [criando, setCriando] = useState(false)

  const alternarTag = (tg: string) =>
    setTags(ts => ts.includes(tg) ? ts.filter(x => x !== tg) : [...ts, tg])

  const [propostas, setPropostas] = useState<PropostaLearning[]>([])

  const recarregar = useCallback(() => {
    api.learnings().then(setDados)
    api.propostas().then(r => setPropostas(r.propostas.filter(p => p.pendente))).catch(() => {})
    api.getResources().then(r => setAgentes((r.agent || []).map(a => a.name)))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  // Tag selecionada soma: escolher duas mostra o que tem AS DUAS. É o ganho
  // sobre categoria — o Learning cabe em vários agrupamentos ao mesmo tempo.
  const ordem = useOrdem('learnings', 'nome')
  const listaCrua = Object.values(dados?.skills || {}).filter(s =>
    (verArquivadas || s.estado !== 'arquivada')
    && tags.every(tg => (s.tags || []).includes(tg))
    && (!busca.trim() || (s.rotulo + ' ' + s.aliases.join(' ') + ' ' + s.descricao
        + ' ' + (s.tags || []).join(' '))
        .toLowerCase().includes(busca.trim().toLowerCase())))

  const lista = aplicar(listaCrua, ORDENS_SKILL, RECORTES_SKILL, ordem)
  const firmadas = lista.filter(s => s.estado === 'firmada').length
  const tagsDoProjeto = (dados?.tags || []).map(t => t.tag)

  // Agrupado por tag, a mesmo Learning aparece em cada tag que tem — de
  // propósito. O que não tem tag nenhuma cai em "sem tag", que é a fila de
  // arrumação.
  const grupos: { tag: string; itens: LearningCard[] }[] = []
  if (agrupar) {
    // "Sem tag" vem PRIMEIRO: é a fila de arrumação, e é onde caem as recém
    // criadas. Enterrada no fim da página, o Learning nova parecia não ter
    // sido criada.
    const soltas = lista.filter(s => !(s.tags || []).length)
    if (soltas.length) grupos.push({ tag: 'sem tag', itens: soltas })
    const usadas = tagsDoProjeto.filter(tg => lista.some(s => (s.tags || []).includes(tg)))
    for (const tg of usadas) grupos.push({ tag: tg, itens: lista.filter(s => (s.tags || []).includes(tg)) })
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent flex items-center justify-between shrink-0 gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            {lista.length} no repertório · {firmadas} firmada{firmadas !== 1 ? 's' : ''} ·
            {' '}tudo que o trabalho deixa e volta a servir
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={verArquivadas} onChange={e => setVerArquivadas(e.target.checked)}
              className="accent-blue-600" />
            arquivadas
          </label>
          <button onClick={() => setVocab(v => !v)}
            title="O vocabulário de tags do projeto: fundir, renomear, tirar"
            className={`text-xs px-3 py-1.5 rounded-lg shrink-0 ${
              vocab ? 'bg-white/[0.1] text-gray-100' : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.06]'}`}>
            tags
          </button>
          <button onClick={() => {
              // Criar limpa os filtros: card novo que nasce escondido atrás de
              // um filtro parece que não foi criado.
              setCriando(true); setBusca(''); setTags([])
            }}
            title="Escrever um Learning: um procedimento seu, ou um domínio a aprender"
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg shrink-0">
            + Learning
          </button>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="buscar Learning"
            className="w-56 bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
        </div>
      </div>

      {/* Duas linhas de filtro, e elas respondem perguntas diferentes:
          a natureza diz COMO o Learning funciona, a tag diz DE QUE ela é. */}
      <div className="px-5 py-2 border-b border-gray-800 bg-[#0f0f0f] flex items-center gap-1.5 shrink-0 overflow-x-auto">
        {(dados?.tags || []).slice(0, 14).map(tg => (
          <button key={tg.tag} onClick={() => alternarTag(tg.tag)}
            title={`${tg.usos} learning(s)${tg.solta ? ' — tag solta' : ''}`}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
              tags.includes(tg.tag)
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
                : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
            {tg.tag}<span className="text-gray-600 tabular-nums">{tg.usos}</span>
          </button>
        ))}
        {tags.length > 0 && (
          <button onClick={() => setTags([])} className="text-[11px] text-gray-500 hover:text-gray-200 px-1.5">limpar</button>
        )}

        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none shrink-0">
          <input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)}
            className="accent-violet-600" />
          agrupar por tag
        </label>
      </div>

      <BarraOrdem campos={ORDENS_SKILL} recortes={RECORTES_SKILL} estado={ordem}
        contagem={lista.length} total={Object.keys(dados?.skills || {}).length} />

      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 overflow-y-auto p-5">
        {/* O card em branco vive acima de tudo, inclusive do vazio: dá para
            criar a primeiro Learning sem sair da tela vazia. */}
        {criando && dados && (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))] items-start mb-5">
            <CardNovo onCancelar={() => setCriando(false)}
              onCriada={(chave, rotulo) => {
                setCriando(false)
                recarregar()
                // Nasceu: abre na doca, para você continuar escrevendo nela.
                abrirSkillNaDoca(chave, rotulo, recarregar)
              }} />
          </div>
        )}
        {/* As propostas primeiro: elas são o que espera por VOCÊ. O resto da
            tela é consulta; isto é decisão parada. */}
        {propostas.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-[12.5px] text-amber-300/90">
                {propostas.length} Learning{propostas.length !== 1 ? 's' : ''} proposto{propostas.length !== 1 ? 's' : ''} por agentes
              </p>
              <span className="text-[11px] text-gray-600">esperando você aceitar ou não</span>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))] items-start">
              {propostas.map(p => <CardProposta key={p.id} p={p} onDecidiu={recarregar} />)}
            </div>
          </section>
        )}
        {!dados ? <CarregandoNoctis />
          : lista.length === 0 && !criando ? (
            <div className="h-full grid place-items-center text-center">
              <div>
                <IconeSecaoVazia size={32} className="text-gray-700 mx-auto mb-2" style={{ color: iconeSecao.color + '99' }} />
                <p className="text-gray-500 text-sm">Nenhum Learning ainda.</p>
                <p className="text-gray-600 text-xs mt-1 max-w-sm">
                  Elas nascem sozinhas quando um agente registra trabalho e diz o que exercitou.
                </p>
              </div>
            </div>
          ) : (
            agrupar ? (
              <div className="space-y-7">
                {grupos.map(g => (
                  <section key={g.tag}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <button onClick={() => g.tag !== 'sem tag' && alternarTag(g.tag)}
                        className={`text-[12.5px] ${g.tag === 'sem tag' ? 'text-gray-600 italic' : 'text-gray-200 hover:text-white'}`}>
                        {g.tag}
                      </button>
                      <span className="text-[11px] text-gray-600 tabular-nums">{g.itens.length}</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))] items-start">
                      {g.itens.map(s => (
                        <CardSkill key={s.chave} s={s} agentes={agentes}
                          tagsDoProjeto={tagsDoProjeto} onTag={alternarTag}
                          onAbrir={() => abrirSkillNaDoca(s.chave, s.rotulo, recarregar)} onMudou={recarregar} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))] items-start">
                {lista.map(s => (
                  <CardSkill key={s.chave} s={s} agentes={agentes}
                    tagsDoProjeto={tagsDoProjeto} onTag={alternarTag}
                    onAbrir={() => abrirSkillNaDoca(s.chave, s.rotulo, recarregar)} onMudou={recarregar} />
                ))}
              </div>
            )
          )}
      </div>
        {vocab && dados && (
          <PainelTags dados={dados} onMudou={recarregar} onFechar={() => setVocab(false)}
            selecionadas={tags} onToggle={alternarTag} />
        )}
      </div>
    </div>
  )
}
