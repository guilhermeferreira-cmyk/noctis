import { useEffect, useState } from 'react'
import { api, type FichaDoAgente, type ArquetipoView, type ContextoDoArquetipo } from '../api'
import { doSistema, TIPO_META } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { EsqueletoLinhas } from './Esqueleto'
import { desde } from './Ordenar'
import { MarkdownView } from './Markdown'
import { abrirRecursoNaDoca } from '../lib/doca'

/**
 * A tela do agente — as duas metades, sempre separadas.
 *
 * Um agente tem duas naturezas, e o erro que esta tela existe para evitar é
 * confundi-las: o que ele É (herdado do arquétipo, e mudar afeta todo projeto
 * onde ele está) e o que ele FAZ AQUI (papel, squad, memória acoplada, XP).
 *
 * Por isso elas nunca dividem o mesmo bloco. Se isso borrar visualmente, a
 * pessoa edita o arquétipo achando que mexe só neste projeto — que é o
 * acidente que a separação inteira existe para impedir.
 *
 * Dois modos, uma tela só. Duas telas separadas virariam duas verdades.
 */

/** "hoje" e "ontem" já são frases; o resto ("3d", "2m") pede o "há". */
function tempo(iso: string): string {
  const d = desde(iso)
  return d === 'hoje' || d === 'ontem' ? d : `há ${d}`
}

function Secao({ titulo, dica, children, acao }: {
  titulo: string; dica?: string; acao?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-[12.5px] text-gray-300">{titulo}</h3>
        {dica && <span className="text-[11px] text-gray-600">{dica}</span>}
        <span className="flex-1" />
        {acao}
      </div>
      {children}
    </section>
  )
}

