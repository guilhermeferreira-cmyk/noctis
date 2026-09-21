import { useCallback, useEffect, useState } from 'react'
import { api, getProject, type SkillDetalhe, type Observacao, type Hipotese, type Aprendizado,
         type PerguntaEnquadramento } from '../api'
import { Disco } from './Progresso'
import { getIcon } from '../memoryIcons'
import { Switch } from './Switch'
import { MarkdownView } from './Drawer'

/**
 * A habilidade inteira, aberta.
 *
 * O card responde "o que é e quem tem"; aqui está a história: todos os
 * aprendizados escritos, os documentos, e os eventos que construíram o nível de
 * cada um. É a diferença entre saber que alguém está no nível 3 e saber fazendo
 * o que ele chegou lá.
 *
 * A descrição é editável por você — e o selo diz quem a escreveu. Texto de
 * agente pode ser melhorado por outro agente; texto que você editou fica curado
 * e nenhum agente passa por cima.
 */
/** O estado de aprendizado de um domínio: o que se sabe, o que se supõe, o que se viu.
 *
 * A ordem na tela é essa, e ela é uma afirmação: o que foi validado por você
 * vem primeiro, porque é o que vale; a hipótese vem depois, marcada como
 * suposição; a observação fica por último, como matéria-prima. Inverter isso
 * faria o palpite do agente parecer conhecimento.
 */
