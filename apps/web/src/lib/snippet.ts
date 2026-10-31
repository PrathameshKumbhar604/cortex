/** Source text as a person would read it: no markdown, HTML, escapes or URLs, whitespace collapsed. */
export function plainText(raw: string): string {
  return (
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/&(nbsp|amp|quot|#39|apos|lt|gt);/g, (_, e: string) => ({ nbsp: " ", amp: "&", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">" })[e]!)
      // images go entirely; a link keeps its text. The closing ")" may be missing when the source was cut short.
      .replace(/!\[[^\]]*\](?:\([^)\s]*\)?|\[[^\]]*\])?/g, " ")
      .replace(/\[([^\]]*)\](?:\([^)\s]*\)?|\[[^\]]*\])/g, "$1")
      .replace(/\b(?:https?:\/\/|www\.)\S+/g, " ")
      .replace(/\\(.)/g, "$1")
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+|[-*_=]{3,}\s*$)/gm, "")
      .replace(/\*\*|__|~~|`+/g, "")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
      .replace(/\|/g, " ")
      .replace(/\[\s*\]|\(\s*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const STOP = new Set("the and for are but not you your with from that this what when where which who how was were will have has had does did can its about into than then them they our out any all".split(" "));

/** Cuts to `max` characters at a word boundary, with an ellipsis when something was cut. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/**
 * A short, readable snippet from a source: plain text that starts at the sentence most about the question
 * (the first one when none matches), cut on a word boundary.
 */
export function cleanSnippet(raw: string | undefined, query = "", max = 240): string {
  const text = plainText(raw ?? "");
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((w) => !STOP.has(w));
  if (words.length) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    let best = 0;
    let top = 0;
    sentences.forEach((s, i) => {
      const low = s.toLowerCase();
      const score = words.filter((w) => low.includes(w)).length;
      if (score > top) [best, top] = [i, score];
    });
    if (best > 0) return clip(sentences.slice(best).join(" "), max);
  }
  return clip(text, max);
}

/** "granola.ai" from "https://www.granola.ai/pricing"; undefined for anything that isn't an http(s) link. */
export function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : undefined;
  } catch {
    return undefined;
  }
}

export const faviconUrl = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
