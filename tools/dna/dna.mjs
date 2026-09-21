#!/usr/bin/env node
/**
 * dna — extrator de DNA visual de sites.
 *
 *   node dna.mjs map     <url>            monta o plano a partir do sitemap
 *   node dna.mjs capture <plano|url>      captura profunda, página a página
 *   node dna.mjs rollup  <pasta>          agrega tudo num dossiê de evidência
 *
 * O que ele NÃO faz: ler o que o site diz sobre si mesmo. Tudo que sai daqui
 * foi medido no browser renderizando de verdade — computed style, caixa,
 * hover real com o mouse, diff antes/depois do scroll.
 *
 * Flags úteis:
 *   --out <dir>          destino (default: outputs/dna/<host>_<data>)
 *   --limit <n>          corta o plano em n páginas
 *   --sample <n>         quantos representantes por template repetido (default 3)
 *   --concurrency <n>    páginas em paralelo (default 3)
 *   --viewports <list>   default 1440,768,390
 *   --fast               só o viewport principal, sem shots de seção
 *   --no-shots           nenhum screenshot
 *   --only <regex>       filtra as URLs do plano
 */

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './probe.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', '..');

// ── argumentos ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const target = argv[1];
const flag = (name, def = null) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};
const has = (name) => argv.includes('--' + name);

const CHROME_CANDIDATES = [
  process.env.DNA_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

function browserPath() {
  // 1) chromium do playwright, se já estiver baixado na máquina
  const pw = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (existsSync(pw)) {
    const dirs = readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort();
    for (const d of dirs.reverse()) {
      const exe = join(pw, d, 'chrome-win', 'chrome.exe');
      if (existsSync(exe)) return exe;
    }
  }
  // 2) Chrome / Edge instalados
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error('Nenhum Chromium/Chrome/Edge encontrado. Defina DNA_BROWSER.');
}

const log = (...a) => console.log(...a);
const slugify = (u) => {
  const url = new URL(u);
  const p = url.pathname.replace(/\/$/, '') || '/home';
  return (p === '/home' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')).slice(0, 80).toLowerCase();
};
const ensure = (d) => { mkdirSync(d, { recursive: true }); return d; };
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// MAP — sitemap → taxonomia de templates → plano de captura
// ─────────────────────────────────────────────────────────────────────────────
async function fetchText(u) {
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; dna-extractor/1.0)' } });
  if (!r.ok) throw new Error(u + ' → HTTP ' + r.status);
  return r.text();
}

async function collectSitemap(base, seen = new Set(), depth = 0) {
  if (depth > 3) return [];
  let xml;
  try { xml = await fetchText(base); } catch (e) { log('  ! ' + e.message); return []; }
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
  const isIndex = /<sitemapindex/i.test(xml);
  if (!isIndex) return locs;
  let all = [];
  for (const l of locs) {
    if (seen.has(l)) continue;
    seen.add(l);
    all = all.concat(await collectSitemap(l, seen, depth + 1));
  }
  return all;
}

function classify(urls, origin) {
  const groups = {};
  for (const u of urls) {
    let p;
    try { p = new URL(u).pathname; } catch { continue; }
    const segs = p.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
    let key;
    if (segs.length === 0) key = '/ (home)';
    else if (segs.length === 1) key = '/' + segs[0];
    else key = '/' + segs[0] + '/*'.repeat(segs.length - 1);
    (groups[key] = groups[key] || []).push(u);
  }
  return groups;
}

async function cmdMap() {
  const site = new URL(target);
  const origin = site.origin;
  log('▶ mapeando ' + origin);

  let urls = [];
  for (const sm of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
    urls = await collectSitemap(origin + sm);
    if (urls.length) { log('  sitemap: ' + origin + sm + ' → ' + urls.length + ' URLs'); break; }
  }
  if (!urls.length) {
    log('  sem sitemap — caindo para os links da home');
    const html = await fetchText(origin);
    urls = [...html.matchAll(/href="([^"#?]+)"/g)].map(m => m[1])
      .filter(h => h.startsWith('/') || h.startsWith(origin))
      .map(h => h.startsWith('/') ? origin + h : h);
    urls = [...new Set(urls)];
  }
  urls = [...new Set(urls.map(u => u.split('#')[0].replace(/\/$/, '') || origin))];

  const groups = classify(urls, origin);
  const sample = +(flag('sample', 3));
  const plan = [];
  const taxonomy = [];

  for (const [key, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...list].sort((a, b) => a.length - b.length);
    const picked = list.length <= 3 ? sorted : [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].slice(0, sample);
    taxonomy.push({ pattern: key, count: list.length, sampled: picked.length, examples: sorted.slice(0, 3) });
    picked.forEach(u => plan.push({ url: u, pattern: key, groupSize: list.length }));
  }

  // a home primeiro, depois páginas únicas, depois amostras de templates
  plan.sort((a, b) => (a.url === origin ? -1 : b.url === origin ? 1 : a.groupSize - b.groupSize));

  const out = flag('out') || join(ROOT, 'outputs', 'dna', site.hostname.replace(/\W+/g, '-') + '_' + new Date().toISOString().slice(0, 10));
  ensure(out);
  writeJson(join(out, 'plan.json'), { origin, generatedAt: new Date().toISOString(), totalUrls: urls.length, taxonomy, plan });
  writeFileSync(join(out, 'urls.txt'), urls.join('\n'), 'utf8');

  log('\n  taxonomia de rotas:');
  taxonomy.forEach(t => log('   ' + String(t.count).padStart(4) + '  ' + t.pattern + (t.count > 3 ? '  (amostra: ' + t.sampled + ')' : '')));
  log('\n✓ plano: ' + plan.length + ' páginas para capturar de ' + urls.length + ' URLs');
  log('  ' + join(out, 'plan.json'));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPTURE — o trabalho pesado
// ─────────────────────────────────────────────────────────────────────────────
async function dismissOverlays(page) {
  const texts = ['Accept all', 'Accept All', 'Aceitar todos', 'Accept cookies', 'Accept', 'I agree', 'Got it', 'Allow all', 'Aceitar'];
  for (const t of texts) {
    try {
      const b = page.getByRole('button', { name: t, exact: false }).first();
      if (await b.isVisible({ timeout: 600 })) { await b.click({ timeout: 1500 }); await page.waitForTimeout(400); return t; }
    } catch {}
  }
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i]').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && el.getBoundingClientRect().height > 60) el.style.display = 'none';
      });
    });
  } catch {}
  return null;
}

