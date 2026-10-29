"use client";

import type { Turn } from "./use-agent";

// shortcut: threads live in this browser's localStorage (no sync across devices); move server-side with auth (checklist #2, #7).
const KEY = "cortex.threads";
const EVENT = "cortex:recent";
const MAX = 20;

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

const earlyTitles = new Map<string, string>();

/** Saves new turns; a title or pin the user set is kept. */
export function saveThread(thread: SavedThread) {
  const all = readThreads();
  const old = all.find((t) => t.id === thread.id);
  const next = { ...thread, title: old?.title ?? earlyTitles.get(thread.id) ?? thread.title, pinned: old?.pinned };
  earlyTitles.delete(thread.id);
  write([next, ...all.filter((t) => t.id !== thread.id)]);
}

export function updateThread(id: string, patch: Partial<Pick<SavedThread, "title" | "pinned">>) {
  write(readThreads().map((t) => (t.id === id ? { ...t, ...patch } : t)));
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
  return all.find((t) => t.id === id);
}

export function restoreThread(thread: SavedThread) {
  write([...readThreads(), thread]);
}

export function onRecent(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
