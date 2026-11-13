// Utilitários dos testes de navegador (puppeteer-core + Chrome/Edge instalado).
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
export const SHOTS_DIR = process.env.E2E_SHOTS ?? path.resolve("e2e-shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

export async function launch() {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error("Chrome/Edge não encontrado. Defina CHROME_PATH.");
  return puppeteer.launch({
    executablePath,
    // E2E_HEADED=1 abre o Chrome na tela, devagar, para acompanhar o teste.
    headless: process.env.E2E_HEADED ? false : true,
    slowMo: process.env.E2E_HEADED ? 120 : 0,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });
}

/** Página nova com contexto isolado, coletando erros de console e exceções. */
export async function newPage(browser, { width = 1440, height = 900 } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // 4xx esperados (credencial errada, RLS) e assets ausentes não contam como quebra do app.
    if (/Failed to load resource/.test(t)) return;
    errors.push(`console: ${t.slice(0, 300)}`);
  });
  return { page, context, errors };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function goto(page, route) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
}

export async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

export async function clickText(page, text, selector = "button, a") {
  const handle = await page.waitForFunction(
    (sel, t) =>
      [...document.querySelectorAll(sel)].find(
        (el) =>
          el.textContent?.includes(t) &&
          el.offsetParent !== null &&
          // Só clica depois da hidratação do React; antes disso o clique se perde.
          Object.keys(el).some((k) => k.startsWith("__reactProps")),
      ) ?? null,
    { timeout: 20000 },
    selector,
    text,
  );
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await handle.click();
}

export const waitPath = (page, prefix, timeout = 20000) =>
  page.waitForFunction((p) => location.pathname.startsWith(p), { timeout }, prefix);

export const bodyText = (page) => page.evaluate(() => document.body.innerText);

/**
 * Mede movimento real: compara dois frames do maior canvas da tela.
 * Retorna a fração de pixels amostrados que mudaram (0 = cena parada).
 */
export async function canvasMotion(page, intervalMs = 1500) {
  const grab = () =>
    page.evaluate(async () => {
      const canvases = [...document.querySelectorAll("canvas")];
      const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!c) return null;
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const w = 160;
          const h = 90;
          const o = document.createElement("canvas");
          o.width = w;
          o.height = h;
          const g = o.getContext("2d");
          g.drawImage(c, 0, 0, w, h);
          resolve(Array.from(g.getImageData(0, 0, w, h).data));
        });
      });
    });
  const a = await grab();
  await sleep(intervalMs);
  const b = await grab();
  if (!a || !b) return null;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 24) changed++;
  }
  return changed / (a.length / 4);
}

export class Report {
  results = [];
  ok(name, detail = "") {
    this.results.push({ name, pass: true, detail });
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
  }
  fail(name, detail = "") {
    this.results.push({ name, pass: false, detail });
    console.log(`FAIL  ${name}  ${detail}`);
  }
  check(cond, name, detail = "") {
    cond ? this.ok(name, detail) : this.fail(name, detail);
    return cond;
  }
  async step(name, fn) {
    try {
      await fn();
    } catch (e) {
      this.fail(name, e.message.slice(0, 200));
    }
  }
  summary() {
    const failed = this.results.filter((r) => !r.pass);
    console.log(`\n${this.results.length - failed.length}/${this.results.length} verificações OK`);
    return failed.length;
  }
}
