import { useEffect, useRef, useState } from 'react'
import { api, type MemoryVocab } from '../api'
import { getIcon } from '../memoryIcons'
import { SeletorIcone } from './SeletorIcone'
import { COLORS, ICON_SIZES, AURA, LOGO, CEU, VIDRO, aplicarLogo } from '../lib/kinds'
import { FundoEstrelado } from './FundoEstrelado'
import { LogoNoctis } from './LogoNoctis'

type Ajuste = { color: string; icon: string }

/**
 * Cor e ícone de cada tipo de card.
 *
 * Mexe no PADRÃO do tipo, não nos cards que já existem: um card com cor própria
 * continua com a dele. É o que faz a mudança valer para o que nascer daqui em
 * diante sem reescrever o passado de ninguém.
 */
/** As seções que o painel de Configurações mostra uma de cada vez. */
export type SecaoAparencia = 'tipos' | 'icones' | 'aura' | 'logo' | 'ceu'

export function ConfigAparencia({ vocab, onFechar, onSalvo, embutido = false, secao }: {
  vocab: MemoryVocab
  onFechar: () => void
  onSalvo: (v: MemoryVocab) => void
  /** Dentro do painel de Configurações: sem moldura, e salva sozinho. */
  embutido?: boolean
  /** Qual seção mostrar. Sem ela, mostra todas (o modal antigo). */
  secao?: SecaoAparencia
}) {
  const mostra = (x: SecaoAparencia) => !secao || secao === x
  const [kinds, setKinds] = useState<Record<string, Ajuste>>(
    Object.fromEntries(Object.entries(vocab.kinds).map(([k, v]) => [k, { color: v.color, icon: v.icon }])))
  const [tipos, setTipos] = useState<Record<string, Ajuste>>(
    Object.fromEntries(Object.entries(vocab.types).map(([k, v]) => [k, { color: v.color, icon: v.icon }])))
  const [abrindoIcone, setAbrindoIcone] = useState<string | null>(null)
  const [tamanhos, setTamanhos] = useState({ ...ICON_SIZES, ...(vocab.iconSizes || {}) })
  const [aura, setAura] = useState({ ...AURA, ...(vocab.aura || {}) })
  const [logo, setLogo] = useState({ ...LOGO, ...(vocab.logo || {}) })
  const [ceu, setCeu] = useState({ ...CEU, ...(vocab.ceu || {}) })
  const [vidro, setVidro] = useState(vocab.vidro ?? VIDRO.ativo)
  // A prévia do logo lê o objeto global, então ele acompanha cada ajuste; ao
  // cancelar, o que veio do servidor é reposto.
  aplicarLogo(logo)
  const cancelar = () => { aplicarLogo({ ...LOGO, ...(vocab.logo || {}) }); onFechar() }
  const [salvando, setSalvando] = useState(false)

  // No painel de Configurações não há botão de salvar: cada ajuste grava meio
  // segundo depois do último movimento, como no Obsidian. A primeira passada é
  // pulada, senão abrir a seção já regravaria tudo sem ninguém ter mexido.
  const [salvo, setSalvo] = useState<'' | 'salvando' | 'salvo'>('')
  const primeira = useRef(true)
  useEffect(() => {
    if (!embutido) return
    if (primeira.current) { primeira.current = false; return }
    setSalvo('salvando')
    const t = setTimeout(async () => {
      try {
        onSalvo(await api.saveMemoryTypes({ kinds, types: tipos, iconSizes: tamanhos, aura, logo, ceu, vidro }))
        setSalvo('salvo')
      } catch { setSalvo('') }
    }, 450)
    return () => clearTimeout(t)
  }, [kinds, tipos, tamanhos, aura, logo, ceu, vidro])   // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    setSalvando(true)
    try { onSalvo(await api.saveMemoryTypes({ kinds, types: tipos, iconSizes: tamanhos, aura, logo, ceu, vidro })); onFechar() }
    finally { setSalvando(false) }
  }

  /** Chave de liga/desliga, no cabeçalho da seção que ela governa. */
  const Chave = ({ ligado, onMudar, rotulo }: {
    ligado: boolean; onMudar: (v: boolean) => void; rotulo: string
  }) => (
    <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none normal-case tracking-normal">
      <input type="checkbox" checked={ligado} onChange={e => onMudar(e.target.checked)} className="accent-blue-600" />
      {rotulo}
    </label>
  )

  const Linha = ({ grupo, id, rotulo, desc }: {
    grupo: 'kind' | 'tipo'; id: string; rotulo: string; desc?: string
  }) => {
    const mapa = grupo === 'kind' ? kinds : tipos
    const setMapa = grupo === 'kind' ? setKinds : setTipos
    const v = mapa[id]
    if (!v) return null
    const I = getIcon(v.icon)
    const chave = `${grupo}:${id}`
    const patch = (p: Partial<Ajuste>) => setMapa(m => ({ ...m, [id]: { ...m[id], ...p } }))

    return (
      <div className="py-2.5 border-b border-gray-800 last:border-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAbrindoIcone(a => a === chave ? null : chave)}
            title="Trocar o ícone"
            className="shrink-0 w-11 h-11 rounded-lg grid place-items-center hover:ring-2 hover:ring-gray-600"
            style={{ background: v.color + '22', color: v.color }}
          >
            <I size={26} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="text-sm text-gray-100">{rotulo}</div>
            {desc && <div className="text-[11px] text-gray-600 leading-snug">{desc}</div>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {COLORS.map(c => (
              <button key={c} onClick={() => patch({ color: c })} title={c}
                className="w-4 h-4 rounded-full border border-black/40"
                style={{ background: c, outline: c === v.color ? '2px solid #fff' : 'none' }} />
            ))}
            {/* cor livre: o seletor do sistema, para sair da paleta de nove */}
            <label title="Cor personalizada"
              className="w-6 h-6 rounded-md border border-gray-600 grid place-items-center cursor-pointer overflow-hidden"
              style={{ background: v.color }}>
              <input type="color" value={v.color}
                onChange={e => patch({ color: e.target.value })}
                className="opacity-0 w-6 h-6 cursor-pointer" />
            </label>
            <input value={v.color} onChange={e => {
                const t = e.target.value.trim()
                if (/^#[0-9a-fA-F]{0,6}$/.test(t)) patch({ color: t })
              }}
              spellCheck={false}
              className="w-[5.2rem] bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {abrindoIcone === chave && (
          <div className="mt-2 ml-14">
            <SeletorIcone atual={v.icon} cor={v.color}
              onEscolher={nm => { patch({ icon: nm }); setAbrindoIcone(null) }} />
          </div>
        )}
      </div>
    )
  }

  const corpo = (
        <div className={embutido ? '' : 'flex-1 overflow-y-auto px-5 py-2'}>
          {mostra('tipos') && <>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mt-2 mb-1">Tipos de recurso</div>
          {Object.entries(vocab.kinds).map(([id, k]) => (
            <Linha key={id} grupo="kind" id={id} rotulo={k.label} desc={`arquivo ${k.ext}`} />
          ))}

          <div className="text-[10px] uppercase tracking-wider text-gray-600 mt-5 mb-1">Tipos de memória</div>
          {Object.entries(vocab.types).map(([id, t]) => (
            <Linha key={id} grupo="tipo" id={id} rotulo={t.label} desc={t.desc} />
          ))}
          </>}
          {mostra('icones') && <>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mt-5 mb-1">Tamanho dos ícones</div>
          {([
            ['card', 'Nos cards', 'o desenho grande, no grid e no mapa'],
            ['menu', 'Nos menus', 'itens de menu e botões de ação'],
            ['nav', 'Na barra lateral', 'a navegação da esquerda'],
            ['disco', 'Discos do agente', 'nível e habilidades, na borda do card'],
          ] as const).map(([id, rotulo, desc]) => {
            const [lo, hi] = vocab.iconSizeLimits?.[id] || [10, 64]
            return (
              <div key={id} className="py-2.5 border-b border-gray-800 last:border-0 flex items-center gap-3">
                {/* a prévia usa o ícone do próprio tipo de memória para dar escala real */}
                <span className="shrink-0 w-16 grid place-items-center text-gray-300" style={{ minHeight: hi }}>
                  {(() => { const P = getIcon(vocab.kinds.memory?.icon || ''); return <P size={tamanhos[id]} /> })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-100">{rotulo}</div>
                  <div className="text-[11px] text-gray-600 leading-snug">{desc}</div>
                </div>
                <input type="range" min={lo} max={hi} value={tamanhos[id]}
                  onChange={e => setTamanhos(t => ({ ...t, [id]: Number(e.target.value) }))}
                  className="w-40 accent-blue-500" />
                <span className="w-12 text-right text-[11px] font-mono text-gray-400">{tamanhos[id]}px</span>
              </div>
            )
          })}
          </>}
          {mostra('aura') && <>
          <div className="flex items-center gap-3 mt-5 mb-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 flex-1">
              Aura dos cards <span className="normal-case tracking-normal">— só no mapa e no cosmos</span>
            </div>
            <Chave ligado={aura.ativo} onMudar={v => setAura(a => ({ ...a, ativo: v }))} rotulo="aura" />
            <Chave ligado={vidro} onMudar={setVidro} rotulo="vidro nos cards" />
          </div>
          <div className={`flex items-center gap-4 py-3 ${aura.ativo ? '' : 'opacity-40'}`}>
            {/* prévia ao vivo: o quadrado é o card, o borrão é o que se regula */}
            <div className="shrink-0 w-40 h-24 grid place-items-center">
              <div className="relative w-24 h-14 rounded-lg bg-[#161616] border border-gray-700">
                <div aria-hidden="true" className="pointer-events-none absolute -z-10"
                  style={{
                    inset: -aura.tamanho, borderRadius: aura.tamanho + 12,
                    filter: `blur(${aura.difusao}px)`, opacity: 0.3,
                    backgroundImage: [
                      `radial-gradient(38% 46% at 2% 50%, ${vocab.kinds.agent?.color || '#10b981'}, transparent 72%)`,
                      `radial-gradient(38% 46% at 98% 50%, ${vocab.kinds.flow?.color || '#f59e0b'}, transparent 72%)`,
                      `radial-gradient(52% 60% at 50% 50%, ${vocab.kinds.memory?.color || '#3b82f6'}, transparent 70%)`,
                    ].join(', '),
                  }} />
              </div>
            </div>
            <div className="flex-1 space-y-2">
              {([
                ['difusao', 'Difusão', 'o raio do borrão — 0 deixa a cor dura'],
                ['tamanho', 'Tamanho', 'o quanto ela extravasa a borda do card'],
              ] as const).map(([id, rotulo, desc]) => {
                const [lo, hi] = vocab.auraLimits?.[id] || [0, 90]
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-100">{rotulo}</div>
                      <div className="text-[11px] text-gray-600 leading-snug">{desc}</div>
                    </div>
                    <input type="range" min={lo} max={hi} value={aura[id]}
                      onChange={e => setAura(a => ({ ...a, [id]: Number(e.target.value) }))}
                      className="w-40 accent-blue-500" />
                    <span className="w-12 text-right text-[11px] font-mono text-gray-400">{aura[id]}px</span>
                  </div>
                )
              })}
            </div>
          </div>
          </>}
          {mostra('logo') && <>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 mt-5 mb-1">Logo</div>
          <div className="flex items-start gap-4 py-3">
            {/* tamanho real, no fundo da barra lateral, para não mentir a escala */}
            <div className="shrink-0 w-44 min-h-[7rem] grid place-items-center rounded-lg bg-[#111111] border border-gray-800 p-3">
              <LogoNoctis key={`${logo.modo}-${logo.corA}-${logo.corB}-${logo.velocidade}`} size={logo.tamanho} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-100">Tamanho</div>
                  <div className="text-[11px] text-gray-600">o símbolo na barra lateral</div>
                </div>
                <input type="range" min={vocab.logoLimits?.tamanho?.[0] ?? 16} max={vocab.logoLimits?.tamanho?.[1] ?? 160}
                  value={logo.tamanho} onChange={e => setLogo(l => ({ ...l, tamanho: Number(e.target.value) }))}
                  className="w-40 accent-blue-500" />
                <span className="w-12 text-right text-[11px] font-mono text-gray-400">{logo.tamanho}px</span>
              </div>

              <div className="flex items-center gap-2">
                {(['solida', 'gradiente'] as const).map(m => (
                  <button key={m} onClick={() => setLogo(l => ({ ...l, modo: m }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${logo.modo === m
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200'}`}>
                    {m === 'solida' ? 'Cor sólida' : 'Gradiente animado'}
                  </button>
                ))}
              </div>

              {logo.modo === 'solida' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-16">Cor</span>
                  <label className="w-7 h-7 rounded-md border border-gray-600 grid place-items-center cursor-pointer overflow-hidden"
                    style={{ background: logo.cor }}>
                    <input type="color" value={logo.cor}
                      onChange={e => setLogo(l => ({ ...l, cor: e.target.value }))}
                      className="opacity-0 w-7 h-7 cursor-pointer" />
                  </label>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setLogo(l => ({ ...l, cor: c }))} title={c}
                      className="w-4 h-4 rounded-full border border-black/40"
                      style={{ background: c, outline: c === logo.cor ? '2px solid #fff' : 'none' }} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-16">De / até</span>
                    {(['corA', 'corB'] as const).map(k => (
                      <label key={k} className="w-7 h-7 rounded-md border border-gray-600 grid place-items-center cursor-pointer overflow-hidden"
                        style={{ background: logo[k] }}>
                        <input type="color" value={logo[k]}
                          onChange={e => setLogo(l => ({ ...l, [k]: e.target.value }))}
                          className="opacity-0 w-7 h-7 cursor-pointer" />
                      </label>
                    ))}
                    <div className="flex-1 h-7 rounded-md border border-gray-700"
                      style={{ background: `linear-gradient(90deg, ${logo.corA}, ${logo.corB})` }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-100">Volta do gradiente</div>
                      <div className="text-[11px] text-gray-600">segundos por giro completo — maior é mais lento</div>
                    </div>
                    <input type="range" min={vocab.logoLimits?.velocidade?.[0] ?? 1} max={vocab.logoLimits?.velocidade?.[1] ?? 30}
                      value={logo.velocidade} onChange={e => setLogo(l => ({ ...l, velocidade: Number(e.target.value) }))}
                      className="w-40 accent-blue-500" />
                    <span className="w-12 text-right text-[11px] font-mono text-gray-400">{logo.velocidade}s</span>
                  </div>
                </>
              )}
            </div>
          </div>
          </>}
          {mostra('ceu') && <>
          <div className="flex items-center gap-3 mt-5 mb-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 flex-1">
              Céu do canvas <span className="normal-case tracking-normal">— mapa e cosmos</span>
            </div>
            <Chave ligado={ceu.ativo} onMudar={v => setCeu(c => ({ ...c, ativo: v }))} rotulo="céu" />
          </div>
          {/* Desligado o céu, a seção inteira sai de operação: nada de prévia
              desenhando quadros nem régua que possa ser arrastada à toa. Os
              valores ficam guardados, então religar devolve o céu como estava. */}
          <fieldset disabled={!ceu.ativo} className="contents">
            {/* o desenho do campo: os controles abaixo valem para os dois */}
            <div className={`flex items-center gap-2 mb-2 ${ceu.ativo ? '' : 'opacity-30'}`}>
              {(['estrelas', 'malha'] as const).map(e => (
                <button key={e} onClick={() => setCeu(c => ({ ...c, estilo: e }))}
                  disabled={!ceu.ativo}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${ceu.estilo === e
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200'}`}>
                  {e === 'estrelas' ? 'Constelação' : 'Malha'}
                </button>
              ))}
              <span className="text-[11px] text-gray-600 ml-1">
                {ceu.estilo === 'estrelas'
                  ? 'pontos soltos em três profundidades'
                  : `pontos ligados por fios, numa profundidade só (até ${240} pontos)`}
              </span>
            </div>
            <div className={`relative h-32 rounded-lg overflow-hidden border border-gray-800 bg-[#0a0a0a] mb-2 ${
              ceu.ativo ? '' : 'opacity-30 grid place-items-center'}`}>
              {ceu.ativo
                ? <>
                    <FundoEstrelado cfg={ceu} cores={Object.values(vocab.kinds).map(k => k.color)} />
                    <span className="absolute bottom-1.5 right-2 text-[10px] text-gray-600 z-10">passe o mouse</span>
                  </>
                : <span className="text-[11px] text-gray-600">céu desligado</span>}
            </div>
            {([
              ['estrelas', ceu.estilo === 'malha' ? 'Pontos' : 'Estrelas',
                ceu.estilo === 'malha' ? 'quantos nós na malha — acima de 240 o excedente é ignorado'
                                       : 'quantas, no total, entre as três profundidades', ''],
              ['movimento', ceu.estilo === 'malha' ? 'Movimento da malha' : 'Movimento das estrelas',
                'o quanto o campo desliza contra o cursor', 'px'],
              ['nebulosas', 'Nebulosas', 'manchas de cor; pegam as cores dos tipos de card', ''],
              ['movNebulosa', 'Movimento das nebulosas', 'em relação ao das estrelas — 100 iguala os dois', '%'],
              ['deriva', 'Deriva', 'o vagar próprio das nebulosas; uma volta a cada ~25s', 'px'],
              ['opacidade', ceu.estilo === 'malha' ? 'Opacidade da malha' : 'Opacidade das estrelas',
                '100 é o calibrado; acima disso o campo pesa mais', '%'],
              ['opacidadeNebulosa', 'Opacidade das nebulosas', 'as manchas de cor ao fundo', '%'],
            ] as const).map(([id, rotulo, desc, un]) => {
              const [lo, hi] = vocab.ceuLimits?.[id] || [0, 300]
              return (
                <div key={id} className={`py-2 border-b border-gray-800 last:border-0 flex items-center gap-3 ${
                  ceu.ativo ? '' : 'opacity-30'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-100">{rotulo}</div>
                    <div className="text-[11px] text-gray-600 leading-snug">{desc}</div>
                  </div>
                  <input type="range" min={lo} max={hi} value={ceu[id]}
                    onChange={e => setCeu(c => ({ ...c, [id]: Number(e.target.value) }))}
                    className="w-40 accent-blue-500 disabled:cursor-not-allowed" />
                  <span className="w-12 text-right text-[11px] font-mono text-gray-400">{ceu[id]}{un}</span>
                </div>
              )
            })}
            <p className={`text-[11px] text-gray-600 leading-snug mt-2 ${ceu.ativo ? '' : 'opacity-30'}`}>
              Deriva acima de 0 deixa o desenho rodando o tempo todo; em 0 ele para
              assim que o campo alcança o cursor. Em 0, o campo some e ficam só as nebulosas.
            </p>
          </fieldset>
          </>}
        </div>
  )

  if (embutido) {
    return (
      <div>
        {corpo}
        <p className="text-[10.5px] text-gray-600 mt-4 h-4">
          {salvo === 'salvando' ? 'salvando…' : salvo === 'salvo' ? 'salvo — já vale no Noctis inteiro' : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6" onClick={onFechar}>
      <div className="w-[46rem] max-w-full max-h-[86vh] flex flex-col bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 shrink-0">
          <h3 className="text-sm font-semibold text-gray-100">Aparência: cor, ícone e tamanho</h3>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Muda o padrão do tipo. Cards que já têm cor ou ícone próprios continuam como estão.
          </p>
        </div>

        {corpo}

        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-2 shrink-0">
          <p className="text-[11px] text-gray-600 flex-1">
            A cor também pinta o item na barra lateral e o selo do card.
          </p>
          <button onClick={cancelar} className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5">Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
            {salvando ? 'salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
