import { api } from "@/api/client";

export type UserKind = "returning" | "new";

/** Someone who already has chats, memories or a connected app has used Cortex (on the web) before. */
export function classifyUser(data: { chats: unknown[]; memory: unknown[]; connections: { connected: boolean }[] }): UserKind {
  return data.chats.length > 0 || data.memory.length > 0 || data.connections.some((c) => c.connected) ? "returning" : "new";
}

/** Asks the server. Sample-workspace connectors always look connected, so only real (live) ones count. */
export async function fetchUserKind(): Promise<UserKind> {
  const [chats, memory, conns] = await Promise.all([
    api<{ chats: unknown[] }>("/api/chats").catch(() => ({ chats: [] })),
    api<{ items: unknown[] }>("/api/memory").catch(() => ({ items: [] })),
    api<{ workspace: string; connectors: { connected: boolean }[] }>("/api/connections").catch(() => ({ workspace: "demo", connectors: [] })),
  ]);
  return classifyUser({ chats: chats.chats, memory: memory.items, connections: conns.workspace === "live" ? conns.connectors : [] });
}
