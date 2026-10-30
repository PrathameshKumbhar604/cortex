// Browser check for the admin panel: non-admins get 403 on every admin route; an admin can change roles, turn an
// account off (which ends its sessions and blocks sign-in) and back on; changes land in the activity log; the daily
// limit and allowed apps take effect. Needs the web app on :4000. Usage: node scripts/check-admin.mjs <screenshot dir>
import { chromium } from "playwright-core";
import { DatabaseSync } from "node:sqlite";
import { purgeTestUsers } from "./purge-test-users.mjs";
import { createAccount, signInWithPassword, testEmail } from "./test-account.mjs";

const base = "http://localhost:4000";
const out = process.argv[2] ?? ".cache";
await purgeTestUsers();
const db = new DatabaseSync(".data/cortex.sqlite");
db.exec("PRAGMA busy_timeout = 5000;"); // the web app writes to the same file
const settingsBefore = db.prepare("SELECT key, value FROM settings").all();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const api = (page, method, path, body) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
    },
    { method, path, body },
  );
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxA.addInitScript(() => localStorage.setItem("cortex.tour", "skipped"));
  const a = await ctxA.newPage();
  const emailA = testEmail("admin");
  await createAccount(a, base, emailA);
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(emailA); // stand-in for the owner

  const ctxB = await browser.newContext();
  await ctxB.addInitScript(() => localStorage.setItem("cortex.tour", "skipped"));
  const b = await ctxB.newPage();
  const emailB = testEmail("member");
  await createAccount(b, base, emailB);
  const idB = db.prepare("SELECT id FROM users WHERE email = ?").get(emailB).id;
  const idA = db.prepare("SELECT id FROM users WHERE email = ?").get(emailA).id;

  const forbidden = [
    await api(b, "GET", "/api/admin"),
    await api(b, "PATCH", `/api/admin/users/${idA}`, { disabled: true }),
    await api(b, "PUT", "/api/admin/settings", { dailyQuestionLimit: 1, allowedConnectors: null }),
  ].map((r) => r.status);
  console.log("member on admin routes:", forbidden.join(", "), "(expect 403s)");
  const notFound = (await b.goto(base + "/admin"))?.status();
  await b.getByRole("button", { name: "Account menu" }).first().click();
  console.log("member gets 404 on /admin and no Admin panel link:", notFound === 404, (await b.getByRole("link", { name: "Admin panel" }).count()) === 0);

  await a.reload();
  await a.getByRole("button", { name: "Account menu" }).first().click();
  await a.getByRole("link", { name: "Admin panel" }).first().click();
  await a.getByText(emailB).waitFor();
  console.log("admin sees the panel with the member listed: yes");
  console.log("admin can't change themself:", (await api(a, "PATCH", `/api/admin/users/${idA}`, { role: "member" })).status, "(expect 400)");
  console.log("make member an admin, then back:", (await api(a, "PATCH", `/api/admin/users/${idB}`, { role: "admin" })).status, (await api(a, "PATCH", `/api/admin/users/${idB}`, { role: "member" })).status);

  // Turn B off: B's session ends at once, and B can't sign in again
  await a.reload();
  await a.getByRole("button", { name: "Active" }).last().click();
  await a.getByText(`${emailB} is turned off`).waitFor();
  console.log("turned off → member's next request:", (await api(b, "GET", "/api/memory")).status, "(expect 401)");
  await b.context().clearCookies();
  await signInWithPassword(b, base, emailB);
  console.log("member signing in again sees:", await b.locator("p[role=alert]").innerText().catch(() => "(no message)"));
  await a.screenshot({ path: `${out}/admin.png`, fullPage: false });
  console.log("turn back on:", (await api(a, "PATCH", `/api/admin/users/${idB}`, { disabled: false })).status);
  await signInWithPassword(b, base, emailB);
  await b.waitForURL(base + "/");

  // Settings take effect: daily limit (checked before any model call) and allowed apps
  await api(a, "PUT", "/api/admin/settings", { dailyQuestionLimit: 1, allowedConnectors: ["gmail"] });
  db.prepare("INSERT OR REPLACE INTO usage (user_id, day, questions) VALUES (?, ?, 1)").run(idB, new Date().toISOString().slice(0, 10));
  const limited = await api(b, "POST", "/api/ask", { question: "what's due?", mode: "fast", history: [] });
  console.log("over the daily limit:", limited.status, "-", limited.body?.error);
  const apps = (await api(b, "GET", "/api/connections")).body.connectors.map((c) => c.id);
  console.log("allowed apps only:", JSON.stringify(apps), "(expect gmail + files)");

  const log = (await api(a, "GET", "/api/admin")).body.activity.map((e) => e.kind);
  console.log("activity log has:", ["admin.role", "admin.disable", "admin.enable", "admin.settings"].every((k) => log.includes(k)), JSON.stringify([...new Set(log)]));
} catch (err) {
  console.log("FAILED:", err.message.split("\n")[0]);
} finally {
  db.prepare("DELETE FROM settings").run();
  for (const r of settingsBefore) db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(r.key, r.value);
  db.prepare("DELETE FROM audit WHERE actor LIKE '%+clerk_test@example.com' OR target IN (SELECT id FROM users WHERE email LIKE '%+clerk_test@example.com')").run();
  db.prepare("DELETE FROM usage WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%+clerk_test@example.com')").run();
  await purgeTestUsers();
  await browser.close();
}
