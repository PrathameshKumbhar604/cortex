import { claimUnits, type Claim, type Conflict, type Evidence } from "@cortex/shared";
import { parseJsonLoose } from "@cortex/llm";
import { SECTION } from "./prompts";

const STOP = new Set(
  "a an the and or of to in on for with at by from is are was were be been has have had it its this that these those as but not no so than then there their they them which who what when where will would can could should may might also into over under about after before".split(" "),
);

function contentTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\[\d+\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ing|ed|es|s)$/, ""));
}

export interface Sections {
  answer: string;
  conflicts: string[];
  missing: string[];
  actions: unknown[];
  memory: unknown[];
  next: string[];
}

function lines(block: string | undefined): string[] {
  return (block ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l && !/^none\.?$/i.test(l));
}

function jsonArray(block: string | undefined): unknown[] {
  if (!block?.trim()) return [];
  try {
    const v = parseJsonLoose(block);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Splits the synthesizer output into its answer and trailing sections. */
export function splitSections(text: string): Sections {
  const idx = (m: string) => text.indexOf(m);
  const markers = Object.values(SECTION)
    .map((m) => ({ m, i: idx(m) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  const answerEnd = markers[0]?.i ?? text.length;
  const body = (m: string) => {
    const at = markers.findIndex((x) => x.m === m);
    if (at < 0) return undefined;
    const start = markers[at]!.i + m.length;
    const end = markers[at + 1]?.i ?? text.length;
    return text.slice(start, end);
  };
  return {
    answer: text.slice(0, answerEnd).replace(/(\n\s*(-{3,}|\*{3,}|_{3,})\s*)+$/, "").trim(),
    conflicts: lines(body(SECTION.conflicts)),
    missing: lines(body(SECTION.missing)),
    actions: jsonArray(body(SECTION.actions)),
    memory: jsonArray(body(SECTION.memory)),
    next: lines(body(SECTION.next)).map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^"|"$/g, "")).filter((l) => l.length < 90).slice(0, 3),
  };
}

/** Index of the first section marker (or a partial prefix of one) so streaming can stop forwarding tokens. */
export function streamCutoff(text: string): number {
  const i = text.indexOf("<<<");
  if (i >= 0) return i;
  // hold back a trailing partial marker like "<" or "<<"
  const tail = text.match(/<{1,2}$/);
  return tail ? text.length - tail[0].length : text.length;
}

const FACTUAL = /\d|[A-Z][a-z]+ [A-Z]|#\d+|\b(?:due|deadline|blocked|moved|merged|open|closed|assigned|scheduled)\b/i;

/**
 * Cheap claim verification: every factual sentence must cite existing evidence
 * and share enough content words (and every number) with it.
 */
const HEDGE =
  /\b(couldn't|could not|can't|cannot|no (?:evidence|data|information|statements?|mention|record)|not (?:found|mentioned|available|contain)|does(?:n't| not) (?:contain|mention|say|include)|make[s]? no mention|speculative|unclear|unknown)\b/i;

function score(text: string, cited: Evidence[]): Claim["status"] {
  const hay = cited.map((e) => `${e.title} ${e.quote} ${e.author ?? ""} ${e.timestamp ?? ""}`).join(" ");
  const hayTokens = new Set(contentTokens(hay));
  const toks = contentTokens(text);
  const overlap = toks.length ? toks.filter((t) => hayTokens.has(t)).length / toks.length : 1;
  const numbers = text.replace(/\[\d+\]/g, "").match(/\b\d+(?:[.,]\d+)?%?/g) ?? [];
  const numbersOk = numbers.every((n) => hay.includes(n.replace(/%$/, "")));
  return overlap >= 0.4 && numbersOk ? "supported" : overlap >= 0.2 ? "partial" : "unsupported";
}

/**
 * Cheap claim verification: every factual sentence must cite existing evidence
 * and share enough content words (and every number) with it. An uncited
 * sentence that elaborates the cited sentence before it is checked against
 * that sentence's evidence instead of being failed outright.
 */
export function verifyClaims(answer: string, evidence: Evidence[]): Claim[] {
  const claims: Claim[] = [];
  let previous: Evidence[] = [];
  for (const text of claimUnits(answer)) {
    const refs = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    if (refs.length === 0) {
      // Hedges ("the evidence doesn't mention…") and connective sentences don't need citations.
      if (!FACTUAL.test(text) || HEDGE.test(text)) continue;
      // Inherit support only on a strong match; an uncited sentence never earns "partial".
      const inherited = previous.length && score(text, previous) === "supported";
      claims.push({ text, evidenceIds: inherited ? previous.map((e) => e.id) : [], status: inherited ? "supported" : "unsupported" });
      continue;
    }
    const cited = refs.map((n) => evidence[n - 1]).filter((e): e is Evidence => !!e);
    if (cited.length === 0) {
      claims.push({ text, evidenceIds: [], status: "unsupported" });
      continue;
    }
    previous = cited;
    claims.push({ text, evidenceIds: cited.map((e) => e.id), status: score(text, cited) });
  }
  return claims;
}

export function groundedness(claims: Claim[]): number {
  if (claims.length === 0) return 1;
  const score = claims.reduce((n, c) => n + (c.status === "supported" ? 1 : c.status === "partial" ? 0.5 : 0), 0);
  return Math.round((score / claims.length) * 100) / 100;
}

/** Maps "[3][7]" references in a conflict line to evidence ids. */
export function toConflicts(linesIn: string[], evidence: Evidence[]): Conflict[] {
  return linesIn.map((summary) => ({
    summary: summary.replace(/\s*(\[\d+\])+\s*$/, "").trim(),
    evidenceIds: [...summary.matchAll(/\[(\d+)\]/g)]
      .map((m) => evidence[Number(m[1]) - 1]?.id)
      .filter((id): id is string => !!id),
  }));
}
