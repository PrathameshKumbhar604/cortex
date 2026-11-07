import { classifyUser } from "./onboarding";

describe("classifyUser", () => {
  const none = { chats: [], memory: [], connections: [] };
  it("new when nothing exists", () => expect(classifyUser(none)).toBe("new"));
  it("returning when any chat", () => expect(classifyUser({ ...none, chats: [{}] })).toBe("returning"));
  it("returning when any memory", () => expect(classifyUser({ ...none, memory: [{}] })).toBe("returning"));
  it("returning when any connection connected", () =>
    expect(classifyUser({ ...none, connections: [{ connected: false }, { connected: true }] })).toBe("returning"));
  it("new when connections exist but none connected", () => expect(classifyUser({ ...none, connections: [{ connected: false }] })).toBe("new"));
});
