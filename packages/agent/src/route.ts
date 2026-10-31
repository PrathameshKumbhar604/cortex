import { z } from "zod";
import type { LlmRouter, Tier } from "@cortex/llm";
import type { ChatTurn, RouteDecision, RouteKind } from "@cortex/shared";
import { keywords } from "./time";

const GREETING = /^\s*(hi|hello|hey|yo|thanks|thank you|thx|ok(ay)?|cool|great|nice|good (morning|afternoon|evening))\b[\s!.,]*$/i;
const ABOUT_CORTEX = /\b(who are you|what can you do|what are you|how do you work|help me get started)\b/i;
/** Telling Cortex something to keep ("remember my name is…") needs no search, only a saved memory. */
const TELLING = /^\s*(please\s+)?(remember|keep in mind|note that|from now on|call me|my name is)\b/i;
// "I like badminton", "I usually work late": about the user, but nothing to look up (unless it names a source).
const ABOUT_ME = /^\s*(i (like|love|enjoy|hate|prefer|usually|always|never)|i'?m (a|an) )\b/i;
// About this conversation or what Cortex knows of the user: the chat and memory answer it, not the user's apps.
const ABOUT_CHAT =
  /\b(what (did|have) (i|you) (just )?(ask|asked|say|said|tell|told|mention|mentioned)|(my|your) (last|previous|first|earlier) (question|message|answer|reply)|(this|our) (chat|conversation)|so far|what('s| is) my name|who am i|do you (know|remember) (me|my|who))\b/i;
/** Points at earlier chats ("what were my previous chats about?", "what did we discuss last time?"). */
export const ABOUT_PAST_CHATS =
  /\b((previous|past|other|earlier|old|last|recent) (chats?|conversations?|sessions?)|last time|the other day|(we|i) (talked|spoke|discussed|chatted)|(you|i) (said|told|mentioned|asked)( me| you)? (yesterday|before|last week|last time|the other day))\b/i;
const URL = /https?:\/\/\S+/i;
const WEB = /\b(search (it |this |that )?(on |in )?(the )?(web|internet|online)|web ?search|google (it|this|that)|on the (web|internet)|online|latest news|news (about|on)|look (it )?up online)\b/i;
const ACTION =
  /\b(send|draft|reply to|write (an? )?(email|message|reply)|email (him|her|them)|post (a |an |this |that )?(message|update)?|create (an? )?(event|meeting|issue|page|doc)|schedule|book (a )?(meeting|call)|open (an? )?issue|comment on|add (an? )?(event|meeting))\b/i;
/** Requests that start with a command verb ("Email Dr. Ruiz…", "Remind the team…"). */
const IMPERATIVE = /^\s*(please\s+)?(email|e-mail|mail|message|text|ping|dm|tell|remind|ask|invite|notify|schedule|send|draft|reply|respond|post|create|book|add|open|file|comment|update|reschedule|cancel|share)\b/i;
const SOURCE_WORDS =
  /\b(e-?mails?|inbox|gmail|mail|calendar|meetings?|events?|schedule|drive|docs?|files?|notion|pages?|slack|channels?|dms?|github|issues?|prs?|pull requests?|repos?|commits?|milestones?|sprints?|deadlines?|due|standup|advisor|team(mates?)?|projects?|tasks?|todos?|brief|uploads?|uploaded|pdfs?|attach(?:ed|ments?))\b/i;
const PERSONAL = /\b(my|mine|our|ours|i|i'm|i've|me|we|us)\b/i;

const SOURCE_HINTS: [RegExp, string][] = [
  [/\b(e-?mails?|inbox|gmail|mail|reply|sent)\b/i, "gmail"],
  [/\b(calendar|meetings?|events?|schedule|tomorrow|today|next week|standup)\b/i, "calendar"],
  [/\b(drive|docs?|files?|report|slides|sheet)\b/i, "drive"],
  [/\b(notion|pages?|spec|notes|wiki)\b/i, "notion"],
  [/\b(slack|channels?|dms?|chat|thread)\b/i, "slack"],
  [/\b(github|issues?|prs?|pull requests?|repos?|commits?|milestones?|bugs?)\b/i, "github"],
  [/\b(upload(ed|s)?|attach(ed|ment)?|my (files?|pdfs?|documents?|notes)|the (pdf|document|file) i (sent|gave|shared|added))\b/i, "files"],
];

// "Summarise this:", "Turn this voice note into notes", "Fix the grammar below": works on text in the message itself.
const TRANSFORM =
  /^\s*(please\s+)?((can|could|would) you\s+)?(summari[sz]e|sum up|turn|convert|rewrite|rephrase|paraphrase|reword|translate|format|reformat|proofread|fix|correct|polish|clean up|tidy( up)?|shorten|simplify|condense|edit|improve|outline|bullet|make notes)\b/i;
const LOOKUP_VERB = /^\s*(please\s+)?((can|could|would) you\s+)?(summari[sz]e|sum up|outline|turn|convert|make notes)\b/i;
const SUPPLIED = /\b(this|these|the following|following|below|text|transcript|voice note|paragraph|passage|draft)\b|:\s*$/i;

/**
 * A request to transform text the user pasted in: the instruction (first line, or up to the first colon) starts
 * with a transform verb and points at supplied text, and real material follows. No source has anything to add.
 */
export function transformsGivenText(question: string): boolean {
  const q = question.trim();
  const nl = q.indexOf("\n");
  const colon = q.indexOf(":");
  const cut = nl > 0 && nl < 300 ? nl : colon > 0 && colon < 200 ? colon + 1 : -1;
  if (cut < 0) return false;
  const instruction = q.slice(0, cut);
  const material = q.slice(cut).trim();
  if (!TRANSFORM.test(instruction) || !SUPPLIED.test(instruction) || material.length < 40) return false;
  // "Summarise my emails from Priya:" names where to look; short material like "my emails about the budget" too.
  if (PERSONAL.test(instruction) && SOURCE_WORDS.test(instruction)) return false;
  // Only verbs that could also mean "go and fetch" (summarise, outline); translate/fix/rewrite always take text.
  return !(material.length < 120 && LOOKUP_VERB.test(instruction) && PERSONAL.test(material) && SOURCE_WORDS.test(material));
}

function hintedSources(q: string, available: string[]): string[] {
  return SOURCE_HINTS.filter(([re, id]) => re.test(q) && available.includes(id)).map(([, id]) => id);
}

/** Clear-cut cases decided without a model call. */
export function routeByRules(question: string, available: string[]): RouteDecision | null {
  const q = question.trim();
  if (GREETING.test(q) || ABOUT_CORTEX.test(q)) return { route: "general", sources: [], tier: "fast", reason: "greeting or question about Cortex", by: "rules" };
  if (transformsGivenText(q)) return { route: "general", sources: [], tier: "fast", reason: "works on the text you gave", by: "rules" };
  if ((ABOUT_CHAT.test(q) || ABOUT_PAST_CHATS.test(q)) && !SOURCE_WORDS.test(q)) return { route: "general", sources: [], tier: "fast", reason: "about this chat or you", by: "rules" };
  if ((TELLING.test(q) || (ABOUT_ME.test(q) && !SOURCE_WORDS.test(q))) && !/\?\s*$/.test(q)) return { route: "general", sources: [], tier: "fast", reason: "something to remember", by: "rules" };
  if (URL.test(q) && available.includes("web")) return { route: "web", sources: ["web"], tier: "fast", reason: "contains a link", by: "rules" };
  const hinted = hintedSources(q, available);
  if (IMPERATIVE.test(q) || (ACTION.test(q) && (hinted.length || PERSONAL.test(q)))) {
    return { route: "action", sources: hinted, tier: "strong", reason: "asks Cortex to do something", by: "rules" };
  }
  if (PERSONAL.test(q) && SOURCE_WORDS.test(q)) {
    return { route: "personal", sources: hinted, tier: "strong", reason: "about your own work", by: "rules" };
  }
  if (WEB.test(q) && available.includes("web")) return { route: "web", sources: ["web"], tier: "fast", reason: "asks for the web", by: "rules" };
  return null; // ambiguous: ask the model
}

// Words that say where or how to look ("search on web", "and in slack?", "tell me more"), not what to look for.
const STEER =
  "search searching look find check google web internet online up again also instead then too now just more details detail explain elaborate expand that it this those them these same one please can could you try and but or so ok okay on in the my me tell do there".split(" ");
const SOURCE_NAMES = "mail email emails inbox gmail calendar drive docs notion slack github files uploads".split(" ");
const STEER_WORDS = new RegExp(`\\b(what about|how about|${[...STEER, ...SOURCE_NAMES].join("|")})\\b`, "gi");
// "check my gmail", "and in slack?": the app named is where to look; in "what's on my calendar?" it's the topic.
const REDIRECT = /^\s*(and|also|or|what about|how about)\b|\b(search|check|look|find|try|google|instead|too|as well)\b/i;
// Points back at something said earlier ("who sent it?", "when is that due?", "what about the second one?").
const ANAPHORA = /\b(it|that|those|them|these|he|she|they|him|her|the (first|second|third|last|other) one)\b|^\s*(and|but|also|or|so|what about|how about)\b/i;

/** Words in a message that say what to look for (none in "search on web", "and in slack?", "more"). */
function contentWords(question: string): string[] {
  const words = keywords(question, 12).split(" ").filter((w) => w && !STEER.includes(w));
  return REDIRECT.test(question) ? words.filter((w) => !SOURCE_NAMES.includes(w)) : words;
}

/** A message that only makes sense with the conversation before it. */
export function isFollowUp(question: string, history: ChatTurn[]): boolean {
  if (!history.some((t) => t.role === "user")) return false;
  return contentWords(question).length === 0 || (question.trim().split(/\s+/).length <= 8 && ANAPHORA.test(question));
}

/**
 * Deterministic standalone version of a follow-up: the latest earlier question with a topic, plus whatever the new
 * message adds beyond steering words ("what about last week" → "<that question> last week"). Used when the model
 * isn't needed or fails.
 */
export function carryOver(question: string, history: ChatTurn[]): string {
  if (!isFollowUp(question, history)) return question;
  const topic = history.findLast((t) => t.role === "user" && contentWords(t.content).length > 0)?.content.trim();
  if (!topic) return question;
  const rest = question.replace(STEER_WORDS, " ").replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  return `${topic.replace(/[?.!\s]+$/, "")}${rest ? ` ${rest}` : ""}`;
}

const RouteSchema = z.object({
  standalone: z.string().catch(""),
  route: z.enum(["general", "personal", "web", "action"]).catch("personal"),
  sources: z.array(z.string()).catch([]),
  complex: z.boolean().catch(false),
});

function routePrompt(question: string, history: ChatTurn[], sources: { id: string; describes: string }[], rewrite = false) {
  const recent = history.slice(rewrite ? -4 : -2).map((t) => `${t.role}: ${t.content.slice(0, 300)}`).join("\n") || "none";
  return [
    {
      role: "system" as const,
      content: `Classify a question for an assistant connected to the user's own work tools.
Tools: ${sources.map((s) => `${s.id} (${s.describes})`).join("; ") || "none"}.
Return only JSON {${rewrite ? `"standalone":string,` : ""}"route":"general"|"personal"|"web"|"action","sources":[tool ids],"complex":boolean}.${
        rewrite
          ? `\n- standalone: the question rewritten to make sense without the conversation, resolving "it", "that" and the like from it ("who sent it?" → "who sent the Q3 budget email?"). Classify the standalone question.`
          : ""
      }
- general: answerable from general knowledge (facts, explanations, coding, writing help, maths) and not about the user's own emails, files, meetings, projects, people or tasks. Also summarising, rewriting, translating, formatting or turning into notes text the user pasted into the message itself (a transcript, a draft, a passage): that text is the material, nothing needs looking up. Also questions about this conversation itself ("what did I ask?", "summarise our chat") or about what the assistant knows of the user ("what's my name?").
- personal: needs the user's own data. Projects, people or product names the user mentions without "my" are usually theirs.
- web: needs current public information from the internet.
- action: asks to send, draft, post, create, schedule or update something in their tools.
- sources: only the tools likely to hold the answer (empty for general).
- complex: true if a good answer needs multi-step reasoning or a long, careful answer.`,
    },
    { role: "user" as const, content: `Recent conversation:\n${recent}\n\nQuestion: ${question}` },
  ];
}

/**
 * Decides, before any retrieval, whether a question needs the user's sources
 * at all, which ones, and how strong a model the answer needs. Rules first;
 * one fast, cached model call only for ambiguous questions.
 */
export async function decideRoute(
  question: string,
  history: ChatTurn[],
  sources: { id: string; describes: string }[],
  llm: LlmRouter,
  signal?: AbortSignal,
): Promise<{ decision: RouteDecision; llm?: { provider: string; model: string; cached: boolean } }> {
  const ids = sources.map((s) => s.id);
  const asked = history.at(-1);
  // A reply to "what time should it start?" goes back to drafting (which can still hand it on if the user moved on).
  if (asked?.role === "assistant" && asked.needsDetails) {
    const request = history.findLast((t) => t.role === "user")?.content ?? "";
    return { decision: { route: "action", sources: hintedSources(`${request} ${question}`, ids), tier: "strong", reason: "answers a question about an action", by: "rules" } };
  }
  const classify = async (q: string, rewrite: boolean) => {
    try {
      const res = await llm.json({ tier: "fast", messages: routePrompt(q, history, sources, rewrite), maxTokens: 400, reasoning: "low", signal }, (v) => RouteSchema.parse(v));
      let route: RouteKind = res.data.route;
      if (route === "web" && !ids.includes("web")) route = "general";
      const picked = res.data.sources.filter((s) => ids.includes(s));
      const tier: Tier = res.data.complex || route === "personal" || route === "action" ? "strong" : "fast";
      return {
        decision: { route, sources: route === "general" ? [] : picked, tier, reason: "classified by the router model", by: "model" } as RouteDecision,
        standalone: res.data.standalone.trim().slice(0, 500),
        llm: { provider: res.provider, model: res.model, cached: res.cached },
      };
    } catch {
      // Router unavailable: searching is the safe default for an ambiguous question.
      return { decision: { route: "personal", sources: [], tier: "strong", reason: "router unavailable, searching to be safe", by: "fallback" } as RouteDecision };
    }
  };
  const ruled = routeByRules(question, ids);
  if (ruled?.route === "general" || !isFollowUp(question, history)) {
    if (ruled) return { decision: ruled };
    const { decision, llm: used } = await classify(question, false);
    return { decision, llm: used };
  }
  // A follow-up ("search on web", "and in slack?", "who sent it?"): route and search the standalone question.
  let standalone = carryOver(question, history);
  const hinted = hintedSources(question, ids);
  // What the message itself says about where to look wins ("search on web", "check my gmail", "and in slack?").
  const explicit = ruled ?? (hinted.length ? { route: "personal" as const, sources: hinted, tier: "strong" as const, reason: "names where to look", by: "rules" as const } : null);
  const rewrite = contentWords(question).length > 0; // "who sent it?": only a model can say what "it" is
  if (!rewrite) {
    const d = explicit ?? routeByRules(standalone, ids);
    if (d) return { decision: { ...d, question: standalone } };
  }
  // One call both rewrites (when needed) and classifies, so a follow-up costs no extra model call.
  const res = await classify(rewrite ? question : standalone, rewrite);
  if (rewrite && res.standalone) standalone = res.standalone;
  return { decision: { ...(explicit ?? res.decision), question: standalone }, llm: res.llm };
}
