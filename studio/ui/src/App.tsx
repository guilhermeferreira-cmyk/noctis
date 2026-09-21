import { useCallback, useEffect, useMemo, useState } from 'react'
import AgentsPage   from './pages/Agents'
import OrganizacaoPage from './pages/Organizacao'
import FlowsPage    from './pages/Flows'
import MemoryPage   from './pages/Memory'
import PersonasPage from './pages/Personas'
import SetupPage    from './pages/Setup'
import MemoryCanvasPage from './pages/MemoryCanvas'
import HabilidadesPage from './pages/Habilidades'
import ControlePage from './pages/Controle'
import CosmosPage from './pages/Cosmos'
import ProjectsModal from './ProjectsModal'
import { api, getProject, setProject, type ProjectMeta } from './api'
import { GiTreasureMap, GiMagicSwirl, GiGalaxy, GiSkills, GiControlTower, GiFamilyTree } from 'react-icons/gi'
import type { IconType } from 'react-icons'
import { KIND_META, KIND_ORDER, aplicarVocabulario, aplicarTipos, aplicarTamanhos, aplicarAura,
         aplicarLogo, aplicarCeu, aplicarVidro, ICON_SIZES, CEU, VIDRO, LOGO } from './lib/kinds'
import { FundoEstrelado } from './components/FundoEstrelado'
import { getIcon } from './memoryIcons'
import { Configuracoes } from './components/Configuracoes'
import { usePreferencias, preferencias } from './lib/preferencias'
import { useDoca } from './lib/doca'
import { LogoNoctis } from './components/LogoNoctis'
import { Drawer } from './components/Drawer'
import { DrawerSkill } from './components/DrawerSkill'
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

type Pagina = 'agents' | 'organizacao' | 'flows' | 'personas' | 'memory' | 'skills' | 'cosmos' | 'canvas' | 'controle' | 'setup'

type Aba =
  | { id: string; tipo: 'pagina'; pagina: Pagina }
  | { id: string; tipo: 'recurso'; kind: ResourceKind; nome: string; titulo: string }
  | { id: string; tipo: 'skill'; chave: string; titulo: string }
  | { id: string; tipo: 'mapa'; mapa: string; titulo: string }

// As quatro primeiras herdam ícone e cor do próprio tipo de recurso: a faixa e o
// card falam do mesmo objeto, então trocar a cor de "Agente" repinta os dois.
const PAGINAS: { id: Pagina; label: string; kind?: ResourceKind; icon?: IconType; color?: string }[] = [
  { id: 'agents',   label: 'Agentes',  kind: 'agent' },
  { id: 'organizacao', label: 'Organização', icon: GiFamilyTree, color: '#a78bfa' },
  { id: 'memory',   label: 'Memória',  kind: 'memory' },
  { id: 'flows',    label: 'Fluxos',   kind: 'flow' },
  { id: 'personas', label: 'Personas', kind: 'persona' },
  { id: 'skills',   label: 'Habilidades', icon: GiSkills, color: '#10b981' },
  { id: 'canvas',   label: 'Mapa de Memória', icon: GiTreasureMap, color: '#06b6d4' },
  { id: 'cosmos',   label: 'Cosmos', icon: GiGalaxy, color: '#a78bfa' },
  { id: 'controle', label: 'Controle', icon: GiControlTower, color: '#38bdf8' },
  { id: 'setup',    label: 'Gerar Setup', icon: GiMagicSwirl, color: '#a855f7' },
]
const rotuloPagina = (p: Pagina) => PAGINAS.find(x => x.id === p)?.label || p

const tituloDaAba = (a: Aba) => a.tipo === 'pagina' ? rotuloPagina(a.pagina) : a.titulo

function iconeDaAba(a: Aba): { I: React.ComponentType<{ size?: number; className?: string }>; cor: string } {
  if (a.tipo === 'recurso') return { I: getIcon(KIND_META[a.kind].icon), cor: KIND_META[a.kind].color }
  if (a.tipo === 'skill') return { I: GiSkills, cor: '#10b981' }
  if (a.tipo === 'mapa') return { I: GiTreasureMap, cor: '#06b6d4' }
  const p = PAGINAS.find(x => x.id === a.pagina)!
  return p.kind ? { I: getIcon(KIND_META[p.kind].icon), cor: KIND_META[p.kind].color }
                : { I: p.icon!, cor: p.color || '#8b5cf6' }
}

