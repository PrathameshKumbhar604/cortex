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
  /** Id of a memory this one updates; the service deletes it. */
  replaces?: string;
}

export interface MemoryBackend {
  health(): Promise<{ ok: boolean; backend: string }>;
  recall(userId: string, query: string, limit?: number): Promise<MemoryItem[]>;
  add(m: MemoryWrite): Promise<MemoryItem | null>;
  list(userId: string): Promise<MemoryItem[]>;
  update(id: string, patch: { content?: string; pinned?: boolean }): Promise<MemoryItem>;
  remove(id: string): Promise<void>;
  appendThread(threadId: string, userId: string, turns: ChatTurn[]): Promise<void>;
  /** The user's other chats that relate to the query; only called when they opted in. */
  /** With `recent`, a question that names no topic gets the latest chats instead of nothing. */
  searchChats(userId: string, query: string, excludeThreadId?: string, recent?: boolean): Promise<PastChat[]>;
  deleteThread(threadId: string, userId: string): Promise<void>;
}

export interface PastChat {
  threadId: string;
  question: string;
  answer: string;
  createdAt: string;
}

/** HTTP client for the Python memory sidecar (Oracle Agent Memory). */
export class MemoryClient implements MemoryBackend {
  constructor(
    private readonly baseUrl = process.env.MEMORY_SERVICE_URL ?? "http://localhost:8000",
    private readonly timeoutMs = 5000,
  ) {}

  private async req<T>(path: string, init?: RequestInit, timeoutMs = this.timeoutMs): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(timeoutMs),
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
        replaces: m.replaces,
      }),
    }, 15_000); // writes embed and de-duplicate in Oracle, and run after the answer is shown
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

  async searchChats(userId: string, query: string, excludeThreadId?: string, recent = false) {
    const rows = await this.req<{ thread_id: string; question: string; answer: string; created_at: string }[]>("/threads/search", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, query, exclude_thread: excludeThreadId, recent }),
    });
    return rows.map((r) => ({ threadId: r.thread_id, question: r.question, answer: r.answer, createdAt: r.created_at }));
  }

  async deleteThread(threadId: string, userId: string) {
    await this.req<void>(`/threads/${encodeURIComponent(threadId)}?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
  }
}

const EXPLICIT = [
  { re: /\b(remember|note) that\b(.+)/i, kind: "fact" as const },
  { re: /\b(.+?\b(?:is|are) (?:my|our|the) (?:top|main|biggest|most important|highest) (?:priority|focus|project)\b.*)/i, kind: "priority" as const },
  { re: /\b((?:my|our) (?:top|main) priority (?:is|right now is) .+)/i, kind: "priority" as const },
  // Standing preferences only; "I want the latest pdf" is a request, not a preference.
  { re: /\b(i (?:prefer|always|never|don't want|do not want) .+)/i, kind: "preference" as const },
];

/** LLM-free detection of things the user explicitly asked Cortex to keep. */
export function explicitMemory(message: string): { content: string; kind: MemoryKind } | null {
  if (/\?\s*$/.test(message) && !/\b(remember|note) that\b/i.test(message)) return null; // a question states nothing to keep
  for (const { re, kind } of EXPLICIT) {
    const m = message.match(re);
    const text = (m?.[2] ?? m?.[1])?.trim().replace(/[.!?]+$/, "");
    if (text && text.length > 6 && text.length < 240) {
      return { content: text.charAt(0).toUpperCase() + text.slice(1), kind };
    }
  }
  return null;
}
