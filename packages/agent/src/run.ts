import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ConnectorRegistry, Connector } from "@cortex/connectors";
import { LlmUnavailableError, type LlmRouter } from "@cortex/llm";
import type {
  ActionProposal,
  AgentEvent,
  ChatTurn,
  Claim,
  Evidence,
  MemoryItem,
  Plan,
  RouteDecision,
  RunMode,
  SourceFailure,
  StepId,
  SubQuestion,
} from "@cortex/shared";
import type { ActionStore } from "./actions";
import { memoryNotRunning, type MemoryBackend, type PastChat } from "./memory";
import { remember } from "./remember";
import { actionPrompt, chatPrompt, generalPrompt, planPrompt, shortDate, synthPrompt, verifyPrompt, type ActionBrief } from "./prompts";
import { ABOUT_PAST_CHATS, decideRoute } from "./route";
import { keywords, parseWindow } from "./time";
import { traced, withTracing } from "./tracing";
import { groundedness, splitSections, streamCutoff, toConflicts, verifyClaims } from "./verify";

export const LIMITS = {
  maxSubQuestions: 5,
  maxToolCalls: 18,
  maxLlmCalls: { fast: 3, deep: 5 }, // includes the router call, which is skipped when rules decide
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
  /** Passages of files the user attached to this question: always part of the evidence. */
  attachments?: Omit<Evidence, "id" | "subQuestionId">[];
  /** Opt-in: may read the user's other chats. When false, they are never searched. */
  useOtherChats?: boolean;
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
  const sources = connected.filter((c) => c.id !== "web" || WEB_HINT.test(question) || connected.length === 1).map((c) => c.id);
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
export const runAgent = traced(timed, "cortex.run");

/** Stamps each finished step with its server-side duration. */
async function* timed(input: RunInput, deps: AgentDeps): AsyncGenerator<AgentEvent> {
  const startedAt: Partial<Record<string, number>> = {};
  for await (const e of runAgentImpl(input, deps)) {
    if (e.type === "step") {
      if (e.status === "active") startedAt[e.step] = Date.now();
      else if (startedAt[e.step] != null) {
        yield { ...e, ms: Date.now() - startedAt[e.step]! };
        continue;
      }
    }
    yield e;
  }
}

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
    // Only a connection the user made and that lapsed is worth a note; an app they never set up (or uploads they never
    // made) isn't a failure. Status errors are logged by the registry.
    for (const s of statuses.filter((s) => !s.connected && s.reconnect && s.detail)) {
      const c = deps.registry.get(s.id);
      const failure = { source: s.id, name: s.name, reason: s.detail!, impact: c?.impact ?? "" };
      failures.push(failure);
      yield { type: "source_error", failure };
    }
    yield { type: "step", step: "understand", status: "done", detail: `${connected.length} sources available` };

    // 2. Recall memory (pinned memories always come along).
    yield { type: "step", step: "recall", status: "active" };
    let memories: MemoryItem[] = [];
    let pastChats: PastChat[] = [];
    const askedAboutPast = ABOUT_PAST_CHATS.test(input.question);
    try {
      memories = await deps.memory.recall(input.userId, input.question, 5);
      if (memories.length) yield { type: "memory_used", items: memories };
      // Opted in: every question checks the other chats (a cheap keyword match, no model call), so the user never has
      // to ask for it; only related ones come back. A question about past chats with no topic gets the latest ones.
      if (input.useOtherChats) {
        try {
          pastChats = await deps.memory.searchChats(input.userId, input.question, input.threadId, askedAboutPast);
        } catch {
          // other chats are extra context; the answer doesn't need them
        }
      }
      const found = [
        memories.length && `${memories.length} memories`,
        input.useOtherChats && (pastChats.length ? `${pastChats.length} from other chats` : "no related chats"),
      ].filter(Boolean).join(", ");
      yield { type: "step", step: "recall", status: "done", detail: found || "nothing relevant" };
    } catch (err) {
      const failure: SourceFailure = {
        source: "memory",
        name: "Memory",
        reason: err instanceof Error ? err.message : "unreachable",
        impact: "Your saved priorities and preferences won't be used for this answer.",
      };
      failures.push(failure);
      console.warn("[memory] recall failed:", failure.reason);
      // No memory service running here (not deployed, or not started) is how this Cortex is set up, not a failure to report.
      if (!memoryNotRunning(err)) yield { type: "source_error", failure };
      yield { type: "step", step: "recall", status: "skipped", detail: "memory offline" };
    }

    // 2b. Route: does this need the user's sources at all, which ones, and which model?
    const routed = await decideRoute(
      input.question,
      history,
      connected.map((c) => ({ id: c.id, describes: c.describes })),
      deps.llm,
      signal,
    );
    const attached = input.attachments ?? [];
    // A question with a file attached is about that file (plus any app it names), whatever its wording.
    const route: RouteDecision = attached.length
      ? {
          ...routed.decision,
          route: routed.decision.route === "action" ? "action" : "personal",
          sources: [...new Set([...routed.decision.sources.filter((s) => s !== "web"), "files"])],
          reason: "asks about an attached file",
        }
      : routed.decision;
    if (routed.llm) {
      budget.llmCalls++;
      if (routed.llm.cached) budget.cachedCalls++;
      budget.models.add(`${routed.llm.provider}/${routed.llm.model}`);
    }
    yield { type: "route", decision: route };

    if (route.route === "general") {
      yield* skip(["plan", "search", "verify"]);
      yield { type: "step", step: "synthesize", status: "active" };
      budget.llmCalls++;
      let text = "";
      for await (const part of deps.llm.stream({
        tier: fast ? "fast" : route.tier,
        messages: generalPrompt(input.question, history, memories, pastChats, { on: !!input.useOtherChats, asked: askedAboutPast }),
        maxTokens: 900,
        signal,
      })) {
        if ("token" in part) {
          text += part.token;
          yield { type: "token", text: part.token };
        } else {
          if (part.done.cached) budget.cachedCalls++;
          budget.models.add(`${part.done.provider}/${part.done.model}`);
        }
      }
      yield { type: "answer", markdown: text };
      yield { type: "step", step: "synthesize", status: "done" };
      const memoryDown = failures.some((f) => f.source === "memory");
      yield* rememberStep(input, deps, { runId, memories, budget, signal, memoryDown });
      if (!memoryDown) saveTurn(deps, threadId, input, text);
      yield usage(budget, started);
      yield { type: "done" };
      return;
    }

    // Only the sources the router picked (all connected ones when it named none).
    const scoped =
      route.route === "web"
        ? connected.filter((c) => c.id === "web")
        : route.sources.length
          ? connected.filter((c) => route.sources.includes(c.id))
          : connected;

    // 3. Plan.
    yield { type: "step", step: "plan", status: "active" };
    let plan: Plan;
    if (fast || scoped.length === 0 || route.route === "action") {
      plan = heuristicPlan(input.question, scoped);
    } else {
      try {
        budget.llmCalls++;
        const res = await deps.llm.json(
          {
            tier: "fast", // planning is short structured output; keep the strong model's quota for the answer
            messages: planPrompt(
              input.question,
              scoped.map((c) => ({ id: c.id, describes: c.describes })),
              memories,
              history,
            ),
            maxTokens: 1500, // room for a reasoning model to think before the JSON
            signal,
          },
          (v) => PlanSchema.parse(v),
        );
        if (res.cached) budget.cachedCalls++;
        budget.models.add(`${res.provider}/${res.model}`);
        plan = sanitizePlan(res.data, input.question, scoped);
        // The router already decided this needs sources; the planner may not overrule it into small talk.
        if (plan.intent === "chat") plan = { ...plan, intent: "research" };
        if (plan.intent !== "chat" && plan.subQuestions.length === 0) plan = heuristicPlan(input.question, scoped);
      } catch (err) {
        if (err instanceof LlmUnavailableError) throw err;
        plan = heuristicPlan(input.question, scoped); // planner output unusable → degrade, don't fail
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
    // Deep mode: the whole question over every in-scope source first, so a narrow plan can't miss the obvious hit.
    if (!fast && plan.subQuestions.length > 1) {
      const baseline = keywords(input.question);
      for (const c of scoped) {
        if (c.id === "web" && route.route !== "web") continue;
        calls.set(`${c.id}|${baseline}`, { source: c.id, query: baseline, subQuestionId: plan.subQuestions[0]!.id });
      }
    }
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

    // Opted-in past chats compete with the sources for a place in the evidence, and are cited like them.
    evidence.push(
      ...pastChats.map((c) => ({
        id: "",
        source: "chat",
        title: `Your chat on ${shortDate(c.createdAt)}`,
        quote: `You asked: "${c.question}". Cortex answered: ${c.answer.replace(/\s+/g, " ")}`,
        timestamp: c.createdAt,
        subQuestionId: plan.subQuestions[0]?.id,
      })),
    );
    // Attached passages always make the cut; searched evidence fills the remaining places.
    const searched = evidence.filter((e) => !attached.some((a) => a.ref === e.ref && a.quote === e.quote)); // already attached
    const kept = rankEvidence(searched, `${input.question} ${plan.rewritten}`, Math.max(2, LIMITS.maxEvidence[input.mode] - attached.length));
    const ranked = [...attached.map((a) => ({ ...a, id: "" })), ...kept].map((e, i) => ({
      ...e,
      id: `e${i + 1}`,
    }));
    yield { type: "evidence", items: ranked };
    yield { type: "step", step: "search", status: "done", detail: `${ranked.length} pieces of evidence from ${budget.toolCalls} searches` };

    // 5a. Actions: draft for approval, or ask for what's missing. No answer to verify, so no claims or citations.
    if (route.route === "action") {
      yield { type: "step", step: "synthesize", status: "active", detail: "drafting" };
      const drafted = await draftAction(input, deps, { evidence: ranked, briefs: actionBriefs(scoped.length ? scoped : connected), history, budget, signal });
      if (drafted) {
        const md = drafted.proposals.length ? "Here's the draft. Check it, edit if needed, and approve. Nothing happens until you do." : drafted.ask!;
        yield* skip(["verify", "remember"]);
        yield { type: "evidence", items: [] };
        yield { type: "token", text: md };
        yield { type: "answer", markdown: md, needsDetails: !drafted.proposals.length };
        yield { type: "step", step: "synthesize", status: "done", detail: drafted.proposals.length ? "ready for approval" : "needs details" };
        yield { type: "verdict", claims: [], groundedness: 1, conflicts: [], missing: [], followups: [] };
        for (const p of drafted.proposals) yield { type: "action_proposal", proposal: p };
        yield usage(budget, started);
        yield { type: "done" };
        return;
      }
      // Not an action after all (a question, or the user moved on): answer it like any other question.
    }

    // 5b. Nothing found → say so honestly, without spending an LLM call.
    if (ranked.length === 0) {
      const searched = [...new Set([...calls.values()].map((c) => deps.registry.get(c.source)?.name ?? c.source))];
      const md =
        connected.length === 0
          ? "No sources are connected yet, so I have nothing to search. Connect an app on the **Connections** page, or switch to the sample workspace."
          : `I couldn't find anything about this in your connected sources (searched ${searched.join(", ") || "none"}). I won't guess. Try rephrasing, widening the time range, or connecting the app where this lives.`;
      yield { type: "token", text: md };
      yield { type: "answer", markdown: md };
      yield* skip(["synthesize", "verify", "remember"]);
      yield { type: "verdict", claims: [], groundedness: 1, conflicts: [], missing: [input.question], followups: [] };
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
        raw += part.token.replace(/【/g, "[").replace(/】/g, "]");
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
            reasoning: "low", // a per-claim yes/no judgement
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
      followups: sections.next,
    };
    yield { type: "step", step: "verify", status: "done", detail: `${Math.round(score * 100)}% grounded` };

    // 8. Actions the answer suggested are proposed, never executed here.
    const proposedActions = sections.actions;
    for (const a of proposedActions.slice(0, 3)) {
      const p = deps.actions.propose(input.userId, deps.registry, a);
      if ("id" in p) yield { type: "action_proposal", proposal: p };
    }

    // 9. Remember: automatic, selective (see remember.ts). The answer is already on screen.
    const memoryDown = failedSources.has("memory") || failures.some((f) => f.source === "memory");
    yield* rememberStep(input, deps, { runId, memories, budget, signal, memoryDown });
    if (!memoryDown) saveTurn(deps, threadId, input, sections.answer);

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

/**
 * Drafts the requested action for the approval card, or the plain-words question to ask when a detail
 * is missing. Returns null when the message turns out not to be an action.
 */
async function draftAction(
  input: RunInput,
  deps: AgentDeps,
  o: { evidence: Evidence[]; briefs: ActionBrief[]; history: ChatTurn[]; budget: Budget; signal: AbortSignal },
): Promise<{ proposals: ActionProposal[]; ask?: string } | null> {
  const drafts: unknown[] = [];
  let ask: string | undefined;
  if (o.budget.canCallLlm()) {
    o.budget.llmCalls++;
    const res = await deps.llm.json(
      { tier: "strong", messages: actionPrompt(input.question, o.evidence, o.briefs, o.history), maxTokens: 1200, cacheTtlMs: 0, signal: o.signal },
      (v) => (Array.isArray(v) ? v : (v as { actions?: unknown[] })?.actions ?? [v]),
    );
    o.budget.models.add(`${res.provider}/${res.model}`);
    for (const d of res.data) {
      const r = d as { ask?: unknown; notAction?: unknown };
      if (r?.notAction === true) return null;
      if (typeof r?.ask === "string" && r.ask.trim()) ask ??= r.ask.trim();
      else drafts.push(d);
    }
  }
  const proposals: ActionProposal[] = [];
  for (const d of drafts.slice(0, 3)) {
    const p = deps.actions.propose(input.userId, deps.registry, d);
    if ("id" in p) proposals.push(p);
  }
  return proposals.length ? { proposals } : { proposals, ask: ask ?? "I need a bit more to go on. What exactly should I do, and what should it say?" };
}

async function* rememberStep(
  input: RunInput,
  deps: AgentDeps,
  o: { runId: string; memories: MemoryItem[]; budget: Budget; signal: AbortSignal; memoryDown: boolean },
): AsyncGenerator<AgentEvent> {
  yield { type: "step", step: "remember", status: "active" };
  if (o.memoryDown) {
    yield { type: "step", step: "remember", status: "skipped", detail: "memory offline" };
    return;
  }
  let written: MemoryItem[] = [];
  try {
    const res = await remember(input.question, {
      userId: input.userId,
      runId: o.runId,
      related: o.memories,
      memory: deps.memory,
      llm: deps.llm,
      allowLlm: true, // runs after the answer is out and is already gated by rules; the answer budget must not starve it
      signal: o.signal,
    });
    if (res.llm) {
      o.budget.llmCalls++;
      if (res.llm.cached) o.budget.cachedCalls++;
      o.budget.models.add(`${res.llm.provider}/${res.llm.model}`);
    }
    written = res.written;
  } catch {
    // memory went offline mid-run; the answer stands
  }
  if (written.length) yield { type: "memory_written", items: written };
  yield { type: "step", step: "remember", status: "done", detail: written.length ? `saved ${written.length}` : "nothing new worth keeping" };
}

/** Keeps the turn server-side, so later chats can refer back to it (only if the user opts in). */
function saveTurn(deps: AgentDeps, threadId: string, input: RunInput, answer: string) {
  deps.memory
    .appendThread(threadId, input.userId, [
      { role: "user", content: input.question },
      { role: "assistant", content: answer },
    ])
    .catch(() => {});
}

function* skip(steps: StepId[]): Generator<AgentEvent> {
  for (const step of steps) yield { type: "step", step, status: "skipped" };
}

function usage(b: Budget, started: number): AgentEvent {
  return { type: "usage", llmCalls: b.llmCalls, cachedCalls: b.cachedCalls, toolCalls: b.toolCalls, ms: Date.now() - started, models: [...b.models] };
}
