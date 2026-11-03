import { describe, expect, it } from "vitest";
import { cleanStarters } from "./starters";

describe("cleanStarters", () => {
  it("strips numbering, bullets and quotes, drops preamble and duplicates", () => {
    const raw = 'Here are some questions:\n1. "What changed in Orbit this week?"\n- Is the beta at risk?\n* Is the beta at risk?\n2) When is Demo Day now?\n• Draft a Slack update about Demo Day';
    expect(cleanStarters(raw)).toEqual(["What changed in Orbit this week?", "Is the beta at risk?", "When is Demo Day now?", "Draft a Slack update about Demo Day"]);
  });
  it("returns null when fewer than three usable questions come back", () => {
    expect(cleanStarters("Sure!\nok")).toBeNull();
  });
});
