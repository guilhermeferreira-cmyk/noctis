import { useState } from 'react'
import { api, type SetupBrief } from '../api'

export default function SetupPage({ onImported }: { onImported: (slug: string) => void }) {
  // Briefing
  const [brief, setBrief] = useState<SetupBrief>({
    name: '', description: '', audience: '', goals: '', tone: '', stack: '',
    num_agents: 4, num_flows: 3, num_personas: 4, extras: '',
  })
  const set = (k: keyof SetupBrief) => (v: string | number) =>
    setBrief(b => ({ ...b, [k]: v }))

  // Prompt gerado
  const [prompt, setPrompt]   = useState('')
  const [genState, setGen]    = useState<'idle' | 'loading' | 'error'>('idle')
  const [genErr, setGenErr]   = useState('')
  const [copied, setCopied]   = useState(false)

  // Import
  const [paste, setPaste]     = useState('')
  const [overwrite, setOver]  = useState(false)
  const [impState, setImp]    = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [impMsg, setImpMsg]   = useState('')

  const generate = async () => {
    if (!brief.name.trim()) { setGen('error'); setGenErr('Informe o nome do projeto'); return }
    setGen('loading'); setGenErr(''); setCopied(false)
    try {
      const { prompt } = await api.generateSetupPrompt(brief)
      setPrompt(prompt); setGen('idle')
    } catch (e) {
      setGen('error'); setGenErr((e as Error).message)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const doImport = async () => {
    let data: unknown
    try {
      const text = paste.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
      data = JSON.parse(text)
    } catch {
      setImp('error'); setImpMsg('A resposta colada não é um JSON válido. Cole o JSON completo gerado pelo agente.')
      return
    }
    setImp('loading'); setImpMsg('')
    try {
      const res = await api.importSetup(data, overwrite)
      const c = res.counts
      setImp('ok')
      setImpMsg(`Projeto "${res.displayName}" criado: ${c.agents || 0} agentes, ${c.flows || 0} fluxos, ${c.personas || 0} personas, ${c.memory || 0} memórias.`)
      onImported(res.slug)
    } catch (e) {
      setImp('error'); setImpMsg((e as Error).message)
    }
  }

  const field = 'w-full bg-[#1a1a1a] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-gray-600'
  const label = 'text-xs font-semibold text-gray-400 mb-1 block'

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-gray-100 text-xl font-bold flex items-center gap-2">✨ Gerar Setup de Projeto</h2>
          <p className="text-gray-500 text-sm mt-1 leading-relaxed">
            Descreva o projeto, gere um prompt e entregue a qualquer agente externo (Claude, ChatGPT, etc.).
            Ele devolve um JSON com agentes, fluxos, personas e memória, que você cola de volta aqui para criar o projeto automaticamente.
          </p>
        </div>

        {/* Passo 1 — Briefing */}
        <section className="space-y-4">
          <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">1</span>
            Briefing do projeto
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={label}>Nome do projeto *</label>
              <input className={field} value={brief.name} placeholder="Ex: Loja Verde, e-commerce sustentável"
                onChange={e => set('name')(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={label}>Descrição (o que é o projeto)</label>
              <textarea className={field + ' resize-none h-20'} value={brief.description}
                placeholder="O que o projeto faz, qual o produto ou serviço..."
                onChange={e => set('description')(e.target.value)} />
            </div>
            <div>
              <label className={label}>Público-alvo</label>
              <textarea className={field + ' resize-none h-16'} value={brief.audience}
                placeholder="Quem são os clientes / usuários"
                onChange={e => set('audience')(e.target.value)} />
            </div>
            <div>
              <label className={label}>Objetivos</label>
              <textarea className={field + ' resize-none h-16'} value={brief.goals}
                placeholder="Metas do projeto, o que precisa entregar"
                onChange={e => set('goals')(e.target.value)} />
            </div>
            <div>
              <label className={label}>Tom de voz / marca</label>
              <input className={field} value={brief.tone}
                placeholder="Ex: próximo, direto, técnico"
                onChange={e => set('tone')(e.target.value)} />
            </div>
            <div>
              <label className={label}>Stack técnica (se aplicável)</label>
              <input className={field} value={brief.stack}
                placeholder="Ex: Next.js, Python, Postgres"
                onChange={e => set('stack')(e.target.value)} />
            </div>
            <div className="col-span-2 grid grid-cols-3 gap-4">
              {([['num_agents', 'Nº de agentes'], ['num_flows', 'Nº de fluxos'], ['num_personas', 'Nº de personas']] as const).map(([k, lbl]) => (
                <div key={k}>
                  <label className={label}>{lbl}</label>
                  <input type="number" min={1} max={12} className={field}
                    value={brief[k] as number}
                    onChange={e => set(k)(parseInt(e.target.value) || 1)} />
                </div>
              ))}
            </div>
            <div className="col-span-2">
              <label className={label}>Notas adicionais</label>
              <textarea className={field + ' resize-none h-16'} value={brief.extras}
                placeholder="Qualquer detalhe extra que o agente deva considerar"
                onChange={e => set('extras')(e.target.value)} />
            </div>
          </div>
          <button onClick={generate} disabled={genState === 'loading'}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
            {genState === 'loading' ? 'Gerando…' : '✨ Gerar prompt'}
          </button>
          {genState === 'error' && <p className="text-sm text-red-400">{genErr}</p>}
        </section>

        {/* Passo 2 — Prompt */}
        {prompt && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">2</span>
                Copie e entregue ao agente externo
              </h3>
              <button onClick={copy}
                className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${copied ? 'bg-green-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}`}>
                {copied ? '✓ Copiado' : 'Copiar prompt'}
              </button>
            </div>
            <textarea readOnly value={prompt}
              className="w-full h-64 bg-[#111111] border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-400 resize-y focus:outline-none leading-relaxed" />
            <p className="text-xs text-gray-600">
              Cole esse prompt no seu agente externo. Ele responderá com um JSON, copie a resposta inteira e cole abaixo.
            </p>
          </section>
        )}

        {/* Passo 3 — Import */}
        {prompt && (
          <section className="space-y-3 pb-8">
            <h3 className="text-gray-300 font-semibold text-sm flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">3</span>
              Cole a resposta do agente e crie o projeto
            </h3>
            <textarea value={paste} onChange={e => { setPaste(e.target.value); setImp('idle') }}
              placeholder='Cole aqui o JSON retornado pelo agente externo: { "project": {...}, "agents": [...], ... }'
              className="w-full h-48 bg-[#111111] border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 resize-y focus:outline-none focus:border-blue-500 leading-relaxed placeholder:text-gray-700" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={overwrite} onChange={e => setOver(e.target.checked)}
                  className="accent-blue-600" />
                Sobrescrever se o projeto já existir
              </label>
              <button onClick={doImport} disabled={impState === 'loading' || !paste.trim()}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                {impState === 'loading' ? 'Importando…' : '📥 Importar e criar projeto'}
              </button>
            </div>
            {impState === 'ok'    && <p className="text-sm text-green-400">✓ {impMsg}</p>}
            {impState === 'error' && <p className="text-sm text-red-400">{impMsg}</p>}
          </section>
        )}
      </div>
    </div>
  )
}
