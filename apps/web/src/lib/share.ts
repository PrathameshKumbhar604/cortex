import type { DatabaseSync } from "node:sqlite";
import { sourceName, type Evidence } from "@cortex/shared";

/** One cited source as a shared page shows it: what was on screen, never the raw connector data (no url, ref, author). */
export interface SharedSource {
  n: number;
  source: string;
  title: string;
  quote: string;
  date?: string;
}

/** A frozen copy of one answer. Later edits, deletes or reconnections never change what a link shows. */
export interface ShareSnapshot {
  question: string;
  answer: string;
  sources: SharedSource[];
  createdAt: string;
}

const clip = (s: unknown, max: number) => (typeof s === "string" ? (s.length > max ? `${s.slice(0, max - 1)}…` : s) : "");
// Fenced or inline code is left alone: "[1]" there is code, not a citation.
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
const outsideCode = (md: string, fn: (prose: string) => string) => md.split(CODE).map((p, i) => (i % 2 ? p : fn(p))).join("");

/** The sources the answer actually cites, numbered as in the text, reduced to title, snippet, app and date. */
export function citedSources(answer: string, evidence: Evidence[]): SharedSource[] {
  const seen = new Map<number, SharedSource>();
  outsideCode(answer, (prose) => {
    for (const m of prose.matchAll(/\[(\d+)\](?!\()/g)) {
      const n = Number(m[1]);
      const ev = evidence[n - 1];
      if (!ev || seen.has(n)) continue;
      const date = ev.timestamp && !Number.isNaN(Date.parse(ev.timestamp)) ? new Date(ev.timestamp).toISOString() : undefined;
      seen.set(n, { n, source: /^[\w-]{1,32}$/.test(String(ev.source)) ? String(ev.source) : "web", title: clip(ev.title, 300), quote: clip(ev.quote, 600), ...(date && { date }) });
    }
    return prose;
  });
  return [...seen.values()].sort((a, b) => a.n - b.n);
}

/** Question, answer and cited snippets only: no memories, attachments, links to sources, tool calls or account details. */
export function snapshot(turn: { question: string; answer: string; evidence: Evidence[] }, now = new Date()): ShareSnapshot {
  const sources = citedSources(turn.answer, turn.evidence);
  const kept = new Set(sources.map((s) => s.n));
  // A citation to nothing would read as a dangling "[7]", so it goes.
  const answer = outsideCode(clip(turn.answer, 100_000), (p) => p.replace(/\s?\[(\d+)\](?!\()/g, (m, n) => (kept.has(Number(n)) ? m : "")));
  return { question: clip(turn.question, 2_000), answer, sources, createdAt: now.toISOString() };
}

/** The answer as Markdown with its "[n]" citations, and the sources they point to listed underneath. */
export function toMarkdown(answer: string, sources: SharedSource[]) {
  if (!sources.length) return answer.trim();
  const list = sources.map((s) => `[${s.n}] ${s.title} (${sourceName(s.source)}${s.date ? `, ${s.date.slice(0, 10)}` : ""})`);
  return `${answer.trim()}\n\n**Sources**\n\n${list.join("  \n")}`;
}

/** 128 random bits, URL-safe: unguessable, so a link can't be found by counting. */
export function shareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const ID = /^[A-Za-z0-9_-]{22}$/;

/** Shared links: one per answer per owner. Revoking deletes the copy, so nothing lingers behind a dead link. */
export function shareStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, chat_id TEXT NOT NULL, turn_id TEXT NOT NULL, json TEXT NOT NULL, created_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS shares_owner ON shares (user_id, chat_id, turn_id);`);
  return {
    /** The existing link for this answer, or a new one holding this snapshot. */
    create(userId: string, chatId: string, turnId: string, snap: ShareSnapshot): string {
      const old = db.prepare("SELECT id FROM shares WHERE user_id = ? AND chat_id = ? AND turn_id = ?").get(userId, chatId, turnId) as { id: string } | undefined;
      if (old) return old.id;
      const id = shareId();
      db.prepare("INSERT INTO shares (id, user_id, chat_id, turn_id, json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, userId, chatId, turnId, JSON.stringify(snap), Date.now());
      return id;
    },
    get(id: string): ShareSnapshot | null {
      if (!ID.test(id)) return null;
      const row = db.prepare("SELECT json FROM shares WHERE id = ?").get(id) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as ShareSnapshot) : null;
    },
    /** Only the owner can revoke; true when a link was removed. */
    revoke(userId: string, id: string): boolean {
      return Number(db.prepare("DELETE FROM shares WHERE id = ? AND user_id = ?").run(id, userId).changes) > 0;
    },
    /** A deleted chat takes its links with it. */
    revokeChat(userId: string, chatId: string) {
      db.prepare("DELETE FROM shares WHERE user_id = ? AND chat_id = ?").run(userId, chatId);
    },
  };
}
