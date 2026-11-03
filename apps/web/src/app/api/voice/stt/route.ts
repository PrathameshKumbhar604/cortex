import { isLang } from "@/lib/voice";
import { switchesVoiceOff } from "@/lib/sarvam";
import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { transcribe } from "@/server/stt";
import { voiceStatus } from "@/server/voice";

const MAX_BYTES = 2 * 1024 * 1024; // a 30 s turn of 16 kHz 16-bit WAV is ~1 MB

/** One spoken turn in, its words out. Free engines first (see stt.ts); Sarvam only while voice mode is switched on. */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`vstt:${sess.userId}`, 20)) return jsonError("That's a lot of talking in a minute. Give it a few seconds.", 429);
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  const lang = form?.get("lang");
  if (!(audio instanceof File) || !audio.size) return jsonError("audio is required");
  if (audio.size > MAX_BYTES) return jsonError("That turn is too long to transcribe in one go.", 413);
  if (!/^audio\//.test(audio.type)) return jsonError("That doesn't look like audio.", 415);
  if (!isLang(lang)) return jsonError("Choose a language.");
  const r = await transcribe(audio, lang, { sarvam: (await voiceStatus()).enabled });
  return Response.json({ text: r.text, engine: r.engine, exhausted: r.sarvam ? switchesVoiceOff(r.sarvam) : false });
}
