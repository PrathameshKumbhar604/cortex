import { isGender, isLang, persona, TTS_MAX_CHARS } from "@/lib/voice";
import { switchesVoiceOff } from "@/lib/sarvam";
import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { backupSpeech, speak, voiceStatus } from "@/server/voice";

/**
 * One sentence of a voice-mode reply as audio. Sarvam speaks it while voice mode is on; when Sarvam can't (credits
 * gone, or a failed call), a free backup voice does, so a conversation in progress never goes silent. Headers say
 * which: `x-voice-backup: exhausted` asks the browser for the calm "backup voice" notice. A 503 means even the backups
 * failed and the browser should use its own voice.
 */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; lang?: unknown; gender?: unknown };
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return jsonError("text is required");
  if (text.length > TTS_MAX_CHARS) return jsonError(`Keep each piece under ${TTS_MAX_CHARS} characters.`, 413);
  if (!isLang(body.lang) || !isGender(body.gender)) return jsonError("Choose a language and a voice.");
  if (!withinLimit(`tts:${sess.userId}`, 40)) return Response.json({ error: "Too much speech in a minute.", fallback: true }, { status: 429 });
  const voice = persona(body.lang, body.gender);

  let exhausted = !(await voiceStatus()).enabled;
  if (!exhausted) {
    const r = await speak(text, voice);
    if ("audio" in r) return audio(r.audio, "audio/mpeg", { "x-voice-engine": "sarvam", "x-voice-cache": r.cached ? "hit" : "miss" });
    exhausted = switchesVoiceOff(r.failure);
  }
  const backup = await backupSpeech(text, voice);
  if (backup) return audio(backup.audio, backup.type, { "x-voice-engine": backup.engine, "x-voice-backup": exhausted ? "exhausted" : "transient" });
  return Response.json({ error: "Couldn't speak that.", exhausted, fallback: true }, { status: 503 });
}

const audio = (bytes: Uint8Array, type: string, headers: Record<string, string>) =>
  new Response(bytes as BodyInit, { headers: { "content-type": type, "cache-control": "no-store", ...headers } });
