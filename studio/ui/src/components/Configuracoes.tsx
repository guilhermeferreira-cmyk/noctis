import { useEffect, useMemo, useState } from 'react'
import { GiPaintBucket, GiSkills, GiPadlock, GiLevelEndFlag, GiInfo, GiOpenFolder, GiFamilyTree,
         GiSettingsKnobs, GiStarsStack, GiSunrise, GiCrystalGrowth, GiScrollUnfurled } from 'react-icons/gi'
import { api, enderecoDaApi, enderecoPadrao, definirEnderecoDaApi, saude,
         type Saude, type MemoryVocab, type ProjectMeta } from '../api'
import { ConfigAparencia, type SecaoAparencia } from './ConfigAparencia'
import { PainelRegras } from './PainelRegras'
import { PainelTeses } from './PainelTeses'
import { PainelDiagnostico, PainelDados } from './PainelDiagnostico'
import { PainelSquads, PainelTagsConfig } from './PainelSquadsTags'
import { PainelManual } from './PainelManual'
import { PainelNicknames, PainelArquetipos } from './PainelNicknames'
import { Switch } from './Switch'
import { LogoNoctis } from './LogoNoctis'
import { TFechar } from './shell/Tracos'
import { definirPreferencia, restaurarPreferencias, usePreferencias } from '../lib/preferencias'

/**
 * Configurações do Noctis — tudo que se ajusta, num lugar só.
 *
 * Antes, os ajustes estavam em três cantos: aparência num modal, regras dentro
 * do Controle, e as preferências da tela em lugar nenhum. Aqui eles ficam como
 * no Obsidian: busca no topo, seções à esquerda, e cada ajuste numa linha com
 * o que ele faz e o controle ao lado. Nada tem botão de salvar — mudou, valeu.
 *
 * Três naturezas de ajuste, e o painel deixa claro de quem cada uma é:
 *   · Interface  — deste navegador (esconder a barra aqui não esconde em outra máquina)
 *   · Aparência  — do Noctis, gravada no servidor, vale em qualquer máquina
 *   · Agentes    — regras do sistema, que o código aplica e os agentes obedecem
 */

type IdSecao =
  | 'sobre' | 'manual' | 'interface' | 'projetos' | 'diagnostico' | 'dados' | 'conexao'
  | 'tipos' | 'icones' | 'logo' | 'ceu' | 'aura'
  | 'protocolo' | 'learning' | 'perguntas' | 'xp' | 'organizacao-regras'
  | 'agentes-aplicados' | 'runtime-regras'
  | 'nocturn' | 'protecoes'

type Secao = { id: IdSecao; rotulo: string; grupo: string; Icone: React.ComponentType<{ size?: number }>;
               chaves: string }

