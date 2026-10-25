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
    const used = new Set();
    const card = (kind, title, items) => {
      items.forEach((e) => used.add(e.n));
      return { kind, title, detail: items[0].quote, evidence: items.map((e) => Number(e.n)), when: null };
    };
    const cards = [];
    const demo = ev.filter((e) => /demo day (has )?moved/i.test(e.quote) || /milestone/i.test(e.title));
    const demoSources = new Set(demo.map((e) => e.meta.split(" · ")[0]));
    if (demo.length > 1 && demoSources.size > 1) cards.push(card("conflict", "Demo Day date differs between sources", demo.slice(0, 2)));
    for (const e of ev.filter((e) => /blocked|loop|bug|requested changes/i.test(e.quote) && !used.has(e.n)).slice(0, 2))
      cards.push(card("risk", firstSentence(e.quote), [e]));
    for (const e of ev.filter((e) => /^calendar/.test(e.meta) && !used.has(e.n)).slice(0, 3)) cards.push(card("upcoming", e.title, [e]));
    for (const e of ev.filter((e) => !used.has(e.n)).slice(0, 2)) cards.push(card("changed", firstSentence(e.quote), [e]));
    const risks = cards.filter((c) => c.kind === "risk").length;
    return JSON.stringify({
      headline: cards.some((c) => c.kind === "conflict")
        ? `Demo Day moved, and ${risks} item${risks === 1 ? "" : "s"} could hold up the beta.`
        : `${cards.length} updates across your sources this week.`,
      cards,
    });
  }
  if (sys.includes("Answer ONLY from the numbered evidence")) {
    const ev = evidenceLines(user);
    const pick = ev.slice(0, 3);
    const lead = pick[0] ? `${firstSentence(pick[0].quote)} [${pick[0].n}].` : "I couldn't find this in your sources.";
    const rest = pick.slice(1).map((e) => `${firstSentence(e.quote)} [${e.n}].`).join(" ");
    const report = ev.find((e) => /progress report/i.test(e.quote));
    // One deliberately over-reaching claim, so partial verification is visible in demos.
    const partial = report ? `The progress report should also cover hosting costs, budget and a risk register [${report.n}].` : "";
    const demo = ev.filter((e) => /demo day/i.test(e.quote)).map((e) => e.n);
    const action = /\b(draft|send|post)\b.*slack|slack update/i.test(user)
      ? `[{"connector":"slack","action":"send_message","title":"Post the Demo Day update to #orbit-dev","args":{"channel":"orbit-dev","text":"Heads up: Demo Day is now earlier. I'm updating the milestone today."}}]`
      : "[]";
    return [
      `${lead} ${rest}`,
      "",
      `${partial} The team already agreed to cut group chat from the beta.`.trim(),
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
