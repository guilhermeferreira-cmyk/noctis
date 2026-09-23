import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GiSkills } from '../iconesEssenciais'
import { api, type FichaAgente, type Learning } from '../api'
import { ICON_SIZES } from '../lib/kinds'
import { EsqueletoLinhas, EsqueletoPainel } from './Esqueleto'

/**
 * XP, nível e Learnings na tela.
 *
 * A leitura tem duas alturas. No card, o mínimo que responde "quanto ele já
 * trabalhou e em quê" — um anel de nível, uma barra fina e três chips. Na ficha
 * do drawer, tudo: cada Learning com sua barra, os brotos e o histórico.
 *
 * Os Learnings não têm lista prévia: nascem do que cada agente declara ter
 * exercitado. Por isso a barra importa mais que o nome — é ela que mostra que
 * aquilo está virando competência e não foi dito uma vez.
 */

/** Uma ficha por agente, buscada uma vez e compartilhada entre os cards. */
const cache = new Map<string, FichaAgente>()
const esperando = new Map<string, Promise<FichaAgente>>()

/**
 * A ficha completa de um agente — nível, XP e cada Learning com sua barra.
 *
 * `ativo` decide SE ela busca. Por padrão busca (`true`), do jeito que sempre
 * foi — é o que a ficha do drawer (`FichaDeProgresso`, um agente por vez) quer.
 * Mas o mesmo hook, chamado para os discos de UMA GRADE de vinte ou trinta
 * cards, virava vinte ou trinta requisições simultâneas — e cada uma delas
 * relia e recalculava o projeto INTEIRO no servidor só para extrair um nome.
 * É esse coro que fazia trocar de projeto (ou abrir o Warden, que soma cards
 * de todo mundo) demorar.
 *
 * A saída é `ativo: false` até haver um motivo de verdade para saber tudo —
 * quem chama com isso recebe `undefined` sem rede nenhuma, e liga a busca
 * quando o gesto (o hover, no caso de `DiscosDoAgente`) pedir de fato.
 */
export function useFicha(agente: string | undefined,
                         opts: { versao?: number; ativo?: boolean } = {}) {
  const { versao = 0, ativo = true } = opts
  const [ficha, setFicha] = useState<FichaAgente | undefined>(
    agente ? cache.get(agente) : undefined)

  useEffect(() => {
    if (!agente || !ativo) return
    let vivo = true
    if (versao > 0) { cache.delete(agente); esperando.delete(agente) }
    const emCache = cache.get(agente)
    if (emCache) { setFicha(emCache); return }
    // Vinte cards do mesmo agente não podem virar vinte requisições.
    let p = esperando.get(agente)
    if (!p) {
      p = api.fichaDoAgente(agente).then(f => { cache.set(agente, f); return f })
      esperando.set(agente, p)
    }
    p.then(f => { if (vivo) setFicha(f) }).catch(() => {}).finally(() => esperando.delete(agente))
    return () => { vivo = false }
  }, [agente, versao, ativo])

  return ficha
}

/** O resumo que já vem junto do card — sem ele, `DiscosDoAgente` não desenha nada. */
export type ResumoFicha = {
  nivel: number; xp: number; eventos: number; progresso: number
  proximo_nivel: number; skills: string[]
}

/**
 * Onde o ponteiro está, em coordenadas de tela.
 *
 * O painel precisa disto para saber quando se fechar. No mapa, o card se move
 * por baixo do mouse — no zoom, no pan, no arrasto — e o `mouseleave` não
 * dispara quando é o ELEMENTO que sai de debaixo do ponteiro parado. Sem este
 * guarda, o painel ficava órfão: aberto, seguindo um card que já não está ali.
 */
const ponteiro = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', e => { ponteiro.x = e.clientX; ponteiro.y = e.clientY },
                          { passive: true })
}

/** Espelha o backend: abaixo disto o Learning ainda é broto. */
const EVENTOS_PARA_PROMOVER = 3

/** Zera o cache — para depois de confirmar um evento, por exemplo. */
export function esquecerFichas() { cache.clear(); esperando.clear() }

