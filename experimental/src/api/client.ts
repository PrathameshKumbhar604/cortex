import { API_URL } from "@/config";
import { prefs } from "@/storage";
import { parseSSE } from "./sse";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Set when the account is waiting for the admin's approval (phase 2). */
    readonly waitlist = false,
  ) {
    super(message);
  }
}

type TokenGetter = (opts?: { skipCache?: boolean }) => Promise<string | null>;
let getToken: TokenGetter = async () => null;
/** Wired to Clerk's getToken in the root layout. */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

/** The current session token, for requests that can't go through `send` (multipart uploads, audio). */
export const getAuthToken = () => getToken();

let onSignedOut: () => void = () => {};
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

const unreachable = () => new ApiError(0, `Can't reach Cortex at ${API_URL}. Check that the server is running and your phone is on the same network.`);

async function request(path: string, init: RequestInit & { timeoutMs?: number }, fresh: boolean): Promise<Response> {
  const { timeoutMs = 10_000, headers, signal, ...rest } = init;
  const token = await getToken(fresh ? { skipCache: true } : undefined);
  // The backend keeps the Sample/Live choice in a cookie; the app owns it and sends it explicitly on every call.
  const ws = prefs.getString("cortex.workspace");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    return await fetch(API_URL + path, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ws ? { Cookie: `cortex_ws=${ws}` } : {}),
        ...(headers as Record<string, string>),
      },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw unreachable();
  } finally {
    clearTimeout(timer);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string; waitlist?: boolean } | null;
  return new ApiError(res.status, body?.error ?? `Cortex answered with an error (${res.status}).`, body?.waitlist === true);
}

/** Sends a request with the session token; on 401 it retries once with a fresh token, then signs out. */
export async function send(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  let res = await request(path, init, false);
  if (res.status === 401) res = await request(path, init, true);
  if (res.status === 401) onSignedOut();
  if (!res.ok) throw await errorFrom(res);
  return res;
}

/** JSON call. Empty responses (204) resolve to undefined. */
export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number; json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await send(path, json === undefined ? rest : { ...rest, body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers as Record<string, string>) } });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const IDLE_MS = 30_000; // a stream that sends nothing for this long is treated as dropped

/**
 * POSTs `body` and calls `onEvent` for each server-sent event until the stream ends. expo/fetch is the global fetch on
 * Android and streams response bodies.
 */
export async function streamSSE(path: string, body: unknown, onEvent: (e: unknown) => void, signal: AbortSignal): Promise<void> {
  const res = await send(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, signal, timeoutMs: IDLE_MS });
  if (!res.body) throw new ApiError(0, "This phone couldn't read the answer as it streamed.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        idle = setTimeout(() => reject(new ApiError(0, "The connection to Cortex dropped while answering.")), IDLE_MS);
      }),
    ]).finally(() => clearTimeout(idle));
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const { events, rest } = parseSSE(buffer);
    buffer = rest;
    for (const e of events) onEvent(e);
  }
}
