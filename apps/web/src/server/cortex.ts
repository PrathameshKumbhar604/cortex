import "server-only";
import path from "node:path";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { isDisposableEmail } from "@/lib/disposable";
import { dataIdFor, db, getLocalUser, isOwner, mayUseLive, touchUser, upsertUser, type LocalUser } from "./db";
import { approvedOnSignUp, needsApproval } from "@/lib/approval";
import { filesConnector } from "./files";
import { ActionStore, MemoryClient, type AgentDeps } from "@cortex/agent";
import { buildRegistry, claimUntaggedAccounts, ConnectorRegistry, type Workspace } from "@cortex/connectors";
import { getSettings } from "./admin";
import { chooseWorkspace } from "@/lib/workspace";
import { LlmRouter } from "@cortex/llm";

const root = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");

interface Singletons {
  llm: LlmRouter;
  actions: ActionStore;
  registries: Partial<Record<Workspace, ConnectorRegistry>>;
  /** The buildRegistry the cached registries came from; a hot reload of the connectors brings a new one. */
  builtWith?: typeof buildRegistry;
}

// Survive dev hot reloads: module state would otherwise reset on every edit.
const g = globalThis as typeof globalThis & { __cortex?: Singletons };
function singletons(): Singletons {
  g.__cortex ??= {
    llm: new LlmRouter({ cachePath: path.join(root, ".cache", "llm-cache.json") }),
    actions: new ActionStore(),
    registries: {},
  };
  return g.__cortex;
}

export function defaultWorkspace(): Workspace {
  return process.env.COMPOSIO_API_KEY ? "live" : "demo";
}

export interface Session {
  /** The data id: connections, memories, chats and files are keyed by it (see dataIdFor). */
  userId: string;
  workspace: Workspace;
  email: string;
  name: string;
  /** May connect their own apps: everyone, whenever a Composio key is set (see mayUseLive). */
  liveAllowed: boolean;
  /** The account id (usage, roles and the activity log are per account, not per data id). */
  authId: string;
  admin: boolean;
}

const RESYNC_MS = 10 * 60_000; // how often the local copy of an account is refreshed from Clerk

/** Who is signed in, synced from Clerk, and whether they may use Cortex; null when signed out. */
async function localAccount(): Promise<{ userId: string; local: LocalUser; status: "approved" | "pending" | "off" } | null> {
  await connection(); // per request, never prerendered (it reads the clock and the database)
  const { userId } = await auth();
  if (!userId) return null;
  let local = getLocalUser(userId);
  if (!local || Date.now() - local.syncedAt > RESYNC_MS) {
    const u = await currentUser();
    if (!u) return null;
    const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
    // A brand-new account starts on the waitlist when the admin has sign-up approval set to manual.
    const approved = local ? true : approvedOnSignUp((await getSettings()).signupApproval);
    upsertUser(
      {
        id: u.id,
        email: primary?.emailAddress ?? "",
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        verified: primary?.verification?.status === "verified",
        createdAt: new Date(u.createdAt).toISOString(),
      },
      approved,
    );
    local = getLocalUser(userId)!;
  }
  if (local.disabled) return { userId, local, status: "off" }; // turned off by an admin: treated as signed out everywhere, at once
  if (isDisposableEmail(local.email)) return { userId, local, status: "off" }; // throwaway inbox: the sign-up form refuses it, this stops anyone who skipped the form
  if (needsApproval(local, (await getSettings()).signupApproval, isOwner)) return { userId, local, status: "pending" };
  return { userId, local, status: "approved" };
}

/** For /api/me: whether the signed-in account may use Cortex or is waiting for approval. */
export async function accessStatus(): Promise<"approved" | "pending" | null> {
  const account = await localAccount();
  return account && account.status !== "off" ? account.status : null;
}

/**
 * The signed-in, approved user, or null (every API route returns 401 on null). Clerk proves who it is; Cortex keeps its own copy
 * of the account (role, on/off, last active) and refreshes email and name from Clerk every few minutes.
 */
