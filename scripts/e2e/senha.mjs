// Troca e recuperação de senha no navegador. Exige o Supabase local (e-mails vão para o Mailpit).
import {
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

const MAIL_URL = process.env.SUPABASE_TEST_MAIL_URL ?? "http://127.0.0.1:54324";
const r = new Report();
const browser = await launch();

const email = `senha-e2e-${Date.now()}@ares.test`;
const FIRST = "Primeira#Senha1";
const SECOND = "Segunda#Senha22";
const THIRD = "Terceira#Senha333";

const waitText = (page, text, timeout = 20000) =>
  page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text,
  );

async function login(page, address, password) {
  await goto(page, "/login");
  await page.waitForSelector('input[type="email"]');
  await sleep(1200);
  await page.$eval('input[type="email"]', (el) => (el.value = ""));
  await page.type('input[type="email"]', address);
  await page.$eval('input[type="password"]', (el) => (el.value = ""));
  await page.type('input[type="password"]', password);
  await clickText(page, "Acessar Terminal");
}

async function fillPasswords(page, password, confirm) {
  await page.waitForSelector("#new-password");
  for (const [id, value] of [
    ["#new-password", password],
    ["#confirm-password", confirm],
  ]) {
    await page.$eval(id, (el) => (el.value = ""));
    await page.type(id, value);
  }
}

async function latestRecoveryLink(to) {
  for (let i = 0; i < 25; i++) {
    const list = await (await fetch(`${MAIL_URL}/api/v1/messages`)).json();
    const found = list.messages.find((m) => m.To.some((t) => t.Address === to));
    if (found) {
      const mail = await (await fetch(`${MAIL_URL}/api/v1/message/${found.ID}`)).json();
      const match = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(
        `${mail.HTML} ${mail.Text}`,
      );
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await sleep(400);
  }
  throw new Error("e-mail de recuperação não chegou");
}

// ----------------------------------------------------------- 1. troca dentro do app
{
  const { page, errors } = await newPage(browser);
  await r.step("troca de senha logado", async () => {
    await goto(page, "/login");
    await page.waitForSelector('input[type="email"]');
    await sleep(1500);
    await clickText(page, "Cadastrar", "button");
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', FIRST);
    await clickText(page, "Emitir Credencial");
    await waitPath(page, "/app/booking");
    await waitText(page, "Alterar senha");

    await clickText(page, "Alterar senha", "button");
    await page.waitForSelector('[role="dialog"]');
    r.ok("diálogo Alterar senha abre");

    await fillPasswords(page, "curta", "curta");
    await clickText(page, "Salvar nova senha", '[role="dialog"] button');
    await waitText(page, "pelo menos 8 caracteres");
    r.ok("senha curta é recusada com mensagem clara");

    await fillPasswords(page, SECOND, `${SECOND}x`);
    await clickText(page, "Salvar nova senha", '[role="dialog"] button');
    await waitText(page, "não são iguais");
    r.ok("confirmação diferente é recusada");
    await shot(page, "senha-dialogo-erro");

    await fillPasswords(page, SECOND, SECOND);
    await clickText(page, "Salvar nova senha", '[role="dialog"] button');
    await waitText(page, "Senha alterada");
    r.ok("senha alterada com sucesso");

    await clickText(page, "Sair");
    await waitPath(page, "/login");
    await login(page, email, FIRST);
    await waitText(page, "e-mail ou senha incorretos");
    r.ok("a senha antiga deixa de valer");

    await login(page, email, SECOND);
    await waitPath(page, "/app/booking");
    r.ok("a nova senha entra");
  });
  r.check(errors.length === 0, "troca: sem erros no console", errors[0] ?? "");
  await page.close();
}

// ----------------------------------------------------------- 2. esqueci minha senha
{
  const { page, errors } = await newPage(browser);
  let link = "";
  await r.step("recuperação por e-mail", async () => {
    await goto(page, "/login");
    await page.waitForSelector('input[type="email"]');
    await sleep(1500);

    await clickText(page, "Esqueci minha senha", "button");
    await waitText(page, "Digite seu e-mail");
    r.ok("pede o e-mail antes de enviar");

    await page.type('input[type="email"]', email);
    await clickText(page, "Esqueci minha senha", "button");
    await waitText(page, "Verifique seu e-mail");
    r.ok("confirma o envio sem revelar se a conta existe");
    await shot(page, "senha-esqueci-enviado");

    link = await latestRecoveryLink(email);
    r.ok("e-mail de recuperação chegou");

    await page.goto(link, { waitUntil: "domcontentloaded" });
    await waitPath(page, "/redefinir-senha", 20000);
    await page.waitForSelector("#new-password", { timeout: 20000 });
    r.ok("o link abre a tela de nova senha");
    await shot(page, "senha-redefinir");

    await fillPasswords(page, THIRD, THIRD);
    await clickText(page, "Salvar nova senha", "button");
    await waitText(page, "Senha alterada");
    await waitPath(page, "/app/booking", 20000);
    r.ok("nova senha salva e o usuário entra no app");

    await clickText(page, "Sair");
    await waitPath(page, "/login");
    await login(page, email, SECOND);
    await waitText(page, "e-mail ou senha incorretos");
    r.ok("a senha anterior deixa de valer após a recuperação");
    await login(page, email, THIRD);
    await waitPath(page, "/app/booking");
    r.ok("login com a senha recuperada");
  });
  r.check(errors.length === 0, "recuperação: sem erros no console", errors[0] ?? "");

  // o mesmo link não pode ser reutilizado
  await r.step("link reutilizado", async () => {
    const reused = await newPage(browser);
    await reused.page.goto(link, { waitUntil: "domcontentloaded" });
    await waitPath(reused.page, "/redefinir-senha", 20000);
    await waitText(reused.page, "expirou, já foi usado", 15000);
    r.ok("link já usado mostra aviso e não abre o formulário");
    r.check(!(await reused.page.$("#new-password")), "formulário não aparece com link inválido");
    await shot(reused.page, "senha-link-invalido");
    await reused.page.close();
  });
  await page.close();
}

// ----------------------------------------------------------- 3. acesso direto sem link, e demo
{
  const { page } = await newPage(browser);
  await r.step("sem link e demo", async () => {
    await goto(page, "/redefinir-senha");
    await waitText(page, "expirou, já foi usado", 15000);
    r.ok("abrir /redefinir-senha sem link mostra o aviso");

    await goto(page, "/login");
    await page.waitForSelector('input[type="email"]');
    await sleep(1500);
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await waitText(page, "Alterar senha");
    await clickText(page, "Alterar senha", "button");
    await waitText(page, "Indisponível no modo demo");
    r.ok("no demo, Alterar senha explica que não se aplica");
    r.check(!(await page.$('[role="dialog"]')), "demo não abre o diálogo");
  });
  await page.close();
}

await browser.close();
process.exit(r.summary() ? 1 : 0);
