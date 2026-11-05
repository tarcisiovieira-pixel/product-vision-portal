import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function capture() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log("Navigating to /app/hangar-3d...");
  await page.goto("http://localhost:8080/app/hangar-3d", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  await page.waitForSelector("::-p-text(APX-01)", { timeout: 10000 });
  console.log("Selecting APX-01...");
  const btnApex = await page.waitForSelector("button ::-p-text(APX-01)", { timeout: 8000 });
  await btnApex.click();

  // Wait 2.5s for 3D render
  await new Promise((r) => setTimeout(r, 2500));

  await page.screenshot({ path: "hangar-apex.png" });
  console.log("Saved screenshot to hangar-apex.png");

  // Also select Valkyrie
  const btnValk = await page.waitForSelector("button ::-p-text(VMT-GT)", { timeout: 8000 });
  await btnValk.click();
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: "hangar-valkyrie.png" });
  console.log("Saved screenshot to hangar-valkyrie.png");

  await browser.close();
}

capture().catch(console.error);