export async function session(): Promise<Session | null> {
  const account = await localAccount();
  if (!account || account.status !== "approved") return null; // turned off, throwaway, or still on the waitlist
  const { userId, local } = account;
  touchUser(userId);
  let admin = local.role === "admin";
  if (!admin && isOwner(local.email, local.verified)) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId); // the owner is always an admin
    void syncRole(userId, "admin");
    admin = true;
  }
  const jar = await cookies();
  const liveAllowed = mayUseLive();
  const workspace = chooseWorkspace(jar.get("cortex_ws")?.value, liveAllowed, defaultWorkspace());
  const dataId = dataIdFor(userId, jar.get("cortex_uid")?.value);
  if (isOwner(local.email, local.verified)) claimOwnerAccounts(dataId);
  return { userId: dataId, workspace, email: local.email, name: local.name, liveAllowed, authId: userId, admin };
}

const claimed = new Set<string>();
/** The ck_ key owner's own Composio accounts (untagged) go to the owner's Cortex user; once per process, in the background. */
function claimOwnerAccounts(dataId: string) {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key?.startsWith("ck_") || claimed.has(dataId)) return;
  claimed.add(dataId);
  claimUntaggedAccounts(key, dataId).catch(() => claimed.delete(dataId)); // try again on a later request
}

/** Mirrors the role into Clerk's public metadata, so the browser knows to show the Admin link (a hint only). */
export async function syncRole(userId: string, role: "admin" | "member") {
  try {
    await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { role } });
  } catch {
    // the local role is what the server checks; the hint can catch up later
  }
}

/** Signed in and an admin, or the response to send instead (401 / 403). */
export async function requireAdmin(): Promise<Session | Response> {
  const sess = await session();
  if (!sess) return unauthorized();
  return sess.admin ? sess : jsonError("Only admins can see this.", 403);
}

export function unauthorized() {
  return jsonError("Sign in to continue.", 401);
}

// shortcut: per-process memory, fine for one server; move to the database or Redis when running several.
const hits = new Map<string, number[]>();
/** Sliding-window limit per user and kind; false when over. */
export function withinLimit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  // Keys include client-sent values (an IP header): forget idle ones, so the map can't be grown without limit.
  if (hits.size > 5000) for (const [k, v] of hits) if (now - (v.at(-1) ?? 0) > 60 * 60_000) hits.delete(k);
  return true;
}

export async function setWorkspace(workspace: Workspace) {
  (await cookies()).set("cortex_ws", workspace, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export function deps(workspace: Workspace): AgentDeps {
  const s = singletons();
  // Old connector instances keep their old class (e.g. without disconnect()), so rebuild after the connectors change.
  if (s.builtWith !== buildRegistry) {
    s.registries = {};
    s.builtWith = buildRegistry;
  }
  s.registries[workspace] ??= buildRegistry(workspace);
  if (!s.registries[workspace].get("files")) s.registries[workspace].register(filesConnector); // uploads are a source in both workspaces
  // The memory client is stateless; not cached, so a dev hot reload never leaves an old copy behind.
  return { llm: s.llm, registry: s.registries[workspace]!, memory: new MemoryClient(), actions: s.actions };
}

/** deps() with the admin's settings applied: only the allowed apps (uploads always stay). */
export async function depsFor(sess: Session): Promise<AgentDeps> {
  const d = deps(sess.workspace);
  const { allowedConnectors } = await getSettings();
  if (!allowedConnectors) return d;
  const registry = new ConnectorRegistry();
  for (const c of d.registry.list()) if (c.id === "files" || allowedConnectors.includes(c.id)) registry.register(c);
  return { ...d, registry };
}

/** Memory is per workspace so sample-data memories never mix with real ones. */
export function memoryUser(sess: Session) {
  return sess.workspace === "demo" ? `${sess.userId}:demo` : sess.userId;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
