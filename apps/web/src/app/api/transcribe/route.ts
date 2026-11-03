import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { groqTranscribe } from "@/server/stt";

const MAX_BYTES = 8 * 1024 * 1024; // a ~30 s Opus chunk is ~200 KB; Groq's free tier takes up to 25 MB

/** Speech to text for mic mode: one recorded chunk in, its text out, via Groq's free Whisper. Audio is never stored. */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!process.env.GROQ_API_KEY) return jsonError("Voice transcription isn't set up on this server.", 503);
  if (!withinLimit(`stt:${sess.userId}`, 12)) return jsonError("Too much audio in a minute. Wait a few seconds and try again.", 429);

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || !audio.size) return jsonError("audio is required");
  if (audio.size > MAX_BYTES) return jsonError("That recording is too long to transcribe in one go.", 413);
  if (!/^(audio|video)\//.test(audio.type)) return jsonError("That doesn't look like audio.", 415);
  const lang = String(form?.get("lang") ?? "").slice(0, 2).toLowerCase();

  try {
    return Response.json({ text: (await groqTranscribe(audio, lang)).trim() });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429) return jsonError("Transcription is busy right now. Try again in a minute.", 429);
    if (status) return jsonError("Couldn't transcribe that recording.", 502);
    return jsonError("Transcription took too long. Try again.", 504);
  }
}
