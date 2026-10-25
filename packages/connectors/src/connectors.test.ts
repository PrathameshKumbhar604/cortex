import { describe, expect, it } from "vitest";
import { ConnectorRegistry, DemoConnector, TOOLKITS, buildRegistry, extractEvidence } from "./index";
import type { Connector } from "./types";

const ctx = { userId: "u1" };

describe("demo workspace", () => {
  it("contains the demo-day conflict across sources", async () => {
    const reg = buildRegistry("demo", {});
    const slack = await reg.safeSearch("slack", { query: "demo day moved" }, ctx);
    const github = await reg.safeSearch("github", { query: "milestone demo day" }, ctx);
    expect(slack.ok && slack.items[0]?.quote).toMatch(/Demo Day moved/);
    expect(github.ok && github.items.some((i) => /milestone/i.test(i.title))).toBe(true);
  });

  it("falls back to recent items for broad time-window questions", async () => {
    const reg = buildRegistry("demo", {});
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const r = await reg.safeSearch("slack", { query: "", since }, ctx);
    expect(r.ok && r.items.length).toBeGreaterThan(0);
  });

  it("records demo actions without leaving the sandbox", async () => {
    const gmail = new DemoConnector(TOOLKITS.find((t) => t.id === "gmail")!);
    const res = await gmail.execute("send_email", { to: "a@b.c", subject: "s", body: "b" }, ctx);
    expect(res.message).toMatch(/sample workspace/);
  });
});

describe("registry error handling", () => {
  const broken = (behaviour: () => Promise<never>): Connector => ({
    id: "slack",
    name: "Slack",
    kind: "mcp",
    describes: "",
    impact: "Blockers discussed in chat may be missing.",
    actions: [],
    status: async () => ({ id: "slack", name: "Slack", kind: "mcp", connected: true, available: true, canAct: false }),
    search: behaviour,
    execute: behaviour,
  });

  it("reports which source failed, why, and why it matters, after one retry", async () => {
    let calls = 0;
    const reg = new ConnectorRegistry().register(
      broken(async () => {
        calls++;
        throw new Error("fetch failed");
      }),
    );
    const r = await reg.safeSearch("slack", { query: "x" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.name).toBe("Slack");
      expect(r.failure.reason).toMatch(/could not be reached/);
      expect(r.failure.impact).toMatch(/Blockers/);
    }
    expect(calls).toBe(2);
  });
});

describe("evidence extraction", () => {
  it("handles nested tool output shapes", () => {
    const data = {
      data: {
        messages: [
          { subject: "Hello", messageText: "Body text", messageTimestamp: "2026-10-20T10:00:00Z", sender: "a@b.c" },
        ],
      },
    };
    const [e] = extractEvidence("gmail", data);
    expect(e).toMatchObject({ title: "Hello", quote: "Body text", author: "a@b.c" });
    expect(e?.timestamp).toBe("2026-10-20T10:00:00.000Z");
  });
});
