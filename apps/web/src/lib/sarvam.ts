// Pure rules for Sarvam AI's errors and for when voice mode is switched off. No I/O here, so both the server and the
// tests use it. Error shapes: https://docs.sarvam.ai/api/getting-started/errors-troubleshooting

export type SarvamFailureKind =
  /** The credit balance (or a seat's budget) is empty: retrying won't help until someone tops up. */
  | "exhausted"
  /** The key is missing, wrong or revoked: also won't clear by waiting. */
  | "auth"
  /** Rate limits, model capacity, timeouts, 5xx: the next call may work. */
  | "transient"
  /** We sent something Sarvam rejected (400/422): a bug on our side, not a reason to switch voice off. */
  | "invalid";

export interface SarvamFailure {
  kind: SarvamFailureKind;
  status: number;
  code?: string;
  message: string;
}

const EXHAUSTED_CODES = new Set(["insufficient_quota_error", "seat_budget_exhausted_error"]);
const AUTH_CODES = new Set(["invalid_api_key_error", "authentication_error"]);
const OUT_OF_CREDIT = /no credits|insufficient (credit|quota|balance)|quota exceeded|out of credits|credit balance/i;

/** Maps a failed Sarvam response (status 0 = network error or timeout) to what voice mode should do about it. */
export function classifySarvamError(status: number, body: unknown): SarvamFailure {
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof err?.code === "string" ? err.code : undefined;
  const message = typeof err?.message === "string" ? err.message : typeof body === "string" ? body.slice(0, 200) : "";
  const out = (kind: SarvamFailureKind): SarvamFailure => ({ kind, status, code, message });
  // The code decides first: the TTS reference documents "429 Quota Exceeded" carrying insufficient_quota_error.
  if (code && EXHAUSTED_CODES.has(code)) return out("exhausted");
  if (code && AUTH_CODES.has(code)) return out("auth");
  if (status === 402 || OUT_OF_CREDIT.test(message)) return out("exhausted");
  if (status === 401 || status === 403) return out("auth");
  if (status === 400 || status === 413 || status === 422) return out("invalid");
  return out("transient");
}

/** Exhausted credits and a dead key switch voice mode off for everyone until a cool-down probe or an admin says otherwise. */
export const switchesVoiceOff = (f: SarvamFailure) => f.kind === "exhausted" || f.kind === "auth";

export const COOLDOWN_MS = 60 * 60 * 1000;

/** Stored server-side (settings row "voiceOff") when voice mode was switched off. */
export interface VoiceOff {
  at: number;
  reason: string;
  /** When the last cool-down probe ran (and failed). */
  probedAt?: number;
}

/**
 * Whether voice mode may start now. After the cool-down one cheap probe is due (`probe: true`); the caller runs it,
 * clears the row on success and records `probedAt` on failure, which starts the next cool-down.
 */
export function voiceState(off: VoiceOff | null, now: number): { enabled: boolean; probe: boolean; retryAt?: number } {
  if (!off) return { enabled: true, probe: false };
  const since = Math.max(off.at, off.probedAt ?? 0);
  if (now - since >= COOLDOWN_MS) return { enabled: false, probe: true };
  return { enabled: false, probe: false, retryAt: since + COOLDOWN_MS };
}
