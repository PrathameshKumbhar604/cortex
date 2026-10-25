import type { ChatTurn, Evidence, MemoryItem, Plan } from "@cortex/shared";

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

function memoryBlock(memories: MemoryItem[]): string {
  return memories.length ? memories.map((m) => `- (${m.kind}) ${m.content}`).join("\n") : "- none";
}

function historyBlock(history: ChatTurn[]): string {
  return history.length
    ? history.slice(-4).map((t) => `${t.role}: ${t.content.slice(0, 300)}`).join("\n")
    : "none";
}

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
      const when = e.timestamp ? new Date(e.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
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
Answer ONLY from the numbered evidence. Every sentence that states a fact must cite evidence like [2] or [2][5]. Never invent names, dates, numbers or links. If the evidence does not cover part of the question, say so plainly in one sentence. Do not cite memory as evidence.
${fast ? "Be brief: 2-5 sentences or bullets." : "Lead with a one-sentence answer, then short bullets grouped by theme. Call out risks explicitly."}
Use markdown. No preamble.
${failures.length ? `Unavailable sources (mention only if it limits the answer): ${failures.join("; ")}` : ""}
After the answer, write these five sections exactly:
${SECTION.conflicts}
One line per contradiction between sources about the same fact, e.g. "Demo Day date differs: Nov 12 vs Nov 14 [3][7]". Otherwise "none".
${SECTION.missing}
One line per thing the question asked that the evidence does not answer. Otherwise "none".
${SECTION.actions}
A JSON array of actions ONLY if the user asked you to do something; otherwise []. Available:
${actionList}
Format: [{"connector":"gmail","action":"send_email","title":"Email Dr. Ruiz the update","args":{...}}]. Fill args from evidence; never guess an email address that is not in the evidence.
${SECTION.memory}
A JSON array (max 2) of durable facts about the user's priorities or preferences, stated in the USER's own words in this conversation, worth remembering next week. Otherwise [].
Format: [{"content":"...","kind":"priority|preference|fact|person|decision","salience":0.0-1.0,"reason":"..."}]
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
