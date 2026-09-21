/**
 * O identificador de um recurso, para colar numa conversa com o agente.
 *
 * O formato é o mesmo par que o backend usa como chave de identidade — `kind` e
 * nome —, então o que se cola aqui é exatamente o que o agente precisa para
 * encontrar o arquivo, sem tradução no meio. Lanes e mapas não são arquivos:
 * levam o id do arranjo, com o nome junto para a pessoa saber o que copiou.
 */
export type Referencia =
  | { tipo: 'recurso'; kind: string; nome: string }
  | { tipo: 'lane'; id: string; nome: string }
  | { tipo: 'mapa'; id: string; nome: string }

export function textoDaReferencia(r: Referencia): string {
  if (r.tipo === 'recurso') return `${r.kind}:${r.nome}`
  return `${r.tipo}:${r.id} · ${r.nome}`
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
