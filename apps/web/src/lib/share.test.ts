import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Evidence } from "@cortex/shared";
import { shareStore, snapshot, toMarkdown } from "./share";

const ev = (i: number, extra: Partial<Evidence> = {}): Evidence => ({
  id: `e${i}`,
  source: "gmail",
  title: `Mail ${i}`,
  quote: `snippet ${i}`,
  url: `https://mail.google.com/mail/u/0/#inbox/secret${i}`,
  author: "Boss <boss@corp.com>",
  ref: `msg-${i}`,
  timestamp: "2026-10-01T09:00:00Z",
  ...extra,
});

describe("share snapshot", () => {
  const turn = {
    question: "What did the boss say?",
    answer: "Ship it Friday [1]. Budget is fine [3]. Ghost [9]. Code `a[2]` stays.",
    evidence: [ev(1), ev(2), ev(3, { timestamp: "not a date" })],
    // fields a turn carries that must never be shared
    memoryUsed: [{ id: "m1", content: "my salary is 100k" }],
    attachments: [{ id: "f1", name: "private.pdf" }],
  };

  it("keeps only cited sources, reduced to title, snippet, app and date", () => {
    const s = snapshot(turn, new Date("2026-10-31T00:00:00Z"));
    expect(s.sources.map((x) => x.n)).toEqual([1, 3]);
    expect(s.sources[0]).toEqual({ n: 1, source: "gmail", title: "Mail 1", quote: "snippet 1", date: "2026-10-01T09:00:00.000Z" });
    expect(s.sources[1]).not.toHaveProperty("date");
    const json = JSON.stringify(s);
    for (const secret of ["mail.google.com", "boss@corp.com", "msg-1", "salary", "private.pdf", "Mail 2"]) expect(json).not.toContain(secret);
  });

  it("drops citations to nothing but leaves code alone", () => {
    const { answer } = snapshot(turn);
    expect(answer).toBe("Ship it Friday [1]. Budget is fine [3]. Ghost. Code `a[2]` stays.");
  });

  it("copies as markdown with a sources list", () => {
    const s = snapshot(turn);
    const md = toMarkdown(s.answer, s.sources);
    expect(md).toContain("**Sources**");
    expect(md).toContain("[1] Mail 1 (Gmail, 2026-10-01)");
  });
});

describe("share store", () => {
  const store = shareStore(new DatabaseSync(":memory:"));
  const snap = snapshot({ question: "q", answer: "a", evidence: [] });

  it("gives one unguessable link per answer, and only the owner can revoke it", () => {
    const id = store.create("alice", "chat1", "turn1", snap);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(store.create("alice", "chat1", "turn1", snap)).toBe(id);
    expect(store.get(id)?.question).toBe("q");
    expect(store.revoke("mallory", id)).toBe(false);
    expect(store.get(id)).not.toBeNull();
    expect(store.revoke("alice", id)).toBe(true);
    expect(store.get(id)).toBeNull();
    expect(store.create("alice", "chat1", "turn1", snap)).not.toBe(id);
  });

  it("forgets links with their chat and rejects malformed ids", () => {
    const id = store.create("bob", "chat2", "turn1", snap);
    store.revokeChat("bob", "chat2");
    expect(store.get(id)).toBeNull();
    expect(store.get("' OR 1=1 --")).toBeNull();
  });
});
