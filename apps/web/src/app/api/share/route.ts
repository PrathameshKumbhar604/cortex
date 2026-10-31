import { db } from "@/server/db";
import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { snapshot } from "@/lib/share";
import { appOrigin, shares } from "@/server/shares";
import type { Turn } from "@/lib/use-agent";

/**
 * Makes (or returns) the public, read-only link for one answer. The snapshot is taken from the copy of the chat saved
 * on the server under this account, so only the owner can share it and only what they saw is shared.
 */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`share:${sess.authId}`, 30, 60 * 60_000)) return jsonError("That's a lot of links in a short time. Try again in a while.", 429);
  const body = (await req.json().catch(() => null)) as { chatId?: unknown; turnId?: unknown } | null;
  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  const turnId = typeof body?.turnId === "string" ? body.turnId : "";
  if (!/^[\w-]{1,100}$/.test(chatId) || !/^[\w-]{1,100}$/.test(turnId)) return jsonError("Couldn't find that answer.");
  const row = db.prepare("SELECT json FROM chats WHERE user_id = ? AND id = ?").get(sess.authId, chatId) as { json: string } | undefined;
  const turn = row ? (JSON.parse(row.json) as { turns: Turn[] }).turns.find((t) => t?.id === turnId) : undefined;
  if (!turn || typeof turn.answer !== "string" || !turn.answer.trim() || !turn.done) return jsonError("This answer isn't saved yet. Try again in a moment.", 409);
  const id = shares.create(sess.authId, chatId, turnId, snapshot({ question: String(turn.question ?? ""), answer: turn.answer, evidence: Array.isArray(turn.evidence) ? turn.evidence : [] }));
  return Response.json({ id, url: `${appOrigin(req.headers)}/s/${id}` });
}
