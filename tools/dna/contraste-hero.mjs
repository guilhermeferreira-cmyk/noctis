// Contraste do texto do hero contra o que está REALMENTE pintado atrás dele.
// Amostra o pixel composto, não o valor declarado no CSS — a regra do design
// system do Tessera: contraste é medido, não estimado.
import { chromium } from "playwright-core";
import fs from "node:fs";

const urls = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean);

const nav = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });

const lum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

console.log("pagina".padEnd(44), "fundo atras do h1".padEnd(20), "contraste x branco");
for (const url of urls) {
  const pag = await ctx.newPage();
  await pag.goto(url, { waitUntil: "load", timeout: 45000 });
  await pag.waitForTimeout(3000);

  const caixa = await pag.evaluate(() => {
    const h = document.querySelector("h1");
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!caixa) { await pag.close(); continue; }

  // Recorta a faixa do h1 e pega o pixel mais claro: o pior caso para texto branco.
  const png = await pag.screenshot({
    clip: { x: Math.max(0, caixa.x), y: Math.max(0, caixa.y), width: Math.min(caixa.w, 800), height: caixa.h },
  });
  const img = await pag.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    // histograma: descarta o texto branco em si (topo 12% dos pixels)
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    px.sort((a, b2) => (a[0] + a[1] + a[2]) - (b2[0] + b2[1] + b2[2]));
    return px[Math.floor(px.length * 0.88)];
  }, png.toString("base64"));

  const L = lum(img);
  const contraste = (1.0 + 0.05) / (L + 0.05);
  const marca = contraste >= 4.5 ? "OK" : contraste >= 3 ? "limite" : "FALHA";
  const rota = url.replace("http://127.0.0.1:3000", "");
  console.log(
    rota.padEnd(44),
    `rgb(${img.join(",")})`.padEnd(20),
    `${contraste.toFixed(2)}:1  ${marca}`,
  );
  await pag.close();
}
await ctx.close();
await nav.close();
