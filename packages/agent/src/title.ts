import type { LlmRouter } from "@cortex/llm";

/** A short sidebar title for a new chat, from its first message; null when no usable title comes back. */
export async function chatTitle(question: string, llm: LlmRouter, signal?: AbortSignal): Promise<string | null> {
  const res = await llm.complete({
    tier: "fast",
    messages: [
      {
        role: "system",
        content:
          "You label chats for a sidebar. Write a title of 2 to 5 words for a chat that starts with the message below. " +
          "Name its specific topic, never its language or form (\"bhai mera kal ka meeting kab hai\" → Tomorrow's meeting time, \"get me the latest pdf\" → Latest PDF). " +
          "Any message gets a title: small talk, slang, Hinglish or other languages, jokes, rudeness or swearing. Never refuse, apologise, reply to the message or comment on it; " +
          "describe it neutrally and without repeating swear words. Read playful slang between friends as friendly " +
          "(\"hello\" → Friendly greeting, \"kaisa hai pagal\" → Casual check-in, an angry insult → Venting frustration). " +
          "Sentence case, keep names capitalised, no quotes, no emoji, no ending punctuation. Reply with the title only.",
      },
      { role: "user", content: `Message to label:\n"""\n${question.slice(0, 500)}\n"""` },
    ],
    maxTokens: 300, // room for a reasoning model to think briefly
    reasoning: "low",
    signal,
  });
  return cleanTitle(res.text);
}

export function cleanTitle(raw: string): string | null {
  const line = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const t = line
    .replace(/^(title\s*:\s*)/i, "")
    .replace(/^["'“”‘’*#\s]+|["'“”‘’*.!?:;,\s]+$/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .slice(0, 48)
    .trim();
  if (t.length < 2 || REFUSAL.test(t)) return null; // a refusal is not a title; the first message stays instead
  return t[0]!.toUpperCase() + t.slice(1);
}

const REFUSAL = /^(i['’]?m sorry|i am sorry|sorry|i can['’]?t|i cannot|i won['’]?t|i['’]?m unable|i am unable|as an ai|unfortunately|apologies)\b/i;
