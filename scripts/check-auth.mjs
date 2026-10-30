// Browser check for sign-in (Clerk, our own page): every API route is 401 without a session; create account with an
// emailed code; wrong password / existing account messages; password reset by code; sign-out; the first account inherits
// the browser's anonymous data id; a second account never gets the owner's live apps.
// Needs the web app on :4000 with Clerk development keys in .env. Usage: node scripts/check-auth.mjs <screenshot dir>
import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { purgeTestUsers } from "./purge-test-users.mjs";
import { createAccount, signInWithPassword, TEST_CODE, TEST_PASSWORD, testEmail } from "./test-account.mjs";

const base = "http://localhost:4000";
const out = process.argv[2] ?? ".cache";
await purgeTestUsers(); // a run that stopped halfway must not leave a test account behind
const db = new DatabaseSync(".data/cortex.sqlite");
db.exec("PRAGMA busy_timeout = 5000;"); // the web app writes to the same file

for (const [m, p] of [["POST", "/api/ask"], ["POST", "/api/actions/x"], ["GET", "/api/brief"], ["GET", "/api/connections"], ["POST", "/api/connections/gmail"], ["GET", "/api/memory"], ["POST", "/api/memory"], ["PATCH", "/api/memory/x"], ["DELETE", "/api/memory/x"], ["DELETE", "/api/threads/x"], ["POST", "/api/title"], ["GET", "/api/files"], ["GET", "/api/admin"], ["GET", "/api/chats"], ["PUT", "/api/chats"]]) {
  const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json" }, body: m === "GET" ? undefined : "{}", redirect: "manual" });
  if (r.status !== 401) console.log("NOT 401:", m, p, r.status);
}
console.log("api routes without a session: checked");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/memory");
  console.log("redirected to:", new URL(page.url()).pathname + new URL(page.url()).search);
  const anon = (await ctx.cookies()).find((c) => c.name === "cortex_uid")?.value;

  const email = testEmail("first");
  await createAccount(page, base, email, "/memory");
  await page.waitForLoadState("networkidle");
  console.log("created account (code by email), landed on:", new URL(page.url()).pathname, "| in sidebar:", await page.getByText(email).first().isVisible().catch(() => false));
  const id = db.prepare("SELECT id FROM users WHERE email = ?").get(email)?.id;
  console.log("data id = earlier anonymous id:", db.prepare("SELECT data_id FROM cortex_links WHERE user_id = ?").get(id)?.data_id === anon);
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("**/sign-in**");
  console.log("after sign out /api/memory:", await page.evaluate(async () => (await fetch("/api/memory")).status));

  await page.fill("#email", email);
  await page.fill("#password", "Not-the-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  console.log("wrong password says:", await page.locator("p[role=alert]").innerText());
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.fill("#password", TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  console.log("existing account says:", await page.locator("p[role=alert]").innerText());

  // Forgot password → code → new password → signed in
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.locator("#code").waitFor();
  await page.fill("#code", TEST_CODE);
  await page.fill("#password", "A-Brand-New-Password-42");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
  console.log("reset password by code, then signed in: yes");

  // A second account (also with a proven email) is never the owner
  const p2 = await (await browser.newContext()).newPage();
  await createAccount(p2, base, testEmail("second"), "/connections");
  const second = await p2.evaluate(async () => {
    const c = await (await fetch("/api/connections")).json();
    const put = await fetch("/api/connections", { method: "PUT", headers: { "content-type": "application/json" }, body: '{"workspace":"live"}' });
    return { workspace: c.workspace, liveAvailable: c.liveAvailable, putLive: put.status };
  });
  console.log("second account:", JSON.stringify(second), "(expect demo, false, 403 unless CORTEX_OWNER_EMAILS names it)");

  // Signing in from a new browser (Clerk may ask for an emailed code first)
  const p3 = await (await browser.newContext()).newPage();
  await signInWithPassword(p3, base, email, "A-Brand-New-Password-42");
  await p3.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
  console.log("signed in from a new browser: yes");
} catch (err) {
  console.log("FAILED:", err.message.split("\n")[0]);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: `${out}/failed-${Math.random().toString(36).slice(2, 6)}.png` }).catch(() => {});
} finally {
  console.log("errors:", errors);
  await purgeTestUsers();
  await browser.close();
}
