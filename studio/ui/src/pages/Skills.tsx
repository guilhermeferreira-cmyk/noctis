import { useCallback, useEffect, useMemo, useState } from 'react'
import { GiLockedChest } from '../iconesEssenciais'
import { api, getProject, type LearningCard, type SkillClaudeCard } from '../api'
import { doSistema } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { CarregandoNoctis } from '../components/Esqueleto'

/**
 * Skill — exatamente a definição do Claude, não o repertório do Noctis.
 *
 * Um `SKILL.md`: nome, descrição, corpo — o que o Claude Code descobre e roda.
 * Aqui não há XP, portador nem tese: isso é Learning.
 *
 * Esta tela mostra TRÊS procedências, e a diferença entre elas é o que você
 * pode fazer:
 *
 *     projeto   as deste projeto — as que o Noctis criou você edita e vincula
 *     suas      de `~/.claude/skills` — leitura apenas
 *     plugin    vieram com um plugin — leitura apenas
 *
 * **Nativa não se edita, se duplica.** A cópia entra no projeto, passa a ser
 * do Noctis, e só então aceita edição e vínculo com Learning. É o caminho
 * para adaptar uma skill do Claude sem mexer na skill do Claude — que segue
 * valendo, intacta, para todo o resto do sistema fora daqui.
 */

const ORIGENS = [
  { id: 'projeto', rotulo: 'do projeto', dica: 'Moram neste projeto, em .claude/skills' },
  { id: 'usuario', rotulo: 'suas', dica: 'De ~/.claude/skills — leitura apenas' },
  { id: 'plugin', rotulo: 'de plugin', dica: 'Vieram com um plugin — leitura apenas' },
] as const

