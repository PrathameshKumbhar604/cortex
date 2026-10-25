import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LlmRouter, LlmUnavailableError, parseJsonLoose } from "./router";
import type { ProviderConfig } from "./providers";

let server: Server;
let base = "";
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const name = req.url!.split("/")[1]!;
    hits[name] = (hits[name] ?? 0) + 1;
    if (name === "limited") {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "30" });
      return res.end(JSON.stringify({ error: { message: "rate limited" } }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, message: { role: "assistant", content: `{"from":"${name}"}` }, finish_reason: "stop" }] }));
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const provider = (id: string): ProviderConfig => ({
  id,
  label: id,
  baseURL: `${base}/${id}`,
  apiKey: "k",
  models: { strong: "s", fast: "f" },
  supportsJsonMode: true,
});

describe("LlmRouter", () => {
  it("fails over past a rate-limited provider and then skips it while cooling down", async () => {
    const r = new LlmRouter({ providers: [provider("limited"), provider("healthy")] });
    const a = await r.complete({ tier: "fast", messages: [{ role: "user", content: "1" }], json: true, cacheTtlMs: 0 });
    expect(a.provider).toBe("healthy");
    await r.complete({ tier: "fast", messages: [{ role: "user", content: "2" }], cacheTtlMs: 0 });
    expect(hits.limited).toBe(1); // cooldown respected
  });

  it("serves identical prompts from cache", async () => {
    const r = new LlmRouter({ providers: [provider("cachey")] });
    const msg = [{ role: "user" as const, content: "same" }];
    await r.complete({ tier: "fast", messages: msg });
    const b = await r.complete({ tier: "fast", messages: msg });
    expect(b.cached).toBe(true);
    expect(hits.cachey).toBe(1);
  });

  it("explains failure when no provider works", async () => {
    const r = new LlmRouter({ providers: [] });
    await expect(r.complete({ tier: "fast", messages: [] })).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("parses fenced or embedded JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
  });
});
