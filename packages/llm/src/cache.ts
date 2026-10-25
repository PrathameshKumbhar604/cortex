import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small LRU cache with TTL and optional JSON persistence, so identical prompts
 * across dev restarts don't spend free-tier quota twice.
 */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly maxEntries = 500,
    private readonly persistPath?: string,
  ) {
    if (persistPath) this.load();
  }

  static key(...parts: unknown[]): string {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  }

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    this.scheduleFlush();
  }

  private load() {
    try {
      const raw = JSON.parse(readFileSync(this.persistPath!, "utf8")) as [string, Entry<T>][];
      const now = Date.now();
      for (const [k, e] of raw) if (e.expiresAt > now) this.map.set(k, e);
    } catch {
      // no cache yet
    }
  }

  private scheduleFlush() {
    if (!this.persistPath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try {
        mkdirSync(dirname(this.persistPath!), { recursive: true });
        writeFileSync(this.persistPath!, JSON.stringify([...this.map.entries()]));
      } catch {
        // persistence is best-effort
      }
    }, 1000);
  }
}
