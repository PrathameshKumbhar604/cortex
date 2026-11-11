import { createChatStore, mergeThreads, type SavedThread } from "./store";

const t = (id: string, updatedAt: number, extra: Partial<SavedThread> = {}): SavedThread => ({ id, title: id, updatedAt, turns: [], ...extra });

describe("mergeThreads (the web's rule)", () => {
  it("newest updatedAt wins, server on a tie", () => {
    const m = mergeThreads([t("a", 5, { title: "local" }), t("b", 9)], [t("a", 5, { title: "server" }), t("b", 3)]);
    expect(m.find((x) => x.id === "a")?.title).toBe("server");
    expect(m.find((x) => x.id === "b")?.updatedAt).toBe(9);
  });
  it("pinned first, then most recent", () => {
    expect(mergeThreads([t("old", 1, { pinned: true }), t("new", 9)], []).map((x) => x.id)).toEqual(["old", "new"]);
  });
});

describe("createChatStore", () => {
  const io = () => {
    const disk = new Map<string, string>();
    const calls: { method: string; path: string; body?: unknown }[] = [];
    return {
      disk,
      calls,
      deps: {
        read: async (k: string) => disk.get(k) ?? null,
        write: async (k: string, v: string) => void disk.set(k, v),
        remove: async (k: string) => void disk.delete(k),
        remote: {
          list: async () => [t("srv", 7)],
          put: async (th: SavedThread) => void calls.push({ method: "PUT", path: "/api/chats", body: th }),
          remove: async (id: string) => void calls.push({ method: "DELETE", path: id }),
        },
        debounceMs: 0,
      },
    };
  };

  it("syncs: pulls server chats and pushes local-only ones", async () => {
    const { deps, calls, disk } = io();
    disk.set("cortex.chats:u1", JSON.stringify([t("local", 3)]));
    const s = createChatStore(deps);
    await s.open("u1");
    await s.sync();
    expect(s.list().map((x) => x.id).sort()).toEqual(["local", "srv"]);
    await new Promise((r) => setTimeout(r, 5));
    expect(calls.some((c) => c.method === "PUT" && (c.body as SavedThread).id === "local")).toBe(true);
  });

  it("keeps a user-set title and pin when new turns are saved", async () => {
    const { deps } = io();
    const s = createChatStore(deps);
    await s.open("u1");
    s.save(t("c", 1, { title: "first question" }));
    s.update("c", { title: "Renamed", pinned: true });
    s.save(t("c", 2, { title: "first question" }));
    expect(s.list()[0]).toMatchObject({ title: "Renamed", pinned: true, updatedAt: 2 });
  });

  it("remove returns the chat for undo, and restore puts it back", async () => {
    const { deps, calls } = io();
    const s = createChatStore(deps);
    await s.open("u1");
    s.save(t("c", 1));
    const gone = s.remove("c");
    expect(s.list()).toHaveLength(0);
    expect(calls.some((c) => c.method === "DELETE" && c.path === "c")).toBe(true);
    s.restore(gone!);
    expect(s.list()).toHaveLength(1);
  });

  it("signing out: waiting changes are sent, then nothing of the account stays on the phone", async () => {
    const { deps, calls, disk } = io();
    const s = createChatStore({ ...deps, debounceMs: 60_000 });
    await s.open("u1");
    s.save(t("c", 1));
    await s.flush();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    await s.close();
    expect(s.list()).toHaveLength(0);
    expect(disk.has("cortex.chats:u1")).toBe(false);
    s.save(t("late", 2)); // nobody is signed in: nothing is written
    await new Promise((r) => setTimeout(r, 5));
    expect(disk.size).toBe(0);
    await s.close(); // clears the waiting push
  });

  it("keeps each account's chats apart", async () => {
    const { deps } = io();
    const s = createChatStore(deps);
    await s.open("u1");
    s.save(t("mine", 1));
    await new Promise((r) => setTimeout(r, 5));
    await s.open("u2");
    expect(s.list()).toHaveLength(0);
  });
});
