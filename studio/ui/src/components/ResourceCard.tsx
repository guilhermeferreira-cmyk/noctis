import { useEffect, useRef, useState } from 'react'
import { api, assetUrl, type MemoryVocab, type ResourceItem, type ResourceKind } from '../api'
import { getIcon } from '../memoryIcons'
import { COLORS, KIND_META, ICON_SIZES, doSistema } from '../lib/kinds'
import { SeletorIcone } from './SeletorIcone'
import { BarraDoCard, DiscosDoAgente } from './Progresso'
import { Switch } from './Switch'
import { copiar, textoDaReferencia } from '../lib/referencia'
import { OrigemIcone } from './OrigemIcone'
import { BlocoDecisao } from './BlocoDecisao'
import { ItemMenu } from '../lib/menuIcons'
import { SeloProjeto } from './FiltroProjetos'

/**
 * O card de recurso fora do mapa.
 *
 * É irmão do `ResourceNode` do canvas e mostra a mesma coisa, sem o que só faz
 * sentido dentro de uma lane: âncoras de ligação, alça de redimensionar e o
 * peso no condensado. Cor, ícone, tags e ativa/inativa são identidade do
 * recurso (`resources.json`), então mudam aqui e valem em todo mapa.
 */
export interface CardActions {
  onOpen:   (item: ResourceItem) => void
  onEdit:   (item: ResourceItem) => void
  onRename: (item: ResourceItem) => void
  onDelete: (item: ResourceItem) => void
  onIdentity: (item: ResourceItem,
               patch: Partial<{ color: string; icon: string; active: boolean; tags: string[]; type: string; origin: string }>) => void
  /** Marca ou desmarca uma escolha. Só registra — nada é executado. */
  onToggleChoice: (item: ResourceItem, optionId: string) => void
  /** Abre o editor de escolhas do card. */
  onEditDecision: (item: ResourceItem) => void
  /** Guarda o recurso como molde na camada de templates do Warden. Só existe
   *  no andar de cima: de dentro de um projeto, molde não faz sentido. */
  onTemplate?: (item: ResourceItem) => void
}

