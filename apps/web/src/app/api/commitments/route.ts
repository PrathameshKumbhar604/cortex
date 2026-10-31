import { runRadar } from "@cortex/agent";
import { LlmUnavailableError } from "@cortex/llm";
import { depsFor, jsonError, session, unauthorized, withinLimit } from "@/server/cortex";

export const maxDuration = 60;

/** Experimental: the Commitments radar. One model call, cached for 20 minutes per source set. */
export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`radar:${sess.authId}`, 6)) return jsonError("Too many refreshes. Try again in a minute.", 429);
  const me = sess.workspace === "demo" ? "the author shown as You" : [sess.name, sess.email].filter(Boolean).join(", ") || undefined;
  try {
    return Response.json(await runRadar(await depsFor(sess), sess.userId, me));
  } catch (err) {
    console.warn("[radar] failed:", err instanceof Error ? err.message : err);
    return jsonError(err instanceof LlmUnavailableError ? "Every free model is busy right now. Try again in a minute." : "Couldn't check your commitments.", 503);
  }
}
