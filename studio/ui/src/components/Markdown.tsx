import { H_SIZE } from '../lib/kinds'

/**
 * O renderizador de Markdown do Noctis.
 *
 * Morava dentro do Drawer, o que passou a ser um problema quando a ficha do
 * agente precisou dele: o Drawer já importa a ficha, e importar de volta
 * fecharia um ciclo. Ele nunca foi da gaveta — é de quem precisar mostrar
 * texto escrito por gente.
 */

function inline(src: string): React.ReactNode[] {
  // Ordem importa: o código cru é fatiado primeiro para que ` ** ` dentro de
  // um trecho de código não vire negrito.
  const out: React.ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index))
    if (m[1]) out.push(<code key={k++} className="px-1 py-0.5 rounded bg-[#0f0f0f] border border-gray-800 text-[11.5px] text-blue-300">{m[1]}</code>)
    else if (m[2]) out.push(<strong key={k++} className="text-gray-100 font-semibold">{m[2]}</strong>)
    else if (m[3]) out.push(<em key={k++} className="italic">{m[3]}</em>)
    else if (m[4]) out.push(<a key={k++} href={m[5]} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{m[4]}</a>)
    last = re.lastIndex
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

export function MarkdownView({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  const lines = text.split('\n')
  let i = 0, k = 0

  const isTableRow = (s: string) => s.trim().startsWith('|') && s.trim().endsWith('|')
  const cells = (s: string) => s.trim().slice(1, -1).split('|').map(c => c.trim())

  while (i < lines.length) {
    const ln = lines[i]

    if (ln.trim().startsWith('```')) {              // bloco de código
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push(
        <pre key={k++} className="my-3 p-3 rounded-lg bg-[#0f0f0f] border border-gray-800 overflow-x-auto text-[11.5px] leading-relaxed text-gray-300">
          {buf.join('\n')}
        </pre>)
      continue
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(ln)
    if (h) {
      const lvl = h[1].length
      blocks.push(<div key={k++} className={H_SIZE[lvl - 1]}>{inline(h[2])}</div>)
      i++; continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) {         // regra horizontal
      blocks.push(<hr key={k++} className="my-4 border-gray-800" />); i++; continue
    }

    if (isTableRow(ln) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = cells(ln)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={k++} className="my-3 overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse">
            <thead><tr>{head.map((c, j) => (
              <th key={j} className="text-left font-semibold text-gray-400 border-b border-gray-700 py-1.5 pr-3 align-top">{inline(c)}</th>
            ))}</tr></thead>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => (
                <td key={j} className="border-b border-gray-850 py-1.5 pr-3 align-top text-gray-300" style={{ borderColor: '#1f1f1f' }}>{inline(c)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>)
      continue
    }

    if (/^\s*>/.test(ln)) {                          // citação
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(
        <blockquote key={k++} className="my-3 pl-3 border-l-2 border-gray-700 text-gray-400 italic">
          {buf.map((b, j) => <p key={j} className="my-0.5">{inline(b)}</p>)}
        </blockquote>)
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(ln)) {            // lista
      const ord = /^\s*\d+\./.test(ln)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''))
      }
      const List = ord ? 'ol' : 'ul'
      blocks.push(
        <List key={k++} className={`my-2 pl-5 space-y-1 ${ord ? 'list-decimal' : 'list-disc'} marker:text-gray-600`}>
          {items.map((it, j) => <li key={j} className="text-gray-300">{inline(it)}</li>)}
        </List>)
      continue
    }

    if (!ln.trim()) { i++; continue }

    const buf: string[] = []                          // parágrafo
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|\s*>|```)/.test(lines[i])
           && !isTableRow(lines[i])) buf.push(lines[i++])

    // Trava contra laço infinito, e não é hipótese: uma linha `| a | b |` que
    // NÃO venha seguida da linha separadora não é consumida pelo ramo da
    // tabela, e o laço do parágrafo a recusa. Sem isto, `i` ficava parado e a
    // aba inteira congelava ao abrir uma memória com uma linha dessas solta —
    // a primeira que testei tinha 102. Quem não achou dono vira texto puro.
    if (!buf.length) buf.push(lines[i++])

    blocks.push(<p key={k++} className="my-2 text-gray-300 leading-relaxed">{inline(buf.join(' '))}</p>)
  }

  return <div className="text-[13px]">{blocks}</div>
}
