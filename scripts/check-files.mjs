// Browser check for uploads: limits, safety headers, isolation between accounts, files as a cited source.
// Needs the web app on :4000 and makes one live fast-mode model call. Usage: node scripts/check-files.mjs <screenshot dir>
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
const made = [];

async function signIn(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createAccount(page, base, email, "/files");
  made.push(email);
  return page;
}
const up = (page, name, type, data) =>
  page.evaluate(async ({ name, type, data }) => {
    const f = new FormData();
    f.set("file", new File([typeof data === "number" ? new Uint8Array(data) : new Uint8Array(data)], name, { type }));
    const r = await fetch("/api/files", { method: "POST", body: f });
    return { status: r.status, body: await r.json() };
  }, { name, type, data });

const a = await signIn(testEmail("files-a"));
// A real PDF, printed by Chrome
const pdfPage = await browser.newPage();
await pdfPage.setContent("<h1>Orbit beta plan</h1><p>The beta demo happens on November 14 in Room 204. Bring the Android test phones.</p>");
const pdf = [...(await pdfPage.pdf())];
const r1 = await up(a, "orbit-plan.pdf", "application/pdf", pdf);
const r2 = await up(a, "notes.md", "text/markdown", [...Buffer.from("# Standup\nRahul owns the login fix.")]);
const r3 = await up(a, "evil.html", "text/html", [...Buffer.from("<script>alert(1)</script>")]);
const big = await up(a, "big.bin", "application/octet-stream", 11 * 1024 * 1024);
console.log("pdf:", r1.status, "size", r1.body.file?.size, "of", pdf.length, "searchable", r1.body.file?.searchable, "| md:", r2.status, r2.body.file?.searchable, "| html:", r3.status, "| 11 MB:", big.status, big.body.error);
const pdfId = r1.body.file.id;
const heads = await a.evaluate(async (ids) => {
  const p = await fetch(`/api/files/${ids[0]}`); const h = await fetch(`/api/files/${ids[1]}`);
  return [p.headers.get("content-type"), p.headers.get("content-disposition")?.split(";")[0], h.headers.get("content-type"), h.headers.get("content-disposition")?.split(";")[0], h.headers.get("x-content-type-options")];
}, [pdfId, r3.body.file.id]);
console.log("pdf served as:", heads[0], heads[1], "| html served as:", heads[2], heads[3], heads[4]);
const conn = await a.evaluate(async () => (await (await fetch("/api/connections")).json()).connectors.find((c) => c.id === "files"));
console.log("files source on Connections:", conn?.name, "connected:", conn?.connected);
await a.goto(base + "/files"); await a.waitForTimeout(800);
await a.screenshot({ path: `${out}/files.png` });

// Another account can't see or delete A's file
const b = await signIn(testEmail("files-b"));
const iso = await b.evaluate(async (id) => [(await fetch(`/api/files/${id}`)).status, (await fetch(`/api/files/${id}`, { method: "DELETE" })).status, (await (await fetch("/api/files")).json()).files.length], pdfId);
console.log("account B on A's file: GET", iso[0], "DELETE", iso[1], "| B's list:", iso[2]);

// One live question with the PDF attached
const ask = await a.evaluate(async (id) => {
  const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "Which room is the beta demo in?", mode: "fast", attachments: [id], history: [] }) });
  const text = await r.text();
  const ev = text.split("\n\n").map((f) => f.replace(/^data: /, "")).filter(Boolean).map((f) => JSON.parse(f));
  return { route: ev.find((e) => e.type === "route")?.decision, evidence: ev.find((e) => e.type === "evidence")?.items?.map((e) => e.source + ":" + e.title), answer: ev.find((e) => e.type === "answer")?.markdown, error: ev.find((e) => e.type === "error")?.message };
}, pdfId);
console.log("ask route:", ask.route?.route, ask.route?.sources, "| evidence:", ask.evidence, "\nanswer:", ask.answer, ask.error ?? "");

// Composer chip
await a.goto(base + "/", { waitUntil: "networkidle" });
await a.getByRole("button", { name: /Attach files/ }).waitFor(); // hydrated: the picker's handler is attached
await a.locator('input[type="file"]').setInputFiles({ name: "agenda.txt", mimeType: "text/plain", buffer: Buffer.from("Agenda: launch review") });
await a.getByText("agenda.txt").waitFor();
await a.waitForTimeout(800);
await a.locator("form").screenshot({ path: `${out}/composer-chip.png` });

// Clean up everything this test made
for (const p of [a, b]) await p.evaluate(async () => { for (const f of (await (await fetch("/api/files")).json()).files) await fetch(`/api/files/${f.id}`, { method: "DELETE" }); });
await purgeTestUsers();
await browser.close();
