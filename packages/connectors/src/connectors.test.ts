import { describe, expect, it } from "vitest";
import { ComposioMcpConnector, ConnectorRegistry, DemoConnector, TOOLKITS, aliasFor, buildRegistry, extractEvidence } from "./index";
import type { Connector } from "./types";
import { driveQuery, gmailBody, gmailQuery } from "./composio/toolkits";
import { htmlToText, rankByQuery } from "./extract";

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

describe("large mailbox retrieval", () => {
  it("keeps one item per email thread", () => {
    const data = {
      messages: [
        { messageId: "m2", threadId: "t1", subject: "Re: Demo", messageText: "latest reply" },
        { messageId: "m1", threadId: "t1", subject: "Demo", messageText: "first mail" },
        { messageId: "m3", threadId: "t2", subject: "Other", messageText: "x" },
      ],
    };
    const items = extractEvidence("gmail", data);
    expect(items.map((e) => e.ref)).toEqual(["m2", "m3"]);
  });

  it("pushes filters to Gmail: operators kept, generic words dropped, keywords ORed, 30-day default", () => {
    const q = gmailQuery({ query: "emails from:alice@x.com demo budget" });
    expect(q).toMatch(/^from:alice@x\.com \{demo budget\} after:\d{4}\/\d{2}\/\d{2} -category:promotions/);
    expect(q).not.toMatch(/emails/);
    expect(gmailQuery({ query: "inbox", since: "2026-10-01T00:00:00Z", until: "2026-10-08T00:00:00Z" })).toBe(
      "after:2026/10/01 before:2026/10/08 -category:promotions -category:social -in:spam -in:trash",
    );
  });

  it("pushes filters to Drive, Slack and GitHub", () => {
    const window = { since: "2026-10-01T00:00:00Z", until: "2026-10-08T00:00:00Z" };
    expect(driveQuery({ query: "budget docs o'brien", ...window })).toBe(
      "(fullText contains 'budget' or fullText contains 'obrien') and modifiedTime > '2026-10-01T00:00:00Z' and modifiedTime < '2026-10-08T00:00:00Z' and trashed = false",
    );
    expect(driveQuery({ query: "" })).toBe("trashed = false");
    expect(driveQuery({ query: "fetch me the latest pdf from drive" })).toBe("(mimeType = 'application/pdf') and trashed = false");
    const args = (id: string, query: string) => TOOLKITS.find((t) => t.id === id)!.search.toArgs({ query, ...window, limit: 50 });
    expect(args("slack", "slack messages about launch in:#dev")).toMatchObject({ query: "launch in:#dev after:2026-10-01 before:2026-10-08", count: 10 });
    expect(args("github", "open pull requests login")).toMatchObject({ q: "open login involves:@me updated:>=2026-10-01 updated:<=2026-10-08", per_page: 10 });
  });

  it("drops generic words from the Calendar text filter", () => {
    const cal = TOOLKITS.find((t) => t.id === "calendar")!;
    expect(cal.search.toArgs({ query: "meetings" }).query).toBeUndefined();
    expect(cal.search.toArgs({ query: "standup meetings" }).query).toBe("standup");
  });

  it("decodes the text part of a multipart Gmail message, falling back to HTML", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    const multipart = { payload: { mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
      { mimeType: "text/plain", body: { data: b64("plain body ünï") } },
    ] } };
    expect(gmailBody(multipart)).toBe("plain body ünï");
    expect(gmailBody({ payload: { mimeType: "text/html", body: { data: b64("<style>x{}</style><p>Hi&nbsp;there</p>") } } }).trim()).toBe("Hi there");
    expect(gmailBody({})).toBe("");
  });

  it("strips HTML documents down to readable text", () => {
    expect(htmlToText("plain < text")).toBe("plain < text");
    expect(htmlToText('<!DOCTYPE html><head><title>t</title></head><b>A &amp; B</b>').replace(/\s+/g, " ").trim()).toBe("A & B");
  });

  it("ranks hits by query words, newest first on ties", () => {
    const items = [
      { title: "old match", quote: "budget", timestamp: "2026-01-01" },
      { title: "unrelated", quote: "", timestamp: "2026-02-01" },
      { title: "new match", quote: "budget", timestamp: "2026-03-01" },
    ];
    expect(rankByQuery(items, "budget review").map((e) => e.title)).toEqual(["new match", "old match", "unrelated"]);
  });
});

describe("Composio Connect (ck_) keeps each user's connections apart", () => {
  const accounts = [
    { id: "gmail_owner", status: "active" }, // the key owner's, connected in Composio itself (no alias)
    { id: "gmail_alice", alias: "cortex-alice", status: "active" },
    { id: "gmail_bob_old", alias: "cortex-bob", status: "expired" },
  ];
  function setup() {
    const gmail = TOOLKITS.find((t) => t.toolkit === "gmail")!;
    const conn = new ComposioMcpConnector(gmail, `ck_test_${Math.random()}`);
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    (conn as unknown as { session: { call: unknown } }).session.call = async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "COMPOSIO_MULTI_EXECUTE_TOOL") return { results: [{ response: { successful: true, data: { messages: [] } } }] };
      const t = (args.toolkits as { action: string }[])[0]!;
      if (t.action === "add") return { results: { gmail: { status: "initiated", redirect_url: "Link: https://connect.composio.dev/link/x" } } };
      return { results: { gmail: { accounts } } };
    };
    return { conn, calls };
  }

  it("shows each user only their own account", async () => {
    const { conn } = setup();
    expect((await conn.status({ userId: "alice" })).connected).toBe(true);
    expect((await conn.status({ userId: "bob" })).connected).toBe(false);
    expect((await conn.status({ userId: "bob" })).detail).toMatch(/expired/);
    expect((await conn.status({ userId: "carol" })).connected).toBe(false); // never the owner's untagged account
  });

  it("pins every call to the user's own account and refuses users without one", async () => {
    const { conn, calls } = setup();
    await conn.search({ query: "x" }, { userId: "alice" });
    const exec = calls.filter((c) => c.name === "COMPOSIO_MULTI_EXECUTE_TOOL");
    expect(exec).toHaveLength(1);
    expect((exec[0]!.args.tools as { account: string }[])[0]!.account).toBe("gmail_alice");
    await expect(conn.search({ query: "x" }, { userId: "carol" })).rejects.toThrow(/isn't connected/);
    await expect(conn.execute("send_email", { to: "a@b.c", subject: "s", body: "b" }, { userId: "bob" })).rejects.toThrow(/isn't connected/);
    expect(calls.filter((c) => c.name === "COMPOSIO_MULTI_EXECUTE_TOOL")).toHaveLength(1);
  });

  it("connects with the user's alias, replacing only their own earlier account", async () => {
    const { conn, calls } = setup();
    const { redirectUrl } = await conn.connect({ userId: "bob", callbackUrl: "" });
    expect(redirectUrl).toBe("https://connect.composio.dev/link/x");
    const ops = calls.map((c) => (c.args.toolkits as Record<string, unknown>[] | undefined)?.[0]).filter((t) => t && t.action !== "list");
    expect(ops).toEqual([
      { name: "gmail", action: "remove", account_id: "gmail_bob_old" },
      { name: "gmail", action: "add", alias: aliasFor("bob") },
    ]);
  });
});
