import { describe, expect, it } from "vitest";
import { briefKey, chooseWorkspace } from "./workspace";

describe("chooseWorkspace", () => {
  it("follows the cookie, falling back to the default", () => {
    expect(chooseWorkspace("live", true, "demo")).toBe("live");
    expect(chooseWorkspace("demo", true, "live")).toBe("demo");
    expect(chooseWorkspace(undefined, true, "live")).toBe("live");
    expect(chooseWorkspace("bogus", true, "demo")).toBe("demo");
  });
  it("never picks live where own apps aren't allowed", () => {
    expect(chooseWorkspace("live", false, "live")).toBe("demo");
  });
});

describe("briefKey", () => {
  it("differs by user, workspace and connected sources", () => {
    const k = briefKey("u1", "live", ["gmail"]);
    expect(briefKey("u2", "live", ["gmail"])).not.toBe(k);
    expect(briefKey("u1", "demo", ["gmail"])).not.toBe(k);
    expect(briefKey("u1", "live", ["gmail", "slack"])).not.toBe(k); // connecting an app makes a new brief
  });
  it("ignores source order and is versioned past old rows", () => {
    expect(briefKey("u1", "live", ["slack", "gmail"])).toBe(briefKey("u1", "live", ["gmail", "slack"]));
    expect(briefKey("u1", "live", ["gmail"]).startsWith("v2:")).toBe(true);
  });
});