export function ResourceCard({ item, kind, actions, vocab }: {
  item: ResourceItem; kind: ResourceKind; actions: CardActions; vocab?: MemoryVocab
}) {
  const [menu, setMenu] = useState(false)
  const [tagInput, setTagInput] = useState('')
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

  const meta = KIND_META[kind]
  const color = item.color || meta.color
  // Decisão em aberto não ganha mais um anel âmbar em volta do card: âmbar não
  // é o vocabulário desta interface, e um anel cercando o card inteiro briga
  // com o filete da esquerda, que já é quem diz o tipo. Virou um filete
  // interno na cor configurada em Configurações › Ícones e cores › Sinais.
  const sinal = doSistema('sinal.pendente', 'GiStamper', '#8b5cf6')
  const icon = item.icon || meta.icon
  const active = item.active !== false
  const tags = item.tags || []
  const thumbs = item.thumbs || []
  const usedBy = item.usedBy || []
  const heading = item.title || item.displayName || item.name.replace(/_/g, ' ')
  const [copiado, setCopiado] = useState(false)
  // O identificador leva o caminho inteiro — projeto, pasta e arquivo — mais
  // o rótulo legível. No agente, o rótulo é o nickname: é por ele que se
  // chama, e colar só o caminho perderia essa metade.
  const copiarRef = async () => {
    const rotulo = item.nickname ? `${heading} (${item.nickname})` : heading
    const ok = await copiar(textoDaReferencia({ tipo: 'recurso', kind, nome: item.name, rotulo }))
    setCopiado(ok)
    setTimeout(() => setCopiado(false), 1400)
  }

  const Icon = getIcon(icon)
  const tipo = kind === 'memory' && item.type ? vocab?.types?.[item.type] : undefined
  const pendente = !!item.decision && !item.decision.options.some(o => o.checked)

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    if (!t || tags.includes(t) || tags.length >= 12) { setTagInput(''); return }
    actions.onIdentity(item, { tags: [...tags, t] })
    setTagInput('')
  }

  return (
    <div
      className={`acende relative flex flex-col rounded-xl border caixa-vidro bg-[#161616] shadow-lg transition-all hover:border-gray-600 cursor-pointer ${
        item.decision ? 'min-h-[15.5rem]' : 'h-[15.5rem]'
      } ${active ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}
      style={{ borderLeft: `4px solid ${color}`, ['--cor-card' as string]: color,
               ...(pendente ? { boxShadow: `inset 0 0 0 1px ${sinal.color}3d` } : {}) }}
      onClick={e => { if (!(e.target as HTMLElement).closest('button,a,input,textarea,select,label,[contenteditable],[role=menu]')) actions.onOpen(item) }}
    >
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-1.5 shrink-0">
        {/* Os discos ocupam a coluna da antiga caixa de seleção: nível com o anel
            de XP e a contagem de Learnings. Só o agente os tem. */}
        {kind === 'agent' && <DiscosDoAgente agente={item.name} resumo={item.ficha} cor={color} />}
        {/* a moldura acompanha o ícone: sem isso, um ícone grande vaza da caixa */}
        <span className="relative shrink-0 flex items-center justify-center rounded-lg"
          style={{ background: color + '22', color,
                   width: Math.max(44, ICON_SIZES.card + 14), height: Math.max(44, ICON_SIZES.card + 14) }}>
          <Icon size={ICON_SIZES.card} />
        </span>
        {/* O nickname fica logo abaixo do título, e só o agente tem um: é por
            ele que se chama este agente aplicado em conversa. Quem endereça é
            o par projeto:nome, que mora no menu de copiar identificador. */}
        <div className="flex-1 min-w-0">
          <button onClick={() => actions.onOpen(item)}
            className="text-sm text-gray-100 font-semibold w-full capitalize leading-tight line-clamp-2 text-left hover:text-white"
            title={heading}>{heading}</button>
          {item.nickname && (
            <div className="text-[11.5px] text-gray-500 truncate leading-tight mt-0.5"
              title={`nickname de ${item.name} neste projeto`}>{item.nickname}</div>
          )}
        </div>
        {!active && <span title="Inativa" className="text-xs shrink-0">🔒</span>}
        <button ref={btnRef} onClick={() => setMenu(m => !m)}
          className="text-gray-500 hover:text-gray-200 px-1 shrink-0 text-base leading-none self-start">⋯</button>
      </div>

      <div className="px-3 pb-1.5 shrink-0 flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
          style={{ color, background: color + '1f' }}>{meta.label}</span>
        {tipo && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            title={`${tipo.desc} · no prompt: ${tipo.prompt}`}
            style={{ color: tipo.color, background: tipo.color + '1f' }}>{tipo.label}</span>
        )}
        {item.decision && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
            pendente ? '' : 'text-gray-400 bg-gray-700/60'}`}
          style={pendente ? { color: sinal.color, background: sinal.color + '26' } : undefined}
            title={pendente ? 'Tem escolha em aberto neste card' : 'A escolha deste card já foi feita'}>
            {pendente ? 'a decidir' : 'decidido'}</span>
        )}
        <OrigemIcone origem={item.origin} />
        <span className="text-[11px] font-mono text-gray-600 truncate">{item.name}{meta.ext}</span>
      </div>

      {/* De qual projeto este card veio. Só aparece na visão de todos, e é a
          informação que impede o erro caro dali: agir sobre a memória certa,
          do projeto errado. */}
      {item.projetoNome && (
        <div className="px-3 pb-1.5 shrink-0">
          <SeloProjeto nome={item.projetoNome} />
        </div>
      )}

      {tags.length > 0 && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-1 shrink-0">
          {tags.map(t => (
            <span key={t} className="group/tag inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ color, borderColor: color + '66', background: color + '14' }}>
              #{t}
              <button onClick={() => actions.onIdentity(item, { tags: tags.filter(x => x !== t) })}
                className="opacity-0 group-hover/tag:opacity-100 hover:text-red-400 leading-none">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="px-3 pb-2 flex-1 min-h-0 overflow-hidden flex flex-col gap-1.5">
        {item.excerpt
          ? <p className={`text-xs text-gray-400 leading-snug shrink-0 ${thumbs.length ? 'line-clamp-2' : 'line-clamp-4'}`}
              title={item.excerpt}>{item.excerpt}</p>
          : <p className="text-xs text-gray-700 italic shrink-0">sem descrição</p>}

        {item.decision && (
          <BlocoDecisao decision={item.decision} compacto
            onToggle={id => actions.onToggleChoice(item, id)} />
        )}

        {thumbs.length > 0 && (
          <div className="grid grid-cols-3 gap-1 flex-1 min-h-[46px] auto-rows-fr">
            {thumbs.map((t, i) => {
              const resto = (item.images || 0) - thumbs.length
              const ultima = i === thumbs.length - 1 && resto > 0
              return (
                <div key={t} className="relative rounded-md overflow-hidden border border-gray-800 bg-[#0f0f0f]">
                  <img src={assetUrl(t)} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
                  {ultima && (
                    <span className="absolute inset-0 bg-black/65 flex items-center justify-center text-[11px] font-semibold text-gray-100">
                      +{resto}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {kind === 'agent' && <BarraDoCard resumo={item.ficha} cor={color} />}

      <div className={`flex items-center gap-3 px-3 pt-1.5 border-t border-gray-800 text-[11px] text-gray-500 shrink-0 ${kind === 'agent' ? 'pb-2.5' : 'pb-1.5'}`}>
        {kind === 'memory' ? (
          <>
            <span title={`${item.lines || 0} linhas`}>📝 {item.lines || 0} ln</span>
            {usedBy.length > 0
              ? <span className="text-gray-400" title={'Usada por: ' + usedBy.join(', ')}>🤖 {usedBy.length} ag.</span>
              : <span className="text-gray-700">🤖 sem uso</span>}
            {(item.attachments || 0) > 0 && <span className="text-gray-400">📎 {item.attachments}</span>}
          </>
        ) : <span className="truncate" title={item.badge}>{item.badge || meta.label}</span>}
        {!active && <span className="text-amber-500/80 ml-auto">inativa</span>}
      </div>

      {menu && (
        <div ref={menuRef} className="absolute top-9 right-1 z-50 w-52 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-2xl py-1 text-sm">
          <ItemMenu icone={kind === 'flow' ? 'verFluxo' : 'ver'}
            onClick={() => { setMenu(false); actions.onOpen(item) }}>
            {kind === 'flow' ? 'Visualizar fluxo' : 'Visualizar'}
          </ItemMenu>
          <ItemMenu icone="editar" onClick={() => { setMenu(false); actions.onEdit(item) }}>Editar</ItemMenu>
          <ItemMenu icone="renomear" onClick={() => { setMenu(false); actions.onRename(item) }}>Renomear</ItemMenu>
          <ItemMenu icone={item.decision ? 'decidido' : 'decisao'}
            onClick={() => { setMenu(false); actions.onEditDecision(item) }}>
            {item.decision ? 'Editar decisão' : 'Criar decisão'}
          </ItemMenu>

          <div className="px-3 py-2 border-t border-gray-800 mt-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">Estado</span>
            <Switch ligado={active} cor={color}
              onMudar={v => actions.onIdentity(item, { active: v })}
              rotulo={active ? 'Ativa' : 'Inativa'}
              titulo={active ? 'Desativar: sai das consultas dos agentes' : 'Ativar'} />
          </div>
          {vocab && (
            <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
              <div className="text-xs text-gray-500 mb-1">Origem</div>
              <div className="flex gap-1">
                {Object.entries(vocab.origins).map(([id, o]) => (
                  <button key={id} onClick={() => actions.onIdentity(item, { origin: id })}
                    title={o.desc}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1 rounded border ${
                      (item.origin || vocab.defaultOrigin) === id
                        ? 'bg-gray-700 border-gray-600 text-gray-100'
                        : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'}`}>
                    <OrigemIcone origem={id} size={12} />{o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === 'memory' && vocab && (
            <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
              <div className="text-xs text-gray-500 mb-1">Tipo</div>
              <select value={item.type || vocab.defaultType}
                onChange={e => actions.onIdentity(item, { type: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
                {Object.entries(vocab.types).map(([id, t]) => (
                  <option key={id} value={id}>{t.label}</option>
                ))}
              </select>
              {tipo && <p className="text-[10px] text-gray-600 mt-1 leading-snug">{tipo.desc}<br />
                <span className="text-gray-500">no prompt: {tipo.prompt}</span></p>}

            </div>
          )}

          <div className="px-3 py-1.5 border-t border-gray-800 mt-1">
            <div className="text-xs text-gray-500 mb-1">Tags</div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-200">
                    #{t}
                    <button onClick={() => actions.onIdentity(item, { tags: tags.filter(x => x !== t) })}
                      className="hover:text-red-400 leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
            <input value={tagInput}
              onChange={e => setTagInput(e.target.value.replace(/[^a-zA-Z0-9_\- ]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="nova tag + Enter"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>

          <div className="px-3 py-1.5">
            <div className="text-xs text-gray-500 mb-1">Cor</div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => actions.onIdentity(item, { color: c })}
                  className="w-4 h-4 rounded-full border border-black/40"
                  style={{ background: c, outline: c === color ? '2px solid #fff' : 'none' }} />
              ))}
            </div>
          </div>
          <ItemMenu icone="pdf" onClick={() => { setMenu(false); window.open(api.pdfRecursoUrl(kind, item.name), '_blank') }}>
            Exportar PDF
          </ItemMenu>
          <ItemMenu icone="identificador" onClick={() => copiarRef()}>
            {copiado ? 'copiado!' : 'Copiar identificador'}
          </ItemMenu>
          <div className="px-3 py-1.5">
            <div className="text-xs text-gray-500 mb-1">Ícone</div>
            <SeletorIcone compacto atual={icon} cor={color}
              onEscolher={nm => actions.onIdentity(item, { icon: nm })} />
          </div>

          {actions.onTemplate && (
            <div className="border-t border-gray-700 mt-1">
              <ItemMenu icone="inserir"
                onClick={() => { setMenu(false); actions.onTemplate!(item) }}>
                Guardar como template
              </ItemMenu>
            </div>
          )}

          <div className="border-t border-gray-700 mt-1">
            <ItemMenu icone="excluir" tom="perigo"
              onClick={() => { setMenu(false); actions.onDelete(item) }}>Excluir arquivo</ItemMenu>
          </div>
        </div>
      )}
    </div>
  )
}
