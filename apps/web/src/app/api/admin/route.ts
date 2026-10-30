import { getSettings, listUsers, recentActivity } from "@/server/admin";
import { deps, requireAdmin } from "@/server/cortex";

/** Everything the admin page shows, in one call: accounts with usage, app health, settings and recent activity. */
export async function GET() {
  const sess = await requireAdmin();
  if (sess instanceof Response) return sess;
  const d = deps(sess.workspace);
  const [users, settings, activity, connectors, memory] = await Promise.all([
    listUsers(),
    getSettings(),
    recentActivity(),
    d.registry.statuses({ userId: sess.userId }),
    d.memory.health().catch(() => ({ ok: false, backend: "offline" })),
  ]);
  // Memory counts come from the memory service; a slow or offline service leaves them blank rather than failing the page.
  const counts = await Promise.all(
    users.map((u) => (u.dataId ? d.memory.list(u.dataId).then((m) => m.length, () => null) : Promise.resolve(0))),
  );
  return Response.json({
    me: sess.authId,
    users: users.map((u, i) => ({ ...u, dataId: undefined, memories: counts[i] })), // the data id stays on the server
    settings,
    activity,
    connectors: connectors.filter((c) => c.id !== "files").map((c) => ({ id: c.id, name: c.name, connected: c.connected, available: c.available, detail: c.detail })),
    memory,
  });
}
