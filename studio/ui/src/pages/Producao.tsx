import { useCallback, useEffect, useState } from 'react'
import { api, ESTADOS_TASK, ESTADOS_ARTIFACT, type ResourceKind } from '../api'
import { ResourceGrid } from '../components/ResourceGrid'
import { KIND_META } from '../lib/kinds'
import { aviso } from '../lib/dialogos'

/**
 * Tarefas e Peças — as duas coisas que o Noctis não sabia nomear.
 *
 * **Tarefa** é o trabalho em voo. Ele não era observável em lugar nenhum: o
 * mais próximo era o campo `despacho` dentro de um evento JÁ OCORRIDO, o que
 * responde "o que foi feito" e nunca "o que está sendo feito". Quem precisava
 * disso — o Maestro do Overhaul, o Braço Direito — mantinha tabela em Markdown.
 *
 * **Peça** é a coisa produzida, com estado e versão. A pasta `outputs/` existia
 * e era um depósito: sem estado, sem versão, sem de onde veio.
 *
 * Os dois conjuntos de estado NÃO se misturam, e confundi-los seria bug —
 * aprovar a produção de uma peça não valida a aposta que ela contém. Por isso
 * são duas listas, e não uma com nomes diferentes.
 *
 * A tela em si é fina de propósito: a grade, o card, os filtros, a ordenação, a
 * doca e a identidade vêm do motor. O que esta página acrescenta é o editor —
 * e ele é um formulário, não um campo de texto livre, porque estado que se
 * digita à mão é estado que diverge.
 */

const CAMPOS: Record<string, { label: string; dica?: string }> = {
  titulo:   { label: 'Título', dica: 'o que precisa ser feito, numa frase' },
  resumo:   { label: 'Resumo', dica: 'o contexto que quem pegar precisa saber' },
  agente:   { label: 'Agente', dica: 'quem executa — vazio é tarefa sem dono' },
  despacho: { label: 'Despacho', dica: 'o nome que amarra a tarefa à entrega' },
}

const rotulo = 'text-[10px] uppercase tracking-wider text-gray-600'
const campo = `mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-[13px]
               text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600`

