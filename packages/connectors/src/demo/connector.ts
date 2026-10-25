import type { ConnectorStatus, SourceId } from "@cortex/shared";
import type { ComposioToolkitSpec } from "../composio/toolkits";
import type { Connector, ConnectorContext, RawEvidence, SearchInput } from "../types";
import { DEMO_ITEMS, dateAt } from "./data";

const STOP = new Set(
  "a an the and or of to in on for with at by from is are was were be been what which who whom when where why how did do does this that these those my our your me i we you it its any all about since last week month quarter today yesterday changed change happen happened status update".split(" "),
);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ing|ed|es|s)$/, ""));
}

export interface DemoOutboxEntry {
  at: string;
  source: SourceId;
  actionId: string;
  args: Record<string, unknown>;
}

/** Shared across demo connectors so the UI can show what "would" have been sent. */
export const demoOutbox: DemoOutboxEntry[] = [];

/** Sample-data connector. Same interface and actions as the live Composio one. */
export class DemoConnector implements Connector {
  readonly kind = "demo" as const;
  readonly id;
  readonly name;
  readonly describes;
  readonly impact;
  readonly actions;

  constructor(spec: Pick<ComposioToolkitSpec, "id" | "name" | "describes" | "impact" | "actions">) {
    this.id = spec.id;
    this.name = spec.name;
    this.describes = spec.describes;
    this.impact = spec.impact;
    this.actions = spec.actions;
  }

  async status(_ctx: ConnectorContext): Promise<ConnectorStatus> {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      connected: true,
      available: true,
      canAct: this.actions.length > 0,
      detail: "Sample workspace",
    };
  }

  async search(input: SearchInput): Promise<RawEvidence[]> {
    const since = input.since ? new Date(input.since).getTime() : -Infinity;
    const until = input.until ? new Date(input.until).getTime() : Infinity;
    const q = tokens(input.query);
    const pool = DEMO_ITEMS.filter((i) => i.source === this.id).map((i) => {
      const at = dateAt(i.offset).getTime();
      const hay = tokens(`${i.title} ${i.body} ${i.author ?? ""}`);
      const score = q.reduce((n, t) => n + (hay.some((h) => h.startsWith(t) || t.startsWith(h)) ? 1 : 0), 0);
      return { i, at, score };
    });
    const inWindow = pool.filter((p) => p.at >= since && p.at <= until);
    let hits = inWindow.filter((p) => p.score > 0).sort((a, b) => b.score - a.score || b.at - a.at);
    // Broad "what changed" questions have few keyword hits; fall back to recency within the window.
    if (hits.length === 0 && (input.since || q.length === 0)) hits = [...inWindow].sort((a, b) => b.at - a.at);
    return hits.slice(0, input.limit ?? 6).map(({ i, at }) => ({
      source: i.source,
      title: i.title,
      quote: i.body,
      author: i.author,
      timestamp: new Date(at).toISOString(),
      url: i.url,
    }));
  }

  async execute(actionId: string, args: Record<string, unknown>) {
    const action = this.actions.find((a) => a.id === actionId);
    demoOutbox.unshift({ at: new Date().toISOString(), source: this.id, actionId, args });
    return {
      ok: true,
      message: `${action?.title ?? actionId} completed in the sample workspace. Nothing was sent outside Cortex.`,
    };
  }
}
