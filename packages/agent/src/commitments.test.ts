import { describe, expect, it } from "vitest";
import { buildRegistry } from "@cortex/connectors";
import type { LlmRouter } from "@cortex/llm";
import type { Evidence } from "@cortex/shared";
import { judge, promiseHints, runRadar, type RawCommitment } from "./commitments";
import type { AgentDeps } from "./run";

const ev = (n: number, source = "slack"): Evidence => ({ id: `e${n}`, source, title: `item ${n}`, quote: `quote ${n}` });
const EV = [ev(1), ev(2, "github"), ev(3, "gmail")];
const raw = (o: Partial<RawCommitment>): RawCommitment => ({ owner: "You", to: null, what: "Review PR #57", due: null, status: "open", reason: "r", promise: [1], proof: [], ...o });

describe("judge", () => {
  it("drops commitments with no quoted promise", () => {
    expect(judge([raw({ promise: [] }), raw({ promise: [9] })], EV, "2026-10-31")).toEqual([]);
  });

  it("downgrades kept without separate proof to open", () => {
    const [a] = judge([raw({ status: "kept", proof: [1] })], EV, "2026-10-31");
    expect(a!.status).toBe("open");
    expect(a!.proof).toEqual([]);
  });

  it("keeps kept with proof from another item", () => {
    const [a] = judge([raw({ status: "kept", proof: [2] })], EV, "2026-10-31");
    expect(a!.status).toBe("kept");
    expect(a!.proof[0]!.source).toBe("github");
  });

  it("marks a passed due date overdue and refuses overdue before the date", () => {
    expect(judge([raw({ due: "2026-10-25" })], EV, "2026-10-31")[0]!.status).toBe("overdue");
    expect(judge([raw({ status: "broken", due: "2026-11-05" })], EV, "2026-10-31")[0]!.status).toBe("at_risk");
    expect(judge([raw({ status: "kept", proof: [2], due: "2026-10-01" })], EV, "2026-10-31")[0]!.status).toBe("kept");
  });

  it("strips evidence numbers from the reason", () => {
    expect(judge([raw({ reason: "GitHub still shows it waiting (items 20, 18)." })], EV, "2026-10-31")[0]!.reason).toBe("GitHub still shows it waiting.");
  });

  it("dedupes, flags the user's own, and sorts worst first", () => {
    const out = judge(
      [raw({ what: "Fix login", owner: "Maya", status: "kept", proof: [2] }), raw({ due: "2026-10-01" }), raw({ what: "review pr 57!" }), raw({ what: "Send report", status: "at_risk", promise: [3] })],
      EV,
      "2026-10-31",
    );
    expect(out.map((c) => c.status)).toEqual(["overdue", "at_risk", "kept"]);
    expect(out.map((c) => c.mine)).toEqual([true, true, false]);
  });
});

describe("promiseHints", () => {
  it("flags promise and request wording only", () => {
    const q = (quote: string) => ({ ...ev(0), quote });
    expect(promiseHints([q("On it: I'll review PR #57 tomorrow"), q("Login loop still reproduces"), q("Please complete the assessment by Nov 4"), q("Thanks, merged")])).toEqual([1, 3]);
  });
});

describe("runRadar", () => {
  it("cites sample-workspace evidence by number and grounds the result", async () => {
    let prompt = "";
    const llm = {
      async json(o: { messages: { content: string }[] }, validate: (v: unknown) => unknown) {
        prompt = o.messages[1]!.content;
        const lines = prompt.split("\n");
        const promise = lines.findIndex((l) => l.includes("I'll review Jordan's push")) + 1;
        const proof = lines.findIndex((l) => l.includes("PR #57")  && l.includes("waiting for review")) + 1;
        const data = { commitments: [{ owner: "You", to: "Jordan", what: "Review PR #57", due: "2000-01-01", status: "open", reason: "Still waiting.", promise: [promise], proof: [proof] }] };
        return { text: "", provider: "stub", model: "m", cached: false, data: validate(data) };
      },
    } as unknown as LlmRouter;
    const deps = { llm, registry: buildRegistry("demo") } as unknown as AgentDeps;
    const r = await runRadar(deps, "u1");
    expect(r.commitments).toHaveLength(1);
    const [c] = r.commitments;
    expect(c!.status).toBe("overdue");
    expect(c!.promise[0]!.source).toBe("slack");
    expect(c!.proof[0]!.source).toBe("github");
  });
});
