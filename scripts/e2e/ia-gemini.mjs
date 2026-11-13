// IA generativa de ponta a ponta contra um Gemini SIMULADO (scripts/e2e/mock-gemini.mjs).
// Prova a cadeia tela -> API -> HTTP -> validação -> tela, a cota no banco e o aviso de provedor.
// Não prova o Google de verdade: para isso use `npm run ai:check` na pasta backend, com a chave.
import { execFileSync } from "node:child_process";
import { BASE_URL, Report, bodyText, clickText, goto, launch, newPage, waitPath } from "./lib.mjs";

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

const email = `gemini-${Date.now()}@ares.test`;
const { page, errors } = await newPage(browser);
await r.step("gemini", async () => {
  await goto(page, "/login");
  await clickText(page, "Cadastrar", "button");
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', "Teste#12345");
  await clickText(page, "Emitir Credencial");
  await waitPath(page, "/app/booking");

  await goto(page, "/app/consultor");
  await waitText(page, "Conte o que você precisa");
  await waitText(page, "IA generativa (Gemini)");
  r.ok("selo mostra IA generativa (Gemini)");

  await page.type("#pedido", "quero algo confortável para dois");
  await clickText(page, "Pedir indicação");
  await waitText(page, "Resposta simulada do Gemini");
  r.ok("a resposta escrita pelo modelo aparece na tela");
  const cards = await page.$$eval('[data-testid="consult-card"]', (c) => c.length);
  r.check(cards >= 1, "as indicações continuam vindo do catálogo", String(cards));

  const used = sql(`select coalesce(sum(used),0) from public.ai_usage where kind = 'consult'`);
  r.check(Number(used) === 1, "cota diária consumida no banco (1 por pedido)", used);

  sql(
    `insert into public.admin_users (user_id) select id from auth.users where email = '${email}'`,
  );
  await goto(page, "/app/admin");
  await waitText(page, "Painel de usuários");
  await clickText(page, "IA", '[role="tab"]');
  await waitText(page, "Resumo por IA generativa (Gemini)");
  await clickText(page, "Gerar resumo", "button");
  await waitText(page, "Resumo simulado do Gemini");
  r.ok("resumo executivo escrito pelo modelo aparece no painel");
  r.check(!(await bodyText(page)).includes(email), "o e-mail não aparece na análise");
});
r.check(errors.length === 0, "sem erros no console", errors[0] ?? "");
await page.close();
await browser.close();
console.log(`Base: ${BASE_URL}`);
process.exit(r.summary() ? 1 : 0);