function Disco({ p, cor }: { p: FichaDoAgente['progresso']; cor: string }) {
  const frac = Math.max(0, Math.min(1, p.progresso ?? 0))
  const r = 26, c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: 68, height: 68 }}>
        <svg width="68" height="68" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r={r} fill="none" stroke="#27272a" strokeWidth="5" />
          <circle cx="34" cy="34" r={r} fill="none" stroke={cor} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`}
            transform="rotate(-90 34 34)" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[17px] text-gray-100 tabular-nums">
          {p.nivel}
        </span>
      </div>
      <div className="min-w-0 text-[11.5px] text-gray-500 leading-relaxed">
        <div><span className="text-gray-300 tabular-nums">{Math.round(p.xp)}</span> XP ·
          {' '}<span className="text-gray-300 tabular-nums">{p.eventos}</span> trabalhos registrados</div>
        <div>faltam <span className="text-gray-400 tabular-nums">
          {Math.max(0, Math.round((p.proximo_nivel ?? 0) - p.xp))}</span> XP para o nível {p.nivel + 1}</div>
        <div className="text-gray-600">neste projeto — nível não atravessa projeto</div>
      </div>
    </div>
  )
}

/**
 * Uma memória que o agente carrega — e que se abre para leitura ali mesmo.
 *
 * Listar o nome e o tipo diz QUE existe contexto, não QUAL é. E conferir o
 * contexto de um agente é justamente ler o que ele leva para dentro do prompt.
 * Por isso a linha abre no lugar, sem trocar o que está aberto na doca: quem
 * está conferindo um agente não quer perder o agente para ler uma memória.
 *
 * O botão "abrir" continua levando à gaveta inteira, que é onde se edita.
 */
function Memoria({ m }: { m: FichaDoAgente['contexto'][number] }) {
  const t = TIPO_META[m.tipo] || null
  const [aberta, setAberta] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const alternar = () => {
    const vai = !aberta
    setAberta(vai)
    if (vai && texto === null && m.existe) {
      api.getMemory(m.nome)
        .then(r => setTexto(r.content || ''))
        .catch((e: Error) => setErro(e.message))
    }
  }

  return (
    <div className="rounded-lg border border-white/[0.07] caixa-vidro bg-[#151515] overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button onClick={alternar} disabled={!m.existe}
          className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
          title={m.existe ? (aberta ? 'Fechar' : 'Ler esta memória') : 'o arquivo não existe'}>
          <span className={`text-[9px] shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}
                            ${m.existe ? 'text-gray-600' : 'text-transparent'}`}>▶</span>
          {!m.existe && <span className="text-[10px] text-red-400 shrink-0">⚠</span>}
          <span className="text-[12px] text-gray-200 truncate">{m.nome}</span>
        </button>
        {t && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            style={{ color: t.color, background: t.color + '1f' }}>{t.label}</span>
        )}
        <button onClick={() => abrirRecursoNaDoca('memory', m.nome)}
          title="Abrir a memória inteira, para editar"
          className="text-[10px] text-gray-600 hover:text-gray-300 shrink-0">abrir</button>
      </div>
      {aberta && (
        <div className="border-t border-white/[0.06] px-2.5 py-2 max-h-72 overflow-y-auto bg-black/20">
          {erro ? <p className="text-[11px] text-red-400">{erro}</p>
            : texto === null ? <EsqueletoLinhas linhas={3} className="opacity-40" />
            : texto.trim() ? <MarkdownView text={texto} />
            : <p className="text-[11.5px] text-gray-600">(vazia)</p>}
        </div>
      )}
    </div>
  )
}

// ── Modo cru: o arquétipo e onde ele trabalha ───────────────────────────────

function TabelaDeContextos({ linhas, onAbrir }: {
  linhas: ContextoDoArquetipo[]; onAbrir?: (projeto: string) => void
}) {
  if (!linhas.length) {
    return <p className="text-[12px] text-gray-600">Este arquétipo não está acoplado a nenhum projeto.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-xs">
        <thead className="bg-[#141414] text-gray-500">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Projeto</th>
            <th className="px-3 py-2 font-medium">Papel</th>
            <th className="px-3 py-2 font-medium">Nível</th>
            <th className="px-3 py-2 font-medium">XP</th>
            <th className="px-3 py-2 font-medium">Learnings</th>
            <th className="px-3 py-2 font-medium">Memórias</th>
            <th className="px-3 py-2 font-medium">Último trabalho</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.projeto} className="border-t border-gray-800 hover:bg-white/[0.02]">
              <td className="px-3 py-2.5">
                <button onClick={() => onAbrir?.(l.projeto)}
                  className="text-gray-200 hover:text-white text-left">{l.projetoNome}</button>
                {l.temPromptLocal && (
                  <span className="ml-2 text-[9px] uppercase tracking-wider text-gray-600"
                    title="Este projeto acrescenta instruções próprias ao prompt">+local</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-gray-400">
                {l.papel || '—'}{l.squad ? ` · ${l.squad}` : ''}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-gray-300">{l.nivel}</td>
              <td className="px-3 py-2.5 tabular-nums text-gray-400">{Math.round(l.xp)}</td>
              <td className="px-3 py-2.5 tabular-nums text-gray-400">{l.learnings}</td>
              <td className="px-3 py-2.5 tabular-nums text-gray-400">{l.memorias}</td>
              {/* "nunca" é a linha mais útil desta tabela: agente acoplado que
                  jamais trabalhou ali é um acoplamento a desfazer. */}
              {/* `desde` devolve "hoje"/"ontem" ou "3d" — prefixar "há" em
                  todos dava "há hoje". O prefixo só cabe na forma abreviada. */}
              <td className="px-3 py-2.5 text-gray-500">
                {l.ultima ? tempo(l.ultima) : <span className="text-amber-500/70">nunca</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FichaDoArquetipo({ slug, onAbrirProjeto }: {
  slug: string; onAbrirProjeto?: (projeto: string) => void
}) {
  const [d, setD] = useState<ArquetipoView | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    setD(null); setErro('')
    api.arquetipo(slug).then(setD).catch((e: Error) => setErro(e.message))
  }, [slug])

  if (erro) return <p className="text-[12px] text-red-400 p-5">{erro}</p>
  if (!d) return <EsqueletoLinhas linhas={5} className="p-5 opacity-40" />

  const a = d.arquetipo as Record<string, string>
  const cor = doSistema('papel.agente', 'GiRobotGolem', '#10b981').color

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      <div className="flex items-start gap-3">
        <span style={{ color: cor }}>{(() => { const I = getIcon('GiRobotGolem'); return <I size={22} /> })()}</span>
        <div className="min-w-0">
          <h2 className="text-[17px] text-gray-100">{a.name || slug}</h2>
          <p className="text-[11.5px] text-gray-500">
            arquétipo · {d.contextos.length} projeto{d.contextos.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <Secao titulo="Identidade"
        dica={d.contextos.length > 1 ? `editar aqui muda em ${d.contextos.length} projetos` : undefined}>
        <div className="rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5 space-y-2.5">
          {a.description && <p className="text-[12px] text-gray-400">{a.description}</p>}
          <div className="flex gap-4 text-[11px] text-gray-600">
            <span>temperatura <span className="text-gray-400">{String(a.temperature ?? '—')}</span></span>
            <span>saída <span className="text-gray-400">{a.output_format || '—'}</span></span>
          </div>
          <pre className="text-[11px] text-gray-500 whitespace-pre-wrap max-h-56 overflow-y-auto
                          bg-black/25 rounded-lg p-2.5 leading-relaxed">{a.system_prompt}</pre>
        </div>
      </Secao>

      <Secao titulo="Onde trabalha" dica="uma linha por projeto — nunca um número somado">
        <TabelaDeContextos linhas={d.contextos} onAbrir={onAbrirProjeto} />
      </Secao>
    </div>
  )
}

// ── Modo acoplado: dentro de um projeto ─────────────────────────────────────

/** A ficha, carregada uma vez e compartilhada pelas guias da doca. */
export function useFichaDoAgente(nome: string) {
  const [f, setF] = useState<FichaDoAgente | null>(null)
  const [erro, setErro] = useState('')
  const recarregar = () => api.fichaAgente(nome).then(setF).catch((e: Error) => setErro(e.message))
  useEffect(() => {
    setF(null); setErro('')
    // Nome vazio é o jeito de quem chama dizer "este item não é um agente" —
    // a doca abre memória e mapa pelo mesmo componente. Buscar assim mesmo
    // encheria o console de 404 a cada card aberto.
    if (!nome) return
    api.fichaAgente(nome).then(setF).catch((e: Error) => setErro(e.message))
  }, [nome])
  return { f, erro, recarregar }
}

export function FichaDoAgenteAcoplado({ nome, onEditar, onVerArquetipo }: {
  nome: string
  onEditar?: () => void
  onVerArquetipo?: (slug: string) => void
}) {
  const { f, erro } = useFichaDoAgente(nome)
  const [abrirIdentidade, setAbrirIdentidade] = useState(false)

  if (erro) return <p className="text-[12px] text-red-400 p-5">{erro}</p>
  if (!f) return <EsqueletoLinhas linhas={6} className="p-5 opacity-40" />

  const herdado = f.herdado as Record<string, string>
  const daqui = f.daqui as Record<string, string>
  const local = !f.arquetipo
  const corp = doSistema('papel.' + (daqui.papel || 'agente'), 'GiRobotGolem', '#10b981').color
  const nAfeta = 1 + f.tambem_em.length

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      <div className="flex items-start gap-3">
        <span style={{ color: corp }}>{(() => { const I = getIcon('GiRobotGolem'); return <I size={22} /> })()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] text-gray-100">{herdado.name || daqui.name || nome}</h2>
          {/* O nickname vem logo abaixo do título porque é por ele que se
              chama este agente em conversa — "o Vega entregou". O que está ao
              lado, em fonte de código, é o identificador: o endereço, que é o
              que o `xp.py` confere. Os dois juntos, e nunca trocados. */}
          <p className="text-[13px] text-gray-300 -mt-0.5">
            {f.nickname}
            <code className="ml-2 text-[10.5px] text-gray-600">{f.identificador}</code>
          </p>
          <p className="text-[11.5px] text-gray-500">
            {local
              ? 'local deste projeto'
              : <>herdado de <button onClick={() => onVerArquetipo?.(f.arquetipo!)}
                    className="text-gray-300 hover:text-white underline decoration-dotted">{f.arquetipo}</button>
                  {f.tambem_em.length > 0 && ` · também em ${f.tambem_em.join(', ')}`}</>}
          </p>
        </div>
        {onEditar && (
          <button onClick={onEditar}
            className="shrink-0 text-[11.5px] px-2.5 py-1 rounded-lg border border-gray-800 text-gray-400 hover:text-gray-100">
            editar
          </button>
        )}
      </div>

      {f.arquetipo_ausente && (
        <p className="text-[12px] text-red-400 border border-red-900/60 bg-red-950/30 rounded-lg px-3 py-2">
          O arquétipo <code>{f.arquetipo_ausente}</code> não existe mais. Este agente está sem
          identidade até que ele volte ou o acoplamento seja desfeito.
        </p>
      )}

      {/* ── O que ele É. Recolhido, e marcado como herdado. ───────────────── */}
      {!local && (
        <Secao titulo="Identidade" dica="herdada do arquétipo"
          acao={
            <button onClick={() => setAbrirIdentidade(v => !v)}
              className="text-[11px] text-gray-500 hover:text-gray-300">
              {abrirIdentidade ? 'recolher' : 'ver'}
            </button>
          }>
          <div className="rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5">
            <p className="text-[12px] text-gray-400">{herdado.description}</p>
            {nAfeta > 1 && (
              <p className="text-[11px] text-amber-500/70 mt-1.5">
                editar a identidade muda este agente em {nAfeta} projetos
              </p>
            )}
            {abrirIdentidade && (
              <pre className="mt-2.5 text-[11px] text-gray-500 whitespace-pre-wrap max-h-72 overflow-y-auto
                              bg-black/25 rounded-lg p-2.5 leading-relaxed">{herdado.system_prompt}</pre>
            )}
          </div>
        </Secao>
      )}

      {/* ── O que ele faz AQUI ───────────────────────────────────────────── */}
      <Secao titulo="Aqui neste projeto" dica="papel, squad e quem ele reporta">
        <div className="rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
          {[['papel', daqui.papel], ['squad', daqui.squad], ['reporta a', daqui.reporta_a]].map(([r, v]) => (
            <span key={r} className="text-gray-600">
              {r} <span className="text-gray-200">{v || '—'}</span>
            </span>
          ))}
        </div>
        {daqui.prompt_local && (
          <pre className="mt-2 text-[11px] text-gray-400 whitespace-pre-wrap bg-black/25 rounded-lg p-2.5
                          border border-white/[0.07] leading-relaxed">{daqui.prompt_local}</pre>
        )}
      </Secao>

      <Secao titulo="Contexto acoplado"
        dica={`${f.contexto.length} memória${f.contexto.length !== 1 ? 's' : ''} que ele carrega neste projeto`}>
        {f.contexto.length === 0
          ? <p className="text-[12px] text-gray-600">Nenhuma memória acoplada.</p>
          : <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
              {f.contexto.map(m => <Memoria key={m.nome} m={m} />)}
            </div>}
      </Secao>

      <Secao titulo="XP e nível" dica="deste projeto">
        <div className="rounded-xl border border-white/[0.07] caixa-vidro bg-[#151515] p-3.5">
          <Disco p={f.progresso} cor={corp} />
        </div>
      </Secao>

      <Secao titulo="Learnings" dica={`${f.learnings.length} vinculado${f.learnings.length !== 1 ? 's' : ''} a ele`}>
        {f.learnings.length === 0
          ? <p className="text-[12px] text-gray-600">Nenhum Learning vinculado ainda.</p>
          : <div className="space-y-1.5">
              {f.learnings.map(l => {
                const c = doSistema(`estado.${l.estado}`, 'GiSkills',
                  l.estado === 'firmada' ? '#10b981' : '#a1a1aa').color
                return (
                  <div key={l.chave}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.07] caixa-vidro bg-[#151515]">
                    <span className="text-[12px] text-gray-200 truncate flex-1">{l.rotulo}</span>
                    {!l.descricao && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-500/70">sem descrição</span>
                    )}
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                      style={{ color: c, background: c + '1f' }}>{l.estado}</span>
                  </div>
                )
              })}
            </div>}
      </Secao>
    </div>
  )
}

// ── As guias do agente, para a doca ─────────────────────────────────────────
//
// A doca é estreita e alta. Empilhar identidade, papel, memórias, XP e
// Learnings num scroll só — que é o que ela fazia — obriga a rolar para
// descobrir o que existe. Em guias, a lista de guias JÁ É o índice: bate o
// olho e se sabe o que o agente tem, antes de ler qualquer coisa.
//
// A contagem no rótulo faz parte disso: "Contexto 6" diz que há o que ver ali
// sem precisar abrir.

export type GuiaDoAgente = { id: string; rotulo: string; n?: number }

export function guiasDoAgente(f: FichaDoAgente | null): GuiaDoAgente[] {
  if (!f) return []
  const g: GuiaDoAgente[] = []
  if (f.arquetipo) g.push({ id: 'identidade', rotulo: 'Identidade' })
  g.push({ id: 'aqui', rotulo: f.arquetipo ? 'Aqui' : 'O agente' })
  g.push({ id: 'contexto', rotulo: 'Contexto', n: f.contexto.length })
  g.push({ id: 'xp', rotulo: 'XP' })
  g.push({ id: 'learnings', rotulo: 'Learnings', n: f.learnings.length })
  return g
}

export function ConteudoDaGuia({ guia, f, cor, onVerArquetipo }: {
  guia: string
  f: FichaDoAgente
  cor: string
  onVerArquetipo?: (slug: string) => void
}) {
  const herdado = f.herdado as Record<string, string>
  const daqui = f.daqui as Record<string, string>
  const nAfeta = 1 + f.tambem_em.length

  if (guia === 'identidade') {
    return (
      <div className="p-3.5 space-y-2.5">
        <p className="text-[11.5px] text-gray-500">
          herdada de{' '}
          <button onClick={() => onVerArquetipo?.(f.arquetipo!)}
            className="text-gray-300 hover:text-white underline decoration-dotted">{f.arquetipo}</button>
        </p>
        {nAfeta > 1 && (
          <p className="text-[11px] text-amber-500/70">
            editar aqui muda este agente em {nAfeta} projetos
          </p>
        )}
        <p className="text-[12px] text-gray-400">{herdado.description}</p>
        <pre className="text-[11px] text-gray-500 whitespace-pre-wrap bg-black/25 rounded-lg p-2.5
                        leading-relaxed">{herdado.system_prompt}</pre>
      </div>
    )
  }

  if (guia === 'aqui') {
    const campos = f.arquetipo
      ? [['papel', daqui.papel], ['squad', daqui.squad], ['reporta a', daqui.reporta_a]]
      : [['papel', daqui.papel], ['squad', daqui.squad], ['reporta a', daqui.reporta_a],
         ['temperatura', String(daqui.temperature ?? '')], ['saída', daqui.output_format]]
    return (
      <div className="p-3.5 space-y-3">
        {!f.arquetipo && (
          <p className="text-[11.5px] text-gray-600">
            local deste projeto — não herda de arquétipo nenhum
          </p>
        )}
        <div className="space-y-1.5">
          {campos.map(([r, v]) => (
            <div key={r} className="flex items-baseline gap-2 text-[12px]">
              <span className="text-gray-600 w-[5.5rem] shrink-0">{r}</span>
              <span className="text-gray-200 truncate">{v || '—'}</span>
            </div>
          ))}
        </div>
        {daqui.prompt_local && (
          <div>
            <p className="text-[11px] text-gray-600 mb-1">acrescenta ao prompt</p>
            <pre className="text-[11px] text-gray-400 whitespace-pre-wrap bg-black/25 rounded-lg p-2.5
                            leading-relaxed">{daqui.prompt_local}</pre>
          </div>
        )}
        {!f.arquetipo && daqui.system_prompt && (
          <pre className="text-[11px] text-gray-500 whitespace-pre-wrap bg-black/25 rounded-lg p-2.5
                          leading-relaxed">{daqui.system_prompt}</pre>
        )}
      </div>
    )
  }

  if (guia === 'contexto') {
    return (
      <div className="p-3.5 space-y-1.5">
        <p className="text-[11.5px] text-gray-600 mb-1">
          as memórias que ele carrega neste projeto
        </p>
        {f.contexto.length === 0
          ? <p className="text-[12px] text-gray-600">Nenhuma memória acoplada.</p>
          : f.contexto.map(m => <Memoria key={m.nome} m={m} />)}
      </div>
    )
  }

  if (guia === 'xp') {
    return <div className="p-3.5"><Disco p={f.progresso} cor={cor} /></div>
  }

  if (guia === 'learnings') {
    return (
      <div className="p-3.5 space-y-1.5">
        {f.learnings.length === 0
          ? <p className="text-[12px] text-gray-600">Nenhum Learning vinculado ainda.</p>
          : f.learnings.map(l => {
              const c = doSistema(`estado.${l.estado}`, 'GiSkills',
                l.estado === 'firmada' ? '#10b981' : '#a1a1aa').color
              return (
                <div key={l.chave}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.07] caixa-vidro bg-[#151515]">
                  <span className="text-[12px] text-gray-200 truncate flex-1">{l.rotulo}</span>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: c, background: c + '1f' }}>{l.estado}</span>
                </div>
              )
            })}
      </div>
    )
  }
  return null
}
