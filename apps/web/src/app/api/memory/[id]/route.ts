import { deps, jsonError, memoryUser, session } from "@/server/cortex";

async function owns(id: string) {
  const sess = await session();
  const { memory } = deps(sess.workspace);
  const items = await memory.list(memoryUser(sess));
  return { memory, owned: items.some((m) => m.id === id) };
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/memory/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { content?: string; pinned?: boolean };
  try {
    const { memory, owned } = await owns(id);
    if (!owned) return jsonError("Memory not found.", 404);
    return Response.json({ item: await memory.update(id, { content: body.content?.trim() || undefined, pinned: body.pinned }) });
  } catch {
    return jsonError("The memory service isn't reachable right now.", 503);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/memory/[id]">) {
  const { id } = await ctx.params;
  try {
    const { memory, owned } = await owns(id);
    if (!owned) return jsonError("Memory not found.", 404);
    await memory.remove(id);
    return new Response(null, { status: 204 });
  } catch {
    return jsonError("The memory service isn't reachable right now.", 503);
  }
}
