import type { ChatTurn, MemoryItem, MemoryKind } from "@cortex/shared";

export interface MemoryWrite {
  userId: string;
  content: string;
  kind: MemoryKind;
  source: string;
  reason: string;
  salience: number;
  runId?: string;
  expiresAt?: string | null;
}

export interface MemoryBackend {
  health(): Promise<{ ok: boolean; backend: string }>;
  recall(userId: string, query: string, limit?: number): Promise<MemoryItem[]>;
  add(m: MemoryWrite): Promise<MemoryItem | null>;
  list(userId: string): Promise<MemoryItem[]>;
  update(id: string, patch: { content?: string; pinned?: boolean }): Promise<MemoryItem>;
  remove(id: string): Promise<void>;
  appendThread(threadId: string, userId: string, turns: ChatTurn[]): Promise<void>;
}

/** HTTP client for the Python memory sidecar (Oracle Agent Memory). */
export class MemoryClient implements MemoryBackend {
  constructor(
    private readonly baseUrl = process.env.MEMORY_SERVICE_URL ?? "http://localhost:8000",
    private readonly timeoutMs = 5000,
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`memory service ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  health() {
    return this.req<{ ok: boolean; backend: string }>("/health");
  }

  recall(userId: string, query: string, limit = 5) {
    return this.req<MemoryItem[]>("/search", { method: "POST", body: JSON.stringify({ user_id: userId, query, limit }) });
  }

  add(m: MemoryWrite) {
    return this.req<MemoryItem | null>("/memories", {
      method: "POST",
      body: JSON.stringify({
        user_id: m.userId,
        content: m.content,
        kind: m.kind,
        source: m.source,
        reason: m.reason,
        salience: m.salience,
        run_id: m.runId,
        expires_at: m.expiresAt,
      }),
    });
  }

  list(userId: string) {
    return this.req<MemoryItem[]>(`/memories?user_id=${encodeURIComponent(userId)}`);
  }

  update(id: string, patch: { content?: string; pinned?: boolean }) {
    return this.req<MemoryItem>(`/memories/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async remove(id: string) {
    await this.req<void>(`/memories/${id}`, { method: "DELETE" });
  }

  async appendThread(threadId: string, userId: string, turns: ChatTurn[]) {
    await this.req<void>(`/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, messages: turns }),
    });
  }
}

const EXPLICIT = [
  { re: /\b(remember|note) that\b(.+)/i, kind: "fact" as const },
  { re: /\b(.+?\b(?:is|are) (?:my|our|the) (?:top|main|biggest|most important|highest) (?:priority|focus|project)\b.*)/i, kind: "priority" as const },
  { re: /\b((?:my|our) (?:top|main) priority (?:is|right now is) .+)/i, kind: "priority" as const },
  { re: /\b(i (?:prefer|like|want|always|never|don't want|do not want) .+)/i, kind: "preference" as const },
];

/** LLM-free detection of things the user explicitly asked Cortex to keep. */
export function explicitMemory(message: string): { content: string; kind: MemoryKind } | null {
  for (const { re, kind } of EXPLICIT) {
    const m = message.match(re);
    const text = (m?.[2] ?? m?.[1])?.trim().replace(/[.!?]+$/, "");
    if (text && text.length > 6 && text.length < 240) {
      return { content: text.charAt(0).toUpperCase() + text.slice(1), kind };
    }
  }
  return null;
}