async function autoScroll(page, step = 0.6, pause = 260) {
  await page.evaluate(async ({ step, pause }) => {
    const h = document.documentElement.scrollHeight;
    const vh = window.innerHeight;
    for (let y = 0; y < h; y += vh * step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, pause));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 600));
  }, { step, pause });
}

async function capturePage(browser, entry, outRoot, opts) {
  const url = entry.url;
  const slug = slugify(url) || 'home';
  const dir = ensure(join(outRoot, 'pages', slug));
  const t0 = Date.now();

  const ctx = await browser.newContext({
    viewport: { width: opts.viewports[0], height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(COLOR_HELPER);
  const page = await ctx.newPage();

  const net = { css: [], fonts: [], json: [], scripts: [], images: 0, bytes: 0 };
  const cssTexts = [];
  page.on('response', async (res) => {
    try {
      const u = res.url();
      const ct = (res.headers()['content-type'] || '').split(';')[0];
      if (ct === 'text/css' || /\.css(\?|$)/.test(u)) {
        net.css.push(u.slice(0, 260));
        if (cssTexts.length < 40) { const t = await res.text().catch(() => ''); if (t) cssTexts.push({ u, t }); }
      } else if (/font\//.test(ct) || /\.(woff2?|ttf|otf)(\?|$)/.test(u)) net.fonts.push(u.slice(0, 260));
      else if (/\.(json|lottie)(\?|$)/.test(u) && /lottie|anim/i.test(u)) net.json.push(u.slice(0, 260));
      else if (ct.startsWith('image/')) net.images++;
      else if (/javascript/.test(ct)) net.scripts.push(u.split('/').pop().split('?')[0].slice(0, 60));
    } catch {}
  });

  const result = { url, pattern: entry.pattern, slug, capturedAt: new Date().toISOString() };

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });
    await page.waitForTimeout(1200);
    result.cookieBanner = await dismissOverlays(page);
    await page.waitForTimeout(300);

    // header no topo
    const headerTop = await page.evaluate(() => {
      const h = document.querySelector('header,nav,[class*="navbar" i]');
      if (!h) return null;
      const cs = getComputedStyle(h);
      return { position: cs.position, bg: cs.backgroundColor, backdrop: cs.backdropFilter, height: Math.round(h.getBoundingClientRect().height), shadow: cs.boxShadow.slice(0, 80), transform: cs.transform, borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor };
    });

    // estado ANTES do scroll (o que está escondido esperando o reveal)
    const before = await page.evaluate(P.snapshotAnimatable);

    // alvos de hover, marcados no DOM para conseguir mirar depois
    const hoverTargets = await page.evaluate(P.markHoverTargets);

    // hover real, com o mouse. O "antes" é lido no instante anterior ao hover,
    // e a assinatura inclui a subárvore — senão group-hover (Tailwind) e
    // qualquer efeito que viva no filho passam batido.
    const hovers = [];
    for (let i = 0; i < hoverTargets.length && i < 14; i++) {
      const sel = '[data-dna-hover="' + i + '"]';
      try {
        const el = await page.$(sel);
        if (!el) continue;
        await el.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.mouse.move(4, 4);
        await page.waitForTimeout(200);
        const before = await page.$eval(sel, HOVER_SIG);
        await el.hover({ timeout: 3000, force: true });
        await page.waitForTimeout(700);
        const after = await page.$eval(sel, HOVER_SIG);
        const t = hoverTargets[i];
        const diff = diffStyleString(before.self, after.self);
        const childDiff = [];
        for (const k of Object.keys(before.kids)) {
          if (after.kids[k] && after.kids[k] !== before.kids[k]) {
            childDiff.push(k + ': ' + diffStyleString(before.kids[k], after.kids[k]).join('; '));
          }
        }
        hovers.push({
          kind: t.kind, text: t.text, tag: t.tag, cls: t.cls, box: t.box,
          transition: t.transition,
          changed: diff.length > 0 || childDiff.length > 0,
          diff,
          childDiff: childDiff.slice(0, 6),
          pseudo: before.pseudo !== after.pseudo ? before.pseudo + ' → ' + after.pseudo : null,
          cursor: after.cursor,
        });
        await page.mouse.move(4, 4);
        await page.waitForTimeout(150);
      } catch {}
    }

    // header depois do scroll
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(900);
    const headerScrolled = await page.evaluate(() => {
      const h = document.querySelector('header,nav,[class*="navbar" i]');
      if (!h) return null;
      const cs = getComputedStyle(h);
      return { position: cs.position, bg: cs.backgroundColor, backdrop: cs.backdropFilter, height: Math.round(h.getBoundingClientRect().height), shadow: cs.boxShadow.slice(0, 80), transform: cs.transform, borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor };
    });

    // percorre a página inteira: dispara reveals, carrega lazy
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await autoScroll(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);

    const after = await page.evaluate(P.snapshotAnimatable);
    const revealed = [];
    const revealPatterns = {};
    for (const k of Object.keys(before)) {
      if (!after[k] || after[k].v === before[k].v) continue;
      const [o1, t1, f1, v1, c1, m1] = before[k].v.split('|');
      const [o2, t2, f2, v2, c2, m2] = after[k].v.split('|');
      const props = [];
      if (o1 !== o2) props.push('opacity ' + o1 + '→' + o2);
      if (t1 !== t2) props.push('transform ' + t1.slice(0, 50) + ' → ' + t2.slice(0, 50));
      if (f1 !== f2) props.push('filter ' + f1 + ' → ' + f2);
      if (v1 !== v2) props.push('visibility ' + v1 + '→' + v2);
      if (c1 !== c2) props.push('clip-path ' + c1.slice(0, 40) + ' → ' + c2.slice(0, 40));
      if (m1 !== m2) props.push('max-height ' + m1 + '→' + m2);
      revealed.push({ el: before[k].label, top: before[k].top, props });
      props.forEach(p => { const key = p.split(' ')[0]; revealPatterns[key] = (revealPatterns[key] || 0) + 1; });
    }

    result.header = { atTop: headerTop, afterScroll: headerScrolled, changes: headerTop && headerScrolled ? diffObj(headerTop, headerScrolled) : [] };
    result.hovers = hovers;
    result.scrollReveal = {
      changedCount: revealed.length,
      byProperty: Object.entries(revealPatterns).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n })),
      sample: revealed.slice(0, 40),
    };

    // as quatro sondas
    result.tokens = await page.evaluate(P.probeTokens);
    result.structure = await page.evaluate(P.probeStructure);
    result.motion = await page.evaluate(P.probeMotion);
    result.illustration = await page.evaluate(P.probeIllustration);

    // keyframes que o CSSOM não deixou ler (stylesheet cross-origin)
    const kfFromNet = [];
    const mediaQueries = {};
    for (const { u, t } of cssTexts) {
      for (const m of t.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{([\s\S]{0,900}?)\n?\}\s*\n/g)) {
        kfFromNet.push({ name: m[1], body: m[2].replace(/\s+/g, ' ').trim().slice(0, 500), from: u.split('/').pop().slice(0, 40) });
      }
      for (const m of t.matchAll(/@media[^{]*\(([^)]*width[^)]*)\)/g)) {
        const k = m[1].replace(/\s+/g, '');
        mediaQueries[k] = (mediaQueries[k] || 0) + 1;
      }
    }
    result.motion.keyframesFromCss = dedupeBy(kfFromNet, 'name').slice(0, 50);
    result.breakpoints = Object.entries(mediaQueries).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([v, n]) => ({ v, n }));
    result.network = { cssFiles: net.css.length, fontFiles: [...new Set(net.fonts)].slice(0, 25), lottieJson: [...new Set(net.json)].slice(0, 12), images: net.images, scripts: [...new Set(net.scripts)].slice(0, 40) };

    // vetores salvos em arquivo: SVG inline e SVG externo referenciado
    if (!opts.noShots) {
      const svgDir = ensure(join(dir, 'svg'));
      const svgSources = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('svg')).map((s, i) => {
          const r = s.getBoundingClientRect();
          return { i, w: Math.round(r.width), h: Math.round(r.height), html: s.outerHTML.length < 400000 ? s.outerHTML : '' };
        }).filter(s => s.w >= 60 && s.h >= 60 && s.html).slice(0, 25);
      });
      svgSources.forEach(s => writeFileSync(join(svgDir, 'inline-' + String(s.i).padStart(2, '0') + '_' + s.w + 'x' + s.h + '.svg'), s.html, 'utf8'));

      const extSvgs = await page.evaluate(() => {
        const urls = new Set();
        document.querySelectorAll('img').forEach(i => {
          const s = i.currentSrc || i.src || '';
          if (/\.svg(\?|$)/i.test(s) && i.getBoundingClientRect().width >= 40) urls.add(s);
        });
        document.querySelectorAll('body *').forEach(e => {
          const b = getComputedStyle(e).backgroundImage;
          const m = b && b.match(/url\("?([^")]+\.svg[^")]*)"?\)/i);
          if (m) urls.add(new URL(m[1], location.href).href);
        });
        return Array.from(urls).slice(0, 20);
      });
      let saved = 0;
      for (const u of extSvgs) {
        try {
          const res = await fetch(u);
          if (!res.ok) continue;
          const txt = await res.text();
          if (txt.length > 500000) continue;
          writeFileSync(join(svgDir, 'ext-' + String(saved).padStart(2, '0') + '_' + (u.split('/').pop().split('?')[0].replace(/[^\w.-]/g, '').slice(0, 40) || 'asset.svg')), txt, 'utf8');
          saved++;
        } catch {}
      }
      result.svgFilesSaved = { inline: svgSources.length, external: saved };
    }

    // screenshots
    if (!opts.noShots) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(dir, 'shot-' + opts.viewports[0] + '.png'), fullPage: true, timeout: 60000 }).catch(e => log('   ! shot: ' + e.message.slice(0, 60)));

      if (!opts.fast) {
        const secDir = ensure(join(dir, 'sections'));
        await page.evaluate(() => {
          let root = document.querySelector('main') || document.body;
          let kids = Array.from(root.children).filter(e => e.getBoundingClientRect().height > 40);
          let g = 0;
          while (kids.length === 1 && kids[0].children.length > 1 && g++ < 4) kids = Array.from(kids[0].children).filter(e => e.getBoundingClientRect().height > 40);
          kids.forEach((el, i) => el.setAttribute('data-dna-sec', String(i)));
        });
        const secCount = Math.min(result.structure.sections.length, 14);
        for (let i = 0; i < secCount; i++) {
          try {
            const el = await page.$('[data-dna-sec="' + i + '"]');
            if (!el) continue;
            const b = await el.boundingBox();
            if (!b || b.height < 60 || b.height > 6000) continue;
            const s = result.structure.sections[i];
            await el.screenshot({ path: join(secDir, String(i).padStart(2, '0') + '_' + (s.type || 'sec').replace(/\W+/g, '-') + '.png'), timeout: 25000 });
          } catch {}
        }
      }

      // grid responsivo: remede a estrutura em cada viewport
      result.responsive = {};
      for (const vw of opts.viewports.slice(1)) {
        if (opts.fast) break;
        try {
          await page.setViewportSize({ width: vw, height: 900 });
          await page.waitForTimeout(900);
          await autoScroll(page, 0.8, 160);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(600);
          const st = await page.evaluate(P.probeStructure);
          result.responsive[vw] = {
            docHeight: st.docHeight,
            containerWidths: st.containerWidths,
            headerHeight: st.header && st.header.height,
            sections: st.sections.map(s => ({ i: s.i, type: s.type, h: s.box.h, padding: s.padding, grid: s.grid, headingStyle: s.headingStyle })),
          };
          await page.screenshot({ path: join(dir, 'shot-' + vw + '.png'), fullPage: true, timeout: 60000 }).catch(() => {});
        } catch (e) { log('   ! viewport ' + vw + ': ' + e.message.slice(0, 60)); }
      }
    }

    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.error = e.message.slice(0, 300);
    log('  ✗ ' + url + ' → ' + result.error);
  } finally {
    await ctx.close().catch(() => {});
  }

  result.ms = Date.now() - t0;
  writeJson(join(dir, 'page.json'), result);
  writeFileSync(join(dir, 'page.md'), renderPageMd(result), 'utf8');
  log('  ✓ ' + result.slug + '  ' + (result.structure ? result.structure.sectionCount + ' seções, ' : '') + (result.illustration ? result.illustration.svgs.length + ' svg, ' : '') + Math.round(result.ms / 1000) + 's');
  return result;
}

