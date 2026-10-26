import OpenAI from "openai";
import { TtlCache } from "./cache";
import { loadProviders, type ProviderConfig, type Tier } from "./providers";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  tier: Tier;
  messages: Message[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Cache TTL in ms; 0 disables caching for this call. */
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

export interface Completion {
  text: string;
  provider: string;
  model: string;
  cached: boolean;
}

export class LlmUnavailableError extends Error {
  constructor(public readonly attempts: { provider: string; reason: string }[]) {
    super(
      attempts.length === 0
        ? "No LLM provider is configured. Add GEMINI_API_KEY (or another free-tier key) to .env."
        : `All LLM providers failed: ${attempts.map((a) => `${a.provider} (${a.reason})`).join(", ")}`,
    );
  }
}

const DEFAULT_CACHE_TTL = 1000 * 60 * 60 * 6;
const REQUEST_TIMEOUT_MS = 25_000;

interface Health {
  cooldownUntil: number;
  failures: number;
}

/**
 * One interface over every free provider. Tries providers in order, puts a
 * provider on cooldown when it rate-limits or errors, and caches completions.
 */
export class LlmRouter {
  private readonly providers: ProviderConfig[];
  private readonly clients = new Map<string, OpenAI>();
  private readonly health = new Map<string, Health>();
  private readonly cache: TtlCache<Completion>;

  constructor(opts: { providers?: ProviderConfig[]; cachePath?: string } = {}) {
    this.providers = opts.providers ?? loadProviders();
    this.cache = new TtlCache<Completion>(1000, opts.cachePath);
  }

  get configured(): { id: string; label: string; models: Record<Tier, string> }[] {
    return this.providers.map(({ id, label, models }) => ({ id, label, models }));
  }

  private client(p: ProviderConfig): OpenAI {
    let c = this.clients.get(p.id);
    if (!c) {
      c = new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
      this.clients.set(p.id, c);
    }
    return c;
  }

  private available(): ProviderConfig[] {
    const now = Date.now();
    const ready = this.providers.filter((p) => (this.health.get(p.id)?.cooldownUntil ?? 0) <= now);
    // If everything is cooling down, try the one that recovers soonest rather than failing outright.
    if (ready.length === 0 && this.providers.length > 0) {
      return [...this.providers].sort(
        (a, b) => (this.health.get(a.id)?.cooldownUntil ?? 0) - (this.health.get(b.id)?.cooldownUntil ?? 0),
      ).slice(0, 1);
    }
    return ready;
  }

  private markFailure(p: ProviderConfig, err: unknown): string {
    const status = (err as { status?: number })?.status;
    const h = this.health.get(p.id) ?? { cooldownUntil: 0, failures: 0 };
    h.failures += 1;
    let cooldown = 15_000 * Math.min(h.failures, 4);
    let reason = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
    if (status === 429) {
      const retryAfter = Number((err as { headers?: Record<string, string> })?.headers?.["retry-after"]);
      cooldown = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000;
      reason = "rate limited";
    } else if (status === 401 || status === 403) {
      cooldown = 10 * 60_000;
      reason = "invalid API key";
    } else if (status === 402) {
      cooldown = 60 * 60_000;
      reason = "out of free credit";
    } else if (status === 404) {
      cooldown = 10 * 60_000;
      reason = `model not found (${p.models.strong} / ${p.models.fast})`;
    }
    h.cooldownUntil = Date.now() + cooldown;
    this.health.set(p.id, h);
    return reason;
  }

  private markSuccess(p: ProviderConfig) {
    this.health.set(p.id, { cooldownUntil: 0, failures: 0 });
  }

  async complete(opts: CompleteOptions): Promise<Completion> {
    const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    const key = TtlCache.key(opts.tier, opts.messages, !!opts.json, opts.maxTokens);
    if (ttl > 0) {
      const hit = this.cache.get(key);
      if (hit) return { ...hit, cached: true };
    }

    const attempts: { provider: string; reason: string }[] = [];
    for (let round = 0; round < 2; round++) {
    if (round === 1 && !(await this.waitForCapacity(opts.signal))) break;
    for (const p of this.available()) {
      if (opts.signal?.aborted) throw new Error("aborted");
      const model = p.models[opts.tier];
      try {
        const res = await this.client(p).chat.completions.create(
          {
            model,
            messages: opts.messages,
            max_tokens: opts.maxTokens ?? 1200,
            temperature: opts.temperature ?? 0.2,
            ...(opts.json && p.supportsJsonMode ? { response_format: { type: "json_object" as const } } : {}),
          },
          { signal: opts.signal },
        );
        const text = res.choices[0]?.message?.content?.trim() ?? "";
        if (!text) throw new Error("empty response");
        if (opts.json) parseJsonLoose(text); // throws if unusable → next provider
        this.markSuccess(p);
        const out: Completion = { text, provider: p.id, model, cached: false };
        if (ttl > 0) this.cache.set(key, out, ttl);
        return out;
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        attempts.push({ provider: p.label, reason: this.markFailure(p, err) });
      }
    }
    }
    throw new LlmUnavailableError(attempts);
  }

  /**
   * When every provider is briefly rate-limited, wait for the soonest one
   * (up to 12s) once, instead of failing a burst of requests outright.
   */
  private async waitForCapacity(signal?: AbortSignal): Promise<boolean> {
    if (this.providers.length === 0) return false;
    const soonest = Math.min(...this.providers.map((p) => this.health.get(p.id)?.cooldownUntil ?? 0));
    const wait = soonest - Date.now();
    if (wait > 12_000) return false;
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, wait);
        signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
      });
    }
    return !signal?.aborted;
  }

  async json<T>(opts: Omit<CompleteOptions, "json">, validate: (v: unknown) => T): Promise<Completion & { data: T }> {
    const c = await this.complete({ ...opts, json: true });
    return { ...c, data: validate(parseJsonLoose(c.text)) };
  }

  /**
   * Streams tokens. Fails over only before the first token arrives; after that
   * a broken stream surfaces as an error so the caller can say so honestly.
   */
  async *stream(opts: CompleteOptions): AsyncGenerator<{ token: string } | { done: Completion }> {
    const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    const key = TtlCache.key("stream", opts.tier, opts.messages, opts.maxTokens);
    if (ttl > 0) {
      const hit = this.cache.get(key);
      if (hit) {
        yield { token: hit.text };
        yield { done: { ...hit, cached: true } };
        return;
      }
    }
    const attempts: { provider: string; reason: string }[] = [];
    for (let round = 0; round < 2; round++) {
    if (round === 1 && !(await this.waitForCapacity(opts.signal))) break;
    for (const p of this.available()) {
      const model = p.models[opts.tier];
      let started = false;
      let text = "";
      try {
        const s = await this.client(p).chat.completions.create(
          {
            model,
            messages: opts.messages,
            max_tokens: opts.maxTokens ?? 1500,
            temperature: opts.temperature ?? 0.2,
            stream: true,
          },
          { signal: opts.signal },
        );
        for await (const chunk of s) {
          const t = chunk.choices[0]?.delta?.content ?? "";
          if (!t) continue;
          started = true;
          text += t;
          yield { token: t };
        }
        if (!text) throw new Error("empty response");
        this.markSuccess(p);
        const out: Completion = { text, provider: p.id, model, cached: false };
        if (ttl > 0) this.cache.set(key, out, ttl);
        yield { done: out };
        return;
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        const reason = this.markFailure(p, err);
        if (started) throw new Error(`${p.label} stopped mid-answer (${reason})`);
        attempts.push({ provider: p.label, reason });
      }
    }
    }
    throw new LlmUnavailableError(attempts);
  }
}

/** Accepts raw JSON, fenced JSON, or JSON embedded in prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("response was not valid JSON");
  }
}
