import { logEvent } from "@/server/admin";
import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";

const REASONS = ["harmful", "offensive", "wrong", "other"];

/**
 * Someone flags an answer as harmful, offensive or wrong (Google Play requires this in apps that generate text). It is
 * kept in the admin's activity log with the question and the start of the answer, which the reporter chose to send.
 */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!withinLimit(`report:${sess.authId}`, 10, 60 * 60_000)) return jsonError("That's a lot of reports in a short time. Try again in a while.", 429);
  const body = (await req.json().catch(() => null)) as { reason?: unknown; question?: unknown; answer?: unknown } | null;
  const reason = REASONS.find((r) => r === body?.reason);
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!reason || !answer) return jsonError("Choose what's wrong with the answer.");
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  await logEvent(sess.email, "answer.report", reason, `Q: ${question.slice(0, 140)} | A: ${answer.slice(0, 340)}`);
  return Response.json({ ok: true });
}
