import type { MemoryKind } from "@cortex/shared";
import { deps, jsonError, memoryUser, session, unauthorized, withinLimit } from "@/server/cortex";

const KINDS: MemoryKind[] = ["priority", "preference", "fact", "person", "decision"];

const OFFLINE = "The memory service isn't running, so memories can't be shown. Start it with `npm run memory`.";

export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  const { memory } = deps(sess.workspace);
  try {
    const [health, items] = await Promise.all([memory.health(), memory.list(memoryUser(sess))]);
    return Response.json({ backend: health.backend, items });
  } catch {
    return jsonError(OFFLINE, 503);
  }
}

/** "Teach Cortex": a memory the user writes directly. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { content?: unknown; kind?: unknown };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length < 3) return jsonError("Write what Cortex should remember.");
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`memory:${sess.userId}`, 30)) return jsonError("That's a lot of memories in a minute. Give it a few seconds.", 429);
  try {
    const item = await deps(sess.workspace).memory.add({
      userId: memoryUser(sess),
      content: content.slice(0, 500),
      kind: KINDS.find((k) => k === body.kind) ?? "fact",
      source: "you",
      reason: "You added this yourself",
      salience: 0.9,
    });
    return Response.json({ item });
  } catch {
    return jsonError(OFFLINE, 503);
  }
}
