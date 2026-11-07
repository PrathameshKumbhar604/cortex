import { cardKey, unseenCount } from "./seen";

describe("brief seen", () => {
  const cards = [{ kind: "risk", title: "Beta slips" }, { kind: "changed", title: "Demo moved" }];
  it("unseenCount counts cards not seen", () => expect(unseenCount(cards, [cardKey(cards[0])])).toBe(1));
  it("pill hidden at 0", () => expect(unseenCount(cards, cards.map(cardKey))).toBe(0));
  it("no brief, no count", () => expect(unseenCount([], [])).toBe(0));
});
