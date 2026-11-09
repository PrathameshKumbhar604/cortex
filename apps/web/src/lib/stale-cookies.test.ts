import { describe, expect, it } from "vitest";
import { cookieSuffix, parentDomain, staleClerkCookies } from "./stale-cookies";

const CUR = "AbCd_123";

describe("staleClerkCookies", () => {
  it("keeps this instance's cookies", () => {
    expect(staleClerkCookies(["__session", `__session_${CUR}`, "__client_uat", `__client_uat_${CUR}`, "cortex_uid"], CUR)).toEqual([]);
  });
  it("drops another instance's suffixed cookies", () => {
    expect(staleClerkCookies([`__session_${CUR}`, "__session_OldInst1", "__client_uat_OldInst1", "__refresh_OldInst1"], CUR)).toEqual([
      "__session_OldInst1",
      "__client_uat_OldInst1",
      "__refresh_OldInst1",
    ]);
  });
  it("drops unsuffixed cookies when this instance hasn't written its own (they belong to another instance)", () => {
    expect(staleClerkCookies(["__session", "__client_uat", "__client_uat_OldInst1"], CUR)).toEqual(["__session", "__client_uat", "__client_uat_OldInst1"]);
  });
  it("drops development cookies", () => expect(staleClerkCookies(["__clerk_db_jwt", "__clerk_db_jwt_x1y2z3w4"], CUR)).toEqual(["__clerk_db_jwt", "__clerk_db_jwt_x1y2z3w4"]));
  it("leaves other cookies alone", () => expect(staleClerkCookies(["cortex_ws", "theme", "__sessionx"], CUR)).toEqual([]));
});

describe("cookieSuffix", () => {
  // Value from @clerk/shared's own getCookieSuffix for the same key.
  it("matches Clerk", async () => expect(await cookieSuffix("pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk")).toBe("PWKyINQF"));
});

describe("parentDomain", () => {
  it("one level up", () => expect(parentDomain("cortex.runs-on.dev")).toBe("runs-on.dev"));
  it("none for a bare name or an IP", () => {
    expect(parentDomain("localhost")).toBeNull();
    expect(parentDomain("runs-on.dev")).toBeNull();
    expect(parentDomain("13.55.93.39")).toBeNull();
  });
});
