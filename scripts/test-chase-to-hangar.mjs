import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function testHangarRedirection() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,850"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  page.on("console", (msg) => console.log(`[Console]: ${msg.text()}`));
  page.on("pageerror", (err) => console.warn(`[PageError]: ${err.message}`));

  console.log("1. Navegando para a Landing Page (http://localhost:8080/)...");
  await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded", timeout: 20000 });

  // Autenticar sessão demo para permitir acesso ao Hangar 3D (/app/hangar-3d)
  await page.evaluate(() => {
    localStorage.setItem(
      "ares_demo_session",
      JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        space_credential_id: "ARS-DEMO-01",
        pilot_license: "orbital",
        martian_credits: 25000,
      }),
    );
  });

  // 1. Abrir Chase Cam pelo card da frota
  console.log("2. Abrindo visualizador 3D pelo card da frota...");
  const btnVoo3D = await page.waitForSelector("button ::-p-text(Acompanhar Percurso 3D)", { timeout: 10000 });
  await btnVoo3D.click();

  // 2. Verificar se o painel da direita divide 'EM VOO ATIVO' e 'NA GARAGEM'
  await page.waitForSelector("::-p-text(EM VOO ATIVO)", { timeout: 8000 });
  await page.waitForSelector("::-p-text(NA GARAGEM)", { timeout: 8000 });
  console.log("3. Visualizador 3D aberto com seções 'EM VOO ATIVO' e 'NA GARAGEM' identificadas!");

  // 3. Clicar em APX-01 (que está na garagem)
  console.log("4. Clicando na nave estacionada APX-01 na lista 'NA GARAGEM'...");
  const btnApx = await page.waitForSelector("button ::-p-text(APX-01)", { timeout: 8000 });
  await btnApx.click();

  // 4. Verificar redirecionamento automático para /app/hangar-3d
  await page.waitForFunction(() => window.location.pathname.includes("/app/hangar-3d"), { timeout: 10000 });
  console.log("5. Redirecionado com sucesso para a garagem dos veículos:", page.url());

  // 5. Confirmar que o Hangar 3D carregou e inspecionou APX-01
  await page.waitForSelector("::-p-text(Apex Phantom Hyper-VTOL)", { timeout: 8000 });
  console.log("6. Hangar 3D carregou e inspecionou APX-01 na garagem com sucesso!");

  await page.screenshot({ path: "hangar-redirected.png" });
  console.log("7. Screenshot salva em hangar-redirected.png");

  await browser.close();
  console.log("\n=======================================================");
  console.log("  TESTE DE REDIRECIONAMENTO PARA GARAGEM: 100% SUCESSO!  ");
  console.log("=======================================================");
}

testHangarRedirection().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
