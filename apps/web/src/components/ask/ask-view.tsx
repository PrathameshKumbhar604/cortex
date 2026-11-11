"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronRight, CornerDownRight } from "lucide-react";
import type { RunMode } from "@cortex/shared";
import { useAgent } from "@/lib/use-agent";
import { readThread, saveThread, setAutoTitle } from "@/lib/recent";
import { normalizeTurn } from "@/lib/versions";
import { useThreadScroll } from "@/lib/use-thread-scroll";
import { play } from "@/lib/sound";
import { cn } from "@/lib/ui";
import { Composer, type PendingFile } from "./composer";
import { uploadFile } from "@/lib/files";
import { toast } from "@/lib/toast";
import { TurnView } from "./turn-view";
import { Choices } from "./choices";
import { QuestionRail } from "./question-rail";
import { useUser } from "@clerk/nextjs";
import { Logo } from "./sources";
import { fetchConnections } from "@/lib/connections";
import { readVoice } from "@/lib/settings";
import type { VoiceLang } from "@/lib/voice";
import { VoiceEngine } from "../voice/engine";
import { VoiceButton, VoiceMode } from "../voice/voice-mode";

// The built-in library, used when no questions can be written from the person's own brief (no brief yet, models busy).
const DEMO_SUGGESTIONS = [
  "What changed in Orbit this week, and what's at risk?",
  "What's due in the next 7 days?",
  "Is anything blocking the beta?",
  "Draft a Slack update about the new Demo Day date",
  "Who is waiting on me for a reply?",
  "What did my advisor say about the thesis outline?",
  "Which pull requests need my review?",
  "Summarize this week's team discussions",
];

const LIVE_SUGGESTIONS = [
  "What changed in my projects this week?",
  "What's due in the next 7 days?",
  "Summarize unread emails that need a reply",
  "What's blocking my open pull requests?",
  "What meetings do I have tomorrow?",
  "Who is waiting on me for a reply?",
  "What did my team discuss in Slack today?",
  "Which deadlines moved recently?",
];

const pick = (list: string[]) => [...list].sort(() => Math.random() - 0.5).slice(0, 4);
const STARTERS_KEY = (workspace: string) => `cortex.starters.${workspace}`;

/**
 * Starter questions show at once, never a loading state: the ones written from the person's brief last time (kept in
 * this browser), else four from the built-in library. Fresh ones are fetched quietly for next time, so the list on
 * screen never jumps while someone reads it.
 */
