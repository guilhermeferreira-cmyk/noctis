import { useCallback, useEffect, useState } from 'react'
import { api, type EstadoProjeto, type MudancaEstado } from '../api'
import { classePainel, doSistema } from '../lib/kinds'
import { getIcon } from '../memoryIcons'
import { CarregandoNoctis } from '../components/Esqueleto'
import { desde } from '../components/Ordenar'
import { aviso } from '../lib/dialogos'

/**
 * O estado declarado do projeto — e como ele chegou aqui.
 *
 * O estado de uma frente já existia, como prosa: um `.md` de seiscentas linhas
 * escrito à mão. Bom para uma pessoa ler, impossível para um gate ler — e foi
 * por isso que o gate do playbook nunca passou de uma frase no prompt.
 *
 * Esta tela mostra as duas metades lado a lado, e a segunda é a que importa:
 *
 *   · o **cabeçalho** — fase, gate, hipóteses, bloqueios. É o que a máquina lê.
 *   · o **rastro** — append-only, uma linha por campo que mudou, com quem
 *     mudou e de que peça a mudança saiu.
 *
 * **Agente propõe; você aplica.** Uma proposta de agente não move o arquivo:
 * ela fica aqui esperando seu veredito. Escrever e chamar de "proposto" faria
 * de proposto um rótulo numa mudança que já aconteceu — que é o defeito do
 * gate escrito no prompt, de novo.
 */

const CAMPOS = [
  { id: 'fase', label: 'Fase', dica: 'onde a frente está no playbook' },
  { id: 'gate', label: 'Gate', dica: 'o que precisa ser verdade para avançar' },
] as const

const LISTAS = [
  { id: 'hipoteses', label: 'Hipóteses', dica: 'o que você está apostando, e ainda não provou' },
  { id: 'bloqueios', label: 'Bloqueios', dica: 'o que impede avançar agora' },
] as const

const COR_VEREDITO: Record<string, string> = {
  proposto: '#f59e0b', aplicado: '#10b981', recusado: '#71717a',
}

/**
 * Uma proposta ainda espera veredito?
 *
 * O log é append-only, então a linha da proposta nunca muda — responder
 * acrescenta OUTRA linha. Quem tem de saber que ela já foi respondida é esta
 * tela; sem isto, uma proposta decidida continuaria oferecendo "aplicar" para
 * sempre, e o contador do topo mentiria.
 *
 * A lista vem da mais recente para a mais antiga, então a resposta de uma
 * proposta no índice `i` está em algum índice MENOR.
 */
function esperaVeredito(lista: MudancaEstado[], i: number): boolean {
  const m = lista[i]
  if (m.veredito !== 'proposto') return false
  return !lista.slice(0, i).some(x =>
    x.veredito !== 'proposto' && x.campo === m.campo
    && String(x.para ?? '') === String(m.para ?? ''))
}

