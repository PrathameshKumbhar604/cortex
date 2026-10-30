import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");
const dataDir = path.join(root, ".data");
mkdirSync(dataDir, { recursive: true });

/**
 * One local SQLite file (Node's built-in driver) for what Cortex keeps itself: a copy of each account (Clerk holds
 * sign-in), the account → data link, file metadata, usage, the activity log, settings and saved briefs.
 */
export const db = new DatabaseSync(path.join(dataDir, "cortex.sqlite"));
// Readers never block the writer, and a write that meets a lock waits up to 5 s instead of failing.
db.exec(`
  PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS cortex_links (user_id TEXT PRIMARY KEY, data_id TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'member', disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, last_active TEXT, synced_at INTEGER NOT NULL DEFAULT 0
  );
`);
/** Kept for the modules that awaited the old auth setup; the tables above exist once this module loads. */
export const dbReady = Promise.resolve();

export interface LocalUser {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  role: "admin" | "member";
  disabled: boolean;
  syncedAt: number;
}

export function getLocalUser(id: string): LocalUser | null {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, string | number> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    verified: Number(r.verified) === 1,
    role: r.role === "admin" ? "admin" : "member",
    disabled: Number(r.disabled) === 1,
    syncedAt: Number(r.synced_at),
  };
}

/** Refreshes the local copy from Clerk (email, name, whether the email is proven); role and on/off are Cortex's own. */
export function upsertUser(u: { id: string; email: string; name: string; verified: boolean; createdAt: string }) {
  db.prepare(
    `INSERT INTO users (id, email, name, verified, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, verified = excluded.verified, synced_at = excluded.synced_at`,
  ).run(u.id, u.email, u.name, u.verified ? 1 : 0, u.createdAt, Date.now());
}

export function touchUser(id: string) {
  // At most once a minute, so every request doesn't write.
  db.prepare("UPDATE users SET last_active = ? WHERE id = ? AND (last_active IS NULL OR last_active < ?)").run(
    new Date().toISOString(),
    id,
    new Date(Date.now() - 60_000).toISOString(),
  );
}

/**
 * Connections, memories and chats are keyed by a data id. The first account to sign in on a browser inherits that
 * browser's earlier anonymous id, so nothing connected before sign-in is lost; an id is never given to two accounts.
 */
export function dataIdFor(userId: string, anonymousId?: string): string {
  const row = db.prepare("SELECT data_id FROM cortex_links WHERE user_id = ?").get(userId) as { data_id: string } | undefined;
  if (row) return row.data_id;
  const claimed = anonymousId ? db.prepare("SELECT 1 FROM cortex_links WHERE data_id = ?").get(anonymousId) : true;
  const dataId = anonymousId && !claimed ? anonymousId : userId;
  const link = db.prepare("INSERT OR IGNORE INTO cortex_links (user_id, data_id) VALUES (?, ?)");
  link.run(userId, dataId);
  const linked = db.prepare("SELECT data_id FROM cortex_links WHERE user_id = ?").get(userId) as { data_id: string } | undefined;
  if (linked) return linked.data_id; // ours, or a concurrent first request's
  link.run(userId, userId); // the anonymous id was claimed between the check and the insert
  return userId;
}

/**
 * The owner of this Cortex: CORTEX_OWNER_EMAILS (comma-separated), or else the first account with a proven email.
 * The owner is the first admin, and the only one who may use live apps on a personal Composio key.
 */
export function isOwner(email: string, verified: boolean): boolean {
  if (!verified) return false;
  const owners = (process.env.CORTEX_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (owners.length) return owners.includes(email.toLowerCase());
  const first = db.prepare("SELECT email FROM users WHERE verified = 1 ORDER BY created_at ASC LIMIT 1").get() as { email: string } | undefined;
  return first?.email.toLowerCase() === email.toLowerCase();
}

/**
 * With a personal Composio key (ck_), every connected app belongs to the key's owner, whoever signs in to Cortex,
 * so until a project key gives each user their own connections (decision D4) only the owner may use live data.
 */
export function mayUseLive(email: string, verified: boolean): boolean {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) return false;
  return !key.startsWith("ck_") || isOwner(email, verified);
}
