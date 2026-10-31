import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";

const MAX_BYTES = 8 * 1024 * 1024; // a ~30 s Opus chunk is ~200 KB; Groq's free tier takes up to 25 MB

/** Speech to text for mic mode: one recorded chunk in, its text out, via Groq's free Whisper. Audio is never stored. */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  const key = process.env.GROQ_API_KEY;
  if (!key) return jsonError("Voice transcription isn't set up on this server.", 503);
  if (!withinLimit(`stt:${sess.userId}`, 12)) return jsonError("Too much audio in a minute. Wait a few seconds and try again.", 429);

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || !audio.size) return jsonError("audio is required");
  if (audio.size > MAX_BYTES) return jsonError("That recording is too long to transcribe in one go.", 413);
  if (!/^(audio|video)\//.test(audio.type)) return jsonError("That doesn't look like audio.", 415);
  const lang = String(form?.get("lang") ?? "").slice(0, 2).toLowerCase();

  const out = new FormData();
  out.set("file", audio, audio.name || "speech.webm");
  out.set("model", process.env.GROQ_MODEL_STT ?? "whisper-large-v3-turbo");
  out.set("response_format", "json");
  if (/^[a-z]{2}$/.test(lang)) out.set("language", lang);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: out,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) return jsonError("Transcription is busy right now. Try again in a minute.", 429);
    if (!res.ok) return jsonError("Couldn't transcribe that recording.", 502);
    const { text } = (await res.json()) as { text?: string };
    return Response.json({ text: (text ?? "").trim() });
  } catch {
    return jsonError("Transcription took too long. Try again.", 504);
  }
}
