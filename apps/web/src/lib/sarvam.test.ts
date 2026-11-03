import { describe, expect, it } from "vitest";
import { classifySarvamError, COOLDOWN_MS, switchesVoiceOff, voiceState } from "./sarvam";

const body = (code: string, message = "x") => ({ error: { code, message } });

describe("classifySarvamError", () => {
  it("treats an empty wallet as exhausted, whatever status carries it", () => {
    expect(classifySarvamError(402, body("insufficient_quota_error", "No credits available.")).kind).toBe("exhausted");
    expect(classifySarvamError(429, body("insufficient_quota_error", "Quota Exceeded")).kind).toBe("exhausted");
    expect(classifySarvamError(429, body("seat_budget_exhausted_error")).kind).toBe("exhausted");
    expect(classifySarvamError(402, null).kind).toBe("exhausted");
    expect(classifySarvamError(429, { error: { message: "No credits available." } }).kind).toBe("exhausted");
  });

  it("treats a bad key as auth", () => {
    expect(classifySarvamError(403, body("invalid_api_key_error")).kind).toBe("auth");
    expect(classifySarvamError(401, {}).kind).toBe("auth");
  });

  it("keeps rate limits, capacity, timeouts and 5xx transient", () => {
    expect(classifySarvamError(429, body("rate_limit_exceeded_error", "Rate limit exceeded")).kind).toBe("transient");
    expect(classifySarvamError(429, body("model_rate_limit_exceeded_error")).kind).toBe("transient");
    expect(classifySarvamError(503, body("model_overloaded")).kind).toBe("transient");
    expect(classifySarvamError(500, "<html>oops</html>").kind).toBe("transient");
    expect(classifySarvamError(0, null).kind).toBe("transient");
  });

  it("treats our own bad requests as invalid", () => {
    expect(classifySarvamError(422, body("unprocessable_entity_error")).kind).toBe("invalid");
    expect(classifySarvamError(400, body("invalid_request_error")).kind).toBe("invalid");
  });

  it("switches voice off only for exhausted credits and a dead key", () => {
    expect(switchesVoiceOff(classifySarvamError(402, null))).toBe(true);
    expect(switchesVoiceOff(classifySarvamError(403, null))).toBe(true);
    expect(switchesVoiceOff(classifySarvamError(429, body("rate_limit_exceeded_error")))).toBe(false);
    expect(switchesVoiceOff(classifySarvamError(422, null))).toBe(false);
  });
});

describe("voiceState", () => {
  const t0 = 1_700_000_000_000;
  it("is on with no record", () => expect(voiceState(null, t0)).toEqual({ enabled: true, probe: false }));

  it("stays off through the cool-down, then asks for one probe", () => {
    const off = { at: t0, reason: "exhausted" };
    expect(voiceState(off, t0 + 1000)).toEqual({ enabled: false, probe: false, retryAt: t0 + COOLDOWN_MS });
    expect(voiceState(off, t0 + COOLDOWN_MS)).toEqual({ enabled: false, probe: true });
  });

  it("a failed probe starts the next cool-down", () => {
    const off = { at: t0, reason: "exhausted", probedAt: t0 + COOLDOWN_MS };
    expect(voiceState(off, t0 + COOLDOWN_MS + 5)).toMatchObject({ enabled: false, probe: false, retryAt: t0 + 2 * COOLDOWN_MS });
    expect(voiceState(off, t0 + 2 * COOLDOWN_MS).probe).toBe(true);
  });
});
