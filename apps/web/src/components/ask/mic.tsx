"use client";

import { Check, Mic, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/ui";

// lib.dom ships the result types but not the (still prefixed in Chromium/Safari) recognizer itself.
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone is blocked. Allow it in your browser's site settings, then try again.",
  "service-not-allowed": "This browser doesn't allow speech recognition here.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs an internet connection, and isn't offered by every browser.",
};

const noop = () => () => {};

type Phase = "idle" | "listening" | "review";

/** Dictation and quick voice notes, Granola-style: a calm live transcript, then insert it or turn it into notes.
 *  Uses the browser's built-in SpeechRecognition (free, no key); hidden where the browser lacks it. */
export function useMic(onInsert: (text: string) => void, onNotes: (transcript: string) => void) {
  const supported = useSyncExternalStore(noop, () => !!recognizerCtor() && !!navigator.mediaDevices?.getUserMedia, () => false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [final, setFinal] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(0);
  const rec = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const wanted = useRef(false);

  const release = () => {
    wanted.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
  };
  useEffect(() => () => {
    rec.current?.abort();
    release();
  }, []);

  const start = async () => {
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    setError("");
    setFinal("");
    setInterim("");
    try {
      // Asked only here, on the click; also feeds the level meter.
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(ERRORS["not-allowed"]);
      return;
    }
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream.current).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (audio.current !== ctx) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        bars.current.forEach((b, i) => {
          if (b) b.style.transform = `scaleY(${0.3 + level * (0.7 - Math.abs(i - 2) * 0.18)})`;
        });
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter is decoration; dictation still works without it */
    }
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let done = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) done += text;
        else live += text;
      }
      if (done) setFinal((f) => `${f} ${done.trim()}`.trim());
      setInterim(live.trim());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setPhase("idle");
      setError(ERRORS[e.error] ?? "Dictation stopped unexpectedly. Try again.");
    };
    // Browsers end a session after a pause; keep listening until the person says stop.
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          /* fall through to stop */
        }
      }
      release();
      setInterim("");
      setPhase((p) => (p === "listening" ? "review" : p));
    };
    rec.current = r;
    wanted.current = true;
    setStarted(Date.now());
    setPhase("listening");
    r.start();
  };

  const stop = () => {
    wanted.current = false;
    rec.current?.stop();
  };
  const close = () => {
    wanted.current = false;
    rec.current?.abort();
    release();
    setPhase("idle");
    setFinal("");
    setInterim("");
  };

  const button = supported ? (
    <button
      type="button"
      onClick={phase === "listening" ? stop : start}
      aria-label={phase === "listening" ? "Stop listening" : "Dictate or take voice notes"}
      aria-pressed={phase === "listening"}
      title={phase === "listening" ? "Stop listening" : "Dictate or take voice notes"}
      className={cn("grid size-8 place-items-center rounded-lg transition-colors", phase === "listening" ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-hover hover:text-ink")}
    >
      <Mic className="size-4" aria-hidden />
    </button>
  ) : null;

  const panel =
    phase !== "idle" || error ? (
      <div
        className="enter mx-3 mt-3 rounded-[10px] border border-line bg-shell px-3 py-2.5"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (phase === "listening") stop();
            else close();
          }
        }}
      >
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          {phase === "listening" ? (
            <>
              <span className="flex h-3.5 items-center gap-[2px]" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      bars.current[i] = el;
                    }}
                    className="h-full w-[3px] origin-center scale-y-[0.3] rounded-full bg-accent transition-transform duration-75"
                  />
                ))}
              </span>
              <span role="status" className="font-medium text-ink-2">
                Listening
              </span>
              <Elapsed since={started} />
              <button type="button" onClick={stop} className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-ink-2 hover:bg-hover hover:text-ink">
                <Square className="size-2.5 fill-current" aria-hidden /> Stop
              </button>
            </>
          ) : phase === "review" ? (
            <>
              <span role="status" className="font-medium text-ink-2">
                {final ? "Transcript ready" : "Didn't catch anything"}
              </span>
              <button type="button" onClick={close} aria-label="Discard transcript" className="ml-auto grid size-6 place-items-center rounded-md hover:bg-hover hover:text-ink">
                <X className="size-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <span role="alert" className="text-risk">
                {error}
              </span>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss" className="ml-auto grid size-6 shrink-0 place-items-center rounded-md hover:bg-hover hover:text-ink">
                <X className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
        {phase !== "idle" && (
          <p aria-label="Live transcript" className="mt-1.5 max-h-28 overflow-y-auto text-[14px] leading-relaxed text-ink-2">
            {final || interim ? (
              <>
                {final} <span className="text-hair">{interim}</span>
              </>
            ) : (
              <span className="text-hair">{phase === "listening" ? "Start talking. Your words appear here." : "Try again closer to the mic."}</span>
            )}
          </p>
        )}
        {phase === "review" && final && (
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              autoFocus
              onClick={() => {
                onInsert(final);
                close();
              }}
              className="flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink"
            >
              <Check className="size-3.5" aria-hidden /> Use as message
            </button>
            <button
              type="button"
              onClick={() => {
                onNotes(final);
                close();
              }}
              className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[12.5px] text-on-ink hover:bg-accent-ink"
            >
              <Sparkles className="size-3.5" aria-hidden /> Summarise into notes
            </button>
          </div>
        )}
      </div>
    ) : null;

  return { button, panel, listening: phase === "listening" };
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}
