import { citedIds, plain, splitPartial, withCitationLinks } from "./answerText";

describe("answer text", () => {
  it("turns [n] into citation links but leaves code alone", () => {
    expect(withCitationLinks("Due Friday [2].")).toBe("Due Friday. [2](#cite-2)");
    expect(withCitationLinks("Run `a[1]` now")).toBe("Run `a[1]` now");
    expect(withCitationLinks("```\nx[1]\n```")).toBe("```\nx[1]\n```");
  });
  it("plain strips markers and citations", () => expect(plain("- **Ship** it [1].")).toBe("Ship it"));
  it("splits partly supported pieces", () => {
    expect(splitPartial("We ship on Friday unless QA fails", ["ship on Friday"])).toEqual([
      { text: "We ", partial: false },
      { text: "ship on Friday", partial: true },
      { text: " unless QA fails", partial: false },
    ]);
  });
  it("collects cited evidence ids", () => expect([...citedIds("a [1] b [3] c [9]", [{ id: "e1" }, { id: "e2" }, { id: "e3" }])]).toEqual(["e1", "e3"]));
});
