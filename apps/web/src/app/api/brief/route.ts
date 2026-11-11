import { briefFor } from "@/server/brief";
import { session, unauthorized, withinLimit } from "@/server/cortex";

/** Answers at once with the saved brief; builds a fresh one in the background when it is stale (?refresh=1 forces it). */
export async function GET(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const url = new URL(req.url);
  const sources = url.searchParams.get("sources")?.split(",").filter(Boolean);
  // A forced rebuild costs a model call and a search of every source: a few per ten minutes, else the saved brief.
  const refresh = url.searchParams.get("refresh") === "1" && withinLimit(`brief:${sess.userId}`, 3, 10 * 60_000);
  return Response.json(await briefFor(sess, sources?.length ? sources.slice(0, 20) : undefined, refresh));
}
