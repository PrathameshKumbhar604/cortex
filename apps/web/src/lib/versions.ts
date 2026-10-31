import type { Turn } from "./use-agent";

/** One attempt at answering a turn's question, as kept in `Turn.versions`. */
export type Attempt = Omit<Turn, "versions" | "version">;

// A regenerated turn keeps every attempt. The selected one is the turn itself (so history, Copy, Share and saving read
// it unchanged); the others wait in `versions`, with `null` in the selected slot so nothing is stored twice.
// Each attempt has its own id, so a shared link belongs to the attempt that was on screen.

const strip = ({ versions: _v, version: _i, ...a }: Turn): Attempt => a;

/** How many attempts the turn has, and which one (0-based) is shown. Old chats have no versions: one attempt. */
export function versionInfo(t: Turn) {
  return t.versions ? { count: t.versions.length, index: t.version ?? 0 } : { count: 1, index: 0 };
}

/** Shows attempt `i` in place of the current one. */
export function selectVersion(t: Turn, i: number): Turn {
  const { count, index } = versionInfo(t);
  if (!t.versions || i === index || i < 0 || i >= count) return t;
  const slots = [...t.versions];
  slots[index] = strip(t);
  const next = slots[i]!;
  slots[i] = null;
  return { ...next, versions: slots, version: i };
}

/** Files the current attempt away and makes `fresh` the new, last attempt. */
export function addVersion(t: Turn, fresh: Attempt): Turn {
  const { index } = versionInfo(t);
  const slots = t.versions ? [...t.versions] : [null];
  slots[index] = strip(t);
  return { ...fresh, versions: [...slots, null], version: slots.length };
}

const isAttempt = (a: unknown): a is Attempt => !!a && typeof a === "object" && typeof (a as Attempt).id === "string" && typeof (a as Attempt).answer === "string";

/** A saved turn as read back: versions that don't add up (hand-edited, truncated, another app version) are dropped. */
export function normalizeTurn(t: Turn): Turn {
  if (t.versions === undefined && t.version === undefined) return t;
  const v = t.versions;
  const i = t.version;
  const ok = Array.isArray(v) && v.length > 1 && Number.isInteger(i) && i! >= 0 && i! < v.length && v[i!] === null && v.every((a, k) => k === i || isAttempt(a));
  if (ok) return t;
  const { versions: _v, version: _i, ...rest } = t;
  return rest;
}
