import { chatTitle } from "@cortex/agent";
import { deps, jsonError, session, unauthorized, withinLimit } from "@/server/cortex";

/** Names a new chat from its first message, with the fast model. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
  if (!question) return jsonError("question is required");
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`title:${sess.authId}`, 20)) return Response.json({ title: null }); // each title is a model call
  try {
    return Response.json({ title: await chatTitle(question, deps(sess.workspace).llm, AbortSignal.timeout(8000)) });
  } catch {
    return Response.json({ title: null }); // the first message stays the title
  }
}
