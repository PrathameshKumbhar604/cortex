import { jsonError, session, unauthorized, depsFor } from "@/server/cortex";

/** Starts one-click OAuth for a connector; the browser opens the returned URL. */
export async function POST(req: Request, ctx: RouteContext<"/api/connections/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (!sess) return unauthorized();
  if (sess.workspace !== "live") return jsonError("Switch to your own workspace to connect real accounts.", 409);
  const connector = (await depsFor(sess)).registry.get(id);
  if (!connector?.connect) return jsonError("This source doesn't need connecting.", 404);
  try {
    const origin = new URL(req.url).origin;
    const { redirectUrl } = await connector.connect({ userId: sess.userId, callbackUrl: `${origin}/connections?connected=${id}` });
    return Response.json({ redirectUrl });
  } catch (err) {
    return jsonError(`Couldn't start ${connector.name} sign-in: ${err instanceof Error ? err.message : "unknown error"}`, 502);
  }
}

/** Removes the signed-in user's own connection to one app. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/connections/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (!sess) return unauthorized();
  if (sess.workspace !== "live") return jsonError("The sample workspace has nothing to disconnect.", 409);
  const connector = (await depsFor(sess)).registry.get(id);
  if (!connector?.disconnect) return jsonError("This source can't be disconnected here.", 404);
  try {
    await connector.disconnect({ userId: sess.userId });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(`[connections] disconnect ${id} failed:`, err);
    return jsonError(`Couldn't disconnect ${connector.name} just now. Try again in a moment.`, 502);
  }
}
