// Painel administrativo no navegador. Exige o Supabase local (promove admin via Docker).
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
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function signUp(page, email) {
  await goto(page, "/login");
  await clickText(page, "Cadastrar", "button");
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', "Teste#12345");
  await clickText(page, "Emitir Credencial");
  await waitPath(page, "/app/booking");
}

const stamp = Date.now();
const adminEmail = `admin-${stamp}@ares.test`;
const userEmail = `cliente-${stamp}@ares.test`;

// Demo
{
  const { page, errors } = await newPage(browser);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await clickText(page, "Administração", "a");
    await waitPath(page, "/app/admin");
    await waitText(page, "Painel de usuários");
    await waitText(page, "valentina@ares.test");
    const text = await bodyText(page);
    r.check(text.includes("Dados fictícios"), "demo: painel avisa que os dados são fictícios");
    await sleep(5000); // espera o aviso de entrada sumir
    await shot(page, "admin-painel");

    await clickText(page, "Saldo baixo", "button");
    await page.waitForFunction(
      () => !document.querySelector("table").innerText.includes("valentina@ares.test"),
      {
        timeout: 5000,
      },
    );
    r.ok("filtro de atenção restringe a tabela");
    await clickText(page, "Saldo baixo", "button");

    await page.type('input[aria-label="Buscar usuário"]', "valentina");
    await page.waitForFunction(
      () => !document.querySelector("table").innerText.includes("helena@ares.test"),
      {
        timeout: 5000,
      },
    );
    r.ok("busca funciona");

    await clickText(page, "valentina@ares.test", "td button");
    await page.waitForSelector('[role="dialog"]');
    await waitText(page, "somente leitura");
    const disabled = await page.$$eval('[role="dialog"] button', (bs) =>
      bs.filter((b) => /Ajustar|Suspender/.test(b.textContent)).every((b) => b.disabled),
    );
    r.check(disabled, "demo: ações ficam bloqueadas");
    await shot(page, "admin-usuario");
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

// Conta comum
const client = await newPage(browser);
await r.step("comum", async () => {
  await signUp(client.page, userEmail);
  const links = await client.page.$$eval("nav a", (a) => a.map((x) => x.textContent));
  r.check(!links.some((t) => t.includes("Administração")), "conta comum não vê o menu");
  await goto(client.page, "/app/admin");
  await waitPath(client.page, "/app/booking");
  r.ok("conta comum é barrada na URL direta");
});

// Admin real
{
  const { page, errors } = await newPage(browser);
  await r.step("admin", async () => {
    await signUp(page, adminEmail);
    sql(
      `insert into public.admin_users (user_id) select id from auth.users where email = '${adminEmail}'`,
    );
    await goto(page, "/app/admin");
    await waitText(page, "Painel de usuários");
    await waitText(page, userEmail);
    r.ok("admin acessa dados reais");
    r.check(!(await bodyText(page)).includes("Dados fictícios"), "admin real sem selo de demo");

    const expected = sql(`select count(*) from auth.users`);
    r.check(
      (await bodyText(page)).toLowerCase().includes(`de ${expected} usuários`),
      "total da tela bate com o banco",
      `${expected} no banco`,
    );

    await clickText(page, userEmail, "td button");
    await page.waitForSelector('[role="dialog"]');
    await page.type('[role="dialog"] input[placeholder^="Ex."]', "Bônus de teste");
    await page.type('[role="dialog"] input[type="number"]', "1500");
    await clickText(page, "Ajustar", '[role="dialog"] button');
    await waitText(page, "Ajuste de créditos");
    const saldo = sql(
      `select martian_credits from public.profiles p join auth.users u on u.id = p.user_id where u.email = '${userEmail}'`,
    );
    r.check(Number(saldo) === 26500, "ajuste de créditos grava no banco", saldo);

    await sleep(500);
    await clickText(page, userEmail, "td button");
    await page.waitForSelector('[role="dialog"]');
    await page.type('[role="dialog"] input[placeholder^="Ex."]', "Teste de suspensão");
    await clickText(page, "Suspender conta", '[role="dialog"] button');
    await waitText(page, "Conta suspensa");
    r.ok("suspensão aparece na auditoria");
  });
  r.check(errors.length === 0, "admin: sem erros no console", errors[0] ?? "");
  await page.close();
}

// A suspensão vale de verdade para quem está logado
await r.step("suspenso", async () => {
  await goto(client.page, "/app/booking");
  await waitText(client.page, "HANGAR RETIRADA");
  await client.page.evaluate(
    (value) => {
      const input = document.querySelector('input[type="number"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    String(7000 + Math.floor(Math.random() * 90000)),
  );
  await waitText(client.page, "RESERVAR AGORA");
  await clickText(client.page, "Reservar Agora");
  await waitText(client.page, "Conta suspensa");
  r.ok("conta suspensa é impedida de reservar");
});

await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
