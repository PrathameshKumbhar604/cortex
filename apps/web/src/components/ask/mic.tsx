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
const MIN_LOADING_MS = 2_500; // while the on-device model downloads, short segments get Groq's words on screen sooner
const MAX_MS = 25_000;
const PAUSE_MS = 500;
const SLICE_MS = 500; // the recorder hands over audio this often
const HEARD = 0.12; // meter level that counts as speech; silent chunks are skipped (Whisper invents words in silence)
const COOLDOWN_MS = 60_000; // after a Groq 429, segments keep their live text instead of asking again
const NO_SPEECH = "cortex.mic.noSpeech"; // this browser's recognizer failed before
// On-device live pass: the model re-reads only the open piece of speech, which closes at a short pause (or a dip after
// a few seconds), so each pass stays ~0.1-0.3 s however long the user talks. Under ~0.6 s of audio models guess "you".
const SR = 16_000;
const LIVE_MIN = 0.6 * SR;
const LIVE_PAUSE_MS = 300;
const LIVE_SOFT = 5 * SR; // after this, close the piece at any dip
const LIVE_HARD = 9 * SR;
const noop = () => () => {};
// Errors are passing notices: shown as a toast, not in the composer.
const warn = (title: string, body?: string) => void toast(title, { body, tone: "warn", ms: 8000 });
// Whisper tags silence and noise ("[BLANK_AUDIO]", "(music)"); those aren't words.
const clean = (t: string) => t.replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const join = (a: string, b: string) => `${a} ${b}`.trim();
const speechFails = () => {
  try {
    return !recognizerCtor() || !!localStorage.getItem(NO_SPEECH);
  } catch {
    return !recognizerCtor();
  }
};
// Moonshine is English-only but its cost grows with the audio (Whisper always pads to 30 s): measured 0.2-0.45 s per
// pass on 2-5 s of speech vs 1.4-1.9 s for Whisper tiny, both WASM q8 (WebGPU was slower on an integrated GPU).
const liveModel = () => ((navigator.language || "en").startsWith("en") ? "onnx-community/moonshine-tiny-ONNX" : "onnx-community/whisper-tiny");

// Live words when the browser has no working speech service: a small on-device model (Moonshine tiny ~28 MB, Whisper
// tiny ~41 MB, q8; transformers.js keeps the files in the Cache API after first use) in a worker. Groq writes the final
// text. The first pass after loading is slow (WASM warm-up), so the worker runs one on silence before saying it's ready.
const WORKER = `
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";
let asr;
self.onmessage = async ({ data: { pcm, ...meta } }) => {
  try {
    asr ??= pipeline("automatic-speech-recognition", meta.model, { dtype: "q8", device: "wasm" }).then(async (run) => (await run(new Float32Array(16000)), run));
    const run = await asr;
    if (!pcm) return self.postMessage({ ready: true });
    const out = await run(pcm, meta.model.includes("whisper") ? { language: meta.lang } : {});
    self.postMessage({ ...meta, text: out.text });
  } catch (e) {
    self.postMessage({ ...meta, error: String(e) });
  }
};`;
let worker: Worker | null | undefined; // one per tab, kept between sessions so the model loads once
let modelReady = false;
function localWhisper(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<{ ready?: boolean }>) => void (e.data.ready && (modelReady = true)));
    worker.postMessage({ model: liveModel() });
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
  pcm: Float32Array; // this segment's audio at 16 kHz, for the on-device live pass
  len: number;
  from: number; // start of the open live piece
  cut: number; // end of a closed piece still waiting for its last pass (0: none)
  said: string; // live text of closed pieces
  guess: string; // latest live text of the open piece
  voiced: boolean; // speech heard in the open piece
}
/** One segment's text: live words (muted) until Groq's text for it is back (`done`). */
interface Part {
  text: string;
  done: boolean;
}

/** Dictation and quick voice notes, Granola-style: a calm live transcript, then insert it or turn it into notes.
 *  Records with MediaRecorder; each pause-bounded segment is transcribed on the server (/api/transcribe, Groq
 *  Whisper), so it works in every modern browser. Live words come from the browser's SpeechRecognition when it works
 *  (instant), otherwise from a small model on the device, fed raw 16 kHz audio straight from the mic. */
