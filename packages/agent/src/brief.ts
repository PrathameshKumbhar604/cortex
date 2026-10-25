import { z } from "zod";
import type { Evidence, MemoryItem, SourceFailure } from "@cortex/shared";
import type { AgentDeps } from "./run";
import { briefPrompt } from "./prompts";

export interface BriefCard {
  kind: "changed" | "risk" | "conflict" | "upcoming";
  title: string;
  detail: string;
  when: string | null;
  evidence: Evidence[];
}

export interface Brief {
  headline: string;
  cards: BriefCard[];
  failures: SourceFailure[];
  generatedAt: string;
  sources: number;
}

const BriefSchema = z.object({
  headline: z.string().catch("Here's what changed"),
  cards: z
    .array(
      z.object({
        kind: z.enum(["changed", "risk", "conflict", "upcoming"]).catch("changed"),
        title: z.string(),
        detail: z.string().catch(""),
        evidence: z.array(z.coerce.number()).catch([]),
        when: z.string().nullable().optional().catch(null),
      }),
    )
    .catch([]),
});

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * Proactive brief: what changed in the last week and what's due in the next
 * three, across every connected source, ranked by remembered priorities.
 * One LLM call; results are cached by the router for 20 minutes.
 */
export async function runBrief(deps: AgentDeps, userId: string): Promise<Brief> {
  const ctx = { userId, signal: AbortSignal.timeout(60_000) };
  const connected = (await deps.registry.connected(ctx)).filter((c) => c.id !== "web");
  const failures: SourceFailure[] = [];

  const results = await Promise.all(
    connected.map((c) => deps.registry.safeSearch(c.id, { query: "", since: iso(-7), until: iso(21), limit: 6 }, ctx)),
  );
  const evidence: Evidence[] = [];
  for (const r of results) {
    if (r.ok) evidence.push(...r.items.map((it) => ({ ...it, id: "" })));
    else failures.push(r.failure);
  }
  evidence.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  const ranked = evidence.slice(0, 24).map((e, i) => ({ ...e, id: `e${i + 1}` }));

  let memories: MemoryItem[] = [];
  try {
    memories = await deps.memory.recall(userId, "priorities projects deadlines", 5);
  } catch {
    failures.push({ source: "memory", name: "Memory", reason: "unreachable", impact: "The brief isn't ranked by your saved priorities." });
  }

  if (ranked.length === 0) {
    return {
      headline: connected.length ? "Nothing new in your sources this week." : "Connect a source to get your daily brief.",
      cards: [],
      failures,
      generatedAt: new Date().toISOString(),
      sources: connected.length,
    };
  }

  const res = await deps.llm.json(
    { tier: "strong", messages: briefPrompt(ranked, memories), maxTokens: 1200, cacheTtlMs: 20 * 60_000, signal: ctx.signal },
    (v) => BriefSchema.parse(v),
  );
  const cards: BriefCard[] = res.data.cards
    .map((c) => ({
      kind: c.kind,
      title: c.title,
      detail: c.detail,
      when: c.when ?? null,
      evidence: c.evidence.map((n) => ranked[n - 1]).filter((e): e is Evidence => !!e),
    }))
    .filter((c) => c.evidence.length > 0) // grounded cards only
    // a conflict needs two sources disagreeing; otherwise it is just a change
    .map((c) => (c.kind === "conflict" && new Set(c.evidence.map((e) => e.source)).size < 2 ? { ...c, kind: "changed" as const } : c));
  const alarming = cards.some((c) => c.kind === "risk" || c.kind === "conflict");
  const headline =
    !alarming && /risk|block|threat|conflict|slip|late/i.test(res.data.headline)
      ? `${cards.length} update${cards.length === 1 ? "" : "s"} across your sources this week.`
      : res.data.headline;

  return { headline, cards, failures, generatedAt: new Date().toISOString(), sources: connected.length };
}
