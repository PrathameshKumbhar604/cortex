import "server-only";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { SarvamFailure } from "@/lib/sarvam";
import { langInfo, type VoiceLang } from "@/lib/voice";
import { sarvamFetch } from "./voice";

/**
 * Speech to text for voice mode: free engines first, ordered per language by a measured comparison (FLEURS hi/mr and
 * Indian-accented English clips), each falling through to the next on an error, a quota hit (429), a timeout or an
 * empty/unsure result; Sarvam Saaras (paid) is the last resort.
 *   Hindi:   IndicConformer on this server (CER 0.06) → Groq Whisper large-v3 (0.11) → Gemini (0.36: sometimes romanises)
 *   Marathi: IndicConformer (CER 0.04) → Gemini (0.22) → Groq Whisper large-v3 (0.25)
 *   English: Groq Whisper large-v3 (WER 0.01, ~0.4 s) → Gemini (WER 0.00, but ~2 s and it shares the answer model's quota)
 */
export interface SttResult {
  text: string;
  engine: string;
  /** Set when Sarvam was tried and failed in a way that switches voice mode off. */
  sarvam?: SarvamFailure;
}

type Engine = (audio: Blob, lang: VoiceLang) => Promise<string | null>; // null: not available here, try the next

const CHAINS: Record<VoiceLang, [string, Engine][]> = {
  hi: [["indicconformer", indicConformer], ["groq", groq], ["gemini", gemini]],
  mr: [["indicconformer", indicConformer], ["gemini", gemini], ["groq", groq]],
  en: [["groq", groq], ["gemini", gemini]],
};

