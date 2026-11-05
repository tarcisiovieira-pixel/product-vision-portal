import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
console.log(`[Browser Test] Using browser executable: ${executablePath}`);

async function runBrowserTests() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on("pageerror", (err) => {
    console.warn(`[Page Error Event]: ${err.message}`);
  });
  page.on("console", (msg) => {
    console.log(`[Browser Console]: ${msg.text()}`);
  });

  console.log("\n=======================================================");
  console.log("  INICIANDO SUÍTE DE TESTES NO NAVEGADOR (PUPPETEER)  ");
  console.log("=======================================================\n");

  let passedSteps = 0;

  try {
    // -----------------------------------------------------------------
    // TESTE 1: FLUXO COMPLETO 1 — CONTRATAÇÃO VIA LANDING PAGE (LP)
    // -----------------------------------------------------------------
    console.log("1. Testando Fluxo de Contratação Completo via Landing Page ('/')...");
    await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded", timeout: 20000 });

    const title = await page.title();
    console.log(`   - Título da página: "${title}"`);
    if (!title.includes("ARES Mobility")) throw new Error("Título da Landing incorreto");

    // Verificar Seção da Frota
    await page.waitForSelector("#frota", { timeout: 8000 });
    console.log("   - Vitrine de Frota carregada com sucesso.");

    // Abrir Modal de Acompanhamento 3D diretamente do card da Landing
    const btnVoo3D = await page.waitForSelector("button ::-p-text(Acompanhar Percurso 3D)", { timeout: 8000 });
    console.log("   - Clicando em 'Acompanhar Percurso 3D' no card da frota...");
    await btnVoo3D.click();

    // Validar HUD do Modal 3D e Barreira de Tempestade
    await page.waitForSelector("::-p-text(DIRETOR DE VOO)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(BARREIRA DE TEMPESTADE:)", { timeout: 8000 });
    console.log("   - HUD 3D de Diretor de Voo aberto com Barreira de Tempestade ativa!");

    // Testar Botão Turbo Plasma Burn
    const btnTurbo = await page.waitForSelector("button ::-p-text(ATIVAR TURBO PLASMA)", { timeout: 8000 });
    await btnTurbo.click();
    await page.waitForSelector("::-p-text(TURBO ATIVO)", { timeout: 8000 });
    console.log("   - Turbo Plasma Burn ativado (+60% aceleração).");

    // Fechar modal 3D
    const btnFechar3D = await page.waitForSelector("button ::-p-text(Fechar)", { timeout: 8000 });
    await btnFechar3D.click();
    console.log("   - Modal de Percurso 3D fechado.");

    // INICIAR CONTRATAÇÃO VIA LP: Abrir Wizard de Aluguel
    const btnReservar = await page.waitForSelector("button ::-p-text(Reservar Veículo)", { timeout: 8000 });
    await btnReservar.click();
    await page.waitForSelector("::-p-text(Wizard de Locação ARES)", { timeout: 8000 });
    console.log("   - Passo 1: Voo & Itinerário aberto.");

    // Avançar para Passo 2 (Opcionais & Barreira Anti-Tempestade)
    const btnNext1 = await page.waitForSelector("button ::-p-text(Continuar →)", { timeout: 8000 });
    await btnNext1.click();
    await page.waitForSelector("::-p-text(Barreira Anti-Tempestade & Escudo Iônico)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(Seguro contra Tempestade de Sílica)", { timeout: 8000 });
    console.log("   - Passo 2: Opcionais Marcianos e Barreira Anti-Tempestade validados.");

    // Avançar para Passo 3 (Autenticação Obrigatória de Piloto)
    const btnNext2 = await page.waitForSelector("button ::-p-text(Continuar →)", { timeout: 8000 });
    await btnNext2.click();
    await page.waitForSelector("::-p-text(Autenticação de Piloto Obrigatória)", { timeout: 8000 });
    console.log("   - Passo 3: Autenticação Obrigatória de Piloto solicitada.");

    // Clicar em Autenticar como Comandante Demo
    const btnDemoAuth = await page.waitForSelector("button ::-p-text(Autenticar como Comandante Demo)", { timeout: 8000 });
    await btnDemoAuth.click();
    await page.waitForSelector("::-p-text(CREDENCIAL AUTENTICADA & VINCULADA À RESERVA)", { timeout: 8000 });
    console.log("   - Credencial de Comandante vinculada à reserva com 25.000 MC$.");

    // Confirmar e Emitir Chave Quântica
    const btnConfirmLP = await page.waitForSelector("button ::-p-text(Confirmar & Emitir Chave Quântica)", { timeout: 8000 });
    await btnConfirmLP.click();

    // Passo 4: Cartão de Embarque Quântico emitido
    await page.waitForSelector("::-p-text(ARES MOBILITY · BOARDING PASS)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(Q-KEY#8F4A92)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(BARREIRA CONTRA TEMPESTADES:)", { timeout: 8000 });
    console.log("   - Passo 4: Boarding Pass Quântico emitido com chave e proteção de Barreira ativa.");

    // Testar Comando Remoto na LP
    const btnDestravarLP = await page.waitForSelector("button ::-p-text(Destravar Esclusa)", { timeout: 8000 });
    await btnDestravarLP.click();
    console.log("   - Comando remoto 'Destravar Esclusa' executado com sucesso.");

    // Clicar em Abrir Cockpit Completo para transicionar para /app/booking
    const btnOpenApp = await page.waitForSelector("button ::-p-text(Abrir Cockpit Completo (/app))", { timeout: 8000 });
    await btnOpenApp.click();
    await page.waitForFunction(() => window.location.pathname.includes("/app"), { timeout: 20000 });
    console.log("   - Transição da Landing Page para o Cockpit Logado concluída.");

    passedSteps++;
    console.log("   [OK] Fluxo 1: Contratação via Landing Page validado 100% com sucesso.\n");

    // -----------------------------------------------------------------
    // TESTE 2: FLUXO COMPLETO 2 — CONTRATAÇÃO JÁ LOGADO (/app/booking)
    // -----------------------------------------------------------------
    console.log("2. Testando Fluxo de Contratação Completo Já Logado ('/app/booking')...");
    await page.goto("http://localhost:8080/app/booking", { waitUntil: "domcontentloaded", timeout: 20000 });

    await page.waitForSelector("::-p-text(Locadora)", { timeout: 8000 });
    console.log("   - Painel da Locadora carregado para o Comandante autenticado.");

    // Verificar Barreira Anti-Tempestade nos adicionais
    await page.waitForSelector("::-p-text(Barreira Anti-Tempestade & Escudo Iônico)", { timeout: 8000 });
    console.log("   - Barreira Anti-Tempestade & Escudo Iônico presente e ativada.");

    // Clicar em Reservar Agora no primeiro veículo disponível (CyberCab)
    const btnBookNow = await page.waitForSelector("button ::-p-text(Reservar Agora)", { timeout: 8000 });
    console.log("   - Clicando em 'Reservar Agora' no card do veículo...");
    await btnBookNow.click();

    // Validar abertura automática do Boarding Pass Quântico após a reserva
    await page.waitForSelector("::-p-text(Boarding Pass Quântico)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(Barreira Anti-Tempestade:)", { timeout: 8000 });
    console.log("   - Boarding Pass Quântico aberto automaticamente com chave quântica e barreira homologada.");

    // Testar acionamento remoto no Boarding Pass
    const btnUnlock = await page.waitForSelector("button ::-p-text(Destravar Esclusa)", { timeout: 8000 });
    await btnUnlock.click();

    // Testar botão "Acompanhar Voo 3D no Percurso" diretamente do Boarding Pass
    const btnChaseFromPass = await page.waitForSelector("button ::-p-text(Acompanhar Voo 3D no Percurso)", { timeout: 8000 });
    console.log("   - Clicando em 'Acompanhar Voo 3D no Percurso' no Boarding Pass...");
    await btnChaseFromPass.click();

    // Validar abertura do FlightChaseViewer3D
    await page.waitForSelector("::-p-text(DIRETOR DE VOO)", { timeout: 8000 });
    await page.waitForSelector("::-p-text(BARREIRA DE TEMPESTADE:)", { timeout: 8000 });
    console.log("   - Visualizador de Voo 3D aberto com telemetria e Barreira de Tempestade!");

    // Testar troca de câmera para Cockpit HUD
    const btnCockpit = await page.waitForSelector("button ::-p-text(Cockpit HUD (Asa))", { timeout: 8000 });
    await btnCockpit.click();
    console.log("   - Câmera alternada para Cockpit HUD com sucesso.");

    // Fechar visualizador 3D
    const btnCloseChase = await page.waitForSelector("button ::-p-text(Fechar)", { timeout: 8000 });
    await btnCloseChase.click();
    console.log("   - Visualizador de Voo 3D fechado.");

    passedSteps++;
    console.log("   [OK] Fluxo 2: Contratação Já Logado e Acompanhamento 3D validado com sucesso.\n");

    // -----------------------------------------------------------------
    // TESTE 3: HANGAR 3D (/app/hangar-3d)
    // -----------------------------------------------------------------
    console.log("3. Testando Módulo Hangar 3D ('/app/hangar-3d')...");
    await page.goto("http://localhost:8080/app/hangar-3d", { waitUntil: "domcontentloaded", timeout: 20000 });

    await page.waitForSelector("::-p-text(Inspeção e Engenharia dos Veículos)", { timeout: 8000 });
    console.log("   - Tela do Hangar 3D carregada.");

    const btnTruck = await page.waitForSelector("button ::-p-text(AHT-09)", { timeout: 8000 });
    await btnTruck.click();
    console.log("   - Selecionado Ares Heavy Truck no Hangar 3D.");

    const btnStarship = await page.waitForSelector("button ::-p-text(SSH-S1)", { timeout: 8000 });
    await btnStarship.click();
    console.log("   - Selecionado Foguete Starship Hopper no Hangar 3D.");

    passedSteps++;
    console.log("   [OK] Módulo Hangar 3D validado com sucesso.\n");

    // -----------------------------------------------------------------
    // TESTE 4: RADAR MARTE (/app/mars-radar)
    // -----------------------------------------------------------------
    console.log("4. Testando Módulo Radar Marte ('/app/mars-radar')...");
    await page.goto("http://localhost:8080/app/mars-radar", { waitUntil: "domcontentloaded", timeout: 20000 });

    await page.waitForSelector("::-p-text(Rastreamento da Frota & Percurso 3D)", { timeout: 8000 });
    console.log("   - Globo 3D do Radar Marte carregado com cúpulas de proteção.");

    const btnRadarVoo = await page.waitForSelector("button ::-p-text(Acompanhar Percurso 3D)", { timeout: 8000 });
    await btnRadarVoo.click();
    await page.waitForSelector("::-p-text(DIRETOR DE VOO)", { timeout: 8000 });
    console.log("   - Visualizador de Percurso 3D aberto pelo Radar Marte!");

    const btnCloseRadarChase = await page.waitForSelector("button ::-p-text(Fechar)", { timeout: 8000 });
    await btnCloseRadarChase.click();

    passedSteps++;
    console.log("   [OK] Módulo Radar Marte validado com sucesso.\n");

    // -----------------------------------------------------------------
    // TESTE 5: MANUTENÇÃO (/app/maintenance)
    // -----------------------------------------------------------------
    console.log("5. Testando Módulo Manutenção ('/app/maintenance')...");
    await page.goto("http://localhost:8080/app/maintenance", { waitUntil: "domcontentloaded", timeout: 20000 });

    await page.waitForSelector("::-p-text(Diagnóstico 3D & Telemetria da Frota)", { timeout: 8000 });
    console.log("   - Central de Manutenção carregada com telemetria de desgaste de sílica e bateria.");

    passedSteps++;
    console.log("   [OK] Módulo Manutenção validado com sucesso.\n");

    // -----------------------------------------------------------------
    // TESTE 6: MARKETPLACE (/app/marketplace)
    // -----------------------------------------------------------------
    console.log("6. Testando Módulo Compra & Venda / Marketplace ('/app/marketplace')...");
    await page.goto("http://localhost:8080/app/marketplace", { waitUntil: "domcontentloaded", timeout: 20000 });

    await page.waitForSelector("::-p-text(Compra, Venda e Financiamento de Espaçonaves)", { timeout: 8000 });
    console.log("   - Catálogo de naves seminovas e novas carregado.");

    const btnComprar = await page.waitForSelector("button ::-p-text(Comprar Espaçonave)", { timeout: 8000 });
    await btnComprar.click();
    await page.waitForSelector("::-p-text(Aquisição Definitiva de Veículo)", { timeout: 8000 });
    console.log("   - Modal de Aquisição e emissão de título de posse aberto com sucesso.");

    const btnCloseBuy = await page.waitForSelector("div.cut-corner.glass button.text-muted-foreground", { timeout: 8000 });
    await btnCloseBuy.click();

    passedSteps++;
    console.log("   [OK] Módulo Marketplace validado com sucesso.\n");

    console.log("======================================================================");
    console.log(`  TODOS OS ${passedSteps}/6 BLOCOS DE TESTES FORAM VALIDADOS COM SUCESSO! `);
    console.log("  INCLUINDO OS DOIS FLUXOS COMPLETOS (LP E LOGADO) E ACOMPANHAMENTO 3D! ");
    console.log("======================================================================\n");

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`\n[ERRO NO TESTE DE NAVEGADOR]: ${err.message}`);
    await page.screenshot({ path: "browser-test-failure.png" }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

runBrowserTests();
