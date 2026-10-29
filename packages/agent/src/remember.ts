import { z } from "zod";
import type { LlmRouter } from "@cortex/llm";
import type { MemoryItem, MemoryKind } from "@cortex/shared";
import { explicitMemory, type MemoryBackend } from "./memory";

/**
 * Automatic memory, after each answer. Rules decide whether a message could hold anything durable
 * (most questions don't, so most turns cost nothing); then one fast-model call extracts it under a
 * strict policy, sees the related memories so it can skip repeats and replace contradicted ones,
 * and nothing that looks like a secret is ever written.
 */

// Statements about the user: "I'm…", "my manager is…", "we ship…", "call me…", "I prefer…".
const ABOUT_ME = /\b(i am|i'm|im|i work|i study|i prefer|i like|i love|i hate|i always|i never|i usually|i don'?t|i do not|i need|i have|i've|my|mine|we|we're|our|call me|remember|keep in mind|note that|from now on)\b/i;
// Questions and commands ("what's due?", "send an email to Rahul") ask for something; they state nothing to keep.
const QUESTION =
  /^\s*(please\s+)?(what|what's|when|where|who|whom|which|why|how|is|are|was|were|do|does|did|can|could|will|would|should|any|show|find|get|fetch|list|give|tell me|search|summari[sz]e|check|send|draft|email|reply|create|schedule|book|post|add|open|remind|cancel)\b/i;
const SECRET =
  /\b(password|passcode|passwd|pin|otp|one[- ]time code|api[ _-]?key|secret|token|private key|ssn|aadhaar|pan (?:no|number)|card number|cvv|iban)\b|\b(sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{10,}|\b[A-Za-z0-9+/_-]{32,}\b|\b(?:\d[ -]?){13,19}\b/i;

export function mightHoldMemory(message: string): boolean {
  const m = message.trim();
  if (m.length < 12 || SECRET.test(m)) return false;
  if (/\b(remember|keep in mind|note that|from now on)\b/i.test(m)) return true;
  // A single question or command states nothing about the user (a second sentence might).
  if ((QUESTION.test(m) || /\?\s*$/.test(m)) && !/[.!?]\s+\S/.test(m)) return false;
  // Statements: about the user ("my manager is…"), or a plain fact about their work ("Demo Day is on Nov 12").
  return ABOUT_ME.test(m) || m.split(/\s+/).length >= 4;
}

export function looksSecret(text: string): boolean {
  return SECRET.test(text);
}

const Candidate = z.object({
  content: z.string().min(4).max(240),
  kind: z.enum(["priority", "preference", "fact", "person", "decision"]).catch("fact"),
  salience: z.number().min(0).max(1).catch(0.5),
  reason: z.string().max(160).catch("Mentioned in conversation"),
  replaces: z.string().optional().catch(undefined),
});
type Candidate = z.infer<typeof Candidate>;

function extractPrompt(message: string, related: MemoryItem[]) {
  return [
    {
      role: "system" as const,
      content: `You decide what an assistant should remember long-term about its user from their latest message.
Save only durable things that will still matter in a week: priorities and goals, standing preferences about how to answer or act, facts about their work, role, projects or schedule, people and their roles, and decisions made.
Never save: small talk, greetings, jokes, insults or venting, one-off requests or questions, what the assistant should do right now, things already known (listed below), or anything secret (passwords, codes, keys, IDs, card or bank numbers).
Write each memory as a short third-person fact in plain words ("Prefers short answers", "Manager is Priya Shah"). Most messages hold nothing worth saving: then return {"memories":[]}.
If a new memory contradicts or updates a known one, set "replaces" to that memory's id.
Known memories:
${related.map((m) => `- [${m.id}] (${m.kind}) ${m.content}`).join("\n") || "- none"}
Return only JSON: {"memories":[{"content":"...","kind":"priority|preference|fact|person|decision","salience":0.0-1.0,"reason":"why it matters, under 12 words","replaces":"id or omit"}]} with at most 2 items.`,
    },
    { role: "user" as const, content: `Latest message:\n"""\n${message.slice(0, 1500)}\n"""` },
  ];
}

export interface RememberResult {
  written: MemoryItem[];
  llm?: { provider: string; model: string; cached: boolean };
}

export async function remember(
  message: string,
  o: { userId: string; runId: string; related: MemoryItem[]; memory: MemoryBackend; llm: LlmRouter; allowLlm: boolean; signal?: AbortSignal },
): Promise<RememberResult> {
  const out: RememberResult = { written: [] };
  const candidates: (Candidate & { explicit?: boolean })[] = [];
  const explicit = explicitMemory(message);
  if (explicit && !looksSecret(explicit.content)) {
    candidates.push({ ...explicit, salience: 0.95, reason: "You asked me to keep this in mind", explicit: true });
  }
  if (o.allowLlm && mightHoldMemory(message)) {
    try {
      const res = await o.llm.json(
        { tier: "fast", messages: extractPrompt(message, o.related), maxTokens: 600, reasoning: "low", cacheTtlMs: 0, signal: o.signal },
        (v) => z.object({ memories: z.array(z.unknown()).catch([]) }).parse(v).memories,
      );
      out.llm = { provider: res.provider, model: res.model, cached: res.cached };
      for (const raw of res.data.slice(0, 2)) {
        const c = Candidate.safeParse(raw);
        if (c.success && c.data.salience >= 0.5 && !looksSecret(c.data.content)) candidates.push(c.data);
      }
    } catch {
      // extraction is best-effort; the answer is already out
    }
  }

  const known = new Map(o.related.map((m) => [m.id, m]));
  for (const c of candidates.slice(0, 2)) {
    const replaced = c.replaces ? known.get(c.replaces) : undefined;
    // One slow or failed write must not lose the other.
    const item = await o.memory
      .add({
      userId: o.userId,
      content: c.content,
      kind: c.kind as MemoryKind,
      salience: c.salience,
      reason: replaced ? `${c.reason} (replaces “${replaced.content.slice(0, 60)}”)` : c.reason,
        source: "conversation",
        runId: o.runId,
        replaces: replaced && !replaced.pinned ? replaced.id : undefined,
      })
      .catch(() => null);
    if (item && !out.written.some((w) => w.id === item.id)) out.written.push(item);
  }
  return out;
}
