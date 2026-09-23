import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getProject, type PerguntasSkillClaude, type ProjectMeta, type PropostaLearning, type ResourceItem, type SkillClaudeCard, type TemplateItem } from '../api'
import { KIND_META, ICON_SIZES, VIDRO, doSistema, classePainel } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { LogoNoctis } from '../components/LogoNoctis'
import { CarregandoNoctis, EsqueletoLinhas } from '../components/Esqueleto'
import { catalogoLocal } from '../components/FiltroProjetos'
import { desde } from '../components/Ordenar'
import { abrirRecursoNaDoca } from '../lib/doca'

/**
 * A tela do Warden — a primeira do sistema, acima de qualquer projeto.
 *
 * Ela existe porque o Noctis deixou de ser um projeto com abas e virou vários
 * projetos com um guardião em cima. Abrir direto num deles obrigava a escolher
 * antes de olhar; aqui você olha o conjunto e então escolhe.
 *
 * A forma é a da casa do Figma — o que você tem, primeiro; o que andou mudando,
 * logo abaixo. O vestuário é o daqui: os mesmos painéis de canto arredondado e
 * borda de um fio do resto do Noctis, coluna da esquerda para navegar e coluna
 * grande para o conteúdo, como em toda outra tela.
 *
 * **Projetos vêm primeiro.** Era o pedido, e é o certo: nove em cada dez vezes
 * que esta tela abre, o que se quer é entrar em algum lugar. O catálogo — que é
 * poderoso e grande — fica a um clique, e não no caminho.
 */

type Vista = 'projetos' | 'catalogo' | 'propria' | 'templates'

const VISTAS: { id: Vista; chave: string; dica: string }[] = [
  { id: 'projetos', chave: 'warden.projetos', dica: 'Onde o trabalho acontece' },
  { id: 'catalogo', chave: 'warden.catalogo', dica: 'Tudo que existe em todos os projetos, lido ao vivo' },
  { id: 'propria', chave: 'warden.propria', dica: 'A camada do Warden: a governança tem conteúdo próprio' },
  { id: 'templates', chave: 'warden.templates', dica: 'Os moldes que descem para qualquer projeto' },
]

const TIPOS: { kind: 'agent' | 'memory' | 'flow' | 'persona'; rotulo: string }[] = [
  { kind: 'agent', rotulo: 'agentes' },
  { kind: 'memory', rotulo: 'memórias' },
  { kind: 'flow', rotulo: 'fluxos' },
  { kind: 'persona', rotulo: 'personas' },
]

function IconeDe({ kind, tamanho = 15 }: { kind: string; tamanho?: number }) {
  const meta = KIND_META[kind as keyof typeof KIND_META]
  const I = getIcon(meta?.icon || 'GiSkills')
  return <I size={tamanho} style={{ color: meta?.color }} />
}

