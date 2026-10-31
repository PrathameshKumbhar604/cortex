import type { ChatTurn, Evidence, MemoryItem, Plan } from "@cortex/shared";
import type { PastChat } from "./memory";

export interface SourceBrief {
  id: string;
  describes: string;
}

export interface ActionBrief {
  connector: string;
  action: string;
  title: string;
  params: string;
}

const today = () =>
  new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
const now = () =>
  `${new Date().toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;

function memoryBlock(memories: MemoryItem[]): string {
  return memories.length ? memories.map((m) => `- (${m.kind}) ${m.content}`).join("\n") : "- none";
}

/**
 * The whole current chat within a fixed budget (~2k tokens): the newest messages in full, older ones cut to
 * their opening lines, the oldest dropped only once the budget is spent. No model call, so it costs nothing per turn.
 */
export function historyBlock(history: ChatTurn[], budget = 8000): string {
  if (!history.length) return "none";
  const lines: string[] = [];
  let left = budget;
  for (let i = history.length - 1; i >= 0 && left > 0; i--) {
    const t = history[i]!;
    const recent = history.length - i <= 4; // the last two exchanges carry most follow-ups
    const text = t.content.replace(/\s+/g, " ").trim();
    const cut = text.slice(0, Math.min(recent ? 1500 : 240, left));
    lines.unshift(`${t.role}: ${cut}${cut.length < text.length ? "…" : ""}`);
    left -= cut.length;
  }
  const dropped = history.length - lines.length;
  if (!dropped) return lines.join("\n");
  // The opening message usually sets the topic, so it stays even in a very long chat.
  const first = history[0]!;
  return `${first.role}: ${first.content.replace(/\s+/g, " ").slice(0, 240)}\n(${dropped - 1} earlier messages not shown)\n${lines.join("\n")}`;
}

export function pastChatsBlock(chats: PastChat[]): string {
  return chats
    .map((c) => `- Chat on ${shortDate(c.createdAt)}: user asked "${c.question.slice(0, 200)}"; Cortex answered: ${c.answer.slice(0, 400).replace(/\s+/g, " ")}`)
    .join("\n");
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function planPrompt(question: string, sources: SourceBrief[], memories: MemoryItem[], history: ChatTurn[]) {
  return [
    {
      role: "system" as const,
      content: `You plan research over a user's connected work tools. Today is ${today()}.
Sources:
${sources.map((s) => `- ${s.id}: ${s.describes}`).join("\n")}
What Cortex remembers about the user:
${memoryBlock(memories)}
Return only JSON:
{"intent":"research"|"action"|"chat","rewritten":string,"window":{"since":"YYYY-MM-DD","until":"YYYY-MM-DD","label":string}|null,"subQuestions":[{"id":"q1","question":string,"sources":[source ids],"query":string}]}
Rules:
- 2 to 5 sub-questions that together answer the question (goals, what changed, deadlines, blockers, risks, as relevant).
- Use only the listed source ids; pick the 1-3 most likely sources per sub-question.
- "query" is 2-5 search keywords, no dates.
- Set "window" only when the question implies a time range. Future deadlines count as in range.
- intent "action" when the user asks to send, create, schedule, post or update something; still plan what must be looked up first.
- intent "chat" for greetings or questions about Cortex itself; then subQuestions is [].
- Resolve "it", "that project" etc. from the conversation into "rewritten".`,
    },
    { role: "user" as const, content: `Conversation so far:\n${historyBlock(history)}\n\nQuestion: ${question}` },
  ];
}

export function evidenceBlock(evidence: Evidence[]): string {
  return evidence
    .map((e, i) => {
      const when = e.timestamp ? new Date(e.timestamp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
      const meta = [e.source, e.author, when].filter(Boolean).join(" · ");
      return `[${i + 1}] (${meta}) ${e.title}: ${e.quote}`;
    })
    .join("\n");
}

export const SECTION = {
  conflicts: "<<<CONFLICTS>>>",
  missing: "<<<MISSING>>>",
  actions: "<<<ACTIONS>>>",
  memory: "<<<MEMORY>>>",
  next: "<<<NEXT>>>",
} as const;

export function synthPrompt(opts: {
  question: string;
  plan: Plan;
  evidence: Evidence[];
  memories: MemoryItem[];
  history: ChatTurn[];
  failures: string[];
  actions: ActionBrief[];
  fast: boolean;
}) {
  const { question, plan, evidence, memories, history, failures, actions, fast } = opts;
  const actionList = actions.length
    ? actions.map((a) => `- ${a.connector}.${a.action}(${a.params}): ${a.title}`).join("\n")
    : "- none available";
  return [
    {
      role: "system" as const,
      content: `You are Cortex, a research assistant over the user's own tools. Today is ${today()}.
