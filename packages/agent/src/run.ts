import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ConnectorRegistry, Connector } from "@cortex/connectors";
import { LlmUnavailableError, type LlmRouter } from "@cortex/llm";
import type {
  AgentEvent,
  ChatTurn,
  Claim,
  Evidence,
  MemoryItem,
  MemoryKind,
  Plan,
  RunMode,
  SourceFailure,
  SubQuestion,
} from "@cortex/shared";
import type { ActionStore } from "./actions";
import { explicitMemory, type MemoryBackend } from "./memory";
import { chatPrompt, planPrompt, synthPrompt, verifyPrompt, type ActionBrief } from "./prompts";
import { keywords, parseWindow } from "./time";
import { traced, withTracing } from "./tracing";
import { groundedness, splitSections, streamCutoff, toConflicts, verifyClaims } from "./verify";

export const LIMITS = {
  maxSubQuestions: 5,
  maxToolCalls: 18,
  maxLlmCalls: { fast: 2, deep: 4 },
  maxEvidence: { fast: 8, deep: 16 },
  runTimeoutMs: 90_000,
} as const;

export interface AgentDeps {
  llm: LlmRouter;
  registry: ConnectorRegistry;
  memory: MemoryBackend;
  actions: ActionStore;
}

export interface RunInput {
  question: string;
  mode: RunMode;
  userId: string;
  threadId?: string;
  history?: ChatTurn[];
  signal?: AbortSignal;
}

const PlanSchema = z.object({
  intent: z.enum(["research", "action", "chat"]).catch("research"),
  rewritten: z.string().catch(""),
  window: z
    .object({ since: z.string().optional(), until: z.string().optional(), label: z.string().optional() })
    .nullable()
    .optional()
    .catch(null),
  subQuestions: z
    .array(z.object({ id: z.string().catch(""), question: z.string(), sources: z.array(z.string()).catch([]), query: z.string().catch("") }))
    .catch([]),
});

const MemoryCandidate = z.object({
  content: z.string().min(4).max(240),
  kind: z.enum(["priority", "preference", "fact", "person", "decision"]).catch("fact"),
  salience: z.number().min(0).max(1).catch(0.5),
  reason: z.string().catch("Mentioned in conversation"),
});

const WEB_HINT = /https?:\/\/|\b(web|online|internet|news|docs?|documentation|status page|changelog|search the)\b/i;

/** Budget guard so no path can loop or overspend free-tier quota. */
class Budget {
  llmCalls = 0;
  cachedCalls = 0;
  toolCalls = 0;
  models = new Set<string>();
  constructor(private readonly maxLlm: number) {}
  canCallLlm() {
    return this.llmCalls < this.maxLlm;
  }
  canCallTool() {
    return this.toolCalls < LIMITS.maxToolCalls;
  }
}

function heuristicPlan(question: string, connected: Connector[]): Plan {
  const sources = connected.filter((c) => c.id !== "web" || WEB_HINT.test(question)).map((c) => c.id);
  return {
    intent: "research",
    rewritten: question,
    window: parseWindow(question),
    subQuestions: [{ id: "q1", question, sources, query: keywords(question) }],
  };
}

function sanitizePlan(raw: z.infer<typeof PlanSchema>, question: string, connected: Connector[]): Plan {
  const ids = new Set(connected.map((c) => c.id));
  const subQuestions: SubQuestion[] = raw.subQuestions
    .slice(0, LIMITS.maxSubQuestions)
    .map((q, i) => ({
      id: `q${i + 1}`,
      question: q.question,
      sources: [...new Set(q.sources.filter((s) => ids.has(s)))],
      query: (q.query || keywords(q.question)).slice(0, 80),
    }))
    .map((q) => (q.sources.length ? q : { ...q, sources: [...ids].filter((s) => s !== "web") }));
  const window = raw.window && (raw.window.since || raw.window.until) ? raw.window : parseWindow(question);
  return { intent: raw.intent, rewritten: raw.rewritten || question, window: window ?? undefined, subQuestions };
}

function rankEvidence(items: Evidence[], question: string, max: number): Evidence[] {
  const q = new Set(keywords(question, 12).split(" ").filter(Boolean));
  const now = Date.now();
  const seen = new Set<string>();
  return items
    .filter((e) => {
      const k = `${e.source}|${e.title}|${e.quote.slice(0, 60)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((e) => {
      const text = `${e.title} ${e.quote}`.toLowerCase();
      const hits = [...q].filter((t) => text.includes(t)).length;
      const ageDays = e.timestamp ? Math.abs(now - new Date(e.timestamp).getTime()) / 86_400_000 : 30;
      return { e, score: hits * 2 + Math.max(0, 3 - ageDays / 10) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.e);
}

function actionBriefs(connected: Connector[]): ActionBrief[] {
  return connected.flatMap((c) =>
    c.actions.map((a) => ({
      connector: c.id,
      action: a.id,
      title: a.title,
      params: a.params.map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`).join(", "),
    })),
  );
}

