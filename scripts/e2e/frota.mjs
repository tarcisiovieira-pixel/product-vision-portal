// CRUD de frota no navegador: demo (sandbox) e administrador real (Supabase local + API).
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
// Só a tabela da frota: a auditoria, na mesma página, continua citando o indicativo.
const waitGone = (page, text, timeout = 20000) =>
  page.waitForFunction(
    (t) => !(document.querySelector("table")?.innerText ?? "").toUpperCase().includes(t),
    { timeout },
    text.toUpperCase(),
  );

// Campos controlados pelo React: usa o setter nativo e dispara o evento.
const dialogField = (label) =>
  `xpath/.//div[@role="dialog"]//label[contains(., "${label}")]//input`;
const fillByLabel = async (page, label, value) => {
  const [el] = await page.$$(dialogField(label));
  if (!el) throw new Error(`campo não encontrado: ${label}`);
  await el.evaluate((node, val) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, val);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(value));
};

async function openFleet(page) {
  await goto(page, "/app/admin");
  await waitText(page, "Painel de usuários");
  await clickText(page, "Frota", '[role="tab"]');
  await waitText(page, "Novo veículo");
}

async function createVehicle(page, callsign, name) {
  await clickText(page, "Novo veículo");
  await page.waitForSelector('[role="dialog"]');
  await clickText(page, "Starship Hopper", '[role="dialog"] button');
  await fillByLabel(page, "Nome", name);
  await fillByLabel(page, "Indicativo", callsign);
  await fillByLabel(page, "Motivo", "Teste e2e");
  await clickText(page, "Cadastrar", '[role="dialog"] button');
  await waitText(page, callsign);
}

const stamp = Date.now().toString(36).toUpperCase().slice(-6);
const demoCallsign = `E2E-D${stamp}`;

// Demo: tudo local, nada vai para o banco.
{
  const { page, errors } = await newPage(browser);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await openFleet(page);
    await sleep(500);

    await createVehicle(page, demoCallsign, "Foguete de Teste");
    r.ok("demo: veículo cadastrado aparece na frota");
    await shot(page, "frota-demo");

    await goto(page, "/app/booking");
    await waitText(page, demoCallsign);
    r.ok("demo: veículo novo aparece para o cliente");

    await openFleet(page);
    await page.click(`button[aria-label="Editar ${demoCallsign}"]`);
    await page.waitForSelector('[role="dialog"]');
    await fillByLabel(page, "Diária", 777);
    await fillByLabel(page, "Motivo", "Reajuste e2e");
    await clickText(page, "Salvar alterações", '[role="dialog"] button');
    await waitText(page, "MC$ 777");
    r.ok("demo: edição de preço refletida");

    await page.click(`button[aria-label="Arquivar ${demoCallsign}"]`);
    await page.waitForSelector('[role="dialog"]');
    await fillByLabel(page, "Motivo", "Fora de linha e2e");
    await clickText(page, "Arquivar", '[role="dialog"] button:not([aria-label])');
    await waitGone(page, demoCallsign);
    r.ok("demo: arquivado sai da lista");

    await goto(page, "/app/booking");
    await waitText(page, "HANGAR RETIRADA");
    r.check(
      !(await bodyText(page)).toUpperCase().includes(demoCallsign),
      "demo: arquivado some para o cliente",
    );

    await openFleet(page);
    await page.click('input[type="checkbox"]');
    await waitText(page, demoCallsign);
    await clickText(page, "Restaurar", "button");
    await fillByLabel(page, "Motivo", "Voltou e2e");
    await clickText(page, "Restaurar", '[role="dialog"] button');
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("mostrar arquivados"),
      { timeout: 10000 },
    );
    r.ok("demo: restaurar devolve o veículo");
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

// Administrador real: grava no banco via API.
{
  const email = `frota-${Date.now()}@ares.test`;
  const callsign = `E2E-R${stamp}`;
  const { page, errors } = await newPage(browser);
  await r.step("real", async () => {
    await goto(page, "/login");
    await clickText(page, "Cadastrar", "button");
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', "Teste#12345");
    await clickText(page, "Emitir Credencial");
    await waitPath(page, "/app/booking");
    sql(
      `insert into public.admin_users (user_id) select id from auth.users where email = '${email}'`,
    );

    await openFleet(page);
    await createVehicle(page, callsign, "Foguete Real de Teste");
    const row = sql(
      `select model_key||'|'||category||'|'||seats from public.vehicles where callsign = '${callsign}'`,
    );
    r.check(row === "starship_hopper|interplanetary_rocket|100", "real: gravou no banco", row);
    const audit = sql(
      `select count(*) from public.admin_audit_log where action = 'vehicle_created'`,
    );
    r.check(Number(audit) >= 1, "real: criação na auditoria", audit);

    await page.click(`button[aria-label="Arquivar ${callsign}"]`);
    await page.waitForSelector('[role="dialog"]');
    await fillByLabel(page, "Motivo", "Fora de linha e2e");
    await clickText(page, "Arquivar", '[role="dialog"] button:not([aria-label])');
    await waitGone(page, callsign);
    const deleted = sql(
      `select deleted_at is not null from public.vehicles where callsign = '${callsign}'`,
    );
    r.check(deleted === "t", "real: arquivar é exclusão lógica", deleted);

    await goto(page, "/app/booking");
    await waitText(page, "HANGAR RETIRADA");
    r.check(
      !(await bodyText(page)).toUpperCase().includes(callsign),
      "real: arquivado some para o cliente",
    );
  });
  r.check(errors.length === 0, "real: sem erros no console", errors[0] ?? "");
  await page.close();
}

await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
