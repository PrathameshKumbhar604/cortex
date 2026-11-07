import { WAITLIST_MESSAGE } from "@/lib/approval";
import { accessStatus, session, unauthorized } from "@/server/cortex";
import { getSettings } from "@/server/admin";
import { db } from "@/server/db";

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
