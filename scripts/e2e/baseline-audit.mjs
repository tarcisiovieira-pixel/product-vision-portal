// Percorre todas as telas no modo demo e registra texto, erros e movimento 3D.
import fs from "node:fs";
import path from "node:path";
import {
  SHOTS_DIR,
  bodyText,
  canvasMotion,
  clickText,
  goto,
  launch,
  newPage,
  shot,
  sleep,
  waitPath,
} from "./lib.mjs";

const browser = await launch();
const { page, errors } = await newPage(browser);
const rows = [];

async function visit(name, route, wait = 3500) {
  errors.length = 0;
  await goto(page, route);
  await sleep(wait);
  const text = await bodyText(page);
  const motion = await canvasMotion(page, 1200);
  await shot(page, name);
  rows.push({ name, words: text.split(/\s+/).length, motion, errs: [...errors] });
  fs.writeFileSync(path.join(SHOTS_DIR, `${name}.txt`), text);
}

await visit("01-landing", "/");
await visit("02-login", "/login");
await clickText(page, "Entrar no modo demo");
await waitPath(page, "/app");
await sleep(1500);
for (const [n, r] of [
  ["03-booking", "/app/booking"],
  ["04-rentals", "/app/my-rentals"],
  ["05-hangar", "/app/hangar-3d"],
  ["06-radar", "/app/mars-radar"],
  ["07-maintenance", "/app/maintenance"],
  ["08-marketplace", "/app/marketplace"],
]) {
  await visit(n, r, n === "05-hangar" || n === "06-radar" ? 6000 : 3500);
}
console.table(
  rows.map((r) => ({
    tela: r.name,
    palavras: r.words,
    movimento: r.motion == null ? "-" : `${(r.motion * 100).toFixed(1)}%`,
    erros: r.errs.length,
  })),
);
for (const r of rows) for (const e of r.errs) console.log(r.name, e);
await browser.close();
