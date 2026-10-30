import "server-only";
import { db, dbReady } from "./db";

/**
 * What the admin panel reads and the app writes: usage per account per day, an activity log (admin changes,
 * executed actions, errors) and global settings. All in the same local SQLite file as accounts.
 */
const ready = dbReady.then(() =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage (
      user_id TEXT NOT NULL, day TEXT NOT NULL,
      questions INTEGER NOT NULL DEFAULT 0, llm_calls INTEGER NOT NULL DEFAULT 0,
      searches INTEGER NOT NULL DEFAULT 0, actions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL,
      kind TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `),
);

const today = () => new Date().toISOString().slice(0, 10);

export async function recordUsage(userId: string, add: { questions?: number; llmCalls?: number; searches?: number; actions?: number }) {
  await ready;
  db.prepare(
    `INSERT INTO usage (user_id, day, questions, llm_calls, searches, actions) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET questions = questions + excluded.questions, llm_calls = llm_calls + excluded.llm_calls,
       searches = searches + excluded.searches, actions = actions + excluded.actions`,
  ).run(userId, today(), add.questions ?? 0, add.llmCalls ?? 0, add.searches ?? 0, add.actions ?? 0);
}

export async function questionsToday(userId: string): Promise<number> {
  await ready;
  return (db.prepare("SELECT questions FROM usage WHERE user_id = ? AND day = ?").get(userId, today()) as { questions: number } | undefined)?.questions ?? 0;
}

export type AuditKind = "admin.role" | "admin.disable" | "admin.enable" | "admin.settings" | "action.executed" | "action.failed" | "error";

export async function logEvent(actor: string, kind: AuditKind, target = "", detail = "") {
  await ready;
  db.prepare("INSERT INTO audit (at, actor, kind, target, detail) VALUES (?, ?, ?, ?, ?)").run(new Date().toISOString(), actor, kind, target, detail.slice(0, 500));
  // shortcut: keeps the newest 5,000 entries; export elsewhere if a longer history is ever needed.
  db.prepare("DELETE FROM audit WHERE id <= (SELECT MAX(id) - 5000 FROM audit)").run();
}

export interface Settings {
  /** Questions per account per day; null = no limit. */
  dailyQuestionLimit: number | null;
  /** Source ids people may use; null = all. */
  allowedConnectors: string[] | null;
}

export async function getSettings(): Promise<Settings> {
  await ready;
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const v = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { dailyQuestionLimit: v.dailyQuestionLimit ?? null, allowedConnectors: v.allowedConnectors ?? null };
}

export async function saveSettings(s: Settings) {
  await ready;
  const put = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  put.run("dailyQuestionLimit", JSON.stringify(s.dailyQuestionLimit));
  put.run("allowedConnectors", JSON.stringify(s.allowedConnectors));
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  disabled: boolean;
  verified: boolean;
  createdAt: string;
  lastActive: string | null;
  dataId: string | null;
  today: { questions: number };
  total: { questions: number; llmCalls: number; searches: number; actions: number };
  files: number;
}

export async function listUsers(): Promise<AdminUser[]> {
  await ready;
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.disabled AS banned, u.verified AS emailVerified, u.created_at AS createdAt,
         u.last_active AS lastActive, l.data_id AS dataId,
         (SELECT COALESCE(SUM(questions), 0) FROM usage WHERE user_id = u.id AND day = ?) AS qToday,
         (SELECT COALESCE(SUM(questions), 0) FROM usage WHERE user_id = u.id) AS q,
         (SELECT COALESCE(SUM(llm_calls), 0) FROM usage WHERE user_id = u.id) AS llm,
         (SELECT COALESCE(SUM(searches), 0) FROM usage WHERE user_id = u.id) AS searches,
         (SELECT COALESCE(SUM(actions), 0) FROM usage WHERE user_id = u.id) AS actions,
         (SELECT COUNT(*) FROM files f WHERE f.user_id = l.data_id) AS files
       FROM users u LEFT JOIN cortex_links l ON l.user_id = u.id
       ORDER BY u.created_at ASC`,
    )
    .all(today()) as Record<string, string | number | null>[];
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name ?? ""),
    role: r.role === "admin" ? "admin" : "member",
    disabled: Number(r.banned) === 1,
    verified: Number(r.emailVerified) === 1,
    createdAt: String(r.createdAt),
    lastActive: r.lastActive ? String(r.lastActive) : null,
    dataId: r.dataId ? String(r.dataId) : null,
    today: { questions: Number(r.qToday) },
    total: { questions: Number(r.q), llmCalls: Number(r.llm), searches: Number(r.searches), actions: Number(r.actions) },
    files: Number(r.files),
  }));
}

export async function recentActivity(limit = 60) {
  await ready;
  return db.prepare("SELECT at, actor, kind, target, detail FROM audit ORDER BY id DESC LIMIT ?").all(limit) as {
    at: string;
    actor: string;
    kind: AuditKind;
    target: string;
    detail: string;
  }[];
}
