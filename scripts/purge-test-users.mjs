// Removes the accounts the browser checks create (…+clerk_test@example.com): from Clerk, and from Cortex's own tables
// with their links, files, briefs and usage. The checks call it first, so a run that stopped halfway never leaves a
// test account behind as "the first user".
import { rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: Clerk accounts can't be removed, local rows still are
}

async function removeFromClerk() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return 0;
  const headers = { authorization: `Bearer ${key}` };
  const res = await fetch("https://api.clerk.com/v1/users?limit=100&query=%2Bclerk_test%40example.com", { headers });
  if (!res.ok) return 0;
  const users = (await res.json()).filter((u) => u.email_addresses?.some((e) => e.email_address.endsWith("+clerk_test@example.com")));
  for (const u of users) await fetch(`https://api.clerk.com/v1/users/${u.id}`, { method: "DELETE", headers });
  return users.length;
}

export async function purgeTestUsers(file = ".data/cortex.sqlite") {
  const remote = await removeFromClerk();
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000;");
  const has = (t) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const users = has("users") ? db.prepare("SELECT id FROM users WHERE email LIKE '%+clerk_test@example.com'").all() : [];
  for (const { id } of users) {
    const link = db.prepare("SELECT data_id FROM cortex_links WHERE user_id = ?").get(id);
    if (link) {
      if (has("files")) db.prepare("DELETE FROM files WHERE user_id = ?").run(link.data_id);
      rmSync(path.join(".data", "uploads", link.data_id.replace(/[^\w-]/g, "_")), { recursive: true, force: true });
      if (has("briefs")) db.prepare("DELETE FROM briefs WHERE key LIKE ?").run(`${link.data_id}:%`);
      db.prepare("DELETE FROM cortex_links WHERE user_id = ?").run(id);
    }
    if (has("usage")) db.prepare("DELETE FROM usage WHERE user_id = ?").run(id);
    if (has("audit")) db.prepare("DELETE FROM audit WHERE actor LIKE '%+clerk_test@example.com' OR target = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
  db.close();
  return { clerk: remote, local: users.length };
}

if (process.argv[1]?.endsWith("purge-test-users.mjs")) console.log("removed test users:", await purgeTestUsers());
