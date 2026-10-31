import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ConnectorStatus } from "@cortex/shared";
import { extractEvidence } from "../extract";
import { ConnectorError, type Connector, type ConnectorContext, type SearchInput } from "../types";
import type { ComposioToolkitSpec } from "./toolkits";

const ENDPOINT = "https://connect.composio.dev/mcp";
const STATUS_TTL_MS = 2_000; // short so a finished sign-in shows up while the Connections page polls (one list call for all users)
const PREFETCHED_MS = 60_000; // connect() may reuse the list the Connections page already loaded (manage() clears it on every change)

/** One connected account in the Composio Connect project. */
export interface ComposioAccount {
  id: string;
  alias?: string;
  status: string;
}

/**
 * A ck_ key opens one Composio Connect account, so every Cortex user's connections live in it side by side. Each is
 * tagged with this alias when the user connects, and Cortex only ever lists, uses or replaces the ones carrying the
 * user's own alias. Composio rejects an `account` that doesn't match ("No account found"), never falling back to another.
 */
export const aliasFor = (userId: string) => `cortex-${userId}`;

/** The user's own account for one toolkit: an active one if any, else the latest other (to report "expired"). */
export function ownAccount(accounts: ComposioAccount[], userId: string): ComposioAccount | undefined {
  const mine = accounts.filter((a) => a.alias === aliasFor(userId));
  return mine.find((a) => a.status === "ACTIVE") ?? mine[0];
}

/** One MCP session to Composio's consumer endpoint (ck_ keys), shared by all toolkits and users. */
class ComposioMcpSession {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private statusCache: { at: number; accounts: Map<string, ComposioAccount[]> } | null = null;
  private statusPending: Promise<Map<string, ComposioAccount[]>> | null = null;

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

