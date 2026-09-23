import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
// As páginas viram pedaços próprios. Abrir o Noctis não precisa baixar o
// Cosmos, o Runtime e o gerador de setup junto — e quem nunca abre uma seção
// nunca paga por ela. `lazy` exige `Suspense` em volta de quem as desenha.
const AgentsPage       = lazy(() => import('./pages/Agents'))
const OrganizacaoPage  = lazy(() => import('./pages/Organizacao'))
const FlowsPage        = lazy(() => import('./pages/Flows'))
const MemoryPage       = lazy(() => import('./pages/Memory'))
const PersonasPage     = lazy(() => import('./pages/Personas'))
const SetupPage        = lazy(() => import('./pages/Setup'))
const MemoryCanvasPage = lazy(() => import('./pages/MemoryCanvas'))
const LearningsPage    = lazy(() => import('./pages/Learnings'))
const SkillsPage       = lazy(() => import('./pages/Skills'))
const RuntimePage      = lazy(() => import('./pages/Runtime'))
const ControlePage     = lazy(() => import('./pages/Controle'))
const CosmosPage       = lazy(() => import('./pages/Cosmos'))
const ZenPage          = lazy(() => import('./pages/Zen'))
const VisaoPage        = lazy(() => import('./pages/Home'))
import ProjectsModal from './ProjectsModal'
import { api, getProject, setProject, type ProjectMeta } from './api'
import { GiTreasureMap, GiMagicSwirl, GiGalaxy, GiSkills, GiControlTower, GiFamilyTree, GiBookCover, GiPulse, GiSpikedShield } from './iconesEssenciais'
import type { IconType } from 'react-icons'
import { KIND_META, KIND_ORDER, doSistema, aplicarSistema, aplicarPontilhado, aplicarVocabulario, aplicarTipos, aplicarTamanhos, aplicarAura,
         aplicarLogo, aplicarCeu, aplicarVidro, ICON_SIZES, CEU, VIDRO, LOGO, classePainel } from './lib/kinds'
import { FundoEstrelado } from './components/FundoEstrelado'
import { CarregandoNoctis } from './components/Esqueleto'
import { getIcon } from './memoryIcons'
import { Configuracoes } from './components/Configuracoes'
import { usePreferencias, preferencias } from './lib/preferencias'
import { useDoca } from './lib/doca'
import { confirmar, pedirTexto, aviso } from './lib/dialogos'
import { Dialogos } from './components/dialogos/Dialogos'
import { LogoNoctis } from './components/LogoNoctis'
import { Drawer } from './components/Drawer'
import { DrawerLearning } from './components/DrawerLearning'
import { Explorador, type AbrirItem } from './components/shell/Explorador'
import { PainelDireito, type Contexto } from './components/shell/PainelDireito'
import { BarraStatus } from './components/shell/BarraStatus'
import { TPainelEsq, TPainelDir, TVoltar, TAvancar, TFechar } from './components/shell/Tracos'
import type { MemoryVocab, ResourceKind } from './api'

/**
 * A casca do Noctis, no desenho do Obsidian.
 *
 *   faixa de ícones │ árvore do projeto │ abas + conteúdo │ contexto / NOCTURN
 *   ───────────────────────────────── barra de status ─────────────────────────
 *
 * A mudança de fundo é de PÁGINA para ABA. Antes, abrir uma memória era sair da
 * página em que se estava; agora é abrir mais uma aba, e voltar é um clique. O
 * que se trabalha junto fica aberto junto.
 */

type Pagina = 'visao' | 'agents' | 'organizacao' | 'flows' | 'personas' | 'memory' | 'learning' | 'skillsclaude' | 'runtime' | 'cosmos' | 'canvas' | 'controle' | 'setup'

type Aba =
  | { id: string; tipo: 'pagina'; pagina: Pagina }
  | { id: string; tipo: 'recurso'; kind: ResourceKind; nome: string; titulo: string }
  | { id: string; tipo: 'skill'; chave: string; titulo: string }
  | { id: string; tipo: 'mapa'; mapa: string; titulo: string }

// As quatro primeiras herdam ícone e cor do próprio tipo de recurso: a faixa e o
// card falam do mesmo objeto, então trocar a cor de "Agente" repinta os dois.
const PAGINAS: { id: Pagina; label: string; kind?: ResourceKind; icon?: IconType; color?: string }[] = [
  // A entrada do Warden. Só aparece no projeto base — ver o filtro da faixa.
  { id: 'visao',    label: 'Visão geral', icon: GiSpikedShield, color: '#f59e0b' },
  { id: 'agents',   label: 'Agentes',  kind: 'agent' },
  { id: 'organizacao', label: 'Organização', icon: GiFamilyTree, color: '#a78bfa' },
  { id: 'memory',   label: 'Memória',  kind: 'memory' },
  { id: 'flows',    label: 'Fluxos',   kind: 'flow' },
  { id: 'personas', label: 'Personas', kind: 'persona' },
  { id: 'learning', label: 'Learning', icon: GiSkills, color: '#10b981' },
  { id: 'skillsclaude', label: 'Skills', icon: GiBookCover, color: '#0ea5e9' },
  { id: 'runtime',  label: 'Runtime', icon: GiPulse, color: '#f472b6' },
  { id: 'canvas',   label: 'Mapa de Memória', icon: GiTreasureMap, color: '#06b6d4' },
  { id: 'cosmos',   label: 'Cosmos', icon: GiGalaxy, color: '#a78bfa' },
  { id: 'controle', label: 'Controle', icon: GiControlTower, color: '#38bdf8' },
  { id: 'setup',    label: 'Gerar Setup', icon: GiMagicSwirl, color: '#a855f7' },
]
const rotuloPagina = (p: Pagina) => PAGINAS.find(x => x.id === p)?.label || p

