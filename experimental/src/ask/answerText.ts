// Text preparation for the answer renderer, same rules as the web (apps/web/src/components/ask/answer.tsx).

/** Marks the end of a streaming answer; the renderer draws it as the indigo block caret. */
export const CARET = "";

/** "[3]" becomes a link the renderer turns into a citation; code (fenced or inline) is left alone. */
export function withCitationLinks(md: string) {
  return md
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/((?:\s*\[\d+\])+)([.,;:])/g, "$2$1").replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)")))
    .join("");
}

/** A claim as it reads on screen: no markdown, citations or list markers. */
export function plain(s: string) {
  return s
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a run of text into plain and partly-supported pieces. */
export function splitPartial(s: string, partial: string[]): { text: string; partial: boolean }[] {
  for (const p of partial) {
    const at = s.indexOf(p);
    if (at < 0) continue;
    return [...(at ? [{ text: s.slice(0, at), partial: false }] : []), { text: p, partial: true }, ...splitPartial(s.slice(at + p.length), partial)].filter((x) => x.text);
  }
  return s ? [{ text: s, partial: false }] : [];
}

/** Evidence ids actually cited in the answer text. */
export function citedIds(answer: string, evidence: { id: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const e = evidence[Number(m[1]) - 1];
    if (e) ids.add(e.id);
  }
  return ids;
}
