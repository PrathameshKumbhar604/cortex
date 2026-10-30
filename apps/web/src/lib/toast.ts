"use client";

/** Small, passing notices ("You're offline", "Couldn't upload x"). Calm by default; they leave on their own. */
export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "warn";
}

let next = 1;
let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function toast(title: string, opts: { body?: string; tone?: Toast["tone"]; ms?: number } = {}) {
  const same = toasts.find((x) => x.title === title);
  if (same) return same.id; // the same notice twice shows once
  const t: Toast = { id: next++, title, body: opts.body, tone: opts.tone ?? "info" };
  toasts = [...toasts, t].slice(-3);
  emit();
  setTimeout(() => dismiss(t.id), opts.ms ?? 5000);
  return t.id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function onToasts(fn: (t: Toast[]) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