/** Um projeto: o que ele tem, e os dois gestos que importam. */
function CardProjeto({ p, onAbrir, onRenomear, onExcluir }: {
  p: ProjectMeta
  onAbrir: () => void
  onRenomear: () => void
  onExcluir: () => void
}) {
  const total = (p.counts?.agents || 0) + (p.counts?.memory || 0)
    + (p.counts?.flows || 0) + (p.counts?.personas || 0)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])

  return (
    <div onClick={onAbrir}
      className="acende group/card relative cursor-pointer rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515]
                 p-4 flex flex-col gap-3 min-w-0"
      >
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-[14px] text-gray-100 truncate flex-1">{p.displayName}</p>
        {/* Renomear e excluir moram aqui: são o mesmo gesto de sempre, e a
            home não deveria ser a única tela do Noctis sem ele. */}
        {!p.permanente && (
          <button ref={btnRef} onClick={e => { e.stopPropagation(); setMenu(v => !v) }}
            title="Renomear ou excluir"
            className="shrink-0 w-5 h-5 grid place-items-center rounded text-gray-600
                       opacity-0 group-hover/card:opacity-100 hover:text-gray-200 hover:bg-white/[0.08]">
            ⋯
          </button>
        )}
        {menu && (
          <div ref={menuRef} onClick={e => e.stopPropagation()}
            className="absolute top-9 right-3 z-20 w-40 bg-[#1f1f1f] border border-gray-700
                       rounded-lg shadow-2xl py-1 text-[12px]">
            <button onClick={() => { setMenu(false); onRenomear() }}
              className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-white/[0.06]">
              Renomear
            </button>
            {!p.repositorio && (
              <button onClick={() => { setMenu(false); onExcluir() }}
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-white/[0.06]">
                Excluir
              </button>
            )}
            {p.repositorio && (
              <p className="px-3 py-1.5 text-[10.5px] text-gray-600 leading-snug">
                Repositório de código — exclua pelo git, fora daqui.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11.5px] text-gray-500">
        {TIPOS.map(t => {
          const n = t.kind === 'agent' ? p.counts?.agents
            : t.kind === 'memory' ? p.counts?.memory
            : t.kind === 'flow' ? p.counts?.flows : p.counts?.personas
          return (
            <span key={t.kind} className="flex items-center gap-1" title={t.rotulo}>
              <IconeDe kind={t.kind} tamanho={13} />
              <span className="tabular-nums">{n ?? 0}</span>
            </span>
          )
        })}
        <span className="flex-1" />
        <span className="text-gray-600 tabular-nums">{total}</span>
      </div>
    </div>
  )
}

function CardItem({ it, onAbrir }: { it: ResourceItem; onAbrir: () => void }) {
  return (
    <div onClick={onAbrir}
      className="acende cursor-pointer rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3
                 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <IconeDe kind={it.kind || 'memory'} />
        <p className="text-[12.5px] text-gray-100 truncate flex-1">{it.displayName || it.name}</p>
      </div>
      {it.excerpt && <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{it.excerpt}</p>}
      <div className="flex items-center gap-2 text-[10.5px] text-gray-600 mt-auto pt-1">
        {it.projetoNome && <span className="text-amber-300/60 truncate max-w-[10rem]">{it.projetoNome}</span>}
        <span className="flex-1" />
        <span>{desde(it.mudado)}</span>
      </div>
    </div>
  )
}

export default function HomeWarden({ projetos, onAbrirProjeto, onAbrirLearnings,
                                    onRecarregarProjetos, onConfigurar, onRenomearProjeto,
                                    onExcluirProjeto }: {
  projetos: ProjectMeta[]
  onAbrirProjeto: (slug: string) => void
  /** Abre o projeto JÁ na página de Learning, onde o card de decisão vive. */
  onAbrirLearnings: (slug: string) => void
  onRecarregarProjetos: () => void
  onConfigurar: () => void
  onRenomearProjeto: (slug: string) => void
  onExcluirProjeto: (slug: string) => void
}) {
  const [vista, setVista] = useState<Vista>(() =>
    (sessionStorage.getItem('noctis.home.vista') as Vista) || 'projetos')
  useEffect(() => {
    try { sessionStorage.setItem('noctis.home.vista', vista) } catch { /* sem storage */ }
  }, [vista])

  const [itens, setItens] = useState<ResourceItem[]>([])
  const [skillsCat, setSkillsCat] = useState<(SkillClaudeCard & { projeto: string; projetoNome: string })[]>([])
  const [moldesSkill, setMoldesSkill] = useState<TemplateItem[]>([])  // moldes de skill
  const [moldes, setMoldes] = useState<TemplateItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [tipo, setTipo] = useState('')
  const [projFiltro, setProjFiltro] = useState('')
  const [busca, setBusca] = useState('')

  const recarregar = useCallback(async () => {
    if (vista === 'projetos') return
    setCarregando(true)
    try {
      if (vista === 'templates') {
        setMoldes((await api.templates()).templates)
        setMoldesSkill((await api.templatesSkill()).templates)
        setItens([])
        return
      } else if (vista === 'catalogo') {
        // Do cache do preload, não de uma releitura no servidor: ver a nota em
        // `catalogoLocal`.
        const alvo = projetos
          .filter(p => !projFiltro || p.slug === projFiltro)
          .map(p => ({ slug: p.slug, nome: p.displayName }))
        const r = await catalogoLocal(alvo)
        const todos: ResourceItem[] = []
        for (const t of TIPOS) for (const i of r[t.kind] || []) todos.push(i)
        setItens(todos)
        api.todasSkillsClaude(projFiltro ? [projFiltro] : []).then(rs => setSkillsCat(rs.skills)).catch(() => {})
      } else {
        const todos: ResourceItem[] = []
        for (const t of TIPOS) {
          for (const i of ((await api.getResources())[t.kind] || [])) {
            todos.push({ ...i, kind: t.kind })
          }
        }
        setItens(todos)
        api.skillsClaude().then(rs => setSkillsCat(rs.skills.map(s => ({ ...s, projeto: getProject(), projetoNome: '' }))))
          .catch(() => {})
      }
    } finally { setCarregando(false) }
  }, [vista, projFiltro, projetos])
  useEffect(() => { recarregar() }, [recarregar])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens
      .filter(i => !tipo || i.kind === tipo)
      .filter(i => !q || (i.displayName || i.name).toLowerCase().includes(q)
                      || (i.excerpt || '').toLowerCase().includes(q))
      .sort((a, b) => (b.mudado || '').localeCompare(a.mudado || ''))
  }, [itens, tipo, busca])

  /** O recente serve à vista de projetos: o que andou mudando, sem sair dela. */
  const [recentes, setRecentes] = useState<ResourceItem[]>([])
  useEffect(() => {
    if (vista !== 'projetos' || !projetos.length) return
    let vivo = true
    catalogoLocal(projetos.map(p => ({ slug: p.slug, nome: p.displayName }))).then(r => {
      if (!vivo) return
      const todos: ResourceItem[] = []
      for (const t of TIPOS) for (const i of r[t.kind] || []) todos.push(i)
      todos.sort((a, b) => (b.mudado || '').localeCompare(a.mudado || ''))
      setRecentes(todos.slice(0, 12))
    }).catch(() => {})
    return () => { vivo = false }
  }, [vista, projetos])

  // As perguntas dos Learnings vinculados a Skills — de TODOS os projetos.
  // Aparece sempre, mesmo com tudo vazio: é aviso de dúvida coletada, e
  // esconder a seção quando não há nada seria esconder também o "ainda não
  // vinculei Learning nenhum a esta skill", que é informação também.
  const [perguntasSkills, setPerguntasSkills] = useState<
    (PerguntasSkillClaude & { projeto: string; projetoNome: string })[] | null>(null)
  useEffect(() => {
    if (vista !== 'projetos' || !projetos.length) return
    let vivo = true
    api.todasPerguntasSkillsClaude().then(r => { if (vivo) setPerguntasSkills(r.skills) }).catch(() => {})
    return () => { vivo = false }
  }, [vista, projetos])

  // As propostas de Learning esperando veredito, de todos os projetos. Irmã da
  // seção de dúvidas, e não a mesma coisa: lá são perguntas de enquadramento de
  // Learnings VINCULADOS a skills; aqui é um Learning que ainda não existe e só
  // nasce (ou morre) com uma palavra sua. Some quando não há nenhuma — silêncio
  // aqui é boa notícia, diferente do caso acima.
  const [propostas, setPropostas] = useState<
    (PropostaLearning & { projeto: string; projetoNome: string })[]>([])
  useEffect(() => {
    if (vista !== 'projetos' || !projetos.length) return
    let vivo = true
    api.todasPropostas().then(r => { if (vivo) setPropostas(r.propostas) }).catch(() => {})
    return () => { vivo = false }
  }, [vista, projetos])

  const guardarMolde = async (kind: string) => {
    // O fazedor pergunta de ONDE destilar: molde bom sai de trabalho que já
    // serviu, e não de um formulário em branco.
    const r = await catalogoLocal(projetos.map(p => ({ slug: p.slug, nome: p.displayName }))).catch(() => null)
    const candidatos = (r?.[kind as 'agent' | 'memory' | 'flow' | 'persona'] || [])
    if (!candidatos.length) { alert('Não há nada deste tipo para destilar ainda.'); return }
    const nome = window.prompt(
      `Qual ${KIND_META[kind as keyof typeof KIND_META]?.label.toLowerCase() || kind} virar molde?\n\n`
      + candidatos.slice(0, 40).map(c => `· ${c.name}${c.projeto ? ` (${c.projeto})` : ''}`).join('\n'))
    if (!nome?.trim()) return
    const alvo = candidatos.find(c => c.name === nome.trim())
    if (!alvo) { alert(`"${nome.trim()}" não está na lista.`); return }
    const rotulo = window.prompt('Nome do molde:', alvo.displayName || alvo.name)?.trim()
    if (!rotulo) return
    try {
      const res = await api.guardarTemplate({
        kind, projeto: alvo.projeto || getProject(), nome: alvo.name, rotulo })
      alert(res.template.novo ? `Molde "${res.template.nome}" guardado.`
                              : `Molde "${res.template.nome}" atualizado.`)
      recarregar()
    } catch (e) { alert((e as Error).message) }
  }

  const guardarMoldeSkill = async () => {
    const r = await api.todasSkillsClaude().catch(() => null)
    // Skill nativa não é do Noctis para começo de conversa — só as que ele
    // criou fazem sentido como ponto de partida de um molde.
    const candidatos = (r?.skills || []).filter(sk => !sk.nativa)
    if (!candidatos.length) { alert('Não há skill do Noctis para destilar ainda — crie uma primeiro.'); return }
    const slug = window.prompt('Qual skill virar molde? Digite o slug.'
      + String.fromCharCode(10, 10)
      + candidatos.slice(0, 40).map(c => `· ${c.slug} (${c.projeto})`).join(String.fromCharCode(10)))?.trim()
    if (!slug) return
    const alvo = candidatos.find(c => c.slug === slug)
    if (!alvo) { alert(`"${slug}" não está na lista.`); return }
    try {
      const res = await api.guardarTemplateSkill(alvo.projeto, alvo.slug)
      alert(res.template.novo ? `Molde "${res.template.slug}" guardado.` : `Molde "${res.template.slug}" atualizado.`)
      recarregar()
    } catch (e) { alert((e as Error).message) }
  }

  const painel = classePainel()

  const ident = doSistema('warden.identidade', 'GiSpikedShield', '#f59e0b')
  const grade = 'grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))] items-start'
  // O Warden é o sistema falando por todos os projetos, então a marca dele É a
  // marca do Noctis — o mesmo sol heráldico do resto do app, não um ícone à
  // parte. O tamanho acompanha a configuração de ícones (Configurações ›
  // Aparência), e a cor é sempre o gradiente animado do Noctis: aqui é onde a
  // identidade do sistema deveria estar mais evidente, não escondida atrás de
  // uma cor sólida configurável à parte.
  const tamanhoLogo = ICON_SIZES.organizacao + 18

  return (
    <div className="h-full flex min-h-0 px-1.5 pb-1.5 gap-1.5">
      {/* ── Coluna da esquerda: quem é, e o que dá para ver ───────────────── */}
      <aside className={`shrink-0 w-[250px] flex flex-col ${painel}`}>
        <div className="px-3 py-3 flex items-center gap-2.5 border-b border-white/[0.06]">
          <span className="grid place-items-center rounded-lg shrink-0"
            style={{ width: tamanhoLogo + 10, height: tamanhoLogo + 10 }}>
            <LogoNoctis size={tamanhoLogo} gradiente />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-gray-100 leading-tight truncate">{ident.label || 'Warden'}</p>
            <p className="text-[10.5px] text-gray-500 truncate">{projetos.length} projetos sob a vista</p>
          </div>
          {/* O nome e o tamanho vêm daqui; a cor do logo é sempre o gradiente
              do Noctis (Configurações › Aparência › Logo), não uma cor à parte. */}
          <button onClick={onConfigurar} title="Nome do Warden e gradiente do logo, em Configurações"
            className="shrink-0 text-gray-600 hover:text-gray-200 text-xs px-1">⋯</button>
        </div>

        <nav className="p-2 space-y-0.5">
          {VISTAS.map(v => {
            const s = doSistema(v.chave, 'GiSkills', '#a1a1aa')
            const I = getIcon(s.icon)
            const on = vista === v.id
            return (
              <button key={v.id} onClick={() => setVista(v.id)} title={v.dica}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12.5px] text-left
                            transition-colors ${on ? 'text-gray-100' : 'text-gray-400 hover:text-gray-100'}`}
                style={on ? { background: s.color + '1f', boxShadow: `inset 2px 0 0 ${s.color}` } : undefined}>
                <I size={ICON_SIZES.arvore + 2} style={{ color: s.color }} />
                <span className="truncate">{s.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto px-3 py-2.5 border-t border-white/[0.06]">
          <p className="text-[10.5px] text-gray-600 leading-snug">
            Abrir é olhar. Quem diz em qual projeto o trabalho é escrito é o
            identificador do agente, e o comando recusa se não bater.
          </p>
        </div>
      </aside>

      {/* ── Coluna grande: o conteúdo da vista ───────────────────────────── */}
      <main className={`flex-1 min-w-0 flex flex-col ${painel}`}>
        <div className="h-11 shrink-0 flex items-center gap-2 px-4 border-b border-white/[0.06]">
          <p className="text-[12.5px] text-gray-300">
            {doSistema(VISTAS.find(v => v.id === vista)!.chave, '', '').label}
          </p>
          <span className="text-[11px] text-gray-600 truncate">
            {VISTAS.find(v => v.id === vista)!.dica}
          </span>
          <span className="flex-1" />
          {vista === 'projetos' ? (
            <button onClick={onRecarregarProjetos}
              className="text-[11px] text-gray-600 hover:text-gray-200">recarregar</button>
          ) : vista !== 'templates' ? (
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="buscar"
              className="w-56 bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-1 text-[11.5px]
                         text-gray-200 focus:outline-none focus:border-amber-500/50 placeholder:text-gray-600" />
          ) : null}
        </div>

        {/* A segunda linha só existe onde há o que recortar. */}
        {(vista === 'catalogo' || vista === 'propria') && (
          <div className="px-4 py-1.5 border-b border-white/[0.06] flex items-center gap-1.5 shrink-0 overflow-x-auto">
            {vista === 'catalogo' && (
              <select value={projFiltro} onChange={e => setProjFiltro(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-[11px] text-gray-300
                           focus:outline-none focus:border-amber-500/50 mr-1">
                <option value="">todos os projetos</option>
                {projetos.map(p => <option key={p.slug} value={p.slug}>{p.displayName}</option>)}
              </select>
            )}
            <button onClick={() => setTipo('')}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${
                !tipo ? 'bg-white/[0.09] border-white/20 text-gray-100'
                      : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>tudo</button>
            {TIPOS.map(t => (
              <button key={t.kind} onClick={() => setTipo(tipo === t.kind ? '' : t.kind)}
                className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${
                  tipo === t.kind ? 'border-white/20 bg-white/[0.09] text-gray-100'
                                  : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                <IconeDe kind={t.kind} tamanho={11} />
                {t.rotulo}
              </button>
            ))}
            {/* Skill não é um ResourceItem — vem de `.claude/skills`, não de
                `/resources` — então tem chip e contador à parte, mas mora na
                mesma barra: é o mesmo gesto de recortar o que se vê. */}
            <button onClick={() => setTipo(tipo === 'skill' ? '' : 'skill')}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${
                tipo === 'skill' ? 'border-white/20 bg-white/[0.09] text-gray-100'
                                 : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
              <span style={{ color: doSistema('secao.skillsclaude', '', '#0ea5e9').color }}>●</span>
              skills
            </button>
            <span className="flex-1" />
            <span className="text-[11px] text-gray-600 tabular-nums shrink-0">
              {tipo === 'skill' ? skillsCat.length : lista.length}
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {vista === 'projetos' && projetos.length === 0 && (
            // A própria lista de projetos ainda não chegou — o sol substitui a
            // tela em branco que ficava aqui até a primeira resposta do servidor.
            <CarregandoNoctis />
          )}
          {vista === 'projetos' && projetos.length > 0 && (
            <>
              <div className={grade}>
                {projetos.map(p => (
                  <CardProjeto key={p.slug} p={p}
                    onAbrir={() => onAbrirProjeto(p.slug)}
                    onRenomear={() => onRenomearProjeto(p.slug)}
                    onExcluir={() => onExcluirProjeto(p.slug)} />
                ))}
              </div>
              {/* O que espera por VOCÊ, antes de tudo que só espera ser lido.
                  Recusar é resposta válida — é aprendizado sobre o que NÃO é a
                  competência. O que não pode existir é a proposta sem veredito
                  para sempre. */}
              {propostas.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-7 mb-2.5">
                    <h2 className="text-[12.5px] text-emerald-300/90">
                      {propostas.length} Learning{propostas.length !== 1 ? 's' : ''} esperando você
                    </h2>
                    <span className="text-[11px] text-gray-600">
                      propostos por agentes, em todos os projetos
                    </span>
                    <span className="flex-1" />
                  </div>
                  <div className={grade + ' mb-1'}>
                    {propostas.map(pr => (
                      <button key={`${pr.projeto}/${pr.id}`}
                        onClick={() => onAbrirLearnings(pr.projeto)}
                        className="acende rounded-xl border p-3 flex flex-col gap-1.5 text-left"
                        style={{ borderColor: '#10b98140' }}>
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] text-gray-100 truncate flex-1">{pr.rotulo}</p>
                          <span className="text-[10px] text-emerald-300/70 shrink-0">{pr.projetoNome}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-2">{pr.o_que_e}</p>
                        <p className="text-[11px] text-gray-600">
                          por {pr.agente || 'um agente'} · {desde(pr.quando)}
                        </p>
                        <span className="text-[11px] text-emerald-300 mt-auto pt-1">
                          aceitar, recusar ou pedir ajuste →
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* As dúvidas coletadas pelas Skills, via Learning vinculado. SEMPRE
                  visível — inclusive com tudo zerado, porque zero também é
                  informação: nenhuma skill do Noctis vinculou Learning ainda. */}
              <div className="flex items-center gap-2 mt-7 mb-2.5">
                <h2 className="text-[12.5px] text-amber-300/90">Dúvidas coletadas pelas Skills</h2>
                <span className="text-[11px] text-gray-600">via Learning vinculado, em todos os projetos</span>
                <span className="flex-1" />
              </div>
              {perguntasSkills === null ? (
                <EsqueletoLinhas linhas={2} className="max-w-sm opacity-40" />
              ) : perguntasSkills.length === 0 ? (
                <p className="text-[12px] text-gray-600 mb-1">
                  Nenhuma skill do Noctis existe ainda — crie uma em "Skills", dentro de um projeto.
                </p>
              ) : (
                <div className={grade + ' mb-1'}>
                  {perguntasSkills.map(s => (
                    <div key={`${s.projeto}/${s.slug}`}
                      className="acende rounded-xl border p-3 flex flex-col gap-1.5"
                      style={{ borderColor: s.perguntas.length ? '#f59e0b40' : 'rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2">
                        <p className="text-[12.5px] text-gray-100 truncate flex-1">{s.slug}</p>
                        <span className="text-[10px] text-amber-300/70 shrink-0">{s.projetoNome}</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {s.learnings.length === 0
                          ? 'sem Learning vinculado ainda'
                          : `${s.learnings.length} Learning${s.learnings.length !== 1 ? 's' : ''} vinculado${s.learnings.length !== 1 ? 's' : ''}`}
                      </p>
                      <p className={`text-[11px] ${s.perguntas.length ? 'text-amber-300/90' : 'text-gray-600'}`}>
                        {s.perguntas.length === 0
                          ? 'nenhuma dúvida pendente'
                          : `${s.perguntas.length} dúvida${s.perguntas.length !== 1 ? 's' : ''} pendente${s.perguntas.length !== 1 ? 's' : ''}`}
                      </p>
                      {s.perguntas.length > 0 && (
                        <button onClick={() => {
                            if (s.projeto !== getProject()) onAbrirProjeto(s.projeto)
                            alert(s.perguntas.map(p => `· ${p.pergunta.texto}`).join(String.fromCharCode(10)))
                          }}
                          className="text-[11px] text-amber-300 hover:text-amber-200 text-left mt-auto pt-1">
                          ver as dúvidas →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-7 mb-2.5">
                <h2 className="text-[12.5px] text-gray-300">Mexidos por último</h2>
                <span className="text-[11px] text-gray-600">em todos os projetos</span>
                <span className="flex-1" />
                <button onClick={() => setVista('catalogo')}
                  className="text-[11px] text-gray-600 hover:text-gray-200">ver o catálogo</button>
              </div>
              {recentes.length === 0
                ? <EsqueletoLinhas linhas={2} className="max-w-sm opacity-40" />
                : (
                  <div className={grade}>
                    {recentes.map(it => (
                      <CardItem key={`${it.projeto || ''}/${it.kind}:${it.name}`} it={it}
                        onAbrir={() => {
                          if (it.projeto && it.projeto !== getProject()) onAbrirProjeto(it.projeto)
                          abrirRecursoNaDoca((it.kind || 'memory') as never, it.name, () => {})
                        }} />
                    ))}
                  </div>
                )}
            </>
          )}

          {vista === 'templates' && (
            <>
              <div className="flex items-center gap-2 mb-2.5">
                <h2 className="text-[12.5px] text-gray-300">Fazer um molde</h2>
                <span className="text-[11px] text-gray-600">destilado de algo que já serviu, em qualquer projeto</span>
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] mb-7">
                {TIPOS.map(t => (
                  <button key={t.kind} onClick={() => guardarMolde(t.kind)}
                    className="acende rounded-xl border border-dashed border-white/[0.12] p-3.5
                               flex items-center gap-2.5 text-left hover:border-white/25">
                    <IconeDe kind={t.kind} tamanho={16} />
                    <span className="text-[12.5px] text-gray-300">molde de {t.rotulo}</span>
                    <span className="flex-1" />
                    <span className="text-gray-600 text-[15px] leading-none">+</span>
                  </button>
                ))}
                <button onClick={guardarMoldeSkill}
                  className="acende rounded-xl border border-dashed border-white/[0.12] p-3.5
                             flex items-center gap-2.5 text-left hover:border-white/25">
                  <span style={{ color: doSistema('secao.skillsclaude', '', '#0ea5e9').color }}>●</span>
                  <span className="text-[12.5px] text-gray-300">molde de skill</span>
                  <span className="flex-1" />
                  <span className="text-gray-600 text-[15px] leading-none">+</span>
                </button>
              </div>
              <h2 className="text-[12.5px] text-gray-300 mb-2.5">Moldes guardados</h2>
              {carregando ? (
                <CarregandoNoctis tamanho={140} />
              ) : moldes.length === 0 && moldesSkill.length === 0 ? (
                <p className="text-[12px] text-gray-600 max-w-md leading-snug">
                  Nenhum molde ainda. Use os fazedores acima: escolha algo que já provou servir
                  em qualquer projeto e destile num molde.
                </p>
              ) : (
                <div className={grade}>
                  {moldes.map(m => (
                    <div key={`${m.kind}:${m.slug}`}
                      className="acende rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <IconeDe kind={m.kind} />
                        <p className="text-[12.5px] text-gray-100 truncate flex-1">{m.nome}</p>
                      </div>
                      {m.descricao && (
                        <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{m.descricao}</p>
                      )}
                      <p className="text-[10.5px] text-gray-600 mt-auto pt-1">
                        {m.deProjeto ? `de ${m.de} · ${m.deProjeto}` : 'escrito aqui'}
                        {m.usos > 0 && ` · usado ${m.usos}×`}
                      </p>
                    </div>
                  ))}
                  {moldesSkill.map(m => (
                    <div key={`skill:${m.slug}`}
                      className="acende rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span style={{ color: doSistema('secao.skillsclaude', '', '#0ea5e9').color }}>●</span>
                        <p className="text-[12.5px] text-gray-100 truncate flex-1">{m.nome}</p>
                      </div>
                      {m.descricao && (
                        <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{m.descricao}</p>
                      )}
                      <p className="text-[10.5px] text-gray-600 pt-1">
                        {m.deProjeto ? `de ${m.de} · ${m.deProjeto}` : 'escrito aqui'}
                        {m.usos > 0 && ` · usado ${m.usos}×`}
                      </p>
                      {/* Instanciar é copiar: nasce independente do molde. */}
                      <select value="" className="mt-auto bg-gray-900 border border-gray-700 rounded px-2 py-1
                                                  text-[11px] text-gray-300 focus:outline-none focus:border-sky-500"
                        onChange={async e => {
                          const para = e.target.value
                          if (!para) return
                          try {
                            const r = await api.instanciarTemplateSkill(m.slug, para)
                            alert(r.renomeado
                              ? `Chegou como "${r.slug}" — já havia uma com o nome do molde.`
                              : `"${m.nome}" foi criada em ${projetos.find(p => p.slug === para)?.displayName || para}.`)
                            recarregar()
                          } catch (err) { alert((err as Error).message) }
                        }}>
                        <option value="">— instanciar em… —</option>
                        {projetos.map(p => <option key={p.slug} value={p.slug}>{p.displayName}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {(vista === 'catalogo' || vista === 'propria') && tipo === 'skill' && (
            carregando ? (
              <CarregandoNoctis />
            ) : skillsCat.length === 0 ? (
              <p className="text-[12px] text-gray-600">Nenhuma skill em <code>.claude/skills</code> ainda.</p>
            ) : (
              <div className={grade}>
                {skillsCat.map(sk => (
                  <div key={`${sk.projeto}/${sk.slug}`}
                    className="acende rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0 ${
                        sk.nativa ? 'text-gray-500 border-gray-700' : 'text-sky-300/80 border-sky-500/30'}`}>
                        {sk.nativa ? 'nativa' : 'noctis'}
                      </span>
                      <p className="text-[12.5px] text-gray-100 truncate flex-1">{sk.nome}</p>
                    </div>
                    {sk.descricao && <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{sk.descricao}</p>}
                    <div className="flex items-center gap-2 text-[10.5px] text-gray-600 mt-auto pt-1">
                      {vista === 'catalogo' && sk.projetoNome && (
                        <span className="text-amber-300/60 truncate max-w-[8rem]">{sk.projetoNome}</span>
                      )}
                      <span className="flex-1" />
                      <span>{sk.learnings.length} Learning{sk.learnings.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {(vista === 'catalogo' || vista === 'propria') && tipo !== 'skill' && (
            carregando ? (
              <CarregandoNoctis />
            ) : lista.length === 0 ? (
              <p className="text-[12px] text-gray-600">Nada por aqui ainda.</p>
            ) : (
              <div className={grade}>
                {lista.slice(0, 80).map(it => (
                  <CardItem key={`${it.projeto || ''}/${it.kind}:${it.name}`} it={it}
                    onAbrir={() => {
                      if (it.projeto && it.projeto !== getProject()) onAbrirProjeto(it.projeto)
                      abrirRecursoNaDoca((it.kind || 'memory') as never, it.name, () => {})
                    }} />
                ))}
              </div>
            )
          )}
        </div>
      </main>
    </div>
  )
}
