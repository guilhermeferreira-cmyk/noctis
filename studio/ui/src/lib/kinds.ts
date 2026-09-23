import { useSyncExternalStore } from 'react'
import type { ResourceKind } from '../api'

/**
 * A aparência do Noctis é um MÓDULO MUTÁVEL, não estado do React — `KIND_META`,
 * `SISTEMA`, `ICON_SIZES` e companhia são lidos na renderização por qualquer
 * componente, sem prop e sem contexto. Isso é barato e é de propósito.
 *
 * O preço era este: mudar uma cor no painel mutava o objeto e NADA
 * re-renderizava. A tela só se atualizava se outra coisa, por acaso, causasse
 * um render — então trocar o ícone de uma seção às vezes pegava, às vezes não,
 * e parecia defeito aleatório. Era o mesmo bug reaparecendo a cada superfície
 * nova que lesse `doSistema`.
 *
 * Agora todo `aplicar*` avisa, e quem quiser acompanhar chama `useAparencia()`.
 * No `App` isso basta para repintar o app inteiro: as páginas são renderizadas
 * dentro dele.
 */
const ouvintesDaAparencia = new Set<() => void>()
let versaoDaAparencia = 0

/**
 * Avisa — mas SÓ se algo mudou de verdade.
 *
 * A comparação não é zelo: sem ela isto vira um laço. O painel de aparência
 * salva sozinho a cada mudança, o App aplica o que voltou do servidor, o aviso
 * re-renderiza o painel, e o efeito de salvar dispara outra vez. Foi exatamente
 * o "Maximum update depth exceeded" que apareceu na primeira versão disto.
 *
 * Aplicar o MESMO valor é um não-evento, e tratá-lo como tal fecha o ciclo.
 */
function avisarSeMudou(antes: string, depois: string) {
  if (antes === depois) return
  versaoDaAparencia++
  ouvintesDaAparencia.forEach(f => f())
}

/** Re-renderiza quem chama sempre que a aparência muda. */
export function useAparencia(): number {
  return useSyncExternalStore(
    f => { ouvintesDaAparencia.add(f); return () => { ouvintesDaAparencia.delete(f) } },
    () => versaoDaAparencia, () => versaoDaAparencia)
}

export const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#64748b']
export const DRAWER_W_KEY = 'agentStudio.drawerWidth'

/**
 * Aparência de cada tipo de recurso.
 *
 * Estes são os padrões; a cor e o ícone de verdade vêm do backend, que guarda o
 * que a pessoa escolheu. O objeto é MUTÁVEL de propósito: dezenas de lugares o
 * leem de forma síncrona, e `aplicarVocabulario` reescreve os campos em vez de
 * obrigar cada um a virar consumidor de contexto. O App carrega antes de montar
 * as páginas, então ninguém chega a desenhar com o padrão errado.
 */
export const KIND_META: Record<ResourceKind, { label: string; ext: string; icon: string; color: string }> = {
  memory:  { label: 'Memória', ext: '.md',   icon: 'GiBrain',          color: '#3b82f6' },
  agent:   { label: 'Agente',  ext: '.yaml', icon: 'GiRobotGolem',     color: '#10b981' },
  flow:    { label: 'Fluxo',   ext: '.yaml', icon: 'GiDirectionSigns', color: '#f59e0b' },
  persona: { label: 'Persona', ext: '.yaml', icon: 'GiPublicSpeaker',  color: '#ec4899' },
  // As duas que faltavam ao sistema inteiro: o trabalho em voo não era
  // observável em lugar nenhum, e a peça produzida não tinha estado nem versão.
  task:     { label: 'Tarefa', ext: '.yaml', icon: 'GiCheckedShield', color: '#38bdf8' },
  artifact: { label: 'Peça',   ext: '.md',   icon: 'GiStoneBlock',    color: '#a855f7' },
}

/**
 * Tamanho dos ícones, em px. Mutável pelo mesmo motivo de `KIND_META`: quem
 * desenha lê de forma síncrona, e o App remonta as páginas depois de aplicar.
 *   card  — o desenho grande do card, no grid e no mapa
 *   menu  — ícone de item de menu e de botão de ação
 *   nav   — ícone da barra lateral
 *   disco — os discos de nível e de Learnings, na borda do card de agente
 */
