import { runAgent } from "@cortex/agent";
import type { ChatTurn, RunMode } from "@cortex/shared";
import { deps, jsonError, memoryUser, session } from "@/server/cortex";

interface AskBody {
  question?: string;
  mode?: RunMode;
  threadId?: string;
  history?: ChatTurn[];
}

/** Streams AgentEvents as server-sent events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskBody;
  const question = body.question?.trim();
  if (!question) return jsonError("Ask a question first.");
  if (question.length > 2000) return jsonError("That question is too long. Keep it under 2,000 characters.");

  const sess = await session();
  const d = deps(sess.workspace);
  const history = (body.history ?? []).slice(-6).map((t) => ({ role: t.role, content: String(t.content).slice(0, 1500), needsDetails: t.needsDetails === true }));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const event of runAgent(
          {
            question,
            mode: body.mode === "fast" ? "fast" : "deep",
            userId: sess.userId,
            threadId: body.threadId,
            history,
            signal: req.signal,
          },
          { ...d, memory: scopedMemory(d.memory, memoryUser(sess)) },
        )) {
          send(event);
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}

/** Connectors see the browser's user id; memory sees the workspace-scoped one. */
function scopedMemory(memory: ReturnType<typeof deps>["memory"], memUser: string): typeof memory {
  return {
    health: () => memory.health(),
    recall: (_u, q, l) => memory.recall(memUser, q, l),
    add: (m) => memory.add({ ...m, userId: memUser }),
    list: () => memory.list(memUser),
    update: (id, p) => memory.update(id, p),
    remove: (id) => memory.remove(id),
    appendThread: (t, _u, turns) => memory.appendThread(t, memUser, turns),
  };
}
