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
  serverThreadId?: string;
  turns: Turn[];
}

export function readThreads(): SavedThread[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((t): t is SavedThread => typeof t?.id === "string" && Array.isArray(t.turns)) : [];
  } catch {
    return [];
  }
}

export function readThread(id: string): SavedThread | undefined {
  return readThreads().find((t) => t.id === id);
}

export function saveThread(thread: SavedThread) {
  const rest = readThreads().filter((t) => t.id !== thread.id);
  // Oldest threads go first when storage is full.
  for (let keep = MAX - 1; keep >= 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify([thread, ...rest.slice(0, keep)]));
      window.dispatchEvent(new Event(EVENT));
      return;
    } catch {
      // quota exceeded (or storage unavailable): retry with fewer threads
    }
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