  /** Every account per toolkit slug (all users), from one cached list call; callers keep only their own. */
  async accounts(toolkits: string[], maxAgeMs = STATUS_TTL_MS): Promise<Map<string, ComposioAccount[]>> {
    if (this.statusCache && Date.now() - this.statusCache.at < maxAgeMs) return this.statusCache.accounts;
    this.statusPending ??= (async () => {
      const data = await this.call("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: toolkits.map((name) => ({ name, action: "list" })) });
      const results = (data.results ?? {}) as Record<string, { accounts?: { id?: string; alias?: string; status?: string }[] }>;
      const accounts = new Map<string, ComposioAccount[]>();
      for (const [k, r] of Object.entries(results)) {
        accounts.set(
          k.toLowerCase(),
          (r.accounts ?? []).filter((a) => a.id).map((a) => ({ id: a.id!, alias: a.alias || undefined, status: String(a.status).toUpperCase() })),
        );
      }
      this.statusCache = { at: Date.now(), accounts };
      return accounts;
    })().finally(() => (this.statusPending = null));
    return this.statusPending;
  }

  async manage(toolkit: string, op: Record<string, unknown>) {
    const data = await this.call("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [{ name: toolkit, ...op }] });
    this.invalidate();
    return ((data.results ?? {}) as Record<string, { status?: string; redirect_url?: string; error?: string; instruction?: string }>)[toolkit];
  }

  invalidate() {
    this.statusCache = null;
  }

  /** Runs one tool as exactly `account`; there is no call without one, so nothing ever runs as a default account. */
  async execute(slug: string, args: Record<string, unknown>, account: string) {
    const data = await this.call("COMPOSIO_MULTI_EXECUTE_TOOL", {
      tools: [{ tool_slug: slug, arguments: args, account }],
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

  private async mine(userId: string) {
    return ownAccount((await this.session.accounts(ALL_TOOLKITS)).get(this.spec.toolkit) ?? [], userId);
  }

  /** The user's own active account id; anything else stops here, before Composio is asked to act. */
  private async accountFor(userId: string) {
    const acc = await this.mine(userId);
    if (acc?.status !== "ACTIVE") throw new ConnectorError(this.id, `${this.name} isn't connected for you; connect it on the Connections page`, false);
    return acc.id;
  }

  async status(ctx: ConnectorContext): Promise<ConnectorStatus> {
    const state = (await this.mine(ctx.userId))?.status;
    const lapsed = !!state && !["ACTIVE", "INITIATED", "INITIALIZING"].includes(state);
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      connected: state === "ACTIVE",
      available: true,
      canAct: this.actions.length > 0,
      // A sign-in that lapsed (EXPIRED, FAILED, INACTIVE…) is reported, so Ask and Connections can say "reconnect".
      detail: lapsed ? "its sign-in expired; reconnect it on the Connections page" : undefined,
      reconnect: lapsed || undefined,
    };
  }

  async connect(ctx: ConnectorContext & { callbackUrl: string }) {
    // One account per user and app: drop this user's earlier one (expired or never finished) so the alias is free again.
    // The prefetched list saves a ~0.6 s round trip per click; an account already gone just fails its remove harmlessly.
    const all = (await this.session.accounts(ALL_TOOLKITS, PREFETCHED_MS)).get(this.spec.toolkit) ?? [];
    await Promise.all(
      all.filter((a) => a.alias === aliasFor(ctx.userId)).map((a) => this.session.manage(this.spec.toolkit, { action: "remove", account_id: a.id }).catch(() => null)),
    );
    const r = await this.session.manage(this.spec.toolkit, { action: "add", alias: aliasFor(ctx.userId) });
    const url = r?.redirect_url?.match(/https?:\/\/\S+?(?=[\s)\]]|$)/)?.[0];
    if (!url) {
      // Composio's Connect project holds at most 10 accounts per app (measured October 2026).
      const full = r?.status === "failed" && all.length >= 10;
      throw new ConnectorError(this.id, full ? `Cortex has no room for another ${this.name} account right now` : "Composio did not return a sign-in link", false);
    }
    return { redirectUrl: url };
  }

  /** Removes only this user's own accounts for this app, from a fresh list. */
  async disconnect(ctx: ConnectorContext) {
    this.session.invalidate();
    const own = ((await this.session.accounts(ALL_TOOLKITS)).get(this.spec.toolkit) ?? []).filter((a) => a.alias === aliasFor(ctx.userId));
    await Promise.all(own.map((a) => this.session.manage(this.spec.toolkit, { action: "remove", account_id: a.id })));
  }

  async search(input: SearchInput, ctx: ConnectorContext) {
    const args = Object.fromEntries(Object.entries(this.spec.search.toArgs(input)).filter(([, v]) => v !== undefined && v !== ""));
    const data = await this.session.execute(this.spec.search.slug, args, await this.accountFor(ctx.userId));
    // No spec.detail stage here: the hosted MCP cuts every string to ~200 characters, so a full-message
    // fetch returns the same snippet. The SDK connector (project keys) fetches full bodies.
    return extractEvidence(this.id, data, input.limit ?? 8);
  }

  async execute(actionId: string, args: Record<string, unknown>, ctx: ConnectorContext) {
    const action = this.spec.actions.find((a) => a.id === actionId);
    if (!action) throw new ConnectorError(this.id, `Unknown action ${actionId}`, false);
    const clean = Object.fromEntries(Object.entries(action.toArgs(args)).filter(([, v]) => v !== undefined && v !== ""));
    const data = await this.session.execute(action.slug, clean, await this.accountFor(ctx.userId));
    const url = extractEvidence(this.id, data, 1)[0]?.url;
    return { ok: true, message: `${action.title} done in ${this.name}.`, url };
  }
}

/**
 * Gives the key owner's own accounts (connected straight in Composio, so without a Cortex alias) to the owner's Cortex
 * user, once. Called only for the owner (CORTEX_OWNER_EMAILS); nobody else can ever be handed an untagged account.
 */
export async function claimUntaggedAccounts(key: string, userId: string) {
  if (!sessions.has(key)) sessions.set(key, new ComposioMcpSession(key));
  const session = sessions.get(key)!;
  for (const [toolkit, accounts] of await session.accounts(ALL_TOOLKITS)) {
    const own = accounts.some((a) => a.alias === aliasFor(userId));
    // Only the first untagged account per app, and never if the owner already has one: aliases are unique per app.
    const untagged = accounts.find((a) => !a.alias);
    if (untagged && !own) await session.manage(toolkit, { action: "rename", account_id: untagged.id, alias: aliasFor(userId) });
  }
}
