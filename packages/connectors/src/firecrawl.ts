import Firecrawl from "@mendable/firecrawl-js";
import type { ConnectorStatus } from "@cortex/shared";
import { compact } from "./extract";
import { ConnectorError, type Connector, type ConnectorContext, type RawEvidence, type SearchInput } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** DuckDuckGo's HTML results page: keyless. shortcut: scrapes markup, so a layout change returns nothing; Wikipedia then answers. */
export async function duckDuckGo(query: string, limit: number): Promise<RawEvidence[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(4_000) });
  if (!res.ok) throw new Error(`DuckDuckGo answered ${res.status}`);
  const html = await res.text();
  const out: RawEvidence[] = [];
  for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = m[1]!.replace(/&amp;/g, "&");
    const url = new URL(href, "https://duckduckgo.com").searchParams.get("uddg") ?? href; // results link through a redirect
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue; // ads
    out.push({ source: "web", title: compact(m[2]!, 160), quote: compact(m[3]!), url });
    if (out.length >= limit) break;
  }
  return out;
}

/** Wikipedia search: keyless, stable, and allowed from servers; narrower than a web search. */
export async function wikipedia(query: string, limit: number): Promise<RawEvidence[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": "Cortex/0.1 (web search fallback)" }, signal: AbortSignal.timeout(3_500) });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  const data = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  return (data.query?.search ?? []).map((r) => ({
    source: "web",
    title: `${r.title} - Wikipedia`,
    quote: compact(r.snippet),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
  }));
}

/**
 * The open web as a source: search results plus scraped pages, cited by URL. Firecrawl when a key is set, then
 * DuckDuckGo and Wikipedia (both keyless), so the web still answers when Firecrawl's credits or service run out.
 */
export class FirecrawlConnector implements Connector {
  readonly id = "web";
  readonly name = "Web";
  readonly kind = "firecrawl" as const;
  readonly describes = "the public web: docs, changelogs, news, status pages, any URL";
  readonly impact = "Outside context from the web (docs, news, status pages) is missing.";
  readonly actions = [];
  private readonly fc: Firecrawl | null;

  constructor(apiKey?: string) {
    // maxRetries is the SDK's number of attempts: 0 makes every call throw "Unexpected HTTP client error" unsent.
    this.fc = apiKey ? new Firecrawl({ apiKey, timeoutMs: 4_000, maxRetries: 1 }) : null;
  }

  async status(): Promise<ConnectorStatus> {
    return { id: this.id, name: this.name, kind: this.kind, connected: true, available: true, canAct: false };
  }

  async search(input: SearchInput, _ctx: ConnectorContext): Promise<RawEvidence[]> {
    const limit = input.limit ?? 5;
    const url = input.query.match(/https?:\/\/\S+/)?.[0];
    // Pages are read only through Firecrawl: fetching a user-given URL from this server would let it reach internal hosts.
    if (url && this.fc) {
      const doc = await this.fc.scrape(url, { formats: ["markdown"], onlyMainContent: true });
      const text = doc.markdown ?? "";
      return text ? [{ source: "web", title: doc.metadata?.title ?? url, quote: compact(text, 700), url }] : [];
    }
    const providers = [
      ...(this.fc ? [() => this.firecrawlSearch(input.query, limit)] : []),
      () => duckDuckGo(input.query, limit),
      () => wikipedia(input.query, limit),
    ];
    let lastErr: unknown;
    for (const run of providers) {
      try {
        const items = await run();
        if (items.length) return items;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  private async firecrawlSearch(query: string, limit: number): Promise<RawEvidence[]> {
    const res = await this.fc!.search(query, { limit });
    return (res.web ?? []).flatMap((r) => {
      const item = r as { url?: string; title?: string; description?: string; markdown?: string; metadata?: { title?: string; sourceURL?: string } };
      const link = item.url ?? item.metadata?.sourceURL;
      const text = item.description ?? item.markdown;
      return link && text ? [{ source: "web", title: item.title ?? item.metadata?.title ?? link, quote: compact(text), url: link }] : [];
    });
  }

  async execute(): Promise<never> {
    throw new ConnectorError(this.id, "The web connector is read-only", false);
  }
}
