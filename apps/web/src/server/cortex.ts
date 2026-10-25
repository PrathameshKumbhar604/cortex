import "server-only";
import path from "node:path";
import { cookies } from "next/headers";
import { ActionStore, MemoryClient, type AgentDeps } from "@cortex/agent";
import { buildRegistry, type ConnectorRegistry, type Workspace } from "@cortex/connectors";
import { LlmRouter } from "@cortex/llm";

const root = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");

interface Singletons {
  llm: LlmRouter;
  actions: ActionStore;
  memory: MemoryClient;
  registries: Partial<Record<Workspace, ConnectorRegistry>>;
}

// Survive dev hot reloads: module state would otherwise reset on every edit.
const g = globalThis as typeof globalThis & { __cortex?: Singletons };
function singletons(): Singletons {
  g.__cortex ??= {
    llm: new LlmRouter({ cachePath: path.join(root, ".cache", "llm-cache.json") }),
    actions: new ActionStore(),
    memory: new MemoryClient(),
    registries: {},
  };
  return g.__cortex;
}

export function defaultWorkspace(): Workspace {
  return process.env.COMPOSIO_API_KEY ? "live" : "demo";
}

export interface Session {
  userId: string;
  workspace: Workspace;
}

/** Anonymous per-browser identity (assigned in proxy.ts); Composio links accounts to this id. */
export async function session(): Promise<Session> {
  const jar = await cookies();
  const userId = jar.get("cortex_uid")?.value ?? "anonymous";
  const ws = jar.get("cortex_ws")?.value;
  const workspace: Workspace = ws === "demo" || ws === "live" ? ws : defaultWorkspace();
  return { userId, workspace };
}

export async function setWorkspace(workspace: Workspace) {
  (await cookies()).set("cortex_ws", workspace, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export function deps(workspace: Workspace): AgentDeps {
  const s = singletons();
  s.registries[workspace] ??= buildRegistry(workspace);
  return { llm: s.llm, registry: s.registries[workspace]!, memory: s.memory, actions: s.actions };
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
