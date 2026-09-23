import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bloco, CarregandoNoctis } from './Esqueleto'
import { FiltroProjetos, catalogoLocal, ehVisaoGlobal, useFiltroProjetos, useProjetos } from './FiltroProjetos'
import type { TemplateItem } from '../api'
import { BarraOrdem, aplicar, useOrdem, type CampoOrdem, type Recorte } from './Ordenar'

/** Por que ordenar por coisas diferentes em cada tipo.
 *
 * Nome e datas valem para tudo: são do arquivo. O resto é do que o recurso É —
 * agente tem nível e Learnings, memória tem tamanho e quem a usa, fluxo tem
 * passos. Uma lista genérica de ordens ofereceria "por nível" numa grade de
 * memórias, e escolher isso não faria nada.
 */
const ORDENS: Record<string, CampoOrdem<ResourceItem>[]> = {
  comum: [
    { id: 'nome', rotulo: 'nome (A→Z)', valor: i => i.displayName || i.name },
    { id: 'mudado', rotulo: 'mudado por último', valor: i => i.mudado || '', desc: true },
    { id: 'criado', rotulo: 'criado por último', valor: i => i.criado || '', desc: true },
    { id: 'antigo', rotulo: 'mais antigo', valor: i => i.criado || '' },
  ],
  agent: [
    { id: 'nivel', rotulo: 'nível', valor: i => i.ficha?.nivel ?? 0, desc: true },
    { id: 'xp', rotulo: 'XP', valor: i => i.ficha?.xp ?? 0, desc: true },
    { id: 'eventos', rotulo: 'trabalho registrado', valor: i => i.ficha?.eventos ?? 0, desc: true },
    { id: 'skills', rotulo: 'nº de learnings', valor: i => (i.ficha?.skills || []).length, desc: true },
  ],
  memory: [
    { id: 'tamanho', rotulo: 'tamanho', valor: i => i.lines ?? 0, desc: true },
    { id: 'usos', rotulo: 'usada por mais agentes', valor: i => (i.usedBy || []).length, desc: true },
  ],
  flow: [{ id: 'passos', rotulo: 'nº de passos', valor: i => i.lines ?? 0, desc: true }],
  persona: [],
}

function ordensDe(kind: string): CampoOrdem<ResourceItem>[] {
  return [...ORDENS.comum, ...(ORDENS[kind] || [])]
}

function recortesDe(kind: string, global: boolean): Recorte<ResourceItem>[] {
  const r: Recorte<ResourceItem>[] = [
    { id: 'ativos', rotulo: 'só ativos', dica: 'Esconde o que está marcado como inativo',
      passa: i => i.active !== false },
    { id: 'semana', rotulo: 'mexidos na semana', dica: 'Mudados nos últimos 7 dias',
      passa: i => !!i.mudado && Date.now() - Date.parse(i.mudado) < 7 * 86400000 },
    { id: 'semtag', rotulo: 'sem tag', dica: 'O que ainda não foi classificado',
      passa: i => (i.tags || []).length === 0 },
  ]
  if (kind === 'agent') {
    r.push({ id: 'trabalharam', rotulo: 'com trabalho', dica: 'Agentes que já registraram algo',
             passa: i => (i.ficha?.eventos ?? 0) > 0 })
    r.push({ id: 'parados', rotulo: 'nunca trabalharam', dica: 'Nasceram e não registraram nada',
             passa: i => (i.ficha?.eventos ?? 0) === 0 })
  }
  if (kind === 'memory') {
    r.push({ id: 'orfas', rotulo: 'que ninguém usa', dica: 'Memória que nenhum agente carrega',
             passa: i => (i.usedBy || []).length === 0 })
  }
  if (global) {
    r.push({ id: 'semdesc', rotulo: 'sem descrição', dica: 'O que entrou sem dizer o que é',
             passa: i => !(i.excerpt || '').trim() })
  }
  return r
}

/** As três camadas do Warden. Cada uma responde a uma pergunta diferente:
 *
 *     própria    o que é DELE — a governança tem conteúdo próprio
 *     catálogo   o que existe em todos os projetos, lido ao vivo
 *     templates  os moldes que descem para qualquer projeto
 *
 * Só aparecem no projeto base. De dentro de um projeto, "todos os projetos" não
 * é uma vista possível, e molde não é coisa que se guarde ali.
 */
type Camada = 'propria' | 'catalogo' | 'templates'
const CAMADAS: { id: Camada; rotulo: string; dica: string }[] = [
  { id: 'propria', rotulo: 'própria', dica: 'O que é do Warden — a camada dele, como a de qualquer projeto' },
  { id: 'catalogo', rotulo: 'catálogo', dica: 'Tudo que existe em todos os projetos, lido ao vivo' },
  { id: 'templates', rotulo: 'templates', dica: 'Os moldes guardados para instanciar em qualquer projeto' },
]

