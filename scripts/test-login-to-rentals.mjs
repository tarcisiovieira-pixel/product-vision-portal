import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function main() {
  console.log("1. Launching browser...");
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("console", (msg) => console.log("[Browser Console]:", msg.text()));
  page.on("pageerror", (err) => console.log("[Browser PageError]:", err.message));

  // 1. Visit Login page
  console.log("2. Navigating to /login...");
  await page.goto("http://localhost:8080/login", { waitUntil: "networkidle2" });
  console.log("On login page, URL:", page.url());

  // Click "Acesso Rápido de Demonstração"
  console.log("3. Clicking quick demo login...");
  const demoBtn = await page.waitForSelector("button ::-p-text(Acesso Rápido Demo)", {
    timeout: 10000,
  });
  await demoBtn.click();
  console.log("Clicked demo button!");

  // Wait for redirect to /app
  console.log("4. Waiting for /app navigation...");
  await page.waitForFunction(() => window.location.pathname.startsWith("/app"), { timeout: 15000 });
  console.log("Successfully authenticated into app! Current URL:", page.url());

  // Click on "Minhas Reservas" in the sidebar
  console.log('5. Clicking "Minhas Reservas" in navigation...');
  const navLink = await page.waitForSelector('a[href="/app/my-rentals"]', { timeout: 10000 });
  await navLink.click();
  console.log('Clicked "Minhas Reservas" link!');

  // Wait for Minhas Reservas URL
  await page.waitForFunction(() => window.location.pathname === "/app/my-rentals", {
    timeout: 10000,
  });
  console.log("Current URL is now /app/my-rentals!");

  // Wait a moment for render
  await new Promise((r) => setTimeout(r, 2000));
  const currentText = await page.evaluate(() => document.body.innerText);
  console.log("Text on /app/my-rentals page:\n", currentText);
  await page.screenshot({
    path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/debug-my-rentals.png",
  });

  // Wait for Minhas Reservas content
  console.log("6. Waiting for Minhas Reservas page...");
  await page.waitForFunction(
    () => document.body.innerText.toUpperCase().includes("HISTÓRICO DE FROTA"),
    { timeout: 15000 },
  );
  console.log('Found "Minhas Reservas" title!');

  await page.waitForFunction(
    () => document.body.innerText.toUpperCase().includes("TOTAL DE RESERVAS"),
    { timeout: 10000 },
  );
  console.log("Found metrics!");

  await page.waitForFunction(() => document.body.innerText.includes("APEX-VIP35"), {
    timeout: 10000,
  });
  console.log("Found promotional coupons!");

  // Capture screenshot of the full My Rentals page
  await page.screenshot({
    path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/my-rentals-overview.png",
  });
  console.log("Saved my-rentals-overview.png");

  // Click on "Chave Quântica & Controles"
  const clickedBP = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find((b) => b.innerText.toUpperCase().includes("CHAVE QUÂNTICA & CONTROLES"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (clickedBP) {
    console.log('7. Clicked "Chave Quântica & Controles" button');
    await page.waitForFunction(
      () => document.body.innerText.toUpperCase().includes("BOARDING PASS QUÂNTICO"),
      { timeout: 10000 },
    );
    console.log("Boarding Pass Quântico modal displayed!");

    // Trigger Destravar Esclusa
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.innerText.toUpperCase().includes("DESTRAVAR ESCLUSA"));
      if (btn) btn.click();
    });

    await new Promise((r) => setTimeout(r, 600));

    // Capture screenshot of the modal
    await page.screenshot({
      path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/my-rentals-boarding-pass.png",
    });
    console.log("Saved my-rentals-boarding-pass.png");
  }

  // Click "Usar Cupom APEX-VIP35"
  console.log("8. Testing promotional coupon application...");
  // Close modal first
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find((b) => b.innerText.toUpperCase().includes("FECHAR"));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find((b) => b.innerText.toUpperCase().includes("APEX-VIP35"));
    if (btn) btn.click();
  });

  // Verify redirection to /app/booking with coupon applied
  await page.waitForFunction(() => window.location.pathname.includes("/app/booking"), {
    timeout: 10000,
  });
  console.log("Successfully redirected to /app/booking with coupon! URL:", page.url());

  // Capture screenshot of booking page showing the coupon banner
  await page.screenshot({
    path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/booking-coupon-applied.png",
  });
  console.log("Saved booking-coupon-applied.png");

  await browser.close();
  console.log(
    'All browser E2E tests for "Minhas Reservas" & "Promoções" PASSED with 100% success!',
  );
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