export async function transcribe(audio: Blob, lang: VoiceLang, opts: { sarvam: boolean }): Promise<SttResult> {
  for (const [name, run] of CHAINS[lang]) {
    try {
      const text = clean(await run(audio, lang));
      if (text) return { text, engine: name };
    } catch (err) {
      console.warn(`[voice] ${name} speech-to-text failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (!opts.sarvam) return { text: "", engine: "none" };
  const r = await sarvamStt(audio, lang);
  return "text" in r ? { text: clean(r.text), engine: "sarvam" } : { text: "", engine: "none", sarvam: r.failure };
}

// Whisper and friends tag silence and noise ("[BLANK_AUDIO]", "(music)"); those aren't words.
const clean = (t: string | null) => (t ?? "").replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// --- AI4Bharat IndicConformer (CTC greedy over the int8 ONNX encoder) ------------------------------------------------

// shortcut: the int8 export from Akkimetry/milkledger-voice (MIT; AI4Bharat's hybrid CTC-RNNT large models with the
// log-mel front end inside), pinned by commit and checked by SHA-256. ~139 MB per language, downloaded on first use into
// .data/models; ~0.5 s for 10 s of speech on 4 CPU threads. Self-host the official .nemo export if this repo goes away.
const REPO = "https://huggingface.co/Akkimetry/milkledger-voice/resolve/4904f8327073dd7a41a808e024dacffd83f824b2";
const FILES: Record<"hi" | "mr", Record<string, string>> = {
  hi: {
    "encoder.int8.onnx": "cb2353008e51770c7eb1790d901f7b03016637dbe9c29f55eb3335b9dbdf65ec",
    "tokens.txt": "152e58dc9469feb8f74fb006245616ad7cd91b3f7a5ace72ec53f970db10c981",
  },
  mr: {
    "encoder.int8.onnx": "9b0a3cb6f39930e9b3e5915632163d0e11efbc67c868822c41b25545607b1b0e",
    "tokens.txt": "1fa2b1c57360011169a4c47d987b41662ab1187c11fcbfa2af2bd827560b2f65",
  },
};
const MODELS = path.join(process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../.."), ".data", "models", "indicconformer");
/** Below this mean log-probability of the emitted tokens the result is too unsure to send to the model (calibrated on test clips). */
const MIN_CONFIDENCE = -0.5; // real speech measured -0.03 to -0.18; noise and silence emit nothing

type Recognizer = (pcm: Float32Array) => Promise<{ text: string; confidence: number }>;
const g = globalThis as unknown as { __indic?: Partial<Record<"hi" | "mr", Promise<Recognizer>>> };
g.__indic ??= {};

/** Starts the download and load in the background (voice mode opening calls this), so the first utterance is fast. */
export function warmStt(lang: VoiceLang) {
  if (lang !== "en") void recognizer(lang).catch(() => {});
}

function recognizer(lang: "hi" | "mr"): Promise<Recognizer> {
  const cache = g.__indic!;
  cache[lang] ??= load(lang).catch((err) => {
    delete cache[lang]; // try again next time
    throw err;
  });
  return cache[lang]!;
}

async function load(lang: "hi" | "mr"): Promise<Recognizer> {
  const dir = path.join(MODELS, lang);
  mkdirSync(dir, { recursive: true });
  for (const [file, sha] of Object.entries(FILES[lang])) {
    const dest = path.join(dir, file);
    if (existsSync(dest)) continue;
    const res = await fetch(`${REPO}/${lang}/${file}`, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
    const part = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(part));
    const got = createHash("sha256").update(readFileSync(part)).digest("hex");
    if (got !== sha) {
      rmSync(part, { force: true });
      throw new Error(`model checksum mismatch for ${lang}/${file}`);
    }
    renameSync(part, dest);
  }
  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(path.join(dir, "encoder.int8.onnx"), { intraOpNumThreads: 4, graphOptimizationLevel: "all", enableCpuMemArena: false });
  const tokens = readFileSync(path.join(dir, "tokens.txt"), "utf8").trim().split("\n").map((l) => l.slice(0, l.lastIndexOf(" ")));
  const blank = tokens.length - 1;
  return async (pcm) => {
    const out = await session.run({
      audio: new ort.Tensor("float32", pcm, [1, pcm.length]),
      length: new ort.Tensor("int64", BigInt64Array.from([BigInt(pcm.length)]), [1]),
    });
    const frames = Number(out.encoder_len!.data[0]);
    const lp = out.ctc_logprobs!.data as Float32Array;
    const V = tokens.length;
    const ids: number[] = [];
    let prev = -1;
    let sum = 0;
    let emitted = 0;
    for (let t = 0; t < frames; t++) {
      let best = 0;
      for (let v = 1; v < V; v++) if (lp[t * V + v]! > lp[t * V + best]!) best = v;
      if (best !== blank) {
        sum += lp[t * V + best]!;
        emitted++;
        if (best !== prev) ids.push(best);
      }
      prev = best;
    }
    const text = ids.map((i) => tokens[i]).join("").replace(/▁/g, " ").trim();
    return { text, confidence: emitted ? sum / emitted : -Infinity };
  };
}

async function indicConformer(audio: Blob, lang: VoiceLang): Promise<string | null> {
  if (lang === "en") return null;
  const pcm = wavTo16k(new Uint8Array(await audio.arrayBuffer()));
  if (!pcm) return null; // not our WAV: let the next engine read it
  const run = await Promise.race([recognizer(lang), new Promise<null>((ok) => setTimeout(() => ok(null), 1500))]);
  if (!run) {
    warmStt(lang); // still downloading or loading: this utterance goes to the next engine
    return null;
  }
  const { text, confidence } = await run(pcm);
  return confidence >= MIN_CONFIDENCE ? text : null;
}

/** 16-bit PCM WAV (what voice mode sends) as 16 kHz mono floats; null for anything else. */
export function wavTo16k(b: Uint8Array): Float32Array | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (b.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let p = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  while (p + 8 <= b.length) {
    const id = tag(p);
    const size = v.getUint32(p + 4, true);
    if (id === "fmt ") {
      channels = v.getUint16(p + 10, true);
      rate = v.getUint32(p + 12, true);
      bits = v.getUint16(p + 22, true);
    } else if (id === "data") {
      if (bits !== 16 || !channels || !rate) return null;
      const n = Math.floor(Math.min(size, b.length - p - 8) / 2 / channels);
      const mono = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += v.getInt16(p + 8 + (i * channels + c) * 2, true);
        mono[i] = s / channels / 32768;
      }
      if (rate === 16000) return mono;
      const out = new Float32Array(Math.floor((n * 16000) / rate));
      const r = rate / 16000;
      for (let i = 0; i < out.length; i++) {
        const x = i * r;
        const j = Math.floor(x);
        out[i] = mono[j]! * (1 - (x - j)) + (mono[j + 1] ?? mono[j]!) * (x - j);
      }
      return out;
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

// --- Free cloud engines ------------------------------------------------------------------------------------------------

/** Groq's free Whisper; also what dictation (/api/transcribe) uses. Throws with the HTTP status on failure. */
export async function groqTranscribe(audio: Blob, lang: string, model = process.env.GROQ_MODEL_STT ?? "whisper-large-v3-turbo"): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error("GROQ_API_KEY is not set"), { status: 503 });
  const out = new FormData();
  out.set("file", audio, (audio as File).name || (audio.type.includes("wav") ? "speech.wav" : "speech.webm"));
  out.set("model", model);
  out.set("response_format", "json");
  if (/^[a-z]{2}$/.test(lang)) out.set("language", lang);
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: out,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw Object.assign(new Error(`Groq ${res.status}`), { status: res.status });
  return ((await res.json()) as { text?: string }).text ?? "";
}

// Voice mode uses large-v3 (not turbo): the user asked for it, and turbo measured no better on Indian-accented English.
function groq(audio: Blob, lang: VoiceLang) {
  return groqTranscribe(audio, lang, "whisper-large-v3");
}

async function gemini(audio: Blob, lang: VoiceLang): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL_STT ?? "gemini-flash-lite-latest";
  const name = langInfo(lang).name;
  const prompt = `Transcribe this speech verbatim. The speaker is expected to speak ${name}, possibly with a regional accent or dialect, and may mix in English words. Write Hindi and Marathi words in Devanagari script, never in Latin letters; write English words in Latin script. Do not translate, correct, answer, summarise or add anything. If there is no speech, output nothing. Output only the transcript.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: audio.type || "audio/wav", data: Buffer.from(await audio.arrayBuffer()).toString("base64") } }] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

// --- Sarvam (paid, last resort) ----------------------------------------------------------------------------------------

async function sarvamStt(audio: Blob, lang: VoiceLang): Promise<{ text: string } | { failure: SarvamFailure }> {
  const form = new FormData();
  form.set("file", audio, "speech.wav");
  form.set("model", "saaras:v3");
  form.set("mode", "transcribe");
  form.set("language_code", langInfo(lang).bcp47);
  const res = await sarvamFetch("/speech-to-text", form, 20_000);
  if ("failure" in res) return res;
  return { text: String((res.json as { transcript?: string }).transcript ?? "") };
}
