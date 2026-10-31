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

// Segments end at a pause so no word is cut in half. Groq bills each request as at least 10 s of audio, so a segment
// runs ~8 s before a pause may close it; a long unbroken stretch closes at the first short dip after 25 s.
const MIN_MS = 8_000;
const MAX_MS = 25_000;
const PAUSE_MS = 500;
const SLICE_MS = 500; // the recorder hands over audio this often; the on-device live pass reads it
const HEARD = 0.12; // meter level that counts as speech; silent chunks are skipped (Whisper invents words in silence)
const COOLDOWN_MS = 60_000; // after a Groq 429, segments keep their live text instead of asking again
const NO_SPEECH = "cortex.mic.noSpeech"; // this browser's recognizer failed before
const noop = () => () => {};
// Errors are passing notices: shown as a toast, not in the composer.
const warn = (title: string, body?: string) => void toast(title, { body, tone: "warn", ms: 8000 });
// Whisper tags silence and noise ("[BLANK_AUDIO]", "(music)"); those aren't words.
const clean = (t: string) => t.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
// Moonshine is English-only but its cost grows with the audio (Whisper always pads to 30 s): measured 0.2-0.45 s per
// pass on 2-5 s of speech vs 1.4-1.9 s for Whisper tiny, both WASM q8 (WebGPU was slower on an integrated GPU).
const liveModel = () => ((navigator.language || "en").startsWith("en") ? "onnx-community/moonshine-tiny-ONNX" : "onnx-community/whisper-tiny");

