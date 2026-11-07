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
let seen = readSeen();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function loadBrief(refresh = false) {
  try {
    state = await api<BriefState>(`/api/brief${refresh ? "?refresh=1" : ""}`, { timeoutMs: 20_000 });
  } catch (e) {
    state = { brief: state?.brief ?? null, generating: false, error: e instanceof Error ? e.message : "Couldn't load the brief." };
  }
  emit();
  return state;
}

/** Remembers the cards on screen as seen (the 200 most recent keys). */
export function markSeen(cards: BriefCard[]) {
  seen = [...new Set([...cards.map(cardKey), ...seen])].slice(0, 200);
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
  const unseen = v?.brief ? unseenCount(v.brief.cards, seen) : 0;
  return { state: v, unseen };
}
