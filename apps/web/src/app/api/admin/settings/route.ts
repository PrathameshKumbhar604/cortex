import { logEvent, saveSettings } from "@/server/admin";
import { jsonError, requireAdmin } from "@/server/cortex";

export async function PUT(req: Request) {
  const sess = await requireAdmin();
  if (sess instanceof Response) return sess;
  const body = (await req.json().catch(() => ({}))) as { dailyQuestionLimit?: unknown; allowedConnectors?: unknown };
  const limit = body.dailyQuestionLimit;
  if (limit !== null && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10_000)) {
    return jsonError("The daily limit must be a whole number from 1 to 10,000, or no limit.");
  }
  const allowed = body.allowedConnectors;
  if (allowed !== null && (!Array.isArray(allowed) || !allowed.every((x) => typeof x === "string" && /^[\w-]{1,40}$/.test(x)))) {
    return jsonError("Choose which apps to allow.");
  }
  const settings = { dailyQuestionLimit: limit as number | null, allowedConnectors: allowed as string[] | null };
  await saveSettings(settings);
  await logEvent(sess.email, "admin.settings", "", JSON.stringify(settings));
  return Response.json({ settings });
}
