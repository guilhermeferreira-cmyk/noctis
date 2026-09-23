import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api, assetUrl, fileToBase64,
  type ResourceKind, type Attachment,
} from '../api'
import { KIND_META, DRAWER_W_KEY, EXT_ICON, H_SIZE, humanSize, type DrawerTarget } from '../lib/kinds'
import { EsqueletoLinhas } from './Esqueleto'
import { MarkdownView } from './Markdown'
export { MarkdownView }
import { Guias } from './Guias'
import { useFichaDoAgente, guiasDoAgente, ConteudoDaGuia } from './FichaAgente'

function ConfigView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="p-4 space-y-3 text-sm overflow-auto h-full">
      {Object.entries(data).map(([k, v]) => {
        if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return null
        return (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">{k.replace(/_/g, ' ')}</div>
            {Array.isArray(v)
              ? <ul className="list-disc pl-5 text-gray-300 space-y-0.5">{v.map((it, i) => <li key={i}>{String(it)}</li>)}</ul>
              : <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{String(v)}</p>}
          </div>
        )
      })}
    </div>
  )
}

function AttachmentsPanel({ items, busy, onAdd, onRemove, onOpen }: {
  items: Attachment[]
  busy: boolean
  onAdd: (files: FileList | null) => void
  onRemove: (a: Attachment) => void
  onOpen: (a: Attachment) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onAdd(e.dataTransfer.files) }}
      className={`shrink-0 border-b px-4 py-2.5 ${over ? 'border-blue-500 bg-blue-950/20' : 'border-gray-800'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
          Anexos {items.length > 0 && <span className="text-gray-400">({items.length})</span>}
        </span>
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="ml-auto text-[11px] bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 px-2 py-1 rounded-md">
          {busy ? 'Enviando…' : '+ Anexar'}
        </button>
        <input ref={inputRef} type="file" multiple hidden
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.bmp,.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.json,.yaml,.yml"
          onChange={e => { onAdd(e.target.files); e.target.value = '' }} />
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-gray-600 italic">
          Arraste arquivos aqui: imagem, PDF ou documento. Até 25 MB cada.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map(a => (
            <div key={a.filename} className="group/at relative shrink-0 w-[74px]" title={`${a.filename} · ${humanSize(a.size)}`}>
              <button onClick={() => onOpen(a)}
                className="block w-[74px] h-[74px] rounded-lg border border-gray-800 bg-[#0f0f0f] overflow-hidden hover:border-gray-600">
                {a.isImage
                  ? <img src={assetUrl(a.url)} alt={a.filename} loading="lazy" className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-2xl">{EXT_ICON[a.ext] || '📎'}</span>}
              </button>
              <div className="mt-1 text-[9.5px] text-gray-500 truncate">{a.filename}</div>
              <button onClick={() => onRemove(a)} title="Remover anexo"
                className="absolute -top-1.5 -right-1.5 opacity-0 group-hover/at:opacity-100 w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs leading-none">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentViewer({ item, onClose }: { item: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const src = assetUrl(item.url)

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex flex-col p-6" onClick={onClose}>
      <div className="flex items-center gap-3 mb-3 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-sm text-gray-200 font-mono truncate">{item.filename}</span>
        <span className="text-[11px] text-gray-500">{humanSize(item.size)}</span>
        <a href={src} download={item.filename} className="ml-auto text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg">Baixar</a>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg">Abrir em aba</a>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-1">✕</button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {item.isImage
          ? <img src={src} alt={item.filename} className="max-w-full max-h-full object-contain rounded-lg" />
          : item.ext === '.pdf'
            ? <iframe src={src} title={item.filename} className="w-full h-full rounded-lg bg-white" />
            : <div className="text-center text-gray-400 text-sm">
                <div className="text-5xl mb-3">{EXT_ICON[item.ext] || '📎'}</div>
                Este formato não abre aqui. Use <span className="text-gray-200">Baixar</span>.
              </div>}
      </div>
    </div>
  )
}

export function Drawer({ target, onClose, onChanged, embutido = false }: {
  target: DrawerTarget; onClose: () => void; onChanged: () => void
  /** Dentro de uma aba: ocupa o espaço todo, sem flutuar nem alça de largura. */
  embutido?: boolean
}) {
  const { kind, name } = target
  const [content, setContent] = useState('')
  const [config, setConfig]   = useState<Record<string, unknown> | null>(null)
  const [editing, setEditing] = useState(false)
  const [state, setState]     = useState<'idle' | 'loading' | 'saving' | 'saved'>('loading')
  const [raw, setRaw]         = useState(false)
  const [anexos, setAnexos]   = useState<Attachment[]>([])
  const [enviando, setEnviando] = useState(false)
  const [vendo, setVendo]     = useState<Attachment | null>(null)
  const [erro, setErro]       = useState('')

  // O agente não usa `config`: ele tem ficha, e a ficha vem resolvida contra o
  // arquétipo. Ler o YAML cru aqui mostraria um acoplamento sem cabeça.
  const { f: ficha } = useFichaDoAgente(kind === 'agent' ? name : '')
  const guias = guiasDoAgente(ficha)
  const [guia, setGuia] = useState('')
  const guiaAtiva = guias.some(g => g.id === guia) ? guia : (guias[0]?.id || '')

  // A largura fica no localStorage: quem alarga uma vez não quer refazer isso
  // a cada memória aberta.
  const [width, setWidth] = useState(() => Number(localStorage.getItem(DRAWER_W_KEY)) || 620)
  const dragging = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const w = Math.min(1100, Math.max(380, window.innerWidth - e.clientX))
      setWidth(w)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      localStorage.setItem(DRAWER_W_KEY, String(width))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [width])

  const recarregarAnexos = useCallback(() => {
    if (kind !== 'memory') return
    api.listAttachments(name).then(setAnexos).catch(() => setAnexos([]))
  }, [kind, name])

  useEffect(() => {
    setState('loading'); setEditing(false); setConfig(null); setAnexos([]); setErro('')
    if (kind === 'memory') {
      api.getMemory(name).then(r => { setContent(r.content); setState('idle') })
      recarregarAnexos()
    }
    else if (kind === 'agent')   api.getAgent(name).then(c => { setConfig(c as Record<string, unknown>); setState('idle') })
    else if (kind === 'persona') api.getPersona(name).then(c => { setConfig(c as Record<string, unknown>); setState('idle') })
  }, [kind, name, recarregarAnexos])

  const save = async () => {
    setState('saving'); await api.saveMemory(name, content)
    setState('saved'); setEditing(false); setTimeout(() => setState('idle'), 1500); onChanged()
  }

  const anexar = async (files: FileList | null) => {
    if (!files || !files.length) return
    setEnviando(true); setErro('')
    try {
      for (const f of Array.from(files)) {
        const b64 = await fileToBase64(f)
        await api.uploadAttachment(name, f.name, b64)
      }
      recarregarAnexos()
      onChanged()          // o card precisa atualizar contagem e capa
    } catch (e) {
      setErro(e instanceof Error ? e.message.replace(/^POST [^:]+: /, '') : 'Falha ao anexar')
    } finally { setEnviando(false) }
  }

  const remover = async (a: Attachment) => {
    if (!confirm(`Remover o anexo "${a.filename}"?`)) return
    await api.deleteAttachment(name, a.filename)
    if (vendo?.filename === a.filename) setVendo(null)
    recarregarAnexos(); onChanged()
  }

  const meta = KIND_META[kind]

  return (
    <div className={embutido
        ? 'relative h-full w-full flex flex-col bg-transparent'
        : 'absolute top-0 right-0 h-full bg-[#121212] border-l border-gray-800 shadow-2xl flex flex-col z-30'}
      style={embutido ? undefined : { width }}>
      {/* Alça de redimensionamento na borda esquerda. */}
      {!embutido && <div
        onMouseDown={() => { dragging.current = true; document.body.style.cursor = 'col-resize' }}
        title="Arraste para redimensionar"
        className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 cursor-col-resize hover:bg-blue-600/60 z-10" />}

      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="text-xs" style={{ color: meta.color }}>{meta.label}</div>
          <div className="text-sm font-mono text-gray-200 truncate">{name}{meta.ext}</div>
          {/* O nickname do agente aplicado, logo abaixo do título. É por ele que
              se chama este agente; o identificador ao lado é o endereço. */}
          {kind === 'agent' && ficha && (
            <div className="text-[12px] text-gray-300 truncate">
              {ficha.nickname}
              <code className="ml-1.5 text-[10px] text-gray-600">{ficha.identificador}</code>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {kind === 'memory' && !editing && (
            <button onClick={() => setRaw(r => !r)} title="Alternar entre texto formatado e markdown cru"
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg">
              {raw ? 'Formatado' : 'Markdown'}
            </button>
          )}
          {kind === 'memory' && (!editing
            ? <button onClick={() => setEditing(true)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg">Editar</button>
            : <button onClick={save} disabled={state === 'saving'} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                {state === 'saving' ? 'Salvando…' : state === 'saved' ? '✓ Salvo' : 'Salvar'}
              </button>)}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg leading-none px-1">✕</button>
        </div>
      </div>

      {kind === 'memory' && (
        <AttachmentsPanel items={anexos} busy={enviando}
          onAdd={anexar} onRemove={remover} onOpen={setVendo} />
      )}
      {erro && <div className="px-4 py-2 text-[11px] text-red-400 bg-red-950/30 border-b border-red-900/50 shrink-0">{erro}</div>}

      {/* O agente tem guias; os outros tipos seguem num corpo só, por ora. */}
      {kind === 'agent' && <Guias guias={guias} ativa={guiaAtiva} onTrocar={setGuia} cor={meta.color} />}

      <div className="flex-1 overflow-hidden">
        {kind === 'agent'
          ? (!ficha
              ? <div className="p-4"><EsqueletoLinhas linhas={6} /></div>
              : <div className="h-full overflow-y-auto">
                  <ConteudoDaGuia guia={guiaAtiva} f={ficha} cor={meta.color}
                    onVerArquetipo={() => { /* o modo cru mora na aba Agentes */ }} />
                </div>)
          : state === 'loading'
            ? <div className="p-4"><EsqueletoLinhas linhas={6} /></div>
            : kind === 'memory'
              ? (editing
                  ? <textarea value={content} onChange={e => setContent(e.target.value)}
                      className="w-full h-full p-4 bg-transparent font-mono text-sm text-gray-300 resize-none focus:outline-none leading-relaxed" spellCheck={false} />
                  : raw
                    ? <pre className="w-full h-full p-4 overflow-auto whitespace-pre-wrap font-mono text-[12.5px] text-gray-300 leading-relaxed">{content || '(vazio)'}</pre>
                    : <div className="w-full h-full overflow-auto px-5 py-4">
                        {content ? <MarkdownView text={content} /> : <span className="text-gray-600 text-sm">(vazio)</span>}
                      </div>)
              : config ? <ConfigView data={config} /> : null}
      </div>

      {kind === 'memory'
        ? <div className="px-4 py-2 border-t border-gray-800 text-[11px] text-gray-600 shrink-0 flex gap-3">
            <span>{content.split('\n').length} linhas</span>
            <span>{anexos.length} {anexos.length === 1 ? 'anexo' : 'anexos'}</span>
          </div>
        : kind === 'agent'
          ? <div className="px-4 py-2 border-t border-gray-800 text-[11px] text-gray-600 shrink-0">
              {ficha?.arquetipo
                ? <>identidade herdada de <span className="text-gray-400">{ficha.arquetipo}</span></>
                : 'agente local deste projeto'}
            </div>
          : <div className="px-4 py-2 border-t border-gray-800 text-[11px] text-gray-600 shrink-0">Edição completa na aba {meta.label === 'Agente' ? 'Agentes' : 'Personas'}.</div>}

      {vendo && <AttachmentViewer item={vendo} onClose={() => setVendo(null)} />}
    </div>
  )
}
