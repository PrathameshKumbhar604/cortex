import { describe, expect, it } from "vitest";
import { buildRegistry, ConnectorRegistry, DemoConnector, TOOLKITS, type Connector } from "@cortex/connectors";
import type { LlmRouter } from "@cortex/llm";
import type { AgentEvent, ChatTurn, MemoryItem } from "@cortex/shared";
import { ActionStore } from "./actions";
import type { MemoryBackend, MemoryWrite, PastChat } from "./memory";
import { historyBlock } from "./prompts";
import { runAgent } from "./run";
import { cleanTitle } from "./title";
import { mightHoldMemory, remember } from "./remember";
import { carryOver, isFollowUp, routeByRules } from "./route";
import { parseWindow } from "./time";
import { splitSections, streamCutoff, verifyClaims } from "./verify";

function stubLlm(answer: string, plan?: object, route: object = { route: "personal", sources: [], complex: false }) {
  const calls = { complete: 0, stream: 0, route: 0, prompt: "" };
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
    async *stream(o: { messages: { content: string }[] }) {
      calls.stream++;
      calls.prompt = o.messages.map((m) => m.content).join("\n");
      for (const chunk of answer.match(/.{1,7}/gs) ?? []) yield { token: chunk };
      yield { done: { text: answer, provider: "stub", model: "m", cached: false } };
    },
  };
  return { llm: llm as unknown as LlmRouter, calls };
}

