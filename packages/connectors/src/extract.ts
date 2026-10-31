import type { SourceId } from "@cortex/shared";
import type { RawEvidence } from "./types";

type Obj = Record<string, unknown>;

const TITLE_KEYS = ["subject", "title", "summary", "name", "filename"];
const BODY_KEYS = ["messageText", "snippet", "preview", "body", "text", "description", "content", "plain_text", "markdown"];
const URL_KEYS = ["html_url", "permalink", "webViewLink", "htmlLink", "url", "link"];
const TIME_KEYS = ["messageTimestamp", "updated_at", "created_at", "last_edited_time", "modifiedTime", "createdTime", "date", "ts", "start"];
const AUTHOR_KEYS = ["sender", "from", "author", "user", "username", "organizer", "owner", "creator"];

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  if (isObj(v)) {
    // common nested shapes: {login}, {email}, {dateTime}, {plain_text}, title arrays
    for (const k of ["login", "email", "name", "dateTime", "date", "plain_text", "content", "body"]) {
      const s = str(v[k]);
      if (s) return s;
    }
  }
  if (Array.isArray(v)) {
    const parts = v.map(str).filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return undefined;
}

function pick(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = str(o[k]);
    if (s) return s;
  }
  // Notion keeps the title inside properties.*.title[].plain_text
  if (keys === TITLE_KEYS && isObj(o.properties)) {
    for (const p of Object.values(o.properties)) {
      if (isObj(p) && Array.isArray(p.title)) {
        const s = str(p.title);
        if (s) return s;
      }
    }
  }
  return undefined;
}

function toIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const n = Number(v);
  // slack ts (seconds, with decimals) or epoch millis
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Finds the largest array of objects anywhere in a tool response. */
function findRecords(data: unknown, depth = 0): Obj[] {
  if (depth > 5) return [];
  if (Array.isArray(data)) {
    const objs = data.filter(isObj);
    if (objs.length) return objs;
  }
  if (!isObj(data)) return [];
  let best: Obj[] = [];
  for (const v of Object.values(data)) {
    const found = findRecords(v, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

export function compact(text: string, max = 420): string {
  const clean = htmlToText(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Turns an arbitrary tool response into evidence. Tool output schemas differ
 * per app and change over time; a tolerant extractor keeps connectors working.
 */
export function extractEvidence(source: SourceId, data: unknown, limit = 8): RawEvidence[] {
  const records = findRecords(data);
  const out: RawEvidence[] = [];
  const threads = new Set<string>();
  for (const r of records) {
    const title = pick(r, TITLE_KEYS);
    const body = pick(r, BODY_KEYS);
    if (!title && !body) continue;
    // One item per email thread: results come newest first, so the latest reply wins.
    const thread = str(r.threadId);
    if (thread && threads.has(thread)) continue;
    if (thread) threads.add(thread);
    out.push({
      source,
      title: compact(title ?? body ?? "Untitled", 140),
      quote: compact(body ?? title ?? ""),
      url: pick(r, URL_KEYS),
      author: pick(r, AUTHOR_KEYS),
      timestamp: toIso(pick(r, TIME_KEYS)),
      ref: str(r.messageId) ?? str(r.id) ?? undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Orders hits by how many query words appear in their title and snippet, newest first on ties. */
export function rankByQuery<T extends { title: string; quote: string; timestamp?: string }>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const score = (e: T) => words.filter((w) => `${e.title} ${e.quote}`.toLowerCase().includes(w)).length;
  return [...items].sort((a, b) => score(b) - score(a) || (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
}

/** Fallback when a tool returns plain text instead of records. */
export function textEvidence(source: SourceId, title: string, text: string, url?: string): RawEvidence[] {
  const t = text.trim();
  return t ? [{ source, title, quote: compact(t, 600), url }] : [];
}

/** Email bodies often arrive as full HTML documents: keep only the readable text. */
export function htmlToText(s: string): string {
  if (!/<[a-z!/]|&#?\w+;/i.test(s)) return s; // tags or entities
  return s
    .replace(/<!DOCTYPE[^>]*>|-\/\/W3C\/\/DTD[^"]*"[^>]*>?/gi, " ")
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
}
