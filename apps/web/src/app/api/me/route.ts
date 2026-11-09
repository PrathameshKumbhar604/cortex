import { auth } from "@clerk/nextjs/server";
import { WAITLIST_MESSAGE } from "@/lib/approval";
import { deleteAccount } from "@/server/account";
import { accessStatus, jsonError, session, unauthorized } from "@/server/cortex";
import { getSettings } from "@/server/admin";
import { db, getLocalUser } from "@/server/db";

/**
 * Whether the signed-in account may use Cortex, or is on the waitlist (web and app show the waitlist screen). Admins
 * also get how many accounts are waiting, for the badge on the Admin link.
 */
export async function GET() {
  const status = await accessStatus();
  if (!status) return unauthorized();
  if (status === "pending") return Response.json({ status, message: WAITLIST_MESSAGE });
  const sess = await session();
  if (!sess?.admin) return Response.json({ status });
  if ((await getSettings()).signupApproval === "auto") return Response.json({ status, waiting: 0 }); // nobody waits in auto
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE approved = 0 AND disabled = 0 AND role != 'admin'").get() as { n: number };
  return Response.json({ status, waiting: n });
}

/**
 * Deletes the signed-in account and all its data (see server/account.ts). Open to anyone signed in, including
 * accounts still on the waitlist. The body must say {"confirm":true}, so nothing deletes an account by accident.
 */
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== true) return jsonError("Confirm that you want to delete your account.");
  const email = getLocalUser(userId)?.email ?? userId;
  try {
    await deleteAccount(userId, email);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[account] delete failed:", err);
    return jsonError("Your account couldn't be fully deleted just now. Nothing was lost; try again in a minute.", 503);
  }
}