const tituloDaAba = (a: Aba) => a.tipo === 'pagina' ? rotuloPagina(a.pagina) : a.titulo

// A aba usa o MESMO ícone e a MESMA cor da seção — os dois vêm de Aparência ›
// Ícones e cores. Pintar a aba de uma cor e a faixa de outra era o tipo de
// detalhe que faz a tela parecer de dois sistemas.
function iconeDaAba(a: Aba): { I: React.ComponentType<{ size?: number; className?: string }>; cor: string } {
  if (a.tipo === 'recurso') return { I: getIcon(KIND_META[a.kind].icon), cor: KIND_META[a.kind].color }
  if (a.tipo === 'skill') {
    const s = doSistema('secao.learning', 'GiSkills', '#10b981')
    return { I: getIcon(s.icon), cor: s.color }
  }
  if (a.tipo === 'mapa') {
    const s = doSistema('secao.canvas', 'GiTreasureMap', '#06b6d4')
    return { I: getIcon(s.icon), cor: s.color }
  }
  // A peneira de `lerAbas` já deveria ter tirado página desconhecida daqui.
  // O fallback existe porque o custo de errar é a tela inteira preta, e o de
  // acertar é um ícone genérico por um instante.
  const p = PAGINAS.find(x => x.id === a.pagina)
  const s = doSistema(`secao.${a.pagina}`,
    p?.kind ? KIND_META[p.kind].icon : '', p?.kind ? KIND_META[p.kind].color : (p?.color || '#8b5cf6'))
  if (s.icon) return { I: getIcon(s.icon), cor: s.color }
  return { I: p?.icon ?? GiSkills, cor: s.color }
}

/**
 * As abas de projeto — a tira de cima do casco.
 *
 * Aqui se ABRE um projeto, e abrir é só olhar. Existia também um "ligar" — um
 * play que elegia um projeto como o da vez — para evitar o erro caro de
 * ESCREVER no projeto errado. Ele saiu: era estado da SESSÃO tentando
 * responder uma pergunta do AGENTE, e avisava depois de o trabalho já estar
 * gravado. Quem responde agora é o identificador `<projeto>:<agente>`, que o
 * agente carrega no próprio protocolo e o `xp.py` confere antes de escrever.
 *
 * Nada se mistura entre projetos. O que atravessa é o arquétipo de um agente,
 * enviado de propósito, sem papel, sem squad e sem histórico.
 */
