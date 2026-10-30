import type { Workspace } from "@cortex/connectors";
import { defaultWorkspace, jsonError, llmProviders, session, setWorkspace, unauthorized, depsFor } from "@/server/cortex";

/** Everything the Connections page and the status chip need, in one call. */
export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  const d = await depsFor(sess);
  const [statuses, memory] = await Promise.all([
    d.registry.statuses({ userId: sess.userId }),
    d.memory.health().catch(() => ({ ok: false, backend: "offline" })),
  ]);
  return Response.json({
    workspace: sess.workspace,
    liveAvailable: sess.liveAllowed,
    admin: sess.admin, // the sidebar shows the admin panel from this, not from a browser-side hint
    defaultWorkspace: defaultWorkspace(),
    connectors: statuses,
    memory,
    llm: llmProviders().map((p) => ({ id: p.id, label: p.label })),
  });
}

export async function PUT(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { workspace?: Workspace };
  if (body.workspace !== "demo" && body.workspace !== "live") return jsonError("workspace must be demo or live");
  if (body.workspace === "live" && !sess.liveAllowed) {
    return jsonError("Connecting your own apps isn't available on this Cortex yet. You can keep using the sample workspace.", 403);
  }
  await setWorkspace(body.workspace);
  return Response.json({ workspace: body.workspace });
}
