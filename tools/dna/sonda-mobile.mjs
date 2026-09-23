import { chromium } from "playwright-core";
import fs from "node:fs";

const URLS = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean);
const VIEWPORTS = [
  { nome: "mobile", width: 390, height: 844, dsf: 3, mobile: true },
  { nome: "desktop", width: 1440, height: 900, dsf: 1, mobile: false },
];

const navegador = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox"],
});

const saida = [];

for (const vp of VIEWPORTS) {
  const ctx = await navegador.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });

  for (const url of URLS) {
    const pag = await ctx.newPage();
    let bytes = 0;
    const porTipo = {};
    const erros = [];
    const falhas = [];

    pag.on("response", async (r) => {
      try {
        const h = r.headers();
        const n = parseInt(h["content-length"] || "0", 10) || 0;
        bytes += n;
        const t = (h["content-type"] || "outro").split(";")[0];
        porTipo[t] = (porTipo[t] || 0) + n;
        if (r.status() >= 400) falhas.push(`${r.status()} ${r.url().slice(0, 90)}`);
      } catch {}
    });
    pag.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 120)); });
    pag.on("pageerror", (e) => erros.push(String(e).slice(0, 120)));

    const t0 = Date.now();
    try {
      await pag.goto(url, { waitUntil: "load", timeout: 45000 });
    } catch (e) {
      saida.push({ vp: vp.nome, url, erro: String(e).slice(0, 80) });
      await pag.close();
      continue;
    }
    const carga = Date.now() - t0;
    await pag.waitForTimeout(1200);

    const m = await pag.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;

      // maior elemento que estoura a largura
      let culpados = [];
      if (overflow > 1) {
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > de.clientWidth + 2) {
            culpados.push(
              (el.tagName.toLowerCase() +
                (el.className && typeof el.className === "string"
                  ? "." + el.className.split(/\s+/).slice(0, 2).join(".")
                  : "")).slice(0, 60) + ` (${Math.round(r.right)}px)`
            );
          }
          if (culpados.length >= 5) break;
        }
      }

      // fontes pequenas em texto visível
      let menorFonte = 99, pequenas = 0;
      const textos = [...document.querySelectorAll("p,span,li,a,td,label,small,div")].filter(
        (e) => e.childElementCount === 0 && (e.textContent || "").trim().length > 3
      );
      for (const e of textos) {
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (!isNaN(fs)) {
          if (fs < menorFonte) menorFonte = fs;
          if (fs < 12) pequenas++;
        }
      }

      // alvos de toque pequenos
      let alvosPequenos = 0;
      const clicaveis = [...document.querySelectorAll("a,button,[role=button],input,select")];
      for (const e of clicaveis) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) alvosPequenos++;
      }

      // imagens
      const imgs = [...document.querySelectorAll("img")];
      const semLazy = imgs.filter((i) => !i.loading || i.loading === "eager").length;
      const superdimensionadas = imgs.filter(
        (i) => i.naturalWidth > 0 && i.clientWidth > 0 && i.naturalWidth > i.clientWidth * 2.2
      ).length;

      // vídeo
      const videos = [...document.querySelectorAll("video")].map((v) => ({
        autoplay: v.autoplay, preload: v.preload, poster: !!v.poster,
        src: (v.currentSrc || v.src || "").split("/").pop().slice(0, 40),
      }));

      // foco / a11y rápido
      const semLabel = [...document.querySelectorAll("input,select,textarea")].filter(
        (e) => !e.labels?.length && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")
      ).length;
      const skip = !!document.querySelector('a[href^="#"][class*=skip], a[href="#main"], a[href="#conteudo"]');

      const nav = performance.getEntriesByType("navigation")[0] || {};
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint") || [];
      const fcp = (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime;

      return {
        overflow, culpados, menorFonte: Math.round(menorFonte * 10) / 10, pequenas,
        alvosPequenos, clicaveis: clicaveis.length,
        imgs: imgs.length, semLazy, superdimensionadas, videos,
        semLabel, skip,
        dom: document.querySelectorAll("*").length,
        fcp: fcp ? Math.round(fcp) : null,
        lcp: lcpEntries.length ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null,
        domInterativo: nav.domInteractive ? Math.round(nav.domInteractive) : null,
      };
    });

    saida.push({
      vp: vp.nome, url: url.replace("https://sciensa.ai", ""),
      carga, kb: Math.round(bytes / 1024),
      porTipo: Object.fromEntries(
        Object.entries(porTipo).filter(([, v]) => v > 20000).map(([k, v]) => [k, Math.round(v / 1024)])
      ),
      ...m, erros: erros.slice(0, 3), falhas: falhas.slice(0, 3),
    });
    await pag.close();
  }
  await ctx.close();
}

await navegador.close();
fs.writeFileSync(process.argv[3], JSON.stringify(saida, null, 2), "utf8");
console.log("medidas:", saida.length);
