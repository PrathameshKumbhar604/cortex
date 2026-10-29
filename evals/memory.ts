/**
 * Automatic-memory eval: a scripted 30-message conversation through the real extraction (fast model)
 * and a real memory service, under a throwaway user whose memories are deleted afterwards.
 * Usage: MEMORY_SERVICE_URL=http://localhost:8001 npx tsx evals/memory.ts
 */
import path from "node:path";
import nextEnv from "@next/env";
import { MemoryClient } from "@cortex/agent";
import { LlmRouter } from "@cortex/llm";
import { remember } from "../packages/agent/src/remember";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."));

// [message, what should be remembered afterwards (lowercase keywords), or null when nothing should be]
const SCRIPT: [string, string[] | null][] = [
  ["hello budyy", null],
  ["what's due this week?", null],
  ["I'm the product manager for Orbit, our mobile app.", ["orbit"]],
  ["haha nice", null],
  ["fetch me the latest pdf from drive", null],
  ["My manager is Priya Shah.", ["priya"]],
  ["chal nikal yaar", null],
  ["From now on keep your answers short, bullet points only.", ["short"]],
  ["any new emails from Rahul?", null],
  ["My gmail password is hunter2, don't forget it", null],
  ["Demo Day is on November 12.", ["nov"]],
  ["thanks!", null],
  ["send an email to Rahul about the report", null],
  ["I usually work from 10am to 7pm IST.", ["10"]],
  ["what did Priya say yesterday?", null],
  ["Orbit is my top priority this quarter.", ["orbit"]],
  ["lol", null],
  ["Remember that the beta testers group is on Slack in #orbit-beta.", ["orbit-beta"]],
  ["my OTP is 482913", null],
  ["I prefer emails drafted in a formal tone.", ["formal"]],
  ["how are you?", null],
  ["Demo Day moved to November 14.", ["14"]],
  ["kya haal hai", null],
  ["We decided to drop the Android tablet layout for v1.", ["tablet"]],
  ["show me my calendar for tomorrow", null],
  ["Rahul Mehta is our backend lead.", ["rahul"]],
  ["ok cool", null],
  ["My manager is Priya Shah.", ["priya"]], // repeat: must not duplicate
  ["what's blocking the beta?", null],
  ["you are useless", null],
];

const memory = new MemoryClient(process.env.MEMORY_SERVICE_URL ?? "http://localhost:8001");
const llm = new LlmRouter({});
const userId = `eval-memory-${Date.now()}`;
const SECRETS = /hunter2|482913/;
let llmCalls = 0;
const savedAfterSmallTalk: string[] = [];

try {
  for (const [i, [message, expect]] of SCRIPT.entries()) {
    const related = await memory.recall(userId, message, 5).catch(() => []);
    const res = await remember(message, { userId, runId: `r${i}`, related, memory, llm, allowLlm: true });
    if (res.llm) llmCalls++;
    const saved = res.written.map((m) => m.content);
    if (!expect && saved.length) savedAfterSmallTalk.push(`${message} -> ${saved.join(" | ")}`);
    console.log(`${String(i + 1).padStart(2)}. ${message.padEnd(62).slice(0, 62)} ${saved.length ? `saved: ${saved.join(" | ")}` : "-"}`);
    await new Promise((r) => setTimeout(r, 400)); // free-tier pacing
  }
  const all = (await memory.list(userId)).map((m) => m.content);
  const expected = SCRIPT.filter(([, e]) => e).map(([m, e]) => ({ m, ok: all.some((c) => e!.every((k) => c.toLowerCase().includes(k))) }));
  const missing = expected.filter((x) => !x.ok).map((x) => x.m);
  const priya = all.filter((c) => /priya/i.test(c)).length;
  const demo = all.filter((c) => /demo day/i.test(c));
  console.log("\nStored:", all);
  console.log(
    JSON.stringify(
      {
        messages: SCRIPT.length,
        modelCalls: llmCalls,
        stored: all.length,
        expectedFound: `${expected.length - missing.length}/${expected.length}`,
        missing,
        savedFromSmallTalkOrQuestions: savedAfterSmallTalk,
        secretsStored: all.filter((c) => SECRETS.test(c)).length,
        repeatDuplicated: priya > 1,
        contradictionSuperseded: demo.length === 1 && /14/.test(demo[0] ?? ""),
      },
      null,
      2,
    ),
  );
} finally {
  for (const m of await memory.list(userId)) await memory.remove(m.id);
}