const SECOES: Secao[] = [
  { id: 'sobre',      grupo: 'Noctis', rotulo: 'Sobre', Icone: GiInfo, chaves: 'versão api atalhos teclado' },
  { id: 'manual',     grupo: 'Noctis', rotulo: 'Manual', Icone: GiScrollUnfurled,
    chaves: 'manual ajuda como funciona ciclo aprendizado quem pode papel atalho documentação' },
  { id: 'interface',  grupo: 'Noctis', rotulo: 'Interface', Icone: GiSettingsKnobs,
    chaves: 'faixa ícones cabeçalho aba barra status zoom painel direito abas largura menu seções' },
  { id: 'projetos',   grupo: 'Noctis', rotulo: 'Projetos e lixeira', Icone: GiOpenFolder,
    chaves: 'projeto criar renomear excluir lixeira restaurar base' },
  { id: 'diagnostico', grupo: 'Noctis', rotulo: 'Diagnóstico', Icone: GiInfo,
    chaves: 'diagnóstico saúde inconsistente pendente esperando sem uso torto estado' },
  { id: 'conexao',    grupo: 'Noctis', rotulo: 'Conexão', Icone: GiFamilyTree,
    chaves: 'conexão servidor api endereço porta localhost máquina própria pasta onde '
          + 'grava conectar demonstração efêmero vercel' },
  { id: 'dados',      grupo: 'Noctis', rotulo: 'Dados e arquivos', Icone: GiOpenFolder,
    chaves: 'dados arquivo onde gravado tamanho peso jsonl json yaml pasta backup' },
  { id: 'tipos',      grupo: 'Aparência', rotulo: 'Ícones e cores', Icone: GiPaintBucket,
    chaves: 'cor ícone agente memória fluxo persona tipo fundação decisão referência '
          + 'seção faixa doca papel maestro líder estado broto firmada sistema tudo' },
  { id: 'icones',     grupo: 'Aparência', rotulo: 'Tamanho dos ícones', Icone: GiCrystalGrowth,
    chaves: 'tamanho ícone card menu barra lateral disco' },
  { id: 'logo',       grupo: 'Aparência', rotulo: 'Logo', Icone: GiSunrise, chaves: 'logo tamanho cor degradê gradiente animação' },
  { id: 'ceu',        grupo: 'Aparência', rotulo: 'Céu', Icone: GiStarsStack,
    chaves: 'céu estrelas nebulosas parallax deriva opacidade malha constelação fundo' },
  { id: 'aura',       grupo: 'Aparência', rotulo: 'Aura e vidro', Icone: GiScrollUnfurled,
    chaves: 'aura blur difusão vidro transparência brilho' },
  { id: 'agentes-aplicados', grupo: 'Agentes e aprendizado', rotulo: 'Arquétipos e nicknames', Icone: GiFamilyTree,
    chaves: 'arquétipo nickname identificador agente aplicado acoplamento banco estrela '
          + 'constelação nome projeto atravessa contaminação' },
  { id: 'runtime-regras', grupo: 'Agentes e aprendizado', rotulo: 'Runtime', Icone: GiInfo,
    chaves: 'runtime janela agora minutos página paginação histórico registros' },
  { id: 'protocolo',  grupo: 'Agentes e aprendizado', rotulo: 'Protocolo dos agentes', Icone: GiScrollUnfurled,
    chaves: 'protocolo prompt consultar registrar declarar Learnings instalar' },
  { id: 'learning', grupo: 'Agentes e aprendizado', rotulo: 'Learning e tags', Icone: GiSkills,
    chaves: 'learning Learning skill firmar broto fusão semelhança curadoria nativa tag vocabulário agrupar solta' },
  { id: 'perguntas', grupo: 'Agentes e aprendizado', rotulo: 'Perguntas e teses', Icone: GiScrollUnfurled,
    chaves: 'pergunta tese escolha opção enquadramento descobrir Learning frase documento' },
  { id: 'xp',         grupo: 'Agentes e aprendizado', rotulo: 'XP e níveis', Icone: GiLevelEndFlag,
    chaves: 'xp nível curva dificuldade bônus teto saturação' },
  { id: 'organizacao-regras', grupo: 'Agentes e aprendizado', rotulo: 'Organização e squads', Icone: GiFamilyTree,
    chaves: 'organização papel maestro líder aviso cadeia comando cor squad criar renomear apagar divisão' },
  { id: 'nocturn',    grupo: 'Agentes e aprendizado', rotulo: 'NOCTURN', Icone: GiInfo,
    chaves: 'nocturn supervisor ronda intervalo parado confirmação' },
  { id: 'protecoes',  grupo: 'Agentes e aprendizado', rotulo: 'Proteções', Icone: GiPadlock,
    chaves: 'proteção base permanente repositório lixeira histórico' },
]

const PAGINAS_FAIXA: { id: string; rotulo: string }[] = [
  { id: 'agents', rotulo: 'Agentes' }, { id: 'organizacao', rotulo: 'Organização' }, { id: 'memory', rotulo: 'Memória' }, { id: 'flows', rotulo: 'Fluxos' },
  { id: 'personas', rotulo: 'Personas' }, { id: 'learning', rotulo: 'Learning' }, { id: 'runtime', rotulo: 'Runtime' },
  { id: 'canvas', rotulo: 'Mapa de Memória' }, { id: 'cosmos', rotulo: 'Cosmos' },
  { id: 'controle', rotulo: 'Controle' }, { id: 'setup', rotulo: 'Gerar Setup' },
]

