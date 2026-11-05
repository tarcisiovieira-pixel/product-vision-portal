import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function main() {
  console.log("Launching browser to test Minhas Reservas with path:", executablePath);
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("console", (msg) => console.log("[Browser Console]:", msg.text()));
  page.on("pageerror", (err) => console.log("[Browser PageError]:", err.message));

  // 1. Visit landing page
  console.log("1. Navigating to landing page...");
  await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded" });
  console.log("Visited landing page");

  // Inject session so user is authenticated
  await page.evaluate(() => {
    localStorage.setItem(
      "ares_demo_session",
      JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        space_credential_id: "ARS-DEMO-01",
        pilot_license: "orbital",
        martian_credits: 75000,
      }),
    );
  });

  // 2. Click "Minhas Reservas" in the header or navigate
  console.log('2. Clicking "Minhas Reservas" header link...');
  const clickedLink = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const link = links.find((a) => a.innerText.includes("Minhas Reservas"));
    if (link) {
      link.click();
      return true;
    }
    return false;
  });
  console.log("Clicked header link?", clickedLink);

  if (!clickedLink) {
    await page.goto("http://localhost:8080/app/my-rentals", { waitUntil: "domcontentloaded" });
  }

  // Wait for header and cards
  console.log("3. Waiting for Minhas Reservas content...");
  await page.waitForFunction(() => document.body.innerText.includes("Minhas Reservas"), {
    timeout: 15000,
  });
  console.log('Found "Minhas Reservas" title');

  await page.waitForFunction(() => document.body.innerText.includes("Total de Reservas"), {
    timeout: 10000,
  });
  console.log("Found metrics");

  // Verify promotion coupons are displayed
  await page.waitForFunction(() => document.body.innerText.includes("APEX-VIP35"), {
    timeout: 10000,
  });
  console.log("Found promotion coupons");

  // Capture screenshot of the full My Rentals page
  await page.screenshot({
    path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/my-rentals-overview.png",
  });
  console.log("Saved my-rentals-overview.png");

  // Click on "Chave Quântica & Controles"
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find((b) => b.innerText.includes("Chave Quântica & Controles"));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    console.log('4. Clicked "Chave Quântica & Controles" button');
    await page.waitForFunction(() => document.body.innerText.includes("Boarding Pass Quântico"), {
      timeout: 10000,
    });
    console.log("Boarding Pass Quântico modal displayed");

    // Trigger Destravar Esclusa
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.innerText.includes("Destravar Esclusa"));
      if (btn) btn.click();
    });

    await new Promise((r) => setTimeout(r, 600));

    // Capture screenshot of the modal
    await page.screenshot({
      path: "C:/Users/lukii/.gemini/antigravity-cli/brain/b7c4411d-f299-45c0-a56d-0badf1b3c152/my-rentals-boarding-pass.png",
    });
    console.log("Saved my-rentals-boarding-pass.png");
  }

  await browser.close();
  console.log("Puppeteer test finished successfully!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