/** Barra de progresso simples — usada na ficha do drawer. */
export function Barra({ progresso, cor, altura = 4, titulo }: {
  progresso: number; cor: string; altura?: number; titulo?: string
}) {
  return (
    <div title={titulo} className="w-full rounded-full bg-gray-800 overflow-hidden" style={{ height: altura }}>
      <div className="h-full rounded-full" style={{
        width: `${Math.max(2, progresso * 100)}%`, background: cor, transition: 'width .5s ease',
      }} />
    </div>
  )
}

/**
 * Disco com um número dentro e um anel em volta.
 *
 * É a unidade de linguagem do progresso: o mesmo desenho vale para o nível do
 * agente, para a contagem de Learnings e para o nível de cada Learning. O
 * número vai em branco, e não na cor do recurso — dentro de um aro colorido, a
 * cor sobre a cor perde o contraste justamente no algarismo, que é o que se lê.
 */
export function Disco({ numero, progresso, cor, tamanho = 32, titulo, apagado }: {
  numero: number | string
  progresso?: number
  cor: string
  tamanho?: number
  titulo?: string
  apagado?: boolean
}) {
  const traco = Math.max(2, Math.round(tamanho * 0.085))
  const r = (tamanho - traco) / 2
  const c = 2 * Math.PI * r
  const aro = apagado ? '#52525b' : cor
  return (
    <span title={titulo} className="relative grid place-items-center shrink-0"
      style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="#111111"
          stroke={progresso === undefined ? aro : aro + '40'} strokeWidth={traco} />
        {progresso !== undefined && progresso > 0 && (
          <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={aro} strokeWidth={traco}
            strokeLinecap="round" strokeDasharray={`${c * progresso} ${c}`}
            style={{ transition: 'stroke-dasharray .6s ease' }} />
        )}
      </svg>
      <span className="relative font-semibold tabular-nums leading-none"
        style={{ color: apagado ? '#a1a1aa' : '#fafafa', fontSize: Math.round(tamanho * 0.42) }}>
        {numero}
      </span>
    </span>
  )
}

/**
 * A coluna de discos do card de agente: nível e quantidade de Learnings.
 *
 * Fica DENTRO do card, na coluna que a caixa de seleção ocupava antes de virar
 * chave — é a primeira coisa à esquerda, antes do ícone. Montá-los na borda
 * chegou a ser tentado e faz os discos brigarem com o card vizinho na grade.
 *
 * O hover abre a ficha inteira ao lado do card. Ela escolhe o lado medindo o
 * espaço: à esquerda quando cabe, à direita quando não — na primeira coluna da
 * grade, um painel fixo à esquerda cairia atrás da barra lateral.
 */
