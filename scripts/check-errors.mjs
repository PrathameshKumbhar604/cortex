// Browser check for calm errors: simulated failures (app sign-in expired, AI models busy, network down, memory
// offline) each show a plain message and something to do, with technical detail only behind "Details".
// Needs the web app on :4000. Usage: node scripts/check-errors.mjs <screenshot dir>
import { chromium } from "playwright-core";
import { purgeTestUsers } from "./purge-test-users.mjs";
import { createAccount, testEmail } from "./test-account.mjs";

const base = "http://localhost:4000";
const out = process.argv[2] ?? ".cache";
const sse = (evts) => evts.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
await purgeTestUsers();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("cortex.tour", "skipped"));
  const page = await ctx.newPage();
  await createAccount(page, base, testEmail("errors"));
  let asks = 0;
  await page.route("**/api/ask", (r) => {
    asks++;
    return r.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: sse([
        { type: "run", runId: "r", mode: "fast", threadId: "t" },
        { type: "source_error", failure: { source: "gmail", name: "Gmail", reason: "its sign-in expired; reconnect it on the Connections page", impact: "" } },
        { type: "source_error", failure: { source: "llm", name: "Language model", reason: "LlmUnavailableError: groq 429, gemini 503", impact: "" } },
        { type: "error", message: "Every free model is busy or unavailable right now. Try again in a minute, or switch on Fast Mode." },
        { type: "done" },
      ]),
    });
  });
  await page.route("**/api/title", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"title":null}' }));
  await page.fill("#ask", "what's due this week?");
  await page.keyboard.press("Enter");
  await page.getByText("The free AI models are busy").waitFor();
  const shown = await page.locator("[data-turn]").last().innerText();
  console.log("expired app note:", shown.includes("Gmail needs you to sign in again"), "| reconnect link:", await page.getByRole("link", { name: "Reconnect Gmail" }).count());
  console.log("raw codes hidden until Details:", !/LlmUnavailable|429|503/.test(shown.replace(/Details[\s\S]*/, "")));
  await page.screenshot({ path: `${out}/errors-turn.png` });
  await page.getByRole("button", { name: "Try again" }).first().click();
  await page.waitForTimeout(800);
  console.log("Try again asked again:", asks === 2);

  // Network down: a toast, and a calm card on the turn that couldn't be sent
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByText("You're offline").first().waitFor();
  console.log("offline notices on screen:", await page.locator("[aria-live=polite] p", { hasText: /^You're offline$/ }).count());
  console.log("offline toast: yes");
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("Back online").first().waitFor();
  console.log("back-online notices on screen:", await page.locator("[aria-live=polite] p", { hasText: /^Back online$/ }).count());
  console.log("back-online toast: yes");

  // Memory offline
  await page.route("**/api/memory", (r) => r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"The memory service isn\'t reachable right now."}' }));
  await page.goto(base + "/memory");
  await page.getByText("Memory is out of reach right now").waitFor();
  console.log("memory offline card:", await page.getByText("Your memories are safe").isVisible(), "| retry:", await page.getByRole("button", { name: "Try again" }).count());
  await page.screenshot({ path: `${out}/errors-memory.png` });
} catch (err) {
  console.log("FAILED:", err.message.split("\n")[0]);
} finally {
  await purgeTestUsers();
  await browser.close();
}
