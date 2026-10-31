import { jsonError, session, unauthorized } from "@/server/cortex";
import { shares } from "@/server/shares";

/** Revokes a link: the page stops working at once and its copy of the answer is deleted. Owner only. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (!sess) return unauthorized();
  return shares.revoke(sess.authId, id) ? new Response(null, { status: 204 }) : jsonError("That link doesn't exist or isn't yours.", 404);
}
