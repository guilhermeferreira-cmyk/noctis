// URL do backend.
//
// Na máquina, a UI fala com o uvicorn em localhost:5501. Quando o backend é
// servido pela mesma origem, `VITE_API_BASE=/` faz as chamadas saírem como
// caminho relativo.
//
// O endereço não pode ser fixo no build: a mesma página publicada serve tanto
// para olhar um Noctis de demonstração quanto para falar com o Noctis que a
// pessoa roda na própria máquina, sobre as pastas dela. Então o build só dá o
// padrão, e o que a pessoa escolher manda e fica guardado.
const CHAVE_API = 'noctis:api'
const _build = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE

// A barra final sai para não virar `//api/...`, que o navegador leria como
// outro host.
function normalizar(u: string | null | undefined): string {
  return (u ?? '').trim().replace(/\/+$/, '')
}

const PADRAO = normalizar(_build ?? 'http://localhost:5501')
let BASE = normalizar(localStorage.getItem(CHAVE_API)) || PADRAO

export function enderecoDaApi(): string { return BASE }
export function enderecoPadrao(): string { return PADRAO }

export function definirEnderecoDaApi(url: string): string {
  const limpo = normalizar(url)
  if (limpo && limpo !== PADRAO) localStorage.setItem(CHAVE_API, limpo)
  else localStorage.removeItem(CHAVE_API)
  BASE = limpo || PADRAO
  return BASE
}

export type Saude = { noctis: true; raiz: string; efemero: boolean; projetos: number }

// Aperto de mão com um endereço candidato, sem trocar o atual: é o que
// distingue "não tem nada aí" de "tem alguma coisa aí, mas não é um Noctis".
export async function saude(url?: string, sinal?: AbortSignal): Promise<Saude> {
  const alvo = url === undefined ? BASE : normalizar(url)
  const res = await fetch(alvo + '/api/saude', { signal: sinal })
  if (!res.ok) throw new Error(`respondeu ${res.status}`)
  const d = await res.json()
  if (!d?.noctis) throw new Error('respondeu, mas não é um Noctis')
  return d as Saude
}

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

/**
 * O cache de recursos por projeto — o que faz a troca de aba não ter espera.
 *
 * Trocar de projeto relia a lista inteira do zero, e a grade piscava vazia
 * enquanto isso. Como a aba promete que o projeto "já está lá", a leitura
 * acontece ANTES: assim que a lista de projetos chega, cada um é buscado em
 * segundo plano e guardado aqui.
 *
 * A política é stale-while-revalidate: quem pede recebe na hora o que está
 * guardado, e uma leitura nova acontece atrás para corrigir o que mudou. Isso
 * significa que por um instante a tela pode mostrar o estado de segundos atrás
 * — aceitável para uma grade de cards, e é o preço de não piscar. O que o
 * sistema ESCREVE nunca passa por aqui: toda mutação limpa a entrada.
 */
const cacheRecursos = new Map<string, unknown>()
const revalidando = new Set<string>()

export function invalidarRecursos(slug?: string): void {
  if (slug) cacheRecursos.delete(slug)
  else cacheRecursos.clear()
}