function useStarters(workspace: "demo" | "live") {
  const [starters, setStarters] = useState<string[] | null>(null); // null for the first paint only (server and client agree)
  useEffect(() => {
    let saved: string[] | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STARTERS_KEY(workspace)) ?? "null");
    } catch {}
    setStarters(Array.isArray(saved) && saved.length ? saved : pick(workspace === "demo" ? DEMO_SUGGESTIONS : LIVE_SUGGESTIONS));
    fetch("/api/suggestions")
      .then((r) => (r.ok ? (r.json() as Promise<{ questions: string[] | null }>) : null))
      .then((d) => d?.questions?.length && localStorage.setItem(STARTERS_KEY(workspace), JSON.stringify(d.questions)))
      .catch(() => {});
  }, [workspace]);
  return starters;
}

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
  const { turns, busy, ask, regenerate, pickVersion, stop, decide, load, threadId } = useAgent();
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
  const { scroller, content, away, jumpTo, toLatest, follow } = useThreadScroll();

  useEffect(() => setMode(readMode()), []);
  const changeMode = (m: RunMode) => {
    setMode(m);
    try {
      localStorage.setItem("cortex.mode", m);
    } catch {}
  };

  const submit = (q: string, opts: { mode?: RunMode; language?: VoiceLang; reply?: boolean } = {}) => {
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
    void ask(question, opts.mode ?? mode, ready, opts.language, opts.reply);
  };

  // Voice mode: offered on a new thread only. Its turns are this chat's turns, so ending it leaves a normal chat.
  const [voiceOn, setVoiceOn] = useState<boolean | null>(null);
  const [voice, setVoice] = useState<{ engine: VoiceEngine; ready: Promise<void> } | null>(null);
  const refreshVoice = () =>
    void fetch("/api/voice/status")
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled: boolean }>) : null))
      .then((b) => b && setVoiceOn(b.enabled))
      .catch(() => {});
  const startVoice = () => {
    const engine = new VoiceEngine();
    const ready = engine.start(); // inside the click: what lets audio play on iOS
    ready.catch(() => {}); // the voice interface reports a refused mic
    void fetch(`/api/voice/status?warm=${readVoice().lang}`).catch(() => {}); // gets the speech model ready
    setVoice({ engine, ready });
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
      load(saved?.turns.map(normalizeTurn).map((x) => (x.done ? x : { ...x, done: true, error: x.error ?? "Stopped before it finished." })), saved?.serverThreadId);
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

  const retry = (turnId: string, question?: string) => {
    if (busy) return;
    follow();
    asked.current = true;
    play("send");
    void regenerate(turnId, question);
  };

  const switchVersion = (turnId: string, v: number) => {
    pickVersion(turnId, v);
    asked.current = true;
    setSaveTick((n) => n + 1);
  };

  const starters = useStarters(workspace);
  const latest = turns.at(-1);
  useEffect(() => {
    if (!latest) refreshVoice();
  }, [!latest]); // eslint-disable-line react-hooks/exhaustive-deps

  // A run just ended: a soft chime for an answer, a low one for an error; nothing when the user pressed Stop.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && latest) {
      if (latest.error && latest.error !== "Stopped.") play("error");
      else if (latest.answer && !latest.error) play("answer");
    }
    wasBusy.current = busy;
  }, [busy, latest]);

  const composer = (
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
      extra={!latest && voiceOn !== null && <VoiceButton enabled={voiceOn} onStart={startVoice} />}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {voice && (
        <VoiceMode
          engine={voice.engine}
          ready={voice.ready}
          turns={turns}
          busy={busy}
          onAsk={(q, language) => submit(q, { mode: "fast", language })}
          onDecide={onDecide}
          files={files}
          onAttach={attach}
          onRemove={(key) => setFiles((all) => all.filter((a) => a.key !== key))}
          onUnavailable={refreshVoice}
          onEnd={() => setVoice(null)}
        />
      )}
      <div className="relative min-h-0 flex-1">
      <div ref={scroller} className="h-full overflow-y-auto">
        <div
          ref={content}
          className={cn("mx-auto w-full max-w-[720px] px-4 pt-10 pb-10 sm:px-6 md:pt-16", !latest && "flex min-h-full flex-col justify-center pb-[14vh] md:pt-10")}
        >
          {!latest && (
            <div>
              <Greeting workspace={workspace} />
              <div className="mt-8">{composer}</div>
              <ul className="mt-6 flex flex-col">
                {starters?.map((s, i) => (
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
            // Keyed by position: a regenerated turn keeps its place (and the navigator its marker) while its attempt id changes.
            <section key={i} data-turn className={cn(i > 0 && (t.reply ? "mt-3" : "mt-12 border-t border-line pt-10"))}>
              <TurnView
                key={t.id}
                turn={t}
                chatId={localId}
                latest={t === latest}
                onDecide={onDecide(t.id)}
                onFollowup={submit}
                onRetry={busy ? undefined : () => retry(t.id)}
                onEdit={busy ? undefined : (q) => retry(t.id, q)}
                onVersion={(v) => switchVersion(t.id, v)}
              />
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

        {/* Long threads: one tick per question on the right edge; Alt+↑ / Alt+↓ step between them. */}
        <QuestionRail questions={turns.map((t) => t.question)} scroller={scroller} content={content} onJump={jumpTo} />
      </div>

      {latest && (
        <div className="border-t border-line bg-surface/90 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-[720px] px-4 py-3 sm:px-6 sm:py-4">
            {latest.done && !busy && latest.needsDetails && latest.options?.length ? (
              <Choices key={latest.id} question={latest.answer} options={latest.options} onPick={(a) => submit(a, { reply: true })} />
            ) : null}
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
            {composer}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Good evening, Prathamesh": the hour is read in the browser, so it is the reader's own time of day. */
const HEADLINE_KEY = (workspace: string) => `cortex.headline.${workspace}`;

/**
 * Cortex's own opening: a status line (today, the apps it is reading live) and a headline about the person's actual
 * work, taken from their saved brief; the greeting alone when there is no brief yet. Everything shows from what this
 * browser already has, then refreshes quietly.
 */
function Greeting({ workspace }: { workspace: "demo" | "live" }) {
  const first = useUser().user?.firstName;
  const [now, setNow] = useState<{ date: string; part: string } | null>(null);
  const [apps, setApps] = useState<string[]>([]);
  const [headline, setHeadline] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    setNow({
      date: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
      part: h < 5 ? "Working late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening",
    });
    try {
      setHeadline(localStorage.getItem(HEADLINE_KEY(workspace)));
    } catch {}
    fetchConnections<{ connectors: { id: string; kind?: string; connected: boolean }[] }>()
      .then((c) => c && setApps(c.connectors.filter((x) => x.connected && x.kind !== "upload" && x.id !== "web").map((x) => x.id)))
      .catch(() => {});
    fetch("/api/brief")
      .then((r) => (r.ok ? (r.json() as Promise<{ brief: { headline: string; cards: unknown[] } | null }>) : null))
      .then((d) => {
        if (!d?.brief?.cards.length) return;
        setHeadline(d.brief.headline);
        localStorage.setItem(HEADLINE_KEY(workspace), d.brief.headline);
      })
      .catch(() => {});
  }, [workspace]);
  if (!now) return <div className="h-[92px]" aria-hidden />;
  return (
    <div className="rise">
      <p className="flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.08em] text-muted">
        <span>{now.date}</span>
        {apps.length > 0 && (
          <>
            <span aria-hidden className="text-hair">/</span>
            <span className="flex -space-x-1" aria-hidden>
              {apps.slice(0, 6).map((id) => (
                <Logo key={id} source={id} className="size-4 ring-2 ring-surface" />
              ))}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="relative inline-flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
                <span className="relative size-1.5 rounded-full bg-ok" />
              </span>
              {workspace === "demo" ? "Sample" : `${apps.length} live`}
            </span>
          </>
        )}
      </p>
      <h1 className="mt-3 text-balance text-[32px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[40px]">
        {now.part}
        {first ? `, ${first}` : ""}.
      </h1>
      {headline && <p className="mt-2 max-w-[58ch] text-pretty text-[16px] leading-relaxed text-muted">{headline}</p>}
    </div>
  );
}
