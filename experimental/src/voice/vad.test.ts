import { createVad } from "./vad";

// 20ms blocks; "loud" is well over the adaptive floor, "quiet" under it.
const LOUD = 0.2;
const QUIET = 0.001;
const run = (vad: ReturnType<typeof createVad>, level: number, ms: number, speaking = false) => {
  const out: string[] = [];
  for (let t = 0; t < ms; t += 20) {
    const e = vad.push(level, 20, speaking);
    if (e) out.push(e);
  }
  return out;
};

describe("vad (the web engine's turn-taking)", () => {
  it("starts after 140ms voiced", () => {
    const v = createVad();
    run(v, QUIET, 400);
    expect(run(v, LOUD, 120)).toEqual([]);
    expect(run(v, LOUD, 40)).toEqual(["start"]);
  });

  it("ends after 1200ms silence", () => {
    const v = createVad();
    run(v, QUIET, 400);
    run(v, LOUD, 600);
    expect(run(v, QUIET, 1180)).toEqual([]);
    expect(run(v, QUIET, 40)).toEqual(["end"]);
  });

  it("discards under 250ms of speech", () => {
    const v = createVad();
    run(v, QUIET, 400);
    run(v, LOUD, 160);
    expect(run(v, QUIET, 1300)).toEqual(["discard"]);
  });

  it("barge needs 300ms while speaking", () => {
    const v = createVad();
    run(v, QUIET, 400);
    expect(run(v, LOUD, 280, true)).toEqual([]);
    expect(run(v, LOUD, 40, true)).toEqual(["barge"]);
  });

  it("forces end at 28s", () => {
    const v = createVad();
    run(v, QUIET, 400);
    const events = run(v, LOUD, 28_300); // the cap counts from the turn start (~140ms in)
    expect(events.slice(0, 2)).toEqual(["start", "end"]); // still talking afterwards opens the next turn
  });

  it("hold starts at once and ends on release", () => {
    const v = createVad();
    expect(v.hold(true, false)).toBe("start");
    run(v, QUIET, 3000);
    expect(v.hold(false, false)).toBe("discard");
  });
});
