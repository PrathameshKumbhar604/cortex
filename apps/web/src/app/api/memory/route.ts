import type { MemoryKind } from "@cortex/shared";
import { deps, jsonError, memoryUser, session, unauthorized } from "@/server/cortex";

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
  const body = (await req.json().catch(() => ({}))) as { content?: string; kind?: MemoryKind };
  const content = body.content?.trim();
  if (!content || content.length < 3) return jsonError("Write what Cortex should remember.");
  const sess = await session();
  if (!sess) return unauthorized();
  try {
    const item = await deps(sess.workspace).memory.add({
      userId: memoryUser(sess),
      content: content.slice(0, 500),
      kind: body.kind ?? "fact",
      source: "you",
      reason: "You added this yourself",
      salience: 0.9,
    });
    return Response.json({ item });
  } catch {
    return jsonError(OFFLINE, 503);
  }
}
