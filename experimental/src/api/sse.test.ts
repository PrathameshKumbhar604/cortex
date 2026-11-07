import { parseSSE } from "./sse";

describe("parseSSE", () => {
  it("splits events across chunk boundaries", () => {
    const { events, rest } = parseSSE('data: {"type":"token","text":"a"}\n\ndata: {"ty');
    expect(events).toEqual([{ type: "token", text: "a" }]);
    expect(rest).toBe('data: {"ty');
    const next = parseSSE(rest + 'pe":"done"}\n\n');
    expect(next.events).toEqual([{ type: "done" }]);
    expect(next.rest).toBe("");
  });

  it("ignores blank and comment lines", () => {
    const { events } = parseSSE(': keep-alive\n\n\n\ndata: {"type":"done"}\n\n');
    expect(events).toEqual([{ type: "done" }]);
  });

  it("handles CRLF line endings", () => {
    expect(parseSSE('data: {"type":"done"}\r\n\r\n').events).toEqual([{ type: "done" }]);
  });

  it("skips an unparseable event instead of throwing", () => {
    expect(parseSSE('data: {oops\n\ndata: {"type":"done"}\n\n').events).toEqual([{ type: "done" }]);
  });
});