/** Uma linha de ajuste: o que é, para que serve, e o controle ao lado. */
function Linha({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 py-3.5 border-b border-white/[0.06] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-gray-100">{titulo}</div>
        {desc && <div className="text-[11.5px] text-gray-500 mt-0.5 leading-snug">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      {titulo && <h3 className="text-[13px] font-semibold text-gray-200 mb-1">{titulo}</h3>}
      {children}
    </section>
  )
}

// ── Seções próprias deste painel ─────────────────────────────────────────────

function SecaoInterface({ onRedefinirLarguras }: { onRedefinirLarguras: () => void }) {
  const p = usePreferencias()
  const [menu, setMenu] = useState(false)
  if (menu) return (
    <>
      <button onClick={() => setMenu(false)} className="text-[12px] text-gray-400 hover:text-gray-100 mb-3">‹ Interface</button>
      <Grupo titulo="Menu">
        <p className="text-[11.5px] text-gray-500 mb-1">
          Quais seções aparecem na faixa de ícones. Esconder não apaga: continua abrindo pela árvore.
        </p>
        {PAGINAS_FAIXA.map(s => (
          <Linha key={s.id} titulo={s.rotulo}>
            <Switch cor="#8b5cf6" ligado={!p.secoesOcultas.includes(s.id)}
              onMudar={v => definirPreferencia('secoesOcultas',
                v ? p.secoesOcultas.filter(x => x !== s.id) : [...p.secoesOcultas, s.id])} />
          </Linha>
        ))}
      </Grupo>
    </>
  )
  return (
    <>
      <Grupo titulo="Janela">
        <Linha titulo="Mostrar a faixa de ícones" desc="As seções na coluna estreita à esquerda.">
          <Switch cor="#8b5cf6" ligado={p.mostrarFaixa} onMudar={v => definirPreferencia('mostrarFaixa', v)} />
        </Linha>
        <Linha titulo="Mostrar o cabeçalho da aba" desc="Voltar, avançar e o título acima do conteúdo.">
          <Switch cor="#8b5cf6" ligado={p.mostrarCabecalhoAba} onMudar={v => definirPreferencia('mostrarCabecalhoAba', v)} />
        </Linha>
        <Linha titulo="Mostrar a barra de status" desc="A linha de baixo: pendências, regras alteradas, API no ar.">
          <Switch cor="#8b5cf6" ligado={p.mostrarBarraStatus} onMudar={v => definirPreferencia('mostrarBarraStatus', v)} />
        </Linha>
        <button onClick={() => setMenu(true)} className="w-full text-left">
          <Linha titulo="Menu" desc="Quais itens aparecem na faixa de ícones.">
            <span className="text-gray-500 text-lg leading-none">›</span>
          </Linha>
        </button>
        <Linha titulo="Zoom" desc="Tamanho de toda a interface. Útil em tela grande ou pequena.">
          <div className="flex items-center gap-3">
            {p.zoom !== 100 && (
              <button onClick={() => definirPreferencia('zoom', 100)} title="Voltar a 100%"
                className="text-gray-500 hover:text-gray-200 text-xs">↺</button>
            )}
            <span className="text-[11px] text-gray-400 tabular-nums w-10 text-right">{p.zoom}%</span>
            <input type="range" min={75} max={140} step={5} value={p.zoom}
              onChange={e => definirPreferencia('zoom', Number(e.target.value))}
              className="w-36 accent-violet-500" />
          </div>
        </Linha>
        <Linha titulo="Larguras dos painéis" desc="A árvore e o painel da direita voltam à largura padrão.">
          <button onClick={onRedefinirLarguras}
            className="text-xs px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-gray-200">redefinir</button>
        </Linha>
      </Grupo>

      <Grupo titulo="Abas">
        <Linha titulo="Reabrir as abas do projeto" desc="Ao voltar a um projeto, as abas que estavam abertas voltam junto.">
          <Switch cor="#8b5cf6" ligado={p.restaurarAbas} onMudar={v => definirPreferencia('restaurarAbas', v)} />
        </Linha>
        <Linha titulo="O painel da direita abre em" desc="Qual das duas vistas aparece primeiro.">
          <select value={p.painelDireitoInicial}
            onChange={e => definirPreferencia('painelDireitoInicial', e.target.value as 'nocturn' | 'contexto')}
            className="bg-black/40 border border-white/[0.1] rounded-md px-2 py-1 text-xs text-gray-200 focus:outline-none">
            <option value="nocturn">NOCTURN</option>
            <option value="contexto">Contexto</option>
          </select>
        </Linha>
      </Grupo>

      <button onClick={restaurarPreferencias}
        className="text-[11px] text-gray-500 hover:text-gray-200 underline decoration-dotted">
        voltar toda a interface ao padrão
      </button>
    </>
  )
}

function SecaoProjetos({ atual, onAbrir, onMudou }: {
  atual: string; onAbrir: (slug: string) => void; onMudou: () => void
}) {
  const [verOcultos, setVerOcultos] = useState(false)
  const [projetos, setProjetos] = useState<(ProjectMeta & { permanente?: boolean; repositorio?: boolean })[]>([])
  const [lixo, setLixo] = useState<{ id: string; slug: string; quando: string; nome: string }[]>([])
  const reler = () => {
    (verOcultos ? api.listarComOcultos() : api.listProjects())
      .then(l => setProjetos(l as typeof projetos))
    api.lixeira().then(r => setLixo(r.itens))
  }
  useEffect(() => { reler() }, [verOcultos])   // eslint-disable-line react-hooks/exhaustive-deps
  const agir = async (fn: () => Promise<unknown>) => {
    try { await fn(); reler(); onMudou() } catch (e) { alert((e as Error).message) }
  }

  return (
    <>
      <Grupo titulo="Projetos">
        {projetos.map(p => (
          <Linha key={p.slug} titulo={p.displayName}
            desc={p.permanente ? 'Base de conhecimento — permanente, todo projeto a consulta.'
              : p.repositorio ? 'Repositório de código dentro de projects/ — o Noctis não move nem apaga. Esconder tira da lista sem tocar na pasta.'
              : `${p.counts.agents} agentes · ${p.counts.memory} memórias · ${p.counts.flows} fluxos`}>
            <div className="flex items-center gap-3 text-[11.5px]">
              {p.slug === atual
                ? <span className="text-violet-300">aberto</span>
                : <button onClick={() => onAbrir(p.slug)} className="text-gray-300 hover:text-white">abrir</button>}
              {/* Esconder some da navegação e não mexe no disco: é o que
                  resolve repositório de código e projeto que morreu. */}
              {!p.permanente && (
                <button onClick={async () => {
                    await api.ocultarProjeto(p.slug, !p.oculto); reler(); onMudou()
                  }}
                  title={p.oculto ? 'Trazer de volta para a lista'
                    : 'Sumir da lista. A pasta continua onde está.'}
                  className="text-gray-500 hover:text-gray-200">
                  {p.oculto ? 'mostrar' : 'esconder'}
                </button>
              )}
              {!p.permanente && !p.repositorio && !p.oculto && <>
                <button onClick={() => {
                  const n = window.prompt('Novo nome do projeto:', p.displayName)?.trim()
                  if (n && n !== p.displayName) agir(() => api.renameProject(p.slug, n))
                }} className="text-gray-500 hover:text-gray-200">renomear</button>
                <button onClick={() => {
                  if (window.confirm(`Mandar "${p.displayName}" para a lixeira? Dá para restaurar aqui mesmo.`))
                    agir(() => api.deleteProject(p.slug))
                }} className="text-gray-500 hover:text-red-400">lixeira</button>
              </>}
            </div>
          </Linha>
        ))}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => {
            const n = window.prompt('Nome do novo projeto:')?.trim()
            if (n) agir(() => api.createProject(n))
          }} className="text-xs px-3 py-1.5 rounded-md bg-violet-600/80 hover:bg-violet-500 text-white">
            + novo projeto
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={verOcultos} onChange={e => setVerOcultos(e.target.checked)}
              className="accent-violet-600" />
            ver os escondidos
          </label>
        </div>
      </Grupo>

      <Grupo titulo={`Lixeira${lixo.length ? ` (${lixo.length})` : ''}`}>
        {lixo.length === 0
          ? <p className="text-[11.5px] text-gray-500">Vazia. Projeto excluído vem para cá, e só sai de verdade quando você apaga daqui.</p>
          : lixo.map(i => (
            <Linha key={i.id} titulo={i.nome} desc={`excluído em ${i.quando}`}>
              <div className="flex items-center gap-3 text-[11.5px]">
                <button onClick={() => agir(() => api.restaurarProjeto(i.id))} className="text-sky-400 hover:underline">restaurar</button>
                <button onClick={() => {
                  if (window.confirm(`Apagar "${i.nome}" de vez? Esta é a única ação sem volta.`)) agir(() => api.apagarDeVez(i.id))
                }} className="text-red-400 hover:underline">apagar de vez</button>
              </div>
            </Linha>
          ))}
      </Grupo>
    </>
  )
}

