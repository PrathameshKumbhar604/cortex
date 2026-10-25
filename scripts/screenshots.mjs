// Captures the app's main surfaces at desktop and mobile widths using the system Chrome.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "apps/web/.impeccable/review";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });

// Pages scroll inside an inner container; unroll it so full-page captures include everything.
const UNROLL = "html,body,body>div,main,main>div,.overflow-y-auto{height:auto!important;min-height:0!important;overflow:visible!important}";

async function shoot(width, height, suffix) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/empty${suffix}.png` });

  await page.fill("#ask", "What changed in Orbit this week, and what's at risk?");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=/Verified \\d+\\/\\d+/", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/ask${suffix}.png`, fullPage: false });

  await page.fill("#ask", "Draft a Slack update about the new Demo Day date");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=/Approve/", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator("text=/Approve/").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/action${suffix}.png`, fullPage: false });
  await page.click("text=Trace").catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/trace${suffix}.png`, fullPage: false });

  for (const p of ["brief", "memory", "connections"]) {
    await page.goto(`${base}/${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(p === "brief" ? 2500 : 600);
    await page.addStyleTag({ content: UNROLL });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${p}${suffix}.png`, fullPage: true });
  }
  await ctx.close();
}

await shoot(1440, 900, "");
await shoot(390, 844, "-mobile");
await browser.close();
console.log(`saved to ${out}`);
