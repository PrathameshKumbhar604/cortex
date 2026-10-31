"use client";

import { useCallback, useRef, useState } from "react";
import { readUseOtherChats } from "./settings";
import { addVersion, selectVersion } from "./versions";
import type {
  ActionProposal,
  AgentEvent,
  ChatTurn,
  Claim,
  Conflict,
  Evidence,
  MemoryItem,
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

function newTurn(question: string, mode: RunMode): Turn {
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

function reduce(t: Turn, e: AgentEvent): Turn {
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
      return { ...t, answer: e.markdown, needsDetails: e.needsDetails };
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

export function useAgent() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const threadId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((all) => all.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  /** Streams one run into `turn`, which the caller has already put on screen. `before` is the chat up to it. */
  const run = useCallback(
    async (turn: Turn, before: Turn[], regenerate = false) => {
      const { mode } = turn;
      const attachments = turn.attachments ?? [];
      const history: ChatTurn[] = before
        .filter((t) => t.done && t.answer)
        .slice(-40) // the whole chat; the agent fits it into its context budget
        .flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.answer, needsDetails: t.needsDetails },
        ]);
      setBusy(true);
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: turn.question, mode, threadId: threadId.current, history, useOtherChats: readUseOtherChats(), attachments: attachments.map((a) => a.id), regenerate }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
          patch(turn.id, (t) => ({ ...t, error: msg ?? `Request failed (${res.status}).`, done: true }));
          return;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          const events = frames
            .map((f) => f.replace(/^data: /, ""))
            .filter(Boolean)
            .map((f) => JSON.parse(f) as AgentEvent);
          for (const e of events) if (e.type === "run") threadId.current = e.threadId;
          if (events.length) patch(turn.id, (t) => events.reduce(reduce, t));
        }
      } catch (err) {
        const stopped = ctrl.signal.aborted;
        patch(turn.id, (t) => ({
          ...t,
          error: stopped ? undefined : err instanceof Error ? `Connection lost: ${err.message}` : "Connection lost.",
          done: true,
        }));
      } finally {
        // A thread switch may have started a newer run; leave its state alone.
        if (abort.current === ctrl) {
          abort.current = null;
          setBusy(false);
        }
        patch(turn.id, (t) => (t.done ? t : { ...t, done: true }));
      }
    },
    [patch],
  );

  const ask = useCallback(
    async (question: string, mode: RunMode, attachments: Attachment[] = []) => {
      if (!question.trim() || abort.current) return;
      const turn = { ...newTurn(question.trim(), mode), attachments: attachments.length ? attachments : undefined };
      setTurns((all) => [...all, turn]);
      await run(turn, turns);
    },
    [turns, run],
  );

  /**
   * Answers a turn's question again in place, keeping the earlier answer as a version to switch back to. Only the turns
   * before it are sent as history. Later turns stay as they are (they were asked after the attempt they followed).
   * `question` edits the prompt: the edited attempt is a new version too, so the original question and answer stay one step back.
   */
  const regenerate = useCallback(
    async (turnId: string, question?: string) => {
      const i = turns.findIndex((t) => t.id === turnId);
      const old = turns[i];
      const q = question?.trim() || old?.question;
      if (!old || !q || abort.current) return;
      const next = addVersion(old, { ...newTurn(q, old.mode), attachments: old.attachments });
      setTurns((all) => all.map((t) => (t.id === turnId ? next : t)));
      await run(next, turns.slice(0, i), true);
    },
    [turns, run],
  );

  /** Shows another attempt of a finished turn. */
  const pickVersion = useCallback((turnId: string, version: number) => {
    setTurns((all) => all.map((t) => (t.id === turnId && t.done ? selectVersion(t, version) : t)));
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);

  const decide = useCallback(
    async (turnId: string, proposalId: string, decision: "approve" | "reject", edits?: Record<string, unknown>) => {
      const res = await fetch(`/api/actions/${proposalId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, edits }),
      });
      const body = (await res.json().catch(() => ({}))) as { proposal?: ActionProposal; error?: string };
      patch(turnId, (t) => ({
        ...t,
        actions: t.actions.map((a) =>
          a.id === proposalId ? body.proposal ?? { ...a, status: "failed", result: body.error ?? "Could not complete the action." } : a,
        ),
      }));
    },
    [patch],
  );

  /** Opens a saved thread as-is (no new run); an empty list starts a new thread. */
  const load = useCallback((saved: Turn[] = [], serverThreadId?: string) => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    threadId.current = serverThreadId;
    setTurns(saved);
  }, []);

  return { turns, busy, ask, regenerate, pickVersion, stop, decide, load, threadId };
}
