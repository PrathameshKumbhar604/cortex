import { runAgent, type AgentDeps } from "@cortex/agent";
import { getSettings, logEvent, questionsToday, recordUsage } from "@/server/admin";
import { attachmentEvidence } from "@/server/files";
import type { ChatTurn, RunMode } from "@cortex/shared";
import { jsonError, memoryUser, session, unauthorized, withinLimit, depsFor } from "@/server/cortex";

interface AskBody {
  question?: string;
  mode?: RunMode;
  threadId?: string;
  history?: ChatTurn[];
  useOtherChats?: boolean;
  attachments?: string[];
}

/** Streams AgentEvents as server-sent events. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskBody;
  const question = body.question?.trim();
  if (!question) return jsonError("Ask a question first.");
  if (question.length > 2000) return jsonError("That question is too long. Keep it under 2,000 characters.");

  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`ask:${sess.userId}`, 20)) return jsonError("That's a lot of questions in a minute. Give it a few seconds and try again.", 429);
  const { dailyQuestionLimit } = await getSettings();
  if (dailyQuestionLimit != null && (await questionsToday(sess.authId)) >= dailyQuestionLimit) {
    return jsonError(`You've reached today's limit of ${dailyQuestionLimit} question${dailyQuestionLimit === 1 ? "" : "s"} on this Cortex. It resets at midnight (UTC).`, 429);
  }
  const d = await depsFor(sess);
  const history = (body.history ?? []).slice(-80).map((t) => ({ role: t.role, content: String(t.content).slice(0, 4000), needsDetails: t.needsDetails === true }));
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
            useOtherChats: body.useOtherChats === true,
            attachments: await attachmentEvidence(sess.userId, (body.attachments ?? []).filter((x) => typeof x === "string"), question),
            signal: req.signal,
          },
          { ...d, memory: scopedMemory(d.memory, memoryUser(sess)) },
        )) {
          send(event);
          // For the admin panel: what each account uses, and the errors people actually saw.
          if (event.type === "usage") void recordUsage(sess.authId, { questions: 1, llmCalls: event.llmCalls, searches: event.toolCalls });
          if (event.type === "error" && event.message !== "Stopped.") void logEvent(sess.email, "error", "ask", event.message);
        }
      } catch (err) {
        void logEvent(sess.email, "error", "ask", err instanceof Error ? err.message : String(err));
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
function scopedMemory(memory: AgentDeps["memory"], memUser: string): typeof memory {
  return {
    health: () => memory.health(),
    recall: (_u, q, l) => memory.recall(memUser, q, l),
    add: (m) => memory.add({ ...m, userId: memUser }),
    list: () => memory.list(memUser),
    update: (id, p) => memory.update(id, p),
    remove: (id) => memory.remove(id),
    appendThread: (t, _u, turns) => memory.appendThread(t, memUser, turns),
    searchChats: (_u, q, exclude, recent) => memory.searchChats(memUser, q, exclude, recent),
    deleteThread: (t) => memory.deleteThread(t, memUser),
  };
}
