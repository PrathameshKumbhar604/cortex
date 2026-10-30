import "server-only";
import path from "node:path";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { dataIdFor, db, getLocalUser, isOwner, mayUseLive, touchUser, upsertUser } from "./db";
import { filesConnector } from "./files";
import { ActionStore, MemoryClient, type AgentDeps } from "@cortex/agent";
import { buildRegistry, ConnectorRegistry, type Workspace } from "@cortex/connectors";
import { getSettings } from "./admin";
import { LlmRouter } from "@cortex/llm";

const root = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");

interface Singletons {
  llm: LlmRouter;
  actions: ActionStore;
  registries: Partial<Record<Workspace, ConnectorRegistry>>;
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
  /** May connect their own apps: always with a Composio project key, admins only with a personal one (see mayUseLive). */
  liveAllowed: boolean;
  /** The account id (usage, roles and the activity log are per account, not per data id). */
  authId: string;
  admin: boolean;
}

const RESYNC_MS = 10 * 60_000; // how often the local copy of an account is refreshed from Clerk

/**
 * The signed-in user, or null (every API route returns 401 on null). Clerk proves who it is; Cortex keeps its own copy
 * of the account (role, on/off, last active) and refreshes email and name from Clerk every few minutes.
 */
export async function session(): Promise<Session | null> {
  await connection(); // per request, never prerendered (it reads the clock and the database)
  const { userId } = await auth();
  if (!userId) return null;
  let local = getLocalUser(userId);
  if (!local || Date.now() - local.syncedAt > RESYNC_MS) {
    const u = await currentUser();
    if (!u) return null;
    const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
    upsertUser({
      id: u.id,
      email: primary?.emailAddress ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      verified: primary?.verification?.status === "verified",
      createdAt: new Date(u.createdAt).toISOString(),
    });
    local = getLocalUser(userId)!;
  }
  if (local.disabled) return null; // turned off by an admin: treated as signed out everywhere, at once
  touchUser(userId);
  let admin = local.role === "admin";
  if (!admin && isOwner(local.email, local.verified)) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId); // the owner is always an admin
    void syncRole(userId, "admin");
    admin = true;
  }
  const jar = await cookies();
  const ws = jar.get("cortex_ws")?.value;
  const liveAllowed = mayUseLive(admin);
  const wanted: Workspace = ws === "demo" || ws === "live" ? ws : defaultWorkspace();
  const workspace: Workspace = wanted === "live" && !liveAllowed ? "demo" : wanted;
  return { userId: dataIdFor(userId, jar.get("cortex_uid")?.value), workspace, email: local.email, name: local.name, liveAllowed, authId: userId, admin };
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
  return true;
}

export async function setWorkspace(workspace: Workspace) {
  (await cookies()).set("cortex_ws", workspace, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export function deps(workspace: Workspace): AgentDeps {
  const s = singletons();
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

export function llmProviders() {
  return singletons().llm.configured;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
