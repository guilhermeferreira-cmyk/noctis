#!/usr/bin/env node
/**
 * HTML → PDF pelo Chrome, sem rasterizar.
 *
 *   node html2pdf.mjs entrada.html saida.pdf
 *
 * Usa `page.pdf()`, que imprime o documento como o próprio Chrome imprime:
 * texto vetorial, selecionável, do tamanho certo. A alternativa tentadora —
 * tirar screenshot e empacotar num PDF — rasteriza, diverge do que o browser
 * mostra e erra as dimensões; foi assim que se aprendeu, e não se repete.
 *
 * O Chromium é o mesmo que o extrator de DNA já usa: o do Playwright se estiver
 * baixado, senão o Chrome ou o Edge instalados.
 */
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function caminhoDoBrowser() {
  if (process.env.DNA_BROWSER) return process.env.DNA_BROWSER
  const pw = join(process.env.LOCALAPPDATA || '', 'ms-playwright')
  if (existsSync(pw)) {
    const dirs = readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()
    for (const d of dirs) {
      const exe = join(pw, d, 'chrome-win', 'chrome.exe')
      if (existsSync(exe)) return exe
    }
  }
  for (const c of CANDIDATOS) if (existsSync(c)) return c
  throw new Error('Nenhum Chromium/Chrome/Edge encontrado. Defina DNA_BROWSER.')
}

const [entrada, saida] = process.argv.slice(2)
if (!entrada || !saida) {
  console.error('uso: node html2pdf.mjs entrada.html saida.pdf')
  process.exit(2)
}

const browser = await chromium.launch({
  executablePath: caminhoDoBrowser(),
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
})
try {
  const page = await browser.newPage()
  // `file://` para as imagens anexadas resolverem por caminho local.
  await page.goto('file:///' + resolve(entrada).replace(/\\/g, '/'), {
    waitUntil: 'networkidle', timeout: 30000,
  })
  // no Playwright é `emulateMedia`; `emulateMediaType` é do Puppeteer
  await page.emulateMedia({ media: 'print' })
  await page.pdf({
    path: saida,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font:9px -apple-system,Segoe UI,sans-serif;color:#9ca3af;padding:0 16mm;display:flex;justify-content:space-between">' +
      '<span class="title"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
  })
} finally {
  await browser.close()
}
