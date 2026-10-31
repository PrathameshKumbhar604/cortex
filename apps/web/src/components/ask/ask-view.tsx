"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown, ChevronRight, ChevronUp, CornerDownRight, Plus } from "lucide-react";
import type { RunMode } from "@cortex/shared";
import { useAgent } from "@/lib/use-agent";
import { readThread, saveThread, setAutoTitle } from "@/lib/recent";
import { useThreadScroll } from "@/lib/use-thread-scroll";
import { play } from "@/lib/sound";
import { cn } from "@/lib/ui";
import { Composer, type PendingFile } from "./composer";
import { uploadFile } from "@/lib/files";
import { toast } from "@/lib/toast";
import { TurnView } from "./turn-view";
import { useUser } from "@clerk/nextjs";
import { Mark } from "../shell";

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
  const [files, setFiles] = useState<PendingFile[]>([]);

  // Each file uploads as soon as it is added, so it is ready by the time the question is sent.
  const attach = (picked: File[]) => {
    for (const f of picked) {
      const key = crypto.randomUUID();
      setFiles((all) => [...all, { key, name: f.name, size: f.size, status: "uploading" }]);
      uploadFile(f).then(
        (saved) => setFiles((all) => all.map((a) => (a.key === key ? { ...a, status: "ready", id: saved.id } : a))),
        (err: Error) => {
          setFiles((all) => all.map((a) => (a.key === key ? { ...a, status: "error", error: err.message } : a)));
          toast(`Couldn't attach ${f.name}`, { body: err.message, tone: "warn" });
        },
      );
    }
  };
  const [mode, setMode] = useState<RunMode>("deep");
  const params = useSearchParams();
  const router = useRouter();
  const { scroller, content, away, canPrev, canNext, step, toLatest, follow } = useThreadScroll();

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
    follow();
    if (turns.length === 0) {
      router.replace(`/?t=${localId}`);
      nameThread(localId, question);
    }
    asked.current = true;
    play("send");
    const ready = files.filter((f) => f.status === "ready" && f.id).map((f) => ({ id: f.id!, name: f.name, size: f.size }));
    setFiles([]);
    void ask(question, mode, ready);
  };

  const newThread = () => {
    asked.current = false;
    load();
    setLocalId(crypto.randomUUID());
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
      follow();
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

  const onDecide = (turnId: string) => async (id: string, d: "approve" | "reject", e?: Record<string, unknown>) => {
    await decide(turnId, id, d, e);
    asked.current = true;
    setSaveTick((n) => n + 1);
  };

  const latest = turns.at(-1);

  // A run just ended: a soft chime for an answer, a low one for an error; nothing when the user pressed Stop.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && latest) {
      if (latest.error && latest.error !== "Stopped.") play("error");
      else if (latest.answer && !latest.error) play("answer");
    }
    wasBusy.current = busy;
  }, [busy, latest]);
  const suggestions = workspace === "demo" ? DEMO_SUGGESTIONS : LIVE_SUGGESTIONS;

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
      <div ref={scroller} className="h-full overflow-y-auto">
        <div ref={content} className="mx-auto w-full max-w-[720px] px-4 pt-10 pb-10 sm:px-6 md:pt-16">
          {!latest && (
            <div className="pt-[8vh]">
              <Greeting />
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                What do you need to know about your work? Cortex searches your {workspace === "demo" ? "sample " : ""}Gmail, Calendar, Drive, Notion, Slack and GitHub, cites every claim, and
                checks each one before you rely on it.
              </p>
              <ul className="mt-10 flex flex-col border-t border-line">
                {suggestions.map((s, i) => (
                  <li key={s} className="rise border-b border-line" style={{ "--i": i + 1 } as React.CSSProperties}>
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

          {turns.map((t, i) => (
            <section key={t.id} data-turn className={cn(i > 0 && "mt-12 border-t border-line pt-10")}>
              <TurnView turn={t} latest={t === latest} onDecide={onDecide(t.id)} onFollowup={submit} onRetry={busy ? undefined : () => submit(t.question)} />
            </section>
          ))}
        </div>
      </div>

        {/* Reading history while an answer streams: offer the way back instead of yanking the view down. */}
        <button
          type="button"
          onClick={toLatest}
          tabIndex={away ? 0 : -1}
          aria-hidden={!away}
          className={cn(
            "press absolute bottom-4 left-1/2 flex items-center gap-1.5 rounded-full border border-line-strong bg-surface py-1.5 pr-3.5 pl-3 text-[13px] text-ink-2 shadow-[0_4px_16px_-6px_rgb(14_17_22/0.18)] transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-ink",
            away ? "-translate-x-1/2 opacity-100" : "pointer-events-none -translate-x-1/2 translate-y-2 opacity-0",
          )}
        >
          <ArrowDown className="size-3.5" aria-hidden /> {busy ? "Follow the answer" : "Jump to latest"}
        </button>

        {turns.length > 1 && (
          <div className="absolute right-3 bottom-4 hidden flex-col overflow-hidden sm:flex rounded-[10px] border border-line bg-surface shadow-[0_4px_16px_-8px_rgb(14_17_22/0.16)] sm:right-5">
            {([
              [-1, ChevronUp, "Previous question", canPrev],
              [1, ChevronDown, "Next question", canNext],
            ] as const).map(([dir, Icon, label, enabled]) => (
              <button
                key={dir}
                type="button"
                onClick={() => step(dir)}
                disabled={!enabled}
                aria-label={`${label} (Alt+${dir < 0 ? "↑" : "↓"})`}
                title={`${label} (Alt+${dir < 0 ? "↑" : "↓"})`}
                className="press grid size-8 place-items-center text-muted hover:bg-shell hover:text-ink disabled:pointer-events-none disabled:text-line-strong [&+&]:border-t [&+&]:border-line"
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[720px] px-4 py-3 sm:px-6 sm:py-4">
          {latest?.done && latest.followups.length > 0 && !busy && (
            // Wrapping, never scrolling: every suggestion is fully readable, even at phone width.
            <div className="mb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Suggested next questions">
              {latest.followups.slice(0, 3).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => submit(f)}
                  className="press group flex max-w-full items-start gap-1.5 rounded-[14px] border border-line bg-surface py-1 pr-3 pl-2 text-left text-[13px] leading-[1.4] text-ink-2 transition-colors hover:border-accent/50 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  <CornerDownRight className="mt-[2px] size-3.5 shrink-0 text-hair transition-colors group-hover:text-accent" aria-hidden />
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
            attachments={files}
            onAttach={attach}
            onRemove={(key) => setFiles((all) => all.filter((a) => a.key !== key))}
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

/** "Good evening, Prathamesh": the hour is read in the browser, so it is the reader's own time of day. */
function Greeting() {
  const first = useUser().user?.firstName;
  const [part, setPart] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <h1 className="flex min-h-[1.1em] items-center gap-3 text-balance text-[38px] font-[400] leading-[1.1] tracking-[-0.015em] text-ink sm:text-[48px]">
      <Mark className="size-9 shrink-0 sm:size-11" />
      {part && (
        <span className="rise">
          {part}
          {first ? `, ${first}` : ""}
        </span>
      )}
    </h1>
  );
}