/** O card de um molde: sem identidade nem tags — molde não é recurso vivo. */
function CardTemplate({ t, projetos, onMudou }: {
  t: TemplateItem
  projetos: { slug: string; nome: string }[]
  onMudou: () => void
}) {
  const [indo, setIndo] = useState(false)
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#151515] p-3.5 space-y-2 flex flex-col">
      <div className="flex items-start gap-2">
        <span className="text-[9.5px] uppercase tracking-wide text-sky-300/70 border border-sky-500/30
                         rounded-full px-1.5 py-0.5 shrink-0">molde</span>
        <p className="text-[13px] text-gray-100 leading-tight flex-1 min-w-0">{t.nome}</p>
      </div>
      {t.descricao && <p className="text-[11.5px] text-gray-500 leading-snug line-clamp-3">{t.descricao}</p>}
      <p className="text-[10.5px] text-gray-600">
        {t.deProjeto ? `destilado de ${t.de} · ${t.deProjeto}` : 'escrito aqui'}
        {t.usos > 0 && ` · usado ${t.usos}×`}
      </p>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        {/* Instanciar pede o projeto de destino: um molde sem destino não é
            um gesto, é uma intenção. */}
        <select value="" disabled={indo}
          onChange={async e => {
            const para = e.target.value
            if (!para) return
            setIndo(true)
            try {
              const r = await api.instanciarTemplate(t.kind, t.slug, para)
              alert(r.renomeado
                ? `Chegou como "${r.nome}" — já havia um com o nome do molde.`
                : `"${t.nome}" foi criado em ${projetos.find(p => p.slug === para)?.nome || para}.`)
              onMudou()
            } catch (err) { alert((err as Error).message) } finally { setIndo(false) }
          }}
          className="nodrag flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px]
                     text-gray-300 focus:outline-none focus:border-sky-500">
          <option value="">— instanciar em… —</option>
          {projetos.map(p => <option key={p.slug} value={p.slug}>{p.nome}</option>)}
        </select>
        <button onClick={async () => {
            if (!window.confirm(`Apagar o molde "${t.nome}"? Quem já nasceu dele não é afetado.`)) return
            try { await api.apagarTemplate(t.kind, t.slug); onMudou() }
            catch (e) { alert((e as Error).message) }
          }}
          className="text-[11px] text-gray-600 hover:text-red-400 px-1.5">apagar</button>
      </div>
    </div>
  )
}
import { api, getProject, type Decision, type MemoryVocab, type ResourceItem, type ResourceKind } from '../api'
import { KIND_META } from '../lib/kinds'
import { ResourceCard, type CardActions } from './ResourceCard'
import { abrirRecursoNaDoca } from '../lib/doca'
import { EditorDecisao } from './EditorDecisao'
import { AUTOR_LOCAL } from './BlocoDecisao'

/**
 * A grade de cards que ocupa a tela, com o detalhe aberto na doca da direita.
 *
 * Os quatro tipos usam esta mesma tela: o que muda entre memória, agente, fluxo
 * e persona é o `kind` e o que a página faz ao editar. A edição continua na
 * página de origem — o drawer só edita memória, e trocar as outras por ele
 * apagaria os editores de agente, fluxo e persona.
 */
