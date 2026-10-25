import { deps, jsonError, session } from "@/server/cortex";

/** The only path that executes an action: an explicit approve for one proposal id. */
export async function POST(req: Request, ctx: RouteContext<"/api/actions/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; edits?: Record<string, unknown> };
  if (body.decision !== "approve" && body.decision !== "reject") return jsonError("decision must be approve or reject");
  const sess = await session();
  const d = deps(sess.workspace);
  try {
    const proposal = await d.actions.decide(sess.userId, id, body.decision, d.registry, body.edits);
    return Response.json({ proposal });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not complete the action.", 409);
  }
}
