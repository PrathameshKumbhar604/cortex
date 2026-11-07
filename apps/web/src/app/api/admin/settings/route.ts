import { getSettings, logEvent, saveSettings } from "@/server/admin";
import { isSignupApproval } from "@/lib/approval";
import { jsonError, requireAdmin } from "@/server/cortex";

export async function PUT(req: Request) {
  const sess = await requireAdmin();
  if (sess instanceof Response) return sess;
  const body = (await req.json().catch(() => ({}))) as { dailyQuestionLimit?: unknown; allowedConnectors?: unknown; signupApproval?: unknown };
  const limit = body.dailyQuestionLimit;
  if (limit !== null && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10_000)) {
    return jsonError("The daily limit must be a whole number from 1 to 10,000, or no limit.");
  }
  const allowed = body.allowedConnectors;
  if (allowed !== null && (!Array.isArray(allowed) || !allowed.every((x) => typeof x === "string" && /^[\w-]{1,40}$/.test(x)))) {
    return jsonError("Choose which apps to allow.");
  }
  if (body.signupApproval !== undefined && !isSignupApproval(body.signupApproval)) return jsonError("Sign-up approval must be automatic or manual.");
  // Left out by an older page: keep what is set.
  const signupApproval = isSignupApproval(body.signupApproval) ? body.signupApproval : (await getSettings()).signupApproval;
  const settings = { dailyQuestionLimit: limit as number | null, allowedConnectors: allowed as string[] | null, signupApproval };
  await saveSettings(settings);
  await logEvent(sess.email, "admin.settings", "", JSON.stringify(settings));
  return Response.json({ settings });
}