function PainelDominio({ chave, cor, onMudou }: {
  chave: string; cor: string; onMudou: () => void
}) {
  const [dados, setDados] = useState<{ observacoes: Observacao[]; hipoteses: Hipotese[]
                                       aprendizados: Aprendizado[] }>()
  const [ensinando, setEnsinando] = useState(false)
  const [texto, setTexto] = useState('')

  const recarregar = useCallback(() => { api.aprendizadoDe(chave).then(setDados) }, [chave])
  useEffect(() => { recarregar() }, [recarregar])

  const ensinar = async () => {
    if (!texto.trim()) return
    try {
      await api.ensinar(chave, texto.trim())
      setTexto(''); setEnsinando(false); recarregar(); onMudou()
    } catch (e) { alert((e as Error).message) }
  }

  if (!dados) return <p className="text-[11px] text-gray-600">lendo…</p>

  const vivos = dados.aprendizados.filter(a => !a.aposentado)
  const pendentes = dados.hipoteses.filter(h => h.pendente && !h.invalida)

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center gap-2 mb-1.5">
          <h4 className="text-[11px] uppercase tracking-wider text-gray-500 flex-1">
            O que se sabe {vivos.length > 0 && <span className="text-gray-600">{vivos.length}</span>}
          </h4>
          <button onClick={() => setEnsinando(v => !v)}
            title="Ensinar direto, sem esperar hipótese de agente nenhum"
            className="text-[10px] text-gray-500 hover:text-gray-100">+ ensinar</button>
        </div>
        {/* Você escrevendo direto: conhecimento explícito seu tem precedência
            sobre inferência do sistema, então não precisa esperar palpite. */}
        {ensinando && (
          <div className="space-y-1.5 mb-2">
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} autoFocus
              placeholder="O que vale neste assunto — em uma frase que sirva na próxima vez."
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11.5px] text-gray-200 focus:outline-none focus:border-blue-500 resize-none" />
            <div className="flex gap-1.5">
              <button onClick={ensinar} disabled={!texto.trim()}
                className="text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-2.5 py-1 rounded">
                gravar
              </button>
              <button onClick={() => { setEnsinando(false); setTexto('') }}
                className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">cancelar</button>
            </div>
          </div>
        )}
        {vivos.length === 0 ? (
          <p className="text-[11px] text-gray-600 leading-snug">
            Nada validado ainda neste domínio. O que você confirmar nas perguntas do NOCTURN
            aparece aqui — ou escreva direto em “ensinar”.
          </p>
        ) : vivos.map(a => (
          <div key={a.id} className="group/ap border-l-2 pl-2.5 py-1" style={{ borderColor: cor }}>
            <p className="text-xs text-gray-200 leading-snug">{a.texto}</p>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
              <span>{a.escopo}</span>
              <span>·</span>
              <span>{a.usos.length} uso{a.usos.length !== 1 ? 's' : ''}</span>
              {a.fragil && (
                <span className="text-amber-500/80" title="confiança abaixo do limiar — pede mais evidência">
                  frágil
                </span>
              )}
              {!a.de_hipotese && <span>· seu</span>}
              <div className="flex-1" />
              <button onClick={async () => {
                  if (!window.confirm('Aposentar? Para de viajar nos despachos e fica no histórico.')) return
                  await api.aposentarAprendizado(a.id); recarregar(); onMudou()
                }}
                className="opacity-0 group-hover/ap:opacity-100 hover:text-amber-300">aposentar</button>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">
          O que se supõe {pendentes.length > 0 && (
            <span className="text-amber-400">{pendentes.length} esperando você</span>
          )}
        </h4>
        {dados.hipoteses.length === 0 ? (
          <p className="text-[11px] text-gray-600 leading-snug">
            Nenhuma hipótese. Os agentes propõem depois de observar; você responde na aba
            Aprender do NOCTURN.
          </p>
        ) : dados.hipoteses.map(h => (
          <div key={h.id} className="border-l-2 border-gray-800 pl-2.5 py-1">
            <p className="text-xs text-gray-300 leading-snug">{h.texto}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {Math.round(h.confianca * 100)}% · {h.agente || 'sem autor'} ·{' '}
              {h.invalida ? 'pergunta inválida'
                : h.corrigida ? 'você corrigiu'
                : h.refutacoes ? 'refutada'
                : h.confirmacoes ? 'confirmada'
                : 'esperando resposta'}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">
          O que se viu {dados.observacoes.length > 0 && (
            <span className="text-gray-600">{dados.observacoes.length}</span>
          )}
        </h4>
        {dados.observacoes.length === 0 ? (
          <p className="text-[11px] text-gray-600 leading-snug">
            Nenhuma observação. Os agentes registram com{' '}
            <code className="text-gray-500">--observei</code> enquanto trabalham.
          </p>
        ) : dados.observacoes.slice(0, 20).map(o => (
          <div key={o.id} className="border-l-2 border-gray-800/60 pl-2.5 py-0.5">
            <p className="text-[11px] text-gray-400 leading-snug">{o.texto}</p>
            <p className="text-[10px] text-gray-700 mt-0.5">
              {o.agente} · {(o.quando || '').slice(0, 10)}
              {o.contexto ? ` · ${o.contexto}` : ''}
            </p>
          </div>
        ))}
      </section>
    </div>
  )
}

/** A próxima pergunta desta habilidade, respondível aqui mesmo.
 *
 * A Inbox do NOCTURN é a fila de tudo; aqui é o contrário — você abriu ESTA
 * habilidade e quer terminar de dizer o que ela é sem procurá-la numa lista.
 * Só escolha, como na Inbox: campo aberto virou o documento em markdown.
 */
function ProximaPergunta({ chave, onRespondido }: { chave: string; onRespondido: () => void }) {
  const [p, setP] = useState<PerguntaEnquadramento | null>(null)
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const reler = useCallback(() => {
    api.enquadramento()
      .then(r => { setP(r.perguntas.find(x => x.skill === chave) || null); setMarcadas([]) })
      .catch(() => setP(null))
  }, [chave])
  useEffect(() => { reler() }, [reler])

  if (!p) return null
  const multi = p.pergunta.tipo === 'multi'

  const gravar = async (escolhas: string[]) => {
    setSalvando(true)
    try { await api.enquadrar(chave, p.campo, escolhas); reler(); onRespondido() }
    catch (e) { alert((e as Error).message) } finally { setSalvando(false) }
  }

  const clicar = (o: string) => {
    if (o === 'nenhuma delas') return gravar([])
    if (!multi) return gravar([o])
    setMarcadas(m => m.includes(o) ? m.filter(x => x !== o) : [...m, o])
  }

  return (
    <div className="px-4 py-3 border-b border-gray-800 bg-violet-500/[0.06] space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-violet-300/70">
        descobrindo · {p.titulo}
        {p.restantes ? <span className="text-gray-600"> · {p.restantes} de {p.total}</span> : null}
      </div>
      <div className="text-[12.5px] text-gray-100 leading-snug">{p.pergunta.texto}</div>
      <div className="space-y-1">
        {p.pergunta.opcoes.map(o => {
          const on = marcadas.includes(o)
          const nenhuma = o === 'nenhuma delas'
          return (
            <button key={o} disabled={salvando} onClick={() => clicar(o)}
              className={`w-full text-left text-[11.5px] px-2.5 py-1.5 rounded-md border leading-snug ${
                on ? 'border-violet-500/60 bg-violet-500/15 text-violet-100'
                   : nenhuma ? 'border-transparent text-gray-500 hover:text-gray-300'
                   : 'border-white/[0.08] text-gray-200 hover:bg-white/[0.06] hover:border-violet-500/40'}`}>
              {!nenhuma && <span className="text-gray-500 mr-1.5">{multi ? (on ? '☑' : '☐') : '○'}</span>}
              {o}
            </button>
          )
        })}
      </div>
      {multi && (
        <button disabled={salvando || !marcadas.length} onClick={() => gravar(marcadas)}
          className="text-[11px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-2.5 py-1 rounded">
          pronto{marcadas.length ? ` · ${marcadas.length}` : ''}
        </button>
      )}
    </div>
  )
}

export function DrawerSkill({ chave, onFechar, onMudou, embutido = false }: {
  chave: string; onFechar: () => void; onMudou: () => void
  /** Dentro de uma aba: ocupa o espaço todo. */
  embutido?: boolean
}) {
  const [d, setD] = useState<SkillDetalhe>()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [aba, setAba] = useState<'corpo' | 'dominio' | 'aprendizados' | 'eventos'>('corpo')
  const [editandoCorpo, setEditandoCorpo] = useState(false)
  const [corpo, setCorpo] = useState('')
  const [tagNova, setTagNova] = useState('')
  const [preverCorpo, setPreverCorpo] = useState(false)

  const carregar = useCallback(() => {
    api.skill(chave).then(x => { setD(x); setTexto(x.descricao || ''); setCorpo(x.corpo || '') })
  }, [chave])
  useEffect(() => { carregar() }, [carregar])

  if (!d) {
    return (
      <div className={embutido ? 'p-4 text-sm text-gray-600'
        : 'absolute top-0 right-0 h-full w-[26rem] bg-[#121212] border-l border-gray-800 z-30 p-4 text-sm text-gray-600'}>
        carregando…
      </div>
    )
  }

  // Quanto dela já foi dito. Não há mais "que tipo de habilidade é esta": toda
  // habilidade tem passos e sensibilidade, em proporções diferentes.
  const dito = d.enquadramento ? Object.keys(d.enquadramento).length : 0
  const descobrindo = dito < 5
  const cor = d.estado === 'arquivada' ? '#52525b'
    : descobrindo ? '#8b5cf6' : (d.cor || '#10b981')
  const Icone = getIcon('GiSkills')

  const salvar = async () => {
    await api.editarSkill(chave, { descricao: texto })
    setEditando(false); carregar(); onMudou()
  }
  const mudar = async (patch: Record<string, unknown>) => {
    // A API recusa tag de nome próprio e tag inventada por agente: o motivo
    // dela é a explicação boa, então mostramos em vez de engolir.
    try { await api.editarSkill(chave, patch); carregar(); onMudou() }
    catch (e) { alert((e as Error).message) }
  }

  return (
    <div className={embutido ? 'relative h-full w-full flex flex-col max-w-3xl mx-auto'
      : 'absolute top-0 right-0 h-full w-[28rem] max-w-[90vw] bg-[#121212] border-l border-gray-800 shadow-2xl flex flex-col z-30'}>
      <div className="px-4 py-3 border-b border-gray-800 flex items-start gap-3 shrink-0">
        <Disco numero={d.nivel_maximo || '—'} cor={cor} tamanho={36}
          apagado={d.estado !== 'firmada'} titulo="maior nível entre os agentes" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-100 leading-tight">{d.rotulo}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[11px]" style={{ color: cor }}>
              <Icone size={13} aria-hidden="true" />{descobrindo ? `descobrindo ${dito}/5` : 'habilidade'}
            </span>
            <span className="text-[10px] text-gray-600">
              {d.eventos} evento{d.eventos !== 1 ? 's' : ''} · {Math.round(d.xp)} XP
            </span>
          </div>
        </div>
        <button onClick={onFechar} className="text-gray-500 hover:text-gray-200 text-lg leading-none px-1">✕</button>
      </div>

      {/* Ações que mudam o destino da habilidade, e não o conteúdo dela. */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0 text-[11px]">
        {getProject() !== 'noctis' ? (
          <button onClick={async () => { await api.promoverSkill(chave); carregar(); onMudou()
              alert('Subiu para a base. Todo projeto passa a encontrá-la ao consultar.') }}
            className="px-2 py-1 rounded" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
            Promover à base
          </button>
        ) : d.origens && d.origens.length > 0 && (
          <span className="text-gray-500">veio de: {d.origens.join(', ')}</span>
        )}
        <span className="flex-1" />
        <button onClick={async () => {
            if (!window.confirm(`Destruir "${d.rotulo}"? Some a habilidade e o texto. Não há como desfazer.`)) return
            await api.destruirSkill(chave); onMudou(); onFechar()
          }}
          className="px-2 py-1 rounded text-red-400 hover:bg-red-500/10">
          Destruir
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 flex-1">Descrição</span>
            {d.descricao_por && (
              <span className="text-[10px] text-gray-600" title={d.curada
                ? 'editada por você — agente nenhum sobrescreve'
                : 'escrita por agente — outro agente pode melhorar'}>
                {d.curada ? '✎ ' : ''}{d.descricao_por}
              </span>
            )}
            {!editando && (
              <button onClick={() => setEditando(true)}
                className="text-[10px] text-gray-500 hover:text-gray-200">editar</button>
            )}
          </div>
          {editando ? (
            <div className="space-y-1.5">
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} autoFocus
                placeholder="o que ela é, em uma frase"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 resize-none" />
              <div className="flex gap-1.5">
                <button onClick={salvar} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded">Salvar</button>
                <button onClick={() => { setTexto(d.descricao || ''); setEditando(false) }}
                  className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">Cancelar</button>
              </div>
            </div>
          ) : (
            <p className={`text-xs leading-relaxed ${d.descricao ? 'text-gray-300' : 'text-gray-700 italic'}`}>
              {d.descricao || 'sem descrição — o que ela é, em uma frase'}
            </p>
          )}
        </div>

        <ProximaPergunta chave={chave} onRespondido={() => { carregar(); onMudou() }} />

        <div className="px-4 py-3 border-b border-gray-800 space-y-2.5">
          {/* Tags: agrupamento livre. O que já existe é sugerido, para não
              nascer sinônimo da mesma ideia. */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">Tags</div>
            <div className="flex items-center gap-1 flex-wrap">
              {(d.tags || []).map(tg => (
                <span key={tg} className="group/tg flex items-center gap-1 text-[11px] text-gray-300 bg-white/[0.06] rounded-full pl-2 pr-1 py-0.5">
                  {tg}
                  <button onClick={() => mudar({ tags: (d.tags || []).filter(x => x !== tg) })}
                    title="tirar" className="text-gray-500 hover:text-red-400 px-0.5">×</button>
                </span>
              ))}
              <input value={tagNova} onChange={e => setTagNova(e.target.value)} list="tags-doca"
                onKeyDown={async e => {
                  if (e.key === 'Enter' && tagNova.trim()) {
                    const v = tagNova.trim(); setTagNova('')
                    await mudar({ tags: [...(d.tags || []), v] })
                  }
                }}
                placeholder="+ tag"
                className="w-24 bg-gray-900 border border-gray-700 rounded-full px-2 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500" />
              <datalist id="tags-doca">
                {(d.tagsDoProjeto || []).map(t => <option key={t.tag} value={t.tag} />)}
              </datalist>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              {d.estado === 'firmada' ? 'Firmada no repertório' : d.estado === 'broto' ? 'Broto' : 'Arquivada'}
            </span>
            <Switch ligado={d.estado === 'firmada'} cor={cor}
              rotulo={d.estado === 'firmada' ? 'firmada' : 'broto'}
              titulo="Firmar: passa a contar cheio na aptidão"
              onMudar={v => mudar({ estado: v ? 'firmada' : 'broto' })} />
          </div>
        </div>

        {d.portadores.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Quem exercita</div>
            <div className="space-y-2">
              {d.portadores.map(p => (
                <div key={p.agente} className="flex items-center gap-2.5">
                  <Disco numero={p.nivel} progresso={p.progresso} cor={cor} tamanho={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-200 truncate">{p.agente}</div>
                    <div className="text-[10px] text-gray-600">
                      {p.eventos} evento{p.eventos !== 1 ? 's' : ''} · {Math.round(p.xp)} XP
                      {p.ultima ? ` · ${p.ultima.slice(0, 10)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex border-b border-gray-800 text-[11px] sticky top-0 bg-[#121212] z-10">
          {/* Toda habilidade aprende: a divisão entre "procedimento" e "assunto"
              caiu no dia em que ele disse "poderia ser os dois". */}
          {([['corpo', 'Documento'],
             ['dominio', 'Aprendizado'] as const,
             ['aprendizados', `Marcos (${d.marcos.length})`],
             ['eventos', `Trabalho (${d.eventosDetalhados.length})`]] as const).map(([id, rot]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`px-3.5 py-2 border-b-2 -mb-px ${aba === id ? 'text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              style={aba === id ? { borderColor: cor } : undefined}>
              {rot}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 space-y-2.5">
          {/* O corpo é o aprendizado longo: o caso, o que falhou, o contorno.
              Os agentes acrescentam trechos assinados; reescrever é curadoria. */}
          {aba === 'corpo' ? (
            editandoCorpo ? (
              /* Markdown inteiro, do jeito que você escreveu em qualquer editor:
                 colar um documento de 300 linhas aqui é caso de uso, não abuso.
                 Salvar marca o corpo como SEU — as respostas das perguntas param
                 de remontá-lo, e passam a entrar só quando você manda. */
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 flex-1">
                    markdown · {corpo.split('\n').length} linhas · {corpo.length} caracteres
                  </span>
                  <button onClick={() => setPreverCorpo(v => !v)}
                    className="text-[10px] text-gray-500 hover:text-gray-200">
                    {preverCorpo ? 'escrever' : 'prever'}
                  </button>
                  {dito > 0 && (
                    <button onClick={async () => {
                        const { markdown } = await api.enquadramentoMd(chave)
                        if (!markdown.trim()) return
                        setCorpo(c => (c.trim() ? c.replace(/\s*$/, '\n\n') : '') + markdown)
                      }}
                      title="Põe no texto as seções montadas a partir das suas respostas"
                      className="text-[10px] text-gray-500 hover:text-gray-200">
                      + inserir o que você respondeu
                    </button>
                  )}
                </div>
                {preverCorpo ? (
                  <div className="text-sm border border-gray-800 rounded p-3 min-h-[24rem]">
                    <MarkdownView text={corpo} />
                  </div>
                ) : (
                  <textarea value={corpo} onChange={e => setCorpo(e.target.value)} autoFocus
                    spellCheck={false}
                    onKeyDown={e => {
                      // Tab indenta em vez de sair do campo: documento longo tem lista.
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        const el = e.currentTarget
                        const i = el.selectionStart
                        setCorpo(c => c.slice(0, i) + '  ' + c.slice(el.selectionEnd))
                        requestAnimationFrame(() => el.setSelectionRange(i + 2, i + 2))
                      }
                    }}
                    placeholder={'# Título\n\nCole aqui o markdown inteiro — seções, listas, tabelas, código.\n\n## Quando usar\n\n...'}
                    className="w-full min-h-[30rem] bg-gray-900 border border-gray-700 rounded px-2.5 py-2 font-mono text-[11.5px] text-gray-300 focus:outline-none focus:border-blue-500 resize-y leading-relaxed" />
                )}
                <div className="flex items-center gap-1.5">
                  <button onClick={async () => {
                      await api.escreverCorpoSkill(chave, corpo)
                      setEditandoCorpo(false); setPreverCorpo(false); carregar(); onMudou()
                    }}
                    className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded">Salvar</button>
                  <button onClick={() => { setCorpo(d.corpo || ''); setEditandoCorpo(false); setPreverCorpo(false) }}
                    className="text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1">Cancelar</button>
                  <div className="flex-1" />
                  <span className="text-[10px] text-gray-600">o documento passa a ser seu</span>
                </div>
              </div>
            ) : d.corpo?.trim() ? (
              <div className="text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setEditandoCorpo(true)}
                    className="text-[10px] text-gray-500 hover:text-gray-200">editar documento</button>
                  <span className="text-[10px] text-gray-600">
                    {d.corpo_curado
                      ? 'escrito por você — as respostas não o reescrevem'
                      : 'montado a partir das suas respostas'}
                  </span>
                </div>
                <MarkdownView text={d.corpo} />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-gray-600 leading-snug">
                  Sem documento ainda. É aqui que mora o aprendizado longo — o caso, o que
                  falhou, o contorno. Os agentes acrescentam com
                  {' '}<code className="text-gray-500">--anotar</code>.
                </p>
                <button onClick={() => setEditandoCorpo(true)}
                  className="text-[11px] px-2.5 py-1 rounded" style={{ background: cor + '22', color: cor }}>
                  escrever agora
                </button>
              </div>
            )
          ) : aba === 'dominio' ? (
            <PainelDominio chave={chave} cor={cor} onMudou={onMudou} />
          ) : aba === 'aprendizados' ? (
            d.marcos.length === 0
              ? <p className="text-[11px] text-gray-600 leading-snug">
                  Ninguém escreveu o que aprendeu aqui ainda. Os agentes escrevem ao subir de
                  nível, com <code className="text-gray-500">--aprendi</code>.
                </p>
              : d.marcos.map((m, i) => (
                  <div key={i} className="border-l-2 pl-2.5 py-0.5" style={{ borderColor: cor + '66' }}>
                    <p className="text-xs text-gray-300 leading-snug">{m.texto}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {m.agente}{m.nivel ? ` · nv${m.nivel}` : ''} · {(m.quando || '').slice(0, 10)}
                    </p>
                  </div>
                ))
          ) : (
            d.eventosDetalhados.length === 0
              ? <p className="text-[11px] text-gray-600">Nenhum trabalho registrado com esta habilidade.</p>
              : d.eventosDetalhados.map(e => (
                  <div key={e.id} className="border-l-2 border-gray-800 pl-2.5 py-0.5">
                    <p className="text-xs text-gray-300 leading-snug">{e.resumo || e.despacho}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {e.agente} · {e.tipo} · {(e.quando || '').slice(0, 10)}
                      {e.arquivos.length > 0 && ` · ${e.arquivos.length} arquivo(s)`}
                    </p>
                  </div>
                ))
          )}
        </div>
      </div>
    </div>
  )
}