// Live words when the browser has no working speech service: a small on-device model (Moonshine tiny ~28 MB, Whisper
// tiny ~41 MB, q8, cached by the browser after first use) in a worker via transformers.js. Groq writes the final text.
const WORKER = `
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";
let asr;
self.onmessage = async ({ data }) => {
  try {
    asr ??= pipeline("automatic-speech-recognition", data.model, { dtype: "q8", device: "wasm" });
    const run = await asr;
    if (!data.pcm) return self.postMessage({ ready: true });
    const out = await run(data.pcm, data.model.includes("whisper") ? { language: data.lang } : {});
    self.postMessage({ id: data.id, index: data.index, text: out.text });
  } catch (e) {
    self.postMessage({ id: data.id, index: data.index, error: String(e) });
  }
};`;
let worker: Worker | null | undefined; // one per tab, kept between sessions so the model loads once
function localWhisper(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

type Phase = "idle" | "listening" | "transcribing" | "review";
interface Segment {
  rec: MediaRecorder;
  heard: boolean;
  index: number;
  chunks: Blob[];
  since: number;
}
/** One segment's text: live words (muted) until Groq's text for it is back (`done`). */
interface Part {
  text: string;
  done: boolean;
}

/** Dictation and quick voice notes, Granola-style: a calm live transcript, then insert it or turn it into notes.
 *  Records with MediaRecorder; each pause-bounded segment is transcribed on the server (/api/transcribe, Groq
 *  Whisper), so it works in every modern browser. Live words come from the browser's SpeechRecognition when it works
 *  (instant), otherwise from a small model on the device, re-run on the open segment as audio arrives. */
export function useMic(onInsert: (text: string) => void, onNotes: (transcript: string) => void) {
  const supported = useSyncExternalStore(noop, () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia, () => false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [parts, setParts] = useState<Part[]>([]);
  const [started, setStarted] = useState(0);
  const speech = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const seg = useRef<Segment | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const box = useRef<HTMLParagraphElement>(null);
  const live = useRef(false);
  const run = useRef(0); // bumps on every start/close, so late answers from a discarded session are ignored
  const pending = useRef(0);
  const heardFinal = useRef("");
  const texts = useRef<Part[]>([]); // mirror of parts for the async paths
  const local = useRef<Worker | null>(null);
  const localBusy = useRef(false);
  const cooldown = useRef(0);

  const setPart = (index: number, text: string, done: boolean) => {
    if (texts.current[index]?.done && !done) return; // a late live guess never overwrites the final text
    texts.current[index] = { text, done };
    setParts([...texts.current]);
  };

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
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [parts]);

  const settle = (id: number) => {
    if (id !== run.current || live.current || pending.current) return;
    setPhase((p) => (p === "transcribing" ? "review" : p));
  };

  // Groq failed or is cooling down: keep this segment's live words, if there are any.
  const keepLive = (index: number) => {
    const t = texts.current[index]?.text;
    if (t) setPart(index, t, true);
    return !!t;
  };

  const send = async (blob: Blob, index: number, id: number) => {
    if (Date.now() < cooldown.current && keepLive(index)) return settle(id);
    pending.current++;
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.set("audio", blob, `speech.${ext}`);
      form.set("lang", navigator.language || "");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (res.status === 429) cooldown.current = Date.now() + COOLDOWN_MS;
      if (!res.ok) throw new Error(data.error ?? "Couldn't transcribe that recording.");
      if (id === run.current) setPart(index, clean(data.text ?? ""), true);
    } catch (e) {
      if (id === run.current && !keepLive(index))
        warn("Couldn't transcribe part of that", e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Check your connection and try again.");
    } finally {
      pending.current--;
      settle(id);
    }
  };

  // On-device live pass: decode the open segment so far to 16 kHz mono (what Whisper takes) and hand it to the worker.
  const guess = async (me: Segment, id: number) => {
    const w = local.current;
    if (!w || localBusy.current || !me.heard || me.chunks.length < 2) return; // under a second, models guess "you"
    localBusy.current = true;
    try {
      const bytes = await new Blob(me.chunks, { type: me.rec.mimeType }).arrayBuffer();
      const pcm = (await new OfflineAudioContext(1, 1, 16_000).decodeAudioData(bytes)).getChannelData(0);
      w.postMessage({ pcm, model: liveModel(), lang: (navigator.language || "en").slice(0, 2), index: me.index, id }, [pcm.buffer]);
    } catch {
      localBusy.current = false; // a partial file that won't decode yet; the next slice tries again
    }
  };

  const startLocal = () => {
    const w = localWhisper();
    if (!w) return;
    local.current = w;
    localBusy.current = true; // until the model is loaded
    w.onmessage = ({ data }: MessageEvent<{ ready?: boolean; text?: string; index?: number; id?: number; error?: string }>) => {
      localBusy.current = false;
      if (data.error) {
        // Model couldn't load (offline, blocked CDN, old browser): no live words this session; Groq still transcribes.
        console.warn("On-device transcription:", data.error);
        local.current = null;
      } else if (data.id === run.current && data.text !== undefined && data.index !== undefined) setPart(data.index, clean(data.text), false);
      if (seg.current && live.current) void guess(seg.current, run.current); // catch up with audio that came meanwhile
    };
    w.postMessage({ model: liveModel() });
  };

  const record = (s: MediaStream, mime: string | undefined, index: number, id: number, meter: boolean) => {
    const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const me: Segment = { rec, heard: !meter, index, chunks: [], since: Date.now() }; // no meter: can't tell silence apart, so send everything
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      me.chunks.push(e.data);
      if (rec.state === "recording") void guess(me, id);
    };
    rec.onstop = () => {
      if (id !== run.current) return;
      if (me.heard && me.chunks.length) void send(new Blob(me.chunks, { type: rec.mimeType || mime || "audio/webm" }), index, id);
      settle(id);
    };
    rec.start(SLICE_MS);
    seg.current = me;
    heardFinal.current = "";
  };

  const start = async () => {
    const id = ++run.current;
    texts.current = [];
    setParts([]);
    heardFinal.current = "";
    pending.current = 0;
    local.current = null;
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
    let level: (() => number) | null = null;
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      level = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / data.length) * 4);
      };
    } catch {
      /* the meter is decoration and pause detection; recording still works without it (fixed 30 s segments) */
    }
    const meter = !!level;

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
    let loud = Date.now();
    let spoke = 0; // when speech was first heard
    let words = false; // the browser recognizer has produced something
    // Meter, pause detection and segment cuts on one clock (an interval, so it keeps going in a background tab).
    timer.current = window.setInterval(() => {
      const cur = seg.current;
      if (!live.current || !cur) return;
      const now = Date.now();
      const l = level?.() ?? 0;
      if (l > HEARD) {
        loud = now;
        spoke ||= now;
        cur.heard = true;
      }
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${0.3 + l * (0.7 - Math.abs(i - 2) * 0.18)})`;
      });
      // Some recognizers start but never return a word (Chrome with no speech service reachable, no error raised).
      const r = speech.current;
      if (r && !words && spoke && now - spoke > 3000) {
        fallback();
        r.abort();
      }
      const age = now - cur.since;
      if (meter ? age < MIN_MS || now - loud < (age > MAX_MS ? 150 : PAUSE_MS) : age < 30_000) return;
      cur.rec.stop(); // closes this segment's file and sends it
      record(s, mime, ++index, id, meter);
    }, 100);

    // Live words: the browser's recognizer when it works (instant). It's missing, or fails with "network", in Brave,
    // Arc, Firefox and some Chromium builds; then Whisper runs on the device instead.
    const fallback = () => {
      speech.current = null;
      try {
        localStorage.setItem(NO_SPEECH, "1"); // next time go straight to the on-device model
      } catch {}
      if (live.current && id === run.current && !local.current) startLocal();
    };
    const Ctor = recognizerCtor();
    let skip = false;
    try {
      skip = !!localStorage.getItem(NO_SPEECH);
    } catch {}
    if (!Ctor || skip) fallback();
    else {
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
          words = true;
          if (speech.current === r && seg.current) setPart(seg.current.index, `${heardFinal.current} ${interim.trim()}`.trim(), false);
        };
        r.onerror = (e) => {
          if (e.error !== "no-speech" && e.error !== "aborted" && speech.current === r) fallback();
        };
        // Browsers end a session after a pause; keep listening while recording.
        r.onend = () => {
          if (!live.current || speech.current !== r) return;
          try {
            r.start();
          } catch {
            fallback();
          }
        };
        speech.current = r;
        r.start();
      } catch {
        fallback();
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
    texts.current = [];
    setParts([]);
  };

  const final = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");

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
                    className="h-full w-[3px] origin-center scale-y-[0.3] rounded-full bg-accent transition-transform duration-100"
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
        <p ref={box} aria-label="Live transcript" className="mt-1.5 max-h-28 overflow-y-auto text-[14px] leading-relaxed text-ink-2">
          {final ? (
            // Keyed per word, so only words that are new fade in (the `enter` rule); rewritten guesses just change.
            parts.map((p, i) => (
              <span key={i} className={p.done ? "text-ink-2" : "text-hair"}>
                {p.text.split(" ").map((w, j) => (
                  <span key={j} className="enter">
                    {w}{" "}
                  </span>
                ))}
              </span>
            ))
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
