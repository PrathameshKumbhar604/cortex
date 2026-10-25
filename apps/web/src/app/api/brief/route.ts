import { runBrief } from "@cortex/agent";
import { LlmUnavailableError } from "@cortex/llm";
import { deps, jsonError, memoryUser, session } from "@/server/cortex";

export async function GET() {
  const sess = await session();
  const d = deps(sess.workspace);
  try {
    const brief = await runBrief(
      { ...d, memory: { ...d.memory, recall: (_u, q, l) => d.memory.recall(memoryUser(sess), q, l) } as typeof d.memory },
      sess.userId,
    );
    return Response.json(brief);
  } catch (err) {
    if (err instanceof LlmUnavailableError) return jsonError("Every free model is busy right now. Try again in a minute.", 503);
    return jsonError(err instanceof Error ? err.message : "Couldn't build the brief.", 500);
  }
}
