import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifySarvamError, switchesVoiceOff, voiceState, type SarvamFailure, type VoiceOff } from "@/lib/sarvam";
import { langInfo, persona, TTS_MODEL, type Persona } from "@/lib/voice";
import { logEvent, readSetting, writeSetting } from "./admin";

// Sarvam AI (https://docs.sarvam.ai): Bulbul v4 Flash speaks every voice-mode reply; Saaras is speech-to-text's paid
// last resort (see stt.ts). The key (SARVAM in the root .env) stays on this server. Credits are limited, so: replies are
// capped before they get here, short phrases are cached, and an empty wallet switches voice mode off for everyone.
const BASE = "https://api.sarvam.ai";
const ROOT = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");
const MOCK = path.join(ROOT, ".data", "sarvam-mock.json");

export const sarvamReady = () => !!process.env.SARVAM;

/**
 * One Sarvam call. In development a `.data/sarvam-mock.json` file ({"status": 402, "body": {...}}) answers instead of
 * Sarvam, so running out of credits can be tested without spending any.
 */
export async function sarvamFetch(route: string, body: unknown, timeoutMs: number): Promise<{ json: unknown } | { failure: SarvamFailure }> {
  if (process.env.NODE_ENV !== "production" && existsSync(MOCK)) {
    const mock = JSON.parse(readFileSync(MOCK, "utf8")) as { status: number; body: unknown };
    return { failure: await recordFailure(classifySarvamError(mock.status, mock.body)) };
  }
  const key = process.env.SARVAM;
  if (!key) return { failure: { kind: "auth", status: 0, message: "SARVAM is not set" } };
  try {
    const res = await fetch(BASE + route, {
      method: "POST",
      headers: { "api-subscription-key": key, ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { json };
    return { failure: await recordFailure(classifySarvamError(res.status, json)) };
  } catch {
    return { failure: classifySarvamError(0, null) }; // network error or timeout
  }
}

async function recordFailure(f: SarvamFailure): Promise<SarvamFailure> {
  if (switchesVoiceOff(f)) {
    const was = await readSetting<VoiceOff>("voiceOff");
    if (!was) {
      await writeSetting("voiceOff", { at: Date.now(), reason: f.kind } satisfies VoiceOff);
      void logEvent("system", "voice.off", "sarvam", `${f.status} ${f.code ?? ""} ${f.message}`.trim());
    }
  } else console.warn(`[voice] Sarvam ${f.status} ${f.code ?? ""}: ${f.message}`);
  return f;
}

// shortcut: per-process memory; fine for one server. Only short phrases repeat (the approval prompt, "Done."), so only those are kept.
const cache = new Map<string, Uint8Array>();
const CACHE_TEXT = 120;

/** Speech for one sentence as MP3 bytes. */
export async function speak(text: string, voice: Persona): Promise<{ audio: Uint8Array; cached: boolean } | { failure: SarvamFailure }> {
  const key = `${voice.speaker}|${text}`;
  const hit = cache.get(key);
  if (hit) return { audio: hit, cached: true };
  const res = await sarvamFetch(
    "/text-to-speech",
    { text, language_code: langInfo(voice.lang).bcp47, model: TTS_MODEL, speaker: voice.speaker, pace: 1.05, speech_sample_rate: 24000, output_audio_codec: "mp3" },
    15_000,
  );
  if ("failure" in res) return res;
  const b64 = (res.json as { audios?: string[] }).audios?.[0];
  if (!b64) return { failure: { kind: "transient", status: 200, message: "no audio in the response" } };
  const audio = new Uint8Array(Buffer.from(b64, "base64"));
  if (text.length <= CACHE_TEXT) {
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, audio);
  }
  return { audio, cached: false };
}

/**
 * A free, natural-sounding stand-in when Sarvam can't speak (credits gone, or a failed call): Gemini's TTS on the
 * existing key, then for English Groq's Orpheus. Same gender and a similar character as the chosen voice. Null when
 * neither worked; the browser's own voice is the last resort.
 */
export async function backupSpeech(text: string, voice: Persona): Promise<{ audio: Uint8Array; engine: string; type: string } | null> {
  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) {
    try {
      const model = process.env.GEMINI_MODEL_TTS ?? "gemini-3.8-flash-lite-tts";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": gemini, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.backup.gemini } } } },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const part = res.ok ? ((await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] }).candidates?.[0]?.content?.parts?.[0]?.inlineData : undefined;
      if (part?.data) {
        const bytes = new Uint8Array(Buffer.from(part.data, "base64"));
        // Older models answer with raw 24 kHz PCM; browsers can only decode it inside a WAV header.
        return { audio: /wav/i.test(part.mimeType) ? bytes : pcmToWav(bytes, Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000)), engine: "gemini", type: "audio/wav" };
      }
      console.warn(`[voice] Gemini TTS ${res.status}`);
    } catch (err) {
      console.warn("[voice] Gemini TTS failed:", err instanceof Error ? err.message : err);
    }
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq && voice.backup.groq && text.length <= 200) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${groq}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", voice: voice.backup.groq, input: text, response_format: "wav" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { audio: new Uint8Array(await res.arrayBuffer()), engine: "groq", type: "audio/wav" };
      console.warn(`[voice] Groq TTS ${res.status}`); // 400 until the org accepts Orpheus's terms in the Groq console
    } catch (err) {
      console.warn("[voice] Groq TTS failed:", err instanceof Error ? err.message : err);
    }
  }
  return null;
}

function pcmToWav(pcm: Uint8Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, x: string) => [...x].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

let probing: Promise<void> | null = null;

/** Whether new voice sessions may start. After the cool-down, one tiny probe (two characters of speech) checks again. */
export async function voiceStatus(): Promise<{ enabled: boolean; reason?: string; retryAt?: number }> {
  if (!sarvamReady()) return { enabled: false, reason: "Voice mode isn't set up on this server." };
  const off = await readSetting<VoiceOff>("voiceOff");
  const state = voiceState(off, Date.now());
  if (state.probe && off) {
    probing ??= (async () => {
      await writeSetting("voiceOff", { ...off, probedAt: Date.now() } satisfies VoiceOff); // one probe per cool-down, even with many callers
      // Straight to Sarvam, never the phrase cache: a cached "ok" would prove nothing.
      const r = await sarvamFetch("/text-to-speech", { text: "ok", language_code: "en-IN", model: TTS_MODEL, speaker: persona("en", "female").speaker }, 10_000);
      if ("json" in r) await writeSetting("voiceOff", null);
    })().finally(() => (probing = null));
    await probing;
    return voiceStatus();
  }
  return state.enabled ? { enabled: true } : { enabled: false, reason: "Voice mode is unavailable at the moment.", retryAt: state.retryAt };
}

export async function enableVoice(actor: string) {
  await writeSetting("voiceOff", null);
  void logEvent(actor, "admin.voice", "", "voice mode turned back on");
}
