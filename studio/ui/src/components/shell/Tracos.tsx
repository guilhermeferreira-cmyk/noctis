/**
 * Ícones de traço fino para o "cromo" da janela: setas, painéis, abas.
 *
 * Os Game Icons continuam sendo a identidade do CONTEÚDO — cada tipo de card tem
 * o seu. Mas numa barra de ferramentas eles pesam: são desenhos cheios, feitos
 * para serem vistos grandes. Controle de janela pede o contrário, um traço que
 * some quando não é procurado. É a mesma divisão que o Obsidian faz.
 */
type P = { size?: number; className?: string }

const base = (size = 16, className = '') => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  className, 'aria-hidden': true,
})

export const TPainelEsq = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></svg>)
export const TPainelDir = ({ size, className }: P) => (
  <svg {...base(size, className)}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M15 4v16" /></svg>)
export const TVoltar = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M15 6l-6 6 6 6" /></svg>)
export const TAvancar = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M9 6l6 6-6 6" /></svg>)
export const TMais = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M12 5v14M5 12h14" /></svg>)
export const TFechar = ({ size, className }: P) => (
  <svg {...base(size, className)}><path d="M6 6l12 12M18 6L6 18" /></svg>)
export const TPontos = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>)
export const TInfo = ({ size, className }: P) => (
  <svg {...base(size, className)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
