"use client";

import { Check, Loader2, Mic, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "@/lib/toast";
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

const SEGMENT_MS = 30_000; // each chunk is its own file, so the transcript grows during long sessions
const HEARD = 0.12; // meter level that counts as speech; silent chunks are skipped (Whisper invents words in silence)
const noop = () => () => {};
// Errors are passing notices: shown as a toast, not in the composer.
const warn = (title: string, body?: string) => void toast(title, { body, tone: "warn", ms: 8000 });

type Phase = "idle" | "listening" | "transcribing" | "review";
interface Segment {
  rec: MediaRecorder;
  heard: boolean;
}

/** Dictation and quick voice notes, Granola-style: a calm live transcript, then insert it or turn it into notes.
 *  Records with MediaRecorder and transcribes on the server (/api/transcribe, Groq Whisper), so it works in every
 *  modern browser. Where the browser has SpeechRecognition it only feeds a live grey preview; the server text is final. */
export function useMic(onInsert: (text: string) => void, onNotes: (transcript: string) => void) {
  const supported = useSyncExternalStore(noop, () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia, () => false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [parts, setParts] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [started, setStarted] = useState(0);
  const speech = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const seg = useRef<Segment | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef(false);
  const run = useRef(0); // bumps on every start/close, so late answers from a discarded session are ignored
  const pending = useRef(0);
  const heardFinal = useRef("");

  const release = () => {
    live.current = false;
    clearInterval(timer.current);
    const r = speech.current;
    speech.current = null;
    r?.abort();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
  };
  useEffect(
    () => () => {
      run.current++;
      if (seg.current?.rec.state === "recording") seg.current.rec.stop();
      release();
    },
    [],
  );

  const settle = (id: number) => {
    if (id !== run.current || live.current || pending.current) return;
    setPreview("");
    setPhase((p) => (p === "transcribing" ? "review" : p));
  };

  const send = async (blob: Blob, index: number, id: number) => {
    pending.current++;
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.set("audio", blob, `speech.${ext}`);
      form.set("lang", navigator.language || "");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't transcribe that recording.");
      if (id === run.current && data.text) {
        const text = data.text;
        setParts((p) => {
          const next = [...p];
          next[index] = text;
          return next;
        });
      }
    } catch (e) {
      if (id === run.current) warn("Couldn't transcribe part of that", e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Check your connection and try again.");
    } finally {
      pending.current--;
      settle(id);
    }
  };

  const record = (s: MediaStream, mime: string | undefined, index: number, id: number, meter: boolean) => {
    const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const me: Segment = { rec, heard: !meter }; // no meter: can't tell silence apart, so send everything
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (id !== run.current) return;
      if (me.heard && chunks.length) void send(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), index, id);
      settle(id);
    };
    rec.start();
    seg.current = me;
  };

  const start = async () => {
    const id = ++run.current;
    setParts([]);
    setPreview("");
    heardFinal.current = "";
    pending.current = 0;
    let s: MediaStream;
    try {
      // Asked only here, on the click; also feeds the level meter.
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const missing = e instanceof DOMException && e.name === "NotFoundError";
      warn(missing ? "No microphone found" : "Microphone is blocked", missing ? "Plug one in, then try again." : "Allow it in your browser's site settings, then try again.");
      return;
    }
    stream.current = s;
    let meter = false;
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (audio.current !== ctx) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        if (level > HEARD && seg.current) seg.current.heard = true;
        bars.current.forEach((b, i) => {
          if (b) b.style.transform = `scaleY(${0.3 + level * (0.7 - Math.abs(i - 2) * 0.18)})`;
        });
        requestAnimationFrame(tick);
      };
      tick();
      meter = true;
    } catch {
      /* meter is decoration; recording still works without it */
    }

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    let index = 0;
    try {
      record(s, mime, index, id, meter);
    } catch {
      release();
      warn("Recording isn't available in this browser");
      return;
    }
    live.current = true;
    timer.current = window.setInterval(() => {
      if (!live.current) return;
      seg.current?.rec.stop(); // closes this chunk's file and sends it
      heardFinal.current = "";
      setPreview("");
      record(s, mime, ++index, id, meter);
    }, SEGMENT_MS);

    // Optional live preview. Many browsers lack it or fail with "network" (Brave, some Chromium builds); then there's simply no preview.
    const Ctor = recognizerCtor();
    if (Ctor) {
      try {
        const r = new Ctor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = navigator.language || "en-US";
        r.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = e.results[i][0].transcript;
            if (e.results[i].isFinal) heardFinal.current = `${heardFinal.current} ${text.trim()}`.trim();
            else interim += text;
          }
          if (speech.current === r) setPreview(`${heardFinal.current} ${interim.trim()}`.trim());
        };
        r.onerror = (e) => {
          if (e.error !== "no-speech" && e.error !== "aborted" && speech.current === r) speech.current = null;
        };
        // Browsers end a session after a pause; keep previewing while recording.
        r.onend = () => {
          if (!live.current || speech.current !== r) return;
          try {
            r.start();
          } catch {
            speech.current = null;
          }
        };
        speech.current = r;
        r.start();
      } catch {
        speech.current = null;
      }
    }

    setStarted(Date.now());
    setPhase("listening");
  };

  const stop = () => {
    const id = run.current;
    const rec = seg.current?.rec;
    release();
    setPhase("transcribing");
    if (rec?.state === "recording") rec.stop(); // onstop sends the last chunk, then settles
    else settle(id);
  };
  const close = () => {
    run.current++;
    if (seg.current?.rec.state === "recording") seg.current.rec.stop();
    release();
    setPhase("idle");
    setParts([]);
    setPreview("");
  };

  const final = parts.filter(Boolean).join(" ");

  const button = supported ? (
    <button
      type="button"
      onClick={phase === "listening" ? stop : start}
      disabled={phase === "transcribing"}
      aria-label={phase === "listening" ? "Stop listening" : "Dictate or take voice notes"}
      aria-pressed={phase === "listening"}
      title={phase === "listening" ? "Stop listening" : "Dictate or take voice notes"}
      className={cn("grid size-8 place-items-center rounded-lg transition-colors disabled:opacity-50", phase === "listening" ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-hover hover:text-ink")}
    >
      <Mic className="size-4" aria-hidden />
    </button>
  ) : null;

  const panel =
    phase !== "idle" ? (
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
          ) : (
            <>
              {phase === "transcribing" && <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />}
              <span role="status" className="font-medium text-ink-2">
                {phase === "transcribing" ? "Transcribing…" : final ? "Transcript ready" : "Didn't catch anything"}
              </span>
              <button type="button" onClick={close} aria-label="Discard transcript" className="ml-auto grid size-6 place-items-center rounded-md hover:bg-hover hover:text-ink">
                <X className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
        <p aria-label="Live transcript" className="mt-1.5 max-h-28 overflow-y-auto text-[14px] leading-relaxed text-ink-2">
          {final || preview ? (
            <>
              {final} <span className="text-hair">{preview}</span>
            </>
          ) : (
            <span className="text-hair">
              {phase === "listening" ? "Start talking. Your words appear here as you go." : phase === "transcribing" ? "Turning your recording into text." : "Try again closer to the mic."}
            </span>
          )}
        </p>
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
