import type { Turn } from "@/agent/reduce";
import { normalizeTurn } from "@/agent/versions";

// Chats per account: the server (/api/chats) is the shared copy, this phone keeps its own in AsyncStorage per account.
// Same rules as the web (apps/web/src/lib/recent.ts): last write wins per chat, a user's title and pin are kept.
export interface SavedThread {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  serverThreadId?: string;
  turns: Turn[];
}

const MAX = 50; // what /api/chats returns

const order = (a: SavedThread, b: SavedThread) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt;

/** Server and local lists combined: one entry per chat, the more recently updated copy wins (the server on a tie). */
export function mergeThreads(local: SavedThread[], remote: SavedThread[]): SavedThread[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt >= l.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()].sort(order);
}

const valid = (t: unknown): t is SavedThread => !!t && typeof (t as SavedThread).id === "string" && Array.isArray((t as SavedThread).turns);
const clean = (t: SavedThread): SavedThread => ({ ...t, turns: t.turns.map(normalizeTurn) });

interface Deps {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remote: { list: () => Promise<SavedThread[]>; put: (t: SavedThread) => Promise<void>; remove: (id: string) => Promise<void> };
  debounceMs?: number;
}

export function createChatStore(deps: Deps) {
  let owner: string | null = null;
  let threads: SavedThread[] = [];
  const subs = new Set<() => void>();
  const dirty = new Set<string>();
  const earlyTitles = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const key = () => `cortex.chats:${owner}`;

  const emit = () => subs.forEach((f) => f());
  const commit = (next: SavedThread[]) => {
    threads = next.sort(order).slice(0, MAX);
    emit();
    if (owner) void deps.write(key(), JSON.stringify(threads)).catch(() => {});
  };
  /** Pushes changed chats a moment after the last change (a streaming answer saves many times). */
  const push = (id: string) => {
    dirty.add(id);
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const tid of dirty) {
        const t = threads.find((x) => x.id === tid);
        if (t) void deps.remote.put(t).catch(() => {});
      }
      dirty.clear();
    }, deps.debounceMs ?? 1500);
  };

  const store = {
    list: () => threads,
    get: (id: string) => threads.find((t) => t.id === id),
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    /** Loads this account's chats from the phone. */
    async open(userId: string) {
      if (owner === userId) return;
      owner = userId;
      dirty.clear();
      let local: SavedThread[] = [];
      try {
        const v = JSON.parse((await deps.read(key())) ?? "[]");
        local = Array.isArray(v) ? v.filter(valid).map(clean) : [];
      } catch {
        // unreadable: start empty, the server copy comes in on sync
      }
      threads = local.sort(order);
      emit();
    },
    /** Brings the server's chats in and sends up the ones only this phone has. */
    async sync() {
      if (!owner) return;
      try {
        const remote = (await deps.remote.list()).filter(valid).map(clean);
        const known = new Map(remote.map((t) => [t.id, t.updatedAt]));
        const local = threads;
        commit(mergeThreads(local, remote));
        for (const t of local) if ((known.get(t.id) ?? -1) < t.updatedAt) push(t.id);
      } catch {
        // offline: the phone's copy stays and syncs next time
      }
    },
    /** Saves new turns; a title or pin the user set is kept. */
    save(thread: SavedThread) {
      const old = threads.find((t) => t.id === thread.id);
      const next = { ...thread, title: old?.title ?? earlyTitles.get(thread.id) ?? thread.title, pinned: old?.pinned };
      earlyTitles.delete(thread.id);
      commit([next, ...threads.filter((t) => t.id !== thread.id)]);
      push(thread.id);
    },
    update(id: string, patch: Partial<Pick<SavedThread, "title" | "pinned">>) {
      commit(threads.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      push(id);
    },
    /** Replaces the first-message title with a generated one, unless the user renamed the chat meanwhile. */
    setAutoTitle(id: string, firstMessage: string, title: string) {
      const t = threads.find((x) => x.id === id);
      if (!t) earlyTitles.set(id, title);
      else if (t.title === firstMessage) store.update(id, { title });
    },
    remove(id: string): SavedThread | undefined {
      const gone = threads.find((t) => t.id === id);
      commit(threads.filter((t) => t.id !== id));
      dirty.delete(id);
      void deps.remote.remove(id).catch(() => {});
      return gone;
    },
    restore(thread: SavedThread) {
      commit([...threads, thread]);
      push(thread.id);
    },
    /** Sends one chat now (a share link is made from the server's copy). */
    async saveNow(id: string) {
      const t = threads.find((x) => x.id === id);
      if (!t) return false;
      dirty.delete(id);
      await deps.remote.put(t);
      return true;
    },
  };
  return store;
}

export type ChatStore = ReturnType<typeof createChatStore>;
