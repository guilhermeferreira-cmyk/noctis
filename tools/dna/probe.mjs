/**
 * Sondas que rodam DENTRO da página (page.evaluate).
 * Cada função é auto-suficiente: sem imports, sem closures externas —
 * o Playwright serializa só o corpo dela.
 *
 * Regra da casa: medir, nunca inferir. Todo número aqui saiu do
 * getComputedStyle / getBoundingClientRect do browser real.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. TOKENS — paleta, tipografia, raio, sombra, espaçamento (frequência e área)
// ─────────────────────────────────────────────────────────────────────────────
export function probeTokens() {
  const MAXEL = 6000;
  const els = Array.from(document.querySelectorAll('body *')).slice(0, MAXEL);
  const bump = (m, k, n) => { if (!k) return; m[k] = (m[k] || 0) + (n || 1); };
  const transparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'rgba(0,0,0,0)' || c === 'transparent';

  // O Chrome computa color-mix()/oklch() para oklab(...) — ilegível como token.
  // window.__dnaToRgb é injetado pelo capturador; o fallback aqui mantém a
  // sonda utilizável se ela for colada solta no console.
  const norm = (c) => {
    if (!c) return '';
    const v = (window.__dnaToRgb ? window.__dnaToRgb(c) : c);
    return String(v).replace(/\s+/g, '');
  };

  const fg = {}, bgArea = {}, bgCount = {}, borderC = {}, radius = {}, shadow = {},
        famC = {}, sizeC = {}, weightC = {}, lhC = {}, lsC = {}, ttC = {},
        gradients = {}, blend = {}, backdrop = {}, filters = {}, padY = {}, gapC = {};

  const roleOf = (el) => {
    const t = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(t)) return t;
    if (['p', 'a', 'button', 'li', 'label', 'blockquote'].includes(t)) return t;
    if (t === 'span' || t === 'div') return 'span-div';
    return t;
  };
  const typeByRole = {};

  for (const el of els) {
    let cs; try { cs = getComputedStyle(el); } catch { continue; }
    const r = el.getBoundingClientRect();
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    const area = Math.round(r.width * r.height);
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);

    if (visible && hasText) {
      bump(fg, norm(cs.color));
      const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '');
      const role = roleOf(el);
      typeByRole[role] = typeByRole[role] || {};
      const key = [cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing, fam, cs.textTransform].join('|');
      typeByRole[role][key] = (typeByRole[role][key] || 0) + 1;
      bump(famC, fam);
      bump(sizeC, cs.fontSize);
      bump(weightC, cs.fontWeight);
      bump(lhC, cs.lineHeight);
      bump(lsC, cs.letterSpacing);
      if (cs.textTransform !== 'none') bump(ttC, cs.textTransform);
    }
    if (visible && !transparent(cs.backgroundColor)) {
      bump(bgArea, norm(cs.backgroundColor), area);
      bump(bgCount, norm(cs.backgroundColor));
    }
    // gradiente conta mesmo em elemento de caixa zero: overlay posicionado em
    // cima de vídeo/foto costuma medir 0×0 e é justamente onde o gradiente vive
    if (cs.backgroundImage && /gradient/i.test(cs.backgroundImage)) {
      bump(gradients, cs.backgroundImage.slice(0, 300));
    }
    if (cs.borderTopWidth !== '0px' && !transparent(cs.borderTopColor)) {
      bump(borderC, cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + norm(cs.borderTopColor));
    }
    if (cs.borderTopLeftRadius !== '0px') {
      const rad = (v) => (parseFloat(v) > 400 ? 'pill/circle' : v);
      bump(radius, cs.borderTopLeftRadius === cs.borderBottomRightRadius
        ? rad(cs.borderTopLeftRadius)
        : rad(cs.borderTopLeftRadius) + '/' + rad(cs.borderBottomRightRadius));
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadow, cs.boxShadow.slice(0, 160));
    if (cs.mixBlendMode !== 'normal') bump(blend, cs.mixBlendMode);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') bump(backdrop, cs.backdropFilter);
    if (cs.filter && cs.filter !== 'none') bump(filters, cs.filter.slice(0, 120));
    if (visible && r.width > 600 && (cs.paddingTop !== '0px' || cs.paddingBottom !== '0px')) {
      bump(padY, cs.paddingTop + '/' + cs.paddingBottom);
    }
    if ((cs.display === 'grid' || cs.display === 'flex') && cs.gap && cs.gap !== 'normal') bump(gapC, cs.gap);
  }

  // custom properties declaradas no :root
  const vars = {};
  try {
    const rs = getComputedStyle(document.documentElement);
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i];
      if (p.startsWith('--')) vars[p] = rs.getPropertyValue(p).trim().slice(0, 200);
    }
  } catch {}
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule.style && /:root|^html$/.test(rule.selectorText || '')) {
          for (let i = 0; i < rule.style.length; i++) {
            const p = rule.style[i];
            if (p.startsWith('--') && !(p in vars)) vars[p] = rule.style.getPropertyValue(p).trim().slice(0, 200);
          }
        }
      }
    }
  } catch {}

  // fontes efetivamente carregadas pelo browser
  const faces = [];
  try {
    document.fonts.forEach(f => faces.push({
      family: f.family, weight: f.weight, style: f.style, status: f.status,
      src: String(f.src || '').slice(0, 220),
    }));
  } catch {}

  const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ v: k, n: v }));
  const typeScale = {};
  for (const [role, m] of Object.entries(typeByRole)) {
    typeScale[role] = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => {
      const [size, weight, lineHeight, letterSpacing, family, textTransform] = k.split('|');
      return { size, weight, lineHeight, letterSpacing, family, textTransform, n };
    });
  }

  return {
    cssVars: vars,
    fontFaces: faces.slice(0, 60),
    typeScale,
    palette: {
      textColors: top(fg, 20),
      bgByArea: top(bgArea, 20),
      bgByCount: top(bgCount, 20),
      borders: top(borderC, 15),
      gradients: top(gradients, 20),
    },
    families: top(famC, 12),
    fontSizes: top(sizeC, 25),
    fontWeights: top(weightC, 10),
    lineHeights: top(lhC, 15),
    letterSpacings: top(lsC, 12),
    textTransforms: top(ttC, 6),
    radii: top(radius, 15),
    shadows: top(shadow, 12),
    sectionPaddingY: top(padY, 15),
    gaps: top(gapC, 15),
    blendModes: top(blend, 8),
    backdropFilters: top(backdrop, 8),
    filters: top(filters, 10),
    elementsScanned: els.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ESTRUTURA & GRID — seções em ordem, com caixa medida e tipo detectado
// ─────────────────────────────────────────────────────────────────────────────
export function probeStructure() {
  const doc = document;
  const sy = window.scrollY;
  const rgb = (v) => (window.__dnaToRgb ? window.__dnaToRgb(v) : v);
  const abs = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + sy), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
  };

  let root = doc.querySelector('main') || doc.querySelector('[role="main"]');
  if (!root) {
    const cands = Array.from(doc.body.children).filter(e => !/^(script|style|noscript|svg|link)$/i.test(e.tagName));
    root = cands.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || doc.body;
  }

  let kids = Array.from(root.children).filter(e => e.getBoundingClientRect().height > 40);
  let guard = 0;
  while (kids.length === 1 && kids[0].children.length > 1 && guard++ < 4) {
    kids = Array.from(kids[0].children).filter(e => e.getBoundingClientRect().height > 40);
  }

  const textOf = (el, sel) => {
    const n = el.querySelector(sel);
    return n ? n.textContent.trim().replace(/\s+/g, ' ').slice(0, 220) : null;
  };

  const sections = kids.map((el, i) => {
    const cs = getComputedStyle(el);
    const box = abs(el);
    const imgs = el.querySelectorAll('img').length;
    const svgs = el.querySelectorAll('svg').length;
    const videos = el.querySelectorAll('video').length;
    const canvases = el.querySelectorAll('canvas').length;
    const lotties = el.querySelectorAll('lottie-player,dotlottie-player,[data-animation-type="lottie"]').length;

    const bigNums = Array.from(el.querySelectorAll('*')).filter(n => {
      if (n.children.length) return false;
      const t = (n.textContent || '').trim();
      if (t.length > 12 || !/^[\d.,]+\s*(%|x|X|\+|k|K|M|B|hrs?|days?)?$/.test(t)) return false;
      return parseFloat(getComputedStyle(n).fontSize) >= 32;
    }).map(n => ({ text: n.textContent.trim(), size: getComputedStyle(n).fontSize, weight: getComputedStyle(n).fontWeight, family: getComputedStyle(n).fontFamily.split(',')[0].replace(/["']/g, '') }));

    let gridInfo = null;
    const gridEl = Array.from(el.querySelectorAll('*')).find(n => {
      const c = getComputedStyle(n);
      return (c.display === 'grid' || (c.display === 'flex' && c.flexWrap === 'wrap')) && n.children.length > 2;
    });
    if (gridEl) {
      const gc = getComputedStyle(gridEl);
      gridInfo = {
        display: gc.display,
        cols: gc.gridTemplateColumns !== 'none' ? gc.gridTemplateColumns : null,
        colCount: gc.gridTemplateColumns !== 'none' ? gc.gridTemplateColumns.split(' ').filter(Boolean).length : null,
        gap: gc.gap,
        items: gridEl.children.length,
        itemW: Math.round(gridEl.children[0].getBoundingClientRect().width),
      };
    }

    const links = Array.from(el.querySelectorAll('a,button'))
      .map(a => (a.textContent || '').trim().replace(/\s+/g, ' '))
      .filter(t => t && t.length < 60);
    const heading = textOf(el, 'h1') || textOf(el, 'h2') || textOf(el, 'h3');
    const eyebrowEl = Array.from(el.querySelectorAll('p,span,div')).find(n => {
      if (n.children.length) return false;
      const c = getComputedStyle(n);
      const t = (n.textContent || '').trim();
      return t.length > 1 && t.length < 40 && (c.textTransform === 'uppercase' || parseFloat(c.letterSpacing) > 0.8);
    });

    let type = 'seção';
    if (i === 0 && box.h > 320) type = 'hero';
    if (bigNums.length >= 2) type = 'big-numbers';
    if (imgs >= 4 && box.h < 340) type = 'faixa-de-logos';
    if (gridInfo && gridInfo.items >= 3 && el.querySelectorAll('h3,h4').length >= 3) type = 'grid-de-cards';
    if (/footer/i.test(el.tagName + ' ' + (typeof el.className === 'string' ? el.className : ''))) type = 'footer';
    if (/^(nav|header)$/i.test(el.tagName)) type = 'header';
    if (links.length <= 3 && box.h < 520 && /demo|contact|start|talk|get|book|request/i.test(links.join(' '))) type = 'cta-final';

    return {
      i, tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 160) || null,
      type, box,
      bg: rgb(cs.backgroundColor),
      bgImage: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 200) : null,
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
      heading, eyebrow: eyebrowEl ? eyebrowEl.textContent.trim().slice(0, 60) : null,
      headingStyle: (() => {
        const h = el.querySelector('h1,h2');
        if (!h) return null;
        const c = getComputedStyle(h);
        return { size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight, ls: c.letterSpacing, family: c.fontFamily.split(',')[0].replace(/["']/g, ''), maxW: Math.round(h.getBoundingClientRect().width) };
      })(),
      media: { imgs, svgs, videos, canvases, lotties },
      bigNums: bigNums.slice(0, 8),
      grid: gridInfo,
      ctas: links.slice(0, 10),
      words: (el.textContent || '').trim().split(/\s+/).length,
    };
  });

  const widths = {};
  Array.from(doc.querySelectorAll('div,section,header,footer,main,article')).forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width > 600 && r.width <= window.innerWidth) {
      const k = Math.round(r.width);
      widths[k] = (widths[k] || 0) + 1;
    }
  });

  const header = doc.querySelector('header,nav,[class*="navbar" i]');
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docHeight: doc.documentElement.scrollHeight,
    sections,
    sectionCount: sections.length,
    containerWidths: Object.entries(widths).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, n]) => ({ w: +w, n })),
    header: header ? {
      tag: header.tagName.toLowerCase(),
      position: getComputedStyle(header).position,
      height: Math.round(header.getBoundingClientRect().height),
      bg: rgb(getComputedStyle(header).backgroundColor),
      backdrop: getComputedStyle(header).backdropFilter,
      links: Array.from(header.querySelectorAll('a')).map(a => a.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 24),
    } : null,
    title: doc.title,
    h1: textOf(doc, 'h1'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MOTION — o que se move, com que curva, disparado por quê
// ─────────────────────────────────────────────────────────────────────────────
export function probeMotion() {
  const bump = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
  const dur = {}, ease = {}, prop = {}, delay = {}, animName = {}, willChange = {};
  const transformed = [];

  const els = Array.from(document.querySelectorAll('body *')).slice(0, 6000);
  for (const el of els) {
    let cs; try { cs = getComputedStyle(el); } catch { continue; }
    if (cs.transitionDuration && cs.transitionDuration !== '0s') {
      cs.transitionDuration.split(',').forEach(d => bump(dur, d.trim()));
      cs.transitionTimingFunction.split(/,(?![^(]*\))/).forEach(e => bump(ease, e.trim()));
      cs.transitionProperty.split(',').forEach(p => bump(prop, p.trim()));
      if (cs.transitionDelay !== '0s') cs.transitionDelay.split(',').forEach(d => bump(delay, d.trim()));
    }
    if (cs.animationName && cs.animationName !== 'none') {
      cs.animationName.split(',').forEach(n => bump(animName, n.trim() + ' ' + cs.animationDuration.split(',')[0].trim() + ' ' + cs.animationTimingFunction.split(/,(?![^(]*\))/)[0].trim() + (cs.animationIterationCount !== '1' ? ' x' + cs.animationIterationCount : '')));
    }
    if (cs.willChange && cs.willChange !== 'auto') bump(willChange, cs.willChange);
    const r = el.getBoundingClientRect();
    const offscreenAndHidden = (cs.opacity !== '' && parseFloat(cs.opacity) < 0.99) || (cs.transform && cs.transform !== 'none');
    if (offscreenAndHidden && r.height > 8 && transformed.length < 120) {
      transformed.push({
        sel: (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 120),
        opacity: cs.opacity, transform: cs.transform.slice(0, 90),
        top: Math.round(r.top + window.scrollY),
      });
    }
  }

  // keyframes acessíveis via CSSOM (o resto vem do CSS baixado pela rede)
  const keyframes = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule.type === 7 || rule.constructor.name === 'CSSKeyframesRule') {
          keyframes.push({ name: rule.name, body: Array.from(rule.cssRules).map(k => k.keyText + '{' + k.style.cssText + '}').join(' ').slice(0, 600) });
        }
      }
    }
  } catch {}

  // libs de motion realmente carregadas
  const w = window;
  const libs = {
    gsap: !!w.gsap, scrollTrigger: !!(w.ScrollTrigger || (w.gsap && w.gsap.plugins && w.gsap.plugins.scrollTrigger)),
    framerMotion: !!document.querySelector('[data-framer-name],[data-framer-component-type]'),
    webflowIx2: !!document.querySelector('[data-w-id]') || !!w.Webflow,
    lottie: !!(w.lottie || w.bodymovin) || !!document.querySelector('lottie-player,dotlottie-player'),
    rive: !!w.rive, three: !!w.THREE, spline: !!document.querySelector('spline-viewer'),
    lenis: !!w.Lenis || !!document.querySelector('.lenis'), locomotive: !!w.LocomotiveScroll || !!document.querySelector('[data-scroll-container]'),
    aos: !!w.AOS || !!document.querySelector('[data-aos]'),
    swiper: !!w.Swiper || !!document.querySelector('.swiper'), splide: !!w.Splide || !!document.querySelector('.splide'),
    slick: !!document.querySelector('.slick-slider'),
    marquee: !!document.querySelector('marquee,[class*="marquee" i],[class*="ticker" i]'),
    typed: !!w.Typed || !!document.querySelector('[class*="typewriter" i],[class*="typed" i]'),
    hubspot: !!w.hbspt || !!document.querySelector('[data-hubspot-form],.hs-form'),
    intersectionObserverAttrs: document.querySelectorAll('[data-animate],[data-reveal],[data-scroll],[class*="reveal" i],[class*="fade-in" i]').length,
  };

  const scrollDriven = [];
  try {
    for (const el of els.slice(0, 3000)) {
      const cs = getComputedStyle(el);
      if (cs.animationTimeline && cs.animationTimeline !== 'auto' && cs.animationTimeline !== 'none') {
        scrollDriven.push({ tag: el.tagName.toLowerCase(), timeline: cs.animationTimeline, name: cs.animationName });
      }
    }
  } catch {}

  const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ v: k, n: v }));
  return {
    durations: top(dur, 15),
    easings: top(ease, 15),
    properties: top(prop, 20),
    delays: top(delay, 12),
    cssAnimations: top(animName, 20),
    willChange: top(willChange, 8),
    keyframes: keyframes.slice(0, 40),
    libs,
    scrollDriven: scrollDriven.slice(0, 20),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    prefersReducedMotionHandled: (() => {
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of Array.from(rules || [])) {
            if (rule.media && /prefers-reduced-motion/.test(rule.conditionText || rule.media.mediaText || '')) return true;
          }
        }
      } catch {}
      return false;
    })(),
    hiddenOrTransformed: transformed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ILUSTRAÇÃO — o inventário visual: SVG, imagem, vídeo, gradiente, textura
// ─────────────────────────────────────────────────────────────────────────────
export function probeIllustration() {
  const sy = window.scrollY;
  const boxOf = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) }; };

  // --- SVG inline: a impressão digital de uma ilustração vetorial ---
  const svgs = Array.from(document.querySelectorAll('svg')).slice(0, 200).map((s, i) => {
    const cs = getComputedStyle(s);
    const box = boxOf(s);
    const paths = s.querySelectorAll('path').length;
    const strokeEls = Array.from(s.querySelectorAll('*')).filter(n => {
      const a = n.getAttribute && n.getAttribute('stroke');
      const c = getComputedStyle(n).stroke;
      return (a && a !== 'none') || (c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)');
    });
    const fillEls = Array.from(s.querySelectorAll('path,circle,rect,polygon,ellipse')).filter(n => {
      const a = n.getAttribute && n.getAttribute('fill');
      return !a || (a !== 'none');
    });
    const strokeWidths = {};
    strokeEls.forEach(n => {
      const w = n.getAttribute('stroke-width') || getComputedStyle(n).strokeWidth;
      if (w) strokeWidths[w] = (strokeWidths[w] || 0) + 1;
    });
    const colors = {};
    Array.from(s.querySelectorAll('*')).forEach(n => {
      ['fill', 'stroke', 'stop-color'].forEach(attr => {
        const v = n.getAttribute && n.getAttribute(attr);
        if (v && v !== 'none' && v !== 'currentColor') { const cv = window.__dnaToRgb ? window.__dnaToRgb(v) : v; colors[cv] = (colors[cv] || 0) + 1; }
      });
    });
    return {
      i, box,
      viewBox: s.getAttribute('viewBox'),
      cls: (s.getAttribute('class') || '').slice(0, 120),
      role: box.w >= 80 && box.h >= 80 ? 'ilustração' : 'ícone/ui',
      nodes: s.querySelectorAll('*').length,
      paths,
      shapes: {
        path: paths, circle: s.querySelectorAll('circle').length, rect: s.querySelectorAll('rect').length,
        line: s.querySelectorAll('line,polyline').length, polygon: s.querySelectorAll('polygon').length,
        ellipse: s.querySelectorAll('ellipse').length, text: s.querySelectorAll('text').length,
        image: s.querySelectorAll('image').length, use: s.querySelectorAll('use').length,
        group: s.querySelectorAll('g').length, mask: s.querySelectorAll('mask,clipPath').length,
        filter: s.querySelectorAll('filter').length,
      },
      strokeVsFill: { strokeEls: strokeEls.length, fillEls: fillEls.length },
      strokeWidths: Object.entries(strokeWidths).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ v, n })),
      strokeLinecap: strokeEls.length ? (strokeEls[0].getAttribute('stroke-linecap') || getComputedStyle(strokeEls[0]).strokeLinecap) : null,
      gradients: s.querySelectorAll('linearGradient,radialGradient').length,
      animated: s.querySelectorAll('animate,animateTransform,animateMotion').length,
      dasharray: Array.from(s.querySelectorAll('[stroke-dasharray]')).length,
      colors: Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, n]) => ({ v, n })),
      cssColor: cs.color,
      opacity: cs.opacity,
      hasCssAnim: cs.animationName !== 'none',
      preserveAspect: s.getAttribute('preserveAspectRatio'),
    };
  });

  // --- imagens (dedupadas: carrossel duplica slide e polui a contagem) ---
  const imgSeen = new Map();
  Array.from(document.querySelectorAll('img')).slice(0, 400).forEach(img => {
    const cs = getComputedStyle(img);
    const box = boxOf(img);
    const src = img.currentSrc || img.src || '';
    // CDNs modernos servem por proxy (/_next/image?url=...): a extensão real
    // está no parâmetro, não no caminho.
    let realSrc = src;
    try {
      const q = new URL(src, location.href).searchParams.get('url');
      if (q) realSrc = decodeURIComponent(q);
    } catch {}
    const key = realSrc.split('?')[0];
    if (imgSeen.has(key)) { imgSeen.get(key).instances++; return; }
    imgSeen.set(key, {
      src: src.slice(0, 300),
      realSrc: realSrc.slice(0, 300),
      ext: ((realSrc.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1] || '').toLowerCase(),
      alt: (img.alt || '').slice(0, 140),
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      box,
      instances: 1,
      dpr: img.naturalWidth && box.w ? +(img.naturalWidth / box.w).toFixed(2) : null,
      objectFit: cs.objectFit,
      radius: cs.borderTopLeftRadius,
      filter: cs.filter !== 'none' ? cs.filter.slice(0, 120) : null,
      blend: cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : null,
      aspect: box.w && box.h ? +(box.w / box.h).toFixed(2) : null,
      loading: img.loading,
      role: box.w >= 240 && box.h >= 160 ? 'ilustração/foto' : (box.w < 60 ? 'ícone' : 'logo/thumb'),
    });
  });
  const imgs = Array.from(imgSeen.values());

  // --- backgrounds: gradientes, texturas, imagens de fundo ---
  const bgs = [];
  const seen = new Set();
  Array.from(document.querySelectorAll('body *')).slice(0, 5000).forEach(el => {
    const cs = getComputedStyle(el);
    if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
    const key = cs.backgroundImage.slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    const box = boxOf(el);
    bgs.push({
      value: cs.backgroundImage.slice(0, 400),
      kind: /gradient/i.test(cs.backgroundImage) ? (/repeating/i.test(cs.backgroundImage) ? 'gradiente-repetido' : 'gradiente') : (/data:/.test(cs.backgroundImage) ? 'data-uri (textura?)' : 'imagem'),
      size: cs.backgroundSize, repeat: cs.backgroundRepeat, position: cs.backgroundPosition,
      blend: cs.backgroundBlendMode, box,
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
    });
  });

  // --- pseudo-elementos decorativos ---
  const pseudos = [];
  Array.from(document.querySelectorAll('body *')).slice(0, 3000).forEach(el => {
    ['::before', '::after'].forEach(p => {
      let cs; try { cs = getComputedStyle(el, p); } catch { return; }
      if (!cs || cs.content === 'none' || cs.content === 'normal') return;
      const decorative = (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.width && parseFloat(cs.width) > 20) || (cs.maskImage && cs.maskImage !== 'none');
      if (!decorative || pseudos.length >= 60) return;
      pseudos.push({
        on: (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '')).slice(0, 80),
        pseudo: p, content: cs.content.slice(0, 60), bgImage: (cs.backgroundImage || '').slice(0, 200),
        w: cs.width, h: cs.height, position: cs.position, transform: cs.transform.slice(0, 80),
        bg: cs.backgroundColor, radius: cs.borderTopLeftRadius,
      });
    });
  });

  // --- mídia pesada e truques de composição ---
  const videos = Array.from(document.querySelectorAll('video')).map(v => ({
    src: (v.currentSrc || v.src || (v.querySelector('source') || {}).src || '').slice(0, 300),
    poster: (v.poster || '').slice(0, 200),
    autoplay: v.autoplay, loop: v.loop, muted: v.muted, box: boxOf(v),
    objectFit: getComputedStyle(v).objectFit, blend: getComputedStyle(v).mixBlendMode,
  }));
  const canvases = Array.from(document.querySelectorAll('canvas')).map(c => ({ box: boxOf(c), cls: (typeof c.className === 'string' ? c.className : '').slice(0, 80) }));
  const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({ src: (f.src || '').slice(0, 200), box: boxOf(f) }));
  const lotties = Array.from(document.querySelectorAll('lottie-player,dotlottie-player,[data-animation-type="lottie"]')).map(l => ({
    src: (l.getAttribute('src') || l.getAttribute('data-src') || '').slice(0, 260), box: boxOf(l),
  }));

  const composition = [];
  Array.from(document.querySelectorAll('body *')).slice(0, 5000).forEach(el => {
    const cs = getComputedStyle(el);
    const tricks = [];
    if (cs.clipPath && cs.clipPath !== 'none') tricks.push('clip-path: ' + cs.clipPath.slice(0, 80));
    if (cs.maskImage && cs.maskImage !== 'none') tricks.push('mask: ' + cs.maskImage.slice(0, 80));
    if (cs.mixBlendMode !== 'normal') tricks.push('blend: ' + cs.mixBlendMode);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') tricks.push('backdrop: ' + cs.backdropFilter);
    if (cs.filter && cs.filter !== 'none') tricks.push('filter: ' + cs.filter.slice(0, 60));
    if (tricks.length && composition.length < 80) {
      composition.push({ on: (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '')).slice(0, 80), tricks, box: boxOf(el) });
    }
  });

  return { svgs, imgs, bgs: bgs.slice(0, 80), pseudos, videos, canvases, iframes, lotties, composition };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SNAPSHOT para o diff antes/depois do scroll
//    A chave precisa ser ESTÁVEL: lazy-load insere nós entre os dois snapshots,
//    então índice de array desalinha tudo. Carimba-se um id no DOM.
// ─────────────────────────────────────────────────────────────────────────────
export function snapshotAnimatable() {
  const out = {};
  const els = Array.from(document.querySelectorAll('body *')).slice(0, 5000);
  let n = 0;
  els.forEach((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.height < 8 && r.width < 8) return;
    let k = el.getAttribute('data-dna-k');
    if (!k) { k = 'k' + (n++); el.setAttribute('data-dna-k', k); }
    const label = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    out[k] = {
      label: label.slice(0, 140),
      v: [cs.opacity, cs.transform, cs.filter, cs.visibility, cs.clipPath, cs.maxHeight].join('|'),
      top: Math.round(r.top + window.scrollY),
    };
  });
  return out;
}

// Marca os elementos interativos representativos e devolve o rótulo de cada um.
// A leitura de estilo (antes/depois) fica do lado do Node, com a mesma função,
// para que o "antes" seja lido no instante exato anterior ao hover.
export function markHoverTargets() {
  const out = [];
  const push = (el, kind) => {
    if (!el || el.hasAttribute('data-dna-hover')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const cs = getComputedStyle(el);
    el.setAttribute('data-dna-hover', String(out.length));
    out.push({
      kind,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 140),
      box: { top: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      transition: cs.transitionProperty.slice(0, 120) + ' / ' + cs.transitionDuration + ' / ' + cs.transitionTimingFunction,
    });
  };
  const header = document.querySelector('header,nav');
  if (header) Array.from(header.querySelectorAll('a')).slice(0, 3).forEach(a => push(a, 'nav-link'));
  Array.from(document.querySelectorAll('a[class*="button" i],a[class*="btn" i],button,[role="button"]')).slice(0, 6).forEach(b => push(b, 'botão'));
  Array.from(document.querySelectorAll('[class*="card" i],article,[class*="tile" i]')).slice(0, 5).forEach(c => push(c, 'card'));
  Array.from(document.querySelectorAll('main a:not([class*="button" i]):not([class*="btn" i])')).slice(0, 3).forEach(a => push(a, 'link-de-texto'));
  Array.from(document.querySelectorAll('footer a')).slice(0, 2).forEach(a => push(a, 'footer-link'));
  return out;
}