/**
 * Injetado em toda página antes do carregamento: converte qualquer notação de
 * cor para rgb()/rgba(). O Chrome computa color-mix() e oklch() para oklab(),
 * que não serve nem para ler nem para virar token. A conversão é feita à mão
 * (oklab → sRGB linear → sRGB) para não depender de suporte do canvas.
 */
const COLOR_HELPER = `
window.__dnaToRgb = (function () {
  var cache = {};
  function g(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
  return function (input) {
    if (!input) return input;
    var c = String(input).trim();
    if (cache[c] !== undefined) return cache[c];
    var out = c;
    var m = c.match(/^oklab\\(\\s*([\\d.eE+-]+%?)\\s+([\\d.eE+-]+%?)\\s+([\\d.eE+-]+%?)\\s*(?:\\/\\s*([\\d.eE+-]+%?)\\s*)?\\)$/);
    if (m) {
      var num = function (v, scale) { return v == null ? null : (String(v).endsWith('%') ? parseFloat(v) / 100 * scale : parseFloat(v)); };
      var L = num(m[1], 1), A = num(m[2], 0.4), B = num(m[3], 0.4);
      var alpha = m[4] == null ? 1 : num(m[4], 1);
      var l_ = L + 0.3963377774 * A + 0.2158037573 * B;
      var m_ = L - 0.1055613458 * A - 0.0638541728 * B;
      var s_ = L - 0.0894841775 * A - 1.2914855480 * B;
      var l = l_ * l_ * l_, mm = m_ * m_ * m_, s = s_ * s_ * s_;
      var rgb = [
        4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s
      ].map(function (v) { return Math.max(0, Math.min(255, Math.round(g(v) * 255))); });
      out = alpha >= 0.999
        ? 'rgb(' + rgb.join(', ') + ')'
        : 'rgba(' + rgb.join(', ') + ', ' + (Math.round(alpha * 1000) / 1000) + ')';
    } else if (!/^(rgb|#)/.test(c)) {
      try {
        var ctx = window.__dnaCtx || (window.__dnaCtx = document.createElement('canvas').getContext('2d'));
        if (ctx) { ctx.fillStyle = '#010203'; ctx.fillStyle = c; if (ctx.fillStyle !== '#010203') out = ctx.fillStyle; }
      } catch (e) {}
    }
    cache[c] = out;
    return out;
  };
})();
`;

