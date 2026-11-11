import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/api/client";
import { prefs } from "@/storage";
import type { Evidence, SourceFailure } from "@cortex/shared";

// The brief, and which of its cards this phone has already shown. "Brief · N new" counts the rest; nothing on the server.
export interface BriefCard {
  kind: "changed" | "risk" | "conflict" | "upcoming";
  title: string;
  detail: string;
  when: string | null;
  evidence: Evidence[];
}
export interface Brief {
  headline: string;
  cards: BriefCard[];
  failures: SourceFailure[];
  generatedAt: string;
  sources: number;
}
export interface BriefState {
  brief: Brief | null;
  generating: boolean;
  error?: string;
}

export const cardKey = (c: { kind: string; title: string }) => `${c.kind}:${c.title}`;
export const unseenCount = (cards: { kind: string; title: string }[], seen: string[]) => cards.filter((c) => !seen.includes(cardKey(c))).length;

const SEEN = "cortex.brief.seen";
const readSeen = (): string[] => {
  try {
    return JSON.parse(prefs.getString(SEEN) ?? "[]");
  } catch {
    return [];
  }
};

let state: BriefState | null = null;
let seen: string[] | null = null; // read on first use: settings load after this module
const getSeen = () => (seen ??= readSeen());
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** The sources the brief covers, as picked on the Brief screen (all of them when nothing is picked). */
export const readPick = (): string[] | null => {
  try {
    const v = JSON.parse(prefs.getString("cortex.brief.pick") ?? "null");
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
};

export async function loadBrief(refresh = false) {
  const q = new URLSearchParams();
  const pick = readPick();
  if (pick) q.set("sources", pick.join(","));
  if (refresh) q.set("refresh", "1");
  try {
    state = await api<BriefState>(`/api/brief?${q}`, { timeoutMs: 20_000 });
  } catch (e) {
    state = { brief: state?.brief ?? null, generating: false, error: e instanceof Error ? e.message : "Couldn't load the brief." };
  }
  emit();
  return state;
}

/** Signed out: the brief belonged to that account. */
export function resetBrief() {
  state = null;
  seen = null;
  emit();
}

/** Remembers the cards on screen as seen (the 200 most recent keys). */
export function markSeen(cards: BriefCard[]) {
  seen = [...new Set([...cards.map(cardKey), ...getSeen()])].slice(0, 200);
  prefs.set(SEEN, JSON.stringify(seen));
  emit();
}

export function useBrief() {
  const v = useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
  );
  useEffect(() => {
    if (!state) void loadBrief();
  }, []);
  const unseen = v?.brief ? unseenCount(v.brief.cards, getSeen()) : 0;
  return { state: v, unseen };
}
