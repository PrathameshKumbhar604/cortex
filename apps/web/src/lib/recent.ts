"use client";

import type { Turn } from "./use-agent";

// Chats are kept per account on the server (/api/chats) and cached in this browser's localStorage, which the UI reads
// synchronously. Changes are pushed shortly after they happen; the server list is merged in when an account signs in.
// shortcut: last write wins per chat; two devices editing the same chat at once can overwrite each other.
const KEY = "cortex.threads";
const EVENT = "cortex:recent";
const MAX = 20;
const OWNER = "cortex.threads.owner";

export interface SavedThread {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  serverThreadId?: string;
  turns: Turn[];
}

/** Pinned first, then most recently used. */
const order = (a: SavedThread, b: SavedThread) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt;

export function readThreads(): SavedThread[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    const all = Array.isArray(v) ? v.filter((t): t is SavedThread => typeof t?.id === "string" && Array.isArray(t.turns)) : [];
    return all.sort(order);
  } catch {
    return [];
  }
}

export function readThread(id: string): SavedThread | undefined {
  return readThreads().find((t) => t.id === id);
}

function write(threads: SavedThread[]) {
  threads.sort(order); // so trimming drops the oldest unpinned threads first
  for (let keep = Math.min(threads.length, MAX); keep >= 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(threads.slice(0, keep)));
      window.dispatchEvent(new Event(EVENT));
      return;
    } catch {
      // quota exceeded (or storage unavailable): retry with fewer threads
    }
  }
}

const dirty = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** Pushes changed chats to the server a moment after the last change (a streaming answer saves many times). */
function push(id: string) {
  dirty.add(id);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const all = readThreads();
    for (const tid of dirty) {
      const t = all.find((x) => x.id === tid);
      if (t) void fetch("/api/chats", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(t), keepalive: true }).catch(() => {});
    }
    dirty.clear();
  }, 1500);
}

/** Server and local lists combined: one entry per chat, the more recently updated copy wins (the server on a tie). */
export function mergeThreads(local: SavedThread[], remote: SavedThread[]): SavedThread[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || r.updatedAt >= l.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()].sort(order);
}

/** On sign-in: bring this account's chats from the server, and send up the ones only this browser has. */
export async function syncThreads() {
  try {
    const res = await fetch("/api/chats");
    if (!res.ok) return;
    const remote = ((await res.json()) as { chats: SavedThread[] }).chats.filter((t) => typeof t?.id === "string" && Array.isArray(t.turns));
    const local = readThreads();
    write(mergeThreads(local, remote));
    const known = new Map(remote.map((t) => [t.id, t.updatedAt]));
    for (const t of local) if ((known.get(t.id) ?? -1) < t.updatedAt) push(t.id);
  } catch {
    // offline: the local copy stays, and syncs next time
  }
}

const earlyTitles = new Map<string, string>();

/** Saves new turns; a title or pin the user set is kept. */
export function saveThread(thread: SavedThread) {
  const all = readThreads();
  const old = all.find((t) => t.id === thread.id);
  const next = { ...thread, title: old?.title ?? earlyTitles.get(thread.id) ?? thread.title, pinned: old?.pinned };
  earlyTitles.delete(thread.id);
  write([next, ...all.filter((t) => t.id !== thread.id)]);
  push(thread.id);
}

export function updateThread(id: string, patch: Partial<Pick<SavedThread, "title" | "pinned">>) {
  write(readThreads().map((t) => (t.id === id ? { ...t, ...patch } : t)));
  push(id);
}

/** Replaces the first-message title with a generated one, unless the user renamed the chat meanwhile. */
export function setAutoTitle(id: string, firstMessage: string, title: string) {
  const t = readThread(id);
  if (!t) earlyTitles.set(id, title); // arrived before the first save
  else if (t.title === firstMessage) updateThread(id, { title });
}

/** Removes a thread and returns it, so the caller can offer undo. */
export function deleteThread(id: string): SavedThread | undefined {
  const all = readThreads();
  write(all.filter((t) => t.id !== id));
  dirty.delete(id);
  void fetch(`/api/chats?id=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).catch(() => {}); // undo puts it back
  return all.find((t) => t.id === id);
}

export function restoreThread(thread: SavedThread) {
  write([...readThreads(), thread]);
  push(thread.id);
}

/**
 * Chats live in this browser, so each account gets its own set: switching accounts puts the previous owner's chats
 * aside and brings this one's back. The first account on a browser keeps the chats from before sign-in.
 */
export function claimThreads(owner: string) {
  try {
    const current = localStorage.getItem(OWNER);
    if (current === owner) return;
    if (current) localStorage.setItem(`${KEY}:${current}`, localStorage.getItem(KEY) ?? "[]");
    localStorage.setItem(KEY, localStorage.getItem(`${KEY}:${owner}`) ?? (current ? "[]" : (localStorage.getItem(KEY) ?? "[]")));
    localStorage.removeItem(`${KEY}:${owner}`);
    localStorage.setItem(OWNER, owner);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage blocked: nothing is stored to mix up
  }
}

export function onRecent(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/** Sends one chat to the server right away (a shared link is made from the server's copy); true once it's saved. */
export async function saveNow(id: string) {
  const t = readThread(id);
  if (!t) return false;
  dirty.delete(id);
  const res = await fetch("/api/chats", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(t) });
  return res.ok;
}
