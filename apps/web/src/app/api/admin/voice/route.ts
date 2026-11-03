import { jsonError, requireAdmin } from "@/server/cortex";
import { enableVoice, voiceStatus } from "@/server/voice";

/** Turns voice mode back on for everyone (after topping up Sarvam credits, say). */
export async function PUT(req: Request) {
  const sess = await requireAdmin();
  if (sess instanceof Response) return sess;
  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (body.enabled !== true) return jsonError("Only turning voice mode back on is supported.");
  await enableVoice(sess.email);
  return Response.json({ voice: await voiceStatus() });
}
