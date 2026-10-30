import { briefFor } from "@/server/brief";
import { session, unauthorized } from "@/server/cortex";

/** Answers at once with the saved brief; builds a fresh one in the background when it is stale (?refresh=1 forces it). */
export async function GET(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const url = new URL(req.url);
  const sources = url.searchParams.get("sources")?.split(",").filter(Boolean);
  return Response.json(await briefFor(sess, sources?.length ? sources : undefined, url.searchParams.get("refresh") === "1"));
}
