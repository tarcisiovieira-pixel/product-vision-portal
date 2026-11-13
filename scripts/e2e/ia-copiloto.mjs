// Copiloto GPS no navegador: demo (sandbox) e conta real (banco + API + IA generativa, se houver).
import { execFileSync } from "node:child_process";
import {
  BASE_URL,
  Report,
  bodyText,
  clickText,
  goto,
  launch,
  newPage,
  shot,
  sleep,
  waitPath,
} from "./lib.mjs";

const container = process.env.SUPABASE_TEST_DB_CONTAINER ?? "supabase_db_qxlzdpahifwiyzmxlpef";
const sql = (query) =>
  execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-tAc", query], {
    encoding: "utf8",
  }).trim();

const r = new Report();
const browser = await launch();
const waitText = (page, text, timeout = 20000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text,
  );

// Voz simulada: registra o que seria falado e permite testar sem áudio.
const stubSpeech = (page) =>
  page.evaluateOnNewDocument(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: { speak: (u) => window.__spoken.push(u.text), cancel() {}, getVoices: () => [] },
      configurable: true,
    });
  });

const setProgress = (page, value) =>
  page.$eval(
    'input[aria-label="Posição no trajeto"]',
    (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );

async function ask(page, text) {
  const before = await page.$$eval('[data-testid="msg-copilot"]', (m) => m.length);
  await page.type('[data-testid="copilot-input"]', text);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="msg-copilot"]').length > n,
    { timeout: 40000 },
    before,
  );
  await sleep(300);
  const msgs = await page.$$eval('[data-testid="msg-copilot"]', (m) => m.map((x) => x.textContent));
  return msgs[msgs.length - 1];
}

// Demo
{
  const { page, errors } = await newPage(browser);
  await stubSpeech(page);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await sleep(500);

    await clickText(page, "Copiloto GPS", "a");
    await waitPath(page, "/app/copiloto");
    await waitText(page, "Fale com o copiloto");
    r.ok("demo: o menu abre o copiloto");

    // a voz fica ligada entre visitas (preferência guardada no navegador)
    await page.evaluate(() => localStorage.setItem("ares_copilot_voice", "1"));
    await goto(page, "/app/copiloto?vehicle=v-apx-01&from=h-jez-02&to=h-oly-01");
    await page.waitForSelector('[data-testid="copilot-map"]');
    await sleep(1200);
    const faltam = await page.$eval('[data-testid="copilot-telemetry"]', (e) => e.textContent);
    r.check(
      /Faltam[\d.]+ km/.test(faltam),
      "demo: telemetria de navegação na tela",
      faltam.slice(0, 60),
    );
    await waitText(page, "Voz ligada");

    // o GPS avisa sozinho quando surge algo importante
    await setProgress(page, 5);
    await waitText(page, "Frente de poeira Utopia");
    await page.waitForSelector('[data-testid="copilot-detour"]', { timeout: 10000 });
    r.ok("demo: tempestade à frente aparece no mapa com a rota de desvio");
    const spokenAlert = await page.evaluate(() => window.__spoken);
    r.check(
      spokenAlert.some((t) => /Utopia/.test(t)),
      "demo: o aviso do GPS é falado em voz alta",
      (spokenAlert[0] ?? "").slice(0, 80),
    );
    await ask(page, "quanto falta?");
    const spoken = await page.evaluate(() => window.__spoken);
    r.check(
      /quilômetros/.test(spoken[spoken.length - 1] ?? ""),
      "demo: a resposta é falada com as unidades por extenso",
      (spoken[spoken.length - 1] ?? "").slice(0, 80),
    );
    await shot(page, "ia-copiloto");

    const detour = await ask(page, "posso desviar?");
    r.check(
      /\+\d+ km/.test(detour),
      "demo: pergunta por texto sobre o desvio",
      detour.slice(0, 90),
    );
    const ban = await ask(page, "Me fale sobre o Brasil");
    r.check(/copiloto de bordo da ARES/.test(ban), "demo: assunto fora do escopo é recusado");

    // destino sob tempestade
    await goto(page, "/app/copiloto?vehicle=v-cc-01&from=h-val-03&to=h-aci-04");
    await waitText(page, "está sob");
    r.ok("demo: destino sob tempestade avisa que desviar não resolve");

    // da reserva para o copiloto
    await goto(page, "/app/my-rentals");
    await waitText(page, "Minhas Reservas");
    const link = await page.$('a[href*="/app/copiloto"]');
    r.check(Boolean(link), "demo: reserva ativa tem atalho para o copiloto");
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

// Conta real
{
  const email = `copiloto-${Date.now()}@ares.test`;
  const { page, errors } = await newPage(browser);
  await r.step("real", async () => {
    await goto(page, "/login");
    await page.waitForSelector('input[type="email"]');
    await sleep(2000);
    await clickText(page, "Cadastrar", "button");
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', "Teste#12345");
    await clickText(page, "Emitir Credencial");
    await waitPath(page, "/app/booking");

    await goto(page, "/app/copiloto");
    await page.waitForSelector('[data-testid="copilot-map"]', { timeout: 20000 });
    await sleep(1000);
    const reply = await ask(page, "Quanto falta para chegar?");
    r.check(
      /Faltam|km|chegou/i.test(reply),
      "real: resposta do copiloto pela API",
      reply.slice(0, 100),
    );
    const used = sql(
      `select coalesce(sum(used),0) from public.ai_usage a join auth.users u on u.id = a.user_id where u.email = '${email}' and kind = 'copilot'`,
    );
    const generative = (await bodyText(page)).includes("IA generativa");
    r.check(
      generative ? Number(used) === 1 : Number(used) === 0,
      generative
        ? "real: cota do copiloto consumida (IA generativa ligada)"
        : "real: sem IA generativa, nenhuma cota consumida",
      used,
    );
    const ban = await ask(page, "Quem ganhou o jogo do Flamengo?");
    r.check(/copiloto de bordo da ARES/.test(ban), "real: assunto fora do escopo é recusado");
    const after = sql(
      `select coalesce(sum(used),0) from public.ai_usage a join auth.users u on u.id = a.user_id where u.email = '${email}' and kind = 'copilot'`,
    );
    r.check(after === used, "real: assunto proibido não gasta cota", `${used} → ${after}`);
  });
  r.check(errors.length === 0, "real: sem erros no console", errors[0] ?? "");
  await page.close();
}

await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