/**
 * Runs one question end to end and streams AgentEvents.
 *   understand → recall → plan → search (parallel) → synthesize (streamed)
 *   → verify → propose actions → remember
 * Fast Mode skips the LLM planner and LLM verification: one LLM call total.
 */
export const runAgent = traced(runAgentImpl, "cortex.run");

async function* runAgentImpl(input: RunInput, rawDeps: AgentDeps): AsyncGenerator<AgentEvent> {
  const deps = withTracing(rawDeps);
  const started = Date.now();
  const runId = randomUUID();
  const threadId = input.threadId ?? randomUUID();
  const fast = input.mode === "fast";
  const history = input.history ?? [];
  const budget = new Budget(LIMITS.maxLlmCalls[input.mode]);
  const timeout = AbortSignal.timeout(LIMITS.runTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const ctx = { userId: input.userId, signal };
  const failures: SourceFailure[] = [];

  yield { type: "run", runId, mode: input.mode, threadId };

  try {
    // 1. Understand: which sources can we use right now?
    yield { type: "step", step: "understand", status: "active" };
    const statuses = await deps.registry.statuses(ctx);
    const connected = deps.registry.list().filter((c) => statuses.find((s) => s.id === c.id)?.connected);
    for (const s of statuses.filter((s) => !s.connected && s.detail)) {
      const c = deps.registry.get(s.id);
      const failure = { source: s.id, name: s.name, reason: s.detail!, impact: c?.impact ?? "" };
      failures.push(failure);
      yield { type: "source_error", failure };
    }
    yield { type: "step", step: "understand", status: "done", detail: `${connected.length} sources available` };

    // 2. Recall memory (pinned memories always come along).
    yield { type: "step", step: "recall", status: "active" };
    let memories: MemoryItem[] = [];
    try {
      memories = await deps.memory.recall(input.userId, input.question, 5);
      if (memories.length) yield { type: "memory_used", items: memories };
      yield { type: "step", step: "recall", status: "done", detail: memories.length ? `${memories.length} memories` : "nothing relevant" };
    } catch (err) {
      const failure: SourceFailure = {
        source: "memory",
        name: "Memory",
        reason: err instanceof Error ? err.message : "unreachable",
        impact: "Your saved priorities and preferences won't be used for this answer.",
      };
      failures.push(failure);
      yield { type: "source_error", failure };
      yield { type: "step", step: "recall", status: "skipped", detail: "memory offline" };
    }

    // 3. Plan.
    yield { type: "step", step: "plan", status: "active" };
    let plan: Plan;
    if (fast || connected.length === 0) {
      plan = heuristicPlan(input.question, connected);
    } else {
      try {
        budget.llmCalls++;
        const res = await deps.llm.json(
          {
            tier: "strong",
            messages: planPrompt(
              input.question,
              connected.map((c) => ({ id: c.id, describes: c.describes })),
              memories,
              history,
            ),
            maxTokens: 700,
            signal,
          },
          (v) => PlanSchema.parse(v),
        );
        if (res.cached) budget.cachedCalls++;
        budget.models.add(`${res.provider}/${res.model}`);
        plan = sanitizePlan(res.data, input.question, connected);
        if (plan.intent !== "chat" && plan.subQuestions.length === 0) plan = heuristicPlan(input.question, connected);
      } catch (err) {
        if (err instanceof LlmUnavailableError) throw err;
        plan = heuristicPlan(input.question, connected); // planner output unusable → degrade, don't fail
      }
    }
    yield { type: "plan", plan };
    yield {
      type: "step",
      step: "plan",
      status: "done",
      detail: fast ? "Fast Mode: single pass" : `${plan.subQuestions.length} sub-questions`,
    };

    // Small talk / questions about Cortex: no retrieval.
    if (plan.intent === "chat") {
      yield* skip(["search", "verify", "remember"]);
      yield { type: "step", step: "synthesize", status: "active" };
      budget.llmCalls++;
      let text = "";
      for await (const part of deps.llm.stream({ tier: "fast", messages: chatPrompt(input.question, history), maxTokens: 300, signal })) {
        if ("token" in part) {
          text += part.token;
          yield { type: "token", text: part.token };
        } else budget.models.add(`${part.done.provider}/${part.done.model}`);
      }
      yield { type: "answer", markdown: text };
      yield { type: "step", step: "synthesize", status: "done" };
      yield usage(budget, started);
      yield { type: "done" };
      return;
    }

    // 4. Search all (sub-question × source) pairs in parallel, deduplicated.
    yield { type: "step", step: "search", status: "active" };
    const evidence: Evidence[] = [];
    const calls = new Map<string, { source: string; query: string; subQuestionId: string }>();
    for (const q of plan.subQuestions) {
      for (const source of q.sources) {
        const key = `${source}|${q.query}`;
        if (!calls.has(key) && calls.size < LIMITS.maxToolCalls) calls.set(key, { source, query: q.query, subQuestionId: q.id });
      }
    }
    const failedSources = new Set(failures.map((f) => f.source));
    const searchRound = async function* (batch: { source: string; query: string; subQuestionId: string }[], window = plan.window) {
      const pending = batch.map((c, i) => {
        const id = `t${budget.toolCalls + i + 1}`;
        return { id, c, p: deps.registry.safeSearch(c.source, { query: c.query, since: window?.since, until: window?.until, limit: fast ? 4 : 6 }, ctx) };
      });
      budget.toolCalls += pending.length;
      for (const { id, c } of pending) yield { type: "tool_call", id, source: c.source, query: c.query, subQuestionId: c.subQuestionId } as AgentEvent;
      const results = await Promise.all(pending.map(async (x) => ({ ...x, r: await x.p })));
      for (const { id, c, r } of results) {
        if (r.ok) {
          const items = r.items.map((it) => ({ ...it, id: "", subQuestionId: c.subQuestionId }));
          evidence.push(...items);
          yield { type: "tool_result", id, source: c.source, count: items.length, cached: r.cached, ms: r.ms } as AgentEvent;
        } else {
          yield { type: "tool_result", id, source: c.source, count: 0, cached: false, ms: r.ms } as AgentEvent;
          if (!failedSources.has(c.source)) {
            failedSources.add(c.source);
            failures.push(r.failure);
            yield { type: "source_error", failure: r.failure } as AgentEvent;
          }
        }
      }
    };
    yield* searchRound([...calls.values()]);

    // Deep mode: one bounded retry for sub-questions that found nothing (broader query, no time window). No LLM call.
    if (!fast) {
      const empty = plan.subQuestions.filter((q) => !evidence.some((e) => e.subQuestionId === q.id));
      const retry = empty
        .flatMap((q) => q.sources.filter((s) => !failedSources.has(s)).map((source) => ({ source, query: q.query.split(" ").slice(0, 2).join(" "), subQuestionId: q.id })))
        .slice(0, Math.max(0, LIMITS.maxToolCalls - budget.toolCalls));
      if (retry.length) yield* searchRound(retry, undefined);
    }

    const ranked = rankEvidence(evidence, `${input.question} ${plan.rewritten}`, LIMITS.maxEvidence[input.mode]).map((e, i) => ({
      ...e,
      id: `e${i + 1}`,
    }));
    yield { type: "evidence", items: ranked };
    yield { type: "step", step: "search", status: "done", detail: `${ranked.length} pieces of evidence from ${budget.toolCalls} searches` };

    // 5. Nothing found → say so honestly, without spending an LLM call.
    if (ranked.length === 0) {
      const searched = [...new Set([...calls.values()].map((c) => deps.registry.get(c.source)?.name ?? c.source))];
      const md =
        connected.length === 0
          ? "No sources are connected yet, so I have nothing to search. Connect an app on the **Connections** page, or switch to the sample workspace."
          : `I couldn't find anything about this in your connected sources (searched ${searched.join(", ") || "none"}). I won't guess. Try rephrasing, widening the time range, or connecting the app where this lives.`;
      yield { type: "token", text: md };
      yield { type: "answer", markdown: md };
      yield* skip(["synthesize", "verify", "remember"]);
      yield { type: "verdict", claims: [], groundedness: 1, conflicts: [], missing: [input.question] };
      yield usage(budget, started);
      yield { type: "done" };
      return;
    }

    // 6. Synthesize, streaming only the answer part (sections are parsed after).
    yield { type: "step", step: "synthesize", status: "active" };
    budget.llmCalls++;
    let raw = "";
    let forwarded = 0;
    for await (const part of deps.llm.stream({
      tier: fast ? "fast" : "strong",
      messages: synthPrompt({
        question: input.question,
        plan,
        evidence: ranked,
        memories,
        history,
        failures: failures.map((f) => `${f.name}: ${f.reason}`),
        actions: actionBriefs(connected),
        fast,
      }),
      maxTokens: fast ? 700 : 1400,
      signal,
    })) {
      if ("token" in part) {
        raw += part.token;
        const cut = streamCutoff(raw);
        if (cut > forwarded) {
          yield { type: "token", text: raw.slice(forwarded, cut) };
          forwarded = cut;
        }
      } else {
        if (part.done.cached) budget.cachedCalls++;
        budget.models.add(`${part.done.provider}/${part.done.model}`);
      }
    }
    const sections = splitSections(raw);
    yield { type: "answer", markdown: sections.answer };
    yield { type: "step", step: "synthesize", status: "done" };

    // 7. Verify claims against evidence (lexical always; LLM only for doubtful claims in Deep mode).
    yield { type: "step", step: "verify", status: "active" };
    let claims: Claim[] = verifyClaims(sections.answer, ranked);
    const doubtful = claims.map((c, i) => ({ c, i })).filter(({ c }) => c.status !== "supported" && c.evidenceIds.length > 0);
    if (!fast && doubtful.length && budget.canCallLlm()) {
      try {
        budget.llmCalls++;
        const byId = new Map(ranked.map((e) => [e.id, e]));
        const res = await deps.llm.json(
          {
            tier: "fast",
            messages: verifyPrompt(
              doubtful.slice(0, 8).map(({ c, i }) => ({
                i,
                claim: c.text,
                evidence: c.evidenceIds.map((id) => `${byId.get(id)?.title}: ${byId.get(id)?.quote}`).join(" | "),
              })),
            ),
            maxTokens: 400,
            signal,
          },
          (v) => z.object({ results: z.array(z.object({ i: z.number(), status: z.enum(["supported", "partial", "unsupported"]) })) }).parse(v),
        );
        if (res.cached) budget.cachedCalls++;
        claims = claims.map((c, i) => ({ ...c, status: res.data.results.find((r) => r.i === i)?.status ?? c.status }));
      } catch {
        // keep lexical verdicts
      }
    }
    const score = groundedness(claims);
    yield {
      type: "verdict",
      claims,
      groundedness: score,
      conflicts: toConflicts(sections.conflicts, ranked),
      missing: sections.missing,
    };
    yield { type: "step", step: "verify", status: "done", detail: `${Math.round(score * 100)}% grounded` };

    // 8. Actions are proposed, never executed here.
    for (const a of sections.actions.slice(0, 3)) {
      const p = deps.actions.propose(input.userId, deps.registry, a);
      if ("id" in p) yield { type: "action_proposal", proposal: p };
    }

    // 9. Remember selectively: explicit requests always; model suggestions only when salient.
    yield { type: "step", step: "remember", status: "active" };
    const written: MemoryItem[] = [];
    if (!failedSources.has("memory") && !failures.some((f) => f.source === "memory")) {
      const candidates: { content: string; kind: MemoryKind; salience: number; reason: string }[] = [];
      const explicit = explicitMemory(input.question);
      if (explicit) candidates.push({ ...explicit, salience: 0.95, reason: "You asked me to keep this in mind" });
      for (const m of sections.memory.slice(0, 2)) {
        const parsed = MemoryCandidate.safeParse(m);
        if (parsed.success && parsed.data.salience >= 0.6) candidates.push(parsed.data);
      }
      for (const c of candidates.slice(0, 2)) {
        try {
          const item = await deps.memory.add({ userId: input.userId, ...c, source: "conversation", runId });
          if (item) written.push(item);
        } catch {
          break;
        }
      }
      deps.memory
        .appendThread(threadId, input.userId, [
          { role: "user", content: input.question },
          { role: "assistant", content: sections.answer },
        ])
        .catch(() => {});
    }
    if (written.length) yield { type: "memory_written", items: written };
    yield { type: "step", step: "remember", status: "done", detail: written.length ? `saved ${written.length}` : "nothing new worth keeping" };

    yield usage(budget, started);
    yield { type: "done" };
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      yield {
        type: "source_error",
        failure: { source: "llm", name: "Language model", reason: err.message, impact: "Cortex can search but cannot write an answer right now." },
      };
      yield { type: "error", message: "Every free model is busy or unavailable right now. Try again in a minute, or switch on Fast Mode." };
    } else if (signal.aborted) {
      yield { type: "error", message: input.signal?.aborted ? "Stopped." : "This took too long, so I stopped it. Try Fast Mode or a narrower question." };
    } else {
      yield { type: "error", message: err instanceof Error ? err.message : "Something went wrong." };
    }
    yield usage(budget, started);
    yield { type: "done" };
  }
}

function* skip(steps: ("search" | "synthesize" | "verify" | "remember")[]): Generator<AgentEvent> {
  for (const step of steps) yield { type: "step", step, status: "skipped" };
}

function usage(b: Budget, started: number): AgentEvent {
  return { type: "usage", llmCalls: b.llmCalls, cachedCalls: b.cachedCalls, toolCalls: b.toolCalls, ms: Date.now() - started, models: [...b.models] };
}
