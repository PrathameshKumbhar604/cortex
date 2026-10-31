import "server-only";
import { runBrief, type AgentDeps, type Brief } from "@cortex/agent";
import { LlmUnavailableError } from "@cortex/llm";
import { db, dbReady } from "./db";
import { depsFor, memoryUser, type Session } from "./cortex";
import { briefKey } from "@/lib/workspace";

const FRESH_MS = 3 * 60 * 60 * 1000; // a brief older than this is rebuilt in the background

export interface BriefState {
  brief: Brief | null;
  /** A build is running now; the client checks back. */
  generating: boolean;
  error?: string;
}

const ready = dbReady.then(() => {
  db.exec("CREATE TABLE IF NOT EXISTS briefs (key TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)");
  db.exec("DELETE FROM briefs WHERE key NOT LIKE 'v2:%'"); // built before briefs were tied to the user's own connections
});
// shortcut: in-process, so one build per user per server; with several servers, two may build the same brief once.
const running = new Map<string, Promise<void>>();
const failed = new Map<string, string>();

/**
 * Stale-while-revalidate: always answers at once with the saved brief (if any) and, when it is missing, stale or a
 * refresh was asked for, starts one background build. The build costs one model call and the source searches.
 */
export async function briefFor(sess: Session, sources: string[] | undefined, refresh: boolean): Promise<BriefState> {
  await ready;
  const d = await depsFor(sess);
  const connected = (await d.registry.connected({ userId: sess.userId })).map((c) => c.id).filter((id) => id !== "web");
  // A pick saved in the other workspace may name nothing connected here: then the brief covers every connected source.
  const picked = connected.filter((id) => sources?.includes(id));
  const only = picked.length ? picked : connected;
  if (only.length === 0) {
    const empty: Brief = { headline: "Connect an app to get your brief.", cards: [], failures: [], generatedAt: new Date().toISOString(), sources: 0 };
    return { brief: empty, generating: false };
  }
  const key = briefKey(sess.userId, sess.workspace, only);
  const row = db.prepare("SELECT json, at FROM briefs WHERE key = ?").get(key) as { json: string; at: number } | undefined;
  const stale = !row || Date.now() - row.at > FRESH_MS || refresh;
  if (stale && !running.has(key)) {
    failed.delete(key);
    const build = build_(sess, d, only)
      .then((brief) => void db.prepare("INSERT OR REPLACE INTO briefs (key, json, at) VALUES (?, ?, ?)").run(key, JSON.stringify(brief), Date.now()))
      .catch((err) => void failed.set(key, err instanceof LlmUnavailableError ? "Every free model is busy right now. Try again in a minute." : "Couldn't build the brief."))
      .finally(() => running.delete(key));
    running.set(key, build);
  }
  return { brief: row ? (JSON.parse(row.json) as Brief) : null, generating: running.has(key), error: failed.get(key) };
}

/** Built from exactly the sources in its key (runBrief re-checks they're still connected), as this user, in this workspace. */
function build_(sess: Session, d: AgentDeps, only: string[]) {
  return runBrief({ ...d, memory: { ...d.memory, recall: (_u, q, l) => d.memory.recall(memoryUser(sess), q, l) } }, sess.userId, only);
}
