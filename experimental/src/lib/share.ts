// Copied from apps/web/src/lib/share.ts (snapshot and Markdown only; the server store stays on the web).
import { sourceName, type Evidence } from "@cortex/shared";
import { cleanSnippet, hostOf, plainText } from "./snippet";


/** One cited source as a shared page shows it: what was on screen, never the raw connector data (no url, ref, author). */
export interface SharedSource {
  n: number;
  source: string;
  title: string;
  quote: string;
  date?: string;
  /** Web sources only: the site's domain, for its icon. App links (mail, docs) stay private. */
  host?: string;
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
export function citedSources(answer: string, evidence: Evidence[], query = ""): SharedSource[] {
  const seen = new Map<number, SharedSource>();
  outsideCode(answer, (prose) => {
    for (const m of prose.matchAll(/\[(\d+)\](?!\()/g)) {
      const n = Number(m[1]);
      const ev = evidence[n - 1];
      if (!ev || seen.has(n)) continue;
      const date = ev.timestamp && !Number.isNaN(Date.parse(ev.timestamp)) ? new Date(ev.timestamp).toISOString() : undefined;
      const source = /^[\w-]{1,32}$/.test(String(ev.source)) ? String(ev.source) : "web";
      const host = source === "web" ? hostOf(ev.url) : undefined;
      seen.set(n, { n, source, title: clip(plainText(String(ev.title ?? "")), 300), quote: cleanSnippet(String(ev.quote ?? ""), query, 600), ...(date && { date }), ...(host && { host }) });
    }
    return prose;
  });
  return [...seen.values()].sort((a, b) => a.n - b.n);
}

/** Question, answer and cited snippets only: no memories, attachments, links to sources, tool calls or account details. */
export function snapshot(turn: { question: string; answer: string; evidence: Evidence[] }, now = new Date()): ShareSnapshot {
  const sources = citedSources(turn.answer, turn.evidence, turn.question);
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

