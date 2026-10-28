/**
 * Routing accuracy with real free-tier models: does Cortex decide correctly
 * whether a question needs the user's sources? Target ≥ 90%.
 * Usage: npm run eval:routing
 */
import path from "node:path";
import nextEnv from "@next/env";
import { decideRoute } from "@cortex/agent";
import { TOOLKITS } from "@cortex/connectors";
import { LlmRouter } from "@cortex/llm";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."));

// "search" = personal, web or action (anything that touches sources); "general" = answer directly.
const CASES: [string, "general" | "search"][] = [
  ["hello", "general"],
  ["What is the capital of France?", "general"],
  ["Explain how transformers work in simple terms", "general"],
  ["Write a Python function to reverse a linked list", "general"],
  ["What's the difference between TCP and UDP?", "general"],
  ["Give me tips for a good capstone presentation", "general"],
  ["Translate 'good morning' into Spanish", "general"],
  ["What is 17% of 2,400?", "general"],
  ["Summarize the causes of World War I in three bullets", "general"],
  ["How do I center a div in CSS?", "general"],
  ["What changed in Orbit this week?", "search"],
  ["Did Demo Day move?", "search"],
  ["What meetings do I have tomorrow?", "search"],
  ["Any emails from Dr. Ruiz?", "search"],
  ["Is anything blocking the beta?", "search"],
  ["What did Maya say about the login bug?", "search"],
  ["When is the Northbeam assessment due?", "search"],
  ["Draft a Slack update about the new Demo Day date", "search"],
  ["What's the status of PR #57?", "search"],
  ["What did user testing find?", "search"],
];

const llm = new LlmRouter({ cachePath: path.join(path.resolve(import.meta.dirname, ".."), ".cache", "routing-cache.json") });
const sources = [...TOOLKITS.map((t) => ({ id: t.id, describes: t.describes })), { id: "web", describes: "the public web" }];
let correct = 0;
let ruled = 0;
for (const [q, want] of CASES) {
  const { decision } = await decideRoute(q, [], sources, llm);
  const got = decision.route === "general" ? "general" : "search";
  if (got === want) correct++;
  if (decision.by === "rules") ruled++;
  console.log(`${got === want ? "ok  " : "MISS"} ${decision.route.padEnd(8)} ${decision.by.padEnd(5)} ${q}`);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`\nrouting accuracy ${correct}/${CASES.length} (${Math.round((correct / CASES.length) * 100)}%), ${ruled} decided by rules without a model call`);
process.exitCode = correct / CASES.length >= 0.9 ? 0 : 1;
