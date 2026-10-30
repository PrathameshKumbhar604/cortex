import type { SourceFailure } from "./index";

/**
 * Every problem a person can see, in calm, plain words: what happened, what it means for them, and one thing to do.
 * The raw reason never leads; it stays available behind "Details" for whoever needs it.
 */
export interface Explained {
  title: string;
  body: string;
  action?: { kind: "retry" } | { kind: "link"; label: string; href: string };
  /** The technical reason, shown only on request. */
  detail?: string;
}

const EXPIRED = /sign-?in expired|reconnect|401|403|unauthori[sz]ed|forbidden|invalid_grant|no (active )?connect/i;
const BUSY = /429|rate|too many|busy|quota/i;
const SLOW = /time(d)? ?out|did not respond in time|ETIMEDOUT|took too long/i;
const UNREACHABLE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|network|could not be reached|unreachable|offline|503/i;

/** A source that failed during an answer. The answer still went ahead with the others. */
export function explainFailure(f: SourceFailure): Explained {
  const detail = f.reason || undefined;
  if (f.source === "memory")
    return { title: "Memory was out of reach", body: "This answer doesn't use your saved priorities and preferences. They're safe; this is temporary.", detail };
  if (f.source === "llm") return { title: "The free AI models are busy", body: "This usually clears within a minute.", action: { kind: "retry" }, detail };
  if (EXPIRED.test(f.reason))
    return {
      title: `${f.name} needs you to sign in again`,
      body: `Connections expire now and then. Reconnect ${f.name} and ask again to include it.`,
      action: { kind: "link", label: `Reconnect ${f.name}`, href: "/connections" },
      detail,
    };
  if (BUSY.test(f.reason)) return { title: `${f.name} asked Cortex to slow down`, body: "This answer uses your other apps. Ask again in a minute to include it.", detail };
  if (SLOW.test(f.reason)) return { title: `${f.name} was slow to answer`, body: "This answer uses your other apps. Ask again to include it.", action: { kind: "retry" }, detail };
  return { title: `${f.name} couldn't be reached just now`, body: "This answer uses your other apps. Ask again later to include it.", action: { kind: "retry" }, detail };
}

/** A whole answer that didn't happen. */
export function explainError(message: string): Explained {
  const detail = message;
  if (/^stopped\.?$/i.test(message.trim())) return { title: "Stopped", body: "You stopped this answer. Ask again whenever you're ready.", action: { kind: "retry" } };
  if (/sign in to continue|401/i.test(message))
    return { title: "You've been signed out", body: "Sign in again to keep going. Your chats are still here.", action: { kind: "link", label: "Sign in", href: "/sign-in" } };
  if (/free model|AI models? (are|is) busy|LlmUnavailable/i.test(message)) return { title: "The free AI models are busy", body: "This usually clears within a minute.", action: { kind: "retry" }, detail };
  if (/a lot of questions|too many (questions|actions|uploads|tries)|429/i.test(message))
    return { title: "That was a lot at once", body: "Give it a few seconds, then try again.", action: { kind: "retry" }, detail };
  if (SLOW.test(message))
    return { title: "That took longer than usual", body: "Try again, or switch to Fast for a quicker, single-pass answer.", action: { kind: "retry" }, detail };
  if (/connection lost|failed to fetch|network/i.test(message))
    return { title: "Lost the connection to Cortex", body: "Check your internet connection, then try again.", action: { kind: "retry" }, detail };
  if (/only admins/i.test(message)) return { title: "This page is for admins", body: "Ask an admin of this Cortex if you need something changed." };
  if (/memory service|memory.*(reach|offline)/i.test(message))
    return { title: "Memory is out of reach right now", body: "Your memories are safe. Try again in a moment.", action: { kind: "retry" }, detail };
  // Already a plain sentence written for people (our own API messages): keep it, under a neutral title.
  if (message.length < 180 && /[.!]$/.test(message.trim()) && !/[A-Z][a-z]+Error\b|\bat \S+:\d+|[{}[\]]|\b[45]\d\d\b/.test(message))
    return { title: "That didn't work", body: message, action: { kind: "retry" } };
  return { title: "Something went wrong on our side", body: "It's not something you did. Try again; if it keeps happening, the details below help us fix it.", action: { kind: "retry" }, detail };
}
