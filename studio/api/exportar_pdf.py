"""Exportar memória, recurso ou lane como PDF — o documento inteiro, não um resumo.

O caminho é: montar um HTML de impressão aqui e mandar o Chrome imprimi-lo
(`tools/pdf/html2pdf.mjs`). O Chrome imprimindo dá PDF vetorial, com texto
selecionável e do tamanho certo; rasterizar screenshot dá o contrário das três
coisas.

O HTML é claro, não escuro: o Noctis é escuro na tela porque se olha para ele
horas a fio, mas PDF se lê impresso ou em leitor branco, e fundo preto vira
mancha de tinta. O que se mantém do produto é a cor do tipo, em filetes e selos.
"""
from __future__ import annotations

import html
import re
import subprocess
import tempfile
from pathlib import Path


# ── Markdown ──────────────────────────────────────────────────────────────────
# Um subconjunto deliberado: títulos, listas, tabelas, código, citação, regra,
# imagem e os inlines. É o que as memórias do sistema usam. O que não estiver
# aqui sai como parágrafo — nunca some, que é o que "na íntegra" exige.

_IMG = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_CODE = re.compile(r"`([^`]+)`")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITAL = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")


def _inline(txt: str, base_imagens: Path | None = None) -> str:
    out = html.escape(txt)

    def img(m: re.Match) -> str:
        alt, src = m.group(1), m.group(2)
        if base_imagens and not src.startswith(("http://", "https://", "file:")):
            p = (base_imagens / src).resolve()
            src = p.as_uri() if p.exists() else src
        return f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(alt, quote=True)}">'

    out = _IMG.sub(img, out)
    out = _LINK.sub(lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', out)
    out = _CODE.sub(lambda m: f"<code>{m.group(1)}</code>", out)
    out = _BOLD.sub(lambda m: f"<strong>{m.group(1)}</strong>", out)
    out = _ITAL.sub(lambda m: f"<em>{m.group(1)}</em>", out)
    return out


def markdown_para_html(texto: str, base_imagens: Path | None = None) -> str:
    linhas = texto.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i = 0
    while i < len(linhas):
        ln = linhas[i]

        # bloco de código: sai literal, sem interpretar nada dentro
        if ln.startswith("```"):
            lang = ln[3:].strip()
            corpo: list[str] = []
            i += 1
            while i < len(linhas) and not linhas[i].startswith("```"):
                corpo.append(linhas[i])
                i += 1
            i += 1
            cls = f' data-lang="{html.escape(lang, quote=True)}"' if lang else ""
            out.append(f"<pre{cls}><code>{html.escape(chr(10).join(corpo))}</code></pre>")
            continue

        if not ln.strip():
            i += 1
            continue

        h = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if h:
            n = len(h.group(1))
            out.append(f"<h{n}>{_inline(h.group(2), base_imagens)}</h{n}>")
            i += 1
            continue

        if re.match(r"^\s*([-*_])\1{2,}\s*$", ln):
            out.append("<hr>")
            i += 1
            continue

        # tabela: cabeçalho, separador e o corpo até a primeira linha sem cano
        if "|" in ln and i + 1 < len(linhas) and re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", linhas[i + 1]):
            def celulas(s: str) -> list[str]:
                return [c.strip() for c in s.strip().strip("|").split("|")]
            cab = celulas(ln)
            i += 2
            corpo_tab: list[list[str]] = []
            while i < len(linhas) and "|" in linhas[i] and linhas[i].strip():
                corpo_tab.append(celulas(linhas[i]))
                i += 1
            ths = "".join(f"<th>{_inline(c, base_imagens)}</th>" for c in cab)
            trs = "".join(
                "<tr>" + "".join(f"<td>{_inline(c, base_imagens)}</td>" for c in linha) + "</tr>"
                for linha in corpo_tab)
            out.append(f"<table><thead><tr>{ths}</tr></thead><tbody>{trs}</tbody></table>")
            continue

        if re.match(r"^\s*>\s?", ln):
            cit: list[str] = []
            while i < len(linhas) and re.match(r"^\s*>\s?", linhas[i]):
                cit.append(re.sub(r"^\s*>\s?", "", linhas[i]))
                i += 1
            out.append(f"<blockquote>{_inline(' '.join(cit), base_imagens)}</blockquote>")
            continue

        lista = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", ln)
        if lista:
            ordenada = not lista.group(2) in ("-", "*", "+")
            itens: list[str] = []
            while i < len(linhas):
                m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", linhas[i])
                if not m:
                    break
                itens.append(_inline(m.group(3), base_imagens))
                i += 1
            tag = "ol" if ordenada else "ul"
            lis = "".join(f"<li>{t}</li>" for t in itens)
            out.append(f"<{tag}>{lis}</{tag}>")
            continue

        # parágrafo: junta até a linha em branco
        par: list[str] = []
        while i < len(linhas) and linhas[i].strip() and not re.match(
                r"^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s)", linhas[i]):
            par.append(linhas[i])
            i += 1
        if par:
            out.append(f"<p>{_inline(' '.join(par), base_imagens)}</p>")
        else:
            i += 1

    return "\n".join(out)


# ── Documento ─────────────────────────────────────────────────────────────────

ESTILO = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; background: #fff; color: #18181b;
  font: 10.5pt/1.55 "Segoe UI", -apple-system, system-ui, sans-serif;
}
.capa { border-bottom: 2px solid #e4e4e7; padding-bottom: 10px; margin-bottom: 18px; }
.capa h1 { font-size: 19pt; margin: 0 0 4px; letter-spacing: -.01em; }
.meta { font-size: 8.5pt; color: #71717a; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.selo {
  font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  padding: 2px 6px; border-radius: 4px;
}
/* Cada recurso começa numa página nova: numa lane com oito memórias, a emenda
   entre uma e outra tem de ser óbvia ao folhear. */
.recurso { break-before: page; }
.recurso:first-of-type { break-before: auto; }
.recurso > h2 {
  font-size: 15pt; margin: 0 0 2px; padding-left: 8px;
  border-left: 4px solid var(--cor, #3f3f46);
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; }
h3 { font-size: 12.5pt; margin: 16px 0 5px; }
h4 { font-size: 11pt; margin: 13px 0 4px; }
h5, h6 { font-size: 10pt; margin: 11px 0 3px; color: #3f3f46; }
p { margin: 7px 0; }
ul, ol { margin: 7px 0; padding-left: 20px; }
li { margin: 2.5px 0; }
a { color: #1d4ed8; text-decoration: none; }
code {
  font: 9pt/1.4 "Cascadia Mono", Consolas, monospace;
  background: #f4f4f5; padding: 1px 4px; border-radius: 3px;
}
pre {
  background: #fafafa; border: 1px solid #e4e4e7; border-left: 3px solid #a1a1aa;
  border-radius: 5px; padding: 9px 11px; overflow: hidden;
  white-space: pre-wrap; word-break: break-word; break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8.5pt; }
blockquote {
  margin: 9px 0; padding: 2px 0 2px 12px;
  border-left: 3px solid #d4d4d8; color: #52525b;
}
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; }
th, td { border: 1px solid #e4e4e7; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #fafafa; font-weight: 600; }
tr { break-inside: avoid; }
img { max-width: 100%; height: auto; border-radius: 5px; break-inside: avoid; }
hr { border: 0; border-top: 1px solid #e4e4e7; margin: 16px 0; }
.anexos { margin-top: 14px; border-top: 1px solid #e4e4e7; padding-top: 8px; }
.anexos h4 { margin: 0 0 5px; font-size: 9.5pt; color: #52525b; }
.anexos ul { font-size: 9pt; color: #52525b; }
.galeria { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.galeria img { width: calc(50% - 4px); }
.vazio { color: #a1a1aa; font-style: italic; }
"""


def _capa(titulo: str, linhas_meta: list[str]) -> str:
    meta = " · ".join(html.escape(m) for m in linhas_meta if m)
    return (f'<div class="capa"><h1>{html.escape(titulo)}</h1>'
            f'<div class="meta">{meta}</div></div>')


def documento_html(titulo: str, meta: list[str], corpo: str) -> str:
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
            f'<title>{html.escape(titulo)}</title><style>{ESTILO}</style></head>'
            f'<body>{_capa(titulo, meta)}{corpo}</body></html>')


def bloco_recurso(nome: str, cor: str, selo: str, meta: list[str],
                  html_corpo: str, anexos: list[dict] | None = None,
                  imagens: list[Path] | None = None) -> str:
    partes = [f'<section class="recurso" style="--cor:{html.escape(cor, quote=True)}">',
              f'<h2>{html.escape(nome)}</h2>']
    linha = []
    if selo:
        linha.append(f'<span class="selo" style="color:{html.escape(cor, quote=True)};'
                     f'background:{html.escape(cor, quote=True)}1f">{html.escape(selo)}</span>')
    linha += [html.escape(m) for m in meta if m]
    if linha:
        partes.append(f'<div class="meta">{" · ".join(linha)}</div>')
    partes.append(html_corpo or '<p class="vazio">(vazio)</p>')

    if imagens:
        partes.append('<div class="galeria">')
        for p in imagens:
            partes.append(f'<img src="{p.resolve().as_uri()}" alt="">')
        partes.append("</div>")
    if anexos:
        itens = "".join(
            f'<li>{html.escape(a["name"])} · {a.get("size", 0) // 1024} KB</li>' for a in anexos)
        partes.append(f'<div class="anexos"><h4>Anexos ({len(anexos)})</h4><ul>{itens}</ul></div>')
    partes.append("</section>")
    return "".join(partes)


# ── Impressão ─────────────────────────────────────────────────────────────────

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / "tools" / "pdf" / "html2pdf.mjs"


def html_para_pdf(html_txt: str, destino: Path) -> Path:
    """Escreve o HTML num temporário e manda o Chrome imprimir.

    O temporário vive no disco (e não em memória) porque as imagens anexadas são
    referenciadas por `file://` relativo — sem um arquivo de verdade, elas não
    resolveriam.
    """
    if not SCRIPT.exists():
        raise RuntimeError(f"script de impressão não encontrado: {SCRIPT}")
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                     encoding="utf-8") as f:
        f.write(html_txt)
        tmp = Path(f.name)
    try:
        r = subprocess.run(["node", str(SCRIPT), str(tmp), str(destino)],
                           capture_output=True, text=True, timeout=120)
        if r.returncode != 0 or not destino.exists():
            raise RuntimeError((r.stderr or r.stdout or "falha ao gerar o PDF").strip()[:600])
        return destino
    finally:
        tmp.unlink(missing_ok=True)