function Linha({ m, pendente, indice, onResponder }: {
  m: MudancaEstado; pendente: boolean; indice: number
  onResponder: (i: number, v: 'aplicado' | 'recusado') => void
}) {
  // Proposta já respondida deixa de ser âmbar: ela não pede mais nada.
  const cor = (m.veredito === 'proposto' && !pendente) ? '#52525b' : (COR_VEREDITO[m.veredito] || '#71717a')
  return (
    <div className="px-3 py-2 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
        <span className="text-[11.5px] text-gray-300">{m.campo}</span>
        <span className="text-[11px] text-gray-600">
          {String(m.de ?? '') || '(vazio)'} → <span className="text-gray-300">{String(m.para ?? '')}</span>
        </span>
        <span className="flex-1" />
        <span className="text-[10.5px]" style={{ color: cor }}>{m.veredito}</span>
        <span className="text-[10.5px] text-gray-600" title={m.quando}>{desde(m.quando)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 pl-3.5 flex-wrap">
        <span className="text-[10.5px] text-gray-500">{m.ator}</span>
        {m.origem && (
          // A origem é a peça de onde a mudança saiu. Sem ela, o registro diria
          // que algo foi aplicado sem dizer com base em quê.
          <code className="text-[10px] text-gray-600 bg-white/[0.04] px-1.5 py-0.5 rounded">{m.origem}</code>
        )}
        {m.motivo && <span className="text-[10.5px] text-gray-600 truncate">{m.motivo}</span>}
        <span className="flex-1" />
        {pendente && (
          <span className="flex items-center gap-1.5">
            <button onClick={() => onResponder(indice, 'aplicado')}
              className="text-[10.5px] px-2 py-0.5 rounded-md border border-emerald-500/30
                         text-emerald-300 hover:bg-emerald-500/15">aplicar</button>
            <button onClick={() => onResponder(indice, 'recusado')}
              className="text-[10.5px] px-2 py-0.5 rounded-md border border-white/[0.10]
                         text-gray-500 hover:text-gray-200 hover:bg-white/[0.06]">recusar</button>
          </span>
        )}
      </div>
    </div>
  )
}

export default function EstadoPage() {
  const ic = doSistema('secao.estado', 'GiCompass', '#22d3ee')
  const Icone = getIcon(ic.icon)
  const [e, setE] = useState<EstadoProjeto | null>(null)
  const [rascunho, setRascunho] = useState<Partial<EstadoProjeto>>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    api.lerEstado().then(r => { setE(r); setRascunho({}) }).catch(() => setE(null))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const valor = <K extends keyof EstadoProjeto>(k: K): EstadoProjeto[K] | undefined =>
    (k in rascunho ? rascunho[k] : e?.[k])

  const sujo = Object.keys(rascunho).length > 0

  async function salvar() {
    setSalvando(true)
    try { setE(await api.gravarEstado(rascunho)); setRascunho({}) }
    catch (err) { aviso.erro(err) } finally { setSalvando(false) }
  }

  async function responder(i: number, v: 'aplicado' | 'recusado') {
    try { await api.responderMudanca(i, v); carregar() }
    catch (err) { aviso.erro(err) }
  }

  if (!e) return <CarregandoNoctis />

  const pendentes = e.mudancas.filter((_, i) => esperaVeredito(e.mudancas, i)).length

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-3 shrink-0">
        <span style={{ color: ic.color }}><Icone size={16} /></span>
        <p className="text-xs text-gray-500 flex-1">
          {e.existe ? `atualizado ${desde(e.atualizado_em)}` : 'ainda não declarado'}
          {pendentes > 0 && (
            <span className="text-amber-300/90"> · {pendentes} esperando seu veredito</span>
          )}
        </p>
        {sujo && (
          <button onClick={salvar} disabled={salvando}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-white/20 bg-white/[0.09]
                       text-gray-100 hover:bg-white/[0.14] disabled:opacity-40">
            {salvando ? 'salvando…' : 'salvar'}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <section className={`${classePainel()} p-4 space-y-4`}>
          <div className="grid grid-cols-2 gap-4">
            {CAMPOS.map(c => (
              <div key={c.id}>
                <label className="text-[10px] uppercase tracking-wider text-gray-600">{c.label}</label>
                <input value={String(valor(c.id) || '')}
                  onChange={ev => setRascunho(r => ({ ...r, [c.id]: ev.target.value }))}
                  placeholder={c.dica}
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                             text-[13px] text-gray-200 focus:outline-none focus:border-blue-500
                             placeholder:text-gray-600" />
              </div>
            ))}
          </div>
          {LISTAS.map(l => (
            <div key={l.id}>
              <label className="text-[10px] uppercase tracking-wider text-gray-600">{l.label}</label>
              {/* Uma por linha: é a forma mais simples que não pede um editor de
                  lista, e o arquivo continua sendo YAML legível. */}
              <textarea value={(valor(l.id) as string[] | undefined || []).join('\n')}
                onChange={ev => setRascunho(r => ({
                  ...r, [l.id]: ev.target.value.split('\n').map(x => x.trim()).filter(Boolean),
                }))}
                placeholder={`${l.dica} — uma por linha`} rows={3}
                className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2
                           text-[12.5px] text-gray-200 focus:outline-none focus:border-blue-500
                           placeholder:text-gray-600" />
            </div>
          ))}
        </section>

        <section className={classePainel()}>
          <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center gap-2">
            <h2 className="text-[12.5px] text-gray-300">Como chegou aqui</h2>
            <span className="text-[11px] text-gray-600">
              append-only — nenhuma linha é reescrita
            </span>
          </div>
          {e.mudancas.length === 0 ? (
            <p className="text-[12px] text-gray-600 px-3.5 py-3">
              Nada mudou ainda. A primeira vez que você declarar uma fase, ela aparece aqui.
            </p>
          ) : (
            <div>
              {e.mudancas.map((m, i) => (
                <Linha key={`${m.quando}-${m.campo}-${i}`} m={m} indice={i}
                  pendente={esperaVeredito(e.mudancas, i)} onResponder={responder} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
