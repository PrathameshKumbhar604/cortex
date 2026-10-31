import { plainText } from "./snippet";

/** What a chat search needs from a saved chat (SavedThread fits). */
export interface SearchableChat {
  id: string;
  title: string;
  updatedAt: number;
  turns: { question: string; answer: string }[];
}

export interface Part {
  text: string;
  hit: boolean;
}

export interface ChatHit {
  id: string;
  kind: "keyword" | "semantic";
  /** The turn that matched, so opening the chat can scroll to it. */
  turn: number;
  title: Part[];
  snippet: Part[];
  score: number;
}

/** A semantic match from the server: which chat and turn, and the cosine similarity. */
export interface SemanticMatch {
  id: string;
  turn: number;
  score: number;
}

// gemini-embedding-001 (retrieval task types) scores unrelated chats up to ~0.57 and related ones from ~0.59, so a
// match must clear a floor and sit near the best match: a vague query then shows its one or two closest chats, not all.
export const SEMANTIC_MIN = 0.58;
export const SEMANTIC_MARGIN = 0.04;

export const terms = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits text into plain and matched parts, so the UI can mark each match. */
export function highlight(text: string, words: string[]): Part[] {
  if (!words.length) return [{ text, hit: false }];
  const re = new RegExp(`(${[...words].sort((a, b) => b.length - a.length).map(escape).join("|")})`, "giu");
  return text
    .split(re)
    .filter(Boolean)
    .map((t) => ({ text: t, hit: words.includes(t.toLowerCase()) }));
}

/** ~140 characters around the first match, cut on word boundaries. */
function around(text: string, words: string[], max = 140): string {
  const low = text.toLowerCase();
  const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), Infinity);
  if (at === Infinity || text.length <= max) return text.slice(0, max) + (text.length > max ? "…" : "");
  let start = Math.max(0, at - 40);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  let end = Math.min(text.length, start + max);
  if (end < text.length) end = text.lastIndexOf(" ", end) > at ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

const WEIGHT = { title: 4, question: 2, answer: 1 } as const;

/**
 * Keyword search: every word of the query must appear somewhere in the chat. Ranked by where the words are (title over
 * question over answer), with a bonus for the whole phrase and for whole-word matches; newer chats win ties.
 */
export function keywordSearch(chats: SearchableChat[], query: string): ChatHit[] {
  const words = terms(query);
  if (!words.length) return [];
  const phrase = query.trim().toLowerCase().replace(/\s+/g, " ");
  const hits: (ChatHit & { updatedAt: number })[] = [];
  for (const c of chats) {
    const fields = [
      { kind: "title" as const, turn: 0, text: c.title },
      ...c.turns.flatMap((t, i) => [
        { kind: "question" as const, turn: i, text: t.question },
        { kind: "answer" as const, turn: i, text: plainText(t.answer ?? "") },
      ]),
    ].map((f) => ({ ...f, low: f.text.toLowerCase() }));
    if (!words.every((w) => fields.some((f) => f.low.includes(w)))) continue;
    let score = 0;
    for (const w of words) {
      const best = Math.max(...fields.filter((f) => f.low.includes(w)).map((f) => WEIGHT[f.kind]));
      const whole = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, "u");
      score += best + (fields.some((f) => whole.test(f.low)) ? 0.5 : 0);
    }
    if (words.length > 1 && fields.some((f) => f.low.includes(phrase))) score += 3;
    // The snippet comes from the question or answer holding the most words (earliest on a tie).
    const body = fields.filter((f) => f.kind !== "title");
    const count = (f: (typeof fields)[number]) => words.filter((w) => f.low.includes(w)).length * 10 + WEIGHT[f.kind];
    const best = body.reduce<(typeof body)[number] | undefined>((a, f) => (!a || count(f) > count(a) ? f : a), undefined);
    hits.push({
      id: c.id,
      kind: "keyword",
      turn: best?.turn ?? 0,
      title: highlight(c.title, words),
      snippet: best ? highlight(around(best.text, words), words) : [],
      score,
      updatedAt: c.updatedAt,
    });
  }
  return hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).map(({ updatedAt: _, ...h }) => h);
}

/**
 * Keyword hits first (exact words are what people expect at the top), then chats that only match by meaning, above
 * the similarity threshold and best first. A chat appears once.
 */
export function mergeHits(keyword: ChatHit[], semantic: SemanticMatch[], chats: SearchableChat[]): ChatHit[] {
  const top = Math.max(...semantic.map((m) => m.score));
  const min = Math.max(SEMANTIC_MIN, top - SEMANTIC_MARGIN);
  const seen = new Set(keyword.map((h) => h.id));
  const byId = new Map(chats.map((c) => [c.id, c]));
  const extra: ChatHit[] = [];
  for (const m of [...semantic].sort((a, b) => b.score - a.score)) {
    const c = byId.get(m.id);
    if (m.score < min || !c || seen.has(m.id)) continue;
    seen.add(m.id);
    const t = c.turns[m.turn] ?? c.turns[0];
    const text = t ? `${t.question} — ${plainText(t.answer ?? "")}` : "";
    extra.push({ id: c.id, kind: "semantic", turn: c.turns[m.turn] ? m.turn : 0, title: [{ text: c.title, hit: false }], snippet: [{ text: around(text, []), hit: false }], score: m.score });
  }
  return [...keyword, ...extra];
}
