import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SOURCE_COLOR: Record<string, string> = {
  gmail: "var(--src-gmail)",
  calendar: "var(--src-calendar)",
  drive: "var(--src-drive)",
  notion: "var(--src-notion)",
  slack: "var(--src-slack)",
  github: "var(--src-github)",
  web: "var(--src-web)",
  memory: "var(--src-memory)",
  chat: "var(--src-memory)",
  files: "var(--src-files)",
};

export function sourceColor(id: string) {
  return SOURCE_COLOR[id] ?? "var(--muted)";
}

export function shortDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDays(iso?: string) {
  if (!iso) return "";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function seconds(ms?: number) {
  if (ms == null) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
