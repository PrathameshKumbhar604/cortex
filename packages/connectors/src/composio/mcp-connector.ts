import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ConnectorStatus } from "@cortex/shared";
import { extractEvidence } from "../extract";
import { ConnectorError, type Connector, type ConnectorContext, type SearchInput } from "../types";
import type { ComposioToolkitSpec } from "./toolkits";

const ENDPOINT = "https://connect.composio.dev/mcp";
const STATUS_TTL_MS = 5_000; // short so a finished sign-in shows up while the Connections page polls

/**
 * One MCP session to Composio's consumer endpoint (ck_ keys), shared by all
 * six toolkits. Connections belong to the key owner's Composio account, so
 * this mode suits a personal deployment of Cortex.
 */
class ComposioMcpSession {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private statusCache: { at: number; states: Map<string, string> } | null = null;
  private statusPending: Promise<Map<string, string>> | null = null;

  constructor(private readonly key: string) {}

  private async conn(): Promise<Client> {
    if (this.client) return this.client;
    this.connecting ??= (async () => {
      const c = new Client({ name: "cortex", version: "0.1.0" });
      await c.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), { requestInit: { headers: { "x-consumer-api-key": this.key } } }));
      this.client = c;
      return c;
    })().finally(() => (this.connecting = null));
    return this.connecting;
  }

  async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res;
    try {
      res = await (await this.conn()).callTool({ name, arguments: args });
    } catch (err) {
      this.client = null; // reconnect next time
      throw err;
    }
    const text = ((res.content ?? []) as { type: string; text?: string }[]).map((p) => p.text ?? "").join("\n");
    let body: { successful?: boolean; data?: Record<string, unknown>; error?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ConnectorError("composio", text.slice(0, 200) || `${name} returned nothing`);
    }
    if (res.isError || body.successful === false) throw new ConnectorError("composio", String(body.error ?? text).slice(0, 200));
    return body.data ?? {};
  }

  /** Account state per toolkit slug ("ACTIVE" when any account is, else e.g. "EXPIRED"), from one cached list call. */
  async states(toolkits: string[]): Promise<Map<string, string>> {
    if (this.statusCache && Date.now() - this.statusCache.at < STATUS_TTL_MS) return this.statusCache.states;
    this.statusPending ??= (async () => {
      const data = await this.call("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: toolkits.map((name) => ({ name, action: "list" })) });
      const results = (data.results ?? {}) as Record<string, { accounts?: { status?: string }[] }>;
      const states = new Map<string, string>();
      for (const [k, r] of Object.entries(results)) {
        const all = (r.accounts ?? []).map((a) => String(a.status).toUpperCase());
        if (all.length) states.set(k.toLowerCase(), all.includes("ACTIVE") ? "ACTIVE" : all[0]!);
      }
      this.statusCache = { at: Date.now(), states };
      return states;
    })().finally(() => (this.statusPending = null));
    return this.statusPending;
  }

  invalidate() {
    this.statusCache = null;
  }

  async execute(slug: string, args: Record<string, unknown>) {
    const data = await this.call("COMPOSIO_MULTI_EXECUTE_TOOL", {
      tools: [{ tool_slug: slug, arguments: args }],
      thought: `Cortex: ${slug}`,
      sync_response_to_workbench: false,
    });
    const results = (data.results ?? []) as {
      response?: { successful?: boolean; data?: unknown; data_preview?: unknown; error?: unknown };
      error?: unknown;
    }[];
    const first = results[0];
    const err = first?.error ?? (first?.response?.successful === false ? first.response.error : null);
    if (err) throw new ConnectorError("composio", String(err).slice(0, 200));
    // Large results come back as a truncated `data_preview`; never fall back to the envelope,
    // which also holds Composio's structure metadata and would be mistaken for records.
    return first?.response?.data ?? first?.response?.data_preview ?? {};
  }
}

const sessions = new Map<string, ComposioMcpSession>();
const ALL_TOOLKITS = ["gmail", "googlecalendar", "googledrive", "notion", "slack", "github"];

export class ComposioMcpConnector implements Connector {
  readonly kind = "composio" as const;
  readonly id;
  readonly name;
  readonly describes;
  readonly impact;
  readonly actions;
  private readonly session: ComposioMcpSession;

  constructor(
    private readonly spec: ComposioToolkitSpec,
    key: string,
  ) {
    this.id = spec.id;
    this.name = spec.name;
    this.describes = spec.describes;
    this.impact = spec.impact;
    this.actions = spec.actions;
    if (!sessions.has(key)) sessions.set(key, new ComposioMcpSession(key));
    this.session = sessions.get(key)!;
  }

  async status(_ctx: ConnectorContext): Promise<ConnectorStatus> {
    const state = (await this.session.states(ALL_TOOLKITS)).get(this.spec.toolkit);
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      connected: state === "ACTIVE",
      available: true,
      canAct: this.actions.length > 0,
      // A sign-in that lapsed (EXPIRED, FAILED, INACTIVE…) is reported, so Ask and Connections can say "reconnect".
      detail: state && state !== "ACTIVE" && state !== "INITIATED" ? "its sign-in expired; reconnect it on the Connections page" : undefined,
    };
  }

  async connect(_ctx: ConnectorContext & { callbackUrl: string }) {
    const data = await this.session.call("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: this.spec.toolkit, action: "add" }] });
    this.session.invalidate();
    const r = ((data.results ?? {}) as Record<string, { redirect_url?: string }>)[this.spec.toolkit];
    const url = r?.redirect_url?.match(/https?:\/\/\S+?(?=[\s)\]]|$)/)?.[0];
    if (!url) throw new ConnectorError(this.id, "Composio did not return a sign-in link", false);
    return { redirectUrl: url };
  }

  async search(input: SearchInput, _ctx: ConnectorContext) {
    const args = Object.fromEntries(Object.entries(this.spec.search.toArgs(input)).filter(([, v]) => v !== undefined && v !== ""));
    const data = await this.session.execute(this.spec.search.slug, args);
    // No spec.detail stage here: the hosted MCP cuts every string to ~200 characters, so a full-message
    // fetch returns the same snippet. The SDK connector (project keys) fetches full bodies.
    return extractEvidence(this.id, data, input.limit ?? 8);
  }

  async execute(actionId: string, args: Record<string, unknown>, _ctx: ConnectorContext) {
    const action = this.spec.actions.find((a) => a.id === actionId);
    if (!action) throw new ConnectorError(this.id, `Unknown action ${actionId}`, false);
    const clean = Object.fromEntries(Object.entries(action.toArgs(args)).filter(([, v]) => v !== undefined && v !== ""));
    const data = await this.session.execute(action.slug, clean);
    const url = extractEvidence(this.id, data, 1)[0]?.url;
    return { ok: true, message: `${action.title} done in ${this.name}.`, url };
  }
}
