import type { ResourceKind } from '../api'

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
}

/**
 * Tamanho dos ícones, em px. Mutável pelo mesmo motivo de `KIND_META`: quem
 * desenha lê de forma síncrona, e o App remonta as páginas depois de aplicar.
 *   card  — o desenho grande do card, no grid e no mapa
 *   menu  — ícone de item de menu e de botão de ação
 *   nav   — ícone da barra lateral
 *   disco — os discos de nível e de habilidades, na borda do card de agente
 */
export const ICON_SIZES = { card: 30, menu: 15, nav: 19, disco: 32 }

export function aplicarTamanhos(t?: Partial<typeof ICON_SIZES>) {
  if (!t) return
  for (const k of Object.keys(ICON_SIZES) as (keyof typeof ICON_SIZES)[]) {
    const v = t[k]
    if (typeof v === 'number' && v > 0) ICON_SIZES[k] = v
  }
}

/** Ajustes da aura, mutáveis pelo mesmo motivo de `KIND_META`. */
export const AURA = { difusao: 26, tamanho: 24, ativo: true }

export function aplicarAura(a?: Partial<typeof AURA>) {
  if (!a) return
  Object.assign(AURA, a)
}

/** Aparência do logo. Mutável pelo mesmo motivo de `KIND_META`. */
export const LOGO = {
  tamanho: 26, modo: 'solida' as 'solida' | 'gradiente',
  cor: '#e5e7eb', corA: '#3b82f6', corB: '#ec4899', velocidade: 8,
}

export function aplicarLogo(l?: Partial<typeof LOGO>) {
  if (!l) return
  Object.assign(LOGO, l)
}

/** O céu do canvas. Mutável pelo mesmo motivo de `KIND_META`. */
export const CEU = { estrelas: 314, movimento: 90, nebulosas: 5, movNebulosa: 40, deriva: 0,
                     opacidade: 100, opacidadeNebulosa: 100,
                     ativo: true, estilo: 'estrelas' as 'estrelas' | 'malha' }

export function aplicarCeu(c?: Partial<typeof CEU>) {
  if (!c) return
  Object.assign(CEU, c)
}

/** Efeito vidro nos cards. Mutável como os demais. */
export const VIDRO = { ativo: true }
export function aplicarVidro(v?: boolean) {
  if (typeof v === 'boolean') VIDRO.ativo = v
}

/**
 * Tipos de memória, espelhados do backend.
 *
 * Como o `KIND_META`, é mutável e preenchido antes de as páginas montarem: os
 * cards leem o rótulo e a cor do tipo de forma síncrona, na hora de desenhar.
 */
export const TIPO_META: Record<string, { label: string; color: string; icon: string; desc: string; prompt: string }> = {}

export function aplicarTipos(types?: Record<string, { label: string; color: string; icon: string; desc: string; prompt: string }>) {
  if (!types) return
  for (const k of Object.keys(TIPO_META)) delete TIPO_META[k]
  Object.assign(TIPO_META, types)
}

export function aplicarVocabulario(kinds?: Record<string, { color?: string; icon?: string }>) {
  if (!kinds) return
  for (const [k, v] of Object.entries(kinds)) {
    const alvo = KIND_META[k as ResourceKind]
    if (!alvo) continue
    if (v.color) alvo.color = v.color
    if (v.icon) alvo.icon = v.icon
  }
}
export const KIND_ORDER: ResourceKind[] = ['agent', 'flow', 'persona', 'memory']

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
