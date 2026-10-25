import type { Workspace } from "@cortex/connectors";
import { defaultWorkspace, deps, jsonError, llmProviders, session, setWorkspace } from "@/server/cortex";

/** Everything the Connections page and the status chip need, in one call. */
export async function GET() {
  const sess = await session();
  const d = deps(sess.workspace);
  const [statuses, memory] = await Promise.all([
    d.registry.statuses({ userId: sess.userId }),
    d.memory.health().catch(() => ({ ok: false, backend: "offline" })),
  ]);
  return Response.json({
    workspace: sess.workspace,
    liveAvailable: Boolean(process.env.COMPOSIO_API_KEY),
    defaultWorkspace: defaultWorkspace(),
    connectors: statuses,
    memory,
    llm: llmProviders().map((p) => ({ id: p.id, label: p.label })),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspace?: Workspace };
  if (body.workspace !== "demo" && body.workspace !== "live") return jsonError("workspace must be demo or live");
  if (body.workspace === "live" && !process.env.COMPOSIO_API_KEY) {
    return jsonError("Live connections need COMPOSIO_API_KEY in .env. See docs/08-SETUP-KEYS.md.", 409);
  }
  await setWorkspace(body.workspace);
  return Response.json({ workspace: body.workspace });
}
