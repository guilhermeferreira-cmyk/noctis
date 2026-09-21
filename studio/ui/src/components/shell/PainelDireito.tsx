import { preferencias } from '../../lib/preferencias'
import { useState } from 'react'
import { api, type ResourceKind } from '../../api'
import { KIND_META } from '../../lib/kinds'
import { getIcon } from '../../memoryIcons'
import { copiar, textoDaReferencia } from '../../lib/referencia'
import { FichaDeProgresso } from '../Progresso'
import { Nocturn } from '../Nocturn'
import { LogoNoctis } from '../LogoNoctis'
import { TInfo, TFechar } from './Tracos'
import { Drawer } from '../Drawer'
import { DrawerSkill } from '../DrawerSkill'
import { useDoca, focarNaDoca, fecharNaDoca, avisarMudanca, type AbaFixa, type ItemDoca } from '../../lib/doca'

/**
 * O painel da direita: o que está aberto, e quem vigia tudo.
 *
 * No Obsidian é aqui que moram os plugins. No Noctis moram duas coisas: o
 * CONTEXTO do item aberto na aba ativa (o que ele é, como citá-lo, a ficha se
 * for agente) e o NOCTURN, que saiu do canto flutuante para um lugar fixo — um
 * supervisor que tapa o conteúdo não é bom supervisor.
 */

export type Contexto =
  | { tipo: 'recurso'; kind: ResourceKind; nome: string; titulo: string }
  | { tipo: 'skill'; chave: string; titulo: string }
  | { tipo: 'mapa'; mapa: string; titulo: string }
  | { tipo: 'pagina'; titulo: string }
  | null

