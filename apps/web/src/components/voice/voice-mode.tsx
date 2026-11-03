"use client";

import { ArrowUp, AudioLines, FileText, Loader2, Mic, MicOff, Paperclip, Square, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ActionProposal } from "@cortex/shared";
import type { Turn } from "@/lib/use-agent";
import { formatSize } from "@/lib/files";
import { readVoice } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/ui";
import { LANGS, PERSONAS, PHRASES, persona, SpokenReply, voiceQuestion, type VoiceGender, type VoiceLang } from "@/lib/voice";
import { ActionCard } from "../ask/action-card";
import type { PendingFile } from "../ask/composer";
import { Logo, Sources } from "../ask/sources";
import { VoiceEngine } from "./engine";
import { Fold, type FoldState } from "./fold";

type Phase = "starting" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking" | "approval";

const LABEL: Record<Phase, string> = {
  starting: "Starting",
  listening: "Listening",
  hearing: "Hearing you",
  transcribing: "Got it",
  thinking: "Thinking",
  speaking: "Speaking",
  approval: "Waiting for your approval",
};

// Chromium's live recognizer gives instant (rough) captions while the user talks. Only a preview: the words that are
// sent come from the server's speech-to-text. Not on phones, where it fights getUserMedia for the mic.
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  abort(): void;
}
const recognizerCtor = () =>
  typeof window !== "undefined" && !/Android|iPhone|iPad/i.test(navigator.userAgent)
    ? ((window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognizer }).webkitSpeechRecognition)
    : undefined;

