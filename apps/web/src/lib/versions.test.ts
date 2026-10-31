import { describe, expect, it } from "vitest";
import type { Turn } from "./use-agent";
import { addVersion, normalizeTurn, selectVersion, versionInfo, type Attempt } from "./versions";

const turn = (id: string, answer: string): Turn =>
  ({ id, question: "q", mode: "deep", startedAt: 0, steps: {}, tools: [], evidence: [], failures: [], memoryUsed: [], memoryWritten: [], answer, claims: [], conflicts: [], missing: [], followups: [], actions: [], done: true }) as unknown as Turn;
const attempt = (id: string, answer: string) => turn(id, answer) as Attempt;

describe("answer versions", () => {
  it("an old saved turn is one version and loads unchanged", () => {
    const old = turn("a", "first");
    expect(versionInfo(old)).toEqual({ count: 1, index: 0 });
    expect(normalizeTurn(old)).toBe(old);
  });

  it("regenerating keeps every attempt, shows the newest, and stores each once", () => {
    const two = addVersion(turn("a", "first"), attempt("b", "second"));
    expect(two.id).toBe("b");
    expect(versionInfo(two)).toEqual({ count: 2, index: 1 });
    expect(two.versions).toEqual([expect.objectContaining({ id: "a", answer: "first" }), null]);
    expect(two.versions![0]).not.toHaveProperty("versions");

    const three = addVersion(two, attempt("c", "third"));
    expect(versionInfo(three)).toEqual({ count: 3, index: 2 });
    expect(three.versions!.map((v) => v?.id ?? null)).toEqual(["a", "b", null]);
  });

  it("switching puts the chosen attempt on top (what history, Copy and Share read) and back again", () => {
    const three = addVersion(addVersion(turn("a", "first"), attempt("b", "second")), attempt("c", "third"));
    const first = selectVersion(three, 0);
    expect(first).toMatchObject({ id: "a", answer: "first", version: 0 });
    expect(first.versions!.map((v) => v?.id ?? null)).toEqual([null, "b", "c"]);
    expect(selectVersion(first, 2)).toEqual(three);
    expect(selectVersion(first, 5)).toBe(first); // out of range: unchanged
    // regenerating from an older version appends, keeping the rest
    expect(addVersion(first, attempt("d", "fourth")).versions!.map((v) => v?.id ?? null)).toEqual(["a", "b", "c", null]);
  });

  it("survives a save round-trip and drops versions that don't add up", () => {
    const two = addVersion(turn("a", "first"), attempt("b", "second"));
    expect(normalizeTurn(JSON.parse(JSON.stringify(two)))).toEqual(two);
    const broken = [
      { ...two, version: 7 },
      { ...two, versions: "nope" },
      { ...two, versions: [null, null] },
      { ...two, versions: [{ id: 1 }, null] },
      { ...turn("a", "x"), version: 0 },
    ] as unknown as Turn[];
    for (const b of broken) {
      const t = normalizeTurn(b);
      expect(t).not.toHaveProperty("versions");
      expect(t).not.toHaveProperty("version");
      expect(versionInfo(t)).toEqual({ count: 1, index: 0 });
    }
  });

  it("an edited question is a new version that keeps its own question; switching restores the original", () => {
    const orig = turn("a", "first");
    const edited = addVersion(orig, { ...attempt("b", "second"), question: "q, but sharper" });
    expect(edited).toMatchObject({ id: "b", question: "q, but sharper", answer: "second", version: 1 });
    expect(edited.versions![0]).toMatchObject({ id: "a", question: "q", answer: "first" });

    const back = selectVersion(edited, 0);
    expect(back).toMatchObject({ id: "a", question: "q", answer: "first" });
    expect(back.versions![1]).toMatchObject({ question: "q, but sharper" });
    expect(selectVersion(back, 1)).toEqual(edited);
    expect(normalizeTurn(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
  });
});
