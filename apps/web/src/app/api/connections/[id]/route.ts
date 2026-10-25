import { deps, jsonError, session } from "@/server/cortex";

/** Starts one-click OAuth for a connector; the browser opens the returned URL. */
export async function POST(req: Request, ctx: RouteContext<"/api/connections/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (sess.workspace !== "live") return jsonError("Switch to your own workspace to connect real accounts.", 409);
  const connector = deps(sess.workspace).registry.get(id);
  if (!connector?.connect) return jsonError("This source doesn't need connecting.", 404);
  try {
    const origin = new URL(req.url).origin;
    const { redirectUrl } = await connector.connect({ userId: sess.userId, callbackUrl: `${origin}/connections?connected=${id}` });
    return Response.json({ redirectUrl });
  } catch (err) {
    return jsonError(`Couldn't start ${connector.name} sign-in: ${err instanceof Error ? err.message : "unknown error"}`, 502);
  }
}
