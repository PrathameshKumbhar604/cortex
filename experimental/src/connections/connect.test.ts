import { connectApp } from "./connect";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const wait = async () => {};

describe("connectApp", () => {
  it("refreshes after browser closes", async () => {
    const order: string[] = [];
    const api = jest.fn(async () => (order.push("api"), { redirectUrl: "https://connect.composio.dev/link/1" })) as never;
    const openBrowser = jest.fn(async (url: string) => (order.push(`open ${url}`), { type: "cancel" })) as never;
    const refresh = jest.fn(async () => (order.push("refresh"), true));
    await expect(connectApp("gmail", refresh, { api, openBrowser, wait })).resolves.toBe(true);
    expect(order).toEqual(["api", "open https://connect.composio.dev/link/1", "refresh"]);
    expect((api as jest.Mock).mock.calls[0][0]).toBe("/api/connections/gmail");
  });

  it("keeps checking while Composio activates the account", async () => {
    const api = jest.fn(async () => ({ redirectUrl: "https://x" })) as never;
    const openBrowser = jest.fn(async () => ({ type: "cancel" })) as never;
    let n = 0;
    const refresh = jest.fn(async () => ++n >= 3);
    await expect(connectApp("gmail", refresh, { api, openBrowser, wait })).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("gives up after a few checks when nothing connected", async () => {
    const api = jest.fn(async () => ({ redirectUrl: "https://x" })) as never;
    const openBrowser = jest.fn(async () => ({ type: "cancel" })) as never;
    const refresh = jest.fn(async () => false);
    await expect(connectApp("gmail", refresh, { api, openBrowser, wait })).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(6);
  });

  it("does not open anything when the server refuses", async () => {
    const api = jest.fn(async () => {
      throw new Error("Switch to your own workspace to connect real accounts.");
    }) as never;
    const openBrowser = jest.fn() as never;
    await expect(connectApp("gmail", async () => false, { api, openBrowser, wait })).rejects.toThrow("own workspace");
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
