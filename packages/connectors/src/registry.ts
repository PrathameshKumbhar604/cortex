import { TtlCache } from "@cortex/llm";
import type { ConnectorStatus, SourceFailure, SourceId } from "@cortex/shared";
import { ConnectorError, type Connector, type ConnectorContext, type RawEvidence, type SearchInput } from "./types";

const SEARCH_TIMEOUT_MS = 12_000;
const SEARCH_CACHE_TTL_MS = 90_000;

export type SafeSearchResult =
  | { ok: true; items: RawEvidence[]; cached: boolean; ms: number }
  | { ok: false; failure: SourceFailure; ms: number };

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|403|unauthori[sz]ed|forbidden|expired|invalid_grant|no (active )?connect/i.test(msg)) return "its sign-in expired; reconnect it on the Connections page";
  if (/429|rate/i.test(msg)) return "it is rate-limiting requests";
  if (/timed out|timeout|ETIMEDOUT/i.test(msg)) return "it did not respond in time";
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(msg)) return "it could not be reached";
  return msg.slice(0, 140);
}

/**
 * Holds every connector. Search is wrapped with a timeout, one retry for
 * transient failures, and a short cache so repeated sub-questions don't refetch.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();
  private readonly cache = new TtlCache<RawEvidence[]>(300);

  register(connector: Connector): this {
    this.connectors.set(connector.id, connector);
    return this;
  }

  get(id: SourceId): Connector | undefined {
    return this.connectors.get(id);
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }

  async statuses(ctx: ConnectorContext): Promise<ConnectorStatus[]> {
    return Promise.all(
      this.list().map(async (c) => {
        try {
          return await withTimeout(c.status(ctx), 6000, c.name);
        } catch (err) {
          console.warn(`[connectors] status of ${c.id} failed:`, describeError(err)); // the user isn't told: they may never have set it up
          return {
            id: c.id,
            name: c.name,
            kind: c.kind,
            connected: false,
            available: true,
            canAct: c.actions.length > 0,
            detail: describeError(err),
          };
        }
      }),
    );
  }

  /** Connectors the user can search right now. */
  async connected(ctx: ConnectorContext): Promise<Connector[]> {
    const st = await this.statuses(ctx);
    const ok = new Set(st.filter((s) => s.connected).map((s) => s.id));
    return this.list().filter((c) => ok.has(c.id));
  }

  async safeSearch(id: SourceId, input: SearchInput, ctx: ConnectorContext): Promise<SafeSearchResult> {
    const started = Date.now();
    const c = this.connectors.get(id);
    if (!c) {
      return {
        ok: false,
        ms: 0,
        failure: { source: id, name: id, reason: "it is not installed", impact: "This source was skipped." },
      };
    }
    const key = TtlCache.key(ctx.userId, id, input);
    const hit = this.cache.get(key);
    if (hit) return { ok: true, items: hit, cached: true, ms: 0 };

    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const items = await withTimeout(c.search(input, ctx), SEARCH_TIMEOUT_MS, c.name);
        this.cache.set(key, items, SEARCH_CACHE_TTL_MS);
        return { ok: true, items, cached: false, ms: Date.now() - started };
      } catch (err) {
        lastErr = err;
        const retryable = !(err instanceof ConnectorError) || err.retryable;
        if (!retryable || ctx.signal?.aborted) break;
      }
    }
    return {
      ok: false,
      ms: Date.now() - started,
      failure: { source: id, name: c.name, reason: describeError(lastErr), impact: c.impact },
    };
  }
}