Answer ONLY from the numbered evidence. Every sentence that states a fact must cite evidence like [2] or [2][5], including risk and analysis sentences (cite the evidence they rest on). Never invent names, dates, numbers or links. If the evidence does not cover part of the question, say so plainly in one sentence. Do not cite memory as evidence.
${fast ? "Be brief: 2-5 sentences or bullets." : "Lead with a one-sentence answer, then one or two short paragraphs. Use bullets only for three or more parallel items. Call out risks explicitly."}
Use markdown. No preamble.
${failures.length ? `Unavailable sources (mention only if it limits the answer): ${failures.join("; ")}` : ""}
After the answer, write these five sections exactly:
${SECTION.conflicts}
One line per contradiction between sources about the same fact, e.g. "Demo Day date differs: Nov 12 vs Nov 14 [3][7]". Otherwise "none".
${SECTION.missing}
One line per thing the question asked that the evidence does not answer. Otherwise "none".
${SECTION.actions}
A JSON array of actions ONLY if the user asked you to draft, send, post, create, schedule or update something; otherwise []. Put the full drafted text in the action's args, NOT in the answer: in the answer, say in one sentence what you prepared and that it is waiting for their approval. Available:
${actionList}
Format: [{"connector":"gmail","action":"send_email","title":"Email Dr. Ruiz the update","args":{...}}]. Fill args from evidence; never guess an email address that is not in the evidence.
${SECTION.next}
Up to 3 short follow-up questions the user is likely to ask next, one per line, each under 60 characters.`,
    },
    {
      role: "user" as const,
      content: `What Cortex remembers:\n${memoryBlock(memories)}\n\nConversation:\n${historyBlock(history)}\n\nPlan:\n${plan.subQuestions.map((q) => `- ${q.question}`).join("\n") || "- direct answer"}\n\nEvidence:\n${evidenceBlock(evidence)}\n\nQuestion: ${question}`,
    },
  ];
}

export function verifyPrompt(items: { i: number; claim: string; evidence: string }[]) {
  return [
    {
      role: "system" as const,
      content: `For each claim, judge whether the quoted evidence supports it. Return only JSON: {"results":[{"i":number,"status":"supported"|"partial"|"unsupported"}]}. "partial" = some details are not in the evidence.`,
    },
    { role: "user" as const, content: items.map((x) => `#${x.i} CLAIM: ${x.claim}\nEVIDENCE: ${x.evidence}`).join("\n\n") },
  ];
}

