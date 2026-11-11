// Copied from apps/web/src/lib/use-agent.ts (types, newTurn, reduce): the same event reducer the web runs. Keep in step with it.
import type {
  ActionProposal,
  AgentEvent,
  ChatTurn,
  Claim,
  Conflict,
  Evidence,
  MemoryItem,
  OptionRef,
  Plan,
  RouteDecision,
  RunMode,
  SourceFailure,
  StepId,
} from "@cortex/shared";

export type StepState = { status: "pending" | "active" | "done" | "skipped"; detail?: string; at?: number; ms?: number };

export interface ToolCall {
  id: string;
  source: string;
  query: string;
  count?: number;
  ms?: number;
  cached?: boolean;
  startedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
}

export interface Turn {
  id: string;
  question: string;
  /** Files attached to this question. */
  attachments?: Attachment[];
  mode: RunMode;
  /** Asked in voice mode in this language: the answer is written in it too (and a regenerate keeps it). */
  language?: "en" | "hi" | "mr";
  startedAt: number;
  steps: Record<StepId, StepState>;
  plan?: Plan;
  route?: RouteDecision;
  tools: ToolCall[];
  evidence: Evidence[];
  failures: SourceFailure[];
  memoryUsed: MemoryItem[];
  memoryWritten: MemoryItem[];
  answer: string;
  needsDetails?: boolean;
  /** Likely answers to the question Cortex asked back (needsDetails). */
  options?: string[];
  /** The app items (with ids) behind those options, sent back with the history so a pick needs no new search. */
  refs?: OptionRef[];
  /** An answer picked from Cortex's question card: shown as a quiet pill under that question, not as a new question. */
  reply?: boolean;
  claims: Claim[];
  conflicts: Conflict[];
  missing: string[];
  followups: string[];
  groundedness?: number;
  actions: ActionProposal[];
  usage?: { llmCalls: number; cachedCalls: number; toolCalls: number; ms: number; models: string[] };
  error?: string;
  done: boolean;
  /** Every attempt at this question when it was regenerated; `null` marks the one shown (this turn). See versions.ts. */
  versions?: (Omit<Turn, "versions" | "version"> | null)[];
  /** Which attempt is shown, 0-based. */
  version?: number;
}

const STEPS: StepId[] = ["understand", "recall", "plan", "search", "synthesize", "verify", "remember"];

export function newTurn(question: string, mode: RunMode): Turn {
  return {
    id: crypto.randomUUID(),
    question,
    mode,
    startedAt: performance.now(),
    steps: Object.fromEntries(STEPS.map((s) => [s, { status: "pending" }])) as Turn["steps"],
    tools: [],
    evidence: [],
    failures: [],
    memoryUsed: [],
    memoryWritten: [],
    answer: "",
    claims: [],
    conflicts: [],
    missing: [],
    followups: [],
    actions: [],
    done: false,
  };
}

/**
 * An answer as the agent reads it back in the history: its text plus what it drew on and drafted, so "which email
 * did you use?" or "change the title" can be answered from the chat.
 */
export function withContext(t: Turn): string {
  const sources = t.evidence.slice(0, 5).map((e) => `${e.source}: "${e.title}"${e.author ? ` from ${e.author}` : ""}${e.timestamp ? ` (${e.timestamp.slice(0, 10)})` : ""}`);
  const drafts = t.actions.map((a) => `${a.title} in ${a.connectorId} (${a.status}): ${a.summary.split("\n")[0]} ${JSON.stringify(a.args).slice(0, 1200)}`);
  return [t.answer, sources.length && `[Sources used: ${sources.join("; ")}]`, drafts.length && `[Drafted: ${drafts.join("; ")}]`].filter(Boolean).join("\n");
}

export function reduce(t: Turn, e: AgentEvent): Turn {
  const now = performance.now();
  switch (e.type) {
    case "step": {
      const prev = t.steps[e.step];
      const at = e.status === "active" ? now : prev.at ?? now;
      return {
        ...t,
        steps: { ...t.steps, [e.step]: { status: e.status, detail: e.detail ?? prev.detail, at, ms: e.status === "active" ? undefined : e.ms ?? now - at } },
      };
    }
    case "route":
      return { ...t, route: e.decision };
    case "plan":
      return { ...t, plan: e.plan };
    case "tool_call":
      return { ...t, tools: [...t.tools, { id: e.id, source: e.source, query: e.query, startedAt: now }] };
    case "tool_result":
      return { ...t, tools: t.tools.map((c) => (c.id === e.id ? { ...c, count: e.count, ms: e.ms, cached: e.cached } : c)) };
    case "evidence":
      return { ...t, evidence: e.items };
    case "source_error":
      return t.failures.some((f) => f.source === e.failure.source) ? t : { ...t, failures: [...t.failures, e.failure] };
    case "memory_used":
      return { ...t, memoryUsed: e.items };
    case "memory_written":
      return { ...t, memoryWritten: e.items };
    case "token":
      return { ...t, answer: t.answer + e.text };
    case "answer":
      return { ...t, answer: e.markdown, needsDetails: e.needsDetails, options: e.options, refs: e.refs };
    case "verdict":
      return { ...t, claims: e.claims, groundedness: e.groundedness, conflicts: e.conflicts, missing: e.missing, followups: e.followups ?? [] };
    case "action_proposal":
      return { ...t, actions: [...t.actions, e.proposal] };
    case "usage":
      return { ...t, usage: e };
    case "error":
      return { ...t, error: e.message };
    case "done":
      return { ...t, done: true };
    default:
      return t;
  }
}