function PainelContexto({ ctx }: { ctx: Contexto }) {
  const [copiado, setCopiado] = useState(false)

  if (!ctx || ctx.tipo === 'pagina') {
    return (
      <div className="p-4 text-[12px] text-gray-500 leading-relaxed">
        <p className="text-gray-400 mb-1">{ctx?.titulo || 'Nada aberto'}</p>
        Abra um agente, uma memória ou uma habilidade na árvore da esquerda — o que ele é e
        como citá-lo aparecem aqui.
      </div>
    )
  }

  const ref = ctx.tipo === 'recurso'
    ? textoDaReferencia({ tipo: 'recurso', kind: ctx.kind, nome: ctx.nome })
    : ctx.tipo === 'skill' ? `skill:${ctx.chave}` : `mapa:${ctx.mapa} · ${ctx.titulo}`
  const meta = ctx.tipo === 'recurso' ? KIND_META[ctx.kind] : null
  const Icone = meta ? getIcon(meta.icon) : null

  return (
    <div className="p-3 space-y-4 text-[12px]">
      <div className="flex items-start gap-2.5">
        {Icone && meta && (
          <span className="shrink-0 w-8 h-8 rounded-md grid place-items-center"
            style={{ background: meta.color + '22', color: meta.color }}>
            <Icone size={18} />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-gray-100 font-medium leading-tight">{ctx.titulo}</div>
          <div className="text-[10px] tracking-wider text-gray-500 mt-0.5">
            {meta ? meta.label.toUpperCase() : ctx.tipo === 'skill' ? 'HABILIDADE' : 'MAPA'}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Identificador</div>
        <button onClick={async () => { setCopiado(await copiar(ref)); setTimeout(() => setCopiado(false), 1400) }}
          title="Copiar para colar numa conversa com o agente"
          className="w-full text-left font-mono text-[11px] text-gray-300 bg-black/40 border border-white/[0.06]
                     rounded-md px-2 py-1.5 hover:border-violet-500/50 break-all">
          {copiado ? 'copiado!' : ref}
        </button>
      </div>

      {ctx.tipo === 'recurso' && (
        <a href={api.pdfRecursoUrl(ctx.kind, ctx.nome)} target="_blank" rel="noreferrer"
          className="inline-block text-[11px] text-gray-400 hover:text-gray-100 underline decoration-dotted">
          exportar PDF
        </a>
      )}

      {ctx.tipo === 'recurso' && ctx.kind === 'agent' && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Progresso</div>
          <FichaDeProgresso agente={ctx.nome} cor={KIND_META.agent.color} />
        </div>
      )}
    </div>
  )
}

function DetalheMapa({ it }: { it: Extract<ItemDoca, { tipo: 'mapa' }> }) {
  const [copiado, setCopiado] = useState(false)
  const ref = `mapa:${it.mapa} · ${it.nome}`
  return (
    <div className="p-4 space-y-4 text-[12px]">
      <div>
        <div className="text-[10px] tracking-wider mb-0.5" style={{ color: it.cor }}>MAPA</div>
        <div className="text-[15px] text-gray-100 font-semibold">{it.nome}</div>
        <div className="text-gray-500 mt-1">{it.cards} cards · {it.lanes} lanes</div>
      </div>
      <button onClick={it.abrir}
        className="text-xs px-3 py-1.5 rounded-md bg-violet-600/80 hover:bg-violet-500 text-white">abrir o mapa</button>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Identificador</div>
        <button onClick={async () => { setCopiado(await copiar(ref)); setTimeout(() => setCopiado(false), 1400) }}
          className="w-full text-left font-mono text-[11px] text-gray-300 bg-black/40 border border-white/[0.06] rounded-md px-2 py-1.5 hover:border-violet-500/50 break-all">
          {copiado ? 'copiado!' : ref}
        </button>
      </div>
    </div>
  )
}

export function PainelDireito({ ctx }: { ctx: Contexto }) {
  const doca = useDoca()
  // Sem nada escolhido ainda, vale a preferência (Contexto ou NOCTURN).
  const ativa = doca.ativa || preferencias().painelDireitoInicial

  const trocar = (a: AbaFixa) => {
    focarNaDoca(a)
    try { localStorage.setItem('noctis.painelDireito', a) } catch { /* sem storage */ }
  }
  const fixa = (a: AbaFixa, titulo: string, icone: React.ReactNode) => (
    <button onClick={() => trocar(a)} title={titulo}
      className={`shrink-0 p-1.5 rounded-md ${ativa === a ? 'bg-white/[0.08] text-gray-100' : 'text-gray-500 hover:text-gray-200 opacity-80 hover:opacity-100'}`}>
      {icone}
    </button>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Botões da doca: contexto, supervisor e o detalhe do que foi selecionado */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1.5 border-b border-white/[0.06] shrink-0 overflow-x-auto">
        {fixa('contexto', 'Contexto do que está aberto', <TInfo size={15} />)}
        {fixa('nocturn', 'NOCTURN — supervisor', <LogoNoctis size={15} />)}
        {fixa('detalhe', doca.itens[0] ? `Detalhe — ${doca.itens[0].nome}` : 'Detalhe do que for selecionado',
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>)}
      </div>
      <div className="flex-1 min-h-0 relative">
        <div hidden={ativa !== 'contexto'} className="absolute inset-0 overflow-y-auto"><PainelContexto ctx={ctx} /></div>
        <div hidden={ativa !== 'nocturn'} className="absolute inset-0 overflow-y-auto"><Nocturn embutido /></div>
        {/* O detalhe fica montado: trocar de botão não perde edição */}
        {ativa === 'detalhe' && !doca.itens.length && (
          <div className="p-4 text-[12px] text-gray-500 leading-relaxed">
            Selecione um card na grade, no mapa ou no repertório: o detalhe dele aparece aqui.
          </div>
        )}
        {doca.itens.map(it => (
          <div key={it.id} hidden={ativa !== 'detalhe'} className="absolute inset-0 overflow-y-auto">
            {it.tipo === 'mapa' ? <DetalheMapa it={it} /> : it.tipo === 'recurso'
              ? <Drawer embutido target={{ kind: it.kind, name: it.nome }}
                  onClose={() => fecharNaDoca(it.id)} onChanged={() => avisarMudanca(it.id)} />
              : <DrawerSkill embutido chave={it.chave}
                  onFechar={() => fecharNaDoca(it.id)} onMudou={() => avisarMudanca(it.id)} />}
          </div>
        ))}
      </div>
    </div>
  )
}
