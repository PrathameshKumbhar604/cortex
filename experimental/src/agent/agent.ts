import type { ActionProposal, AgentEvent, ChatTurn, RunMode } from "@cortex/shared";
import { newTurn, reduce, withContext, type Attachment, type Turn } from "./reduce";
import { addVersion, selectVersion } from "./versions";

// The web's useAgent (apps/web/src/lib/use-agent.ts) as a small store outside React, so it can be tested and so a
// streaming answer can batch its updates (see useFrameBatch). Same request body, same history rules, same versions.

export interface AgentState {
  turns: Turn[];
  busy: boolean;
  serverThreadId?: string;
}

type Stream = (path: string, body: unknown, onEvent: (e: unknown) => void, signal: AbortSignal) => Promise<void>;

export interface AskOptions {
  mode: RunMode;
  attachments?: Attachment[];
  language?: Turn["language"];
  /** An answer to Cortex's own question (picked or typed on its card). */
  reply?: boolean;
}

export function createAgent(deps: { stream: Stream; useOtherChats: () => boolean; decideAction?: (id: string, body: unknown) => Promise<{ proposal?: ActionProposal; error?: string }> }) {
  let state: AgentState = { turns: [], busy: false };
  let abort: AbortController | null = null;
  const subs = new Set<() => void>();
  const set = (next: Partial<AgentState>) => {
    state = { ...state, ...next };
    subs.forEach((f) => f());
  };
  const patch = (id: string, fn: (t: Turn) => Turn) => set({ turns: state.turns.map((t) => (t.id === id ? fn(t) : t)) });

  async function run(turn: Turn, before: Turn[], regenerate: boolean) {
    const history: ChatTurn[] = before
      .filter((t) => t.done && t.answer)
      .slice(-40)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: withContext(t), needsDetails: t.needsDetails, refs: t.needsDetails ? t.refs : undefined, drafted: t.actions.length > 0 || undefined },
      ]);
    const ctrl = new AbortController();
    abort = ctrl;
    set({ busy: true });
    try {
      await deps.stream(
        "/api/ask",
        {
          question: turn.question,
          mode: turn.mode,
          threadId: state.serverThreadId,
          history,
          useOtherChats: deps.useOtherChats(),
          attachments: (turn.attachments ?? []).map((a) => a.id),
          regenerate,
          language: turn.language,
        },
        (raw) => {
          const e = raw as AgentEvent;
          if (e.type === "run") set({ serverThreadId: e.threadId });
          patch(turn.id, (t) => reduce(t, e));
        },
        ctrl.signal,
      );
    } catch (err) {
      const stopped = ctrl.signal.aborted;
      // The partial answer stays; the error explains what happened and Regenerate can try again.
      patch(turn.id, (t) => ({ ...t, error: stopped ? undefined : err instanceof Error ? err.message : "The connection to Cortex dropped.", done: true }));
    } finally {
      if (abort === ctrl) {
        abort = null;
        set({ busy: false });
      }
      patch(turn.id, (t) => (t.done ? t : { ...t, done: true }));
    }
  }

  return {
    get: () => state,
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    async ask(question: string, opts: AskOptions) {
      const q = question.trim();
      if (!q || abort) return;
      const before = state.turns;
      const turn: Turn = { ...newTurn(q, opts.mode), attachments: opts.attachments?.length ? opts.attachments : undefined, language: opts.language, reply: opts.reply };
      set({ turns: [...before, turn] });
      await run(turn, before, false);
    },
    /** Answers a turn again in place, keeping the earlier attempt as a version. `question` edits the prompt. */
    async regenerate(turnId: string, question?: string) {
      const i = state.turns.findIndex((t) => t.id === turnId);
      const old = state.turns[i];
      const q = question?.trim() || old?.question;
      if (!old || !q || abort) return;
      const next = addVersion(old, { ...newTurn(q, old.mode), attachments: old.attachments, language: old.language, reply: old.reply });
      const before = state.turns.slice(0, i);
      set({ turns: state.turns.map((t) => (t.id === turnId ? next : t)) });
      await run(next, before, true);
    },
    selectVersion(turnId: string, i: number) {
      set({ turns: state.turns.map((t) => (t.id === turnId && t.done ? selectVersion(t, i) : t)) });
    },
    stop() {
      abort?.abort();
    },
    async decide(turnId: string, proposalId: string, decision: "approve" | "reject", edits?: Record<string, unknown>) {
      type Result = { proposal?: ActionProposal; error?: string };
      const body: Result = await (deps.decideAction?.(proposalId, { decision, edits }) ?? Promise.resolve<Result>({})).catch((e: unknown): Result => ({ error: e instanceof Error ? e.message : undefined }));
      patch(turnId, (t) => ({
        ...t,
        actions: t.actions.map((a) => (a.id === proposalId ? (body.proposal ?? { ...a, status: "failed", result: body.error ?? "Could not complete the action." }) : a)),
      }));
      return body.proposal;
    },
    /** Opens a saved chat as-is, or starts a new one with no turns. */
    load(turns: Turn[] = [], serverThreadId?: string) {
      abort?.abort();
      abort = null;
      state = { turns, busy: false, serverThreadId };
      subs.forEach((f) => f());
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;
