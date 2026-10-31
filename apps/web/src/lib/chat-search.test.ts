import { describe, expect, it } from "vitest";
import { highlight, keywordSearch, mergeHits, type SearchableChat } from "./chat-search";

const chat = (id: string, title: string, turns: [string, string][], updatedAt = 1): SearchableChat => ({
  id,
  title,
  updatedAt,
  turns: turns.map(([question, answer]) => ({ question, answer })),
});

const chats = [
  chat("bill", "Furniture refund", [["What is this file about?", "Wakefit support says the **Safari chair** was assembled wrong; you asked for a refund."]], 3),
  chat("orbit", "Weekly Orbit updates", [["What changed in Orbit this week?", "Bug #42 login loop on Android 15."], ["Who owns the chair redesign?", "Priya."]], 2),
  chat("granola", "What is granola", [["What is granola", "Granola is a breakfast food."]], 1),
];
const text = (p: { text: string }[]) => p.map((x) => x.text).join("");

describe("keywordSearch", () => {
  it("needs every word, and ranks title over question over answer", () => {
    expect(keywordSearch(chats, "orbit").map((h) => h.id)).toEqual(["orbit"]);
    expect(keywordSearch(chats, "chair").map((h) => h.id)).toEqual(["orbit", "bill"]); // question beats answer
    expect(keywordSearch(chats, "granola breakfast").map((h) => h.id)).toEqual(["granola"]);
    expect(keywordSearch(chats, "granola orbit")).toEqual([]);
    expect(keywordSearch(chats, "  ")).toEqual([]);
  });

  it("ignores case and markdown, points at the matching turn and marks the match", () => {
    const [h] = keywordSearch(chats, "SAFARI chair");
    expect(h).toMatchObject({ id: "bill", kind: "keyword", turn: 0 });
    expect(text(h!.snippet)).toContain("Safari chair was assembled");
    expect(h!.snippet.filter((p) => p.hit).map((p) => p.text)).toEqual(["Safari", "chair"]);
    expect(keywordSearch(chats, "priya")[0]!.turn).toBe(1);
  });

  it("puts a whole-phrase match above scattered words, newer first on ties", () => {
    const a = chat("a", "Notes", [["login loop", "x"]], 1);
    const b = chat("b", "Notes", [["loop over the login form", "x"]], 9);
    expect(keywordSearch([b, a], "login loop").map((h) => h.id)).toEqual(["a", "b"]);
    const c = chat("c", "Notes", [["login loop", "x"]], 5);
    expect(keywordSearch([a, c], "login loop").map((h) => h.id)).toEqual(["c", "a"]);
  });

  it("clips long answers around the match", () => {
    const long = chat("l", "Long", [["q", `${"filler ".repeat(60)}the invoice total ${"more ".repeat(60)}`]]);
    const s = text(keywordSearch([long], "invoice")[0]!.snippet);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("invoice");
    expect(s.length).toBeLessThan(150);
  });
});

describe("highlight", () => {
  it("treats regex characters literally", () => {
    expect(highlight("PR #42 (fix)", ["(fix)"])).toEqual([
      { text: "PR #42 ", hit: false },
      { text: "(fix)", hit: true },
    ]);
  });
});

describe("mergeHits", () => {
  it("keeps keyword hits first, adds meaning-only chats above the threshold, once each", () => {
    const keyword = keywordSearch(chats, "orbit");
    const merged = mergeHits(
      keyword,
      [
        { id: "granola", turn: 0, score: 0.57 }, // below the floor
        { id: "orbit", turn: 1, score: 0.65 }, // already a keyword hit
        { id: "bill", turn: 0, score: 0.62 },
        { id: "bill", turn: 0, score: 0.6 },
        { id: "gone", turn: 0, score: 0.64 }, // no longer in this browser
      ],
      chats,
    );
    expect(merged.map((h) => [h.id, h.kind])).toEqual([
      ["orbit", "keyword"],
      ["bill", "semantic"],
    ]);
    expect(text(merged[1]!.snippet)).toContain("What is this file about? — Wakefit");
  });

  it("drops matches far below the best one", () => {
    const m = mergeHits([], [{ id: "orbit", turn: 0, score: 0.66 }, { id: "bill", turn: 0, score: 0.6 }], chats);
    expect(m.map((h) => h.id)).toEqual(["orbit"]);
  });

  it("falls back to the first turn when the matched turn is gone", () => {
    expect(mergeHits([], [{ id: "granola", turn: 7, score: 0.9 }], chats)[0]!.turn).toBe(0);
  });
});
