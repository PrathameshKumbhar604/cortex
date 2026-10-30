import { clerkClient } from "@clerk/nextjs/server";
import { logEvent } from "@/server/admin";
import { db, getLocalUser } from "@/server/db";
import { jsonError, requireAdmin, syncRole } from "@/server/cortex";

/**
 * Change one account's role or turn it off/on. Off takes effect on the account's very next request (Cortex checks its
 * own flag) and is mirrored to Clerk as a ban, which ends its sessions and blocks signing in again.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const sess = await requireAdmin();
  if (sess instanceof Response) return sess;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { role?: string; disabled?: boolean };
  if (id === sess.authId) return jsonError("You can't change your own role or turn off your own account here.", 400);
  if (!getLocalUser(id)) return jsonError("That account doesn't exist any more.", 404);
  if (body.role === "admin" || body.role === "member") {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(body.role, id);
    await syncRole(id, body.role);
    await logEvent(sess.email, "admin.role", id, body.role);
  }
  if (typeof body.disabled === "boolean") {
    db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(body.disabled ? 1 : 0, id);
    try {
      const clerk = await clerkClient();
      await (body.disabled ? clerk.users.banUser(id) : clerk.users.unbanUser(id));
    } catch {
      // Cortex's own flag already blocks the account; Clerk catches up on the next change
    }
    await logEvent(sess.email, body.disabled ? "admin.disable" : "admin.enable", id);
  }
  return new Response(null, { status: 204 });
}
