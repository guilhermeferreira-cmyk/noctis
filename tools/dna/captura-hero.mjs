// Screenshot do hero, para olhar o resultado em vez de supor.
import { chromium } from "playwright-core";
import fs from "node:fs";

const [, , listaArq, destino] = process.argv;
const urls = fs.readFileSync(listaArq, "utf8").trim().split("\n").filter(Boolean);

const nav = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const vp of [
  { nome: "desktop", width: 1440, height: 900 },
  { nome: "mobile", width: 390, height: 844, mobile: true },
]) {
  const ctx = await nav.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  for (const url of urls) {
    const pag = await ctx.newPage();
    await pag.goto(url, { waitUntil: "load", timeout: 45000 });
    await pag.waitForTimeout(3000); // deixa o shader pintar alguns frames
    const slug = url.split("/").filter(Boolean).slice(2).join("-") || "home";
    await pag.screenshot({ path: `${destino}/${slug}-${vp.nome}.png` });
    await pag.close();
  }
  await ctx.close();
}
await nav.close();
console.log("capturado");
