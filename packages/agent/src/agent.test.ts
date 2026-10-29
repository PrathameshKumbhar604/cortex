import { describe, expect, it } from "vitest";
import { buildRegistry, ConnectorRegistry, DemoConnector, TOOLKITS } from "@cortex/connectors";
import type { LlmRouter } from "@cortex/llm";
import type { AgentEvent, MemoryItem } from "@cortex/shared";
import { ActionStore } from "./actions";
import type { MemoryBackend } from "./memory";
import { runAgent } from "./run";
import { routeByRules } from "./route";
import { parseWindow } from "./time";
import { splitSections, streamCutoff, verifyClaims } from "./verify";

function stubLlm(answer: string, plan?: object, route: object = { route: "personal", sources: [], complex: false }) {
  const calls = { complete: 0, stream: 0, route: 0 };
  const llm = {
    async complete() {
      calls.complete++;
      return { text: JSON.stringify(plan), provider: "stub", model: "m", cached: false };
    },
    async json(o: { messages: { content: string }[] }, validate: (v: unknown) => unknown) {
      const isRoute = o.messages[0]?.content.startsWith("Classify a question");
      if (isRoute) calls.route++;
      else calls.complete++;
      const text = JSON.stringify(isRoute ? route : (plan ?? { results: [] }));
      return { text, provider: "stub", model: "m", cached: false, data: validate(JSON.parse(text)) };
    },
    async *stream() {
      calls.stream++;
      for (const chunk of answer.match(/.{1,7}/gs) ?? []) yield { token: chunk };
      yield { done: { text: answer, provider: "stub", model: "m", cached: false } };
    },
  };
  return { llm: llm as unknown as LlmRouter, calls };
}

