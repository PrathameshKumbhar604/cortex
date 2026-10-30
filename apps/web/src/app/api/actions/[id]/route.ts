import { logEvent, recordUsage } from "@/server/admin";
import { jsonError, session, unauthorized, withinLimit, depsFor } from "@/server/cortex";

/** The only path that executes an action: an explicit approve for one proposal id. */
export async function POST(req: Request, ctx: RouteContext<"/api/actions/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; edits?: Record<string, unknown> };
  if (body.decision !== "approve" && body.decision !== "reject") return jsonError("decision must be approve or reject");
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`act:${sess.userId}`, 15)) return jsonError("Too many actions in a minute. Wait a few seconds and try again.", 429);
  const d = await depsFor(sess);
  try {
    const proposal = await d.actions.decide(sess.userId, id, body.decision, d.registry, body.edits);
    // Every action that touched a real app goes in the activity log, done or failed.
    if (proposal.status === "executed") {
      void recordUsage(sess.authId, { actions: 1 });
      void logEvent(sess.email, "action.executed", `${proposal.connectorId}.${proposal.actionId}`, proposal.title);
    } else if (proposal.status === "failed") void logEvent(sess.email, "action.failed", `${proposal.connectorId}.${proposal.actionId}`, proposal.result ?? proposal.title);
    return Response.json({ proposal });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not complete the action.", 409);
  }
}
