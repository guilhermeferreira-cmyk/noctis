// URL do backend.
//
// Na máquina, a UI fala com o uvicorn em localhost:5501. Quando o backend é
// servido pela mesma origem (o deploy na Vercel), `VITE_API_BASE=/` faz as
// chamadas saírem como caminho relativo — a barra final é removida para não
// virar `//api/...`, que o navegador leria como outro host.
const _base = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE
const BASE = (_base ?? 'http://localhost:5501').replace(/\/+$/, '')

// ── Projeto atual (tenant) ──────────────────────────────────────────────────
// Todos os recursos (agents/flows/memory/personas) são escopados por projeto.
const PROJECT_KEY = 'agentStudio.currentProject'
let currentProject = localStorage.getItem(PROJECT_KEY) || 'noctis'

export function getProject(): string {
  return currentProject
}

export function setProject(slug: string): void {
  currentProject = slug
  localStorage.setItem(PROJECT_KEY, slug)
}

/** Prefixo das rotas escopadas no projeto atual. */
function px(): string {
  return `/api/projects/${encodeURIComponent(currentProject)}`
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`)
  }
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentMeta {
  name: string
  displayName: string
  description: string
}

export interface AgentConfig {
  name?: string
  description?: string
  system_prompt?: string
  memory_files?: string[]
  tools?: string[]
  output_format?: string
  temperature?: number
}

export interface FlowMeta {
  name: string
  displayName: string
  description: string
}

export interface FlowStep {
  id: string
  agent: string
  input?: string
  instruction?: string
  output_key?: string
}

export interface FlowConfig {
  name?: string
  description?: string
  steps?: FlowStep[]
  output?: string
}

export interface MemoryFile {
  name: string
  filename: string
  /** Quantos arquivos acompanham esta memória. */
  attachments?: number
  /** Quantos desses arquivos são imagem. */
  images?: number
  /** URLs das primeiras imagens, para a grade de miniaturas do card. */
  thumbs?: string[]
}

export interface Attachment {
  filename: string
  size: number
  ext: string
  isImage: boolean
  mime: string
  /** Caminho relativo à API; passe por `assetUrl` antes de usar em `src`/`href`. */
  url: string
}

/** Converte um caminho devolvido pela API em URL absoluta para `src`/`href`. */
export function assetUrl(path: string): string {
  return path.startsWith('http') ? path : BASE + path
}

/** Lê um File do disco como base64 puro, sem o prefixo `data:`. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(String(r.result).split(',', 2)[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export interface PersonaMeta {
  name: string
  displayName: string
  role: string
  age: number | string
}

export interface PersonaConfig {
  name?: string
  role?: string
  age?: number | string
  company_profile?: string
  bio?: string
  goals_on_site?: string[]
  tech_literacy?: string
  preferred_device?: string
  reading_pattern?: string
  trust_signals?: string[]
  red_flags?: string[]
  objections?: string[]
  entry_point?: string
}

export interface AppConfig {
  agents: string[]
  memory_files: string[]
  personas: string[]
}

export interface ProjectMeta {
  slug: string
  displayName: string
  counts: { agents: number; flows: number; memory: number; personas: number }
}

export interface SetupBrief {
  name: string
  slug?: string
  description?: string
  audience?: string
  goals?: string
  tone?: string
  stack?: string
  num_agents?: number
  num_flows?: number
  num_personas?: number
  extras?: string
}

export interface ImportResult {
  ok: boolean
  slug: string
  displayName: string
  counts: Record<string, number>
}

export type ResourceKind = 'memory' | 'agent' | 'flow' | 'persona'

export interface CanvasLane {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  tags?: string[]
  /** Orcamento (em caracteres) do condensado da lane. */
  budget?: number
}

export interface CanvasNode {
  id?: string
  kind?: ResourceKind
  name: string
  parent?: string | null
  x: number
  y: number
  color: string
  icon: string
  active: boolean
  tags?: string[]
  width?: number
  height?: number
  /** Peso da instancia no condensado da lane. 1 = neutro, 0 = fora. */
  weight?: number
  // Resumo (somente leitura, vindo do backend)
  title?: string
  excerpt?: string
  badge?: string
  lines?: number
  chars?: number
  usedBy?: string[]
  /** Quantos arquivos acompanham a memória. */
  attachments?: number
  /** Quantos desses arquivos são imagem. */
  images?: number
  /** URLs das primeiras imagens, para a grade de miniaturas do card. */
  thumbs?: string[]
  /** De onde veio o recurso: 'inserido' ou 'produzido'. Somente leitura aqui —
   *  quem manda é o resources.json, e o PUT do canvas não sobrescreve. */
  origin?: string
  /** Tipo da memória, pela mesma via da origem: identidade, não arranjo. */
  type?: string
  decision?: Decision
}

export interface DigestPlanItem {
  kind: ResourceKind
  name: string
  weight: number
  share: number
  chars: number
  budget: number
  kept: number
  condensed: boolean
}

export interface LaneDigest {
  name: string
  budget: number
  plan: DigestPlanItem[]
  digest: string
  digestChars: number
  sourceChars: number
  prompt: string
}

export interface ResourceItem {
  name: string
  displayName: string
  kind?: ResourceKind
  /** Resumo vindo do backend: título, trecho, selo e contagens do arquivo. */
  title?: string
  excerpt?: string
  badge?: string
  lines?: number
  usedBy?: string[]
  attachments?: number
  images?: number
  thumbs?: string[]
  /** Identidade — ver ResourceIdentity. */
  color?: string
  icon?: string
  active?: boolean
  tags?: string[]
  type?: string
  origin?: string
  /** Presente só quando há escolhas: é isso que faz o card virar decisão. */
  decision?: Decision
}
/** Identidade do recurso: cor, ícone, tags e ativa/inativa. Vive no
 *  `resources.json` do projeto, não no mapa — ver `_load_identity` no backend. */
export interface ResourceIdentity {
  color: string
  icon: string
  active: boolean
  tags: string[]
  /** Só memória: obrigatórios, governam o que entra no prompt e o peso. */
  type?: string
  origin?: string
}

/** Uma escolha dentro de um card. Marcar só registra — nada é executado. */
export interface DecisionOption {
  id: string
  label: string
  checked: boolean
  by?: string | null
  at?: string | null
}

export interface Decision {
  /** radio: escolha única · check: várias */
  mode: 'radio' | 'check'
  question: string
  options: DecisionOption[]
}

export interface MemoryTypeMeta {
  label: string
  color: string
  icon: string
  /** 'sempre' | 'sob demanda' | 'nunca' — o que entra no prompt por padrão. */
  prompt: string
  peso: number
  valida: boolean
  desc: string
}

export interface KindMeta {
  label: string
  ext: string
  color: string
  icon: string
}

export interface IconSizes { card: number; menu: number; nav: number; disco: number }

/** difusao = raio do blur; tamanho = quanto a aura extravasa a borda do card. */
export interface AuraCfg { difusao: number; tamanho: number; ativo: boolean }

/** Uma habilidade aprendida: sem lista prévia, ela nasce do trabalho. */
export interface Habilidade {
  rotulo: string
  xp: number
  nivel: number
  eventos: number
  progresso: number
  inicio_nivel: number
  proximo_nivel: number
  aliases: string[]
  primeira?: string
  ultima?: string
}

/** Uma habilidade no repertório do projeto — a mesma para todos os agentes. */
export interface SkillCard {
  chave: string
  rotulo: string
  descricao: string
  aliases: string[]
  estado: 'broto' | 'firmada' | 'arquivada'
  /** Que tipo de aprendizado é: competência, armadilha, método… (legado, virou tag) */
  especie: string
  /** Legado: houve uma divisão procedimento/domínio, e ela caiu. */
  natureza?: string
  /** As respostas que você deu às perguntas — é delas que sai o documento. */
  enquadramento?: Record<string, string>
  /** Você escreveu o documento à mão: as respostas param de remontá-lo. */
  corpo_curado?: boolean
  /** Agrupamento livre. O vocabulário nasce do uso; nome próprio não entra. */
  tags: string[]
  cor?: string
  icone?: string
  nasceu_em?: string
  nasceu_de?: string
  /** Declarados: devem ter a habilidade, sem XP nenhum. */
  vinculados: string[]
  /** Exercitam de fato, com nível e XP próprios. */
  portadores: { agente: string; nivel: number; xp: number; eventos: number; progresso: number; ultima?: string }[]
  /** O que cada agente aprendeu ao subir de nível nela. */
  marcos: { agente: string; quando: string; nivel: number; texto: string }[]
  /** Se já existe corpo escrito, para o card dizer sem carregar o texto. */
  temCorpo?: boolean
  eventos: number
  xp: number
  nivel_maximo: number
}

/** Um achado da ronda do NOCTURN. */
export interface NocturnAchado {
  ronda: 'vocabulario' | 'trabalho' | 'agentes' | 'memoria'
  tipo: 'skill_sem_descricao' | 'skill_parecida' | 'sem_confirmacao' | 'decisao_pendente'
      | 'agente_parado' | 'agente_sem_trabalho' | 'memoria_sem_autor' | 'memoria_sem_uso'
      | 'skill_sem_leitura' | 'skill_sem_corpo'
  urgencia: 'alta' | 'media' | 'baixa'
  projeto: string
  texto: string
  chave?: string
  outra?: string
  rotulo?: string
  outroRotulo?: string
  estado?: string
  evento?: string
  agente?: string
  agentes?: string[]
  recurso?: string
  kind?: string
  dias?: number
}

export interface NocturnRonda { id: string; rotulo: string; desc: string; total: number }

export interface NocturnRelatorio {
  quando: string
  rondas: NocturnRonda[]
  projetos: { projeto: string; eventos: number; agentes?: number; skills?: number }[]
  achados: NocturnAchado[]
  resumo: { semDescricao: number; semConfirmacao: number; parados: number }
}

export interface NocturnMensagem {
  id: string
  quando: string
  autor: 'nocturn' | 'voce'
  texto: string
  projeto?: string
  assunto?: string
}

/** A habilidade aberta: tudo do card, mais os eventos que a construíram. */
export interface SkillDetalhe extends SkillCard {
  /** Na base: de quais projetos ela veio. */
  origens?: string[]
  /** O documento do aprendizado, em markdown — como uma memória. */
  corpo: string
  eventosDetalhados: { id: string; quando: string; agente: string; tipo: string
                       resumo?: string; despacho?: string; arquivos: string[] }[]
  especies: Record<string, EspecieSkill>
  naturezas: Record<string, EspecieSkill>
  /** O vocabulário do projeto, para sugerir antes de criar tag nova. */
  tagsDoProjeto: TagSkill[]
  descricao_por?: string
  curada?: boolean
}

export interface EspecieSkill {
  label: string; icone: string; cor: string; desc: string; pergunta: string
}

/** O Noctis visto de cima — um registro por projeto. */
export interface ControleView {
  base: string
  naLixeira: number
  projetos: {
    slug: string; nome: string; permanente: boolean
    /** Clone de código dentro de projects/ — listado, mas intocável daqui. */
    repositorio: boolean
    agentes: number; protocolo: number; memorias: number; fluxos: number
    skills: number; firmadas: number; semDescricao: number
    eventos: number; consultas: number; ultima: string
  }[]
}

/** Uma regra do Noctis, com o valor que o código está usando agora. */
export interface Regra {
  id: string
  area: string
  tipo: 'bool' | 'int' | 'float' | 'mapa' | 'curva' | 'flags' | 'cores' | 'perguntas'
  titulo: string
  faz: string
  porque: string
  onde: string[]
  padrao: unknown
  valor: unknown
  alterada: boolean
  fixa?: boolean
  min?: number
  max?: number
  passo?: number
  depende?: string
  /** Quando a regra ainda não vale por inteiro — dito com todas as letras. */
  estado?: string
}

export interface RegrasView {
  areas: { id: string; titulo: string; desc: string }[]
  regras: Regra[]
}

export interface SkillsView {
  skills: Record<string, SkillCard>
  firmarEm: number
  estados: string[]
  especies: Record<string, EspecieSkill>
  naturezas: Record<string, EspecieSkill>
  /** O vocabulário de tags do projeto, com quantas habilidades usam cada uma. */
  tags: TagSkill[]
}

export interface TagSkill { tag: string; usos: number; solta: boolean }

/** Uma pergunta de enquadramento como ela é editada em Configurações. */
export interface PerguntaTese {
  campo: string
  titulo: string
  tipo: 'bool' | 'radio' | 'multi'
  texto: string
  opcoes: string[]
  /** Como a escolha aparece no documento que os agentes leem. */
  frase: string
  /** Quantas habilidades marcaram cada tese — tese com 0 é tese ruim. */
  usos?: Record<string, number>
  respondidaPor: number
  dispensadaPor: number
}

// ── A organização ───────────────────────────────────────────────────────────
// A cadeia mora nos yaml dos agentes (papel, squad). Sem índice à parte: índice
// separado desatualiza, e aí a tela mente.

export interface AgenteOrg {
  nome: string; titulo: string; descricao: string
  papel: 'maestro' | 'lider' | 'agente'
  /** A chave da squad (slug). `squadNome` é como ela se escreve. */
  squad: string
  squadNome: string
  reporta_a: string
  /** A customização do card — a mesma da grade e do mapa. */
  cor: string
  icone: string
  tags: string[]
  ativo: boolean
  modelo: string
  temperatura?: number
  ferramentas: number
}

/** Uma squad é coisa, com identidade própria: nome, cor, ícone e do que cuida. */
export interface SquadOrg {
  chave: string
  nome: string
  cor: string
  icone: string
  descricao: string
  criada_em?: string
  criada_por?: string
  lider: AgenteOrg | null
  membros: AgenteOrg[]
}

export interface Organizacao {
  papeis: Record<string, { label: string; desc: string; cor: string }>
  maestros: AgenteOrg[]
  squads: SquadOrg[]
  soltos: AgenteOrg[]
  lideresSemSquad: AgenteOrg[]
  total: number
  /** O que está torto, uma frase cada. Nada disso impede o projeto de rodar. */
  avisos: string[]
}

// ── O loop de aprendizado ───────────────────────────────────────────────────
// Observação é matéria-prima, hipótese é candidata, aprendizado é o que VOCÊ
// validou. Os três moram no mesmo log append-only do progresso.

export interface Observacao {
  id: string; quando: string; skill: string; agente: string
  texto: string; contexto?: string; evento?: string | null
}

/** Uma pergunta de enquadramento: descobre o que a habilidade é. */
export interface PerguntaEnquadramento {
  id: string
  tipo_fila: 'enquadramento'
  skill: string
  campo: string
  rotuloSkill: string
  titulo?: string
  ajuda?: string
  /** Só escolha: a pergunta é uma tese, e a resposta é qual tese vale. */
  pergunta: { tipo: 'bool' | 'radio' | 'multi'; texto: string; opcoes: string[] }
  restantes?: number
  total?: number
}

export interface Hipotese {
  id: string; quando: string; skill: string; agente: string
  tipo_fila?: 'hipotese'
  texto: string
  pergunta: { tipo: 'bool' | 'escolha' | 'multi' | 'escala'; texto: string; opcoes: string[] }
  /** Entre 0 e 1. Nunca chega a 1: aqui nada é verdade, só probabilidade. */
  confianca: number
  confirmacoes: number; refutacoes: number
  invalida: boolean; corrigida: boolean
  /** Ninguém respondeu ainda — é o que aparece na Learning Inbox. */
  pendente: boolean
  observacoes: Observacao[]
  respostas: { id: string; veredito: string; por: string; quando: string; texto?: string }[]
}

export interface Aprendizado {
  id: string; quando: string; skill: string; texto: string
  escopo: 'agente' | 'projeto' | 'global'
  /** Vazio quando você escreveu direto, sem hipótese no caminho. */
  de_hipotese: string
  por: string
  aposentado: boolean
  /** A confiança da hipótese que o gerou. O que você escreveu direto vale 1. */
  confianca: number
  /** Abaixo do limiar das regras: pede mais evidência antes de guiar decisão. */
  fragil: boolean
  /** Eventos que declararam ter aplicado este aprendizado — a métrica do reuso. */
  usos: { evento: string; agente: string; quando: string }[]
}

export interface AprendizadoView {
  observacoes: Observacao[]
  hipoteses: Hipotese[]
  aprendizados: Aprendizado[]
  tiposPergunta: Record<string, { label: string; desc: string }>
  vereditos: string[]
  escopos: string[]
  promoverEm: number
  evidenciasMinimas: number
}

export interface EventoFicha {
  id: string
  quando: string
  tipo: string
  despacho?: string
  resumo?: string
  habilidades: string[]
  xp: number
  confirmado_por?: string | null
}

/** A ficha de um agente. Tudo aqui é derivado do log de eventos, a cada leitura. */
export interface FichaAgente {
  agente: string
  xp: number
  nivel: number
  eventos: number
  progresso: number
  inicio_nivel: number
  proximo_nivel: number
  habilidades: Record<string, Habilidade>
  /** Ainda não promovidas: menos de três eventos. */
  brotos: Record<string, Habilidade>
  topo: (Habilidade & { chave: string })[]
  historico: EventoFicha[]
}

export interface CeuCfg {
  estrelas: number
  movimento: number
  nebulosas: number
  movNebulosa: number
  /** 0 = o céu só se mexe com o mouse. */
  deriva: number
  /** Em %: 100 é o desenho como foi calibrado. */
  opacidade: number
  opacidadeNebulosa: number
  ativo: boolean
  /** Que desenho o campo usa. */
  estilo: 'estrelas' | 'malha'
}

export interface LogoCfg {
  tamanho: number
  modo: 'solida' | 'gradiente'
  cor: string
  corA: string
  corB: string
  /** Segundos por volta completa do gradiente. */
  velocidade: number
}

export interface MemoryVocab {
  iconSizes: IconSizes
  iconSizeLimits: Record<string, [number, number]>
  aura: AuraCfg
  auraLimits: Record<string, [number, number]>
  logo: LogoCfg
  logoLimits: Record<string, [number, number]>
  ceu: CeuCfg
  ceuLimits: Record<string, [number, number]>
  ceuEstilos: ('estrelas' | 'malha')[]
  /** Efeito vidro nos cards e lanes do mapa e do cosmos. */
  vidro: boolean
  kinds: Record<string, KindMeta>
  types: Record<string, MemoryTypeMeta>
  origins: Record<string, { label: string; desc: string }>
  defaultType: string
  defaultOrigin: string
}

export interface ResourceList {
  memory: ResourceItem[]
  agent: ResourceItem[]
  flow: ResourceItem[]
  persona: ResourceItem[]
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  /** De qual saída do card a seta parte. Cada ligação tem a sua. */
  sourceHandle?: string | null
  rel?: string
}

/** Retângulo normalizado (0..1) da miniatura de um mapa. */
export interface PreviewShape {
  x: number; y: number; w: number; h: number
  color: string | null
  lane: boolean
}

export interface CosmosNode extends CanvasMeta {
  x: number
  y: number
}

export interface Cosmos {
  nodes: CosmosNode[]
  edges: { id?: string; source: string; target: string }[]
}

export interface CanvasMeta {
  id: string
  name: string
  nodes?: number
  lanes?: number
  preview?: PreviewShape[]
}

export interface MemoryCanvas {
  id?: string
  name?: string
  lanes?: CanvasLane[]
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  autoEdges?: CanvasEdge[]
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {
  // Projetos (tenants)
  listProjects:   ()                              => req<ProjectMeta[]>('GET',    '/api/projects'),
  createProject:  (name: string, slug?: string)   => req<{ok: boolean; slug: string; displayName: string}>('POST', '/api/projects', { name, slug }),
  deleteProject:  (slug: string)                  => req<{ok: boolean}>('DELETE', `/api/projects/${slug}`),
  renameProject:  (slug: string, newName: string) => req<{ok: boolean}>('POST',   `/api/projects/${slug}/rename`, { new_name: newName }),

  // Agentes
  listAgents:   ()                              => req<AgentMeta[]>('GET',    `${px()}/agents`),
  getAgent:     (name: string)                  => req<AgentConfig>('GET',    `${px()}/agents/${encodeURIComponent(name)}`),
  saveAgent:    (name: string, d: AgentConfig)  => req<{ok: boolean}>('PUT',  `${px()}/agents/${encodeURIComponent(name)}`, d),
  deleteAgent:  (name: string)                  => req<{ok: boolean}>('DELETE',`${px()}/agents/${encodeURIComponent(name)}`),
  renameAgent:  (name: string, newName: string) => req<{ok: boolean}>('POST', `${px()}/agents/${encodeURIComponent(name)}/rename`, { new_name: newName }),

  // Fluxos
  listFlows:   ()                              => req<FlowMeta[]>('GET',    `${px()}/flows`),
  getFlow:     (name: string)                  => req<FlowConfig>('GET',    `${px()}/flows/${encodeURIComponent(name)}`),
  saveFlow:    (name: string, d: FlowConfig)   => req<{ok: boolean}>('PUT',  `${px()}/flows/${encodeURIComponent(name)}`, d),
  deleteFlow:  (name: string)                  => req<{ok: boolean}>('DELETE',`${px()}/flows/${encodeURIComponent(name)}`),
  renameFlow:  (name: string, newName: string) => req<{ok: boolean}>('POST', `${px()}/flows/${encodeURIComponent(name)}/rename`, { new_name: newName }),

  // Memória
  listMemory:   ()                                  => req<MemoryFile[]>('GET',   `${px()}/memory`),
  getMemory:    (name: string)                      => req<{content: string}>('GET', `${px()}/memory/${encodeURIComponent(name)}`),
  saveMemory:   (name: string, content: string)     => req<{ok: boolean}>('PUT',  `${px()}/memory/${encodeURIComponent(name)}`, { content }),
  deleteMemory: (name: string)                      => req<{ok: boolean}>('DELETE',`${px()}/memory/${encodeURIComponent(name)}`),
  renameMemory: (name: string, newName: string)     => req<{ok: boolean}>('POST', `${px()}/memory/${encodeURIComponent(name)}/rename`, { new_name: newName }),

  listAttachments: (name: string) =>
    req<Attachment[]>('GET', `${px()}/memory/${encodeURIComponent(name)}/anexos`),
  uploadAttachment: (name: string, filename: string, data: string) =>
    req<Attachment>('POST', `${px()}/memory/${encodeURIComponent(name)}/anexos`, { filename, data }),
  deleteAttachment: (name: string, filename: string) =>
    req<{ok: boolean}>('DELETE', `${px()}/memory/${encodeURIComponent(name)}/anexos/${encodeURIComponent(filename)}`),

  // Personas
  listPersonas:   ()                                    => req<PersonaMeta[]>('GET',    `${px()}/personas`),
  getPersona:     (name: string)                        => req<PersonaConfig>('GET',    `${px()}/personas/${encodeURIComponent(name)}`),
  savePersona:    (name: string, d: PersonaConfig)      => req<{ok: boolean}>('PUT',    `${px()}/personas/${encodeURIComponent(name)}`, d),
  deletePersona:  (name: string)                        => req<{ok: boolean}>('DELETE', `${px()}/personas/${encodeURIComponent(name)}`),
  renamePersona:  (name: string, newName: string)       => req<{ok: boolean}>('POST',   `${px()}/personas/${encodeURIComponent(name)}/rename`, { new_name: newName }),

  // Gerador de setup (prompt para agente externo + import)
  generateSetupPrompt: (brief: SetupBrief)              => req<{prompt: string}>('POST', '/api/setup/generate-prompt', brief),
  importSetup:         (data: unknown, overwrite = false) => req<ImportResult>('POST', '/api/setup/import', { data, overwrite }),

  // Mapa de recursos (canvas)
  getMemoryCanvas:  (id?: string) =>
    req<MemoryCanvas>('GET', `${px()}/memory-canvas${id ? `?canvas=${encodeURIComponent(id)}` : ''}`),
  saveMemoryCanvas: (canvas: MemoryCanvas, id?: string) =>
    req<{ok: boolean}>('PUT', `${px()}/memory-canvas${id ? `?canvas=${encodeURIComponent(id)}` : ''}`, canvas),

  // Mapas do projeto. Um mapa é um recorte: os mesmos recursos podem aparecer
  // em vários, com lane e peso próprios em cada um.
  memoryTypes:    ()                       => req<MemoryVocab>('GET', '/api/memory-types'),
  saveMemoryTypes: (v: { kinds?: Record<string, { color: string; icon: string }>
                         types?: Record<string, { color: string; icon: string }>
                         iconSizes?: Partial<IconSizes>
                         aura?: Partial<AuraCfg>
                         logo?: Partial<LogoCfg>
                         ceu?: Partial<CeuCfg>
                         vidro?: boolean }) =>
    req<MemoryVocab>('PUT', '/api/memory-types', v),

  // Decisão dentro de um card. Mandar options: [] apaga a decisão.
  saveDecision: (kind: string, name: string, d: Partial<Decision>) =>
    req<{ ok: boolean; decision?: Decision }>(
      'PUT', `${px()}/resources/${kind}/${encodeURIComponent(name)}/decision`, d),
  toggleChoice: (kind: string, name: string, optionId: string, by: string) =>
    req<{ ok: boolean; decision?: Decision }>(
      'POST', `${px()}/resources/${kind}/${encodeURIComponent(name)}/decision/${encodeURIComponent(optionId)}`, { by }),
  listCanvases:   ()                       => req<CanvasMeta[]>('GET',  `${px()}/canvases`),
  getCosmos:      ()                       => req<Cosmos>('GET', `${px()}/cosmos`),
  saveCosmos:     (c: { nodes: { id: string; x: number; y: number }[]
                        edges: { id?: string; source: string; target: string }[] }) =>
    req<{ ok: boolean }>('PUT', `${px()}/cosmos`, c),
  createCanvas:   (name: string)           => req<CanvasMeta>('POST',   `${px()}/canvases`, { name }),
  renameCanvas:   (id: string, n: string)  => req<CanvasMeta>('POST',   `${px()}/canvases/${id}/rename`, { new_name: n }),
  deleteCanvas:   (id: string)             => req<{ok: boolean; next: string}>('DELETE', `${px()}/canvases/${id}`),
  duplicateCanvas:(id: string, name?: string) => req<CanvasMeta>('POST', `${px()}/canvases/${id}/duplicate`, { name }),
  getResources:     ()                     => req<ResourceList>('GET', `${px()}/resources`),
  progresso:      ()            => req<{ agentes: Record<string, FichaAgente>; eventos: number }>(
                                     'GET', `${px()}/progresso`),
  fichaDoAgente:  (nome: string) => req<FichaAgente>('GET', `${px()}/progresso/${encodeURIComponent(nome)}`),
  skills:         ()            => req<SkillsView>('GET', `${px()}/skills`),
  // NOCTURN vive fora do escopo de projeto: ele atravessa todos.
  nocturnRelatorio: ()          => req<NocturnRelatorio>('GET', '/api/nocturn/relatorio'),
  nocturnConversa:  ()          => req<{ mensagens: NocturnMensagem[] }>('GET', '/api/nocturn/conversa'),
  nocturnFalar:     (texto: string) => req<NocturnMensagem>('POST', '/api/nocturn/conversa', { texto }),
  nocturnDescrever: (projeto: string, chave: string, descricao: string) =>
    req<{ ok: boolean }>('POST', '/api/nocturn/descrever', { projeto, chave, descricao }),
  /** Funde duas habilidades num projeto qualquer — a ronda cruza fronteiras. */
  fundirSkillsEm: (projeto: string, de: string[], para: string) =>
    req<{ ok: boolean }>('POST', `/api/projects/${encodeURIComponent(projeto)}/habilidades/fundir`, { de, para }),
  /** Grava identidade (autor, por exemplo) em qualquer projeto. */
  identidadeEm: (projeto: string, kind: string, nome: string, patch: Record<string, unknown>) =>
    req<{ ok: boolean }>('PUT',
      `/api/projects/${encodeURIComponent(projeto)}/resources/${kind}/${encodeURIComponent(nome)}/identity`, patch),
  /** Confirma um evento em QUALQUER projeto — a ronda cruza fronteiras. */
  confirmarEventoEm: (projeto: string, id: string, por = 'nocturn') =>
    req<{ ok: boolean }>('POST', `/api/projects/${encodeURIComponent(projeto)}/eventos/${id}/confirmar`, { por }),
  enquadramentoMd: (chave: string) =>
    req<{ markdown: string }>('GET', `${px()}/skills/${encodeURIComponent(chave)}/enquadramento-md`),
  escreverCorpoSkill: (chave: string, corpo: string) =>
    req<{ ok: boolean }>('PUT', `${px()}/skills/${encodeURIComponent(chave)}/corpo`, { corpo }),
  anotarSkill:    (chave: string, texto: string, autor = 'usuario') =>
    req<{ ok: boolean }>('POST', `${px()}/skills/${encodeURIComponent(chave)}/corpo`, { texto, autor }),
  /** Some com a habilidade — o log guarda a lápide para ela não voltar. */
  destruirSkill:  (chave: string) =>
    req<{ ok: boolean }>('DELETE', `${px()}/skills/${encodeURIComponent(chave)}`),
  /** Sobe para a base, onde todo projeto a encontra ao consultar. */
  promoverSkill:  (chave: string) =>
    req<{ ok: boolean }>('POST', `${px()}/skills/${encodeURIComponent(chave)}/promover`, {}),
  regras:         () => req<RegrasView>('GET', '/api/regras'),
  definirRegra:   (id: string, valor: unknown) =>
    req<{ ok: boolean; regra: Regra; protocoloAtualizadoEm: Record<string, number> }>(
      'PUT', `/api/regras/${encodeURIComponent(id)}`, { valor }),
  restaurarRegra: (id: string) => req<{ ok: boolean }>('DELETE', `/api/regras/${encodeURIComponent(id)}`),
  protocoloAtual: () => req<{ texto: string }>('GET', '/api/regras/protocolo'),
  controle:       () => req<ControleView>('GET', '/api/controle'),
  instalarProtocolo: (projeto: string, remover = false) =>
    req<{ ok: boolean }>('POST', `/api/projects/${encodeURIComponent(projeto)}/protocolo`, { remover }),
  lixeira:        () => req<{ itens: { id: string; slug: string; quando: string; nome: string }[] }>('GET', '/api/lixeira'),
  restaurarProjeto: (id: string) => req<{ ok: boolean; slug: string }>('POST', `/api/lixeira/${encodeURIComponent(id)}/restaurar`),
  apagarDeVez:    (id: string) => req<{ ok: boolean }>('DELETE', `/api/lixeira/${encodeURIComponent(id)}`),
  skill:          (chave: string) => req<SkillDetalhe>('GET', `${px()}/skills/${encodeURIComponent(chave)}`),
  criarSkill:     (rotulo: string, descricao = '', natureza = '', tags: string[] = []) =>
    req<{ ok: boolean; skill: SkillCard & { chave: string }; parecidas: string[] }>(
      'POST', `${px()}/skills`, { rotulo, descricao, natureza, tags }),

  // O vocabulário de tags: ler, fundir (renomear para uma que já existe) e tirar.
  tagsSkills:     () => req<{ tags: TagSkill[] }>('GET', `${px()}/skills-tags`),
  teses:          () => req<{ perguntas: PerguntaTese[]; habilidades: number }>('GET', `${px()}/teses`),

  organizacao:    () => req<Organizacao>('GET', `${px()}/organizacao`),
  definirOrganizacao: (nome: string, patch: { papel?: string; squad?: string; reporta_a?: string }) =>
    req<{ ok: boolean }>('PUT', `${px()}/organizacao/${encodeURIComponent(nome)}`, patch),
  criarSquad:     (nome: string, extra: { cor?: string; icone?: string; descricao?: string } = {}) =>
    req<{ ok: boolean; squad: SquadOrg }>('POST', `${px()}/squads`, { nome, ...extra }),
  editarSquad:    (chave: string, patch: { nome?: string; cor?: string; icone?: string; descricao?: string }) =>
    req<{ ok: boolean }>('PUT', `${px()}/squads/${encodeURIComponent(chave)}`, patch),
  apagarSquad:    (chave: string) =>
    req<{ ok: boolean; soltos: number }>('DELETE', `${px()}/squads/${encodeURIComponent(chave)}`),
  cadeiaDe:       (nome: string) =>
    req<{ cadeia: { papel: string; nome: string; titulo: string }[] }>(
      'GET', `${px()}/organizacao/${encodeURIComponent(nome)}/cadeia`),

  // O loop: ler, responder, ensinar direto, aposentar.
  aprendizado:    () => req<AprendizadoView>('GET', `${px()}/aprendizado`),
  // A Inbox mistura as duas filas: descobrir o que a habilidade é vem antes de
  // julgar palpite sobre ela.
  inboxAprendizado: () => req<{ perguntas: (Hipotese | PerguntaEnquadramento)[] }>(
    'GET', `${px()}/aprendizado/inbox`),
  enquadramento:  () => req<{ perguntas: PerguntaEnquadramento[]; incompletas: number; prontas: number }>(
    'GET', `${px()}/enquadramento`),
  // Lista vazia dispensa a pergunta, e ela não volta a ser feita.
  enquadrar:      (chave: string, campo: string, escolhas: string[]) =>
    req<{ ok: boolean }>('POST', `${px()}/skills/${encodeURIComponent(chave)}/enquadrar`,
      { campo, escolhas }),
  aprendizadoDe:  (chave: string) =>
    req<{ observacoes: Observacao[]; hipoteses: Hipotese[]; aprendizados: Aprendizado[] }>(
      'GET', `${px()}/aprendizado/${encodeURIComponent(chave)}`),
  responderHipotese: (id: string, dados: { veredito: string; escolhas?: string[]; escala?: number
                                           texto?: string; escopo?: string }) =>
    req<{ ok: boolean; aprendizado?: Aprendizado }>(
      'POST', `${px()}/hipoteses/${encodeURIComponent(id)}/responder`, dados),
  ensinar:        (skill: string, texto: string, escopo = 'projeto') =>
    req<{ ok: boolean; aprendizado: Aprendizado }>('POST', `${px()}/aprendizados`, { skill, texto, escopo }),
  aposentarAprendizado: (id: string) =>
    req<{ ok: boolean }>('DELETE', `${px()}/aprendizados/${encodeURIComponent(id)}`),
  renomearTag:    (de: string, para: string) =>
    req<{ ok: boolean; habilidades: number }>('PUT', `${px()}/skills-tags/${encodeURIComponent(de)}`, { para }),
  apagarTagSkill: (tag: string) =>
    req<{ ok: boolean; habilidades: number }>('DELETE', `${px()}/skills-tags/${encodeURIComponent(tag)}`),
  editarSkill:    (chave: string, patch: Partial<Pick<SkillCard, 'rotulo' | 'descricao' | 'estado' | 'natureza' | 'tags' | 'cor' | 'icone'>>) =>
    req<{ ok: boolean }>('PUT', `${px()}/skills/${encodeURIComponent(chave)}`, patch),
  vincularSkill:  (chave: string, agente: string, ligado: boolean) =>
    req<{ ok: boolean }>('POST', `${px()}/skills/${encodeURIComponent(chave)}/vincular`, { agente, ligado }),
  confirmarEvento: (id: string, por = 'usuario') =>
    req<{ ok: boolean }>('POST', `${px()}/eventos/${id}/confirmar`, { por }),
  /** URLs de download do PDF. São links diretos: quem baixa é o navegador, e o
   *  arquivo nunca passa pela memória do JS. */
  pdfRecursoUrl: (kind: string, name: string) =>
    `${BASE}${px()}/export/pdf/${kind}/${encodeURIComponent(name)}`,
  pdfLaneUrl: (laneId: string, canvas: string) =>
    `${BASE}${px()}/export/pdf-lane/${encodeURIComponent(laneId)}?canvas=${encodeURIComponent(canvas)}`,
  saveIdentity: (kind: string, name: string, d: Partial<ResourceIdentity>) =>
    req<ResourceIdentity & { ok: boolean }>(
      'PUT', `${px()}/resources/${kind}/${encodeURIComponent(name)}/identity`, d),
  laneExtractPrompt: (name: string, items: { kind: ResourceKind; name: string }[]) =>
    req<{prompt: string}>('POST', `${px()}/memory-canvas/lane-prompt`, { name, items }),
  laneDigest: (name: string, budget: number, items: { kind: ResourceKind; name: string; weight: number }[]) =>
    req<LaneDigest>('POST', `${px()}/memory-canvas/lane-digest`, { name, budget, items }),

  // Config (para dropdowns)
  getConfig: () => req<AppConfig>('GET', `${px()}/config`),
}
