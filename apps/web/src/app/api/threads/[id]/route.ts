import { deps, jsonError, memoryUser, session } from "@/server/cortex";

/** Forgets a deleted chat server-side, so "use my other chats" can never bring it back. Only the owner's rows are removed. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/threads/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  try {
    await deps(sess.workspace).memory.deleteThread(id, memoryUser(sess));
    return new Response(null, { status: 204 });
  } catch {
    return jsonError("The memory service isn't reachable right now.", 503);
  }
}