function memStub(past: PastChat[] = []): MemoryBackend & { added: string[]; chatSearches: number; recentAsked: boolean } {
  const added: string[] = [];
  const stub = {
    added,
    chatSearches: 0,
    recentAsked: false,
    health: async () => ({ ok: true, backend: "test" }),
    recall: async () => [],
    add: async (m: MemoryWrite) => {
      added.push(m.content);
      return { id: "m1", userId: m.userId, content: m.content, kind: m.kind, source: m.source, reason: m.reason, salience: m.salience, pinned: false, createdAt: "" } as MemoryItem;
    },
    list: async () => [],
    update: async () => {
      throw new Error("n/a");
    },
    remove: async () => {},
    appendThread: async () => {},
    searchChats: async (_u: string, _q: string, _t?: string, recent?: boolean) => {
      stub.chatSearches++;
      stub.recentAsked = !!recent;
      return past;
    },
    deleteThread: async () => {},
  };
  return stub;
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

  it("notes only failures of things the user actually set up", async () => {
    const reg = buildRegistry("demo", {});
    const source = (id: string, extra: object) => ({
      id, name: id, kind: "upload" as const, describes: "", impact: "", actions: [],
      status: async () => ({ id, name: id, kind: "upload" as const, connected: false, available: true, canAct: false, ...extra }),
      search: async () => [],
      execute: async () => ({ ok: false, message: "" }),
    });
    reg.register(source("files", { detail: "Upload a file to make it searchable." }));
    reg.register(source("x", { detail: "its sign-in expired", reconnect: true }));
    const notRunning = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const ask = async (err: Error) => {
      const { llm } = stubLlm("ok");
      const memory = { ...memStub(), recall: async () => { throw err; } };
      const events = await collect(runAgent({ question: "hello there friend", mode: "fast", userId: "u1" }, { llm, registry: reg, memory, actions: new ActionStore() }));
      return events.flatMap((e) => (e.type === "source_error" ? [e.failure.source] : []));
    };
    expect(await ask(notRunning)).toEqual(["x"]); // not "files" (no uploads), not memory (no service here)
    expect(await ask(new Error("memory service 500: boom"))).toEqual(["x", "memory"]);
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
    // The stub answers every JSON call with this object: the plan, and the extracted memory.
    const planAndMemory = {
      intent: "research",
      rewritten: "x",
      window: null,
      subQuestions: [{ id: "q1", question: "demo day", sources: ["slack"], query: "demo day" }],
      memories: [{ content: "Orbit is the top priority", kind: "priority", salience: 0.9, reason: "stated" }],
    };
    const { llm } = stubLlm(ANSWER, planAndMemory);
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
    expect(routeByRules("remember my name is prathamesh", ids)).toMatchObject({ route: "general", sources: [] });
    expect(routeByRules("i like to play badminton on weekends", ids)?.route).toBe("general");
    for (const q of ["what did i ask you?", "what is my name?", "summarise our chat so far", "what was my first question"]) {
      expect(routeByRules(q, ids), q).toMatchObject({ route: "general", sources: [] });
    }
    expect(routeByRules("what did I ask in my email to Rahul?", ids)?.route).not.toBe("general"); // names a source
    expect(routeByRules("I usually skip the Monday standup", ids)?.route).toBe("personal"); // names a source: still searches
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

describe("chat titles", () => {
  it("keeps a short, clean title from whatever the model returns", () => {
    expect(cleanTitle('Title: "Latest PDFs in Drive."\nextra line')).toBe("Latest PDFs in Drive");
    expect(cleanTitle("**Calendar event for tomorrow**")).toBe("Calendar event for tomorrow");
    expect(cleanTitle("one two three four five six seven eight")).toBe("One two three four five six");
    expect(cleanTitle("  \n ")).toBeNull();
    expect(cleanTitle("I’m sorry, but I can’t help with that")).toBeNull(); // a refusal never becomes the title
    expect(cleanTitle("I can't label that")).toBeNull();
  });
});

describe("automatic memory", () => {
  const fakeLlm = (memories: object[]) => {
    const calls = { n: 0 };
    const llm = {
      async json(_o: unknown, validate: (v: unknown) => unknown) {
        calls.n++;
        return { text: "", provider: "stub", model: "m", cached: false, data: validate({ memories }) };
      },
    } as unknown as LlmRouter;
    return { llm, calls };
  };
  const base = { userId: "u1", runId: "r1", related: [] as MemoryItem[], allowLlm: true };

  it("only considers messages that say something about the user", () => {
    for (const m of ["hello budyy", "chal nikal madarchod", "what's due this week?", "fetch me the latest pdf from drive", "get my emails from Rahul"]) {
      expect(mightHoldMemory(m), m).toBe(false);
    }
    for (const m of ["I'm the PM for Orbit and we ship on Friday", "My manager is Priya Shah", "From now on keep answers short", "What's due? I'm on leave next week."]) {
      expect(mightHoldMemory(m), m).toBe(true);
    }
  });

  it("makes no model call for questions and never stores secrets", async () => {
    const { llm, calls } = fakeLlm([{ content: "Gmail password is hunter2", kind: "fact", salience: 0.9, reason: "x" }]);
    const mem = memStub();
    await remember("what is due this week?", { ...base, memory: mem, llm });
    expect(calls.n).toBe(0);
    await remember("My gmail password is hunter2", { ...base, memory: mem, llm });
    expect(calls.n).toBe(0); // the gate already refuses messages with secrets
    expect(mem.added).toEqual([]);
  });

  it("replaces a memory the user contradicted", async () => {
    const old = { id: "old-1", content: "Demo Day is Nov 12", kind: "fact", pinned: false } as MemoryItem;
    const { llm } = fakeLlm([{ content: "Demo Day moved to Nov 14", kind: "fact", salience: 0.8, reason: "date changed", replaces: "old-1" }]);
    const writes: MemoryWrite[] = [];
    const mem = { ...memStub(), add: async (m: MemoryWrite) => (writes.push(m), { ...old, id: "new-1", content: m.content }) };
    const res = await remember("Our Demo Day moved to Nov 14", { ...base, related: [old], memory: mem as unknown as MemoryBackend, llm });
    expect(res.written.map((m) => m.content)).toEqual(["Demo Day moved to Nov 14"]);
    expect(writes[0]?.replaces).toBe("old-1"); // the service swaps them in one step
  });

  it("never replaces a pinned memory", async () => {
    const old = { id: "pin-1", content: "Demo Day is Nov 12", kind: "fact", pinned: true } as MemoryItem;
    const { llm } = fakeLlm([{ content: "Demo Day moved to Nov 14", kind: "fact", salience: 0.8, reason: "x", replaces: "pin-1" }]);
    const writes: MemoryWrite[] = [];
    const mem = { ...memStub(), add: async (m: MemoryWrite) => (writes.push(m), { ...old, id: "new-1", content: m.content }) };
    await remember("Our Demo Day moved to Nov 14", { ...base, related: [old], memory: mem as unknown as MemoryBackend, llm });
    expect(writes[0]?.replaces).toBeUndefined();
  });
});

describe("chat context", () => {
  it("keeps the whole chat within a budget, newest in full", () => {
    const history = Array.from({ length: 24 }, (_, i) =>
      i === 0 ? { role: "user" as const, content: "I'm planning the Orbit launch" } : { role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `turn ${i} ${"x".repeat(900)}` },
    );
    const block = historyBlock(history);
    expect(block).toContain("Orbit launch"); // 12 exchanges back, still there
    expect(block.length).toBeLessThan(9000);
    expect(block).toContain(`turn 23 ${"x".repeat(900)}`); // the newest message is not cut
  });

  it("drops the oldest messages only when the budget runs out", () => {
    const history = Array.from({ length: 200 }, (_, i) => ({ role: "user" as const, content: `m${i} ${"y".repeat(300)}` }));
    const block = historyBlock(history);
    expect(block).toMatch(/^user: m0 y+\n\(\d+ earlier messages not shown\)/); // the opening message is kept
    expect(block).toContain("m199");
  });
});

describe("other chats (opt-in)", () => {
  const past: PastChat[] = [{ threadId: "t-old", question: "what's the Orbit beta channel?", answer: "It's #orbit-beta on Slack.", createdAt: "2026-10-20T10:00:00Z" }];
  const answer = "The beta channel is #orbit-beta [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]";

  it("never reads other chats when the user has not opted in", async () => {
    for (const route of ["general", "personal"]) {
      const mem = memStub(past);
      const { llm } = stubLlm(answer, undefined, { route, sources: [], complex: false });
      await collect(runAgent({ question: "which channel is the orbit beta in", mode: "fast", userId: "u1" }, { llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() }));
      expect(mem.chatSearches).toBe(0);
    }
  });

  it("uses a related past chat as citable evidence when opted in", async () => {
    const mem = memStub(past);
    const { llm } = stubLlm(answer);
    const events = await collect(
      runAgent({ question: "which channel is the orbit beta in", mode: "fast", userId: "u1", threadId: "t-now", useOtherChats: true }, { llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() }),
    );
    expect(mem.chatSearches).toBe(1);
    const ev = events.find((e) => e.type === "evidence");
    const chat = ev?.type === "evidence" ? ev.items.find((e) => e.source === "chat") : undefined;
    expect(chat?.title).toBe("Your chat on Oct 20, 2026");
  });
});

describe("knowing when other chats matter", () => {
  const past: PastChat[] = [{ threadId: "t-old", question: "plan a trip to Goa", answer: "Here is a 3-day plan.", createdAt: "2026-10-27T10:00:00Z" }];
  const run = (question: string, mem: ReturnType<typeof memStub>, useOtherChats: boolean) => {
    const { llm, calls } = stubLlm("ok");
    return collect(runAgent({ question, mode: "fast", userId: "u1", useOtherChats }, { llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() })).then((events) => ({ events, calls }));
  };

  it("answers 'what were my previous chats about?' from the latest chats, without searching apps", async () => {
    const mem = memStub(past);
    const { events, calls } = await run("what are previous chats about?", mem, true);
    expect(mem.recentAsked).toBe(true);
    expect(events.filter((e) => e.type === "tool_call")).toHaveLength(0);
    expect(calls.prompt).toContain("plan a trip to Goa");
  });

  it("checks other chats on every question once opted in, asking for the latest ones only when no topic is named", async () => {
    const mem = memStub([]);
    const { events } = await run("what is the capital of France?", mem, true);
    expect(mem.chatSearches).toBe(1);
    expect(mem.recentAsked).toBe(false);
    const recall = events.find((e) => e.type === "step" && e.step === "recall" && e.status === "done");
    expect(recall && recall.type === "step" && recall.detail).toMatch(/no related chats/);
  });

  it("says how to turn it on when asked about other chats while it is off", async () => {
    const mem = memStub(past);
    const { calls } = await run("what did we discuss last time?", mem, false);
    expect(mem.chatSearches).toBe(0);
    expect(calls.prompt).toContain("Use my other chats");
  });

  it("a failing chat search does not take memory down with it", async () => {
    const mem = { ...memStub(), searchChats: async () => { throw new Error("404"); } };
    const { events } = await run("hello there friend", mem as ReturnType<typeof memStub>, true);
    expect(events.some((e) => e.type === "source_error")).toBe(false);
  });
});

describe("attached files", () => {
  it("always uses the attached passages, searches only files, and cites them first", async () => {
    const { llm } = stubLlm("The demo is in Room 204 [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]", undefined, { route: "general", sources: [], complex: false });
    const attachments = [{ source: "files", title: "orbit-plan.pdf", quote: "The beta demo happens in Room 204.", ref: "f1" }];
    const events = await collect(
      runAgent({ question: "which room?", mode: "fast", userId: "u1", attachments }, { llm, registry: buildRegistry("demo", {}), memory: memStub(), actions: new ActionStore() }),
    );
    const route = events.find((e) => e.type === "route");
    expect(route?.type === "route" && route.decision).toMatchObject({ route: "personal", sources: ["files"] });
    expect(events.filter((e) => e.type === "tool_call").every((e) => e.type === "tool_call" && e.source === "files")).toBe(true);
    const ev = events.find((e) => e.type === "evidence");
    expect(ev?.type === "evidence" && ev.items[0]).toMatchObject({ id: "e1", title: "orbit-plan.pdf" });
  });
});

describe("text given in the message", () => {
  const VOICE =
    "Turn this voice note into clean notes: a short summary, key points, and action items. Hello, what's up? The words are... not appearing yet and it does take a bit delay. So how can I fix them?";
  const MIC = `Turn this voice note transcript into clean notes (a short summary, key points, and action items), using only the transcript below:\n\nHello, what's up? The words are not appearing yet and it does take a bit of delay. So how can I fix them?`;

  it("routes transform requests to a direct answer, but not ones that name a source", () => {
    const ids = ["gmail", "files", "web"];
    for (const q of [VOICE, MIC, "Fix the grammar in this paragraph:\nme and him goes to the store yesterday and buyed three apple for the trip", "Translate the following into French: I will send the report to my advisor by Friday evening."]) {
      expect(routeByRules(q, ids), q).toMatchObject({ route: "general", sources: [] });
    }
    expect(routeByRules("Summarise my emails from Priya: anything about the launch date", ids)?.route).not.toBe("general");
    expect(routeByRules("Summarise this: my emails about the budget review", ids)?.route).not.toBe("general");
    expect(routeByRules("Summarise the Q3 report", ids)?.route ?? "model").not.toBe("general"); // no text given
  });

  it("answers the voice note without searching or 'not in your sources'", async () => {
    const searched: string[] = [];
    const reg = new ConnectorRegistry();
    reg.register(unrelatedFile((q) => searched.push(q)));
    const { llm, calls } = stubLlm("**Summary**: the dictation shows words late.");
    const events = await collect(runAgent({ question: VOICE, mode: "fast", userId: "u1" }, { llm, registry: reg, memory: memStub(), actions: new ActionStore() }));
    expect(searched).toEqual([]);
    expect(calls.route).toBe(0);
    expect(events.some((e) => e.type === "tool_call" || e.type === "evidence")).toBe(false);
    const verdict = events.find((e) => e.type === "verdict");
    expect(verdict).toBeUndefined(); // no "Not in your sources", nothing verified against unrelated evidence
    expect(calls.prompt).toContain("not appearing yet");
  });
});

/** An uploaded invoice the old search returned for any query sharing a filler word with it. */
function unrelatedFile(onSearch: (q: string) => void = () => {}): Connector {
  return {
    id: "files",
    name: "Your files",
    kind: "upload",
    describes: "uploads",
    impact: "",
    actions: [],
    status: async () => ({ id: "files", name: "Your files", kind: "upload", connected: true, available: true, canAct: false }),
    search: async (input) => {
      onSearch(input.query);
      return [{ source: "files", title: "Wakefit_evidence.pdf", quote: "Tax invoice. Ergonomic chair, qty 1, Rs 8,999. Note: goods once sold are not taken back.", ref: "f9" }];
    },
    execute: async () => ({ ok: false, message: "" }),
  };
}

describe("relevance floor", () => {
  const OK = "Push notifications are blocked on credentials [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]";
  it("never cites an unrelated uploaded file, but keeps the app evidence", async () => {
    const reg = buildRegistry("demo", {});
    reg.register(unrelatedFile());
    const { llm } = stubLlm(OK);
    const events = await collect(runAgent({ question: "What is blocking push notifications?", mode: "fast", userId: "u1" }, { llm, registry: reg, memory: memStub(), actions: new ActionStore() }));
    const ev = events.find((e) => e.type === "evidence");
    const items = ev?.type === "evidence" ? ev.items : [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((e) => e.source === "files")).toBe(false);
  });

  it("keeps an uploaded file that matches the question", async () => {
    const reg = new ConnectorRegistry();
    reg.register(unrelatedFile());
    const { llm } = stubLlm("The chair cost Rs 8,999 [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]");
    const events = await collect(runAgent({ question: "How much did my Wakefit chair cost?", mode: "fast", userId: "u1" }, { llm, registry: reg, memory: memStub(), actions: new ActionStore() }));
    const ev = events.find((e) => e.type === "evidence");
    expect(ev?.type === "evidence" && ev.items.map((e) => e.title)).toEqual(["Wakefit_evidence.pdf"]);
  });

  it("says nothing was found instead of answering from an unrelated file", async () => {
    const reg = new ConnectorRegistry();
    reg.register(unrelatedFile());
    const { llm, calls } = stubLlm(OK);
    const events = await collect(runAgent({ question: "What did my advisor say about the thesis outline?", mode: "fast", userId: "u1" }, { llm, registry: reg, memory: memStub(), actions: new ActionStore() }));
    const ev = events.find((e) => e.type === "evidence");
    expect(ev?.type === "evidence" && ev.items).toEqual([]);
    expect(calls.stream).toBe(0);
  });
});

describe("regenerate", () => {
  it("does not store or remember the same question twice", async () => {
    const mem = memStub();
    let stored = 0;
    mem.appendThread = async () => { stored++; };
    const ask = (regenerate: boolean) =>
      collect(runAgent({ question: "remember that I prefer short answers", mode: "fast", userId: "u1", regenerate }, { llm: stubLlm("Noted.").llm, registry: buildRegistry("demo", {}), memory: mem, actions: new ActionStore() }));
    await ask(false);
    const [first, added] = [stored, mem.added.length];
    expect(first).toBe(1);
    await ask(true);
    expect(stored).toBe(first);
    expect(mem.added.length).toBe(added);
  });
});

describe("follow-ups", () => {
  const jev: ChatTurn[] = [
    { role: "user", content: "what is jev?" },
    { role: "assistant", content: "I'm not sure what \"jev\" refers to. Could you give me more context?" },
  ];
  const webSearches: string[] = [];
  const registry = () => {
    const reg = buildRegistry("demo", {});
    reg.register({
      id: "web", name: "Web", kind: "web", describes: "the public internet", impact: "", actions: [],
      status: async () => ({ id: "web", name: "Web", kind: "web", connected: true, available: true, canAct: false }),
      search: async (i: { query: string }) => {
        webSearches.push(i.query);
        return [{ source: "web", title: "JEV", quote: "JEV is short for Japanese encephalitis virus.", url: "https://example.org/jev", timestamp: "2026-10-01" }];
      },
      execute: async () => ({ ok: false, message: "" }),
    } as unknown as Connector);
    return reg;
  };
  const run = (question: string, llm: LlmRouter, history = jev, mode: "fast" | "deep" = "deep") =>
    collect(runAgent({ question, mode, userId: "u1", history }, { llm, registry: registry(), memory: memStub(), actions: new ActionStore() }));
  const routeOf = (events: AgentEvent[]) => events.find((e) => e.type === "route") as Extract<AgentEvent, { type: "route" }>;
  const queries = (events: AgentEvent[]) => events.flatMap((e) => (e.type === "tool_call" ? [`${e.source}:${e.query}`] : []));

  it("spots messages that only make sense with the chat before them", () => {
    for (const q of ["search on web", "more", "what about last week", "and in slack?", "explain that", "check my gmail", "who sent it?"]) {
      expect(isFollowUp(q, jev), q).toBe(true);
    }
    for (const q of ["what's on my calendar today", "explain how transformers work", "what did my advisor say about the thesis deadline?"]) {
      expect(isFollowUp(q, jev), q).toBe(false);
    }
    expect(isFollowUp("search on web", [])).toBe(false); // nothing to follow up on
  });

  it("carries the earlier question over when the new message has no topic of its own", () => {
    expect(carryOver("search on web", jev)).toBe("what is jev");
    expect(carryOver("and in slack?", jev)).toBe("what is jev");
    expect(carryOver("what about last week", jev)).toBe("what is jev last week");
    // a chain of follow-ups still goes back to the last message with a topic
    expect(carryOver("more", [...jev, { role: "user", content: "search on web" }, { role: "assistant", content: "JEV is a virus." }])).toBe("what is jev");
    expect(carryOver("what's on my calendar today", jev)).toBe("what's on my calendar today");
  });

  it("'search on web' after 'what is jev?' searches the web for jev, with no extra model call", async () => {
    webSearches.length = 0;
    const { llm, calls } = stubLlm("JEV is Japanese encephalitis virus [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]");
    const events = await run("search on web", llm);
    expect(routeOf(events).decision).toMatchObject({ route: "web", sources: ["web"], question: "what is jev" });
    expect(queries(events)).toEqual(["web:jev"]);
    expect(webSearches).toEqual(["jev"]);
    expect(calls.route).toBe(0); // rules + carry-over: the planner is skipped for a plain web lookup too
    expect(calls.prompt).toContain("search on web"); // the answer still sees what the user typed…
    expect(calls.prompt).toContain("what is jev"); // …and what it means
    expect(JSON.stringify(events)).not.toMatch(/Not in your sources|couldn't find/);
  });

  it("lets the router model rewrite a follow-up in the same call that routes it", async () => {
    const { llm, calls } = stubLlm("ok [1]", undefined, { standalone: "what does JEV stand for", route: "web", sources: ["web"], complex: false });
    const events = await run("what does it stand for?", llm, jev, "fast");
    expect(routeOf(events).decision).toMatchObject({ route: "web", question: "what does JEV stand for" });
    expect(queries(events)).toEqual(["web:jev stand"]);
    expect(calls.route).toBe(1);
    expect(calls.route + calls.complete + calls.stream).toBeLessThanOrEqual(3); // Fast budget, router included
  });

  it("falls back to carrying keywords over when the router model fails", async () => {
    const { llm } = stubLlm("ok [1]");
    const broken = { ...llm, json: async () => { throw new Error("rate limited"); }, stream: llm.stream.bind(llm) } as unknown as LlmRouter;
    const events = await run("what does it stand for?", broken, jev, "fast");
    expect(routeOf(events).decision.question).toBe("what is jev what does stand for");
    expect(queries(events).every((q) => q.includes("jev"))).toBe(true);
  });

  it("keeps the source the message names: 'and in slack?' searches slack for the earlier topic", async () => {
    const { llm, calls } = stubLlm("unused");
    const events = await run("and in slack?", llm, [{ role: "user", content: "what's the latest on the orbit login bug?" }, { role: "assistant", content: "Issue #42 is open [1]." }], "fast");
    expect(routeOf(events).decision).toMatchObject({ route: "personal", sources: ["slack"] });
    expect(queries(events)).toEqual(["slack:latest orbit login bug"]);
    expect(calls.route).toBe(0);
  });

  it("looks on the web instead of a dead end when the user's apps have nothing", async () => {
    webSearches.length = 0;
    const { llm } = stubLlm("JEV is a virus [1].\n<<<CONFLICTS>>>\nnone\n<<<MISSING>>>\nnone\n<<<ACTIONS>>>\n[]", undefined, { route: "personal", sources: [], complex: false });
    const events = await run("what is jev?", llm, [], "fast");
    expect(queries(events).at(-1)).toBe("web:jev");
    expect(events.find((e) => e.type === "evidence" && e.items.length)).toBeTruthy();
    expect(JSON.stringify(events)).not.toMatch(/couldn't find/);
  });
});
