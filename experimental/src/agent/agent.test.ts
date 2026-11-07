import type { AgentEvent } from "@cortex/shared";
import { createAgent } from "./agent";
import { newTurn, reduce } from "./reduce";

type Stream = (path: string, body: unknown, onEvent: (e: unknown) => void, signal: AbortSignal) => Promise<void>;

function fakeStream(script: (emit: (e: AgentEvent) => void, signal: AbortSignal) => Promise<void>): { stream: Stream; bodies: unknown[] } {
  const bodies: unknown[] = [];
  return { bodies, stream: async (_p, body, onEvent, signal) => (bodies.push(body), script((e) => onEvent(e), signal)) };
}

describe("reduce", () => {
  it("builds answer from tokens then answer event", () => {
    let t = newTurn("q", "fast");
    t = reduce(t, { type: "token", text: "Hel" } as AgentEvent);
    t = reduce(t, { type: "token", text: "lo" } as AgentEvent);
    expect(t.answer).toBe("Hello");
    t = reduce(t, { type: "answer", markdown: "Hello world" } as AgentEvent);
    expect(t.answer).toBe("Hello world");
  });

  it("verdict sets claims, followups, groundedness", () => {
    const t = reduce(newTurn("q", "deep"), { type: "verdict", claims: [{ text: "a", evidenceIds: ["e1"], status: "supported" }], groundedness: 1, conflicts: [], missing: [], followups: ["next?"] } as AgentEvent);
    expect(t.claims).toHaveLength(1);
    expect(t.followups).toEqual(["next?"]);
    expect(t.groundedness).toBe(1);
  });
});

describe("createAgent", () => {
  it("streams a turn to done and sends the web's request body", async () => {
    const { stream, bodies } = fakeStream(async (emit) => {
      emit({ type: "run", runId: "r", mode: "fast", threadId: "srv1" } as AgentEvent);
      emit({ type: "token", text: "Hi" } as AgentEvent);
      emit({ type: "done" } as AgentEvent);
    });
    const a = createAgent({ stream, useOtherChats: () => true });
    await a.ask("hello", { mode: "fast" });
    expect(a.get().turns[0]).toMatchObject({ question: "hello", answer: "Hi", done: true });
    expect(a.get().serverThreadId).toBe("srv1");
    expect(bodies[0]).toMatchObject({ question: "hello", mode: "fast", history: [], useOtherChats: true, attachments: [], regenerate: false });
    await a.ask("again", { mode: "deep" });
    expect(bodies[1]).toMatchObject({ threadId: "srv1", history: [{ role: "user", content: "hello" }, { role: "assistant", content: "Hi" }] });
  });

  it("keeps partial answer on stream error", async () => {
    const { stream } = fakeStream(async (emit) => {
      emit({ type: "token", text: "Part" } as AgentEvent);
      throw new Error("The connection to Cortex dropped while answering.");
    });
    const a = createAgent({ stream, useOtherChats: () => false });
    await a.ask("q", { mode: "fast" });
    const t = a.get().turns[0];
    expect(t.answer).toBe("Part");
    expect(t.error).toContain("dropped");
    expect(t.done).toBe(true);
    expect(a.get().busy).toBe(false);
  });

  it("stop aborts and marks the turn done without an error", async () => {
    const { stream } = fakeStream(
      (emit, signal) =>
        new Promise((_, reject) => {
          emit({ type: "token", text: "x" } as AgentEvent);
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const a = createAgent({ stream, useOtherChats: () => false });
    const p = a.ask("q", { mode: "fast" });
    a.stop();
    await p;
    expect(a.get().turns[0]).toMatchObject({ done: true, error: undefined, answer: "x" });
  });

  it("regenerate adds a version and sends regenerate:true", async () => {
    let n = 0;
    const { stream, bodies } = fakeStream(async (emit) => {
      emit({ type: "token", text: `A${++n}` } as AgentEvent);
      emit({ type: "done" } as AgentEvent);
    });
    const a = createAgent({ stream, useOtherChats: () => false });
    await a.ask("q", { mode: "fast" });
    await a.regenerate(a.get().turns[0].id);
    const t = a.get().turns[0];
    expect(t.answer).toBe("A2");
    expect(t.versions).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ regenerate: true, history: [] });
    a.selectVersion(t.id, 0);
    expect(a.get().turns[0].answer).toBe("A1");
  });

  it("ignores a second ask while one is running", async () => {
    let release!: () => void;
    const { stream, bodies } = fakeStream(() => new Promise<void>((r) => (release = r)));
    const a = createAgent({ stream, useOtherChats: () => false });
    const p = a.ask("one", { mode: "fast" });
    await a.ask("two", { mode: "fast" });
    release();
    await p;
    expect(bodies).toHaveLength(1);
    expect(a.get().turns).toHaveLength(1);
  });
});