export interface VoiceModeProps {
  engine: VoiceEngine;
  /** Resolves once the mic is open; rejects when it was refused. */
  ready: Promise<void>;
  turns: Turn[];
  busy: boolean;
  /** Asks the question as a normal chat turn (fast mode, answered in `lang`), with the files attached so far. */
  onAsk: (question: string, lang: VoiceLang) => void;
  onDecide: (turnId: string) => (id: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void>;
  files: PendingFile[];
  onAttach: (files: File[]) => void;
  onRemove: (key: string) => void;
  /** Voice mode became unavailable (credits ran out): the opener refreshes its button. */
  onUnavailable: () => void;
  onEnd: () => void;
}

/**
 * Voice mode: a hands-free conversation. Listen → the user talks → a pause ends the turn → think → speak → listen.
 * Talking over Cortex interrupts it. Every turn is a normal chat turn, so ending the conversation leaves the chat.
 */
export function VoiceMode({ engine, ready, turns, busy, onAsk, onDecide, files, onAttach, onRemove, onUnavailable, onEnd }: VoiceModeProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(readVoice);
  const [replyVoice, setReplyVoice] = useState(voice); // who is answering now (a switch applies from the next reply)
  const [userText, setUserText] = useState("");
  const [live, setLive] = useState("");
  const [said, setSaid] = useState<string[]>([]);
  const [turnIndex, setTurnIndex] = useState<number | null>(null);
  const [sheetAt, setSheetAt] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const reduce = useReducedMotion();

  // Mutable session state the audio callbacks read (they outlive renders).
  const s = useRef({ phase, muted, voice, turnIndex, turns, busy, reply: null as SpokenReply | null, replyLang: "en" as VoiceLang, silenced: false, doneFor: "", queued: null as string | null, decided: "", warned: false });
  useLayoutEffect(() => void Object.assign(s.current, { phase, muted, voice, turnIndex, turns, busy }));

  const turn = turnIndex === null ? undefined : turns[turnIndex];
  const pending = turn?.actions.find((a) => a.status === "pending" || a.status === "approved");
  const p = persona(voice.lang, voice.gender);

  // The parent's callbacks change every render; the audio callbacks read the latest through this.
  const cb = useRef({ onAsk, onUnavailable, onEnd });
  useLayoutEffect(() => void (cb.current = { onAsk, onUnavailable, onEnd }));

  const say = useCallback((text: string) => engine.speak(text), [engine]);
  const toListening = useCallback(() => {
    engine.setListening(!s.current.muted);
    setPhase("listening");
  }, [engine]);

  // ---- asking ----
  const ask = useCallback(
    (q: string) => {
      const st = s.current;
      if (st.busy) return void (st.queued = q); // the previous answer is still being written: ask when it's done
      st.queued = null;
      st.reply = new SpokenReply(st.voice.lang);
      st.replyLang = st.voice.lang;
      st.silenced = false;
      st.doneFor = "";
      engine.setVoice(st.voice.lang, st.voice.gender); // a voice switched mid-answer applies from this reply on
      setTurnIndex(st.turns.length);
      setReplyVoice(st.voice);
      setSaid([]);
      setPhase("thinking");
      cb.current.onAsk(q, st.voice.lang);
    },
    [engine],
  );
  useEffect(() => {
    if (!busy && s.current.queued) ask(s.current.queued);
  }, [busy, ask]);

  // ---- engine events ----
  const recog = useRef<Recognizer | null>(null);
  useEffect(() => {
    const st = s.current;
    const stopRecog = () => {
      recog.current?.abort();
      recog.current = null;
    };
    engine.setHandlers({
      onSpeechStart(bargeIn) {
        if (bargeIn || st.phase === "speaking" || st.phase === "thinking") st.silenced = true; // the rest of that answer stays on screen, unspoken
        setLive("");
        setPhase("hearing");
        const Ctor = recognizerCtor();
        if (Ctor && !recog.current) {
          try {
            const r = new Ctor();
            r.continuous = true;
            r.interimResults = true;
            r.lang = LANGS.find((l) => l.id === st.voice.lang)!.bcp47;
            r.onresult = (e) => setLive([...e.results].map((x) => x[0]?.transcript ?? "").join(" "));
            r.onerror = stopRecog;
            r.start();
            recog.current = r;
          } catch {
            recog.current = null;
          }
        }
      },
      onDiscard() {
        stopRecog();
        setLive("");
        if (st.busy) setPhase("thinking");
        else toListening();
      },
      async onUtterance(wav) {
        stopRecog();
        setPhase("transcribing");
        const form = new FormData();
        form.set("audio", wav, "turn.wav");
        form.set("lang", st.voice.lang);
        const res = await fetch("/api/voice/stt", { method: "POST", body: form }).catch(() => null);
        const body = ((await res?.json().catch(() => null)) ?? {}) as { text?: string; exhausted?: boolean; error?: string };
        if (body.exhausted) cb.current.onUnavailable();
        const q = voiceQuestion(body.text ?? "");
        setLive("");
        if (!q) {
          setUserText(res?.ok ? "Sorry, I didn't catch that." : (body.error ?? "Couldn't hear that. Try again."));
          if (st.busy) setPhase("thinking");
          else toListening();
          return;
        }
        setUserText(q);
        ask(q);
      },
      onSentence(text) {
        if (st.phase !== "approval" && st.phase !== "hearing") setPhase("speaking");
        setSaid((all) => [...all, text]);
      },
      onIdle() {
        const t = st.turnIndex === null ? undefined : st.turns[st.turnIndex];
        if (st.phase === "approval" || st.phase === "hearing" || st.phase === "transcribing") return;
        if (!t || t.done) toListening();
        else setPhase("thinking");
      },
      onFallback(why) {
        if (why !== "exhausted" || st.warned) return;
        st.warned = true;
        toast("Voice mode is using a backup voice", { body: "The usual voices aren't available right now, so this conversation continues with your browser's voice." });
        cb.current.onUnavailable();
      },
    });
  }, [engine, ask, toListening]);
  useEffect(() => () => recog.current?.abort(), []);

  // Open the mic; a refusal ends the session with a note on how to allow it.
  useEffect(() => {
    let gone = false;
    ready.then(
      () => !gone && toListening(),
      () => {
        if (gone) return;
        toast("Voice mode needs the microphone", { body: "Allow microphone access for this site, then try again.", tone: "warn" });
        cb.current.onEnd();
      },
    );
    return () => {
      gone = true;
    };
  }, [ready, toListening]);

  // Leaving the page closes the mic. Deferred a tick: React's development double-mount must not close a live session.
  const closing = useRef(0);
  useEffect(() => {
    clearTimeout(closing.current);
    return () => void (closing.current = window.setTimeout(() => engine.close(), 0));
  }, [engine]);

  // ---- following the answer ----
  useEffect(() => {
    const st = s.current;
    const t = turn;
    if (!t || !st.reply) return;
    const action = t.route?.route === "action";
    if (!st.silenced && !action) for (const line of st.reply.next(t.answer, t.done)) say(line);
    if (!t.done || st.doneFor === t.id) return;
    st.doneFor = t.id;
    const waiting = t.actions.some((a) => a.status === "pending");
    if (waiting) {
      engine.setListening(false);
      setPhase("approval");
      if (!st.silenced) say(PHRASES.approval[st.replyLang]);
      return;
    }
    if (action && !st.silenced && t.answer) for (const line of st.reply.next(t.answer, true)) say(line); // it asks for a missing detail
    if (t.error && !t.answer && !st.silenced) say(PHRASES.sorry[st.replyLang]);
    if (!engine.speaking && st.phase !== "hearing" && st.phase !== "transcribing") toListening();
  }, [turn, engine, say, toListening]);

  // An approval was decided (here, or on the card): say how it went, then listen again.
  useEffect(() => {
    const st = s.current;
    if (phase !== "approval" || !turn || pending) return;
    const decided = turn.actions.find((a) => a.status === "executed" || a.status === "failed" || a.status === "rejected");
    if (!decided || st.decided === decided.id + decided.status) return;
    st.decided = decided.id + decided.status;
    st.silenced = false;
    say(PHRASES[decided.status === "executed" ? "done" : decided.status === "failed" ? "failed" : "declined"][st.replyLang]);
    toListening();
  }, [phase, turn, pending, say, toListening]);

  // ---- controls ----
  const interrupt = useCallback(() => {
    s.current.silenced = true;
    engine.stopSpeaking();
    toListening();
  }, [engine, toListening]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    s.current.muted = next;
    if (next) engine.cancelTurn();
    if (phase !== "approval") engine.setListening(!next);
    if (next && phase === "hearing") toListening();
  };

  const end = useCallback(() => {
    engine.close();
    cb.current.onEnd();
  }, [engine]);

  const pickVoice = (lang: VoiceLang, gender: VoiceGender) => setVoice({ lang, gender });

  // Space: interrupt, send, or hold to talk. Esc ends (unless a sheet inside is open: Esc closes that first).
  useEffect(() => {
    // Space is the talk key anywhere in voice mode (a focused language or voice button must not switch on it), except
    // while typing, and on the approval card and the sources sheet, where it presses the focused button as usual.
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable], [data-approval], dialog");
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        end();
      }
      if (e.key !== " " || e.repeat || typing(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const ph = s.current.phase;
      if (ph === "speaking") interrupt();
      else if (ph === "hearing" && engine.hearing) engine.finish();
      else if (ph === "listening" && !s.current.muted) engine.hold(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== " " || typing(e.target)) return;
      e.preventDefault();
      engine.hold(false);
    };
    const paste = (e: ClipboardEvent) => {
      const picked = [...(e.clipboardData?.files ?? [])];
      if (picked.length && !typing(e.target)) {
        e.preventDefault();
        onAttach(picked);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("paste", paste);
    };
  }, [engine, end, interrupt, onAttach]);

  // Focus lands on the main control and stays inside the dialog.
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (phase !== "listening" || focused.current) return; // the talk button is disabled until the mic is open
    focused.current = true;
    root.current?.querySelector<HTMLElement>("[data-talk]")?.focus();
  }, [phase]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, []);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !root.current) return;
    const f = [...root.current.querySelectorAll<HTMLElement>("button:not(:disabled), select, input:not([hidden]), [href]")].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]!;
    const last = f.at(-1)!;
    const to = e.shiftKey && document.activeElement === first ? last : !e.shiftKey && document.activeElement === last ? first : null;
    if (to) {
      e.preventDefault();
      to.focus();
    }
  };

  const levels = useCallback(() => engine.levels(), [engine]);
  const foldState: FoldState = phase === "starting" ? "starting" : phase === "approval" || muted ? "paused" : phase === "transcribing" ? "thinking" : phase;
  const cited = useMemo(() => {
    const out: { n: number; id: string; source: string; title: string }[] = [];
    for (const m of (turn?.answer ?? "").matchAll(/\[(\d+)\]/g)) {
      const n = Number(m[1]);
      const e = turn!.evidence[n - 1];
      if (e && !out.some((x) => x.n === n)) out.push({ n, id: e.id, source: e.source, title: e.title });
    }
    return out.sort((a, b) => a.n - b.n);
  }, [turn]);
  const citedIds = useMemo(() => new Set(cited.map((c) => c.id)), [cited]);
  // The apps Cortex is searching for this turn, lit once their results are back.
  const searching = useMemo(() => {
    if (phase !== "thinking" || !turn) return [];
    const by = new Map<string, boolean>();
    for (const c of turn.tools) by.set(c.source, (by.get(c.source) ?? false) || c.count !== undefined);
    return [...by].slice(0, 7).map(([id, lit]) => ({ id, lit }));
  }, [phase, turn]);
  const status = muted && phase !== "approval" ? "Mic off" : LABEL[phase];
  const hint =
    phase === "listening" && !muted
      ? "Talk whenever you're ready. A pause sends it."
      : phase === "hearing"
        ? "Take your time. A pause sends it."
        : phase === "speaking"
          ? "Start talking to interrupt."
          : phase === "approval"
            ? "Nothing happens until you choose."
            : phase === "thinking" && searching.length
              ? `Searching ${searching.length} app${searching.length === 1 ? "" : "s"}`
              : "";
  const uploading = files.some((f) => f.status === "uploading");
  const langName = LANGS.find((l) => l.id === voice.lang)!.label;
  const tint = `light-dark(${p.color[0]}, ${p.color[1]})`;
  const rp = persona(replyVoice.lang, replyVoice.gender);

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={trap}
      initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
      transition={{ type: "spring", duration: 0.45, bounce: 0 }}
      className="fixed inset-0 z-[55] flex flex-col bg-shell text-ink"
    >
      {/* Header: what this is, which voice, and the way out. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:px-6">
        <h2 id={titleId} className="flex items-center gap-2.5 font-serif text-[22px] font-[450] leading-none tracking-[-0.01em]">
          Voice
          <span className="readout rounded-full border border-line-strong px-2 py-0.5 font-sans text-[10.5px] text-muted">Experimental</span>
        </h2>
        <div className="order-3 w-full sm:order-none sm:ml-auto sm:w-auto">
          <VoicePicker voice={voice} onPick={pickVoice} />
        </div>
        <button type="button" onClick={end} aria-label="End voice conversation" title="End (Esc)" className="ml-auto grid size-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink sm:ml-0">
          <X className="size-[18px]" aria-hidden />
        </button>
      </header>

      {/* The mark, alive; beside it (below on phones) the conversation as a transcript. */}
      <main className="relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden px-4 pt-8 sm:px-6 lg:mx-auto lg:w-full lg:max-w-[1080px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-1 lg:items-center lg:gap-14 lg:pt-0">
        <div className="flex flex-col items-center gap-6 lg:gap-8">
          <Fold state={foldState} levels={levels} color={p.color} sources={searching} />
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="readout flex items-center gap-2 text-ink-2">
              <span className={cn("size-1.5 rounded-full", (phase === "hearing" || phase === "speaking" || phase === "thinking") && "voice-dot-live")} style={{ background: tint }} aria-hidden />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={status}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(3px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                >
                  {status}
                </motion.span>
              </AnimatePresence>
              <span className="text-hair">
                · {langName} · {p.name}
              </span>
            </p>
            <p className="min-h-[1.45em] text-[13px] text-muted">{hint}</p>
          </div>
        </div>

        <Transcript user={phase === "hearing" ? live : userText} hearing={phase === "hearing"} said={said} speaker={rp.name} tint={`light-dark(${rp.color[0]}, ${rp.color[1]})`} cited={cited} onCite={(id) => setSheetAt(id)} />

        <AnimatePresence>
          {phase === "approval" && pending && turn && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(16px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: reduce ? "none" : "translateY(8px)", transition: { duration: 0.18 } }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="absolute inset-x-4 bottom-3 z-10 mx-auto max-w-[540px] rounded-[14px] lg:right-6 lg:left-auto lg:w-[min(540px,50%)] border border-line-strong bg-surface px-1 pb-1 shadow-[0_18px_44px_-18px_rgb(14_17_22/0.35)] sm:inset-x-6"
              role="group"
              aria-label="Approve this action"
              data-approval
            >
              <p className="readout px-4 pt-3.5 text-muted">Needs your approval</p>
              <ApprovalCard proposal={pending} onDecide={onDecide(turn.id)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Controls. */}
      <footer className="flex flex-col items-center gap-3 border-t border-line bg-surface/80 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-6">
        {files.length > 0 && (
          <ul className="flex max-w-full flex-wrap justify-center gap-1.5" aria-label="Attached to your next question">
            {files.map((a) => (
              <li key={a.key} title={a.error} className={cn("enter flex max-w-[220px] items-center gap-1.5 rounded-[8px] border py-1 pr-1 pl-2 text-[12.5px]", a.status === "error" ? "border-risk/40 bg-risk-soft text-risk" : "border-line bg-surface text-ink-2")}>
                {a.status === "uploading" ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : <FileText className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-hair">{a.status === "error" ? "failed" : formatSize(a.size)}</span>
                <button type="button" onClick={() => onRemove(a.key)} aria-label={`Remove ${a.name}`} className="grid size-5 shrink-0 place-items-center rounded-[5px] hover:bg-hover">
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid w-full max-w-[560px] grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2">
            <RoundButton label={muted ? "Turn the mic on" : "Turn the mic off"} pressed={muted} onClick={toggleMute}>
              {muted ? <MicOff className="size-[18px]" aria-hidden /> : <Mic className="size-[18px]" aria-hidden />}
            </RoundButton>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onAttach([...e.target.files]);
                e.target.value = "";
              }}
            />
            <RoundButton label={uploading ? "Attaching…" : "Attach files to your next question"} onClick={() => picker.current?.click()}>
              <Paperclip className="size-[18px]" aria-hidden />
            </RoundButton>
          </div>
          <TalkButton phase={phase} muted={muted} engine={engine} onInterrupt={interrupt} />
          <div className="flex items-center justify-end gap-2">
            {turn && turn.evidence.length > 0 && <Sources evidence={turn.evidence} citedIds={citedIds} query={turn.question} at={sheetAt} onAt={setSheetAt} className="hidden md:flex" />}
            <button type="button" onClick={end} className="h-10 rounded-full border border-line-strong bg-surface px-4 text-[13.5px] font-[550] text-ink hover:bg-hover">
              End
            </button>
          </div>
        </div>
        <p className="readout hidden text-[11px] text-hair sm:block">Space to talk, send or interrupt · Esc to end</p>
      </footer>

      {/* What a screen reader hears: state changes and each finished line, politely. */}
      <div className="sr-only" aria-live="polite">
        {status}. {phase === "speaking" ? said.at(-1) : phase === "thinking" && userText ? `You said: ${userText}` : ""}
      </div>
    </motion.div>
  );
}

/**
 * The conversation as a calm editorial transcript: what the user said, then Cortex's reply line by line as it is
 * spoken (the current line in ink, earlier ones muted), and the sources it cited as numbered chips that open the sheet.
 */
function Transcript({ user, hearing, said, speaker, tint, cited, onCite }: { user: string; hearing: boolean; said: string[]; speaker: string; tint: string; cited: { n: number; id: string; source: string; title: string }[]; onCite: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => void box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }), [said.length, user]); // scrollTo returns a promise in newer browsers
  if (!user && !said.length) return <div aria-hidden />;
  return (
    <div ref={box} className="mx-auto w-full max-w-[600px] self-stretch overflow-y-auto pb-6 lg:max-h-[62vh] lg:self-center">
      {user && (
        <section className="border-t border-line pt-3">
          <p className="readout text-hair">You</p>
          <p className={cn("mt-1.5 text-[15px] leading-relaxed", hearing ? "text-ink-2" : "text-muted")}>{user}</p>
        </section>
      )}
      {!hearing && said.length > 0 && (
        <section className="mt-5 border-t border-line pt-3">
          <p className="readout" style={{ color: tint }}>
            {speaker}
          </p>
          <p className="mt-1.5 text-[18px] leading-[1.6] tracking-[-0.005em] lg:text-[19px]">
            {said.map((line, i) => (
              <span key={i} className={cn("transition-colors duration-500", i < said.length - 1 ? "text-muted" : "text-ink")}>
                {line}{" "}
              </span>
            ))}
          </p>
          {cited.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sources cited">
              {cited.map((c) => (
                <li key={c.n}>
                  <button type="button" onClick={() => onCite(c.id)} title={c.title} className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-1 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">
                    <Logo source={c.source} className="size-4" />
                    <span className="readout text-[11px] text-accent-ink">{c.n}</span>
                    <span className="truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Language, then voice. Takes effect from the next reply; the conversation carries on. */
function VoicePicker({ voice, onPick }: { voice: { lang: VoiceLang; gender: VoiceGender }; onPick: (l: VoiceLang, g: VoiceGender) => void }) {
  const p = persona(voice.lang, voice.gender);
  return (
    <div className="relative flex flex-col items-center gap-2 px-4 pt-1">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Segmented label="Language" value={voice.lang} options={LANGS.map((l) => ({ value: l.id, label: l.native, title: l.label }))} onChange={(l) => onPick(l, voice.gender)} />
        <Segmented
          label="Voice"
          value={voice.gender}
          options={PERSONAS.filter((x) => x.lang === voice.lang).map((x) => ({ value: x.gender, label: x.name, title: `${x.name}: ${x.character}`, dot: x.color }))}
          onChange={(g) => onPick(voice.lang, g)}
        />
      </div>
      <p className="max-w-[44ch] text-center text-[12.5px] text-muted" aria-live="polite">
        {p.character}
      </p>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; title: string; dot?: [string, string] }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-full border border-line bg-surface/70 p-0.5 backdrop-blur-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn("relative flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors", value === o.value ? "font-[550] text-ink" : "text-muted hover:text-ink")}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-pressed" transition={{ type: "spring", duration: 0.35, bounce: 0.2 }} />}
          {o.dot && <span className="relative size-2 rounded-full" style={{ background: `light-dark(${o.dot[0]}, ${o.dot[1]})` }} aria-hidden />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function ApprovalCard({ proposal, onDecide }: { proposal: ActionProposal; onDecide: (id: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void> }) {
  return (
    <div className="-mt-5 [&>div]:border-0 [&>div]:bg-transparent">
      <ActionCard proposal={proposal} onDecide={(d, e) => onDecide(proposal.id, d, e)} />
    </div>
  );
}

function RoundButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn("grid size-10 place-items-center rounded-full border transition-colors", pressed ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}
    >
      {children}
    </button>
  );
}

/** One control for the moment: hold to talk while listening, send while talking, interrupt while Cortex speaks. */
function TalkButton({ phase, muted, engine, onInterrupt }: { phase: Phase; muted: boolean; engine: VoiceEngine; onInterrupt: () => void }) {
  const speaking = phase === "speaking";
  const hearing = phase === "hearing";
  const label = speaking ? "Interrupt" : hearing ? "Send now" : phase === "listening" ? "Hold to talk" : phase === "approval" ? "Waiting for approval" : "Working";
  const disabled = muted || phase === "approval" || phase === "starting" || phase === "transcribing";
  return (
    <button
      type="button"
      data-talk
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        if (phase !== "listening" || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        engine.hold(true);
      }}
      onPointerUp={() => phase === "listening" || engine.hearing ? engine.hold(false) : undefined}
      onClick={() => (speaking || phase === "thinking" ? onInterrupt() : hearing ? engine.finish() : undefined)}
      onKeyDown={(e) => e.key === " " && e.preventDefault()} // Space is handled for the whole dialog
      className="grid size-14 place-items-center rounded-full bg-ink text-on-ink shadow-[0_10px_28px_-14px_rgb(14_17_22/0.5)] hover:bg-ink-2 disabled:opacity-35"
    >
      {speaking || phase === "thinking" ? <Square className="size-5 fill-current" aria-hidden /> : hearing ? <ArrowUp className="size-6" aria-hidden /> : <Mic className="size-6" aria-hidden />}
    </button>
  );
}

/** The Voice mode button beside the composer controls on an empty Ask screen. */
export function VoiceButton({ enabled, onStart }: { enabled: boolean | null; onStart: () => void }) {
  const tip = useId();
  const off = enabled === false;
  return (
    <span className="group relative">
      <button
        type="button"
        aria-label="Voice mode"
        aria-disabled={off}
        aria-describedby={tip}
        onClick={() => (off ? toast("Voice mode is unavailable at the moment", { body: "Type your question for now. Voice mode will be back soon." }) : onStart())}
        className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] transition-colors", off ? "cursor-not-allowed text-hair" : "text-muted hover:bg-hover hover:text-ink")}
      >
        <AudioLines className="size-4" aria-hidden />
        <span className="hidden sm:inline">Voice</span>
      </button>
      <span
        id={tip}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] leading-snug text-ink-2 opacity-0 shadow-[0_12px_32px_-16px_rgb(14_17_22/0.3)] transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {off ? "Voice mode is unavailable at the moment" : "Voice mode (experimental): talk with Cortex hands-free"}
      </span>
    </span>
  );
}
