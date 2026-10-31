import { db } from "@/server/db";
import { jsonError, session, unauthorized } from "@/server/cortex";
import { shares } from "@/server/shares";

// Chats per account, so they follow the person to another browser. The browser keeps a copy (localStorage) and syncs.
db.exec(`CREATE TABLE IF NOT EXISTS chats (
  user_id TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id)
)`);
const MAX_BYTES = 1_000_000; // one chat, as JSON
const KEEP = 200; // newest chats kept per account

export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  const rows = db.prepare("SELECT json FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").all(sess.authId) as { json: string }[];
  return Response.json({ chats: rows.map((r) => JSON.parse(r.json)) });
}

/** Saves one chat (last write wins). */
export async function PUT(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const text = await req.text();
  if (text.length > MAX_BYTES) return jsonError("That chat is too long to save.", 413);
  let chat: { id?: unknown; title?: unknown; updatedAt?: unknown; turns?: unknown };
  try {
    chat = JSON.parse(text);
  } catch {
    return jsonError("Couldn't read that chat.");
  }
  if (typeof chat.id !== "string" || !/^[\w-]{1,100}$/.test(chat.id) || typeof chat.title !== "string" || !Array.isArray(chat.turns) || typeof chat.updatedAt !== "number") {
    return jsonError("Couldn't read that chat.");
  }
  db.prepare("INSERT OR REPLACE INTO chats (user_id, id, json, updated_at) VALUES (?, ?, ?, ?)").run(sess.authId, chat.id, text, chat.updatedAt);
  db.prepare("DELETE FROM chats WHERE user_id = ? AND id NOT IN (SELECT id FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?)").run(sess.authId, sess.authId, KEEP);
  return new Response(null, { status: 204 });
}

export async function DELETE(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  db.prepare("DELETE FROM chats WHERE user_id = ? AND id = ?").run(sess.authId, id);
  shares.revokeChat(sess.authId, id); // a deleted chat takes its public links with it
  return new Response(null, { status: 204 });
}