function CardSkill({ s, icone, learnings, onDuplicar, onEditar, onVincular, onPerguntas, onMolde }: {
  s: SkillClaudeCard
  icone: { icon: string; color: string }
  learnings: Record<string, LearningCard>
  onDuplicar: (s: SkillClaudeCard) => void
  onEditar: (s: SkillClaudeCard) => void
  onVincular: (s: SkillClaudeCard) => void
  onPerguntas: (s: SkillClaudeCard) => void
  onMolde: (s: SkillClaudeCard) => void
}) {
  const Icone = getIcon(icone.icon)
  const minha = !s.nativa
  return (
    <div className="acende rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-md grid place-items-center w-8 h-8"
          style={minha ? { background: icone.color + '22', color: icone.color }
                       : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
          {minha ? <Icone size={16} /> : <GiLockedChest size={16} />}
        </span>
        <p className="text-[13px] text-gray-100 truncate flex-1" title={s.nome}>{s.nome}</p>
        <span className={`text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0 ${
          minha ? 'text-sky-300/80 border-sky-500/30' : 'text-gray-500 border-gray-700'}`}>
          {minha ? 'noctis' : s.origem === 'plugin' ? 'plugin' : 'sua'}
        </span>
      </div>

      {s.descricao && <p className="text-[11.5px] text-gray-500 leading-snug line-clamp-3">{s.descricao}</p>}

      <p className="text-[10.5px] text-gray-600">
        {s.duplicada_de && `cópia de ${s.duplicada_de} · `}
        {minha
          ? (s.learnings.length > 0
              ? s.learnings.map(l => learnings[l]?.rotulo || l).join(', ')
              : 'sem Learning vinculado')
          : 'só leitura — duplique para adaptar'}
      </p>

      <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
        <button onClick={() => onDuplicar(s)}
          title="Cria uma cópia sua dentro do projeto, que você pode editar"
          className="text-[11px] text-gray-400 hover:text-gray-100 hover:bg-white/[0.07] px-2 py-1 rounded-lg">
          duplicar
        </button>
        {minha && (
          <>
            <button onClick={() => onEditar(s)}
              className="text-[11px] text-gray-400 hover:text-gray-100 hover:bg-white/[0.07] px-2 py-1 rounded-lg">
              editar
            </button>
            <button onClick={() => onVincular(s)}
              className="text-[11px] text-gray-400 hover:text-gray-100 hover:bg-white/[0.07] px-2 py-1 rounded-lg">
              vincular
            </button>
            <button onClick={() => onPerguntas(s)}
              className="text-[11px] text-gray-400 hover:text-gray-100 hover:bg-white/[0.07] px-2 py-1 rounded-lg">
              perguntas
            </button>
            <button onClick={() => onMolde(s)}
              title="Guarda como molde na camada de templates do Warden"
              className="text-[11px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.07] px-2 py-1 rounded-lg">
              molde
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** O editor — só para skill do Noctis. Corpo em markdown, como o arquivo é. */
function Editor({ slug, onFechar, onSalvou }: {
  slug: string; onFechar: () => void; onSalvou: () => void
}) {
  const [d, setD] = useState<{ nome: string; descricao: string; corpo: string } | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    api.skillClaude(slug)
      .then(x => { if (vivo) setD({ nome: x.nome, descricao: x.descricao, corpo: x.corpo }) })
      .catch(e => { alert((e as Error).message); onFechar() })
    return () => { vivo = false }
  }, [slug, onFechar])

  const salvar = async () => {
    if (!d) return
    setSalvando(true)
    try { await api.editarSkillClaude(slug, d); onSalvou(); onFechar() }
    catch (e) { alert((e as Error).message) } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center p-6"
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-white/[0.09]
                      bg-[#141417] shadow-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/[0.07] flex items-center gap-2">
          <p className="text-[12.5px] text-gray-200 flex-1 truncate">
            {slug} <span className="text-gray-600">· .claude/skills/{slug}/SKILL.md</span>
          </p>
          <button onClick={onFechar} className="text-gray-500 hover:text-gray-200 text-lg leading-none px-1">✕</button>
        </div>

        {!d ? <div className="p-8"><CarregandoNoctis tamanho={120} /></div> : (
          <>
            <div className="p-4 space-y-3 overflow-y-auto">
              <label className="block">
                <span className="text-[11px] text-gray-500">Nome</span>
                <input value={d.nome} onChange={e => setD({ ...d, nome: e.target.value })}
                  className="w-full mt-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-1.5
                             text-[13px] text-gray-100 focus:outline-none focus:border-sky-500" />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">
                  Descrição — é por ela que o Claude decide QUANDO usar a skill
                </span>
                <textarea value={d.descricao} rows={3}
                  onChange={e => setD({ ...d, descricao: e.target.value })}
                  className="w-full mt-1 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-1.5
                             text-[12px] text-gray-200 leading-snug resize-y
                             focus:outline-none focus:border-sky-500" />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">Corpo (markdown)</span>
                <textarea value={d.corpo} rows={16}
                  onChange={e => setD({ ...d, corpo: e.target.value })}
                  className="w-full mt-1 bg-[#101012] border border-gray-800 rounded-lg px-3 py-2
                             text-[12px] text-gray-300 font-mono leading-relaxed resize-y
                             focus:outline-none focus:border-sky-500" />
              </label>
            </div>
            <div className="px-4 py-2.5 border-t border-white/[0.07] flex items-center gap-2">
              <span className="text-[11px] text-gray-600 flex-1">
                Salvar reescreve o SKILL.md — o Claude Code lê o arquivo novo na próxima vez.
              </span>
              <button onClick={onFechar} className="text-[12px] text-gray-400 hover:text-gray-100 px-3 py-1.5">
                cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="text-[12px] bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                {salvando ? 'salvando…' : 'salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function SkillsPage() {
  const iconeSecao = doSistema('secao.skillsclaude', 'GiBookCover', '#0ea5e9')
  const IconeSecao = getIcon(iconeSecao.icon)
  const [skills, setSkills] = useState<SkillClaudeCard[] | null>(null)
  const [learnings, setLearnings] = useState<Record<string, LearningCard>>({})
  const [origem, setOrigem] = useState<string>('projeto')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)

  const recarregar = useCallback(() => {
    api.skillsClaude().then(r => setSkills(r.skills)).catch(() => setSkills([]))
    api.learnings().then(r => setLearnings(r.skills)).catch(() => {})
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const contagem = useMemo(() => {
    const c: Record<string, number> = { projeto: 0, usuario: 0, plugin: 0 }
    for (const s of skills || []) {
      const o = s.origem || 'projeto'
      c[o] = (c[o] || 0) + 1
    }
    return c
  }, [skills])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (skills || [])
      .filter(s => (s.origem || 'projeto') === origem)
      .filter(s => !q || (s.nome + ' ' + s.slug + ' ' + s.descricao).toLowerCase().includes(q))
  }, [skills, origem, busca])

  const duplicar = async (s: SkillClaudeCard) => {
    try {
      const r = await api.duplicarSkillClaude(s.slug, s.origem || '')
      setOrigem('projeto')
      recarregar()
      alert(`Cópia criada como "${r.skill.slug}" — agora é sua: dá para editar e vincular.`)
    } catch (e) { alert((e as Error).message) }
  }

  const vincular = async (s: SkillClaudeCard) => {
    const novo = window.prompt(
      `Learnings vinculados a "${s.nome}" — separados por vírgula.` + String.fromCharCode(10, 10)
      + 'Disponíveis: ' + Object.keys(learnings).slice(0, 40).join(', '),
      s.learnings.join(', '))
    if (novo === null) return
    const lista = novo.split(',').map(x => x.trim()).filter(Boolean)
    const invalidos = lista.filter(x => !learnings[x])
    if (invalidos.length) { alert(`Não existem: ${invalidos.join(', ')}`); return }
    try { await api.vincularSkillClaude(s.slug, lista); recarregar() }
    catch (e) { alert((e as Error).message) }
  }

  const verPerguntas = async (s: SkillClaudeCard) => {
    const r = await api.perguntasSkillsClaude()
    const meu = r.skills.find(x => x.slug === s.slug)
    if (!meu || meu.perguntas.length === 0) {
      alert(`"${s.nome}" não tem pergunta pendente nos Learnings vinculados.`)
      return
    }
    alert(meu.perguntas.map(q => '· ' + q.pergunta.texto).join(String.fromCharCode(10)))
  }

  const guardarMolde = async (s: SkillClaudeCard) => {
    try {
      const r = await api.guardarTemplateSkill(getProject(), s.slug)
      alert(r.template.novo
        ? `Molde de "${s.nome}" guardado na camada de templates do Warden.`
        : `Molde de "${s.nome}" atualizado.`)
    } catch (e) { alert((e as Error).message) }
  }

  const criar = async () => {
    const nome = window.prompt('Nome da skill (o que o Claude Code vai chamar):')?.trim()
    if (!nome) return
    const deLearning = window.prompt(
      'Destilar de um Learning? Digite a chave, ou deixe em branco para criar do zero.'
      + String.fromCharCode(10, 10) + Object.keys(learnings).slice(0, 30).join(', '))?.trim() || ''
    if (deLearning && !learnings[deLearning]) { alert(`"${deLearning}" não é um Learning conhecido.`); return }
    const descricao = window.prompt(
      'Descrição — é o que o Claude usa para saber QUANDO usar esta skill:',
      learnings[deLearning]?.descricao || '')?.trim()
    if (!descricao) { alert('Sem descrição a skill não serve para o Claude decidir.'); return }
    try {
      const r = await api.criarSkillClaude({ nome, descricao, de_learning: deLearning })
      setOrigem('projeto')
      recarregar()
      alert(`Skill "${r.skill.nome}" criada em .claude/skills/${r.skill.slug}/SKILL.md`)
    } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <span style={{ color: iconeSecao.color }}><IconeSecao size={16} /></span>
        <p className="text-xs text-gray-500 flex-1 truncate">
          {skills?.length ?? '…'} skills visíveis · nativa é só leitura; para adaptar, duplique
        </p>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar skill"
          className="w-56 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-200
                     focus:outline-none focus:border-sky-500 placeholder:text-gray-600" />
        <button onClick={criar}
          className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg shrink-0">
          + Skill
        </button>
      </div>

      <div className="px-5 py-1.5 border-b border-white/[0.06] flex items-center gap-1.5 shrink-0">
        {ORIGENS.map(o => (
          <button key={o.id} onClick={() => setOrigem(o.id)} title={o.dica}
            className={`flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-lg ${
              origem === o.id ? 'bg-white/[0.09] text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
            {o.rotulo}
            <span className="text-gray-600 tabular-nums">{contagem[o.id] ?? 0}</span>
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-gray-600 tabular-nums">{visiveis.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!skills ? <CarregandoNoctis />
          : visiveis.length === 0 ? (
            <div className="h-full grid place-items-center text-center">
              <div>
                <p className="text-gray-500 text-sm">
                  {busca ? `Nada encontrado para "${busca}".`
                    : origem === 'projeto' ? 'Nenhuma skill neste projeto ainda.'
                    : 'Nada nesta procedência.'}
                </p>
                {origem === 'projeto' && !busca && (
                  <p className="text-gray-600 text-xs mt-1 max-w-sm">
                    Crie uma do zero, destile de um Learning, ou duplique uma das suas
                    (aba “suas”) para adaptar.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))] items-start">
              {visiveis.map(s => (
                <CardSkill key={`${s.origem}/${s.slug}`} s={s} icone={iconeSecao} learnings={learnings}
                  onDuplicar={duplicar} onEditar={x => setEditando(x.slug)}
                  onVincular={vincular} onPerguntas={verPerguntas} onMolde={guardarMolde} />
              ))}
            </div>
          )}
      </div>

      {editando && (
        <Editor slug={editando} onFechar={() => setEditando(null)} onSalvou={recarregar} />
      )}
    </div>
  )
}
