"use client";

const KEY = "cortex.recent";
const EVENT = "cortex:recent";

export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x !== q)].slice(0, 8);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage unavailable: recent list is a convenience only
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
