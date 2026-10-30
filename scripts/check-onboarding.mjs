// Browser check for onboarding: the tour is offered once, steps through, is remembered and replays; the Brief API
// answers at once and builds in the background. Needs the web app on :4000. Usage: node scripts/check-onboarding.mjs <dir>
import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { purgeTestUsers } from "./purge-test-users.mjs";
import { createAccount, testEmail } from "./test-account.mjs";
const base = "http://localhost:4000";
const out = process.argv[2];
await purgeTestUsers(); // a run that stopped halfway must not leave a test account behind
const db = new DatabaseSync(".data/cortex.sqlite");
db.exec("PRAGMA busy_timeout = 5000;"); // the web app writes to the same file
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const email = testEmail("onboard");
await createAccount(page, base, email, "/");

// Tour: offered once on Ask
const offer = page.getByRole("dialog", { name: "Take the tour" });
await offer.waitFor({ timeout: 5000 });
console.log("tour offered on first visit: yes");
await page.getByRole("button", { name: "Show me" }).click();
const titles = [];
for (let i = 0; i < 5; i++) {
  titles.push(await page.locator("#tour-title").innerText());
  if (i === 1) await page.screenshot({ path: `${out}/tour-step2.png` });
  if (i < 4) { await page.getByRole("button", { name: "Next", exact: true }).click(); await page.waitForTimeout(350); }
}
console.log("steps:", titles.join(" | "));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log("closed with Escape:", !(await page.locator("#tour-title").isVisible().catch(() => false)), "| remembered:", await page.evaluate(() => localStorage.getItem("cortex.tour")));
await page.reload(); await page.waitForTimeout(2000);
console.log("offered again after reload:", await offer.isVisible().catch(() => false));
await page.getByRole("button", { name: "Take the tour" }).click();
await page.locator("#tour-title").waitFor();
console.log("replay from sidebar: yes");
await page.keyboard.press("Escape");

// Brief: instant answer, background build
const t0 = Date.now();
const first = await page.evaluate(async () => { const r = await fetch("/api/brief"); return { status: r.status, body: await r.json() }; });
console.log(`brief API answered in ${Date.now() - t0} ms:`, first.status, "generating:", first.body.generating, "brief:", first.body.brief ? "yes" : "none yet");
await page.goto(base + "/brief");
await page.locator("h1").filter({ hasNotText: "Putting your brief together" }).waitFor({ timeout: 60000 });
await page.waitForFunction(() => !document.body.innerText.includes("Putting your brief together"), null, { timeout: 60000 });
console.log("brief intro shown:", await page.getByText("Your Brief, in one glance").isVisible(), "| headline:", await page.locator("h1").innerText(), "| covers:", await page.getByText("Covers").isVisible());
await page.screenshot({ path: `${out}/brief-new-user.png` });
console.log("errors:", errors);
await purgeTestUsers();
await browser.close();
