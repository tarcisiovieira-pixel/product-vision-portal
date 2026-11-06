// Teste de ponta a ponta no navegador real.
// Pré-requisitos: app em E2E_BASE_URL apontando para um Supabase local com auto-confirmação
// e, para validar a API, VITE_API_URL definida. Instruções no README.
import {
  Report,
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

const r = new Report();
const browser = await launch();
const uniqueEmail = `piloto-${Date.now()}@ares.test`;
const PASSWORD = "Teste#12345";

const waitText = (page, text, timeout = 20000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

// Períodos ficam ocupados no banco: cada execução precisa de um sol próprio.
const setStartSol = (page, sol) =>
  page.evaluate((value) => {
    const input = document.querySelector('input[type="number"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(sol));

async function fillLogin(page, email, password) {
  await page.waitForSelector('input[type="email"]');
  await page.$eval('input[type="email"]', (el) => (el.value = ""));
  await page.type('input[type="email"]', email);
  await page.$eval('input[type="password"]', (el) => (el.value = ""));
  await page.type('input[type="password"]', password);
}

// ---------------------------------------------------------------- Landing
{
  const { page, errors } = await newPage(browser);
  await r.step("landing", async () => {
    await goto(page, "/");
    await waitText(page, "Mobilidade para quem");
    await page.waitForFunction(() => document.querySelector("select option[value]")?.value, {
      timeout: 20000,
    });
    await sleep(2000);
    const heroVisible = await page.evaluate(() => {
      const el = document.querySelector("h1").getBoundingClientRect();
      return (
        el.height > 0 && getComputedStyle(document.querySelector("h1")).visibility === "visible"
      );
    });
    r.check(heroVisible, "landing: hero visível");
    r.check((await canvasMotion(page)) > 0.002, "landing: Marte girando");
    await shot(page, "landing");

    const tip = await page.$('[data-testid="info-tip"]');
    await tip.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    await tip.hover();
    await page.waitForSelector('[role="tooltip"]', { timeout: 5000 });
    r.ok("landing: tooltip abre no hover");
    await shot(page, "landing-tooltip");
  });
  r.check(errors.length === 0, "landing: sem erros no console", errors[0] ?? "");
  await page.close();
}

// ---------------------------------------------------------------- Demo
{
  const { page, errors } = await newPage(browser);
  await r.step("demo", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitPath(page, "/app/booking");
    await waitText(page, "ARS-DEMO-01");
    r.ok("demo: entra sem cadastro");

    await goto(page, "/app/my-rentals");
    await waitText(page, "CC-X2-02");
    r.ok("demo: mostra reservas de exemplo");

    await clickText(page, "Acompanhar 3D");
    await page.waitForSelector("canvas");
    await sleep(3500);
    const motion = await canvasMotion(page);
    r.check(motion > 0.02, "voo real: cena em movimento", `${(motion * 100).toFixed(1)}% pixels`);
    await shot(page, "voo-ativo");
    const hud = await bodyText(page);
    r.check(
      hud.includes("VOO ATIVO") && !hud.includes("NO SOLO"),
      "nave em voo não aparece como parada",
    );
    await clickText(page, "Fechar");

    await goto(page, "/app/booking");
    await waitText(page, "Reservar agora".toUpperCase()).catch(() => {});
    await clickText(page, "Voo 3D").catch(() => clickText(page, "Acompanhar Voo 3D"));
    await page.waitForSelector("canvas");
    await sleep(3500);
    const sim = await canvasMotion(page);
    r.check(sim > 0.02, "veículo no hangar: voo simulado se move", `${(sim * 100).toFixed(1)}%`);
    await shot(page, "voo-simulado");
    await clickText(page, "Fechar");

    await goto(page, "/app/hangar-3d");
    await page.waitForSelector("canvas");
    await sleep(5000);
    const hangar = await canvasMotion(page);
    r.check(hangar > 0.01, "hangar: aeronave pairando", `${(hangar * 100).toFixed(1)}%`);
    await shot(page, "hangar");

    await goto(page, "/app/mars-radar");
    await page.waitForSelector("canvas");
    await sleep(5000);
    await shot(page, "radar");
    r.check((await canvasMotion(page)) > 0.002, "radar: cena animada");

    // Ocupação: APX-01 tem reserva nos sols 4221–4224; os padrões da tela (4219–4222) conflitam.
    await goto(page, "/app/booking");
    await waitText(page, "Reservado neste período");
    r.ok("ocupação: veículo reservado aparece bloqueado");
    await shot(page, "ocupacao-bloqueado");
    await setStartSol(page, 4230);
    await page.waitForFunction(() => !document.body.innerText.includes("Reservado neste período"), {
      timeout: 8000,
    });
    r.ok("ocupação: mudar as datas libera o veículo");

    await clickText(page, "Sair");
    await waitPath(page, "/login");
    const left = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("ares_")),
    );
    r.check(left.length === 0, "demo: sair limpa os dados locais", left.join());
  });
  r.check(errors.length === 0, "demo: sem erros no console", errors[0] ?? "");
  await page.close();
}

// ---------------------------------------------------------------- Usuário real
// E2E_SKIP_USER=1 evita criar contas ao rodar contra um Supabase que não é local.
if (!process.env.E2E_SKIP_USER) {
  const { page, errors } = await newPage(browser);
  const api = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/v1/")) api.push(req.url());
  });

  await r.step("usuario", async () => {
    await goto(page, "/login");
    await clickText(page, "Entrar", "button");
    await fillLogin(page, uniqueEmail, "senha-errada");
    await clickText(page, "Acessar Terminal");
    await waitText(page, "E-mail ou senha incorretos");
    r.check(page.url().endsWith("/login"), "login: senha errada é recusada");

    await clickText(page, "Cadastrar", "button");
    await fillLogin(page, uniqueEmail, PASSWORD);
    await clickText(page, "Emitir Credencial");
    await waitPath(page, "/app/booking");
    await page.waitForFunction(() => document.body.innerText.includes("25.000"), {
      timeout: 20000,
    });
    r.ok("cadastro: conta criada entra no app");

    const text = await bodyText(page);
    r.check(!text.includes("ARS-DEMO-01"), "conta nova: sem credencial demo");

    await goto(page, "/app/my-rentals");
    await waitText(page, "Minhas reservas");
    await sleep(1500);
    const rentals = await bodyText(page);
    r.check(
      !rentals.includes("CC-X2-02") && !rentals.includes("Q-KEY#8F4A92"),
      "conta nova: NÃO herda reservas demo",
    );
    await shot(page, "conta-nova-reservas");

    await goto(page, "/app/booking");
    await waitText(page, "HANGAR RETIRADA");
    await setStartSol(page, 6000 + Math.floor(Math.random() * 90000));
    await waitText(page, "RESERVAR AGORA");
    await clickText(page, "Reservar Agora");
    await sleep(2500);
    await shot(page, "conta-nova-reserva-feita");
    r.check(
      api.some((u) => u.endsWith("/v1/rentals")),
      "reserva real passa pela API",
      api.join(" ") || "nenhuma chamada",
    );

    await goto(page, "/app/my-rentals");
    await waitText(page, "CONFIRMADA");
    r.ok("reserva real persiste no banco após recarregar");

    await clickText(page, "Estender");
    await sleep(1500);
    r.check(
      api.some((u) => u.endsWith("/extend")),
      "estender passa pela API",
    );

    await page.reload();
    await waitText(page, "CONFIRMADA");
    const saldo = await page.evaluate(() => localStorage.getItem("ares_demo_session"));
    r.check(saldo === null, "conta real não cria sessão demo");

    await clickText(page, "Sair");
    await waitPath(page, "/login");

    await fillLogin(page, uniqueEmail, PASSWORD);
    await clickText(page, "Acessar Terminal");
    await waitPath(page, "/app/booking");
    r.ok("login: conta existente entra de novo");

    // Demo depois de conta real, no mesmo navegador: não pode vazar nada.
    await clickText(page, "Sair");
    await waitPath(page, "/login");
    await clickText(page, "Entrar no modo demo");
    await waitText(page, "ARS-DEMO-01");
    r.ok("demo após conta real: sessões não se misturam");
  });
  r.check(errors.length === 0, "usuário: sem erros no console", errors[0] ?? "");
  await page.close();
}

// ---------------------------------------------------------------- Rotas protegidas e mobile
{
  const { page } = await newPage(browser, { width: 390, height: 844 });
  await r.step("protegidas", async () => {
    await goto(page, "/app/my-rentals");
    await waitPath(page, "/login");
    r.ok("rota protegida sem sessão vai para o login");
    await shot(page, "mobile-login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    r.check(!overflow, "mobile: login sem rolagem horizontal");
  });
  await page.close();
}

await browser.close();
process.exit(r.summary() ? 1 : 0);
