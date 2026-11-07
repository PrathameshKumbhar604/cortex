// Copied from apps/web/src/lib/voice.ts (no browser APIs). Keep in step with it.
// Voice mode's shared vocabulary: the voices, the languages, and how a written answer becomes something to say.
// No browser or server APIs here, so the routes, the voice interface and the tests all use it.

export type VoiceLang = "en" | "hi" | "mr";
export type VoiceGender = "female" | "male";

export const LANGS: { id: VoiceLang; label: string; native: string; bcp47: string; name: string }[] = [
  { id: "en", label: "English", native: "English", bcp47: "en-IN", name: "English" },
  { id: "hi", label: "Hindi", native: "हिन्दी", bcp47: "hi-IN", name: "Hindi" },
  { id: "mr", label: "Marathi", native: "मराठी", bcp47: "mr-IN", name: "Marathi" },
];

export interface Persona {
  lang: VoiceLang;
  gender: VoiceGender;
  /** Sarvam Bulbul v4 Flash speaker id (https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices). */
  speaker: string;
  name: string;
  character: string;
  /** Orb colour, light and dark. All in Cortex's indigo family, each a distinct hue. */
  color: [light: string, dark: string];
  /** Backup voices of the same gender and a similar character, for when Sarvam can't speak: Gemini TTS, then (English) Groq Orpheus. */
  backup: { gemini: string; groq?: string };
}

export const TTS_MODEL = "bulbul:v4-flash";

export const PERSONAS: Persona[] = [
  { lang: "en", gender: "female", speaker: "aparna_en_companion", name: "Aparna", character: "Warm and unhurried. Explains things the way a good colleague would.", color: ["#5443d6", "#8794ff"], backup: { gemini: "Sulafat", groq: "hannah" } },
  { lang: "en", gender: "male", speaker: "shubh_en_narration_gentle", name: "Shubh", character: "Steady and precise. Gets to the point, then stops.", color: ["#2f5bd3", "#6f97ff"], backup: { gemini: "Iapetus", groq: "daniel" } },
  { lang: "hi", gender: "female", speaker: "roopa_hi_conversational", name: "Roopa", character: "Gentle and clear. Makes a busy day feel manageable.", color: ["#7044cf", "#a68cff"], backup: { gemini: "Vindemiatrix" } },
  { lang: "hi", gender: "male", speaker: "ashutosh_hi_conversational", name: "Ashutosh", character: "Calm and grounded. Speaks with quiet confidence.", color: ["#3f45c4", "#7c84ff"], backup: { gemini: "Schedar" } },
  { lang: "mr", gender: "female", speaker: "ishita_mr_conversational", name: "Ishita", character: "Bright and attentive. Notices the detail you missed.", color: ["#8a3fc0", "#c08cf2"], backup: { gemini: "Autonoe" } },
  { lang: "mr", gender: "male", speaker: "nilesh_mr_conversation", name: "Nilesh", character: "Measured and thoughtful. A steady hand on a long list.", color: ["#2668b8", "#62a8f5"], backup: { gemini: "Sadaltager" } },
];

export const persona = (lang: VoiceLang, gender: VoiceGender) => PERSONAS.find((p) => p.lang === lang && p.gender === gender)!;
export const isLang = (x: unknown): x is VoiceLang => x === "en" || x === "hi" || x === "mr";
export const isGender = (x: unknown): x is VoiceGender => x === "female" || x === "male";
export const langInfo = (l: VoiceLang) => LANGS.find((x) => x.id === l)!;

/** Short lines voice mode says itself. Gender-neutral on purpose: Hindi and Marathi verbs agree with the speaker. */
export const PHRASES: Record<"details" | "rest" | "approval" | "done" | "declined" | "failed" | "sorry", Record<VoiceLang, string>> = {
  details: { en: "I've put the details on screen.", hi: "पूरी जानकारी स्क्रीन पर है।", mr: "सविस्तर माहिती स्क्रीनवर आहे." },
  rest: { en: "The rest is on screen.", hi: "बाकी जानकारी स्क्रीन पर है।", mr: "बाकीची माहिती स्क्रीनवर आहे." },
  approval: { en: "I need your approval before I do this.", hi: "इसके लिए आपकी मंज़ूरी चाहिए।", mr: "यासाठी तुमची मंजुरी हवी आहे." },
  done: { en: "Done.", hi: "हो गया।", mr: "झालं." },
  declined: { en: "Okay, I've cancelled it.", hi: "ठीक है, इसे रद्द कर दिया।", mr: "ठीक आहे, हे रद्द केलं." },
  failed: { en: "That didn't go through. The details are on screen.", hi: "यह नहीं हो पाया। जानकारी स्क्रीन पर है।", mr: "हे झालं नाही. माहिती स्क्रीनवर आहे." },
  sorry: { en: "Sorry, I couldn't answer that just now.", hi: "माफ़ कीजिए, अभी जवाब नहीं मिल सका।", mr: "माफ करा, आत्ता उत्तर मिळू शकलं नाही." },
};

/** How many characters of one reply are spoken (Sarvam bills per character); the full answer is always on screen. */
export const SPOKEN_CAP = 600;
/** Server-side cap per TTS request. */
export const TTS_MAX_CHARS = 500;

