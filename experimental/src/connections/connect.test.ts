import { connectApp } from "./connect";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

describe("connectApp", () => {
  it("refreshes after browser closes", async () => {
    const order: string[] = [];
    const api = jest.fn(async () => (order.push("api"), { redirectUrl: "https://connect.composio.dev/link/1" })) as never;
    const openBrowser = jest.fn(async (url: string) => (order.push(`open ${url}`), { type: "cancel" })) as never;
    const refresh = jest.fn(async () => order.push("refresh"));
    await connectApp("gmail", refresh, { api, openBrowser });
    expect(order).toEqual(["api", "open https://connect.composio.dev/link/1", "refresh"]);
    expect((api as jest.Mock).mock.calls[0][0]).toBe("/api/connections/gmail");
  });

  it("does not open anything when the server refuses", async () => {
    const api = jest.fn(async () => {
      throw new Error("Switch to your own workspace to connect real accounts.");
    }) as never;
    const openBrowser = jest.fn() as never;
    await expect(connectApp("gmail", async () => {}, { api, openBrowser })).rejects.toThrow("own workspace");
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
