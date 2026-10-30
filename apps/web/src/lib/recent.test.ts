import { describe, expect, it } from "vitest";
import { mergeThreads, type SavedThread } from "./recent";

const t = (id: string, updatedAt: number, extra: Partial<SavedThread> = {}): SavedThread => ({ id, title: id, updatedAt, turns: [], ...extra });

describe("syncing chats with the server", () => {
  it("keeps one copy per chat, the newer one, and the server's on a tie; pinned stay first", () => {
    const local = [t("a", 5, { title: "local a" }), t("b", 9, { title: "local b" }), t("only-here", 3)];
    const remote = [t("a", 7, { title: "server a" }), t("b", 9, { title: "server b" }), t("other-device", 8, { pinned: true })];
    const merged = mergeThreads(local, remote);
    expect(merged.map((x) => x.id)).toEqual(["other-device", "b", "a", "only-here"]);
    expect(merged.find((x) => x.id === "a")?.title).toBe("server a"); // newer on the server
    expect(merged.find((x) => x.id === "b")?.title).toBe("server b"); // tie: server wins
  });

  it("keeps a newer local edit over an older server copy", () => {
    expect(mergeThreads([t("a", 10, { title: "edited here" })], [t("a", 4, { title: "old" })])[0]?.title).toBe("edited here");
  });
});