function AbasDeProjeto({ projetos, atual, casa, onCasa, onAbrir, onNovo, onZen }: {
  projetos: ProjectMeta[]
  atual: string
  /** A home do Warden está aberta: nenhum projeto está em foco. */
  casa: boolean
  onCasa: () => void
  onAbrir: (slug: string) => void
  onNovo: () => void
  onZen: () => void
}) {
  return (
    <div className="relative z-10 h-8 shrink-0 flex items-center gap-1 px-2 overflow-x-auto
                    border-b border-white/[0.05]">
      {/* A casa fica antes de tudo, como na home do Figma: é para onde se volta
          quando a pergunta é sobre o conjunto, e não sobre um projeto. */}
      <button onClick={onCasa} title="A tela do Warden — todos os projetos"
        className={`h-6 w-6 shrink-0 grid place-items-center rounded-md border transition-colors ${
          casa ? 'text-amber-300 bg-amber-500/15 border-amber-500/40'
               : 'text-gray-500 hover:text-amber-300/80 border-transparent hover:bg-white/[0.06]'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" />
        </svg>
      </button>
      <span className="w-px h-4 bg-white/[0.08] mx-1 shrink-0" />
      {projetos.map(p => {
        const aberto = p.slug === atual
        return (
          <div key={p.slug} onClick={() => onAbrir(p.slug)} title="Abrir este projeto"
            className={`group/pj h-6 shrink-0 flex items-center gap-1.5 px-2 rounded-md cursor-pointer
                        text-[11.5px] transition-colors border
                        ${aberto && !casa ? 'text-gray-100 bg-white/[0.07] border-white/[0.10]'
                                          : 'text-gray-500 hover:text-gray-200 border-transparent'}`}>
            <span className="truncate max-w-[12rem]">{p.displayName}</span>
          </div>
        )
      })}
      <button onClick={onNovo} title="Novo projeto"
        className="w-6 h-6 shrink-0 grid place-items-center rounded-md text-gray-600 hover:text-gray-200 hover:bg-white/[0.06]">
        +
      </button>

      <span className="flex-1" />
      {/* O zen mora na tira de cima, e não na faixa de seções, porque a faixa
          só existe DENTRO de um projeto — e parar de trabalhar é um gesto sobre
          o sistema, que se toma de qualquer lugar, inclusive da home. */}
      {(() => {
        const z = doSistema('secao.zen', 'GiMeditation', '#a78bfa')
        const IconeZen = getIcon(z.icon)
        return (
          // Ícone sozinho de 13px encostado na borda é invisível na prática: o
          // modo zen existia na home do Warden e ninguém o achava. Ganha rótulo.
          <button onClick={onZen} title="Modo zen — só o relógio (Esc sai)"
            className="h-6 shrink-0 flex items-center gap-1.5 px-2 rounded-md text-[11px]
                       text-gray-500 border border-white/[0.07] hover:bg-white/[0.06]
                       hover:text-gray-200 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.color = z.color }}
            onMouseLeave={e => { e.currentTarget.style.color = '' }}>
            <IconeZen size={13} /> zen
          </button>
        )
      })()}
    </div>
  )
}

// ── Estado das abas, lembrado por projeto ────────────────────────────────────
const chaveAbas = (proj: string) => `noctis.abas.${proj}`
const PADRAO_ABAS = {
  abas: [{ id: 'pagina:agents', tipo: 'pagina', pagina: 'agents' }] as Aba[],
  ativa: 'pagina:agents',
}

/**
 * As abas de um projeto, como ficaram na última vez — peneiradas.
 *
 * O que está no `localStorage` foi escrito por uma versão ANTERIOR do app, e
 * uma página pode ter sido renomeada desde então (foi o que aconteceu quando
 * `skills` virou `learning`). Uma aba apontando para um id que não existe mais
 * derrubava a árvore inteira do React — tela preta, sem mensagem, e sem como
 * sair porque o estado ruim era relido a cada carga.
 *
 * Por isso a leitura é defensiva: aba de página só passa se o id ainda existir
 * no catálogo, aba de qualquer outro tipo precisa ter os campos que o desenho
 * dela usa. O que não passa é descartado em silêncio — perder uma aba aberta é
 * barato; não conseguir abrir o app, não.
 */
function lerAbas(proj: string): { abas: Aba[]; ativa: string } {
  try {
    const d = JSON.parse(localStorage.getItem(chaveAbas(proj)) || 'null')
    if (!d || !Array.isArray(d.abas)) return PADRAO_ABAS
    const validas: Aba[] = d.abas.filter((a: Aba | null) => {
      if (!a || typeof a !== 'object' || !a.id) return false
      if (a.tipo === 'pagina') return PAGINAS.some(x => x.id === a.pagina)
      if (a.tipo === 'recurso') return !!a.kind && !!KIND_META[a.kind] && !!a.nome
      if (a.tipo === 'skill') return !!a.chave
      if (a.tipo === 'mapa') return !!a.mapa
      return false
    })
    if (!validas.length) return PADRAO_ABAS
    const ativa = validas.some(a => a.id === d.ativa) ? d.ativa : validas[0].id
    return { abas: validas, ativa }
  } catch { /* sem storage */ }
  return PADRAO_ABAS
}

export default function App() {
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [current, setCurrent]   = useState<string>(getProject())
  const [showProjects, setShowProjects] = useState(false)
  // Muda a cada troca de projeto (ou de aparência) para as vistas relerem.
  const [scope, setScope]       = useState(0)
  const [versao, setVersao]     = useState(0)
  const [vocab, setVocab]       = useState<MemoryVocab | null>(null)
  // Configurações: null = fechada; string = a seção em que abre.
  const [configAberta, setConfigAberta] = useState<string | null>(null)
  const [vocabMudou, setVocabMudou] = useState(false)
  const prefs = usePreferencias()
  // Abriu algo na doca (grade, mapa, repertório): a doca aparece, e larga o
  // bastante para ler — o detalhe que antes era drawer mora nela agora.
  const { pedido } = useDoca()
  useEffect(() => {
    if (!pedido) return
    setDir(true)
    setLarguraDir(w => Math.max(w, 420))
  }, [pedido])
  useEffect(() => { (document.documentElement.style as unknown as { zoom: string }).zoom = String(prefs.zoom / 100) }, [prefs.zoom])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); setConfigAberta('interface') } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const [abas, setAbas] = useState<Aba[]>(() => lerAbas(getProject()).abas)
  const [ativa, setAtiva] = useState<string>(() => lerAbas(getProject()).ativa)
  const [historico, setHistorico] = useState<{ pilha: string[]; pos: number }>({ pilha: [], pos: -1 })
  // A home é a tela inicial do sistema. Ela não é um projeto: é o andar de
  // cima, e por isso vive fora do escopo de projeto — abrir um projeto sai
  // dela, e o botão de casa volta sem fechar nada do que estava aberto.
  const [casa, setCasa] = useState(() => localStorage.getItem('noctis.casa') !== '0')
  // Modo zen NÃO é lembrado entre sessões de propósito: abrir o Noctis e cair
  // numa tela sem informação nenhuma pareceria defeito, não escolha.
  const [zen, setZen] = useState(false)
  useEffect(() => {
    try { localStorage.setItem('noctis.casa', casa ? '1' : '0') } catch { /* sem storage */ }
  }, [casa])
  const [esq, setEsq] = useState(() => localStorage.getItem('noctis.esq') !== '0')
  const [larguraEsq, setLarguraEsq] = useState(() => Number(localStorage.getItem('noctis.larguraEsq')) || 250)
  const [larguraDir, setLarguraDir] = useState(() => Number(localStorage.getItem('noctis.larguraDir')) || 300)
  const [dir, setDir] = useState(() => localStorage.getItem('noctis.dir') !== '0')

  // A aparência dos tipos entra ANTES das vistas montarem: KIND_META é lido de
  // forma síncrona em dezenas de lugares, e desenhar com o padrão para depois
  // corrigir daria um piscar de cor em toda a interface.
  useEffect(() => {
    api.memoryTypes()
      .then(v => { aplicarVocabulario(v.kinds); aplicarTipos(v.types); aplicarSistema(v.sistema); aplicarPontilhado(v.pontilhado); aplicarTamanhos(v.iconSizes); aplicarAura(v.aura); aplicarLogo(v.logo); aplicarCeu(v.ceu); aplicarVidro(v.vidro); setVocab(v) })
      .catch(() => setVocab({ kinds: {}, types: {}, origins: {}, defaultType: 'nota', defaultOrigin: 'inserido' } as MemoryVocab))
  }, [])

  useEffect(() => { try { localStorage.setItem('noctis.esq', esq ? '1' : '0') } catch { /* */ } }, [esq])
  useEffect(() => { try { localStorage.setItem('noctis.dir', dir ? '1' : '0') } catch { /* */ } }, [dir])
  useEffect(() => { try { localStorage.setItem('noctis.larguraEsq', String(larguraEsq)) } catch { /* */ } }, [larguraEsq])
  useEffect(() => { try { localStorage.setItem('noctis.larguraDir', String(larguraDir)) } catch { /* */ } }, [larguraDir])
  useEffect(() => {
    try { localStorage.setItem(chaveAbas(current), JSON.stringify({ abas, ativa })) } catch { /* */ }
  }, [abas, ativa, current])

  // ── Projetos ───────────────────────────────────────────────────────────────
  async function loadProjects(select?: string) {
    const list = await api.listProjects()
    setProjects(list)
    const wanted = select || getProject()
    const chosen = list.some(p => p.slug === wanted) ? wanted : (list[0]?.slug ?? 'noctis')
    trocarDeProjeto(chosen, false)
  }
  useEffect(() => { loadProjects() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Os projetos das abas chegam PRÉ-CARREGADOS: assim que a lista existe, cada
  // um é lido em segundo plano e fica no cache do navegador. Trocar de aba
  // deixa de ser uma espera e vira o que a aba promete ser — já estar lá.
  // É de propósito que isto rode uma vez e em série: vinte requisições juntas
  // no arranque competiriam com o que você está olhando agora.
  useEffect(() => {
    if (!projects.length) return
    let vivo = true
    ;(async () => {
      for (const p of projects) {
        if (!vivo) return
        try { await api.recursosDoProjeto(p.slug) } catch { /* projeto ilegível não trava os outros */ }
      }
    })()
    return () => { vivo = false }
  }, [projects])

  // `sair` diz se este gesto tira você da home. A carga inicial escolhe um
  // projeto para o escopo existir, e isso NÃO é um pedido para sair da tela do
  // Warden — era assim que a home sumia sozinha no arranque.
  function trocarDeProjeto(slug: string, sair = true) {
    if (sair) setCasa(false)
    setProject(slug)
    setCurrent(slug)
    const salvo = preferencias().restaurarAbas ? lerAbas(slug) : { abas: [], ativa: '' }
    setAbas(salvo.abas)
    setAtiva(salvo.ativa)
    setHistorico({ pilha: [salvo.ativa], pos: 0 })
    setScope(s => s + 1)
  }

  async function createProject() {
    const name = await pedirTexto({
      titulo: 'Novo projeto', rotulo: 'Nome',
      dica: 'como você chamaria numa conversa', confirmar: 'criar',
    })
    if (!name) return
    try { const res = await api.createProject(name); await loadProjects(res.slug) }
    catch (e) { aviso.erro(e) }
  }
  async function deleteProject(slug: string) {
    const proj = projects.find(p => p.slug === slug)
    const nome = proj?.displayName ?? slug
    if (!await confirmar({
      titulo: `Mandar "${nome}" para a lixeira?`,
      corpo: 'Nada é apagado agora — dá para restaurar em Controle.',
      confirmar: 'mandar para a lixeira', perigo: true,
    })) return
    try { await api.deleteProject(slug); await loadProjects() }
    catch (e) { aviso.erro(e) }
  }
  async function renameProject(slug: string) {
    const proj = projects.find(p => p.slug === slug)
    const nv = await pedirTexto({
      titulo: 'Renomear projeto', rotulo: 'Novo nome',
      valor: proj?.displayName ?? '', confirmar: 'renomear',
    })
    if (!nv || nv === proj?.displayName) return
    try { await api.renameProject(slug, nv); await loadProjects(current) }
    catch (e) { aviso.erro(e) }
  }

  // ── Abas ───────────────────────────────────────────────────────────────────
  const focar = useCallback((id: string) => {
    setAtiva(id)
    setHistorico(h => {
      if (h.pilha[h.pos] === id) return h
      const pilha = [...h.pilha.slice(0, h.pos + 1), id].slice(-50)
      return { pilha, pos: pilha.length - 1 }
    })
  }, [])

  const abrir = useCallback((nova: Aba) => {
    setAbas(as => as.some(a => a.id === nova.id) ? as : [...as, nova])
    focar(nova.id)
  }, [focar])

  const abrirPagina = useCallback((p: string) =>
    abrir({ id: `pagina:${p}`, tipo: 'pagina', pagina: p as Pagina }), [abrir])

  const abrirItem = useCallback((i: AbrirItem) => {
    if (i.tipo === 'recurso') {
      // Fluxo não tem vista de detalhe própria: abre a página de fluxos.
      if (i.kind === 'flow') return abrirPagina('flows')
      abrir({ id: `recurso:${i.kind}:${i.nome}`, tipo: 'recurso', kind: i.kind, nome: i.nome, titulo: i.titulo })
    } else if (i.tipo === 'skill') {
      abrir({ id: `skill:${i.chave}`, tipo: 'skill', chave: i.chave, titulo: i.titulo })
    } else {
      abrir({ id: `mapa:${i.mapa}`, tipo: 'mapa', mapa: i.mapa, titulo: i.titulo })
    }
  }, [abrir, abrirPagina])

  const fechar = (id: string) => {
    setAbas(as => {
      const i = as.findIndex(a => a.id === id)
      const resto = as.filter(a => a.id !== id)
      if (id === ativa) {
        const vizinha = resto[Math.min(i, resto.length - 1)]
        setAtiva(vizinha ? vizinha.id : '')
      }
      return resto
    })
  }

  const voltar = () => setHistorico(h => {
    let pos = h.pos - 1
    while (pos >= 0 && !abas.some(a => a.id === h.pilha[pos])) pos--
    if (pos < 0) return h
    setAtiva(h.pilha[pos]); return { ...h, pos }
  })
  const avancar = () => setHistorico(h => {
    let pos = h.pos + 1
    while (pos < h.pilha.length && !abas.some(a => a.id === h.pilha[pos])) pos++
    if (pos >= h.pilha.length) return h
    setAtiva(h.pilha[pos]); return { ...h, pos }
  })

  /** Drill down do Cosmos: abre o mapa escolhido numa aba própria. */
  function abrirMapa(id: string) {
    api.listCanvases().then(ms => {
      const m = ms.find(x => x.id === id)
      abrir({ id: `mapa:${id}`, tipo: 'mapa', mapa: id, titulo: m?.name || id })
    }).catch(() => abrir({ id: `mapa:${id}`, tipo: 'mapa', mapa: id, titulo: id }))
  }

  const abaAtiva = abas.find(a => a.id === ativa)
  const currentMeta = projects.find(p => p.slug === current)
  const nomeProjeto = currentMeta?.displayName ?? current

  const contexto: Contexto = useMemo(() => {
    if (!abaAtiva) return null
    if (abaAtiva.tipo === 'pagina') return { tipo: 'pagina', titulo: rotuloPagina(abaAtiva.pagina) }
    if (abaAtiva.tipo === 'recurso') return { tipo: 'recurso', kind: abaAtiva.kind, nome: abaAtiva.nome, titulo: abaAtiva.titulo }
    if (abaAtiva.tipo === 'skill') return { tipo: 'skill', chave: abaAtiva.chave, titulo: abaAtiva.titulo }
    return { tipo: 'mapa', mapa: abaAtiva.mapa, titulo: abaAtiva.titulo }
  }, [abaAtiva])

  // ── Conteúdo da aba ────────────────────────────────────────────────────────
  function conteudo(a: Aba) {
    if (a.tipo === 'recurso') {
      return <Drawer embutido key={`${scope}-${a.id}`} target={{ kind: a.kind, name: a.nome }}
        onClose={() => fechar(a.id)} onChanged={() => setVersao(v => v + 1)} />
    }
    if (a.tipo === 'skill') {
      return <DrawerLearning embutido key={`${scope}-${a.id}`} chave={a.chave}
        onFechar={() => fechar(a.id)} onMudou={() => setVersao(v => v + 1)} />
    }
    if (a.tipo === 'mapa') {
      return <MemoryCanvasPage key={`${scope}-${a.id}`} mapaInicial={a.mapa} />
    }
    switch (a.pagina) {
      case 'visao':    return (
        <VisaoPage key={scope} projetos={projects}
          onAbrirProjeto={trocarDeProjeto}
          onAbrirLearnings={slug => { trocarDeProjeto(slug); abrirPagina('learning') }}
          onRecarregarProjetos={() => loadProjects(current)}
          onConfigurar={() => setConfigAberta('tipos')}
          onRenomearProjeto={renameProject} onExcluirProjeto={deleteProject}
          onZen={() => setZen(true)} />
      )
      case 'agents':   return <AgentsPage key={scope} />
      case 'organizacao': return <OrganizacaoPage key={scope} />
      case 'flows':    return <FlowsPage key={scope} />
      case 'personas': return <PersonasPage key={scope} />
      case 'memory':   return <MemoryPage key={scope} />
      case 'learning': return <LearningsPage key={scope} />
      case 'skillsclaude': return <SkillsPage key={scope} />
      case 'runtime':  return <RuntimePage key={scope} />
      case 'canvas':   return <MemoryCanvasPage key={scope} />
      case 'cosmos':   return <CosmosPage key={scope} onAbrirMapa={abrirMapa} />
      case 'controle': return <ControlePage key={scope} onAbrirProjeto={slug => { trocarDeProjeto(slug) }} />
      case 'setup':    return <SetupPage onImported={slug => loadProjects(slug)} />
    }
  }

  const botao = 'p-1.5 rounded-md text-gray-500 hover:text-gray-100 hover:bg-white/[0.06]'

  // Vidro é identidade do Noctis: os painéis flutuam SOBRE o céu, e o céu só
  // aparece se o painel deixar passar. Sem vidro, painel chapado.
  const painel = classePainel()

  // A faixa acompanha o tamanho de ícone escolhido em Aparência.
  const tamIcone = ICON_SIZES.nav
  const larguraFaixa = prefs.mostrarFaixa ? tamIcone + 20 : 0

  /** Alça de largura entre painéis. Arrastar muda, soltar grava. */
  const alca = (lado: 'esq' | 'dir') => (
    <div
      onMouseDown={e => {
        e.preventDefault()
        const x0 = e.clientX
        const w0 = lado === 'esq' ? larguraEsq : larguraDir
        const mover = (ev: MouseEvent) => {
          const dx = ev.clientX - x0
          const w = Math.max(200, Math.min(720, lado === 'esq' ? w0 + dx : w0 - dx))
          if (lado === 'esq') setLarguraEsq(w); else setLarguraDir(w)
        }
        const soltar = () => {
          window.removeEventListener('mousemove', mover)
          window.removeEventListener('mouseup', soltar)
          document.body.style.cursor = ''
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('mousemove', mover)
        window.addEventListener('mouseup', soltar)
      }}
      title="Arraste para ajustar a largura"
      className="w-1.5 shrink-0 cursor-col-resize rounded-full hover:bg-white/[0.12] active:bg-violet-400/40 transition-colors" />
  )

  return (
    // A classe na RAIZ é o que faz o vidro chegar a qualquer container, e não
    // só ao mapa. As regras do mapa continuam valendo: elas miram classes
    // (`corpo-vidro`, `camada-vidro`) que só existem lá.
    <div className={`relative h-screen flex flex-col bg-[#07070a] text-gray-300 overflow-hidden ${VIDRO.ativo ? 'vidro' : ''}`}>
      {/* O céu atrás de tudo: a casca é do Obsidian, a noite é do Noctis. */}
      {CEU.ativo && <FundoEstrelado cores={KIND_ORDER.map(k => KIND_META[k].color)} />}

      <AbasDeProjeto projetos={projects} atual={current}
        casa={casa} onCasa={() => setCasa(true)}
        onAbrir={trocarDeProjeto} onNovo={createProject} onZen={() => setZen(true)} />

      {casa && (
        <div className="relative z-10 flex-1 min-h-0">
          {/* Ramo de saída: a Visão já é uma página do workspace (case 'visao').
              Este bloco cai junto com o estado `casa`. */}
          <Suspense fallback={<CarregandoNoctis />}>
          <VisaoPage projetos={projects}
            onAbrirProjeto={trocarDeProjeto}
            onAbrirLearnings={slug => { trocarDeProjeto(slug); abrirPagina('learning') }}
            onRecarregarProjetos={() => loadProjects(current)}
            onConfigurar={() => setConfigAberta('tipos')}
            onRenomearProjeto={renameProject} onExcluirProjeto={deleteProject}
            onZen={() => setZen(true)} />
          </Suspense>
        </div>
      )}
      {!casa && (<>

      {/* ── Barra de cima: painéis e abas ──────────────────────────────────── */}
      <div className="relative z-10 h-10 shrink-0 flex items-center gap-1 px-2">
        <button onClick={() => setEsq(v => !v)} title="Mostrar/esconder a árvore" className={botao}>
          <TPainelEsq size={16} />
        </button>
        {/* Alinha as abas com o painel central */}
        <div className="shrink-0" style={{ width: Math.max(4, larguraFaixa + 6 + (esq ? larguraEsq + 6 : 0) - 36) }} />
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
          {abas.map(a => {
            const { I, cor } = iconeDaAba(a)
            const on = a.id === ativa
            return (
              <div key={a.id} onClick={() => focar(a.id)}
                onAuxClick={e => { if (e.button === 1) fechar(a.id) }}
                title={tituloDaAba(a)}
                className={`group/aba h-7 max-w-[13rem] shrink-0 flex items-center gap-1.5 pl-2.5 pr-1 rounded-md cursor-pointer text-[12px] transition-colors
                            ${on ? 'text-white' : 'text-gray-400 hover:text-gray-100'}`}
                // A aba ativa acende na cor do que ela guarda — agente, memória,
                // mapa —, como a barra lateral antiga fazia com cada seção.
                style={on ? { background: cor, boxShadow: `0 0 18px -6px ${cor}` }
                          : undefined}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = cor + '1f' }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = '' }}>
                <I size={13} className="shrink-0" />
                <span className="truncate">{tituloDaAba(a)}</span>
                <button onClick={e => { e.stopPropagation(); fechar(a.id) }} title="Fechar aba"
                  className={`p-0.5 rounded shrink-0 ${on ? 'text-white/75 hover:text-white' : 'opacity-0 group-hover/aba:opacity-100 text-gray-500 hover:text-gray-200'}`}>
                  <TFechar size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <button onClick={() => setDir(v => !v)} title="Mostrar/esconder o painel da direita" className={botao}>
          <TPainelDir size={16} />
        </button>
      </div>

      {/* ── Corpo: faixa, árvore, conteúdo, painel direito ─────────────────── */}
      <div className="relative z-10 flex-1 min-h-0 flex px-1.5">
        {/* Faixa de ícones: cada seção na própria cor, como a barra antiga */}
        {prefs.mostrarFaixa && <nav className="shrink-0 flex flex-col items-center gap-1 py-1 mr-1.5" style={{ width: larguraFaixa }}>
          {!esq && <div className="mb-2" title="Noctis"><LogoNoctis size={Math.min(28, tamIcone + 6)} /></div>}
          {PAGINAS.filter(p => !prefs.secoesOcultas.includes(p.id)
                     // A Visão geral é a entrada do WARDEN: dentro de um projeto
                     // cliente ela mostraria a grade de todos, que é dado de outro
                     // contexto na tela. `current` (estado) e não getProject(),
                     // senão a faixa não re-renderiza ao trocar de projeto.
                     && (p.id !== 'visao' || current === 'noctis')).map(p => {
            // O ícone e a cor de cada seção são escolha sua (Aparência › Ícones
            // do sistema); o padrão do código é só a reserva.
            const s = doSistema(`secao.${p.id}`,
              p.kind ? KIND_META[p.kind].icon : '', p.kind ? KIND_META[p.kind].color : (p.color || '#8b5cf6'))
            const cor = s.color
            const Icone = s.icon ? getIcon(s.icon) : (p.icon || getIcon('GiSkills'))
            const on = abaAtiva?.tipo === 'pagina' && abaAtiva.pagina === p.id
            return (
              <button key={p.id} onClick={() => abrirPagina(p.id)} title={p.label}
                className="grid place-items-center rounded-lg transition-colors"
                style={{ width: tamIcone + 14, height: tamIcone + 14,
                         color: on ? '#fff' : '#6b7280', background: on ? cor : undefined,
                         boxShadow: on ? `0 0 16px -4px ${cor}` : undefined }}
                onMouseEnter={e => { if (!on) { e.currentTarget.style.background = cor + '1f'; e.currentTarget.style.color = cor } }}
                onMouseLeave={e => { if (!on) { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#6b7280' } }}>
                <Icone size={tamIcone} />
              </button>
            )
          })}
          <div className="flex-1" />
          {(() => {
            // A engrenagem também é uma seção configurável: tinha o desenho e o
            // cinza cravados, e por isso era o único ícone da faixa que não
            // obedecia a Configurações › Ícones e cores.
            const s = doSistema('secao.config', 'GiGears', '#71717a')
            const Icone = getIcon(s.icon)
            return (
              <button onClick={() => setConfigAberta('interface')} title="Configurações (Ctrl+,)"
                className="grid place-items-center rounded-lg transition-colors mb-1"
                style={{ width: tamIcone + 14, height: tamIcone + 14, color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = s.color + '1f'; e.currentTarget.style.color = s.color }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#6b7280' }}>
                <Icone size={tamIcone} />
              </button>
            )
          })()}
        </nav>}

        {esq && (
          <>
            <aside className={`shrink-0 flex flex-col ${painel}`} style={{ width: larguraEsq }}>
              {/* A marca do Noctis, no tamanho e na cor escolhidos em Aparência */}
              <div className="px-3 pt-3 pb-2 flex items-center gap-2.5 shrink-0">
                <LogoNoctis size={Math.min(LOGO.tamanho, 64)} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-gray-100 font-bold text-[15px] leading-tight tracking-tight">Noctis</div>
                  <div className="text-[10.5px] text-gray-500 truncate">{nomeProjeto}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <Explorador projeto={current} projetoNome={nomeProjeto} versao={versao + scope}
                  onAbrir={abrirItem} onAbrirPagina={abrirPagina}
                  onTrocarProjeto={() => setShowProjects(true)} />
              </div>
            </aside>
            {alca('esq')}
          </>
        )}

        <main className={`flex-1 min-w-0 flex flex-col ${painel}`}>
          {/* Cabeçalho da vista: voltar, avançar e o título, como no Obsidian */}
          {prefs.mostrarCabecalhoAba && <div className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-white/[0.06]">
            <button onClick={voltar} disabled={historico.pos <= 0} title="Voltar"
              className={`${botao} disabled:opacity-30 disabled:hover:bg-transparent`}><TVoltar size={15} /></button>
            <button onClick={avancar} disabled={historico.pos >= historico.pilha.length - 1} title="Avançar"
              className={`${botao} disabled:opacity-30 disabled:hover:bg-transparent`}><TAvancar size={15} /></button>
            <div className="flex-1 text-center text-[12.5px] text-gray-300 truncate">
              {abaAtiva ? tituloDaAba(abaAtiva) : ''}
            </div>
            <div className="w-16" />
          </div>}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {/* Toda aba aberta fica montada, e só a ativa aparece: trocar de aba
                não perde rolagem, filtro nem o que estava sendo editado. */}
            {abas.map(a => (
              <div key={a.id} hidden={a.id !== ativa} className="absolute inset-0">
                {/* O sol do Noctis enquanto o pedaço da página chega. É a
                    mesma espera que já existia na troca de projeto, agora
                    também na primeira visita a uma seção. */}
                <Suspense fallback={<CarregandoNoctis />}>
                  {conteudo(a)}
                </Suspense>
              </div>
            ))}
            {!abaAtiva && (
              <div className="h-full grid place-items-center text-center">
                <div className="text-[13px] text-violet-300/80 bg-violet-500/10 rounded-lg px-5 py-3 leading-relaxed">
                  Abra algo na árvore da esquerda<br />ou uma seção na faixa de ícones
                </div>
              </div>
            )}
          </div>
        </main>

        {dir && (
          <>
            {alca('dir')}
            <aside className={`shrink-0 ${painel}`} style={{ width: larguraDir }}>
              <PainelDireito ctx={contexto} />
            </aside>
          </>
        )}
      </div>

      </>)}

      {prefs.mostrarBarraStatus && <div className="relative z-10">
        <BarraStatus projetoNome={nomeProjeto}
          onAbrirControle={() => abrirPagina('controle')}
          onAbrirNocturn={() => setDir(true)} />
      </div>}

      {/* O zen cobre a tela inteira e vem por último na árvore: ele não desmonta
          o que está aberto atrás, só esconde. Sair devolve exatamente o que
          estava — é o que faz entrar nele ser barato. */}
      {zen && (
        <Suspense fallback={<CarregandoNoctis />}>
          <ZenPage onSair={() => setZen(false)} />
        </Suspense>
      )}

      {configAberta && vocab && (
        <Configuracoes vocab={vocab} secaoInicial={configAberta} projetoAtual={current}
          onFechar={() => { setConfigAberta(null); if (vocabMudou) { setScope(x => x + 1); setVocabMudou(false) } }}
          onVocab={v => { aplicarVocabulario(v.kinds); aplicarTipos(v.types); aplicarSistema(v.sistema); aplicarPontilhado(v.pontilhado); aplicarTamanhos(v.iconSizes); aplicarAura(v.aura); aplicarLogo(v.logo); aplicarCeu(v.ceu); aplicarVidro(v.vidro); setVocab(v); setVocabMudou(true) }}
          onAbrirProjeto={slug => { trocarDeProjeto(slug); setConfigAberta(null) }}
          onProjetosMudaram={() => api.listProjects().then(l => l.some(p => p.slug === current) ? setProjects(l) : loadProjects())}
          onRedefinirLarguras={() => { setLarguraEsq(250); setLarguraDir(300) }} />
      )}
      {showProjects && (
        <ProjectsModal
          projects={projects}
          current={current}
          onSelect={slug => { trocarDeProjeto(slug); setShowProjects(false) }}
          onCreate={createProject}
          onDelete={deleteProject}
          onRename={renameProject}
          onClose={() => setShowProjects(false)}
        />
      )}

      {/* Por último e por cima de todo o resto: um diálogo pode ser pedido de
          dentro de qualquer modal desta lista. */}
      <Dialogos />
    </div>
  )
}