export const ICON_SIZES = {
  card: 30,          // o desenho grande, na grade e no mapa
  menu: 15,          // itens de menu e botões de ação
  nav: 19,           // a faixa de seções, à esquerda
  disco: 32,         // nível e Learnings, na borda do card do agente
  arvore: 13,        // os ícones da árvore de recursos
  doca: 15,          // os botões da doca da direita
  organizacao: 17,   // o card do agente na vista de Organização
  squad: 14,         // o ícone da squad
  habilidade: 12,    // a espécie e o estado, no card do Learning
}

export function aplicarTamanhos(t?: Partial<typeof ICON_SIZES>) {
  const _antes = JSON.stringify(ICON_SIZES)
  if (!t) return
  for (const k of Object.keys(ICON_SIZES) as (keyof typeof ICON_SIZES)[]) {
    const v = t[k]
    if (typeof v === 'number' && v > 0) ICON_SIZES[k] = v
  }
  avisarSeMudou(_antes, JSON.stringify(ICON_SIZES))
}

/** Ícone e cor de cada lugar do sistema — seções, doca, papéis, estados.
 *
 * Tipos de recurso e de memória já eram seus; o resto tinha desenho cravado no
 * código. Agora tudo que tem ícone próprio passa por aqui, e o servidor guarda
 * só o que você mudou.
 */
export const SISTEMA: Record<string, { grupo: string; label: string; icon: string; color: string }> = {}

export function aplicarSistema(s?: Record<string, { grupo: string; label: string; icon: string; color: string }>) {
  const _antes = JSON.stringify(SISTEMA)
  if (!s) return
  for (const k of Object.keys(s)) SISTEMA[k] = { ...s[k] }
  avisarSeMudou(_antes, JSON.stringify(SISTEMA))
}

/** O ícone e a cor de um lugar, com o padrão de reserva se ele ainda não veio. */
export function doSistema(chave: string, iconePadrao = 'GiSkills', corPadrao = '#a1a1aa') {
  const s = SISTEMA[chave]
  return { icon: s?.icon || iconePadrao, color: s?.color || corPadrao, label: s?.label || chave }
}

/** O pontilhado atrás dos canvases: mapa, cosmos e organização. */
export const PONTILHADO = { ativo: true, opacidade: 22, espaco: 20, tamanho: 1, cor: '#8b8b8b' }

export function aplicarPontilhado(p?: Partial<typeof PONTILHADO>) {
  const _antes = JSON.stringify(PONTILHADO)
  if (!p) return
  Object.assign(PONTILHADO, p)
  avisarSeMudou(_antes, JSON.stringify(PONTILHADO))
}

/** Ajustes da aura, mutáveis pelo mesmo motivo de `KIND_META`. */
export const AURA = { difusao: 26, tamanho: 24, ativo: true }

export function aplicarAura(a?: Partial<typeof AURA>) {
  const _antes = JSON.stringify(AURA)
  if (!a) return
  Object.assign(AURA, a)
  avisarSeMudou(_antes, JSON.stringify(AURA))
}

/** Aparência do logo. Mutável pelo mesmo motivo de `KIND_META`. */
export const LOGO = {
  tamanho: 26, modo: 'solida' as 'solida' | 'gradiente',
  cor: '#e5e7eb', corA: '#3b82f6', corB: '#ec4899', velocidade: 8,
}

export function aplicarLogo(l?: Partial<typeof LOGO>) {
  const _antes = JSON.stringify(LOGO)
  if (!l) return
  Object.assign(LOGO, l)
  avisarSeMudou(_antes, JSON.stringify(LOGO))
}

/** O céu do canvas. Mutável pelo mesmo motivo de `KIND_META`. */
export const CEU = { estrelas: 314, movimento: 90, nebulosas: 5, movNebulosa: 40, deriva: 0,
                     opacidade: 100, opacidadeNebulosa: 100,
                     ativo: true, estilo: 'estrelas' as 'estrelas' | 'malha' }

