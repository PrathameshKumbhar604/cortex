import { z } from "zod";
import type { LlmRouter, Tier } from "@cortex/llm";
import type { ChatTurn, RouteDecision, RouteKind } from "@cortex/shared";

const GREETING = /^\s*(hi|hello|hey|yo|thanks|thank you|thx|ok(ay)?|cool|great|nice|good (morning|afternoon|evening))\b[\s!.,]*$/i;
const ABOUT_CORTEX = /\b(who are you|what can you do|what are you|how do you work|help me get started)\b/i;
const URL = /https?:\/\/\S+/i;
const WEB = /\b(search the web|on the (web|internet)|online|latest news|news (about|on)|look (it )?up online)\b/i;
const ACTION =
  /\b(send|draft|reply to|write (an? )?(email|message|reply)|email (him|her|them)|post (a |an |this |that )?(message|update)?|create (an? )?(event|meeting|issue|page|doc)|schedule|book (a )?(meeting|call)|open (an? )?issue|comment on|add (an? )?(event|meeting))\b/i;
/** Requests that start with a command verb ("Email Dr. Ruiz…", "Remind the team…"). */
const IMPERATIVE = /^\s*(please\s+)?(email|e-mail|mail|message|text|ping|dm|tell|remind|ask|invite|notify|schedule|send|draft|reply|respond|post|create|book|add|open|file|comment|update|reschedule|cancel|share)\b/i;
const SOURCE_WORDS =
  /\b(e-?mails?|inbox|gmail|mail|calendar|meetings?|events?|schedule|drive|docs?|files?|notion|pages?|slack|channels?|dms?|github|issues?|prs?|pull requests?|repos?|commits?|milestones?|sprints?|deadlines?|due|standup|advisor|team(mates?)?|projects?|tasks?|todos?|brief)\b/i;
const PERSONAL = /\b(my|mine|our|ours|i|i'm|i've|me|we|us)\b/i;

const SOURCE_HINTS: [RegExp, string][] = [
  [/\b(e-?mails?|inbox|gmail|mail|reply|sent)\b/i, "gmail"],
  [/\b(calendar|meetings?|events?|schedule|tomorrow|today|next week|standup)\b/i, "calendar"],
  [/\b(drive|docs?|files?|report|slides|sheet)\b/i, "drive"],
  [/\b(notion|pages?|spec|notes|wiki)\b/i, "notion"],
  [/\b(slack|channels?|dms?|chat|thread)\b/i, "slack"],
  [/\b(github|issues?|prs?|pull requests?|repos?|commits?|milestones?|bugs?)\b/i, "github"],
];

function hintedSources(q: string, available: string[]): string[] {
  return SOURCE_HINTS.filter(([re, id]) => re.test(q) && available.includes(id)).map(([, id]) => id);
}

/** Clear-cut cases decided without a model call. */
export function routeByRules(question: string, available: string[]): RouteDecision | null {
  const q = question.trim();
  if (GREETING.test(q) || ABOUT_CORTEX.test(q)) return { route: "general", sources: [], tier: "fast", reason: "greeting or question about Cortex", by: "rules" };
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

const RouteSchema = z.object({
  route: z.enum(["general", "personal", "web", "action"]).catch("personal"),
  sources: z.array(z.string()).catch([]),
  complex: z.boolean().catch(false),
});

function routePrompt(question: string, history: ChatTurn[], sources: { id: string; describes: string }[]) {
  const recent = history.slice(-2).map((t) => `${t.role}: ${t.content.slice(0, 200)}`).join("\n") || "none";
  return [
    {
      role: "system" as const,
      content: `Classify a question for an assistant connected to the user's own work tools.
Tools: ${sources.map((s) => `${s.id} (${s.describes})`).join("; ") || "none"}.
Return only JSON {"route":"general"|"personal"|"web"|"action","sources":[tool ids],"complex":boolean}.
- general: answerable from general knowledge (facts, explanations, coding, writing help, maths) and not about the user's own emails, files, meetings, projects, people or tasks.
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
  const ruled = routeByRules(question, ids);
  if (ruled) return { decision: ruled };
  try {
    const res = await llm.json({ tier: "fast", messages: routePrompt(question, history, sources), maxTokens: 400, reasoning: "low", signal }, (v) => RouteSchema.parse(v));
    let route: RouteKind = res.data.route;
    if (route === "web" && !ids.includes("web")) route = "general";
    const picked = res.data.sources.filter((s) => ids.includes(s));
    const tier: Tier = res.data.complex || route === "personal" || route === "action" ? "strong" : "fast";
    return {
      decision: { route, sources: route === "general" ? [] : picked, tier, reason: "classified by the router model", by: "model" },
      llm: { provider: res.provider, model: res.model, cached: res.cached },
    };
  } catch {
    // Router unavailable: searching is the safe default for an ambiguous question.
    return { decision: { route: "personal", sources: [], tier: "strong", reason: "router unavailable, searching to be safe", by: "fallback" } };
  }
}
