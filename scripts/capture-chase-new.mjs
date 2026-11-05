import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function capture() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,800"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto("http://localhost:8080/", { waitUntil: "domcontentloaded", timeout: 20000 });
  const btn = await page.waitForSelector("button ::-p-text(Acompanhar Percurso 3D)", { timeout: 10000 });
  await btn.click();

  // Wait 3 seconds for 3D canvas rendering and shaders to stabilize
  await new Promise((r) => setTimeout(r, 3000));

  await page.screenshot({ path: "chase-viewer-new.png" });
  console.log("Saved screenshot to chase-viewer-new.png");

  await browser.close();
}

capture().catch(console.error);