export function useMic(onInsert: (text: string) => void, onNotes: (transcript: string) => void) {
  const supported = useSyncExternalStore(noop, () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia, () => false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [parts, setParts] = useState<Part[]>([]);
  const [started, setStarted] = useState(0);
  const [loading, setLoading] = useState(false); // on-device model still loading (first use downloads it)
  const speech = useRef<Recognizer | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null); // drives the waveform
  const seg = useRef<Segment | null>(null);
  const liveSeg = useRef<Segment | null>(null); // the segment the on-device pass is reading (lags seg by one at a cut)
  const timer = useRef<number | undefined>(undefined);
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
    setAnalyser(null);
  };
  useEffect(() => {
    // Someone whose browser can't do live speech gets the on-device model loaded while the page is idle, not on click.
    const t = speechFails() ? setTimeout(localWhisper, 1500) : undefined;
    return () => {
      clearTimeout(t);
      run.current++;
      if (seg.current?.rec.state === "recording") seg.current.rec.stop();
      release();
    };
  }, []);
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

  // On-device live pass: hand the worker the open piece (or a just-closed piece's last pass), one pass at a time.
  const guess = () => {
    const w = local.current;
    let s = liveSeg.current;
    if (!w || localBusy.current || !s) return;
    if (s !== seg.current && !s.cut) s = liveSeg.current = seg.current; // the closed segment is fully read
    if (!s || (!s.cut && (!s.voiced || s.len - s.from < LIVE_MIN))) return;
    const end = s.cut || s.len;
    const pcm = s.pcm.slice(s.from, end);
    localBusy.current = true;
    w.postMessage({ pcm, model: liveModel(), lang: (navigator.language || "en").slice(0, 2), index: s.index, end, id: run.current }, [pcm.buffer]);
  };

  const startLocal = () => {
    const w = localWhisper();
    if (!w) return;
    local.current = w;
    localBusy.current = !modelReady; // until the model is loaded
    setLoading(!modelReady);
    if (!modelReady) w.postMessage({ model: liveModel() }); // answers "ready" once loaded (or the load error)
    w.onmessage = ({ data }: MessageEvent<{ ready?: boolean; text?: string; index?: number; end?: number; id?: number; error?: string }>) => {
      localBusy.current = false;
      setLoading(false);
      const s = liveSeg.current;
      if (data.error) {
        // Model couldn't load (offline, blocked CDN, old browser): no live words this session; Groq still transcribes.
        console.warn("On-device transcription:", data.error);
        local.current = null;
      } else if (data.id === run.current && data.text !== undefined && s && s.index === data.index) {
        const text = clean(data.text);
        if (s.cut && data.end === s.cut) {
          s.said = join(s.said, text);
          s.from = s.cut;
          s.cut = 0;
          s.guess = "";
        } else s.guess = text;
        setPart(s.index, join(s.said, s.guess), false);
      }
      if (live.current) guess(); // catch up with audio that came meanwhile
    };
  };

  const record = (s: MediaStream, mime: string | undefined, index: number, id: number, meter: boolean) => {
    const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    // no meter: can't tell silence apart, so send everything. 35 s holds the longest segment (30 s without a meter).
    const me: Segment = { rec, heard: !meter, index, chunks: [], since: Date.now(), pcm: new Float32Array(35 * SR), len: 0, from: 0, cut: 0, said: "", guess: "", voiced: !meter };
    rec.ondataavailable = (e) => {
      if (e.data.size) me.chunks.push(e.data);
    };
    rec.onstop = () => {
      if (id !== run.current) return;
      if (me.heard && me.chunks.length) void send(new Blob(me.chunks, { type: rec.mimeType || mime || "audio/webm" }), index, id);
      settle(id);
    };
    rec.start(SLICE_MS);
    seg.current = me;
    liveSeg.current ??= me;
    heardFinal.current = "";
  };

  const start = async () => {
    const id = ++run.current;
    texts.current = [];
    setParts([]);
    heardFinal.current = "";
    pending.current = 0;
    local.current = null;
    liveSeg.current = null;
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
      const src = ctx.createMediaStreamSource(s);
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      src.connect(a);
      setAnalyser(a);
      const data = new Float32Array(a.fftSize);
      level = () => {
        a.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        return Math.min(1, Math.sqrt(sum / data.length) * 4);
      };
      // Raw audio for the on-device pass, averaged down to 16 kHz as it arrives: no MediaRecorder chunks to decode.
      // shortcut: ScriptProcessor is deprecated but runs everywhere with no extra module; move to an AudioWorklet if it janks.
      const tap = ctx.createScriptProcessor(2048, 1, 1);
      const step = ctx.sampleRate / SR;
      tap.onaudioprocess = (e) => {
        const me = seg.current;
        if (!me || !live.current) return;
        const x = e.inputBuffer.getChannelData(0);
        const n = Math.min(Math.floor(x.length / step), me.pcm.length - me.len);
        for (let i = 0; i < n; i++) {
          let sum = 0;
          const a0 = Math.floor(i * step), a1 = Math.max(a0 + 1, Math.floor((i + 1) * step));
          for (let j = a0; j < a1; j++) sum += x[j];
          me.pcm[me.len + i] = sum / (a1 - a0);
        }
        me.len += n;
      };
      src.connect(tap);
      tap.connect(ctx.destination); // Chrome only runs a processor that's connected; it outputs silence
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
    // Pause detection, segment cuts and the live pass on one clock (an interval, so it keeps going in a background tab).
    timer.current = window.setInterval(() => {
      const cur = seg.current;
      if (!live.current || !cur) return;
      const now = Date.now();
      const l = level?.() ?? 0;
      if (l > HEARD) {
        loud = now;
        spoke ||= now;
        cur.heard = cur.voiced = true;
      }
      // Some recognizers start but never return a word (Chrome with no speech service reachable, no error raised).
      const r = speech.current;
      if (r && !words && spoke && now - spoke > 3000) {
        fallback();
        r.abort();
      }
      // Close the open live piece at a short pause, so the next pass starts small again.
      const open = cur.len - cur.from;
      if (meter && !cur.cut && cur.voiced && (open > LIVE_HARD || (l <= HEARD && (open > LIVE_SOFT || (open > 1.5 * SR && now - loud >= LIVE_PAUSE_MS))))) {
        cur.cut = cur.len;
        cur.voiced = false;
      }
      guess();
      const age = now - cur.since;
      if (meter ? age < (local.current && !modelReady ? MIN_LOADING_MS : MIN_MS) || now - loud < (age > MAX_MS ? 150 : PAUSE_MS) : age < 30_000) return;
      cur.rec.stop(); // closes this segment's file and sends it
      if (cur.voiced) cur.cut = cur.len; // its last live piece still gets read
      record(s, mime, ++index, id, meter);
    }, 100);

    // Live words: the browser's recognizer when it works (instant). It's missing, or fails with "network", in Brave,
    // Arc, Firefox and some Chromium builds; then a model runs on the device instead.
    const fallback = () => {
      speech.current = null;
      try {
        localStorage.setItem(NO_SPEECH, "1"); // next time go straight to the on-device model
      } catch {}
      if (live.current && id === run.current && !local.current) startLocal();
    };
    const Ctor = recognizerCtor();
    if (speechFails()) fallback();
    else {
      try {
        const r = new Ctor!();
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
    setLoading(false);
    setPhase("transcribing");
    if (rec?.state === "recording") rec.stop(); // onstop sends the last chunk, then settles
    else settle(id);
  };
  const close = () => {
    run.current++;
    if (seg.current?.rec.state === "recording") seg.current.rec.stop();
    release();
    setLoading(false);
    setPhase("idle");
    texts.current = [];
    setParts([]);
  };

  const final = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");

  // Hover or focus is a hint the mic is next: start loading the model now if this browser will need it.
  const prewarm = () => void (speechFails() && localWhisper());
  const button = supported ? (
    <button
      type="button"
      onClick={phase === "listening" ? stop : start}
      onPointerEnter={prewarm}
      onFocus={prewarm}
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
              <Wave analyser={analyser} />
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
              {phase === "listening"
                ? loading
                  ? "Getting live words ready on this device. Keep talking, nothing is lost."
                  : "Start talking. Your words appear here as you go."
                : phase === "transcribing"
                  ? "Turning your recording into text."
                  : "Try again closer to the mic."}
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

/** Voice-memo waveform: one bar per 60 ms of the mic's loudness, scrolling left, drawn on a canvas every frame.
 *  Fast attack and slower release so syllables pop and pauses settle. Reduced motion: bars hold still and only
 *  breathe with the overall level. */
const BARS = 28;
const PITCH = 4; // px per bar (2 px bar, 2 px gap)
const STEP_MS = 60;
function Wave({ analyser }: { analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    g.scale(dpr, dpr);
    const data = new Float32Array(analyser?.fftSize ?? 32);
    const hist = new Float32Array(BARS); // oldest first
    let env = 0;
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    let raf = 0;
    const bar = (x: number, v: number) => {
      const h = Math.max(2, Math.min(H, 2 + v ** 0.7 * (H - 2)));
      g.beginPath();
      g.roundRect(x, (H - h) / 2, 2, h, 1);
      g.fill();
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(64, now - last);
      last = now;
      let sum = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(data);
        for (const v of data) sum += v * v;
      }
      const level = Math.min(1, Math.sqrt(sum / data.length) * 5);
      env += (level - env) * (1 - Math.exp(-dt / (still ? 250 : level > env ? 25 : 120)));
      if (frame++ % 30 === 0) g.fillStyle = getComputedStyle(c).color; // follows the theme accent
      g.clearRect(0, 0, W, H);
      if (still) {
        for (let i = 0; i < BARS; i++) bar(i * PITCH + 1, env * (0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / BARS)));
        return;
      }
      acc += dt;
      while (acc >= STEP_MS) {
        hist.copyWithin(0, 1);
        hist[BARS - 1] = env;
        acc -= STEP_MS;
      }
      const shift = (acc / STEP_MS) * PITCH;
      for (let i = 0; i <= BARS; i++) {
        const x = i * PITCH - shift + 1;
        g.globalAlpha = Math.min(1, (x + PITCH) / (PITCH * 6)); // older bars fade out at the left edge
        bar(x, i < BARS ? hist[i] : env);
      }
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return <canvas ref={ref} aria-hidden className="h-5 w-[116px] shrink-0 text-accent" />;
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