/** Drafts the action the user asked for, or asks for missing details. Never executed without approval. */
export function actionPrompt(question: string, evidence: Evidence[], actions: ActionBrief[], history: ChatTurn[] = []) {
  return [
    {
      role: "system" as const,
      content: `Draft the single action the user asked for. It will be shown to them for approval before anything is sent.
Now: ${now()}. Write datetimes as local ISO without an offset (2026-10-30T16:00:00); resolve "tomorrow", "next Monday" etc. from now.
Available actions:
${actions.map((a) => `- ${a.connector}.${a.action}(${a.params}): ${a.title}`).join("\n") || "- none"}
Use only facts from the request, the conversation and the evidence; never invent email addresses, dates, times or names.
If the latest message does not ask you to send, create, post or change something (it is a question, a search like "latest files", or the user moved on), return {"notAction":true}.
If a required detail (marked without ?) is missing or vague, do not guess: ask for it in one short, friendly question in everyday words, starting directly with the question.
Never mention field names, IDs, formats or other technical terms. Find IDs (a page, file or channel the user names) in the evidence; if you can't, ask for it by name ("Which Notion page should it go under?").
Fill optional details only when the user gave them; sensible defaults are fine (30 minutes for a meeting). Write the text the user would send, in a natural, concise voice.
Return only JSON, one of: {"connector":"...","action":"...","title":"short description","args":{...}}, {"ask":"your question"}, {"notAction":true}.`,
    },
    {
      role: "user" as const,
      content: `Conversation so far:
${historyBlock(history)}

Evidence:
${evidenceBlock(evidence)}

Request: ${question}`,
    },
  ];
}

/** Questions that don't need the user's sources: answer directly. */
export function generalPrompt(
  question: string,
  history: ChatTurn[],
  memories: MemoryItem[],
  pastChats: PastChat[] = [],
  otherChats: { on: boolean; asked: boolean } = { on: false, asked: false },
) {
  const past = pastChats.length
    ? `\nThe user allowed you to use their other chats. Related ones (use only if relevant, and then say "from your chat on <date>"):\n${pastChatsBlock(pastChats)}`
    : !otherChats.asked
      ? ""
      : otherChats.on
        ? "\nThe user asked about their other chats, but none are saved yet or none relate to this. Say so plainly."
        : `\nThe user asked about their other chats, but reading them is switched off. Don't claim this is your first chat: say you can't see other chats, and that they can turn on "Use my other chats" on the Memory page.`;
  return [
    {
      role: "system" as const,
      content: `You are Cortex, a helpful assistant. Today is ${today()}. This question does not need the user's own tools, so answer it directly, clearly and concisely, in markdown.
When the message gives you text to work on (summarise, rewrite, translate, turn into notes), that text is the whole material: work only from it, keep its meaning, and don't say anything is missing from the user's sources.
Questions about this conversation ("what did I ask?") are answered from the conversation below; questions about the user ("what's my name?") from what you remember about them. If neither has it, say you don't know yet.
Never state facts about the user's own emails, files, meetings, projects or teammates beyond what is below; if the question needs them, say you can look it up in their connected apps.
What you remember about the user (follow their preferences):
${memoryBlock(memories)}${past}`,
    },
    { role: "user" as const, content: `Conversation so far:\n${historyBlock(history)}\n\n${question}` },
  ];
}

export function chatPrompt(question: string, history: ChatTurn[]) {
  return [
    {
      role: "system" as const,
      content:
        "You are Cortex, a research assistant that answers questions from the user's connected tools (Gmail, Calendar, Drive, Notion, Slack, GitHub, web) with citations, remembers their priorities, and can take actions after confirmation. Reply briefly and helpfully. Do not state facts about the user's work here; suggest a question instead.",
    },
    { role: "user" as const, content: `Conversation:\n${historyBlock(history)}\n\n${question}` },
  ];
}

export function briefPrompt(evidence: Evidence[], memories: MemoryItem[]) {
  return [
    {
      role: "system" as const,
      content: `You write a daily brief from the user's tools. Today is ${today()}. Use ONLY the evidence. Rank by the user's priorities:
${memoryBlock(memories)}
Return only JSON: {"headline":string,"cards":[{"kind":"changed"|"risk"|"conflict"|"upcoming","title":string,"detail":string,"evidence":[numbers],"when":"YYYY-MM-DD"|null}]}
4 to 8 cards. "title" under 70 characters. "detail" one or two sentences. Each card cites at least one evidence number. A conflict card is for two sources disagreeing about the same fact.`,
    },
    { role: "user" as const, content: evidenceBlock(evidence) },
  ];
}