export function aplicarCeu(c?: Partial<typeof CEU>) {
  const _antes = JSON.stringify(CEU)
  if (!c) return
  Object.assign(CEU, c)
  avisarSeMudou(_antes, JSON.stringify(CEU))
}

/** Efeito vidro nos cards. Mutável como os demais. */
export const VIDRO = { ativo: true }

/**
 * A classe de um PAINEL do casco — árvore, conteúdo, doca, cartão do Warden.
 *
 * Estava escrita duas vezes, em App e em Home, e duas cópias de uma decisão
 * visual divergem no dia em que alguém ajusta uma. O vidro é identidade do
 * Noctis: o painel flutua SOBRE o céu, e o céu só aparece se ele deixar passar.
 */
export const classePainel = () => VIDRO.ativo
  ? 'bg-[#141417]/70 backdrop-blur-xl border border-white/[0.07] rounded-xl overflow-hidden shadow-2xl shadow-black/40'
  : 'bg-[#141417] border border-white/[0.07] rounded-xl overflow-hidden'
export function aplicarVidro(v?: boolean) {
  const _antes = JSON.stringify(VIDRO)
  if (typeof v === 'boolean') VIDRO.ativo = v
  avisarSeMudou(_antes, JSON.stringify(VIDRO))
}

/**
 * Tipos de memória, espelhados do backend.
 *
 * Como o `KIND_META`, é mutável e preenchido antes de as páginas montarem: os
 * cards leem o rótulo e a cor do tipo de forma síncrona, na hora de desenhar.
 */
export const TIPO_META: Record<string, { label: string; color: string; icon: string; desc: string; prompt: string }> = {}

export function aplicarTipos(types?: Record<string, { label: string; color: string; icon: string; desc: string; prompt: string }>) {
  const _antes = JSON.stringify(TIPO_META)
  if (!types) return
  for (const k of Object.keys(TIPO_META)) delete TIPO_META[k]
  Object.assign(TIPO_META, types)
  avisarSeMudou(_antes, JSON.stringify(TIPO_META))
}

export function aplicarVocabulario(kinds?: Record<string, { color?: string; icon?: string }>) {
  const _antes = JSON.stringify(KIND_META)
  if (!kinds) return
  for (const [k, v] of Object.entries(kinds)) {
    const alvo = KIND_META[k as ResourceKind]
    if (!alvo) continue
    if (v.color) alvo.color = v.color
    if (v.icon) alvo.icon = v.icon
  }
  avisarSeMudou(_antes, JSON.stringify(KIND_META))
}
export const KIND_ORDER: ResourceKind[] = ['agent', 'flow', 'persona', 'memory', 'task', 'artifact']

/** Todos os kinds que existem, derivados de `KIND_META`. Quem precisa iterar
 *  tipos usa isto — uma lista à parte envelheceria no dia em que o servidor
 *  ganhasse um tipo novo, e a grade dele viria vazia sem erro nenhum. */
export const KINDS_TODOS = Object.keys(KIND_META) as ResourceKind[]

export type DrawerTarget = { kind: ResourceKind; name: string }

export const EXT_ICON: Record<string, string> = {
  '.pdf': '📕', '.doc': '📘', '.docx': '📘', '.odt': '📘', '.rtf': '📘',
  '.xls': '📗', '.xlsx': '📗', '.ods': '📗', '.csv': '📗',
  '.ppt': '📙', '.pptx': '📙', '.odp': '📙',
  '.txt': '📄', '.md': '📄', '.json': '🧾', '.yaml': '🧾', '.yml': '🧾',
}
export const H_SIZE = [
  'text-lg font-semibold text-gray-100 mt-5 mb-2',
  'text-base font-semibold text-gray-100 mt-5 mb-2',
  'text-sm font-semibold text-gray-200 mt-4 mb-1.5',
  'text-sm font-semibold text-gray-300 mt-3 mb-1',
  'text-xs font-semibold text-gray-400 mt-3 mb-1 uppercase tracking-wide',
  'text-xs font-semibold text-gray-500 mt-3 mb-1 uppercase tracking-wide',
]

export const humanSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
