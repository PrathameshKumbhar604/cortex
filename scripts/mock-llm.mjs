// DEV-ONLY mock of an OpenAI-compatible endpoint, for UI testing without API keys.
// It never invents facts: answers are built by quoting the evidence lines in the prompt.
// Enable with CORTEX_MOCK_LLM_URL=http://localhost:4010/v1 (it is then the only provider).
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);

function evidenceLines(text) {
  return [...text.matchAll(/^\[(\d+)\] \(([^)]*)\) ([^:]+): (.+)$/gm)].map((m) => ({ n: m[1], meta: m[2], title: m[3], quote: m[4] }));
}

function firstSentence(s) {
  const m = s.match(/^.*?(?<!\b(?:Dr|Mr|Ms|Mrs|No|St|vs))[.!?](?=\s|$)/);
  return (m ? m[0] : s).replace(/[.!?]$/, "");
}

function reply(body) {
  const sys = body.messages.find((m) => m.role === "system")?.content ?? "";
  const user = body.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (sys.includes("You plan research")) {
    const q = user.split("Question:").at(-1).trim();
    return JSON.stringify({
      intent: /\b(draft|send|post|email|schedule)\b/i.test(q) ? "action" : "research",
      rewritten: q,
      window: null,
      subQuestions: [
        { id: "q1", question: "What changed recently?", sources: ["slack", "gmail", "github"], query: "demo day moved" },
        { id: "q2", question: "What is blocked?", sources: ["slack", "github", "gmail"], query: "blocked credentials" },
        { id: "q3", question: "Which deadlines are coming up?", sources: ["calendar", "notion", "gmail"], query: "due deadline" },
      ],
    });
  }
  if (sys.includes("judge whether the quoted evidence")) return JSON.stringify({ results: [] });
  if (sys.includes("daily brief")) {
    const ev = evidenceLines(user);
    return JSON.stringify({
      headline: "Demo Day moved earlier, and two blockers threaten the beta.",
      cards: ev.slice(0, 6).map((e, i) => ({ kind: ["risk", "conflict", "upcoming", "changed"][i % 4], title: firstSentence(e.quote).slice(0, 68), detail: e.quote, evidence: [Number(e.n)], when: null })),
    });
  }
  if (sys.includes("Answer ONLY from the numbered evidence")) {
    const ev = evidenceLines(user);
    const pick = ev.slice(0, 4);
    const lead = pick[0] ? `${firstSentence(pick[0].quote)} [${pick[0].n}].` : "I couldn't find this in your sources.";
    const bullets = pick.slice(1).map((e) => `- ${firstSentence(e.quote)} [${e.n}].`);
    const demo = ev.filter((e) => /demo day/i.test(e.quote)).map((e) => e.n);
    const action = /\b(draft|send|post)\b.*slack|slack update/i.test(user)
      ? `[{"connector":"slack","action":"send_message","title":"Post the Demo Day update to #orbit-dev","args":{"channel":"orbit-dev","text":"Heads up: Demo Day is now earlier. I'm updating the milestone today."}}]`
      : "[]";
    return [
      lead,
      "",
      ...bullets,
      "- The team already agreed to cut group chat from the beta.",
      "<<<CONFLICTS>>>",
      demo.length > 1 ? `Demo Day date differs between sources [${demo[0]}][${demo[1]}]` : "none",
      "<<<MISSING>>>",
      "none",
      "<<<ACTIONS>>>",
      action,
      "<<<MEMORY>>>",
      "[]",
      "<<<NEXT>>>",
      "Which Demo Day date is correct?",
      "Who owns the login loop?",
      "Draft the progress report timeline",
    ].join("\n");
  }
  return "Cortex answers questions from your connected tools, with citations. Try asking what changed this week.";
}

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    if (!req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(raw || "{}");
    const text = reply(body);
    if (!body.stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "mock", object: "chat.completion", created: 0, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const piece of text.match(/[\s\S]{1,12}/g) ?? []) {
      res.write(`data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 0, model: body.model, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
      await new Promise((r) => setTimeout(r, 18));
    }
    res.end("data: [DONE]\n\n");
  });
}).listen(PORT, () => console.log(`mock LLM on http://localhost:${PORT}/v1`));