function Estado({ valor, opcoes, cor, onMudar }: {
  valor: string; opcoes: readonly string[]; cor: string; onMudar: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(e => {
        const on = e === valor
        return (
          <button key={e} onClick={() => onMudar(e)}
            className={`text-[11.5px] px-2.5 py-1 rounded-full border transition-colors ${
              on ? 'text-gray-100' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
            style={on ? { background: cor + '22', borderColor: cor + '66' } : undefined}>
            {e}
          </button>
        )
      })}
    </div>
  )
}

function EditorTarefa({ dados, onMudar }: {
  dados: Record<string, unknown>; onMudar: (d: Record<string, unknown>) => void
}) {
  const cor = KIND_META.task.color
  const set = (k: string, v: unknown) => onMudar({ ...dados, [k]: v })
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <label className={rotulo}>{CAMPOS.titulo.label}</label>
        <input value={String(dados.titulo || '')} onChange={e => set('titulo', e.target.value)}
          placeholder={CAMPOS.titulo.dica} className={campo} />
      </div>
      <div>
        <label className={rotulo}>Estado</label>
        <div className="mt-1.5">
          <Estado valor={String(dados.estado || ESTADOS_TASK[0])} opcoes={ESTADOS_TASK}
            cor={cor} onMudar={v => set('estado', v)} />
        </div>
      </div>
      <div>
        <label className={rotulo}>{CAMPOS.resumo.label}</label>
        <textarea value={String(dados.resumo || '')} onChange={e => set('resumo', e.target.value)}
          placeholder={CAMPOS.resumo.dica} rows={4} className={campo} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['agente', 'despacho'] as const).map(k => (
          <div key={k}>
            <label className={rotulo}>{CAMPOS[k].label}</label>
            <input value={String(dados[k] || '')} onChange={e => set(k, e.target.value)}
              placeholder={CAMPOS[k].dica} className={campo} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A peça é um `.md` com front-matter, e não um registro num índice à parte.
 * O arquivo continua legível fora do Noctis — é o mesmo princípio que faz um
 * projeto ser uma pasta — e não há uma segunda verdade para sair de sincronia
 * no dia em que alguém editar por fora.
 */
function EditorPeca({ texto, onMudar }: { texto: string; onMudar: (t: string) => void }) {
  const cor = KIND_META.artifact.color
  const { meta, corpo } = partirFrontMatter(texto)
  const set = (k: string, v: string) => onMudar(montar({ ...meta, [k]: v }, corpo))
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <label className={rotulo}>Estado da peça</label>
        <div className="mt-1.5">
          <Estado valor={String(meta.estado || ESTADOS_ARTIFACT[0])} opcoes={ESTADOS_ARTIFACT}
            cor={cor} onMudar={v => set('estado', v)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo}>Versão</label>
          <input value={String(meta.versao || '1')} onChange={e => set('versao', e.target.value)}
            className={campo} />
        </div>
        <div>
          <label className={rotulo}>Tarefa de origem</label>
          <input value={String(meta.task || '')} onChange={e => set('task', e.target.value)}
            placeholder="de qual tarefa esta peça nasceu" className={campo} />
        </div>
      </div>
      <div>
        <label className={rotulo}>Conteúdo</label>
        <textarea value={corpo} onChange={e => onMudar(montar(meta, e.target.value))}
          rows={18} spellCheck={false}
          className={`${campo} font-mono text-[12.5px] leading-relaxed`} />
      </div>
    </div>
  )
}

/** Um front-matter mínimo: `chave: valor` por linha. Sem dependência de YAML no
 *  navegador — o servidor é quem lê isto para valer, e ele usa yaml de verdade. */
function partirFrontMatter(texto: string): { meta: Record<string, string>; corpo: string } {
  if (!texto.startsWith('---')) return { meta: {}, corpo: texto }
  const fim = texto.indexOf('\n---', 3)
  if (fim < 0) return { meta: {}, corpo: texto }
  const meta: Record<string, string> = {}
  for (const linha of texto.slice(3, fim).split('\n')) {
    const i = linha.indexOf(':')
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
  }
  return { meta, corpo: texto.slice(fim + 4).replace(/^\n+/, '') }
}

function montar(meta: Record<string, string>, corpo: string): string {
  const linhas = Object.entries(meta)
    .filter(([, v]) => String(v).trim())
    .map(([k, v]) => `${k}: ${v}`)
  return linhas.length ? `---\n${linhas.join('\n')}\n---\n\n${corpo}` : corpo
}

export default function ProducaoPage({ kind }: { kind: 'task' | 'artifact' }) {
  const meta = KIND_META[kind as ResourceKind]
  const [vista, setVista] = useState<'grid' | 'editor'>('grid')
  const [gridKey, setGridKey] = useState(0)
  const [nome, setNome] = useState('')
  const [novo, setNovo] = useState(false)
  const [dados, setDados] = useState<Record<string, unknown>>({})
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const abrir = useCallback(async (n: string) => {
    setNome(n); setNovo(false); setVista('editor')
    try {
      const r = await api.lerRecurso(kind, n)
      setDados(r.dados || {}); setTexto(r.content || '')
    } catch (e) { aviso.erro(e) }
  }, [kind])

  const comecar = useCallback(() => {
    setNome(''); setNovo(true); setVista('editor')
    setDados({ titulo: '', estado: ESTADOS_TASK[0] })
    setTexto(`---\nestado: ${ESTADOS_ARTIFACT[0]}\nversao: 1\n---\n\n`)
  }, [])

  // Esc volta para a grade: entrar num editor e não achar a saída foi o defeito
  // que a doca resolveu no resto do sistema.
  useEffect(() => {
    if (vista !== 'editor') return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setVista('grid') }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [vista])

  async function salvar() {
    const n = (nome || String(dados.titulo || '') || 'sem_nome').trim()
    if (!n) { aviso.erro(new Error('dê um nome antes de salvar')); return }
    setSalvando(true)
    try {
      await api.gravarRecurso(kind, n, kind === 'task' ? { dados } : { content: texto })
      setNome(n); setNovo(false); setGridKey(k => k + 1)
      aviso.ok(`${meta.label} "${n}" salva.`)
    } catch (e) { aviso.erro(e) } finally { setSalvando(false) }
  }

  if (vista === 'grid') {
    return (
      <ResourceGrid key={gridKey} kind={kind as ResourceKind} reloadKey={gridKey}
        subtitle={kind === 'task' ? 'O trabalho em voo — o que está sendo feito agora'
                                  : 'O que foi produzido, com estado e versão'}
        onEdit={abrir} onNew={comecar} />
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <button onClick={() => setVista('grid')}
          className="text-[12px] text-gray-500 hover:text-gray-100">← {meta.label}s</button>
        {novo ? (
          <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
            placeholder="nome do arquivo"
            className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1 text-[12.5px]
                       text-gray-200 focus:outline-none focus:border-blue-500 placeholder:text-gray-600" />
        ) : (
          <code className="text-[12px] text-gray-400">{nome}{meta.ext}</code>
        )}
        <span className="flex-1" />
        <button onClick={salvar} disabled={salvando}
          className="text-[12px] px-3 py-1.5 rounded-lg border border-white/20 bg-white/[0.09]
                     text-gray-100 hover:bg-white/[0.14] disabled:opacity-40">
          {salvando ? 'salvando…' : 'salvar'}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {kind === 'task'
          ? <EditorTarefa dados={dados} onMudar={setDados} />
          : <EditorPeca texto={texto} onMudar={setTexto} />}
      </div>
    </div>
  )
}
