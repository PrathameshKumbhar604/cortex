/**
 * Offline eval over the sample workspace with real free-tier models.
 * Usage: npm run eval [-- --mode fast]
 * Reports groundedness, citation recall, conflict/not-found/action accuracy and latency.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { ActionStore, runAgent, type MemoryBackend } from "@cortex/agent";
import { buildRegistry } from "@cortex/connectors";
import { LlmRouter } from "@cortex/llm";
import type { AgentEvent, RunMode } from "@cortex/shared";

const root = path.resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(root);

interface Case {
  id: string;
  question: string;
  expect: string[];
  expectConflict?: boolean;
  expectNotFound?: boolean;
  expectAction?: string;
}

const noMemory: MemoryBackend = {
  health: async () => ({ ok: true, backend: "none" }),
  recall: async () => [],
  add: async () => null,
  list: async () => [],
  update: async () => {
    throw new Error("n/a");
  },
  remove: async () => {},
  appendThread: async () => {},
};

const mode: RunMode = process.argv.includes("fast") ? "fast" : "deep";
const cases = JSON.parse(readFileSync(path.join(root, "evals/questions.json"), "utf8")) as Case[];
const llm = new LlmRouter({ cachePath: path.join(root, ".cache", "eval-llm-cache.json") });
if (llm.configured.length === 0) {
  console.error("No LLM provider configured. Add GEMINI_API_KEY (or another free key) to .env first.");
  process.exit(1);
}
const deps = { llm, registry: buildRegistry("demo", {}), memory: noMemory, actions: new ActionStore() };

const rows: Record<string, unknown>[] = [];
// Space questions like a person would, so free-tier rate limits don't decide which model answers.
const paceMs = Number(process.env.EVAL_PACE_MS ?? 6000);
for (const [i, c] of cases.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, paceMs));
  const started = Date.now();
  const events: AgentEvent[] = [];
  for await (const e of runAgent({ question: c.question, mode, userId: "eval" }, deps)) events.push(e);
  const answer = (events.find((e) => e.type === "answer") as { markdown: string } | undefined)?.markdown ?? "";
  const verdict = events.find((e) => e.type === "verdict") as Extract<AgentEvent, { type: "verdict" }> | undefined;
  const evidence = (events.find((e) => e.type === "evidence") as Extract<AgentEvent, { type: "evidence" }> | undefined)?.items ?? [];
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => evidence[Number(m[1]) - 1]).filter(Boolean));
  const proposals = events.filter((e) => e.type === "action_proposal") as Extract<AgentEvent, { type: "action_proposal" }>[];
  // Actions carry no citations: their expected facts must appear in the draft instead.
  const citedText = (c.expectAction ? proposals.map((p) => p.proposal.summary) : [...cited].map((e) => `${e!.title} ${e!.quote}`)).join(" ").toLowerCase();
  const recall = c.expect.length ? c.expect.filter((k) => citedText.includes(k.toLowerCase())).length / c.expect.length : 1;
  const error = (events.find((e) => e.type === "error") as { message: string } | undefined)?.message;
  const usage = events.find((e) => e.type === "usage") as Extract<AgentEvent, { type: "usage" }> | undefined;
  rows.push({
    id: c.id,
    ms: Date.now() - started,
    groundedness: verdict?.groundedness ?? null,
    citationRecall: Math.round(recall * 100) / 100,
    conflictOk: c.expectConflict ? (verdict?.conflicts.length ?? 0) > 0 : null,
    notFoundOk: c.expectNotFound ? /couldn't find|not in your sources|no information/i.test(answer) || (verdict?.missing.length ?? 0) > 0 : null,
    // Any action in the expected app counts (e.g. a Gmail draft instead of a send is a fine, safer choice).
    actionOk: c.expectAction ? proposals.some((p) => p.proposal.connectorId === c.expectAction!.split(".")[0]) : null,
    executedWithoutConsent: proposals.some((p) => p.proposal.status !== "pending"),
    error: error ?? null,
    models: usage?.models ?? [],
  });
  console.log(`${c.id.padEnd(18)} ${String(rows.at(-1)!.ms).padStart(6)}ms  grounded=${verdict?.groundedness ?? "-"}  recall=${recall.toFixed(2)}  conflicts=${verdict?.conflicts.length ?? 0} actions=${proposals.length}  [${(usage?.models ?? []).join(",")}]${error ? `  ERROR ${error}` : ""}`);
}

const avg = (k: string) => {
  const v = rows.map((r) => r[k]).filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};
const rate = (k: string) => {
  const v = rows.map((r) => r[k]).filter((x): x is boolean => typeof x === "boolean");
  return v.length ? `${v.filter(Boolean).length}/${v.length}` : "-";
};
const ms = rows.map((r) => r.ms as number).sort((a, b) => a - b);
const summary = {
  mode,
  models: llm.configured.map((p) => `${p.label}:${p.models.strong}`),
  cases: rows.length,
  groundedness: avg("groundedness"),
  citationRecall: avg("citationRecall"),
  conflictsDetected: rate("conflictOk"),
  notFoundHonest: rate("notFoundOk"),
  actionsProposed: rate("actionOk"),
  actionsExecutedWithoutConsent: rows.filter((r) => r.executedWithoutConsent).length,
  p50ms: ms[Math.floor(ms.length / 2)],
  p90ms: ms[Math.floor(ms.length * 0.9)],
};
console.log("\n" + JSON.stringify(summary, null, 2));
mkdirSync(path.join(root, "evals", "results"), { recursive: true });
writeFileSync(path.join(root, "evals", "results", `${mode}-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({ summary, rows }, null, 2));
