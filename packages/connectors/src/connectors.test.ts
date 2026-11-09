import { describe, expect, it } from "vitest";
import { ComposioMcpConnector, ConnectorRegistry, DemoConnector, FirecrawlConnector, TOOLKITS, aliasFor, buildRegistry, extractEvidence } from "./index";
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

  it("drops generic and time words from the Calendar text filter", () => {
    const cal = TOOLKITS.find((t) => t.id === "calendar")!;
    expect(cal.search.toArgs({ query: "meetings" }).q).toBeUndefined();
    expect(cal.search.toArgs({ query: "what's on my calendar today" }).q).toBeUndefined();
    expect(cal.search.toArgs({ query: "upcoming events this week" }).q).toBeUndefined();
    expect(cal.search.toArgs({ query: "standup meetings" }).q).toBe("standup");
  });

  it("searches every calendar, from yesterday to a month ahead when the question names no dates", () => {
    const cal = TOOLKITS.find((t) => t.id === "calendar")!;
    expect(cal.search.slug).toBe("GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS");
    const a = cal.search.toArgs({ query: "meetings" });
    const from = Date.parse(String(a.time_min));
    expect(Math.abs(from - (Date.now() - 86_400_000))).toBeLessThan(60_000);
    expect(Date.parse(String(a.time_max)) - from).toBe(31 * 86_400_000);
    expect(a.single_events).toBe(true);
    // A window from the planner is kept as given.
    expect(cal.search.toArgs({ query: "x", since: "2026-10-01T00:00:00Z", until: "2026-10-08T00:00:00Z" })).toMatchObject({ time_min: "2026-10-01T00:00:00Z", time_max: "2026-10-08T00:00:00Z" });
  });

  it("reads calendar events, not the list of calendars searched", () => {
    const cal = TOOLKITS.find((t) => t.id === "calendar")!;
    const data = {
      calendars_queried: [{ id: "a", summary: "Work" }, { id: "b", summary: "Holidays" }],
      events: [],
      summary_view: [{ calendar: "Work", title: "Design review", start: "2026-11-10T10:00:00+05:30", end: "2026-11-10T11:00:00+05:30", event_id: "e1", display_url: "https://calendar.google.com/x" }],
    };
    const [e, ...rest] = extractEvidence("calendar", cal.search.records!(data, { query: "my meetings" }));
    expect(rest).toHaveLength(0);
    expect(e).toMatchObject({ title: "Design review", url: "https://calendar.google.com/x", ref: "e1" });
    expect(e!.quote).toContain("Work");
    expect(e!.quote).toContain("2026-11-10");
    expect(e!.timestamp).toBe(new Date("2026-11-10T10:00:00+05:30").toISOString());
  });

  it("keeps to your own calendars; holidays and birthdays only when asked for", () => {
    const cal = TOOLKITS.find((t) => t.id === "calendar")!;
    const data = {
      calendars_queried: [
        { id: "me@gmail.com", summary: "me@gmail.com" },
        { id: "abc123@group.calendar.google.com", summary: "Thesis" },
        { id: "en.indian#holiday@group.v.calendar.google.com", summary: "Holidays in India" },
        { id: "addressbook#contacts@group.v.calendar.google.com", summary: "Birthdays" },
      ],
      summary_view: [
        { calendar: "me@gmail.com", title: "Advisor meeting", start: "2026-11-10T10:00:00+05:30", event_id: "a" },
        { calendar: "Thesis", title: "Draft due", start: "2026-11-12", event_id: "b" },
        { calendar: "Holidays in India", title: "Diwali", start: "2026-11-08", event_id: "c" },
        { calendar: "Birthdays", title: "Asha's birthday", start: "2026-11-09", event_id: "d" },
      ],
    };
    const titles = (query: string) => extractEvidence("calendar", cal.search.records!(data, { query }), 10).map((e) => e.title);
    expect(titles("my events this week")).toEqual(["Advisor meeting", "Draft due"]);
    expect(titles("any holidays this month?")).toContain("Diwali");
    expect(titles("whose birthday is coming up")).toContain("Asha's birthday");
  });

  it("lists open Google Tasks with their due dates", () => {
    const tasks = TOOLKITS.find((t) => t.id === "tasks")!;
    expect(tasks).toMatchObject({ toolkit: "googletasks", search: { slug: "GOOGLETASKS_LIST_ALL_TASKS" } });
    expect(tasks.search.toArgs({ query: "my tasks" })).toMatchObject({ showCompleted: false });
    const [t] = extractEvidence("tasks", { tasks: [{ id: "t1", title: "Submit thesis draft", notes: "chapter 2", due: "2026-11-12T00:00:00.000Z", status: "needsAction" }] });
    expect(t).toMatchObject({ title: "Submit thesis draft", quote: "chapter 2", timestamp: "2026-11-12T00:00:00.000Z", ref: "t1" });
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

  it("disconnects only the user's own account", async () => {
    const { conn, calls } = setup();
    await conn.disconnect({ userId: "alice" });
    await conn.disconnect({ userId: "carol" }); // has none: removes nothing, least of all the owner's
    const ops = calls.map((c) => (c.args.toolkits as Record<string, unknown>[] | undefined)?.[0]).filter((t) => t && t.action !== "list");
    expect(ops).toEqual([{ name: "gmail", action: "remove", account_id: "gmail_alice" }]);
  });

  it("connects again after a disconnect, under the same alias, and uses the new account", async () => {
    const gmail = TOOLKITS.find((t) => t.toolkit === "gmail")!;
    const conn = new ComposioMcpConnector(gmail, `ck_test_${Math.random()}`);
    // A stateful Composio: add creates a pending account (same alias may be reused once removed), remove deletes it.
    let live = [{ id: "gmail_carol", alias: "cortex-carol", status: "active" }];
    let n = 0;
    const used: string[] = [];
    (conn as unknown as { session: { call: unknown } }).session.call = async (name: string, args: Record<string, unknown>) => {
      if (name === "COMPOSIO_MULTI_EXECUTE_TOOL") {
        used.push((args.tools as { account: string }[])[0]!.account);
        return { results: [{ response: { successful: true, data: { messages: [] } } }] };
      }
      const t = (args.toolkits as { action: string; alias?: string; account_id?: string }[])[0]!;
      if (t.action === "add") {
        live = [...live, { id: `gmail_new${++n}`, alias: t.alias!, status: "initiated" }];
        return { results: { gmail: { status: "initiated", redirect_url: `https://connect.composio.dev/link/${n}` } } };
      }
      if (t.action === "remove") live = live.filter((a) => a.id !== t.account_id);
      return { results: { gmail: { accounts: live.map((a) => ({ ...a })) } } };
    };
    const carol = { userId: "carol" };
    const signInFinishes = () => (live = live.map((a) => (a.alias === aliasFor("carol") ? { ...a, status: "active" } : a)));

    await conn.search({ query: "x" }, carol);
    await conn.disconnect(carol);
    expect(live).toEqual([]);
    expect((await conn.status(carol)).connected).toBe(false);
    await expect(conn.search({ query: "x" }, carol)).rejects.toThrow(/isn't connected/);

    expect((await conn.connect({ ...carol, callbackUrl: "" })).redirectUrl).toBe("https://connect.composio.dev/link/1");
    expect((await conn.status(carol)).connected).toBe(false); // pending until sign-in finishes
    signInFinishes();
    (conn as unknown as { session: { invalidate(): void } }).session.invalidate(); // the 2 s status cache lapses
    expect((await conn.status(carol)).connected).toBe(true);
    await conn.search({ query: "x" }, carol);
    expect(used).toEqual(["gmail_carol", "gmail_new1"]);
    expect(live.map((a) => a.alias)).toEqual([aliasFor("carol")]);
  });
});

describe("web search fallbacks", () => {
  const ddg = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fjev&amp;rut=x">Jev &#x27;guide&#x27;</a>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">What <b>Jev</b> is.</a>`;
  async function withFetch(fake: (url: string) => Response | Promise<Response>, run: () => Promise<void>) {
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string | URL | Request) => fake(String(u))) as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = real;
    }
  }

  it("searches DuckDuckGo without a key and unwraps its redirect links", async () => {
    await withFetch(() => new Response(ddg), async () => {
      const items = await new FirecrawlConnector().search({ query: "what is jev" }, ctx);
      expect(items).toEqual([{ source: "web", title: "Jev 'guide'", quote: "What Jev is.", url: "https://example.com/jev" }]);
    });
  });

  it("falls back to Wikipedia when DuckDuckGo fails", async () => {
    const wiki = { query: { search: [{ title: "Jev (AI model)", snippet: "Jev is a <span>model</span>" }] } };
    await withFetch((u) => (u.includes("duckduckgo") ? new Response("blocked", { status: 403 }) : Response.json(wiki)), async () => {
      const items = await new FirecrawlConnector().search({ query: "jev" }, ctx);
      expect(items[0]).toMatchObject({ title: "Jev (AI model) - Wikipedia", url: "https://en.wikipedia.org/wiki/Jev_(AI_model)" });
    });
  });

  it("is available in the live workspace without a Firecrawl key, and not in demo", () => {
    expect(buildRegistry("live", {}).get("web")).toBeDefined();
    expect(buildRegistry("demo", {}).get("web")).toBeUndefined();
  });
});

describe("calendar and task actions", () => {
  const action = (source: string, id: string) => TOOLKITS.find((t) => t.id === source)!.actions.find((a) => a.id === id)!;

  it("a date with no time becomes an all-day event", () => {
    const a = action("calendar", "create_event");
    const args = a.toArgs({ title: "Practical exam", start: "2026-11-17" });
    expect(args).toMatchObject({ summary: "Practical exam", start_date: "2026-11-17", end_date: "2026-11-18" });
    expect(args.start_datetime).toBeUndefined();
    expect(a.preview({ title: "Practical exam", start: "2026-11-17" })).toContain("all day");
    expect(a.preview({ title: "Practical exam", start: "2026-11-17" })).not.toContain("12:00");
  });

  it("a timed event keeps the time as said, in the user's time zone, without a Meet link when nobody is invited", () => {
    process.env.CORTEX_TIMEZONE = "Asia/Kolkata";
    const a = action("calendar", "create_event");
    expect(a.toArgs({ title: "Viva", start: "2026-11-17T10:30:00Z", durationMinutes: 90 })).toMatchObject({
      start_datetime: "2026-11-17T10:30:00",
      timezone: "Asia/Kolkata",
      event_duration_hour: 1,
      event_duration_minutes: 30,
      create_meeting_room: false,
    });
    expect(a.toArgs({ title: "Sync", start: "2026-11-17T09:00:00+05:30", attendees: ["a@b.co"] })).toMatchObject({ start_datetime: "2026-11-17T09:00:00", create_meeting_room: true });
    expect(a.preview({ title: "Viva", start: "2026-11-17T10:30:00Z", durationMinutes: 90 })).toContain("10:30");
  });

  it("creates a Google Task in the default list, due on a date", () => {
    const a = action("tasks", "create_task");
    expect(a.toArgs({ title: "Submit lab file", due: "2026-11-18", notes: "Print 2 copies" })).toEqual({
      title: "Submit lab file",
      tasklist_id: "@default",
      due: "2026-11-18T00:00:00.000Z",
      notes: "Print 2 copies",
    });
    expect(a.toArgs({ title: "Call Asha" })).toEqual({ title: "Call Asha", tasklist_id: "@default" });
  });
});
