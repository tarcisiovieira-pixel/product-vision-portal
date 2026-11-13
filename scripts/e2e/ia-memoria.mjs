// Memória persistente das IAs no navegador: demo (sandbox) e conta real (banco + API).
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

async function ask(page, text) {
  await goto(page, "/app/consultor");
  await page.waitForSelector("#pedido");
  await sleep(1200);
  await page.type("#pedido", text);
  await clickText(page, "Pedir indicação");
  await page.waitForSelector('[data-testid="consult-reply"]', { timeout: 40000 });
  await sleep(400);
}

async function memoryScenario(page, label) {
  await ask(page, "Eu sempre prefiro o mais barato e costumo viajar com 2 pessoas");
  await waitText(page, "Anotei:");
  r.ok(`${label}: a IA anota o que foi dito como hábito`);

  await ask(page, "preciso de um veículo");
  await waitText(page, "Usei da sua memória");
  const used = await page.$eval('[data-testid="memory-used"]', (e) => e.textContent);
  r.check(
    /economia/.test(used) && /2 pessoas/.test(used),
    `${label}: usa a memória na consulta seguinte`,
    used,
  );

  await page.click('[data-testid="ai-memory"] summary');
  await sleep(300);
  await shot(page, `ia-memoria-${label}`);
  const items = await page.$$eval('[data-testid="ai-memory"] li', (l) => l.length);
  r.check(items === 2, `${label}: painel lista as lembranças`, String(items));

  await page.click('[data-testid="ai-memory"] li button');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="ai-memory"] li').length === 1,
    { timeout: 10000 },
  );
  r.ok(`${label}: apagar um item funciona`);

  await clickText(page, "Usar memória e histórico", "label");
  await sleep(800);
  await ask(page, "preciso de um veículo");
  r.check(
    (await page.$('[data-testid="memory-used"]')) === null,
    `${label}: com a memória desligada, nada é usado`,
  );
  // religa a memória para o restante do teste
  await page.click('[data-testid="ai-memory"] summary');
  await clickText(page, "Usar memória e histórico", "label");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="ai-memory"] input[type="checkbox"]')?.checked,
    { timeout: 10000 },
  );
}

// Demo
{
  const { page, errors } = await newPage(browser);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await sleep(500);
    await memoryScenario(page, "demo");

    // upsell: dispensar uma sugestão a deixa quieta nas próximas visitas
    await goto(page, "/app/booking?pickup=h-oly-01&dropoff=h-jez-02&sols=2");
    await page.waitForSelector('[data-testid="upsell-panel"]', { timeout: 20000 });
    const before = await page.$$eval('[data-testid="upsell-item"]', (i) => i.length);
    await page.click('[data-testid="upsell-panel"] button[aria-label^="Dispensar"]');
    await sleep(600);
    await goto(page, "/app/booking?pickup=h-oly-01&dropoff=h-jez-02&sols=2");
    await sleep(2500);
    const after = await page.$$eval('[data-testid="upsell-item"]', (i) => i.length);
    r.check(
      after < before,
      "demo: sugestão dispensada não volta nas próximas visitas",
      `${before} → ${after}`,
    );

    // painel: memória da IA analítica
    await goto(page, "/app/admin");
    await waitText(page, "Painel de usuários");
    await clickText(page, "IA", '[role="tab"]');
    await waitText(page, "desde");
    r.ok("demo: a IA analítica compara com o registro anterior (tendência)");
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

// Conta real
{
  const email = `memoria-${Date.now()}@ares.test`;
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

    await memoryScenario(page, "real");

    await ask(page, "Eu sempre prefiro conforto");
    await waitText(page, "Anotei:");
    const rows = sql(
      `select string_agg(topic || '=' || value, ',' order by topic) from public.ai_memory m join auth.users u on u.id = m.user_id where u.email = '${email}'`,
    );
    r.check(/priority=comfort/.test(rows), "real: a memória está gravada no banco", rows);
    const leaked = sql(
      `select count(*) from public.ai_memory m join auth.users u on u.id = m.user_id where u.email = '${email}' and (m.value like '%@%')`,
    );
    r.check(Number(leaked) === 0, "real: nenhum dado pessoal na memória", leaked);

    // histórico do painel: administrador registra e vê a tendência no dia seguinte
    sql(
      `insert into public.admin_users (user_id) select id from auth.users where email = '${email}'`,
    );
    await goto(page, "/app/admin");
    await waitText(page, "Painel de usuários");
    await clickText(page, "IA", '[role="tab"]');
    await waitText(page, "IA analítica");
    await clickText(page, "Gerar resumo", "button");
    await page.waitForSelector('[data-testid="ai-summary"]', { timeout: 20000 });
    await sleep(800);
    const snap = sql(`select count(*) from public.ai_snapshots where taken_on = current_date`);
    r.check(Number(snap) === 1, "real: números de hoje registrados para comparar depois", snap);
    sql(
      `update public.ai_snapshots set taken_on = current_date - 5, data = jsonb_set(data, '{users}', to_jsonb((data->>'users')::int - 3))`,
    );
    await goto(page, "/app/admin");
    await waitText(page, "Painel de usuários");
    await clickText(page, "IA", '[role="tab"]');
    await waitText(page, "usuários desde");
    r.ok("real: a IA analítica mostra a tendência em relação ao registro anterior");
    sql(`delete from public.ai_snapshots`);
  });
  r.check(errors.length === 0, "real: sem erros no console", errors[0] ?? "");
  await page.close();
}

await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