// Assinatura de estado para o teste de hover. Roda no browser (page.$eval),
// no elemento e nos seus 10 primeiros descendentes.
const HOVER_SIG = (e) => {
  const rgb = (v) => (window.__dnaToRgb ? window.__dnaToRgb(v) : v);
  const sig = (n) => {
    const c = getComputedStyle(n);
    return [rgb(c.color), rgb(c.backgroundColor), rgb(c.borderColor), c.transform, c.boxShadow.slice(0, 80), c.opacity, c.filter, c.letterSpacing, c.textDecorationLine, c.backgroundImage.slice(0, 80)].join(' ~ ');
  };
  const kids = {};
  Array.from(e.querySelectorAll('*')).slice(0, 10).forEach((n, i) => {
    kids[i + ':' + n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '')] = sig(n);
  });
  const cs = getComputedStyle(e);
  const pb = getComputedStyle(e, '::before'), pa = getComputedStyle(e, '::after');
  return {
    self: sig(e), kids, cursor: cs.cursor,
    pseudo: ['::before ' + pb.width + '/' + pb.transform + '/' + pb.opacity, '::after ' + pa.width + '/' + pa.transform + '/' + pa.opacity].join(' | '),
  };
};

const STYLE_NAMES = ['color', 'background', 'border', 'transform', 'shadow', 'opacity', 'filter', 'letter-spacing', 'text-decoration', 'background-image'];
function diffStyleString(a, b) {
  const A = String(a).split(' ~ '), B = String(b).split(' ~ ');
  const out = [];
  for (let i = 0; i < STYLE_NAMES.length; i++) if (A[i] !== B[i]) out.push(STYLE_NAMES[i] + ': ' + A[i] + ' → ' + B[i]);
  return out;
}
function diffObj(a, b) {
  return Object.keys(a).filter(k => String(a[k]) !== String(b[k])).map(k => k + ': ' + a[k] + ' → ' + b[k]);
}
function dedupeBy(arr, key) {
  const seen = new Set();
  return arr.filter(x => (seen.has(x[key]) ? false : (seen.add(x[key]), true)));
}

