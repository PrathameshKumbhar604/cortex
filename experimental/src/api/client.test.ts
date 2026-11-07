import { api, ApiError, setTokenGetter } from "./client";

const ok = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as Response);

describe("api", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  it("sends Bearer token", async () => {
    setTokenGetter(async () => "tok1");
    fetchMock.mockReturnValue(ok({ chats: [] }));
    await api("/api/chats");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok1");
  });

  it("retries once with a fresh token on 401", async () => {
    const getter = jest.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    setTokenGetter(getter);
    fetchMock.mockReturnValueOnce(ok({ error: "Sign in to continue." }, 401)).mockReturnValueOnce(ok({ fine: true }));
    await expect(api("/api/chats")).resolves.toEqual({ fine: true });
    expect(getter).toHaveBeenCalledTimes(2);
    expect(getter).toHaveBeenLastCalledWith({ skipCache: true });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
  });

  it("uses the backend's error message", async () => {
    setTokenGetter(async () => "t");
    fetchMock.mockReturnValue(ok({ error: "That question is too long." }, 400));
    await expect(api("/api/ask")).rejects.toMatchObject({ status: 400, message: "That question is too long." });
  });

  it("times out with a readable error", async () => {
    setTokenGetter(async () => "t");
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const err = (await api("/api/chats", { timeoutMs: 30 }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain("Can't reach Cortex");
  });

  it("explains a network failure", async () => {
    setTokenGetter(async () => "t");
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(api("/api/chats")).rejects.toMatchObject({ status: 0, message: expect.stringContaining("Can't reach Cortex") });
  });
});