// ── Conexão ──────────────────────────────────────────────────────────────────
// A página pode ser servida de qualquer lugar, inclusive de um deploy público.
// O Noctis de verdade é o servidor, e é ele que sabe em qual pasta gravar — por
// isso esta tela mostra a raiz que o servidor respondeu, e não uma promessa da
// interface. Quem abre pela web e quer trabalhar nas próprias pastas aponta
// aqui para o Noctis que roda na máquina dele.
function SecaoConexao() {
  const [endereco, setEndereco] = useState(enderecoDaApi() || window.location.origin)
  const [estado, setEstado] = useState<'…' | 'ok' | 'erro'>('…')
  const [info, setInfo] = useState<Saude | null>(null)
  const [erro, setErro] = useState('')
  const [testando, setTestando] = useState(false)

  const conferir = (url?: string) => {
    setTestando(true); setErro('')
    saude(url).then(d => { setInfo(d); setEstado('ok') })
      .catch((e: Error) => { setInfo(null); setEstado('erro'); setErro(e.message) })
      .finally(() => setTestando(false))
  }
  useEffect(() => { conferir() }, [])

  const conectar = () => {
    const alvo = definirEnderecoDaApi(endereco)
    setEndereco(alvo || window.location.origin)
    conferir(alvo)
  }

  const atual = enderecoDaApi() || 'mesma origem desta página'

  return (
    <>
      <Grupo titulo="Servidor">
        <Linha titulo="Endereço"
               desc="Onde esta página procura o Noctis. Vale só neste navegador.">
          <span className="text-xs text-gray-400 font-mono">{atual}</span>
        </Linha>
        <Linha titulo="Estado" desc="Resposta do aperto de mão.">
          <span className={`text-xs ${estado === 'erro' ? 'text-red-400'
                          : estado === 'ok' ? 'text-emerald-400' : 'text-gray-500'}`}>
            {testando ? 'testando…' : estado === 'ok' ? 'conectado'
              : estado === 'erro' ? `sem resposta — ${erro}` : '…'}
          </span>
        </Linha>
        {info && (
          <Linha titulo="Pasta dos dados"
                 desc={info.efemero
                   ? 'Esta instância é efêmera: o que você criar some quando ela reciclar.'
                   : 'É aqui que seus projetos são criados, na máquina que roda o servidor.'}>
            <span className={`text-xs font-mono ${info.efemero ? 'text-amber-400' : 'text-gray-400'}`}>
              {info.raiz}
            </span>
          </Linha>
        )}
      </Grupo>

      <Grupo titulo="Apontar para outro Noctis">
        <div className="flex gap-2 mb-2">
          <input value={endereco} onChange={e => setEndereco(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') conectar() }}
                 placeholder="http://localhost:5501"
                 className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5
                            text-xs font-mono text-gray-200 outline-none focus:border-white/25" />
          <button onClick={conectar} disabled={testando}
                  className="px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/15
                             disabled:opacity-40 text-gray-100">
            conectar
          </button>
          <button onClick={() => { setEndereco(enderecoPadrao() || window.location.origin)
                                   definirEnderecoDaApi(''); conferir(enderecoPadrao()) }}
                  className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-200">
            padrão
          </button>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Para criar projetos dentro das <strong className="text-gray-400">suas</strong> pastas, o
          servidor precisa rodar na sua máquina — é ele que tem acesso ao seu disco, não esta
          página. Com o Noctis clonado, suba o servidor e aponte o endereço acima para ele:
        </p>
        <pre className="mt-2 text-[11px] font-mono text-gray-400 bg-black/30 border border-white/10
                        rounded p-2 overflow-x-auto whitespace-pre">
{`cd studio/api
NOCTIS_DATA=/caminho/para/suas/pastas uvicorn main:app --port 5501`}
        </pre>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
          Sem <code className="text-gray-400">NOCTIS_DATA</code>, os projetos vão para a pasta do
          próprio Noctis. Funciona no Chrome e no Edge; a página avisa aqui se o servidor não
          responder.
        </p>
      </Grupo>
    </>
  )
}

function SecaoSobre() {
  const [dados, setDados] = useState<{ projetos: number; agentes: number; skills: number; eventos: number } | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  useEffect(() => {
    api.controle().then(c => {
      setOnline(true)
      setDados({
        projetos: c.projetos.filter(p => !p.repositorio).length,
        agentes: c.projetos.reduce((t, p) => t + p.agentes, 0),
        skills: c.projetos.reduce((t, p) => t + p.skills, 0),
        eventos: c.projetos.reduce((t, p) => t + p.eventos, 0),
      })
    }).catch(() => setOnline(false))
  }, [])
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <LogoNoctis size={52} />
        <div>
          <div className="text-xl font-bold text-gray-100 tracking-tight">Noctis</div>
          <div className="text-xs text-gray-500">base de conhecimento, Learnings e aprendizado dos seus agentes</div>
        </div>
      </div>
      <Grupo titulo="Estado">
        <Linha titulo="API" desc="O servidor que guarda projetos, regras e o histórico de trabalho.">
          <span className={`text-xs ${online === false ? 'text-red-400' : 'text-emerald-400'}`}>
            {online === null ? '…' : online ? `no ar · ${enderecoDaApi() || 'mesma origem'}` : 'fora do ar'}
          </span>
        </Linha>
        {dados && <Linha titulo="Conteúdo"
          desc="Somado entre todos os projetos (repositórios de código não contam).">
          <span className="text-xs text-gray-300 tabular-nums">
            {dados.projetos} projetos · {dados.agentes} agentes · {dados.skills} learnings · {dados.eventos} trabalhos
          </span>
        </Linha>}
      </Grupo>
      <Grupo titulo="Atalhos">
        {[
          ['Ctrl + ,', 'abrir estas configurações'],
          ['Botão do meio na aba', 'fechar a aba'],
          ['Clique direito na árvore', 'menu do item: abrir, copiar identificador, PDF, renomear'],
          ['V  /  H', 'no mapa: seleção e mão'],
          ['Espaço + arrastar', 'no mapa: mover sem trocar de ferramenta'],
        ].map(([k, d]) => (
          <Linha key={k} titulo={d}>
            <kbd className="text-[11px] text-gray-300 bg-white/[0.06] border border-white/[0.1] rounded px-2 py-0.5">{k}</kbd>
          </Linha>
        ))}
      </Grupo>
    </>
  )
}

function SecaoNocturn() {
  const p = usePreferencias()
  return (
    <>
      <Grupo titulo="Ronda">
        <Linha titulo="Intervalo da ronda"
          desc="De quanto em quanto tempo o NOCTURN relê os projetos. Mais curto = mais atual, e mais leitura de disco.">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400 tabular-nums w-12 text-right">{p.intervaloRonda}s</span>
            <input type="range" min={15} max={600} step={15} value={p.intervaloRonda}
              onChange={e => definirPreferencia('intervaloRonda', Number(e.target.value))}
              className="w-36 accent-violet-500" />
          </div>
        </Linha>
      </Grupo>
      <PainelRegras area="nocturn" mostrarProtocolo={false} />
    </>
  )
}

// ── O painel ─────────────────────────────────────────────────────────────────

export function Configuracoes({ vocab, secaoInicial = 'interface', projetoAtual, onFechar, onVocab,
                                onAbrirProjeto, onProjetosMudaram, onRedefinirLarguras }: {
  vocab: MemoryVocab
  secaoInicial?: string
  projetoAtual: string
  onFechar: () => void
  /** Cada ajuste de aparência salvo chega aqui, para valer na tela inteira. */
  onVocab: (v: MemoryVocab) => void
  onAbrirProjeto: (slug: string) => void
  onProjetosMudaram: () => void
  onRedefinirLarguras: () => void
}) {
  const [secao, setSecao] = useState<IdSecao>(secaoInicial as IdSecao)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return SECOES
    return SECOES.filter(s => (s.rotulo + ' ' + s.grupo + ' ' + s.chaves).toLowerCase().includes(q))
  }, [busca])

  // Buscou e a seção aberta sumiu da lista: abre a primeira que sobrou.
  useEffect(() => {
    if (visiveis.length && !visiveis.some(s => s.id === secao)) setSecao(visiveis[0].id)
  }, [visiveis, secao])

  const atual = SECOES.find(s => s.id === secao)!
  const grupos = [...new Set(visiveis.map(s => s.grupo))]
  const aparencia: SecaoAparencia[] = ['tipos', 'icones', 'logo', 'ceu', 'aura']

  // Uma frase por seção, dizendo o que ela governa. Ajuda que mora longe do
  // controle não é lida na hora da dúvida — e é na hora da dúvida que importa.
  const AJUDA: Record<string, string> = {
    manual: 'Como o Noctis funciona, em uma página.',
    sobre: 'O estado do sistema e quanto conteúdo existe.',
    interface: 'Como esta tela se arruma. Vale só neste navegador.',
    projetos: 'Criar, renomear e recuperar projeto. A base não se apaga.',
    diagnostico: 'O que está torto na estrutura deste projeto, agora.',
    dados: 'Onde cada coisa é gravada, e quanto pesa.',
    tipos: 'O ícone e a cor de tudo: tipos, seções, doca, papéis, estados.',
    icones: 'O tamanho dos ícones em cada lugar da tela.',
    logo: 'A marca do Noctis: tamanho, cor, animação.',
    ceu: 'O fundo estrelado: estrelas, nebulosas, deriva.',
    aura: 'O brilho dos cards e a transparência dos painéis.',
    protocolo: 'O que todo agente é obrigado a fazer, e o texto exato que ele recebe.',
    learning: 'Como um Learning nasce e se funde, e o vocabulário de tags.',
    perguntas: 'As perguntas e teses que descobrem o que um Learning é.',
    xp: 'Quanto cada trabalho vale, e quanto custa subir de nível.',
    'organizacao-regras': 'Os papéis, os avisos, e as squads deste projeto.',
    nocturn: 'O que o supervisor cobra, e de quanto em quanto tempo.',
    protecoes: 'O que o Noctis nunca deixa acontecer. Não se desligam.',
  }

  const NATUREZA: Record<string, string> = {
    'Noctis': '',
    'Aparência': 'Gravado no servidor: vale em qualquer máquina que abrir o Noctis.',
    'Agentes e aprendizado': 'Regras do sistema: o código aplica e os agentes obedecem.',
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onMouseDown={onFechar}>
      <div onMouseDown={e => e.stopPropagation()}
        className="w-[68rem] max-w-full h-[44rem] max-h-[90vh] flex rounded-2xl overflow-hidden
                   bg-[#141417]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/60">

        {/* Navegação: busca e seções */}
        <nav className="w-60 shrink-0 bg-black/25 border-r border-white/[0.06] flex flex-col">
          <div className="p-3 shrink-0">
            <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
              placeholder="localizar configuração…"
              className="w-full bg-black/40 border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-gray-200
                         focus:outline-none focus:border-violet-500/60 placeholder:text-gray-600" />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {grupos.map(g => (
              <div key={g} className="mb-3">
                <div className="px-2.5 py-1 text-[10.5px] text-gray-500">{g}</div>
                {visiveis.filter(s => s.grupo === g).map(s => (
                  <button key={s.id} onClick={() => setSecao(s.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-[12.5px] ${
                      s.id === secao ? 'bg-white/[0.09] text-gray-100' : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'}`}>
                    <span className="opacity-70 shrink-0"><s.Icone size={14} /></span>
                    {s.rotulo}
                  </button>
                ))}
              </div>
            ))}
            {!visiveis.length && <p className="px-2.5 text-[11px] text-gray-600">nada com “{busca}”</p>}
          </div>
        </nav>

        {/* Conteúdo da seção */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-12 shrink-0 flex items-center px-6 border-b border-white/[0.06]">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-gray-100">{atual.rotulo}</div>
            {AJUDA[secao] && (
              <div className="text-[11px] text-gray-500 truncate">{AJUDA[secao]}</div>
            )}
            </div>
            <button onClick={onFechar} title="Fechar (Esc)"
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-100 hover:bg-white/[0.06]">
              <TFechar size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="max-w-3xl">
              {NATUREZA[atual.grupo] && (
                <p className="text-[11px] text-gray-500 mb-4">{NATUREZA[atual.grupo]}</p>
              )}
              {secao === 'sobre' && <SecaoSobre />}
              {secao === 'manual' && <PainelManual />}
              {secao === 'interface' && <SecaoInterface onRedefinirLarguras={onRedefinirLarguras} />}
              {secao === 'diagnostico' && <PainelDiagnostico />}
              {secao === 'dados' && <PainelDados />}
              {secao === 'conexao' && <SecaoConexao />}
              {secao === 'projetos' && (
                <SecaoProjetos atual={projetoAtual} onAbrir={onAbrirProjeto} onMudou={onProjetosMudaram} />
              )}
              {aparencia.includes(secao as SecaoAparencia) && (
                <ConfigAparencia key={secao} embutido secao={secao as SecaoAparencia}
                  vocab={vocab} onFechar={onFechar} onSalvo={onVocab} />
              )}

              {secao === 'agentes-aplicados' && (
                <>
                  <h3 className="text-[13px] font-semibold text-gray-200 mb-1">Arquétipos</h3>
                  <PainelArquetipos />
                  <h3 className="text-[13px] font-semibold text-gray-200 mb-1 mt-6">Nicknames</h3>
                  <PainelNicknames />
                  <h3 className="text-[13px] font-semibold text-gray-200 mb-1 mt-6">Regras</h3>
                  <PainelRegras area="agentes" />
                </>
              )}
              {secao === 'runtime-regras' && <PainelRegras area="runtime" />}
              {secao === 'protocolo' && <PainelRegras area="protocolo" />}
              {secao === 'learning' && (
                <>
                  <PainelRegras area="learning" mostrarProtocolo={false} />
                  <div className="mt-7 pt-5 border-t border-white/[0.08]">
                    <h3 className="text-[13px] font-semibold text-gray-200 mb-1">Tags</h3>
                    <PainelTagsConfig />
                  </div>
                </>
              )}
              {secao === 'perguntas' && <PainelTeses />}
              {secao === 'organizacao-regras' && (
                <>
                  <PainelRegras area="organizacao" mostrarProtocolo={false} />
                  <div className="mt-7 pt-5 border-t border-white/[0.08]">
                    <h3 className="text-[13px] font-semibold text-gray-200 mb-1">Squads deste projeto</h3>
                    <PainelSquads />
                  </div>
                </>
              )}
      {secao === 'perguntas' && <PainelTeses />}
              {secao === 'xp' && <PainelRegras area="xp" mostrarProtocolo={false} />}
              {secao === 'nocturn' && <SecaoNocturn />}
              {secao === 'protecoes' && <PainelRegras area="protecoes" mostrarProtocolo={false} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