// ── relatório humano por página ───────────────────────────────────────────────
function renderPageMd(r) {
  if (!r.ok) return '# ' + r.url + '\n\nFALHOU: ' + r.error + '\n';
  const L = [];
  const t = r.tokens, s = r.structure, m = r.motion, il = r.illustration;
  const list = (arr, n = 8) => (arr || []).slice(0, n).map(x => '`' + x.v + '` ×' + x.n).join(' · ');

  L.push('# ' + r.url);
  L.push('');
  L.push('`' + r.pattern + '` · ' + s.sectionCount + ' seções · ' + s.docHeight + 'px de altura · viewport ' + s.viewport.w + '×' + s.viewport.h);
  L.push('');
  L.push('## Estrutura — seções na ordem');
  L.push('');
  L.push('| # | tipo | altura | padding Y | fundo | heading | grid | mídia |');
  L.push('|---|---|---|---|---|---|---|---|');
  s.sections.forEach(x => {
    const pad = x.padding.split(' ');
    const media = Object.entries(x.media).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(' ') || '—';
    L.push('| ' + x.i + ' | ' + x.type + ' | ' + x.box.h + 'px | ' + pad[0] + '/' + pad[2] + ' | `' + x.bg + '` | ' + (x.heading ? x.heading.slice(0, 60) : '—') + ' | ' + (x.grid ? (x.grid.colCount || '?') + 'col ' + x.grid.gap : '—') + ' | ' + media + ' |');
  });
  L.push('');
  if (s.header) {
    L.push('**Header** ' + s.header.tag + ' · ' + s.header.position + ' · ' + s.header.height + 'px · bg `' + s.header.bg + '`' + (s.header.backdrop !== 'none' ? ' · backdrop `' + s.header.backdrop + '`' : ''));
    if (r.header && r.header.changes.length) L.push('**Header ao scrollar:** ' + r.header.changes.join(' · '));
    L.push('');
  }
  L.push('**Larguras de container:** ' + (s.containerWidths || []).map(w => w.w + 'px×' + w.n).join(' · '));
  L.push('');

  L.push('## Tipografia medida');
  L.push('');
  L.push('| papel | size/weight/lh/ls | família | ocorrências |');
  L.push('|---|---|---|---|');
  Object.entries(t.typeScale).forEach(([role, arr]) => {
    arr.slice(0, 3).forEach(x => L.push('| ' + role + ' | ' + x.size + ' / ' + x.weight + ' / ' + x.lineHeight + ' / ' + x.letterSpacing + (x.textTransform !== 'none' ? ' / ' + x.textTransform : '') + ' | ' + x.family + ' | ' + x.n + ' |'));
  });
  L.push('');
  L.push('**Famílias:** ' + list(t.families, 6));
  L.push('**Tamanhos:** ' + list(t.fontSizes, 14));
  L.push('**Pesos:** ' + list(t.fontWeights, 8));
  L.push('**Font-faces carregadas:** ' + (t.fontFaces || []).map(f => f.family + ' ' + f.weight).slice(0, 12).join(' · '));
  L.push('');

  L.push('## Cor');
  L.push('');
  L.push('**Fundos por área:** ' + list(t.palette.bgByArea, 10));
  L.push('**Texto:** ' + list(t.palette.textColors, 10));
  L.push('**Bordas:** ' + list(t.palette.borders, 6));
  L.push('**Gradientes:** ' + (t.palette.gradients || []).length);
  (t.palette.gradients || []).slice(0, 6).forEach(g => L.push('- `' + g.v.slice(0, 180) + '` ×' + g.n));
  if (Object.keys(t.cssVars).length) {
    L.push('');
    L.push('**Custom properties no :root:** ' + Object.keys(t.cssVars).length);
    Object.entries(t.cssVars).slice(0, 40).forEach(([k, v]) => L.push('- `' + k + ': ' + v + '`'));
  }
  L.push('');

  L.push('## Forma e superfície');
  L.push('');
  L.push('**Raios:** ' + (list(t.radii, 10) || '— (tudo reto)'));
  L.push('**Sombras:** ' + ((t.shadows || []).slice(0, 5).map(x => '`' + x.v + '` ×' + x.n).join(' · ') || '— (nenhuma sombra na página)'));
  L.push('**Padding vertical de blocos largos:** ' + list(t.sectionPaddingY, 10));
  L.push('**Gaps:** ' + list(t.gaps, 10));
  if ((t.blendModes || []).length) L.push('**Blend modes:** ' + list(t.blendModes, 6));
  if ((t.backdropFilters || []).length) L.push('**Backdrop filters:** ' + list(t.backdropFilters, 5));
  if ((t.filters || []).length) L.push('**Filtros:** ' + list(t.filters, 6));
  L.push('');

  L.push('## Motion');
  L.push('');
  L.push('**Libs detectadas:** ' + Object.entries(m.libs).filter(([, v]) => v).map(([k, v]) => k + (typeof v === 'number' ? '(' + v + ')' : '')).join(' · ') || '—');
  L.push('**Durações:** ' + list(m.durations, 10));
  L.push('**Curvas:** ' + list(m.easings, 10));
  L.push('**Propriedades animadas:** ' + list(m.properties, 12));
  L.push('**Delays:** ' + list(m.delays, 8));
  L.push('**@keyframes:** ' + [...new Set([...(m.keyframes || []).map(k => k.name), ...(m.keyframesFromCss || []).map(k => k.name)])].slice(0, 25).join(', '));
  L.push('**prefers-reduced-motion tratado:** ' + (m.prefersReducedMotionHandled ? 'sim' : 'não'));
  L.push('');
  L.push('### Revelação no scroll (diff medido: estado no load × estado depois de percorrer a página)');
  L.push('');
  L.push('**' + r.scrollReveal.changedCount + ' elementos mudaram.** Por propriedade: ' + (r.scrollReveal.byProperty || []).map(x => '`' + x.v + '` ×' + x.n).join(' · '));
  L.push('');
  (r.scrollReveal.sample || []).slice(0, 16).forEach(x => L.push('- y' + x.top + ' `' + x.el + '` → ' + x.props.join(' · ')));
  L.push('');

  L.push('## Hover (medido com o mouse de verdade, elemento e subárvore)');
  L.push('');
  (r.hovers || []).forEach(h => {
    L.push('- **' + h.kind + '** "' + h.text + '" — ' + (h.diff.length ? h.diff.join('; ') : (h.childDiff.length ? '_no elemento: nada_' : 'sem mudança visível')));
    (h.childDiff || []).forEach(c => L.push('  - filho `' + c.split(':')[0] + '` → ' + c.split(':').slice(1).join(':').trim()));
    if (h.pseudo) L.push('  - pseudo: ' + h.pseudo);
    if (h.transition) L.push('  - _transition:_ `' + h.transition + '`');
  });
  L.push('');

  L.push('## Ilustração e mídia');
  L.push('');
  const bigSvgs = il.svgs.filter(s2 => s2.role === 'ilustração');
  L.push('SVG inline: ' + il.svgs.length + ' (ilustração ' + bigSvgs.length + ', ícone/ui ' + (il.svgs.length - bigSvgs.length) + ') · imagens: ' + il.imgs.length + ' · vídeos: ' + il.videos.length + ' · canvas: ' + il.canvases.length + ' · lottie: ' + il.lotties.length);
  L.push('');
  if (bigSvgs.length) {
    L.push('| # | caixa | viewBox | nós | formas | stroke/fill | stroke-w | grad | anim | cores |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    bigSvgs.slice(0, 20).forEach(x => {
      const shapes = Object.entries(x.shapes).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(' ');
      L.push('| ' + x.i + ' | ' + x.box.w + '×' + x.box.h + ' | ' + (x.viewBox || '—') + ' | ' + x.nodes + ' | ' + shapes + ' | ' + x.strokeVsFill.strokeEls + '/' + x.strokeVsFill.fillEls + ' | ' + (x.strokeWidths[0] ? x.strokeWidths[0].v : '—') + ' | ' + x.gradients + ' | ' + (x.animated ? 'SMIL:' + x.animated : (x.hasCssAnim ? 'css' : '—')) + ' | ' + x.colors.slice(0, 5).map(c => c.v).join(' ') + ' |');
    });
    L.push('');
  }
  const bigImgs = il.imgs.filter(i => i.role === 'ilustração/foto');
  if (bigImgs.length) {
    L.push('**Imagens grandes (' + bigImgs.length + ' únicas):**');
    bigImgs.slice(0, 24).forEach(x => L.push('- ' + x.box.w + '×' + x.box.h + ' (aspect ' + x.aspect + ') `' + (x.ext || '?') + '` natural ' + x.natural.w + '×' + x.natural.h + ' ×' + x.dpr + ' fit:' + x.objectFit + (x.radius !== '0px' ? ' r:' + x.radius : '') + (x.filter ? ' filter:' + x.filter : '') + (x.blend ? ' blend:' + x.blend : '') + (x.instances > 1 ? ' — repetida ' + x.instances + '×' : '') + '  \n  alt: "' + x.alt.slice(0, 90) + '"'));
    L.push('');
    const formats = {};
    il.imgs.forEach(i => { const k = i.ext || 'sem-extensão'; formats[k] = (formats[k] || 0) + 1; });
    L.push('**Formatos:** ' + Object.entries(formats).map(([k, v]) => k + '×' + v).join(' · '));
    const aspects = {};
    bigImgs.forEach(i => { if (i.aspect) { const k = i.aspect.toFixed(1); aspects[k] = (aspects[k] || 0) + 1; } });
    L.push('**Proporções recorrentes:** ' + Object.entries(aspects).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ':1 ×' + v).join(' · '));
    L.push('');
  }
  if (il.bgs.length) {
    L.push('**Backgrounds (gradiente / textura / imagem):**');
    il.bgs.slice(0, 14).forEach(x => L.push('- [' + x.kind + '] ' + x.box.w + '×' + x.box.h + ' em `' + x.tag + '.' + x.cls.split(' ')[0] + '` — `' + x.value.slice(0, 160) + '`'));
    L.push('');
  }
  if (il.composition.length) {
    L.push('**Truques de composição:** ' + il.composition.length + ' elementos');
    il.composition.slice(0, 14).forEach(x => L.push('- `' + x.on + '` (' + x.box.w + '×' + x.box.h + ') → ' + x.tricks.join(' · ')));
    L.push('');
  }
  if (il.pseudos.length) {
    L.push('**Pseudo-elementos decorativos:** ' + il.pseudos.length);
    il.pseudos.slice(0, 10).forEach(x => L.push('- `' + x.on + x.pseudo + '` ' + x.w + '×' + x.h + ' ' + (x.bgImage !== 'none' ? '`' + x.bgImage.slice(0, 90) + '`' : 'bg ' + x.bg) + (x.transform !== 'none' ? ' transform ' + x.transform.slice(0, 40) : '')));
    L.push('');
  }
  if (il.videos.length) {
    L.push('**Vídeos:**');
    il.videos.forEach(v => L.push('- ' + v.box.w + '×' + v.box.h + ' autoplay:' + v.autoplay + ' loop:' + v.loop + ' fit:' + v.objectFit + ' blend:' + v.blend + '  \n  `' + v.src.split('/').pop().slice(0, 80) + '` poster: `' + (v.poster.split('/').pop() || '—').slice(0, 60) + '`'));
    L.push('');
  }

  if (r.responsive && Object.keys(r.responsive).length) {
    L.push('## Responsivo (remedido em cada viewport)');
    L.push('');
    L.push('**Breakpoints no CSS:** ' + (r.breakpoints || []).slice(0, 10).map(b => b.v + '×' + b.n).join(' · '));
    Object.entries(r.responsive).forEach(([vw, d]) => {
      L.push('');
      L.push('**' + vw + 'px** — altura ' + d.docHeight + 'px · header ' + d.headerHeight + 'px · containers ' + (d.containerWidths || []).slice(0, 3).map(w => w.w).join('/'));
      (d.sections || []).slice(0, 12).forEach(x => L.push('- s' + x.i + ' ' + x.type + ': ' + x.h + 'px, pad ' + (x.padding || '').split(' ')[0] + ', ' + (x.grid ? (x.grid.colCount || '?') + 'col' : 'sem grid') + (x.headingStyle ? ', h ' + x.headingStyle.size : '')));
    });
    L.push('');
  }

  L.push('## Rede');
  L.push('');
  L.push('CSS: ' + r.network.cssFiles + ' arquivos · fontes: ' + r.network.fontFiles.length + ' · imagens: ' + r.network.images + ' · lottie json: ' + r.network.lottieJson.length);
  L.push('Fontes: ' + r.network.fontFiles.map(f => f.split('/').pop().slice(0, 40)).join(', '));
  L.push('Scripts: ' + r.network.scripts.slice(0, 25).join(', '));
  L.push('');
  return L.join('\n');
}

