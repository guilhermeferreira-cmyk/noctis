import { useEffect, useRef, useState } from 'react'
import { api, type PerguntasSkillClaude, type ProjectMeta, type PropostaLearning,
         type ResourceItem } from '../api'
import { KIND_META, ICON_SIZES, doSistema, classePainel } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { LogoNoctis } from '../components/LogoNoctis'
import { CarregandoNoctis, EsqueletoLinhas } from '../components/Esqueleto'
import { catalogoLocal } from '../components/FiltroProjetos'
import { desde } from '../components/Ordenar'
import { abrirRecursoNaDoca } from '../lib/doca'

/**
 * Visão geral — a tela do Warden, acima de qualquer projeto.
 *
 * Ela existe porque o Noctis deixou de ser um projeto com abas e virou vários
 * projetos com um guardião em cima. Abrir direto num deles obrigava a escolher
 * antes de olhar; aqui você olha o conjunto e então escolhe.
 *
 * **Isto é um hub, não uma página de lista, e a diferença é de FORMA.** Página
 * de lista é uma coluna que rola para sempre; hub são faixas de altura fixa com
 * densidades diferentes, em que só uma zona rola. São quatro:
 *
 *   0. a crista — quem você é e o tamanho do parque. Única zona sem painel:
 *      respira sobre o céu, e é o que diz de imediato que esta não é uma tela
 *      de conteúdo.
 *   1. o que espera VOCÊ — Learnings sem veredito e dúvidas das Skills, lado a
 *      lado, para se ler na diagonal. Fica acima dos projetos porque é o único
 *      conteúdo aqui que pede uma decisão sua.
 *   2. os projetos — a maior, e a única que rola em y.
 *   3. o que andou mudando — tira horizontal. Tempo se lê na horizontal;
 *      empilhado em grade, competia com os projetos e virava "mais uma lista".
 *
 * **Não há campo de busca aqui, de propósito.** Busca é das páginas de grade
 * (Agentes, Memória, Fluxos, Personas), que já têm filtro por projeto,
 * ordenação e as três camadas do Warden — própria, catálogo e templates. Esta
 * tela já reimplementou tudo aquilo uma vez, pior; o que ela faz agora é
 * apontar para lá.
 */

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

/** Uma lápide da crista: o número, grande, e o que ele conta. */
function Lapide({ chave, padrao, corPadrao, valor, rotulo }: {
  chave: string; padrao: string; corPadrao: string; valor: number | null; rotulo: string
}) {
  const d = doSistema(chave, padrao, corPadrao)
  const I = getIcon(d.icon)
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span style={{ color: d.color }}><I size={18} /></span>
      <div className="leading-none">
        <div className="text-[20px] text-gray-100 tabular-nums font-light">
          {valor === null ? '—' : valor}
        </div>
        <div className="text-[10.5px] text-gray-600 mt-1">{rotulo}</div>
      </div>
    </div>
  )
}

/** Um painel da zona 1: cabeçalho com contagem e uma lista curta. */
function Fila({ titulo, dica, cor, n, vazio, children }: {
  titulo: string; dica: string; cor: string; n: number | null
  vazio: string; children: React.ReactNode
}) {
  return (
    <section className={`flex flex-col min-h-0 ${classePainel()}`}
      style={{ borderColor: n ? cor + '40' : undefined }}>
      <div className="px-3.5 py-2 flex items-center gap-2 border-b border-white/[0.06] shrink-0">
        <h2 className="text-[12.5px]" style={{ color: n ? cor : '#a1a1aa' }}>{titulo}</h2>
        {n !== null && n > 0 && (
          <span className="text-[11px] tabular-nums px-1.5 rounded-full"
            style={{ background: cor + '1f', color: cor }}>{n}</span>
        )}
        <span className="text-[11px] text-gray-600 truncate">{dica}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5">
        {n === null ? <EsqueletoLinhas linhas={2} className="opacity-40" />
          : n === 0 ? <p className="text-[11.5px] text-gray-600 px-1.5 py-2">{vazio}</p>
            : children}
      </div>
    </section>
  )
}

const linha = 'w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-left ' +
              'hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08]'