/**
 * A markdown answer as plain speech: citations, links, URLs, emphasis and list markers go; code blocks and tables are
 * not read out (`details` says they were there). List items and headings end in a full stop so they split cleanly.
 */
export function toSpeakable(markdown: string): { text: string; details: boolean } {
  let details = false;
  const lines: string[] = [];
  let fenced = false;
  for (const raw of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      details = true;
      continue;
    }
    if (fenced) continue;
    if (/^\s*\|/.test(raw)) {
      details = true; // a table row
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(raw)) continue; // a rule
    let line = raw
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
      .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1") // links keep their words
      .replace(/(?:\[\^?(?:\d+|e\d+)\])+/g, "") // citation markers [2][5], [^1], [e3]
      .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/g, "") // bare URLs
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*|__|(?<![\p{L}\p{N}])[*_](?=\S)|(?<=\S)[*_](?![\p{L}\p{N}])/gu, "")
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/\s+([,.;:!?।])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    if (!/[.!?।॥:;,]$/.test(line)) line += isDevanagari(line) ? "।" : ".";
    lines.push(line);
  }
  return { text: lines.join(" ").replace(/\s+/g, " ").trim(), details };
}

const isDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

/**
 * Splits speech into sentences (., !, ?, and the Devanagari danda । / ॥), merging very short ones so a reply isn't
 * dozens of tiny requests, and breaking very long ones at a comma or space so the first audio starts sooner.
 */
export function chunkSentences(text: string, min = 24, max = 220): string[] {
  return mergeSentences(splitSentences(text), min, max);
}

/** Words whose full stop doesn't end a sentence ("Dr. Ruiz", "e.g. this"). */
const ABBREV = /(?:^|[\s(])(?:dr|mr|mrs|ms|prof|st|sr|jr|vs|etc|e\.g|i\.e|no|inc|ltd|approx|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.$/i;

/** Sentences as written: a stop ends one only when a space follows ("3.5 hours" stays whole) and it isn't an abbreviation. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const p of text.split(/(?<=[.!?।॥]["')\]]*)\s+/).map((s) => s.trim()).filter(Boolean)) {
    if (out.length && ABBREV.test(out.at(-1)!)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

function mergeSentences(parts: string[], min: number, max: number): string[] {
  const out: string[] = [];
  for (const p of parts) {
    for (const piece of splitLong(p, max)) {
      const last = out.at(-1);
      if (last && last.length < min && last.length + piece.length + 1 <= max) out[out.length - 1] = `${last} ${piece}`;
      else out.push(piece);
    }
  }
  return out;
}

function splitLong(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("، "));
    const at = cut > max / 3 ? cut + 1 : window.lastIndexOf(" ") > 0 ? window.lastIndexOf(" ") : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The part of a streaming answer that is safe to speak: up to the last finished sentence or line, never inside an open
 * code block. A finished answer is all safe.
 */
export function stablePrefix(markdown: string, done: boolean): string {
  if (done) return markdown;
  const fences = [...markdown.matchAll(/^\s*(```|~~~)/gm)];
  const open = fences.length % 2 === 1 ? fences.at(-1)!.index! : markdown.length;
  const head = markdown.slice(0, open);
  let cut = -1;
  for (const m of head.matchAll(/[.!?।॥](?=\s)|\n/g)) {
    if (m[0] !== "\n" && ABBREV.test(head.slice(Math.max(0, m.index! - 8), m.index! + 1))) continue;
    cut = m.index! + m[0].length;
  }
  return cut < 0 ? "" : head.slice(0, cut);
}

/**
 * Follows one streaming answer and hands out what to say next, each piece once. The spoken total stays under
 * SPOKEN_CAP; past it (or for code and tables) a single "it's on screen" line is said at the end instead.
 */
export class SpokenReply {
  // Sentences already handed out, by their text: the final answer can re-flow what streamed (a heading added, spacing
  // changed), and a sentence is still never said twice.
  private seen = new Set<string>();
  private spoken = 0;
  private capped = false;
  private ended = false;
  constructor(readonly lang: VoiceLang) {}

  /** New sentences to say for the answer as it stands now. */
  next(markdown: string, done: boolean): string[] {
    if (this.ended) return [];
    const { text, details } = toSpeakable(stablePrefix(markdown, done));
    const fresh = splitSentences(text).filter((s) => !this.seen.has(s));
    if (!done && !this.seen.size && fresh.join(" ").length < 24) return []; // wait for a fuller opening
    fresh.forEach((s) => this.seen.add(s));
    const out: string[] = [];
    for (const s of mergeSentences(fresh, 24, 220)) {
      if (this.capped) break;
      if (this.spoken + s.length > SPOKEN_CAP && this.spoken > 0) {
        this.capped = true;
        break;
      }
      out.push(s);
      this.spoken += s.length;
    }
    if (done) {
      this.ended = true;
      if (this.capped) out.push(PHRASES.rest[this.lang]);
      else if (details) out.push(PHRASES.details[this.lang]);
    }
    return out;
  }

  get spokenChars() {
    return this.spoken;
  }
}

/** A finished voice utterance as the question of a normal chat turn (the composer's 2,000-character limit applies). */
export function voiceQuestion(transcript: string): string | null {
  const q = transcript.replace(/\s+/g, " ").trim().slice(0, 2000);
  return q.length >= 2 ? q : null;
}