// ── Estado das abas, lembrado por projeto ────────────────────────────────────
const chaveAbas = (proj: string) => `noctis.abas.${proj}`
function lerAbas(proj: string): { abas: Aba[]; ativa: string } {
  try {
    const d = JSON.parse(localStorage.getItem(chaveAbas(proj)) || 'null')
    if (d && Array.isArray(d.abas) && d.abas.length) return d
  } catch { /* sem storage */ }
  return { abas: [{ id: 'pagina:agents', tipo: 'pagina', pagina: 'agents' }], ativa: 'pagina:agents' }
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
  const [esq, setEsq] = useState(() => localStorage.getItem('noctis.esq') !== '0')
  const [larguraEsq, setLarguraEsq] = useState(() => Number(localStorage.getItem('noctis.larguraEsq')) || 250)
  const [larguraDir, setLarguraDir] = useState(() => Number(localStorage.getItem('noctis.larguraDir')) || 300)
  const [dir, setDir] = useState(() => localStorage.getItem('noctis.dir') !== '0')

  // A aparência dos tipos entra ANTES das vistas montarem: KIND_META é lido de
  // forma síncrona em dezenas de lugares, e desenhar com o padrão para depois
  // corrigir daria um piscar de cor em toda a interface.
  useEffect(() => {
    api.memoryTypes()
      .then(v => { aplicarVocabulario(v.kinds); aplicarTipos(v.types); aplicarTamanhos(v.iconSizes); aplicarAura(v.aura); aplicarLogo(v.logo); aplicarCeu(v.ceu); aplicarVidro(v.vidro); setVocab(v) })
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
    trocarDeProjeto(chosen)
  }
  useEffect(() => { loadProjects() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  function trocarDeProjeto(slug: string) {
    setProject(slug)
    setCurrent(slug)
    const salvo = preferencias().restaurarAbas ? lerAbas(slug) : { abas: [], ativa: '' }
    setAbas(salvo.abas)
    setAtiva(salvo.ativa)
    setHistorico({ pilha: [salvo.ativa], pos: 0 })
    setScope(s => s + 1)
  }

  async function createProject() {
    const name = window.prompt('Nome do novo projeto:')?.trim()
    if (!name) return
    try { const res = await api.createProject(name); await loadProjects(res.slug) }
    catch (e) { alert('Erro ao criar projeto:\n' + (e as Error).message) }
  }
  async function deleteProject(slug: string) {
    const proj = projects.find(p => p.slug === slug)
    if (!window.confirm(`Mandar "${proj?.displayName ?? slug}" para a lixeira? Dá para restaurar em Controle.`)) return
    try { await api.deleteProject(slug); await loadProjects() }
    catch (e) { alert('Erro ao excluir projeto:\n' + (e as Error).message) }
  }
  async function renameProject(slug: string) {
    const proj = projects.find(p => p.slug === slug)
    const nv = window.prompt('Novo nome do projeto:', proj?.displayName ?? '')?.trim()
    if (!nv || nv === proj?.displayName) return
    try { await api.renameProject(slug, nv); await loadProjects(current) }
    catch (e) { alert('Erro ao renomear projeto:\n' + (e as Error).message) }
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
      return <DrawerSkill embutido key={`${scope}-${a.id}`} chave={a.chave}
        onFechar={() => fechar(a.id)} onMudou={() => setVersao(v => v + 1)} />
    }
    if (a.tipo === 'mapa') {
      return <MemoryCanvasPage key={`${scope}-${a.id}`} mapaInicial={a.mapa} />
    }
    switch (a.pagina) {
      case 'agents':   return <AgentsPage key={scope} />
      case 'organizacao': return <OrganizacaoPage key={scope} />
      case 'flows':    return <FlowsPage key={scope} />
      case 'personas': return <PersonasPage key={scope} />
      case 'memory':   return <MemoryPage key={scope} />
      case 'skills':   return <HabilidadesPage key={scope} />
      case 'canvas':   return <MemoryCanvasPage key={scope} />
      case 'cosmos':   return <CosmosPage key={scope} onAbrirMapa={abrirMapa} />
      case 'controle': return <ControlePage key={scope} onAbrirProjeto={slug => { trocarDeProjeto(slug) }} />
      case 'setup':    return <SetupPage onImported={slug => loadProjects(slug)} />
    }
  }

  const botao = 'p-1.5 rounded-md text-gray-500 hover:text-gray-100 hover:bg-white/[0.06]'

  // Vidro é identidade do Noctis: os painéis flutuam SOBRE o céu, e o céu só
  // aparece se o painel deixar passar. Sem vidro, painel chapado.
  const painel = VIDRO.ativo
    ? 'bg-[#141417]/70 backdrop-blur-xl border border-white/[0.07] rounded-xl overflow-hidden shadow-2xl shadow-black/40'
    : 'bg-[#141417] border border-white/[0.07] rounded-xl overflow-hidden'

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
    <div className="relative h-screen flex flex-col bg-[#07070a] text-gray-300 overflow-hidden">
      {/* O céu atrás de tudo: a casca é do Obsidian, a noite é do Noctis. */}
      {CEU.ativo && <FundoEstrelado cores={KIND_ORDER.map(k => KIND_META[k].color)} />}

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
          {PAGINAS.filter(p => !prefs.secoesOcultas.includes(p.id)).map(p => {
            const cor = p.kind ? KIND_META[p.kind].color : (p.color || '#8b5cf6')
            const Icone = p.kind ? getIcon(KIND_META[p.kind].icon) : p.icon!
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
          <button onClick={() => setConfigAberta('interface')} title="Configurações (Ctrl+,)"
            className="grid place-items-center rounded-lg text-gray-500 hover:text-gray-100 hover:bg-white/[0.07] mb-1"
            style={{ width: tamIcone + 14, height: tamIcone + 14 }}>
            <svg width={tamIcone - 2} height={tamIcone - 2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
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
                {conteudo(a)}
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

      {prefs.mostrarBarraStatus && <div className="relative z-10">
        <BarraStatus projetoNome={nomeProjeto}
          onAbrirControle={() => abrirPagina('controle')}
          onAbrirNocturn={() => setDir(true)} />
      </div>}

      {configAberta && vocab && (
        <Configuracoes vocab={vocab} secaoInicial={configAberta} projetoAtual={current}
          onFechar={() => { setConfigAberta(null); if (vocabMudou) { setScope(x => x + 1); setVocabMudou(false) } }}
          onVocab={v => { aplicarVocabulario(v.kinds); aplicarTipos(v.types); aplicarTamanhos(v.iconSizes); aplicarAura(v.aura); aplicarLogo(v.logo); aplicarCeu(v.ceu); aplicarVidro(v.vidro); setVocab(v); setVocabMudou(true) }}
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
    </div>
  )
}