export default function VisaoGeral({ projetos, onAbrirProjeto, onAbrirLearnings,
                                    onRenomearProjeto, onExcluirProjeto,
                                    onNovoProjeto, onAbrirPagina }: {
  projetos: ProjectMeta[]
  onAbrirProjeto: (slug: string) => void
  /** Abre o projeto JÁ na página de Learning, onde o card de decisão vive. */
  onAbrirLearnings: (slug: string) => void
  onRenomearProjeto: (slug: string) => void
  onExcluirProjeto: (slug: string) => void
  onNovoProjeto: () => void
  /** Os atalhos do hub para as páginas de grade, onde o catálogo mora agora. */
  onAbrirPagina: (p: string) => void
}) {
  // Os três números da crista — os MESMOS do modo zen, das mesmas chamadas e
  // com as mesmas chaves de aparência, para não haver duas contagens do parque
  // que possam divergir.
  const [numeros, setNumeros] = useState<{ agentes: number; runtime: number } | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all([api.controle(), api.runtime(15, [], '', 1)])
      .then(([c, r]) => { if (!vivo) return
        setNumeros({
          agentes: c.projetos.reduce((t, p) => t + p.agentes, 0),
          runtime: r.trabalhando.length,
        })
      }).catch(() => { /* o traço já diz que não sabe */ })
    return () => { vivo = false }
  }, [])

  const [recentes, setRecentes] = useState<ResourceItem[] | null>(null)
  useEffect(() => {
    if (!projetos.length) return
    let vivo = true
    catalogoLocal(projetos.map(p => ({ slug: p.slug, nome: p.displayName }))).then(r => {
      if (!vivo) return
      const todos: ResourceItem[] = []
      for (const t of TIPOS) for (const i of r[t.kind] || []) todos.push(i)
      todos.sort((a, b) => (b.mudado || '').localeCompare(a.mudado || ''))
      setRecentes(todos.slice(0, 16))
    }).catch(() => setRecentes([]))
    return () => { vivo = false }
  }, [projetos])

  // As perguntas dos Learnings vinculados a Skills — de TODOS os projetos.
  // Aparece sempre, mesmo com tudo vazio: é aviso de dúvida coletada, e
  // esconder a seção quando não há nada seria esconder também o "ainda não
  // vinculei Learning nenhum a esta skill", que é informação também.
  const [perguntasSkills, setPerguntasSkills] = useState<
    (PerguntasSkillClaude & { projeto: string; projetoNome: string })[] | null>(null)
  useEffect(() => {
    if (!projetos.length) return
    let vivo = true
    api.todasPerguntasSkillsClaude().then(r => { if (vivo) setPerguntasSkills(r.skills) }).catch(() => {})
    return () => { vivo = false }
  }, [projetos])

  // As propostas de Learning esperando veredito, de todos os projetos. Irmã da
  // seção de dúvidas, e não a mesma coisa: lá são perguntas de enquadramento de
  // Learnings VINCULADOS a skills; aqui é um Learning que ainda não existe e só
  // nasce (ou morre) com uma palavra sua.
  const [propostas, setPropostas] = useState<
    (PropostaLearning & { projeto: string; projetoNome: string })[] | null>(null)
  useEffect(() => {
    if (!projetos.length) return
    let vivo = true
    api.todasPropostas().then(r => { if (vivo) setPropostas(r.propostas) }).catch(() => setPropostas([]))
    return () => { vivo = false }
  }, [projetos])

  const comDuvida = (perguntasSkills || []).filter(s => s.perguntas.length > 0)
  const deTrabalho = projetos.filter(p => !p.repositorio)

  return (
    <div className="h-full flex flex-col min-h-0 px-3 pb-2 gap-3">

      {/* ── Zona 0: a crista. Sem painel: sangra no céu. ─────────────────── */}
      <header className="shrink-0 flex items-center gap-4 pt-3 pb-1">
        <LogoNoctis size={ICON_SIZES.organizacao + 18} gradiente />
        <div className="min-w-0">
          <h1 className="text-[15px] text-gray-100 leading-tight">Warden</h1>
          <p className="text-[11.5px] text-gray-600">todos os projetos, de cima</p>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-7 shrink-0">
          <Lapide chave="secao.agents" padrao="GiRobotGolem" corPadrao="#10b981"
            valor={numeros?.agentes ?? null} rotulo="agentes" />
          <Lapide chave="secao.runtime" padrao="GiPulse" corPadrao="#f472b6"
            valor={numeros?.runtime ?? null} rotulo="em trabalho" />
          <Lapide chave="warden.projetos" padrao="GiEmptyChessboard" corPadrao="#38bdf8"
            valor={deTrabalho.length} rotulo="projetos" />
        </div>
      </header>

      {/* ── Zona 1: o que espera VOCÊ. Altura fixa, duas colunas. ────────── */}
      <div className="shrink-0 h-[11rem] grid grid-cols-2 gap-3 min-h-0">
        <Fila titulo="Learnings esperando veredito" dica="propostos por agentes"
          cor="#10b981" n={propostas === null ? null : propostas.length}
          vazio="Nada esperando por você — silêncio aqui é boa notícia.">
          {(propostas || []).map(pr => (
            <button key={`${pr.projeto}/${pr.id}`} className={linha}
              onClick={() => onAbrirLearnings(pr.projeto)}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10b981' }} />
              <span className="text-[12px] text-gray-200 truncate flex-1">{pr.rotulo}</span>
              <span className="text-[10.5px] text-gray-600 shrink-0">{pr.agente || 'um agente'}</span>
              <span className="text-[10.5px] text-emerald-300/60 shrink-0 truncate max-w-[8rem]">
                {pr.projetoNome}
              </span>
              <span className="text-[10.5px] text-gray-700 shrink-0">{desde(pr.quando)}</span>
            </button>
          ))}
        </Fila>

        <Fila titulo="Dúvidas coletadas pelas Skills" dica="via Learning vinculado"
          cor="#f59e0b" n={perguntasSkills === null ? null : comDuvida.length}
          vazio={(perguntasSkills || []).length === 0
            ? 'Nenhuma skill do Noctis existe ainda — crie uma em Skills, dentro de um projeto.'
            : 'Nenhuma dúvida pendente nas skills que existem.'}>
          {comDuvida.map(s => (
            // A dúvida se responde na página de Learning do projeto dela — era
            // um `alert` que despejava as perguntas e não deixava responder
            // nenhuma.
            <button key={`${s.projeto}/${s.slug}`} className={linha}
              onClick={() => onAbrirLearnings(s.projeto)}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f59e0b' }} />
              <span className="text-[12px] text-gray-200 truncate flex-1">{s.slug}</span>
              <span className="text-[10.5px] text-amber-300/80 shrink-0">
                {s.perguntas.length} dúvida{s.perguntas.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[10.5px] text-gray-600 shrink-0 truncate max-w-[8rem]">
                {s.projetoNome}
              </span>
            </button>
          ))}
        </Fila>
      </div>

      {/* ── Zona 2: os projetos. A única que rola em y. ──────────────────── */}
      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <h2 className="text-[12.5px] text-gray-300">Projetos</h2>
          <span className="text-[11px] text-gray-600">onde o trabalho acontece</span>
        </div>
        {projetos.length === 0 ? <CarregandoNoctis /> : (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))] items-start">
              {projetos.map(p => (
                <CardProjeto key={p.slug} p={p}
                  onAbrir={() => onAbrirProjeto(p.slug)}
                  onRenomear={() => onRenomearProjeto(p.slug)}
                  onExcluir={() => onExcluirProjeto(p.slug)} />
              ))}
              {/* Criar um projeto era só o `+` da tira de cima, que ninguém lê
                  como gesto. Aqui ele fica no fim da coisa que ele cria. */}
              <button onClick={onNovoProjeto}
                className="acende rounded-xl border border-dashed border-white/[0.12] p-4
                           flex items-center gap-2.5 text-left hover:border-white/25 min-h-[5.5rem]">
                <span className="text-gray-600 text-[17px] leading-none">+</span>
                <span className="text-[12.5px] text-gray-500">novo projeto</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Zona 3: o que andou mudando. Tira horizontal. ────────────────── */}
      <section className="shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-[12.5px] text-gray-300">Mexidos por último</h2>
          <span className="text-[11px] text-gray-600">em todos os projetos</span>
          <span className="flex-1" />
          <button onClick={() => onAbrirPagina('memory')}
            className="text-[11px] text-gray-600 hover:text-gray-200">
            ver o catálogo →
          </button>
        </div>
        {recentes === null ? <EsqueletoLinhas linhas={1} className="max-w-sm opacity-40" /> : (
          <div className="flex gap-3 overflow-x-auto pb-1
                          [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]">
            {recentes.map(it => (
              <div key={`${it.projeto || ''}/${it.kind}:${it.name}`} className="w-[15rem] shrink-0">
                <CardItem it={it}
                  onAbrir={() => {
                    // O item pode ser de outro projeto: entrar nele primeiro é
                    // o que faz a doca abrir o arquivo certo.
                    if (it.projeto) onAbrirProjeto(it.projeto)
                    abrirRecursoNaDoca((it.kind || 'memory') as never, it.name, () => {})
                  }} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