function memStub(): MemoryBackend & { added: string[] } {
  const added: string[] = [];
  return {
    added,
    health: async () => ({ ok: true, backend: "test" }),
    recall: async () => [],
    add: async (m) => {
      added.push(m.content);
      return { id: "m1", userId: m.userId, content: m.content, kind: m.kind, source: m.source, reason: m.reason, salience: m.salience, pinned: false, createdAt: "" } as MemoryItem;
    },
    list: async () => [],
    update: async () => {
      throw new Error("n/a");
    },
    remove: async () => {},
    appendThread: async () => {},
  };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const ANSWER = `Demo Day moved to a new date [1], but the GitHub milestone still shows the old one [2].
- Login loop #42 is still open on Android 15 [3].
${"<<<CONFLICTS>>>"}
Demo Day date differs between Slack and GitHub [1][2]
${"<<<MISSING>>>"}
none
${"<<<ACTIONS>>>"}
[{"connector":"slack","action":"send_message","title":"Tell the team","args":{"channel":"orbit-dev","text":"Milestone needs the new date"}}]
${"<<<MEMORY>>>"}
[]`;

describe("runAgent", () => {
  it("Fast Mode uses exactly one LLM call and proposes (never executes) actions", async () => {
    const { llm, calls } = stubLlm(ANSWER);
    const actions = new ActionStore();
    const events = await collect(
      runAgent({ question: "Did demo day move?", mode: "fast", userId: "u1" }, { llm, registry: buildRegistry("demo", {}), memory: memStub(), actions }),
    );
    expect(calls.complete + calls.stream).toBe(1); // plus at most one router call
    expect(calls.route).toBeLessThanOrEqual(1);
    expect(events.find((e) => e.type === "plan")).toBeTruthy();
    expect(events.filter((e) => e.type === "tool_call").length).toBeGreaterThan(0);
    const tokens = events.filter((e) => e.type === "token").map((e) => (e as { text: string }).text).join("");
    expect(tokens).not.toContain("<<<"); // sections never reach the user
    const proposal = events.find((e) => e.type === "action_proposal");
    expect(proposal && proposal.type === "action_proposal" && proposal.proposal.status).toBe("pending");
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict && verdict.type === "verdict" && verdict.conflicts.length).toBe(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("continues with remaining sources when one is down, and says which", async () => {
    const reg = new ConnectorRegistry();
    for (const t of TOOLKITS.filter((t) => t.id !== "slack")) reg.register(new DemoConnector(t));
    reg.register({
      ...new DemoConnector(TOOLKITS.find((t) => t.id === "slack")!),
      id: "slack",
      name: "Slack",
      kind: "mcp",
      describes: "chat",
      impact: "Blockers discussed in chat may be missing.",
      actions: [],
      status: async () => ({ id: "slack", name: "Slack", kind: "mcp", connected: true, available: true, canAct: false }),
      search: async () => {
        throw new Error("ECONNREFUSED");
      },
      execute: async () => ({ ok: false, message: "" }),
    });
    const { llm } = stubLlm("Login loop #42 is still open [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]\n<<<MEMORY>>>\n[]");
    const events = await collect(runAgent({ question: "what is blocking orbit login", mode: "fast", userId: "u1" }, { llm, registry: reg, memory: memStub(), actions: new ActionStore() }));
    const err = events.find((e) => e.type === "source_error");
    expect(err && err.type === "source_error" && err.failure.name).toBe("Slack");
    expect(events.some((e) => e.type === "answer")).toBe(true);
  });

  it("answers 'not found' without an LLM call when there is no evidence", async () => {
    const { llm, calls } = stubLlm("unused");
    const events = await collect(runAgent({ question: "quantum chromodynamics lecture", mode: "fast", userId: "u1" }, { llm, registry: buildRegistry("demo", {}), memory: memStub(), actions: new ActionStore() }));
    const answer = events.find((e) => e.type === "answer");
    expect(answer && answer.type === "answer" && answer.markdown).toMatch(/couldn't find/);
    expect(calls.complete + calls.stream).toBe(0); // only the router may run
  });

  it("stores explicit 'remember' requests as memory", async () => {
    const { llm } = stubLlm(ANSWER, { intent: "research", rewritten: "x", window: null, subQuestions: [{ id: "q1", question: "demo day", sources: ["slack"], query: "demo day" }] });
    const mem = memStub();
    await collect(runAgent({ question: "Remember that Orbit is my top priority. What changed with demo day?", mode: "deep", userId: "u1" }, { llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() }));
    expect(mem.added[0]).toMatch(/Orbit is my top priority/);
  });

  it("lists a memory once when two candidates reinforce the same stored memory", async () => {
    const withMemory = ANSWER.replace(
      /<<<MEMORY>>>\n\[\]/,
      '<<<MEMORY>>>\n[{"content":"Orbit is the top priority","kind":"priority","salience":0.9,"reason":"stated"}]',
    );
    const { llm } = stubLlm(withMemory, { intent: "research", rewritten: "x", window: null, subQuestions: [{ id: "q1", question: "demo day", sources: ["slack"], query: "demo day" }] });
    const mem = memStub(); // returns the same id for every add, like a reinforced memory
    const events = await collect(runAgent({ question: "Remember that Orbit is my top priority. What changed with demo day?", mode: "deep", userId: "u1" }, { llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() }));
    expect(mem.added).toHaveLength(2);
    const written = events.find((e) => e.type === "memory_written");
    expect(written && written.type === "memory_written" && written.items).toHaveLength(1);
  });
});

describe("verification", () => {
  const ev = [
    { id: "e1", source: "slack", title: "Maya", quote: "Demo Day moved to Wed, Nov 12" },
    { id: "e2", source: "github", title: "milestone", quote: "Due Fri, Nov 14 · 11 of 19 issues closed" },
  ];
  it("flags wrong numbers and missing citations", () => {
    const claims = verifyClaims("The milestone has 11 of 19 issues closed [2].\nThe milestone has 15 of 19 issues closed [2].\nDemo Day is on Nov 20.", ev);
    expect(claims.map((c) => c.status)).toEqual(["supported", "partial", "unsupported"]);
  });
  it("splits sections and holds back partial markers while streaming", () => {
    expect(splitSections(ANSWER).actions).toHaveLength(1);
    expect(streamCutoff("hello <<")).toBe(6);
  });
  it("parses common time phrases", () => {
    expect(parseWindow("what changed this week")?.label).toBe("last 7 days");
    expect(parseWindow("upcoming deadlines")?.label).toBe("next 30 days");
    expect(parseWindow("hello")).toBeUndefined();
  });
});

describe("ActionStore", () => {
  it("executes only on explicit approval, exactly once", async () => {
    const reg = buildRegistry("demo", {});
    const store = new ActionStore();
    const p = store.propose("u1", reg, { connector: "gmail", action: "send_email", args: { to: "a@b.c", subject: "s", body: "b" } });
    if (!("id" in p)) throw new Error(p.error);
    expect(p.status).toBe("pending");
    await expect(store.decide("u2", p.id, "approve", reg)).rejects.toThrow(); // other user can't approve
    expect((await store.decide("u1", p.id, "approve", reg)).status).toBe("executed");
    await expect(store.decide("u1", p.id, "approve", reg)).rejects.toThrow(/already/);
  });
  it("rejects proposals with missing required fields", () => {
    const p = store().propose("u1", buildRegistry("demo", {}), { connector: "gmail", action: "send_email", args: { to: "a@b.c" } });
    expect("error" in p && p.error).toMatch(/subject/);
  });
});

function store() {
  return new ActionStore();
}

describe("routing", () => {
  const deps = (llm: LlmRouter) => ({ llm, registry: buildRegistry("demo", {}), memory: memStub(), actions: new ActionStore() });

  it("answers general questions directly, without touching any connector", async () => {
    const { llm, calls } = stubLlm("Paris is the capital of France.", undefined, { route: "general", sources: [], complex: false });
    const events = await collect(runAgent({ question: "What is the capital of France?", mode: "deep", userId: "u1" }, deps(llm)));
    expect(events.filter((e) => e.type === "tool_call")).toHaveLength(0);
    const route = events.find((e) => e.type === "route");
    expect(route && route.type === "route" && route.decision.route).toBe("general");
    expect(events.find((e) => e.type === "answer")).toBeTruthy();
    expect(JSON.stringify(events)).not.toMatch(/couldn't find/);
    expect(calls.route + calls.complete + calls.stream).toBe(2); // router + answer
  });

  it("decides obvious cases by rules, with no model call", async () => {
    const { llm, calls } = stubLlm("Hi! Ask me about your work.");
    const events = await collect(runAgent({ question: "hello", mode: "fast", userId: "u1" }, deps(llm)));
    expect(calls.route).toBe(0);
    expect(events.filter((e) => e.type === "tool_call")).toHaveLength(0);
  });

  it("searches only the sources the question is about", async () => {
    const { llm, calls } = stubLlm("You have an email [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]\n<<<MEMORY>>>\n[]");
    const events = await collect(runAgent({ question: "any new emails in my inbox from Dr. Ruiz?", mode: "fast", userId: "u1" }, deps(llm)));
    expect(calls.route).toBe(0);
    const sources = new Set(events.filter((e) => e.type === "tool_call").map((e) => (e as { source: string }).source));
    expect([...sources]).toEqual(["gmail"]);
  });

  it("classifies with rules", () => {
    const ids = ["gmail", "calendar", "slack", "github", "notion", "drive", "web"];
    expect(routeByRules("thanks!", ids)?.route).toBe("general");
    expect(routeByRules("what meetings do I have tomorrow", ids)).toMatchObject({ route: "personal", sources: ["calendar"] });
    expect(routeByRules("draft an email to my advisor about the report", ids)?.route).toBe("action");
    expect(routeByRules("Email Dr. Ruiz to confirm I'll submit the report on time", ids)?.route).toBe("action");
    expect(routeByRules("Remind the team about the standup", ids)?.route).toBe("action");
    expect(routeByRules("summarize https://example.com/post", ids)?.route).toBe("web");
    expect(routeByRules("explain how transformers work", ids)).toBeNull(); // ambiguous → model decides
  });
});

describe("date verification", () => {
  it("rejects a claim whose date differs from its evidence", () => {
    const ev = [{ id: "e1", source: "gmail", title: "Demo Day: schedule change", quote: "Demo Day has moved to Fri, Nov 13, 2-5pm, Engineering Hall." }];
    const [ok] = verifyClaims("Demo Day has moved to Fri, Nov 13 in Engineering Hall [1].", ev);
    const [bad] = verifyClaims("Demo Day has moved to Sun, Nov 15 in Engineering Hall [1].", ev);
    expect(ok?.status).toBe("supported");
    expect(bad?.status).not.toBe("supported");
  });
});

describe("action requests", () => {
  const deps = (llm: LlmRouter) => ({ llm, registry: buildRegistry("demo", {}), memory: memStub(), actions: new ActionStore() });
  const answerOf = (events: AgentEvent[]) => (events.find((e) => e.type === "answer") as { markdown: string }).markdown;

  it("asks for missing details instead of answering, verifying or proposing", async () => {
    const { llm, calls } = stubLlm("unused", { ask: "What should the event be called, and when?" });
    const events = await collect(runAgent({ question: "create an event in calendar", mode: "deep", userId: "u1" }, deps(llm)));
    expect(answerOf(events)).toBe("What should the event be called, and when?");
    const answer = events.find((e) => e.type === "answer");
    expect(answer && answer.type === "answer" && answer.needsDetails).toBe(true);
    expect(events.some((e) => e.type === "action_proposal")).toBe(false);
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict && verdict.type === "verdict" && verdict.claims).toEqual([]);
    expect(calls.stream).toBe(0); // no research answer was written
    expect(calls.complete).toBe(1); // one drafting call, no planner
  });

  it("asks in plain words when the model drafts without a required detail", async () => {
    const { llm } = stubLlm("unused", { connector: "calendar", action: "create_event", args: { title: "Standup" } });
    const events = await collect(runAgent({ question: "create an event called Standup", mode: "fast", userId: "u1" }, deps(llm)));
    expect(answerOf(events)).toMatch(/what exactly should I do/i);
    expect(events.some((e) => e.type === "action_proposal")).toBe(false);
  });

  it("answers like a question when the message is not an action after all", async () => {
    const reply = "Your newest file is the Q3 report [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]\n<<<MEMORY>>>\n[]";
    const { llm, calls } = stubLlm(reply, { notAction: true });
    const history = [
      { role: "user" as const, content: "create a note" },
      { role: "assistant" as const, content: "What should the note be called?", needsDetails: true },
    ];
    const events = await collect(runAgent({ question: "what changed with demo day?", mode: "fast", userId: "u1", history }, deps(llm)));
    expect(answerOf(events)).toMatch(/newest file/);
    const answer = events.find((e) => e.type === "answer");
    expect(answer && answer.type === "answer" && answer.needsDetails).toBeFalsy();
    expect(calls.stream).toBe(1);
  });

  it("goes straight to the approval card when the details are there, with no claims or sources", async () => {
    const draft = { connector: "calendar", action: "create_event", title: "Standup", args: { title: "Standup", start: "2026-10-30T16:00:00" } };
    const { llm } = stubLlm("unused", draft);
    const events = await collect(runAgent({ question: "create an event called Standup tomorrow at 4pm", mode: "fast", userId: "u1" }, deps(llm)));
    const p = events.find((e) => e.type === "action_proposal");
    expect(p && p.type === "action_proposal" && p.proposal.status).toBe("pending");
    const lastEvidence = events.filter((e) => e.type === "evidence").at(-1);
    expect(lastEvidence && lastEvidence.type === "evidence" && lastEvidence.items).toEqual([]);
  });

  it("routes the reply to a clarifying question back to drafting", async () => {
    const { llm, calls } = stubLlm("unused", { ask: "x" }, { route: "general", sources: [], complex: false });
    const history = [
      { role: "user" as const, content: "create an event in calendar" },
      { role: "assistant" as const, content: "What should it be called, and when?", needsDetails: true },
    ];
    const events = await collect(runAgent({ question: "Standup, tomorrow 4pm", mode: "fast", userId: "u1", history }, deps(llm)));
    const route = events.find((e) => e.type === "route");
    expect(route && route.type === "route" && route.decision).toMatchObject({ route: "action", sources: ["calendar"] });
    expect(calls.route).toBe(0);
  });
});
