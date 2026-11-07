import { describe, expect, it } from "vitest";
import { approvedOnSignUp, needsApproval } from "./approval";

const owner = (e: string, v: boolean) => v && e === "boss@example.com";
const member = { role: "member", email: "new@example.com", verified: true, approved: false };

describe("needsApproval", () => {
  it("auto mode never waits", () => expect(needsApproval(member, "auto", owner)).toBe(false));
  it("manual mode waits for unapproved", () => expect(needsApproval(member, "manual", owner)).toBe(true));
  it("admin never waits", () => expect(needsApproval({ ...member, role: "admin" }, "manual", owner)).toBe(false));
  it("owner never waits", () => expect(needsApproval({ ...member, email: "boss@example.com" }, "manual", owner)).toBe(false));
  it("an unverified owner email still waits", () => expect(needsApproval({ ...member, email: "boss@example.com", verified: false }, "manual", owner)).toBe(true));
  it("approved user passes in manual", () => expect(needsApproval({ ...member, approved: true }, "manual", owner)).toBe(false));
});

describe("approvedOnSignUp", () => {
  it("a new account is approved in auto mode", () => expect(approvedOnSignUp("auto")).toBe(true));
  it("a new account waits in manual mode", () => expect(approvedOnSignUp("manual")).toBe(false));
});
