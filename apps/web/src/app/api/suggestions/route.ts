import { starterQuestions } from "@cortex/agent";
import { deps, session, unauthorized } from "@/server/cortex";
import { briefFor } from "@/server/brief";

// shortcut: in-process cache, so each server keeps its own; fine until several servers share traffic.
const cache = new Map<string, { at: number; questions: string[] }>();
const TTL = 10 * 60 * 1000;

/** Starter questions written from the person's own brief; null tells the page to use its built-in list. */
export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  const { brief } = await briefFor(sess, undefined, false).catch(() => ({ brief: null }));
  if (!brief?.cards.length) return Response.json({ questions: null });
  const key = `${sess.userId}:${sess.workspace}:${brief.generatedAt}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json({ questions: hit.questions });
  try {
    const questions = await starterQuestions(brief.cards, deps(sess.workspace).llm, AbortSignal.timeout(6000));
    if (questions) cache.set(key, { at: Date.now(), questions });
    return Response.json({ questions });
  } catch {
    return Response.json({ questions: null });
  }
}