export function ResourceGrid({ kind, subtitle, onEdit, onNew, reloadKey }: {
  kind: ResourceKind
  subtitle: string
  onEdit: (name: string) => void
  onNew: () => void
  /** Muda para forçar recarga depois que a página salvou algo. */
  reloadKey?: number
}) {
  const [items, setItems] = useState<ResourceItem[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [vocab, setVocab] = useState<MemoryVocab>()
  const [tipoFiltro, setTipoFiltro] = useState<string>('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [editandoDecisao, setEditandoDecisao] = useState<ResourceItem | null>(null)
  const meta = KIND_META[kind]
  // No projeto base a grade é a de TODOS os projetos. O recorte por projeto
  // vem com a vista: uma lista que atravessa clientes é ilegível sem ele.
  const global = ehVisaoGlobal()
  const filtro = useFiltroProjetos(kind)
  const [camada, setCamada] = useState<Camada>('propria')
  const ordem = useOrdem(kind, 'nome')
  const [moldes, setMoldes] = useState<TemplateItem[]>([])
  const projetos = useProjetos()

  // O vocabulário é do sistema, não do projeto: carrega uma vez.
  useEffect(() => { api.memoryTypes().then(setVocab).catch(() => {}) }, [])

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      if (global && camada === 'templates') {
        setMoldes((await api.templates(kind)).templates)
        setItems([])
      } else if (global && camada === 'catalogo') {
        // Montado do que já está no cache do navegador (ver `catalogoLocal`):
        // não repete, no servidor, o trabalho que o preload da abertura já fez.
        filtro.setProjetos(projetos)
        const alvo = filtro.ativos.length ? projetos.filter(p => filtro.ativos.includes(p.slug)) : projetos
        const r = await catalogoLocal(alvo)
        setItems(r[kind] || [])
      } else {
        setItems((await api.getResources())[kind] || [])
      }
    } finally { setCarregando(false) }
    // filtro.setProjetos é estável; incluí-lo aqui reexecutaria a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, global, camada, filtro.ativos.join(','), projetos])
  useEffect(() => { recarregar() }, [recarregar, reloadKey])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let porTipo = tipoFiltro ? items.filter(i => (i.type || '') === tipoFiltro) : items
    if (soPendentes) porTipo = porTipo.filter(i => i.decision && !i.decision.options.some(o => o.checked))
    if (!q) return porTipo
    return porTipo.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.title || '').toLowerCase().includes(q) ||
      (i.excerpt || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q)))
  }, [items, busca, tipoFiltro, soPendentes])

  // A ordem e os recortes entram DEPOIS da busca: quem digitou um nome quer
  // aquele nome, e não o mais recente que combina com ele.
  const campos = useMemo(() => ordensDe(kind), [kind])
  const recortes = useMemo(() => recortesDe(kind, global), [kind, global])
  const visiveis = useMemo(
    () => aplicar(filtrados, campos, recortes, ordem),
    // `ordem` muda de identidade a cada render; o que importa é o conteúdo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtrados, campos, recortes, ordem.campo, ordem.desc, ordem.recortes.join(',')])

  const pendentes = useMemo(
    () => items.filter(i => i.decision && !i.decision.options.some(o => o.checked)).length,
    [items])

  // Quantas de cada tipo, para as abas do filtro mostrarem o número.
  const porTipo = useMemo(() => {
    const c: Record<string, number> = {}
    items.forEach(i => { if (i.type) c[i.type] = (c[i.type] || 0) + 1 })
    return c
  }, [items])

  // Otimista: o card responde na hora e o servidor confirma depois.
  const patchLocal = (name: string, patch: Partial<ResourceItem>) =>
    setItems(is => is.map(i => i.name === name ? { ...i, ...patch } : i))

  const actions: CardActions = {
    onOpen:   it => abrirRecursoNaDoca(kind, it.name, recarregar),
    onEdit:   it => onEdit(it.name),
    onRename: async it => {
      // O nome vai como a pessoa escreveu: acento, espaço e maiúscula ficam.
      // Quem recusa caractere impossível é o backend, em nome_de_recurso().
      const nv = window.prompt(`Novo nome (${meta.label}):`, it.name)?.trim()
      if (!nv || nv === it.name) return
      const fn = { memory: api.renameMemory, agent: api.renameAgent,
                   flow: api.renameFlow, persona: api.renamePersona }[kind]
      try { await fn(it.name, nv); await recarregar() }
      catch (e) { alert('Erro ao renomear:\n' + (e as Error).message) }
    },
    onDelete: async it => {
      if (!window.confirm(`Excluir ${meta.label.toLowerCase()} "${it.name}${meta.ext}"? Apaga o arquivo.`)) return
      const fn = { memory: api.deleteMemory, agent: api.deleteAgent,
                   flow: api.deleteFlow, persona: api.deletePersona }[kind]
      try { await fn(it.name); await recarregar() }
      catch (e) { alert('Erro ao excluir:\n' + (e as Error).message) }
    },
    onToggleChoice: async (it, optionId) => {
      // O servidor decide o resultado (radio desmarca as outras), então o card
      // espera a resposta em vez de adivinhar.
      try {
        const r = await api.toggleChoice(kind, it.name, optionId, AUTOR_LOCAL)
        patchLocal(it.name, { decision: r.decision })
      } catch { await recarregar() }
    },
    onEditDecision: it => setEditandoDecisao(it),
    onTemplate: global ? async (it: ResourceItem) => {
      const rotulo = window.prompt('Nome do molde:', it.displayName || it.name)?.trim()
      if (!rotulo) return
      try {
        const r = await api.guardarTemplate({
          kind, projeto: it.projeto || getProject(), nome: it.name, rotulo })
        alert(r.template.novo ? `Molde "${r.template.nome}" guardado.`
                              : `Molde "${r.template.nome}" atualizado.`)
      } catch (e) { alert((e as Error).message) }
    } : undefined,
    onIdentity: async (it, patch) => {
      patchLocal(it.name, patch)
      try { await api.saveIdentity(kind, it.name, patch) }
      catch { await recarregar() }
    },
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-2 border-b border-white/[0.06] bg-transparent flex items-center justify-between shrink-0 gap-4">
        <div className="min-w-0">
          {/* A contagem também é conteúdo que vai chegar: enquanto não chega,
              ela ocupa o lugar dela em vez de escrever "carregando" ao lado de
              uma grade que já está dizendo isso. */}
          {carregando
            ? <Bloco className="h-3 w-40" />
            : <p className="text-xs text-gray-500">
                {`${filtrados.length}${filtrados.length !== items.length ? ` de ${items.length}` : ''} · ${subtitle}`}
              </p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="buscar nome, texto ou #tag"
            className="w-64 bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          {pendentes > 0 && (
            <button onClick={() => setSoPendentes(v => !v)}
              title="Cards com escolha em aberto"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                soPendentes ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'border-amber-500/30 text-amber-400/80 hover:text-amber-300'}`}>
              ◉ {pendentes} a decidir
            </button>
          )}
          <button onClick={onNew}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg">
            + {meta.label}
          </button>
        </div>
      </div>

      {global && (
        <div className="px-5 py-1.5 border-b border-white/[0.06] flex items-center gap-1 shrink-0">
          {CAMADAS.map(c => (
            <button key={c.id} onClick={() => setCamada(c.id)} title={c.dica}
              className={`text-[11.5px] px-2.5 py-1 rounded-lg ${
                camada === c.id ? 'bg-white/[0.1] text-gray-100' : 'text-gray-500 hover:text-gray-200'}`}>
              {c.rotulo}
            </button>
          ))}
          <span className="flex-1" />
          {camada === 'templates' && (
            <span className="text-[11px] text-gray-600">
              {moldes.length} molde{moldes.length !== 1 ? 's' : ''} · instanciar cria uma cópia independente
            </span>
          )}
        </div>
      )}
      {global && camada === 'catalogo' && (
        <FiltroProjetos projetos={filtro.projetos} ativos={filtro.ativos}
          contagem={undefined}
          onAlternar={filtro.alternar} onLimpar={filtro.limpar} />
      )}

      {kind === 'memory' && vocab && (
        <div className="px-5 py-2 border-b border-gray-800 bg-[#0f0f0f] flex items-center gap-1.5 shrink-0 overflow-x-auto">
          <button onClick={() => setTipoFiltro('')}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
              !tipoFiltro ? 'bg-gray-700 border-gray-600 text-gray-100' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>
            todas {items.length}
          </button>
          {Object.entries(vocab.types).map(([id, t]) => (
            <button key={id} onClick={() => setTipoFiltro(tipoFiltro === id ? '' : id)}
              title={`${t.desc} · no prompt: ${t.prompt}`}
              className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                tipoFiltro === id ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-300'}`}
              style={tipoFiltro === id
                ? { background: t.color, borderColor: t.color }
                : { borderColor: t.color + '55' }}>
              {t.label} {porTipo[id] || 0}
            </button>
          ))}
        </div>
      )}

      {(!global || camada !== 'templates') && (
        <BarraOrdem campos={campos} recortes={recortes} estado={ordem}
          contagem={visiveis.length} total={items.length} />
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {global && camada === 'templates' && !carregando ? (
          moldes.length === 0 ? (
            <div className="h-full grid place-items-center text-center">
              <div>
                <p className="text-gray-500 text-sm">Nenhum molde deste tipo ainda.</p>
                <p className="text-gray-600 text-xs mt-1 max-w-sm">
                  No catálogo, abra o menu de um card e escolha “guardar como template”.
                  Molde bom é destilado de trabalho que já serviu, não inventado antes dele.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))] items-start">
              {moldes.map(m => (
                <CardTemplate key={`${m.kind}:${m.slug}`} t={m} projetos={projetos}
                  onMudou={recarregar} />
              ))}
            </div>
          )
        ) : carregando ? (
          <CarregandoNoctis />
        ) : visiveis.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2">
            <p className="text-gray-500 text-sm">
              {items.length === 0
                ? `Nenhum recurso deste tipo ainda.`
                : `Nada encontrado para "${busca}".`}
            </p>
            {items.length === 0 && (
              <button onClick={onNew} className="text-xs text-blue-400 hover:underline">criar o primeiro</button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
            {visiveis.map(it => (
              // A chave leva o projeto: `qa` existe no Sciensa e no Tessera, e
              // são agentes diferentes. Só o nome fundia os dois numa linha só.
              <ResourceCard key={it.projeto ? `${it.projeto}/${it.name}` : it.name}
                item={it} kind={kind} actions={actions} vocab={vocab} />
            ))}
          </div>
        )}
      </div>


      {editandoDecisao && (
        <EditorDecisao
          item={editandoDecisao}
          onFechar={() => setEditandoDecisao(null)}
          onSalvar={async (d: Partial<Decision>) => {
            const r = await api.saveDecision(kind, editandoDecisao.name, d)
            patchLocal(editandoDecisao.name, { decision: r.decision })
          }}
        />
      )}
    </div>
  )
}
