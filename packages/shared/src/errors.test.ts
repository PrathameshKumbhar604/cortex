import { describe, expect, it } from "vitest";
import { explainError, explainFailure } from "./errors";

const CODES = /\b(ECONN\w+|ENOTFOUND|ETIMEDOUT|[45]\d\d|stack|undefined|null|exception|LlmUnavailable)\b/i;

describe("calm error copy", () => {
  it("each simulated failure gets a plain message and something to do, with the raw reason kept aside", () => {
    const cases = [
      explainFailure({ source: "gmail", name: "Gmail", reason: "its sign-in expired; reconnect it on the Connections page", impact: "" }),
      explainFailure({ source: "slack", name: "Slack", reason: "ECONNREFUSED 127.0.0.1:443", impact: "" }),
      explainFailure({ source: "memory", name: "Memory", reason: "memory service 503: down", impact: "" }),
      explainFailure({ source: "llm", name: "Language model", reason: "LlmUnavailableError: all providers 429", impact: "" }),
      explainError("Every free model is busy or unavailable right now. Try again in a minute, or switch on Fast Mode."),
      explainError("Connection lost: Failed to fetch"),
      explainError("TypeError: Cannot read properties of undefined (reading 'x')"),
    ];
    for (const c of cases) {
      expect(c.title + c.body).not.toMatch(CODES); // no codes or stack traces up front
      expect(c.title.length).toBeLessThan(60);
    }
    expect(cases[0]!.action).toMatchObject({ kind: "link", href: "/connections" }); // expired → Reconnect
    expect(cases[1]!.action).toMatchObject({ kind: "retry" }); // network → Try again
    expect(cases[1]!.detail).toMatch(/ECONNREFUSED/); // …and the raw reason behind Details
    expect(cases[3]!.action).toMatchObject({ kind: "retry" });
    expect(cases[5]!.title).toMatch(/connection/i);
  });

  it("sends a signed-out person to sign in, and treats Stop as nothing wrong", () => {
    expect(explainError("Sign in to continue.").action).toMatchObject({ kind: "link", href: "/sign-in" });
    expect(explainError("Stopped.").detail).toBeUndefined();
  });
});
