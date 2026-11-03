import type { LlmRouter } from "@cortex/llm";
import type { BriefCard } from "./brief";

/** Four starter questions about what is actually in the person's brief; null when the model gives nothing usable. */
export async function starterQuestions(cards: BriefCard[], llm: LlmRouter, signal?: AbortSignal): Promise<string[] | null> {
  const items = cards
    .slice(0, 8)
    .map((c) => `- [${c.kind}] ${c.title}: ${c.detail}`.slice(0, 240))
    .join("\n");
  const res = await llm.complete({
    tier: "fast",
    messages: [
      {
        role: "system",
        content:
          "You suggest what someone might ask their work assistant next. From the items below, write 4 different questions they would " +
          "plausibly ask, each about a specific item (name the project, person or deadline), each under 12 words, in plain everyday words. " +
          "Mix kinds: what changed, what is at risk, what is due, and one that asks to draft a reply or update. " +
          "One question per line, no numbering, no quotes, nothing else.",
      },
      { role: "user", content: `Items:\n${items}` },
    ],
    maxTokens: 400,
    reasoning: "low",
    signal,
  });
  return cleanStarters(res.text);
}

export function cleanStarters(raw: string): string[] | null {
  const seen = new Set<string>();
  const out = raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'“”]+|["'“”]+$/g, "").trim())
    .filter((l) => l.length >= 10 && l.length <= 90 && !/^(here|sure|items?)\b/i.test(l))
    .filter((l) => !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
    .slice(0, 4);
  return out.length >= 3 ? out : null;
}