async function cmdCapture() {
  let planPath, outRoot, entries;
  if (target && target.endsWith('.json')) {
    planPath = resolve(target);
    outRoot = dirname(planPath);
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    entries = plan.plan;
  } else if (target && target.startsWith('http')) {
    outRoot = flag('out') || join(ROOT, 'outputs', 'dna', new URL(target).hostname.replace(/\W+/g, '-') + '_' + new Date().toISOString().slice(0, 10));
    ensure(outRoot);
    entries = [{ url: target, pattern: 'ad-hoc', groupSize: 1 }];
  } else throw new Error('use: capture <plan.json|url>');

  const only = flag('only');
  if (only) entries = entries.filter(e => new RegExp(only, 'i').test(e.url));
  const limit = +(flag('limit', 0));
  if (limit) entries = entries.slice(0, limit);

  const opts = {
    viewports: String(flag('viewports', '1440,768,390')).split(',').map(Number),
    fast: has('fast'),
    noShots: has('no-shots'),
  };
  const conc = +(flag('concurrency', 3));

  log('▶ capturando ' + entries.length + ' páginas · viewports ' + opts.viewports.join('/') + ' · ' + conc + ' em paralelo');
  log('  destino: ' + outRoot + '\n');

  const browser = await chromium.launch({ executablePath: browserPath(), headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < entries.length) {
      const my = idx++;
      try { results.push(await capturePage(browser, entries[my], outRoot, opts)); }
      catch (e) { log('  ✗ worker: ' + e.message.slice(0, 120)); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, entries.length) }, worker));
  await browser.close();

  writeJson(join(outRoot, '_capture-summary.json'), {
    finishedAt: new Date().toISOString(),
    pages: results.map(r => ({ url: r.url, slug: r.slug, ok: r.ok, sections: r.structure ? r.structure.sectionCount : null, svgs: r.illustration ? r.illustration.svgs.length : null, ms: r.ms, error: r.error || null })),
  });
  log('\n✓ ' + results.filter(r => r.ok).length + '/' + entries.length + ' páginas capturadas em ' + outRoot);
  return outRoot;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLLUP — o que é sistema (repete em toda página) vs. o que é exceção
