// IAs no navegador: consultor, sugestões na locadora e análise do painel (demo e conta real).
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

async function consult(page, text) {
  await goto(page, "/app/consultor");
  await waitText(page, "Conte o que você precisa");
  await page.type("#pedido", text);
  await clickText(page, "Pedir indicação");
  await page.waitForSelector('[data-testid="consult-card"]', { timeout: 20000 });
}

async function openAdminIa(page) {
  await goto(page, "/app/admin");
  await waitText(page, "Painel de usuários");
  await clickText(page, "IA", '[role="tab"]');
  await waitText(page, "IA analítica");
  await page.waitForSelector('[data-testid="insights"] li');
}

// Demo
{
  const { page, errors } = await newPage(browser);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await sleep(500);

    await consult(page, "Viagem de casal, quero luxo e conforto, sem tempestade no caminho.");
    const cards = await page.$$eval('[data-testid="consult-card"]', (c) => c.length);
    r.check(cards >= 1 && cards <= 3, "demo: consultor indica de 1 a 3 veículos", String(cards));
    r.check(
      (await bodyText(page)).includes("Motor de regras"),
      "demo: selo diz que é motor de regras",
    );
    await shot(page, "ia-consultor");

    await clickText(page, "Reservar este", "a");
    await waitPath(page, "/app/booking");
    await waitText(page, "Indicado pelo Consultor IA");
    r.ok("demo: a indicação abre a locadora com o veículo destacado");

    // Pedido que ninguém atende: explica em vez de inventar
    await goto(page, "/app/consultor");
    await waitText(page, "Conte o que você precisa");
    await page.type("#pedido", "Preciso de um veículo para 400 pessoas amanhã");
    await clickText(page, "Pedir indicação");
    await waitText(page, "Nenhum veículo");
    r.check(
      (await page.$$('[data-testid="consult-card"]')).length === 0,
      "demo: pedido impossível não inventa veículo",
    );

    // Sugestões na locadora: rota longa de carro recomenda o piloto automático
    await goto(page, "/app/booking?pickup=h-oly-01&dropoff=h-jez-02&sols=2");
    await page.waitForSelector('[data-testid="upsell-panel"]', { timeout: 20000 });
    const before = await page.$$eval('[data-testid="upsell-item"]', (i) => i.length);
    r.check(before >= 1, "demo: locadora sugere adicionais com motivo e custo", String(before));
    r.check(
      (await bodyText(page)).includes("Piloto Automático Neural"),
      "demo: sugestão cita o piloto automático para a rota longa",
    );
    await clickText(page, "Adicionar", '[data-testid="upsell-panel"] button');
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid="upsell-item"]').length < n,
      { timeout: 10000 },
      before,
    );
    r.ok("demo: aplicar a sugestão a remove da lista");
    await shot(page, "ia-upsell");

    await openAdminIaDemo(page);
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

async function openAdminIaDemo(page) {
  await openAdminIa(page);
  const insights = await page.$$eval('[data-testid="insights"] li', (l) => l.length);
  r.check(insights >= 1, "demo: painel lista achados", String(insights));
  await clickText(page, "Gerar resumo", "button");
  await page.waitForSelector('[data-testid="ai-summary"]', { timeout: 20000 });
  r.ok("demo: resumo executivo gerado");
  await shot(page, "ia-analitica");
  const action = await page.$$eval('[data-testid="insights"] li button', (b) => b.length);
  if (action > 0) {
    await page.click('[data-testid="insights"] li button');
    await page.waitForFunction(
      () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes("exige atenção") || t.includes("novo veículo");
      },
      { timeout: 10000 },
    );
    r.ok("demo: a ação do achado leva à aba de usuários ou de frota");
  }
}

// Conta real: API + banco
{
  const email = `ia-${Date.now()}@ares.test`;
  const { page, errors } = await newPage(browser);
  await r.step("real", async () => {
    await goto(page, "/login");
    await clickText(page, "Cadastrar", "button");
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', "Teste#12345");
    await clickText(page, "Emitir Credencial");
    await waitPath(page, "/app/booking");

    await consult(page, "Viagem de casal, quero luxo e conforto");
    const text = await bodyText(page);
    r.check(text.includes("Motor de regras"), "real: sem chave, selo mostra motor de regras");
    const ids = await page.$$eval('[data-testid="consult-card"] h2', (h) =>
      h.map((x) => x.textContent),
    );
    const names = sql(
      `select string_agg(name, '|') from public.vehicles where deleted_at is null`,
    ).split("|");
    r.check(
      ids.every((n) => names.includes(n)),
      "real: toda indicação existe no catálogo do banco",
      ids.join(", "),
    );

    sql(
      `insert into public.admin_users (user_id) select id from auth.users where email = '${email}'`,
    );
    await openAdminIa(page);
    await clickText(page, "Gerar resumo", "button");
    await page.waitForSelector('[data-testid="ai-summary"]', { timeout: 20000 });
    const used = sql(`select coalesce(sum(used), 0) from public.ai_usage`);
    r.ok(`real: resumo gerado pela API (consumo de cota generativa: ${used})`);
    r.check(!(await bodyText(page)).includes(email), "real: o e-mail não aparece na análise");
  });
  r.check(errors.length === 0, "real: sem erros no console", errors[0] ?? "");
  await page.close();
}

await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
