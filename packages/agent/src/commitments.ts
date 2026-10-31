import { z } from "zod";
import type { Evidence, SourceFailure } from "@cortex/shared";
import type { AgentDeps } from "./run";
import { evidenceBlock } from "./prompts";

/**
 * Experimental: the Commitments radar. Finds promises made in mail, chat, docs and issues ("I'll review #57 tomorrow"),
 * then checks each against the other sources for proof it was kept. The model proposes; judge() below decides, so a
 * "kept" always has separate proof and a passed due date always shows as overdue.
 */
export type CommitmentStatus = "overdue" | "at_risk" | "open" | "kept";

export interface Commitment {
  /** "You" when the user made the promise. */
  owner: string;
  mine: boolean;
  to: string | null;
  what: string;
  due: string | null; // YYYY-MM-DD
  status: CommitmentStatus;
  /** One sentence on why: what the proof shows, or what is missing. */
  reason: string;
  promise: Evidence[];
  proof: Evidence[];
}

export interface Radar {
  commitments: Commitment[];
  failures: SourceFailure[];
  generatedAt: string;
  sources: number;
}

const RawSchema = z.object({
  commitments: z
    .array(
      z.object({
        owner: z.string().catch("Someone"),
        to: z.string().nullable().optional().catch(null),
        what: z.string(),
        due: z.string().nullable().optional().catch(null),
        status: z.enum(["kept", "open", "at_risk", "broken"]).catch("open"),
        reason: z.string().catch(""),
        promise: z.array(z.coerce.number()).catch([]),
        proof: z.array(z.coerce.number()).catch([]),
      }),
    )
    .catch([]),
});
export type RawCommitment = z.infer<typeof RawSchema>["commitments"][number];

const ORDER: Record<CommitmentStatus, number> = { overdue: 0, at_risk: 1, open: 2, kept: 3 };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Turns the model's proposals into grounded commitments. Pure, so it is tested without a model. */
export function judge(raw: RawCommitment[], evidence: Evidence[], today: string): Commitment[] {
  const seen = new Set<string>();
  const out: Commitment[] = [];
  for (const r of raw) {
    const at = (n: number) => evidence[n - 1];
    const promise = [...new Set(r.promise)].map(at).filter((e): e is Evidence => !!e);
    if (!promise.length || !r.what.trim()) continue; // no quote of the promise: not shown
    const proof = [...new Set(r.proof)].map(at).filter((e): e is Evidence => !!e && !promise.includes(e));
    const due = /^\d{4}-\d{2}-\d{2}/.test(r.due ?? "") ? r.due!.slice(0, 10) : null;
    let status: CommitmentStatus = r.status === "broken" ? "overdue" : r.status;
    let reason = r.reason.replace(/\s*\((?:items?|evidence|e)\s*[\d,\s&and]+\)/gi, "").trim(); // the numbers mean nothing to the reader
    if (status === "kept" && !proof.length) {
      status = "open"; // "kept" needs evidence from elsewhere, not the promise itself
      reason = "No sign yet in your sources that this was done.";
    }
    if (status !== "kept" && due && due < today) status = "overdue";
    else if (status === "overdue" && (!due || due >= today)) status = "at_risk"; // can't be late before it's due
    const key = norm(r.what);
    if (seen.has(key)) continue;
    seen.add(key);
    const owner = r.owner.trim() || "Someone";
    out.push({ owner, mine: /^(you|me|i|myself)$/i.test(owner), to: r.to?.trim() || null, what: r.what.trim(), due, status, reason, promise, proof });
  }
  return out.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

const PROMISE = /\b(i['’]ll|i will|i['’]m going to|i can have|we['’]ll|on it|will (?:send|review|share|fix|get|finish|follow)|please (?:complete|send|submit|review)|due|deadline|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight|eod|end of|next))/i;

/** Numbers (1-based) of items worded like a promise or a request; a hint so a small model doesn't skip them. */
export function promiseHints(evidence: Evidence[]): number[] {
  return evidence.flatMap((e, i) => (PROMISE.test(e.quote) ? [i + 1] : []));
}

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

function radarPrompt(evidence: Evidence[], me: string) {
  return [
    {
      role: "system" as const,
      content: `You find commitments in a person's work apps and check whether each was kept. Today is ${iso(0)}. The user is ${me}; call them "You".
A commitment is a promise or an assigned task with an owner: "I'll review it tomorrow", "please complete by Friday", a sprint task with an owner, a reply someone is waiting on. Not general news.
Include the user's own promises AND ones teammates or others made (to the user or the team), and kept ones too: a planned or promised task someone later reports done.
"to": who it was promised to, as named in the promise item itself (a sender, a channel's team, a requester); null if the item doesn't say.
For each, cite the evidence where it was made ("promise"). In "proof", cite EVERY other item about the same thing (the PR, issue, event, doc or reply), whether it shows it done, still waiting or blocked. Leave "proof" empty only if no other item mentions it.
status: "kept" only if proof shows it done; "broken" if proof shows it was not done in time; "at_risk" if proof shows it blocked or slipping; else "open".
"due": YYYY-MM-DD resolved from the evidence ("tomorrow" in a message is the day after it was sent), or null.
"reason": one plain sentence on what the proof shows or what is missing, naming the apps (e.g. "GitHub still shows PR #57 waiting for review"). Never mention item numbers.
Use ONLY the evidence. Return only JSON: {"commitments":[{"owner":string,"to":string|null,"what":string,"due":string|null,"status":"kept"|"open"|"at_risk"|"broken","reason":string,"promise":[numbers],"proof":[numbers]}]}
Find 6 to 12, at least a third of them made by someone other than the user when the evidence has them. "what" under 80 characters, starting with a verb.`,
    },
    { role: "user" as const, content: `${evidenceBlock(evidence)}\n\nWorded like a promise or request, check each: ${promiseHints(evidence).map((n) => `[${n}]`).join(" ") || "none"}` },
  ];
}

/** One search per connected source (last 30 days to 3 weeks ahead) and one model call, cached for 20 minutes. */
export async function runRadar(deps: AgentDeps, userId: string, me = "the person whose apps these are"): Promise<Radar> {
  const ctx = { userId, signal: AbortSignal.timeout(60_000) };
  const connected = (await deps.registry.connected(ctx)).filter((c) => c.id !== "web");
  const results = await Promise.all(
    connected.map((c) => deps.registry.safeSearch(c.id, { query: "", since: iso(-30), until: iso(21), limit: 8 }, ctx)),
  );
  const failures: SourceFailure[] = [];
  const evidence: Evidence[] = [];
  for (const r of results) {
    if (r.ok) evidence.push(...r.items.map((it) => ({ ...it, id: "" })));
    else failures.push(r.failure);
  }
  evidence.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  const ranked = evidence.slice(0, 36).map((e, i) => ({ ...e, id: `e${i + 1}` }));
  const base = { failures, generatedAt: new Date().toISOString(), sources: connected.length };
  if (!ranked.length) return { commitments: [], ...base };

  const res = await deps.llm.json(
    { tier: "strong", messages: radarPrompt(ranked, me), maxTokens: 1800, cacheTtlMs: 20 * 60_000, signal: ctx.signal },
    (v) => RawSchema.parse(v),
  );
  return { commitments: judge(res.data.commitments, ranked, iso(0)), ...base };
}
