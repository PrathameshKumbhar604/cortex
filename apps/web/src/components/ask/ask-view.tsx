"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { RunMode } from "@cortex/shared";
import { useAgent } from "@/lib/use-agent";
import { readThread, saveThread, setAutoTitle } from "@/lib/recent";
import { cn } from "@/lib/ui";
import { Composer } from "./composer";
import { TurnView } from "./turn-view";

const DEMO_SUGGESTIONS = [
  "What changed in Orbit this week, and what's at risk?",
  "What's due in the next 7 days?",
  "Is anything blocking the beta?",
  "Draft a Slack update about the new Demo Day date",
];

const LIVE_SUGGESTIONS = [
  "What changed in my projects this week?",
  "What's due in the next 7 days?",
  "Summarize unread emails that need a reply",
  "What's blocking my open pull requests?",
];

/** Names a new chat from its first message, alongside the answer; the message itself stays the title if this fails. */
function nameThread(id: string, question: string) {
  fetch("/api/title", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) })
    .then((r) => r.json() as Promise<{ title?: string | null }>)
    .then((b) => b.title && setAutoTitle(id, question, b.title))
    .catch(() => {});
}

function readMode(): RunMode {
  try {
    return localStorage.getItem("cortex.mode") === "fast" ? "fast" : "deep";
  } catch {
    return "deep";
  }
}

export function AskView({ workspace }: { workspace: "demo" | "live" }) {
  const { turns, busy, ask, stop, decide, load, threadId } = useAgent();
  const [localId, setLocalId] = useState(() => crypto.randomUUID());
  const asked = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<RunMode>("deep");
  const [expanded, setExpanded] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => setMode(readMode()), []);
  const changeMode = (m: RunMode) => {
    setMode(m);
    try {
      localStorage.setItem("cortex.mode", m);
    } catch {}
  };

  const submit = (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setDraft("");
    setExpanded(null);
    if (turns.length === 0) {
      router.replace(`/?t=${localId}`);
      nameThread(localId, question);
    }
    asked.current = true;
    void ask(question, mode);
  };

  const newThread = () => {
    asked.current = false;
    load();
    setLocalId(crypto.randomUUID());
    setExpanded(null);
    router.push("/");
  };

  // /?t=… opens a saved thread without re-running it; /?q=… (Brief cards) asks in a new thread.
  useEffect(() => {
    const t = params.get("t");
    const q = params.get("q");
    if (t && t !== localId) {
      const saved = readThread(t);
      asked.current = false;
      // A turn saved mid-run never finishes; show it as stopped.
      load(saved?.turns.map((x) => (x.done ? x : { ...x, done: true, error: x.error ?? "Stopped before it finished." })), saved?.serverThreadId);
      setLocalId(t);
      setExpanded(null);
    } else if (!t && !q && turns.length) {
      newThread();
    }
    if (q) submit(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Save the thread when a question starts and when its answer finishes; just opening one doesn't reorder it.
  useEffect(() => {
    if (!asked.current || !turns.length) return;
    saveThread({ id: localId, title: turns[0]!.question, updatedAt: Date.now(), serverThreadId: threadId.current, turns });
    if (!busy) asked.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, busy, saveTick]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const onDecide = (turnId: string) => async (id: string, d: "approve" | "reject", e?: Record<string, unknown>) => {
    await decide(turnId, id, d, e);
    asked.current = true;
    setSaveTick((n) => n + 1);
  };

  const latest = turns.at(-1);
  const earlier = turns.slice(0, -1);
  const suggestions = workspace === "demo" ? DEMO_SUGGESTIONS : LIVE_SUGGESTIONS;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-4 pt-10 pb-10 sm:px-6 md:pt-16">
          {!latest && (
            <div className="pt-[8vh]">
              <h1 className="text-balance text-[38px] font-[250] leading-[1.1] tracking-[-0.04em] text-ink sm:text-[52px]">
                What do you need to know about your work?
              </h1>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Cortex searches your {workspace === "demo" ? "sample " : ""}Gmail, Calendar, Drive, Notion, Slack and GitHub, cites every claim, and
                checks each one before you rely on it.
              </p>
              <ul className="mt-10 flex flex-col border-t border-line">
                {suggestions.map((s) => (
                  <li key={s} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => submit(s)}
                      className="group flex w-full items-center justify-between gap-4 py-3.5 text-left text-[15px] text-ink-2 transition-colors hover:text-ink"
                    >
                      {s}
                      <ChevronRight className="size-4 text-hair transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {earlier.length > 0 && (
            <ol className="mb-10 flex flex-col border-b border-line">
              {earlier.map((t) =>
                expanded === t.id ? (
                  <li key={t.id} className="border-t border-line py-6">
                    <TurnView turn={t} latest={false} onDecide={onDecide(t.id)} onFollowup={submit} />
                    <button type="button" onClick={() => setExpanded(null)} className="readout mt-4 text-muted hover:text-ink">
                      Collapse
                    </button>
                  </li>
                ) : (
                  <li key={t.id} className="border-t border-line">
                    <button
                      type="button"
                      onClick={() => setExpanded(t.id)}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left text-[14px] text-muted hover:text-ink"
                    >
                      <span className="truncate">{t.question}</span>
                      <span className="readout shrink-0 text-hair">
                        {t.mode}
                        {t.groundedness != null && t.claims.length ? ` · ${Math.round(t.groundedness * 100)}%` : ""}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ol>
          )}

          {latest && <TurnView turn={latest} latest onDecide={onDecide(latest.id)} onFollowup={submit} />}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[720px] px-4 py-3 sm:px-6 sm:py-4">
          {latest?.done && latest.followups.length > 0 && !busy && (
            <div className="mb-2 flex gap-2 overflow-x-auto pr-6 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none]" aria-label="Suggested next questions">
              {latest.followups.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => submit(f)}
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-[13px] text-ink-2 transition-colors hover:border-accent/50 hover:text-accent-ink"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => submit(draft)}
            onStop={stop}
            busy={busy}
            mode={mode}
            onMode={changeMode}
            autoFocus
            placeholder={latest ? "Ask a follow-up…" : "Ask anything about your work…"}
          />
          <div className="text-[12.5px] text-muted mt-2 flex items-center justify-between">
            <span className="hidden sm:inline">{mode === "fast" ? "Fast: one pass, quickest answer" : "Deep: plans, searches in parallel, verifies every claim"}</span>
            {turns.length > 0 && (
              <button type="button" onClick={newThread} disabled={busy} className={cn("ml-auto flex items-center gap-1 whitespace-nowrap hover:text-ink", busy && "opacity-40")}>
                <Plus className="size-3" aria-hidden /> New thread
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
