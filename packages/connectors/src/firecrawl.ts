import Firecrawl from "@mendable/firecrawl-js";
import type { ConnectorStatus } from "@cortex/shared";
import { compact } from "./extract";
import { ConnectorError, type Connector, type ConnectorContext, type RawEvidence, type SearchInput } from "./types";

/** The open web as a source: search results plus scraped pages, cited by URL. */
export class FirecrawlConnector implements Connector {
  readonly id = "web";
  readonly name = "Web";
  readonly kind = "firecrawl" as const;
  readonly describes = "the public web: docs, changelogs, news, status pages, any URL";
  readonly impact = "Outside context from the web (docs, news, status pages) is missing.";
  readonly actions = [];
  private readonly fc: Firecrawl;

  constructor(apiKey: string) {
    this.fc = new Firecrawl({ apiKey, timeoutMs: 15_000, maxRetries: 0 });
  }

  async status(): Promise<ConnectorStatus> {
    return { id: this.id, name: this.name, kind: this.kind, connected: true, available: true, canAct: false };
  }

  async search(input: SearchInput, _ctx: ConnectorContext): Promise<RawEvidence[]> {
    const url = input.query.match(/https?:\/\/\S+/)?.[0];
    if (url) {
      const doc = await this.fc.scrape(url, { formats: ["markdown"], onlyMainContent: true });
      const text = doc.markdown ?? "";
      return text
        ? [{ source: "web", title: doc.metadata?.title ?? url, quote: compact(text, 700), url }]
        : [];
    }
    const res = await this.fc.search(input.query, { limit: input.limit ?? 5 });
    return (res.web ?? []).flatMap((r) => {
      const item = r as { url?: string; title?: string; description?: string; markdown?: string; metadata?: { title?: string; sourceURL?: string } };
      const link = item.url ?? item.metadata?.sourceURL;
      const text = item.description ?? item.markdown;
      return link && text
        ? [{ source: "web", title: item.title ?? item.metadata?.title ?? link, quote: compact(text), url: link }]
        : [];
    });
  }

  async execute(): Promise<never> {
    throw new ConnectorError(this.id, "The web connector is read-only", false);
  }
}