export function DiscosDoAgente({ agente, resumo, cor, eager = false }: {
  agente: string
  /** O que o card já trazia embutido (ver `ResumoFicha`) — o suficiente para
   *  desenhar os discos sem rede nenhuma. Quem não tem de onde tirar isso
   *  (a Organização, cujo endpoint não embute ficha) passa `eager` em vez
   *  disto, e volta a buscar de cara como sempre foi — lá o time costuma ser
   *  pequeno o bastante para não doer. */
  resumo?: ResumoFicha
  cor: string
  eager?: boolean
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)

  // A busca completa (nível de cada Learning, o histórico) só começa quando
  // alguém pede — o hover, mais abaixo — ou de cara, se `eager` disser que não
  // há resumo nenhum para desenhar em cima enquanto isso.
  const [pedirCompleta, setPedirCompleta] = useState(eager)
  const completa = useFicha(agente, { ativo: pedirCompleta })

  // Nada de `return` antes dos hooks: numa passada sem nada para mostrar, os
  // de baixo não rodariam e o React derrubaria a árvore com "rendered more
  // hooks than during the previous render". A saída fica depois de todos eles.
  const nivel = completa?.nivel ?? resumo?.nivel ?? 0
  const xp = completa?.xp ?? resumo?.xp ?? 0
  const eventos = completa?.eventos ?? resumo?.eventos ?? 0
  const progresso = completa?.progresso ?? resumo?.progresso ?? 0
  const proximoNivel = completa?.proximo_nivel ?? resumo?.proximo_nivel ?? 0
  const skills = Object.entries(completa?.habilidades || {})
  const brotos = Object.entries(completa?.brotos || {})
  // Antes de a busca completa chegar, a contagem vem do resumo — só o nome de
  // cada Learning, sem nível nem barra, mas já diz "quantas".
  const numLearnings = completa ? skills.length : (resumo?.skills.length || 0)
  const numBrotos = brotos.length
  const trabalhou = eventos > 0
  const faltam = Math.max(0, Math.round(proximoNivel - xp))
  const d = ICON_SIZES.disco
  const LARGURA = 288
  const ALTURA_MAX = 380

  /**
   * Abre o painel POR CIMA dos discos, e não ao lado.
   *
   * Ao lado havia um vão entre o gatilho e o painel: atravessá-lo com o mouse
   * fechava a ficha antes de chegar nela, e a lista de Learnings ficava sem
   * como ser rolada. Cobrindo os discos, o ponteiro já nasce dentro.
   *
   * A posição é medida a cada abertura, não fixada no CSS: o card pode estar em
   * qualquer canto da grade ou do mapa, e um lado escolhido de antemão cai fora
   * da tela metade das vezes.
   */
  const calcular = useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || (r.width === 0 && r.height === 0)) return null
    const folga = 8
    const altura = Math.min(ALTURA_MAX, 120 + (skills.length + brotos.length) * 34)
    let left = r.left - folga
    if (left + LARGURA > window.innerWidth - folga) left = r.right + folga - LARGURA
    left = Math.max(folga, Math.min(left, window.innerWidth - LARGURA - folga))
    let top = r.top - folga
    if (top + altura > window.innerHeight - folga) top = window.innerHeight - altura - folga
    top = Math.max(folga, top)
    return { left: Math.round(left), top: Math.round(top) }
  }, [skills.length, brotos.length])

  /**
   * Enquanto o painel está aberto, ele persegue o gatilho.
   *
   * No mapa o card se move por baixo do mouse — arrastar o canvas, dar zoom,
   * arrastar o próprio card. Como o painel é `fixed`, ele ficaria parado na tela
   * enquanto o card foge, e a ficha passaria a apontar para o card errado. Um
   * quadro por vez é barato: é uma medição, e só enquanto há hover.
   */
  useEffect(() => {
    if (!pos) return
    let vivo = true
    let id = 0
    const dentro = (r: DOMRect | undefined, margem = 6) =>
      !!r && ponteiro.x >= r.left - margem && ponteiro.x <= r.right + margem
          && ponteiro.y >= r.top - margem && ponteiro.y <= r.bottom + margem

    const seguir = () => {
      if (!vivo) return
      // O ponteiro saiu do gatilho E do painel: fecha. É o que o `mouseleave`
      // deixa passar quando quem se move é o card, não o mouse.
      if (!dentro(ref.current?.getBoundingClientRect())
          && !dentro(painelRef.current?.getBoundingClientRect())) {
        setPos(null)
        return
      }
      const p = calcular()
      if (p) setPos(atual => (atual && atual.left === p.left && atual.top === p.top) ? atual : p)
      id = requestAnimationFrame(seguir)
    }
    id = requestAnimationFrame(seguir)
    return () => { vivo = false; cancelAnimationFrame(id) }
  }, [pos !== null, calcular])   // eslint-disable-line react-hooks/exhaustive-deps

  // O hover é o gesto que dá o motivo de saber tudo: aí sim vale pagar a
  // busca completa, agora com o servidor recalculando UM projeto, não vinte
  // requisições fazendo isso ao mesmo tempo.
  const abrir = () => { setPedirCompleta(true); setPos(calcular()) }

  if (!resumo && !completa) return null

  return (
    <div ref={ref} onMouseEnter={abrir} onMouseLeave={() => setPos(null)}
      className="nodrag relative flex flex-col gap-1.5 shrink-0 self-start">
      <Disco numero={nivel} progresso={trabalhou ? progresso : 0} cor={cor}
        tamanho={d} apagado={!trabalhou}
        titulo={trabalhou ? `nível ${nivel} · ${Math.round(xp)} XP` : 'sem trabalho registrado'} />
      <Disco numero={numLearnings + numBrotos} cor={cor} tamanho={Math.round(d * 0.82)}
        apagado={!trabalhou}
        titulo={`${numLearnings} learning${numLearnings !== 1 ? 's' : ''}`
                + (numBrotos ? ` · ${numBrotos} brotando` : '')} />

      {/* Portal para o `body`, e não só `fixed`.
          `position: fixed` NÃO escapa de um ancestral com `transform` — e o
          viewport do ReactFlow é exatamente isso. Dentro dele, o painel herdava
          o zoom do mapa: a 0,2 ele aparecia com 58px de largura, posicionado no
          espaço transformado. Fora da árvore do canvas, ele volta a medir a
          tela de verdade. */}
      {pos && createPortal((
        <div ref={painelRef}
          className="fixed z-[70] bg-[#141414] border border-gray-700 rounded-xl shadow-2xl p-3
                     flex flex-col gap-2.5"
          style={{ left: pos.left, top: pos.top, width: LARGURA, maxHeight: ALTURA_MAX }}>
          <div className="flex items-center gap-2.5 shrink-0">
            <Disco numero={nivel} progresso={trabalhou ? progresso : 0} cor={cor}
              tamanho={d} apagado={!trabalhou} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-400">Nível + XP</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold tabular-nums text-gray-100">
                  {Math.round(xp)}<span className="text-gray-500">/{Math.round(proximoNivel)}</span>
                </span>
                <span className="text-[10px] text-gray-500 tabular-nums">
                  {trabalhou ? `nxt: ${faltam}` : 'sem trabalho'}
                </span>
              </div>
            </div>
            {eventos > 0 && (
              <span className="text-[10px] text-gray-600 shrink-0">{eventos} ev</span>
            )}
          </div>

          {/* A quebra por Learning só existe depois que a busca completa
              chega — o resumo do card não sabe o nível de cada uma, só a
              contagem. Enquanto espera, o painel mostra que está vindo, em vez
              de fingir que já sabe. */}
          {!completa && pedirCompleta && (numLearnings > 0) && (
            <div className="border-t border-gray-800 pt-2.5">
              <EsqueletoLinhas linhas={Math.min(3, numLearnings)} />
            </div>
          )}
          {completa && (skills.length > 0 || brotos.length > 0) && (
            <div className="space-y-2 overflow-y-auto pr-0.5 border-t border-gray-800 pt-2.5 min-h-0">
              {skills.map(([k, h]) => (
                <div key={k} className="flex items-center gap-2.5">
                  <Disco numero={h.nivel} progresso={h.progresso} cor={cor} tamanho={Math.round(d * 0.82)}
                    titulo={`${h.eventos} eventos · ${Math.round(h.xp)} XP`} />
                  <span className="text-xs text-gray-200 truncate flex-1" title={h.rotulo}>{h.rotulo}</span>
                </div>
              ))}
              {brotos.map(([k, h]) => (
                <div key={k} className="flex items-center gap-2.5">
                  <Disco numero={h.nivel} progresso={h.progresso} cor="#71717a"
                    tamanho={Math.round(d * 0.82)} apagado
                    titulo={`ainda não firmada no repertório do projeto · ${h.eventos} evento${h.eventos !== 1 ? 's' : ''} deste agente`} />
                  <span className="text-xs text-gray-500 truncate flex-1" title={h.rotulo}>{h.rotulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ), document.body)}
    </div>
  )
}

/**
 * A barra de XP na borda de baixo do card.
 *
 * Ela É a borda: largura inteira, encostada no canto, com o mesmo raio do card.
 * Uma barra dentro do corpo seria mais um elemento competindo com o conteúdo;
 * assim ela vira moldura.
 */
export function BarraDoCard({ resumo, cor, raio = 11 }: {
  /** Só precisa do que o card já trouxe — eventos e progresso, nada mais. */
  resumo?: { eventos: number; progresso: number }
  cor: string
  raio?: number
}) {
  if (!resumo || !resumo.eventos) return null
  return (
    <div aria-hidden="true"
      className="absolute left-0 right-0 bottom-0 h-1 overflow-hidden pointer-events-none"
      style={{ borderBottomLeftRadius: raio, borderBottomRightRadius: raio }}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(1.5, resumo.progresso * 100)}%`,
          background: `linear-gradient(90deg, ${cor}55, ${cor})`,
          transition: 'width .6s ease',
        }} />
    </div>
  )
}

function LinhaLearning({ h, cor, broto }: { h: Learning; cor: string; broto?: boolean }) {
  return (
    <div className={broto ? 'opacity-60' : ''}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-gray-200 flex-1 truncate" title={h.aliases.join(' · ')}>
          {h.rotulo}
        </span>
        <span className="text-[10px] font-mono text-gray-500 shrink-0">
          nv{h.nivel}{broto && <span className="text-gray-700"> · broto</span>}
        </span>
        <span className="text-[10px] font-mono text-gray-600 shrink-0 w-10 text-right">
          {Math.round(h.xp)}
        </span>
      </div>
      <div className="mt-1">
        <Barra progresso={h.progresso} cor={broto ? '#52525b' : cor} altura={3}
          titulo={broto
            ? 'ainda não firmada no repertório do projeto'
            : `${Math.round(h.progresso * 100)}% para o nível ${h.nivel + 1}`} />
      </div>
    </div>
  )
}

const ROTULO_TIPO: Record<string, string> = {
  entrega: 'entrega', output: 'output', correcao: 'correção', revisao: 'revisão',
  memoria: 'memória', decisao: 'decisão', retrabalho: 'retrabalho',
}

/** A ficha completa, para a seção do drawer. */
export function FichaDeProgresso({ agente, cor, onMudou }: {
  agente: string; cor: string; onMudou?: () => void
}) {
  const [versao, setVersao] = useState(0)
  const ficha = useFicha(agente, { versao })

  if (!ficha) return <EsqueletoPainel itens={3} />

  const learnings = Object.entries(ficha.habilidades)
  const brotos = Object.entries(ficha.brotos)

  const confirmar = async (id: string) => {
    await api.confirmarEvento(id)
    esquecerFichas()
    setVersao(v => v + 1)
    onMudou?.()
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-2xl font-semibold" style={{ color: cor }}>nv{ficha.nivel}</span>
          <span className="text-xs text-gray-500">{Math.round(ficha.xp)} XP</span>
          <span className="flex-1" />
          <span className="text-[10px] text-gray-600">
            {ficha.eventos} evento{ficha.eventos !== 1 ? 's' : ''}
          </span>
        </div>
        <Barra progresso={ficha.progresso} cor={cor} altura={6} />
        <div className="mt-1 text-[10px] text-gray-600">
          faltam {Math.max(0, Math.round(ficha.proximo_nivel - ficha.xp))} XP para o nível {ficha.nivel + 1}
        </div>
      </div>

      {learnings.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-600">
            Learning ({learnings.length})
          </div>
          {learnings.map(([k, h]) => <LinhaLearning key={k} h={h} cor={cor} />)}
        </div>
      )}

      {brotos.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-600">
            Brotando ({brotos.length})
            <span className="normal-case tracking-normal"> — firma com 3 eventos no projeto</span>
          </div>
          {brotos.map(([k, h]) => <LinhaLearning key={k} h={h} cor={cor} broto />)}
        </div>
      )}

      {ficha.historico.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">Trabalho recente</div>
          <div className="space-y-1.5">
            {ficha.historico.slice(0, 12).map(e => (
              <div key={e.id} className="text-[11px] border-l-2 pl-2 py-0.5"
                style={{ borderColor: e.confirmado_por ? cor + '99' : '#3f3f46' }}>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-gray-300 flex-1 truncate" title={e.resumo}>
                    {e.resumo || ROTULO_TIPO[e.tipo] || e.tipo}
                  </span>
                  <span className="font-mono text-gray-600 shrink-0">+{Math.round(e.xp)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                  <span>{(e.quando || '').slice(0, 10)}</span>
                  <span className="text-gray-700">·</span>
                  <span>{ROTULO_TIPO[e.tipo] || e.tipo}</span>
                  {e.despacho && <><span className="text-gray-700">·</span><span className="truncate">{e.despacho}</span></>}
                  <span className="flex-1" />
                  {e.confirmado_por
                    ? <span title={`confirmado por ${e.confirmado_por}`} style={{ color: cor }}>✓</span>
                    : <button onClick={() => confirmar(e.id)}
                        title="Confirmar esta entrega (libera o bônus de revisão)"
                        className="text-gray-500 hover:text-gray-200 underline decoration-dotted">
                        confirmar
                      </button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!ficha.eventos && (
        <p className="text-xs text-gray-600 leading-snug">
          Nenhum trabalho registrado ainda. O agente registra ao terminar um despacho,
          e o XP é calculado aqui — nunca declarado por ele.
        </p>
      )}
    </div>
  )
}
