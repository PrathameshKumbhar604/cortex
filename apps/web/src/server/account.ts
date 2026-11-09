import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { logEvent } from "./admin";
import { deps } from "./cortex";
import { db } from "./db";
import { deleteFile } from "./files";

/**
 * Deletes an account and everything Cortex keeps for it: chats and their search index, shared links, uploaded files,
 * memories and past-chat threads (both workspaces), connected apps, usage, briefs, then the sign-in itself (Clerk).
 * Data goes first and any failure stops before the sign-in is removed, so nothing is left behind an account that
 * no longer exists; running it again finishes the job.
 */
export async function deleteAccount(authId: string, email: string) {
  const dataId = (db.prepare("SELECT data_id FROM cortex_links WHERE user_id = ?").get(authId) as { data_id: string } | undefined)?.data_id ?? authId;
  const owners = [authId, dataId];

  // Memories and conversation threads live in the memory service, per workspace.
  const chats = db.prepare("SELECT json FROM chats WHERE user_id = ?").all(authId) as { json: string }[];
  const threads = chats.map((c) => (JSON.parse(c.json) as { serverThreadId?: string }).serverThreadId).filter((t): t is string => !!t);
  const { memory } = deps("live");
  for (const memUser of [dataId, `${dataId}:demo`]) {
    for (const m of await memory.list(memUser)) await memory.remove(m.id);
    for (const t of threads) await memory.deleteThread(t, memUser).catch(() => {}); // a thread may live in the other workspace
  }

  // Connected apps: Cortex's own connections for this user (Composio), so no token outlives the account.
  for (const c of deps("live").registry.list()) if (c.disconnect) await c.disconnect({ userId: dataId });

  // Uploaded files: rows and bytes.
  const files = db.prepare("SELECT id FROM files WHERE user_id = ?").all(dataId) as { id: string }[];
  for (const f of files) await deleteFile(dataId, f.id);

  for (const sql of ["DELETE FROM chats WHERE user_id = ?", "DELETE FROM chat_vectors WHERE user_id = ?", "DELETE FROM shares WHERE user_id = ?", "DELETE FROM usage WHERE user_id = ?"]) {
    for (const id of owners) tryRun(sql, id);
  }
  tryRun("DELETE FROM briefs WHERE key LIKE ?", `v2:${dataId}:%`);
  db.prepare("DELETE FROM cortex_links WHERE user_id = ?").run(authId);
  db.prepare("DELETE FROM users WHERE id = ?").run(authId);

  await (await clerkClient()).users.deleteUser(authId);
  await logEvent(email, "account.delete", authId);
}

/** A table that was never created (nobody used that feature yet) has nothing to delete. */
function tryRun(sql: string, arg: string) {
  try {
    db.prepare(sql).run(arg);
  } catch (err) {
    if (!/no such table/i.test(String(err))) throw err;
  }
}
