import { getProject } from '../api'

/**
 * O identificador de um recurso, para colar numa conversa com o agente.
 *
 * Antes era só `kind:nome` — `memory:voz_da_marca`. Funcionava enquanto havia
 * um projeto na cabeça de quem colava; com dez projetos e o mesmo nome de
 * arquivo em mais de um, virava ambiguidade: o agente recebia um endereço que
 * não dizia de onde.
 *
 * Agora leva o rastro inteiro, e no formato que o Noctis já usa para tudo — o
 * CAMINHO. Isto aqui é um sistema de arquivos, então o endereço mais honesto
 * de um recurso é onde ele está. Quem cola ganha algo que o agente de IDE
 * abre direto, sem tradução no meio:
 *
 *     projects/tessera_web_site/agents/pen_dev.yaml · Pen Dev (Aladfar)
 *
 * O nome legível vem depois do ponto médio para a pessoa saber o que copiou;
 * o caminho vem primeiro porque é a parte acionável.
 *
 * Nada parseia esta string — nem o servidor, nem o `xp.py`. Ela é lida por
 * gente e por agente, e foi por isso que o formato pôde mudar sem migração.
 */

/** Onde cada tipo mora dentro do projeto. */
const PASTA: Record<string, string> = {
  memory: 'memory', agent: 'agents', flow: 'flows', persona: 'personas',
}
const EXT: Record<string, string> = {
  memory: '.md', agent: '.yaml', flow: '.yaml', persona: '.yaml',
}

export type Referencia =
  | { tipo: 'recurso'; kind: string; nome: string; rotulo?: string }
  | { tipo: 'lane'; id: string; nome: string }
  | { tipo: 'mapa'; id: string; nome: string }

export function textoDaReferencia(r: Referencia, projeto = getProject()): string {
  if (r.tipo === 'recurso') {
    const pasta = PASTA[r.kind] || r.kind
    const caminho = `projects/${projeto}/${pasta}/${r.nome}${EXT[r.kind] ?? ''}`
    return r.rotulo ? `${caminho} · ${r.rotulo}` : caminho
  }
  // Mapa é arquivo também; lane é um arranjo dentro de um, e por isso fica
  // com o id — não há caminho para apontar.
  if (r.tipo === 'mapa') return `projects/${projeto}/canvases/${r.id}.json · ${r.nome}`
  return `${projeto} · lane:${r.id} · ${r.nome}`
}

/**
 * Copia e diz se conseguiu.
 *
 * `navigator.clipboard` só existe em contexto seguro — e `http://127.0.0.1` é
 * tratado como seguro pelos navegadores, mas um acesso pela rede local não
 * seria. Por isso o caminho antigo (`execCommand`) fica de reserva: sem ele, o
 * botão simplesmente não faria nada em algumas máquinas, sem avisar.
 */
export async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* cai para o modo antigo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
