import { isDisposableEmail } from "@/lib/disposable";
import { jsonError, withinLimit } from "@/server/cortex";

/** Public (before sign-up): says whether an email is a throwaway inbox, so the form can refuse it up front. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!withinLimit(`email-check:${ip}`, 20)) return jsonError("Too many tries in a row. Wait a minute, then try again.", 429);
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== "string") return jsonError("email is required");
  return Response.json({ disposable: isDisposableEmail(body.email) });
}