function recursosCacheados(slug: string, forcar = false): Promise<ResourceList> {
  const guardado = cacheRecursos.get(slug) as ResourceList | undefined
  const buscar = () => req<ResourceList>('GET', `/api/projects/${encodeURIComponent(slug)}/resources`)
    .then(d => { cacheRecursos.set(slug, d); return d })
    .finally(() => revalidando.delete(slug))

  if (guardado && !forcar) {
    // Já tenho: entrego agora e conserto atrás, sem deixar duas leituras do
    // mesmo projeto correrem juntas.
    if (!revalidando.has(slug)) { revalidando.add(slug); buscar().catch(() => {}) }
    return Promise.resolve(guardado)
  }
  revalidando.add(slug)
  return buscar()
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
  // Escreveu: o que estava guardado daquele projeto não vale mais. Fica num
  // lugar só, aqui, porque esquecer de invalidar numa mutação nova seria um
  // bug invisível — a tela mostrando o passado sem nenhum sinal.
  if (method !== 'GET') {
    const m = /^\/api\/projects\/([^/]+)\//.exec(path)
    if (m) invalidarRecursos(decodeURIComponent(m[1]))
    else if (path.startsWith('/api/templates')) invalidarRecursos()
  }
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentMeta {
  name: string
  nickname?: string
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
  /** Escondido da lista: a pasta continua no disco, intocada. */
  oculto?: boolean
  permanente?: boolean
  repositorio?: boolean
  /** A superfície a que este projeto pertence. Ausente = `noctis`, o de origem. */
  hub?: Hub
  /** O projeto LIGADO: só existe um, e é nele que o trabalho acontece. */
  ligado?: boolean
}

/**
 * Os hubs da suíte. O motor é o mesmo; o que muda é o objetivo — `noctis`
 * governa conhecimento, `diem` produz — e por isso as REGRAS podem divergir
 * (ver `regras.valor(rid, escopo)` no servidor).
 *
 * Hub é propriedade do PROJETO, não um segundo eixo de navegação: abrir um
 * projeto do outro hub já troca a superfície inteira, e `trocarDeProjeto` já
 * remonta tudo. Projeto sem declaração é do hub de origem.
 */
export type Hub = 'noctis' | 'diem'
export const HUB_PADRAO: Hub = 'noctis' 

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
  /** De qual projeto o item veio — só vem preenchido na visão de todos. */
  projeto?: string
  projetoNome?: string
  /** Do arquivo em disco: quando nasceu, quando foi mexido, quanto pesa. */
  criado?: string
  mudado?: string
  bytes?: number
  /** Só para agentes: o que o log de trabalho diz sobre ele — o suficiente
   *  para desenhar o disco de nível sem precisar de uma rede à parte. */
  /** Só o agente tem: o nome pelo qual se chama este agente aplicado. */
  nickname?: string
  ficha?: { nivel: number; xp: number; eventos: number; progresso: number
           proximo_nivel: number; skills: string[] }
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

/** Um Learning aprendida: sem lista prévia, ela nasce do trabalho. */
export interface Learning {
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

/** Um Learning no repertório do projeto — a mesma para todos os agentes. */
export interface LearningCard {
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
  /** Declarados: devem ter o Learning, sem XP nenhum. */
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

// ── A ficha do agente ───────────────────────────────────────────────────────
// As duas metades vêm SEPARADAS do servidor, e ficam separadas aqui. Juntá-las
// num objeto só pouparia código e custaria a única coisa que a tela precisa
// deixar claro: o que é herdado (e muda em N projetos) e o que é daqui.

export interface MemoriaAcoplada {
  nome: string
  existe: boolean
  tipo: string
  origem: string
  autor: string
}

export interface LearningDoAgente {
  chave: string
  rotulo: string
  estado: string
  especie: string
  tags: string[]
  temCorpo: boolean
  descricao: string
}

export interface FichaDoAgente {
  nome: string
  projeto: string
  /** `<projeto>:<agente>` — o endereço. Único por projeto, derivado. */
  identificador: string
  /** O nome pelo qual se chama. Único no sistema, e não endereça nada. */
  nickname: string
  /** null = agente local deste projeto, sem arquétipo. */
  arquetipo: string | null
  desacoplado: boolean
  arquetipo_ausente?: string
  /** O que ele É. Vazio quando o agente é local. */
  herdado: Record<string, unknown>
  /** O que ele faz AQUI. */
  daqui: Record<string, unknown>
  contexto: MemoriaAcoplada[]
  progresso: FichaAgente
  learnings: LearningDoAgente[]
  /** Outros projetos onde o mesmo arquétipo está acoplado. */
  tambem_em: string[]
}

/** Um agente aplicado e o nome pelo qual se chama. */
export interface NicknameAplicado {
  identificador: string
  nickname: string
  projeto: string
  agente: string
  /** O agente daquele identificador ainda existe no disco. */
  existe: boolean
}

/** Uma linha da tabela "Onde trabalha", no modo cru. */
export interface ContextoDoArquetipo {
  projeto: string
  projetoNome: string
  papel: string
  squad: string
  memorias: number
  temPromptLocal: boolean
  nivel: number
  xp: number
  eventos: number
  ultima: string | null
  learnings: number
}

export interface ArquetipoView {
  slug: string
  arquetipo: Record<string, unknown>
  contextos: ContextoDoArquetipo[]
}

/** Um trabalho registrado por um agente — a matéria do Runtime.
 *
 * A unidade não é o uso de um Skill: é o trabalho. Um despacho sem `--skill`
 * continua sendo trabalho e continua aparecendo; `skills` é um detalhe dele. */
export interface TrabalhoRegistrado {
  id: string
  quando: string
  agente: string
  tipo: string
  resumo: string
  despacho?: string
  skills: string[]
  /** Dentro da janela de "agora" que o servidor aplicou. */
  agora: boolean
  projeto: string
  projetoNome: string
}

/** A ficha de um agente no histórico: quanto trabalhou e quando. */
export interface AgenteNoRuntime {
  agente: string
  projeto: string
  projetoNome: string
  eventos: number
  agora: boolean
  ultimo: string
  primeiro: string
  skills: string[]
}

export interface RuntimeView {
  usos: TrabalhoRegistrado[]
  /** Cursor da próxima página, ou null quando acabou. */
  proxima: string | null
  /** Quantos eventos existem no filtro atual — não o tamanho da página. */
  total: number
  /** A janela de "agora", em minutos. */
  janela: number
  agora: number
  trabalhando: AgenteNoRuntime[]
  agentes: AgenteNoRuntime[]
  projetos: { slug: string; nome: string }[]
}

/** Um achado da ronda do NOCTURN. */
export interface NocturnAchado {
  ronda: 'vocabulario' | 'trabalho' | 'agentes' | 'memoria'
  tipo: 'skill_sem_descricao' | 'skill_parecida' | 'sem_confirmacao' | 'decisao_pendente'
      | 'agente_parado' | 'agente_sem_trabalho' | 'memoria_sem_autor' | 'memoria_sem_uso'
      | 'skill_sem_leitura' | 'skill_sem_corpo' | 'proposta_sem_veredito'
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
  /** O id da proposta de Learning, quando o achado é uma esperando veredito. */
  proposta?: string
}

export interface NocturnRonda { id: string; rotulo: string; desc: string; total: number }

export interface NocturnRelatorio {
  quando: string
  rondas: NocturnRonda[]
  projetos: { projeto: string; eventos: number; agentes?: number; skills?: number }[]
  achados: NocturnAchado[]
  resumo: { semDescricao: number; semConfirmacao: number; parados: number
            propostasSemVeredito: number }
}

export interface NocturnMensagem {
  id: string
  quando: string
  autor: 'nocturn' | 'voce'
  texto: string
  projeto?: string
  assunto?: string
}

/** O Learning aberta: tudo do card, mais os eventos que a construíram. */
export interface LearningDetalhe extends LearningCard {
  /** Na base: de quais projetos ela veio. */
  origens?: string[]
  /** O documento do aprendizado, em markdown — como uma memória. */
  corpo: string
  eventosDetalhados: { id: string; quando: string; agente: string; tipo: string
                       resumo?: string; despacho?: string; arquivos: string[] }[]
  especies: Record<string, EspecieSkill>
  naturezas: Record<string, EspecieSkill>
  /** O vocabulário do projeto, para sugerir antes de criar tag nova. */
  tagsDoProjeto: TagLearning[]
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
  /** A última vez que esta regra mudou — de quanto para quanto, e por quem. */
  ultimaMudanca?: MudancaRegra | null
  fixa?: boolean
  min?: number
  max?: number
  passo?: number
  depende?: string
  /** Quando a regra ainda não vale por inteiro — dito com todas as letras. */
  estado?: string
}

/** Uma linha do rastro: append-only, como o histórico de trabalho. */
export interface MudancaRegra {
  quando: string
  regra: string
  acao: 'mudou' | 'voltou ao padrão'
  de: unknown
  para: unknown
  por: string
}

export interface RegrasView {
  areas: { id: string; titulo: string; desc: string }[]
  regras: Regra[]
}

export interface SkillClaudeCard {
  slug: string
  nome: string
  descricao: string
  /** Já existia no disco antes de o Noctis olhar — intocável. */
  nativa: boolean
  /** De onde ela vem: do projeto, do seu `~/.claude/skills`, ou de um plugin. */
  origem?: 'projeto' | 'usuario' | 'plugin'
  /** Quando é cópia de outra: o slug da original. */
  duplicada_de?: string
  learnings: string[]
  criada_em: string
  de_learning: string
  tamanho: number
}

export interface SkillClaudeDetalhe {
  slug: string; nome: string; descricao: string; corpo: string
  nativa: boolean; learnings: string[]
}

/** As perguntas em aberto dos Learnings vinculados a uma skill — aparece
 *  mesmo com a lista vazia, de propósito. */
export interface PerguntasSkillClaude {
  slug: string
  learnings: string[]
  perguntas: PerguntaEnquadramento[]
}

export interface LearningsView {
  skills: Record<string, LearningCard>
  firmarEm: number
  estados: string[]
  especies: Record<string, EspecieSkill>
  naturezas: Record<string, EspecieSkill>
  /** O vocabulário de tags do projeto, com quantos Learnings usam cada uma. */
  tags: TagLearning[]
}

export interface TagLearning { tag: string; usos: number; solta: boolean }

/** Uma pergunta de enquadramento como ela é editada em Configurações. */
/** Um achado de estrutura: o que está torto, quanto, e o que fazer. */
export interface AchadoDiagnostico {
  id: string
  onde: string
  gravidade: 'alta' | 'media' | 'baixa' | 'info'
  titulo: string
  detalhe: string
  itens: string[]
  acao: string
}

/** Onde cada coisa do projeto é gravada, e quanto pesa. */
export interface DadosProjeto {
  projeto: string
  pasta: string
  total: number
  itens: { caminho: string; desc: string; existe: boolean; bytes: number; arquivos: number }[]
  globais: { caminho: string; desc: string; existe: boolean; bytes: number; arquivos: number }[]
}

export interface PerguntaTese {
  campo: string
  titulo: string
  tipo: 'bool' | 'radio' | 'multi'
  texto: string
  opcoes: string[]
  /** Como a escolha aparece no documento que os agentes leem. */
  frase: string
  /** Quantos Learnings marcaram cada tese — tese com 0 é tese ruim. */
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
/** O arranjo do canvas da organização: desenho, não cadeia de comando. */
export interface LayoutOrg {
  pos: Record<string, { x: number; y: number }>
  tam: Record<string, { w: number; h: number }>
  links: { source: string; target: string; rotulo?: string }[]
  /** Os agentes tirados do desenho, por nome. Nada some do projeto por isso. */
  fora: string[]
  viewport?: unknown
}

export interface SquadOrg {
  chave: string
  nome: string
  /** A squad-mãe: "Marketing" com "Conteúdo" e "Performance" dentro. */
  pai?: string
  filhas?: string[]
  /** Quantos degraus até a squad de cima. 0 = está no topo. */
  nivel?: number
  cor: string
  icone: string
  descricao: string
  criada_em?: string
  criada_por?: string
  lider: AgenteOrg | null
  membros: AgenteOrg[]
}

/** Um Learning que um agente acha que falta. Só viro Learning se você aceitar. */
export interface PropostaLearning {
  id: string
  quando: string
  rotulo: string
  chave: string
  o_que_e: string
  porque: string
  agente: string
  despacho: string
  eventos: string[]
  /** O nome de um Learning que já existe e parece a mesma coisa. */
  parecida_com: string
  parecidas: string[]
  estado: 'proposta' | 'aceita' | 'recusada' | 'ajustar' | 'revisada'
  pendente: boolean
  veredito?: { veredito: string; motivo: string; criada: string; quando: string }
}

/** Um molde na camada de templates: destilado de um recurso que já serviu. */
export interface TemplateItem {
  kind: string
  slug: string
  nome: string
  descricao: string
  /** De qual recurso, e de qual projeto, ele foi destilado. */
  de: string
  deProjeto: string
  criado_em: string
  usos: number
}

export interface Organizacao {
  papeis: Record<string, { label: string; desc: string; cor: string }>
  /** O Warden: um só em todo o Noctis, e acima da linha do projeto. */
  wardens: AgenteOrg[]
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

/** Uma pergunta de enquadramento: descobre o que o Learning é. */
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
  habilidades: Record<string, Learning>
  /** Ainda não promovidas: menos de três eventos. */
  brotos: Record<string, Learning>
  topo: (Learning & { chave: string })[]
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

export interface ItemSistema { grupo: string; label: string; icon: string; color: string
  /** A aparência deste lugar é a marca do Noctis; não se configura à parte. */
  marca?: boolean }

export interface MemoryVocab {
  iconSizes: IconSizes
  iconSizeLimits: Record<string, [number, number]>
  aura: AuraCfg
  pontilhado?: { ativo: boolean; opacidade: number; espaco: number; tamanho: number; cor: string }
  pontilhadoLimits?: Record<string, [number, number]>
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
  /** Ícone e cor de cada lugar do sistema: seções, doca, papéis, estados. */
  sistema?: Record<string, ItemSistema>
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
  // ── A visão de todos os projetos ────────────────────────────────────────
  // Lida ao vivo de cada projeto: nada é copiado para a camada de cima.
  // ── A camada de templates do Warden ─────────────────────────────────────
  // Moldes destilados de trabalho que provou servir. Instanciar é COPIAR: o
  // recurso que nasce no projeto é independente do molde daqui em diante.
  templates:      (kind = '') => req<{ templates: TemplateItem[] }>(
    'GET', `/api/templates${kind ? `?kind=${kind}` : ''}`),
  guardarTemplate: (d: { kind: string; projeto: string; nome: string; rotulo?: string }) =>
    req<{ ok: boolean; template: { slug: string; nome: string; novo: boolean } }>(
      'POST', '/api/templates', d),
  instanciarTemplate: (kind: string, chave: string, para: string, nome = '') =>
    req<{ ok: boolean; nome: string; renomeado: boolean }>(
      'POST', `/api/templates/${kind}/${encodeURIComponent(chave)}/instanciar`, { para, nome }),
  apagarTemplate: (kind: string, chave: string) =>
    req<{ ok: boolean }>('DELETE', `/api/templates/${kind}/${encodeURIComponent(chave)}`),
  todosRecursos:  (projetos: string[] = []) => req<Record<string, ResourceItem[]> & {
    projetos: { slug: string; nome: string }[] }>(
    'GET', `/api/todos/resources${projetos.length ? `?projetos=${projetos.join(',')}` : ''}`),
  todosLearnings:    (projetos: string[] = []) => req<{ skills: (LearningCard & { projeto: string; projetoNome: string })[]
                                                     projetos: { slug: string; nome: string }[] }>(
    'GET', `/api/todos/learnings${projetos.length ? `?projetos=${projetos.join(',')}` : ''}`),
  todosMapas:     (projetos: string[] = []) => req<{ mapas: { id: string; canvas: string; nome: string
                                                              cards: number; lanes: number
                                                              projeto: string; projetoNome: string }[]
                                                     projetos: { slug: string; nome: string }[] }>(
    'GET', `/api/todos/canvases${projetos.length ? `?projetos=${projetos.join(',')}` : ''}`),
  /** Manda o arquétipo do agente para outro projeto. Papel, squad e histórico ficam. */
  enviarAgente:   (nome: string, para: string)    =>
    req<{ ok: boolean; para: string; nome: string; renomeado: boolean }>(
      'POST', `${px()}/agents/${encodeURIComponent(nome)}/enviar`, { para }),
  createProject:  (name: string, slug?: string, hub?: Hub) => req<{ok: boolean; slug: string; displayName: string; hub: Hub}>('POST', '/api/projects', { name, slug, hub }),
  deleteProject:  (slug: string)                  => req<{ok: boolean}>('DELETE', `/api/projects/${slug}`),
  // Esconder tira da lista sem tocar no disco — o caminho para repositório de
  // código e projeto morto, que a lixeira recusa de propósito.
  ocultarProjeto: (slug: string, oculto = true) =>
    req<{ ok: boolean; oculto: boolean }>('POST', `/api/projects/${slug}/ocultar`, { oculto }),
  listarComOcultos: () => req<ProjectMeta[]>('GET', '/api/projects?incluir_ocultos=true'),
  renameProject:  (slug: string, newName: string) => req<{ok: boolean}>('POST',   `/api/projects/${slug}/rename`, { new_name: newName }),

  // Agentes
  listAgents:   ()                              => req<AgentMeta[]>('GET',    `${px()}/agents`),
  getAgent:     (name: string)                  => req<AgentConfig>('GET',    `${px()}/agents/${encodeURIComponent(name)}`),
  /** A ficha inteira num pedido só: identidade, acoplamento, XP, Learnings. */
  fichaAgente:  (name: string)                  => req<FichaDoAgente>('GET', `${px()}/agents/${encodeURIComponent(name)}/ficha`),
  /** O agente CRU e os contextos dele em cada projeto. */
  arquetipo:    (slug: string)                  => req<ArquetipoView>('GET', `/api/arquetipos/${encodeURIComponent(slug)}`),
  nicknames:     ()                              => req<{ nicknames: NicknameAplicado[]; usados: number; livres: number; banco: number
          liberados: { identificador: string; nickname: string }[] }>('GET', '/api/nicknames'),
  trocarNickname: (projeto: string, agente: string, nickname: string) =>
    req<{ ok: boolean; nickname: string }>('PUT', `/api/nicknames/${encodeURIComponent(projeto)}/${encodeURIComponent(agente)}`, { nickname }),
  arquetipos:   ()                              => req<{ arquetipos: { slug: string; name: string; description: string; acoplado_em: string[] }[] }>('GET', '/api/arquetipos'),
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
                        pontilhado?: Partial<{ ativo: boolean; opacidade: number; espaco: number; tamanho: number; cor: string }>
                         logo?: Partial<LogoCfg>
                         ceu?: Partial<CeuCfg>
                         vidro?: boolean
                        sistema?: Record<string, { color: string; icon: string }> }) =>
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
  getResources:     ()                     => recursosCacheados(currentProject),
  /** Lê (e guarda) os recursos de um projeto qualquer — é o pré-carregamento. */
  recursosDoProjeto: (slug: string)        => recursosCacheados(slug),
  /** Releitura forçada, para depois de escrever. */
  recarregarRecursos: ()                   => recursosCacheados(currentProject, true),
  progresso:      ()            => req<{ agentes: Record<string, FichaAgente>; eventos: number }>(
                                     'GET', `${px()}/progresso`),
  fichaDoAgente:  (nome: string) => req<FichaAgente>('GET', `${px()}/progresso/${encodeURIComponent(nome)}`),
  learnings:      ()            => req<LearningsView>('GET', `${px()}/learnings`),
  // Propostas de Learning: o agente propõe, você aceita ou não.
  propostas:      ()            => req<{ propostas: PropostaLearning[]; pendentes: number }>(
    'GET', `${px()}/propostas`),
  responderProposta: (id: string, d: { veredito: 'aceita' | 'recusa' | 'ajusta'
                                       rotulo?: string; descricao?: string; motivo?: string }) =>
    req<{ ok: boolean; criada: string }>('POST', `${px()}/propostas/${encodeURIComponent(id)}/responder`, d),
  /** As propostas de Learning pendentes de TODOS os projetos — o destaque da Home. */
  /** Nomes que agentes citaram e que nunca viraram Learning. Matéria-prima
   *  para você decidir: criar, virar alias de um que existe, ou ignorar. */
  learningsOrfaos: () => req<{ orfas: { chave: string; rotulo: string; citacoes: number }[] }>(
    'GET', `${px()}/learnings-orfaos`),
  /** Teses que voltaram do despacho e esperam a sua resposta. */
  tesesInbox: () => req<{ teses: { id?: string; learning?: string; texto?: string; agente?: string }[] }>(
    'GET', `${px()}/teses-inbox`),
  todasPropostas: () => req<{ propostas: (PropostaLearning & { projeto: string; projetoNome: string })[]
                              pendentes: number }>('GET', '/api/todos/propostas'),
  /** O Runtime: quem trabalhou, quando, em quê.
   *
   * `minutos` governa só o rótulo "agora". O histórico não é cortado por
   * tempo — ele é paginado por `cursor`, que é o que o servidor devolveu em
   * `proxima`. */
  runtime: (minutos = 15, projetos: string[] = [], cursor = '', porPagina = 50) =>
    req<RuntimeView>('GET', `/api/todos/runtime?minutos=${minutos}&por_pagina=${porPagina}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
      + (projetos.length ? `&projetos=${projetos.join(',')}` : '')),
  // NOCTURN vive fora do escopo de projeto: ele atravessa todos.
  nocturnRelatorio: ()          => req<NocturnRelatorio>('GET', '/api/nocturn/relatorio'),
  nocturnConversa:  ()          => req<{ mensagens: NocturnMensagem[] }>('GET', '/api/nocturn/conversa'),
  nocturnFalar:     (texto: string) => req<NocturnMensagem>('POST', '/api/nocturn/conversa', { texto }),
  nocturnDescrever: (projeto: string, chave: string, descricao: string) =>
    req<{ ok: boolean }>('POST', '/api/nocturn/descrever', { projeto, chave, descricao }),
  /** Funde dois Learnings num projeto qualquer — a ronda cruza fronteiras. */
  fundirLearningsEm: (projeto: string, de: string[], para: string) =>
    req<{ ok: boolean }>('POST', `/api/projects/${encodeURIComponent(projeto)}/learnings/fundir`, { de, para }),
  /** Grava identidade (autor, por exemplo) em qualquer projeto. */
  identidadeEm: (projeto: string, kind: string, nome: string, patch: Record<string, unknown>) =>
    req<{ ok: boolean }>('PUT',
      `/api/projects/${encodeURIComponent(projeto)}/resources/${kind}/${encodeURIComponent(nome)}/identity`, patch),
  /** Confirma um evento em QUALQUER projeto — a ronda cruza fronteiras. */
  confirmarEventoEm: (projeto: string, id: string, por = 'nocturn') =>
    req<{ ok: boolean }>('POST', `/api/projects/${encodeURIComponent(projeto)}/eventos/${id}/confirmar`, { por }),
  enquadramentoMd: (chave: string) =>
    req<{ markdown: string }>('GET', `${px()}/learnings/${encodeURIComponent(chave)}/enquadramento-md`),
  escreverCorpoLearning: (chave: string, corpo: string) =>
    req<{ ok: boolean }>('PUT', `${px()}/learnings/${encodeURIComponent(chave)}/corpo`, { corpo }),
  anotarLearning:    (chave: string, texto: string, autor = 'usuario') =>
    req<{ ok: boolean }>('POST', `${px()}/learnings/${encodeURIComponent(chave)}/corpo`, { texto, autor }),
  /** Some com o Learning — o log guarda a lápide para ela não voltar. */
  destruirLearning:  (chave: string) =>
    req<{ ok: boolean }>('DELETE', `${px()}/learnings/${encodeURIComponent(chave)}`),
  /** Sobe para a base, onde todo projeto a encontra ao consultar. */
  promoverLearning:  (chave: string) =>
    req<{ ok: boolean }>('POST', `${px()}/learnings/${encodeURIComponent(chave)}/promover`, {}),
  regras:         () => req<RegrasView>('GET', '/api/regras'),
  definirRegra:   (id: string, valor: unknown) =>
    req<{ ok: boolean; regra: Regra; protocoloAtualizadoEm: Record<string, number> }>(
      'PUT', `/api/regras/${encodeURIComponent(id)}`, { valor }),
  historicoRegras: (regra = '') =>
    req<{ mudancas: MudancaRegra[] }>('GET', `/api/regras-historico${regra ? `?regra=${encodeURIComponent(regra)}` : ''}`),
  restaurarRegra: (id: string) => req<{ ok: boolean }>('DELETE', `/api/regras/${encodeURIComponent(id)}`),
  protocoloAtual: () => req<{ texto: string }>('GET', '/api/regras/protocolo'),
  controle:       () => req<ControleView>('GET', '/api/controle'),
  lixeira:        () => req<{ itens: { id: string; slug: string; quando: string; nome: string }[] }>('GET', '/api/lixeira'),
  restaurarProjeto: (id: string) => req<{ ok: boolean; slug: string }>('POST', `/api/lixeira/${encodeURIComponent(id)}/restaurar`),
  apagarDeVez:    (id: string) => req<{ ok: boolean }>('DELETE', `/api/lixeira/${encodeURIComponent(id)}`),
  learning:       (chave: string) => req<LearningDetalhe>('GET', `${px()}/learnings/${encodeURIComponent(chave)}`),
  criarLearning:     (rotulo: string, descricao = '', natureza = '', tags: string[] = []) =>
    req<{ ok: boolean; skill: LearningCard & { chave: string }; parecidas: string[] }>(
      'POST', `${px()}/learnings`, { rotulo, descricao, natureza, tags }),

  // ── Skill: exatamente a definição do Claude ─────────────────────────────
  // Sem XP, sem tese — o `SKILL.md` que existe de fato em `.claude/skills`.
  // Nativa é intocável; só as que o Noctis criou aceitam vínculo com Learning.
  skillsClaude:   ()                          => req<{ skills: SkillClaudeCard[] }>('GET', `${px()}/skills-claude`),
  skillClaude:    (slug: string)               => req<SkillClaudeDetalhe>('GET', `${px()}/skills-claude/${encodeURIComponent(slug)}`),
  criarSkillClaude: (d: { nome?: string; descricao?: string; corpo?: string
                          learnings?: string[]; de_learning?: string }) =>
    req<{ ok: boolean; skill: { slug: string; nome: string } }>('POST', `${px()}/skills-claude`, d),
  duplicarSkillClaude: (slug: string, origem = '') =>
    req<{ ok: boolean; skill: { slug: string; nome: string; de: string } }>(
      'POST', `${px()}/skills-claude/${encodeURIComponent(slug)}/duplicar`, { origem }),
  editarSkillClaude: (slug: string, d: { nome?: string; descricao?: string; corpo?: string }) =>
    req<{ ok: boolean; skill: { slug: string; nome: string } }>(
      'PUT', `${px()}/skills-claude/${encodeURIComponent(slug)}`, d),
  vincularSkillClaude: (slug: string, learnings: string[]) =>
    req<{ ok: boolean; slug: string; learnings: string[] }>(
      'PUT', `${px()}/skills-claude/${encodeURIComponent(slug)}/vincular`, { learnings }),
  perguntasSkillsClaude: () => req<{ skills: PerguntasSkillClaude[] }>('GET', `${px()}/skills-claude-perguntas`),
  todasPerguntasSkillsClaude: () =>
    req<{ skills: (PerguntasSkillClaude & { projeto: string; projetoNome: string })[] }>(
      'GET', '/api/todos/skills-claude-perguntas'),
  // Skills de todos os projetos, para o Catálogo do Warden.
  todasSkillsClaude: (projetos: string[] = []) =>
    req<{ skills: (SkillClaudeCard & { projeto: string; projetoNome: string })[] }>(
      'GET', `/api/todos/skills-claude${projetos.length ? `?projetos=${projetos.join(',')}` : ''}`),
  // Templates de skill: forma própria (pasta, não arquivo), por isso rotas à parte.
  templatesSkill:  () => req<{ templates: TemplateItem[] }>('GET', '/api/templates/skills'),
  guardarTemplateSkill: (projeto: string, slug: string) =>
    req<{ ok: boolean; template: { slug: string; novo: boolean } }>(
      'POST', '/api/templates/skills', { projeto, slug }),
  instanciarTemplateSkill: (slug: string, para: string) =>
    req<{ ok: boolean; slug: string; renomeado: boolean }>(
      'POST', `/api/templates/skills/${encodeURIComponent(slug)}/instanciar`, { para }),
  // (todasPerguntasSkillsClaude usa o mesmo formato do endpoint de projeto)

  // O vocabulário de tags: ler, fundir (renomear para uma que já existe) e tirar.
  tagsLearnings:     () => req<{ tags: TagLearning[] }>('GET', `${px()}/learnings-tags`),
  teses:          () => req<{ perguntas: PerguntaTese[]; habilidades: number }>('GET', `${px()}/teses`),
  diagnostico:    () => req<{ achados: AchadoDiagnostico[] }>('GET', `${px()}/diagnostico`),
  dados:          () => req<DadosProjeto>('GET', `${px()}/dados`),

  organizacao:    () => req<Organizacao>('GET', `${px()}/organizacao`),
  // O arranjo do canvas da organização: só posições, num arquivo só disso.
  layoutOrganizacao: () =>
    req<LayoutOrg>('GET', `${px()}/organizacao/layout`),
  salvarLayoutOrganizacao: (l: Partial<LayoutOrg>) =>
    req<{ ok: boolean; cards: number; lanes: number; links: number }>(
      'PUT', `${px()}/organizacao/layout`, l),
  definirOrganizacao: (nome: string, patch: { papel?: string; squad?: string; reporta_a?: string }) =>
    req<{ ok: boolean; agente: { rebaixado?: string } }>(
      'PUT', `${px()}/organizacao/${encodeURIComponent(nome)}`, patch),
  criarSquad:     (nome: string, extra: { cor?: string; icone?: string; descricao?: string } = {}) =>
    req<{ ok: boolean; squad: SquadOrg }>('POST', `${px()}/squads`, { nome, ...extra }),
  editarSquad:    (chave: string, patch: { nome?: string; cor?: string; icone?: string; descricao?: string; pai?: string }) =>
    req<{ ok: boolean }>('PUT', `${px()}/squads/${encodeURIComponent(chave)}`, patch),
  apagarSquad:    (chave: string) =>
    req<{ ok: boolean; soltos: number }>('DELETE', `${px()}/squads/${encodeURIComponent(chave)}`),
  cadeiaDe:       (nome: string) =>
    req<{ cadeia: { papel: string; nome: string; titulo: string }[] }>(
      'GET', `${px()}/organizacao/${encodeURIComponent(nome)}/cadeia`),

  // O loop: ler, responder, ensinar direto, aposentar.
  aprendizado:    () => req<AprendizadoView>('GET', `${px()}/aprendizado`),
  // A Inbox mistura as duas filas: descobrir o que o Learning é vem antes de
  // julgar palpite sobre ela.
  inboxAprendizado: () => req<{ perguntas: (Hipotese | PerguntaEnquadramento)[] }>(
    'GET', `${px()}/aprendizado/inbox`),
  enquadramento:  () => req<{ perguntas: PerguntaEnquadramento[]; incompletas: number; prontas: number }>(
    'GET', `${px()}/enquadramento`),
  // Lista vazia dispensa a pergunta, e ela não volta a ser feita.
  enquadrar:      (chave: string, campo: string, escolhas: string[]) =>
    req<{ ok: boolean }>('POST', `${px()}/learnings/${encodeURIComponent(chave)}/enquadrar`,
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
    req<{ ok: boolean; habilidades: number }>('PUT', `${px()}/learnings-tags/${encodeURIComponent(de)}`, { para }),
  apagarTagLearning: (tag: string) =>
    req<{ ok: boolean; habilidades: number }>('DELETE', `${px()}/learnings-tags/${encodeURIComponent(tag)}`),
  editarLearning:    (chave: string, patch: Partial<Pick<LearningCard, 'rotulo' | 'descricao' | 'estado' | 'natureza' | 'tags' | 'cor' | 'icone'>>) =>
    req<{ ok: boolean }>('PUT', `${px()}/learnings/${encodeURIComponent(chave)}`, patch),
  vincularLearning:  (chave: string, agente: string, ligado: boolean) =>
    req<{ ok: boolean }>('POST', `${px()}/learnings/${encodeURIComponent(chave)}/vincular`, { agente, ligado }),
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