// ─────────────────────────────────────────────────────────────────────────────
function cmdRollup() {
  const root = resolve(target);
  const pagesDir = join(root, 'pages');
  const pages = readdirSync(pagesDir).filter(d => statSync(join(pagesDir, d)).isDirectory());
  const load = (d) => { try { return JSON.parse(readFileSync(join(pagesDir, d, 'page.json'), 'utf8')); } catch { return null; } };
  const all = pages.map(load).filter(r => r && r.ok);

  const merge = (getter) => {
    const m = {}, pageCount = {};
    all.forEach(r => {
      (getter(r) || []).forEach(x => {
        m[x.v] = (m[x.v] || 0) + x.n;
        pageCount[x.v] = (pageCount[x.v] || 0) + 1;
      });
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([v, n]) => ({ v, n, pages: pageCount[v], ubiquity: +(pageCount[v] / all.length).toFixed(2) }));
  };

  const roll = {
    site: all[0] ? new URL(all[0].url).origin : null,
    pagesAnalyzed: all.length,
    generatedAt: new Date().toISOString(),
    palette: {
      bgByArea: merge(r => r.tokens.palette.bgByArea),
      textColors: merge(r => r.tokens.palette.textColors),
      borders: merge(r => r.tokens.palette.borders),
      gradients: merge(r => r.tokens.palette.gradients),
    },
    typography: {
      families: merge(r => r.tokens.families),
      sizes: merge(r => r.tokens.fontSizes),
      weights: merge(r => r.tokens.fontWeights),
      lineHeights: merge(r => r.tokens.lineHeights),
      letterSpacings: merge(r => r.tokens.letterSpacings),
      transforms: merge(r => r.tokens.textTransforms),
    },
    surface: {
      radii: merge(r => r.tokens.radii),
      shadows: merge(r => r.tokens.shadows),
      gaps: merge(r => r.tokens.gaps),
      sectionPaddingY: merge(r => r.tokens.sectionPaddingY),
      blend: merge(r => r.tokens.blendModes),
      backdrop: merge(r => r.tokens.backdropFilters),
    },
    motion: {
      durations: merge(r => r.motion.durations),
      easings: merge(r => r.motion.easings),
      properties: merge(r => r.motion.properties),
      animations: merge(r => r.motion.cssAnimations),
      keyframeNames: [...new Set(all.flatMap(r => [...(r.motion.keyframes || []).map(k => k.name), ...(r.motion.keyframesFromCss || []).map(k => k.name)]))],
      libs: (() => {
        const c = {};
        all.forEach(r => Object.entries(r.motion.libs).forEach(([k, v]) => { if (v) c[k] = (c[k] || 0) + 1; }));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ lib: k, pages: n, ubiquity: +(n / all.length).toFixed(2) }));
      })(),
      revealAvg: Math.round(all.reduce((s, r) => s + (r.scrollReveal ? r.scrollReveal.changedCount : 0), 0) / all.length),
      revealByProperty: (() => {
        const c = {};
        all.forEach(r => ((r.scrollReveal && r.scrollReveal.byProperty) || []).forEach(x => { c[x.v] = (c[x.v] || 0) + x.n; }));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }));
      })(),
    },
    illustration: {
      svgTotal: all.reduce((s, r) => s + r.illustration.svgs.length, 0),
      svgIllustrations: all.reduce((s, r) => s + r.illustration.svgs.filter(x => x.role === 'ilustração').length, 0),
      imgTotal: all.reduce((s, r) => s + r.illustration.imgs.length, 0),
      videos: all.reduce((s, r) => s + r.illustration.videos.length, 0),
      lotties: all.reduce((s, r) => s + r.illustration.lotties.length, 0),
      canvases: all.reduce((s, r) => s + r.illustration.canvases.length, 0),
      imageFormats: (() => {
        const c = {};
        all.forEach(r => r.illustration.imgs.forEach(i => { if (i.ext) c[i.ext] = (c[i.ext] || 0) + 1; }));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }));
      })(),
      strokeWidths: (() => {
        const c = {};
        all.forEach(r => r.illustration.svgs.forEach(s => s.strokeWidths.forEach(w => { c[w.v] = (c[w.v] || 0) + w.n; })));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, n]) => ({ v, n }));
      })(),
      svgColors: (() => {
        const c = {};
        all.forEach(r => r.illustration.svgs.forEach(s => s.colors.forEach(x => { c[x.v] = (c[x.v] || 0) + x.n; })));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([v, n]) => ({ v, n }));
      })(),
    },
    structure: {
      sectionTypeFrequency: (() => {
        const c = {};
        all.forEach(r => r.structure.sections.forEach(s => { c[s.type] = (c[s.type] || 0) + 1; }));
        return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }));
      })(),
      sectionsPerPage: all.map(r => ({ slug: r.slug, n: r.structure.sectionCount, h: r.structure.docHeight })),
      containerWidths: merge(r => r.structure.containerWidths.map(w => ({ v: String(w.w), n: w.n }))),
      byPattern: (() => {
        const g = {};
        all.forEach(r => { (g[r.pattern] = g[r.pattern] || []).push({ slug: r.slug, sections: r.structure.sections.map(s => s.type) }); });
        return g;
      })(),
    },
    hover: (() => {
      const c = {};
      all.forEach(r => (r.hovers || []).forEach(h => {
        (h.diff || []).forEach(d => {
          const k = h.kind + ' → ' + d.split(':')[0];
          c[k] = (c[k] || 0) + 1;
        });
        (h.childDiff || []).forEach(d => {
          const prop = (d.split('→')[1] || '').trim().split(':')[0];
          if (!prop) return;
          const k = h.kind + ' (no filho) → ' + prop;
          c[k] = (c[k] || 0) + 1;
        });
      }));
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([v, n]) => ({ v, n }));
    })(),
    breakpoints: merge(r => r.breakpoints || []),
    fonts: [...new Set(all.flatMap(r => r.network.fontFiles.map(f => f.split('/').pop())))].slice(0, 30),
    scripts: (() => {
      const c = {};
      all.forEach(r => r.network.scripts.forEach(s => { c[s] = (c[s] || 0) + 1; }));
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([v, n]) => ({ v, n }));
    })(),
  };

  writeJson(join(root, '_rollup.json'), roll);

  const L = [];
  const fmt = (arr, n = 12) => (arr || []).slice(0, n).map(x => '`' + x.v + '` ×' + x.n + (x.ubiquity !== undefined ? ' (' + Math.round(x.ubiquity * 100) + '% das páginas)' : '')).join('  \n');
  L.push('# Rollup — ' + roll.site);
  L.push('');
  L.push(roll.pagesAnalyzed + ' páginas capturadas · gerado em ' + roll.generatedAt);
  L.push('');
  L.push('> Ubiquidade = em quantas páginas o valor aparece. Alto = sistema. Baixo = exceção deliberada.');
  L.push('');
  ['palette', 'typography', 'surface', 'motion'].forEach(group => {
    L.push('## ' + group);
    L.push('');
    Object.entries(roll[group]).forEach(([k, v]) => {
      if (Array.isArray(v) && v.length && v[0].v !== undefined) { L.push('### ' + k); L.push(''); L.push(fmt(v)); L.push(''); }
      else if (Array.isArray(v)) { L.push('### ' + k); L.push(''); L.push(JSON.stringify(v).slice(0, 1200)); L.push(''); }
      else { L.push('**' + k + ':** ' + JSON.stringify(v).slice(0, 400)); L.push(''); }
    });
  });
  L.push('## ilustração');
  L.push('');
  Object.entries(roll.illustration).forEach(([k, v]) => {
    L.push('**' + k + ':** ' + (Array.isArray(v) ? v.map(x => x.v + '×' + x.n).join(' · ') : v));
  });
  L.push('');
  L.push('## estrutura');
  L.push('');
  L.push('**Tipos de seção:** ' + roll.structure.sectionTypeFrequency.map(x => x.v + '×' + x.n).join(' · '));
  L.push('');
  L.push('**Seções por página:**');
  roll.structure.sectionsPerPage.forEach(x => L.push('- ' + x.slug + ': ' + x.n + ' seções, ' + x.h + 'px'));
  L.push('');
  L.push('**Sequência de seções por tipo de página:**');
  Object.entries(roll.structure.byPattern).forEach(([p, arr]) => {
    L.push('- `' + p + '`');
    arr.forEach(a => L.push('  - ' + a.slug + ': ' + a.sections.join(' → ')));
  });
  L.push('');
  L.push('## hover — o que muda, por tipo de elemento');
  L.push('');
  L.push(fmt(roll.hover, 25));
  L.push('');
  L.push('## breakpoints e fontes');
  L.push('');
  L.push(fmt(roll.breakpoints, 12));
  L.push('');
  L.push('**Fontes:** ' + roll.fonts.join(', '));
  L.push('');
  L.push('**Scripts recorrentes:** ' + roll.scripts.slice(0, 25).map(s => s.v + '×' + s.n).join(', '));
  writeFileSync(join(root, '_rollup.md'), L.join('\n'), 'utf8');

  log('✓ rollup de ' + all.length + ' páginas → ' + join(root, '_rollup.md'));
  return root;
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (cmd === 'map') await cmdMap();
    else if (cmd === 'capture') await cmdCapture();
    else if (cmd === 'rollup') cmdRollup();
    else {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').replace(/^\/\*\*?/, ''));
      process.exit(1);
    }
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  }
})();
