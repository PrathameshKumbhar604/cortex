import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ConnectorStatus } from "@cortex/shared";
import { extractEvidence, textEvidence } from "./extract";
import { ConnectorError, type ActionDef, type Connector, type ConnectorContext, type SearchInput } from "./types";

/**
 * Config for any MCP server. Add one to `mcp.config.json` at the repo root and
 * it shows up in Cortex. No code changes needed.
 */
export interface McpServerConfig {
  id: string;
  name: string;
  describes: string;
  impact?: string;
  transport: { type: "http"; url: string; headers?: Record<string, string> } | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> };
  /** Tool used for retrieval; it receives `{ [queryArg]: query }`. */
  searchTool: string;
  queryArg?: string;
  /** Tools exposed as consent-gated actions. */
  actions?: { tool: string; title: string; risk?: "low" | "high" }[];
}

export class McpConnector implements Connector {
  readonly kind = "mcp" as const;
  readonly id;
  readonly name;
  readonly describes;
  readonly impact;
  readonly actions: ActionDef[];
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly cfg: McpServerConfig) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.describes = cfg.describes;
    this.impact = cfg.impact ?? `Results from ${cfg.name} are missing.`;
    this.actions = (cfg.actions ?? []).map((a) => ({
      id: a.tool,
      title: a.title,
      description: `${a.title} via ${cfg.name}`,
      risk: a.risk ?? "high",
      params: [],
      preview: (args) => JSON.stringify(args, null, 2),
    }));
  }

  private async conn(): Promise<Client> {
    if (this.client) return this.client;
    this.connecting ??= (async () => {
      const c = new Client({ name: "cortex", version: "0.1.0" });
      const t = this.cfg.transport;
      const transport =
        t.type === "http"
          ? new StreamableHTTPClientTransport(new URL(t.url), { requestInit: { headers: t.headers } })
          : new StdioClientTransport({ command: t.command, args: t.args, env: t.env });
      await c.connect(transport);
      this.client = c;
      return c;
    })().finally(() => (this.connecting = null));
    return this.connecting;
  }

  async status(): Promise<ConnectorStatus> {
    try {
      await this.conn();
      return { id: this.id, name: this.name, kind: this.kind, connected: true, available: true, canAct: this.actions.length > 0 };
    } catch (err) {
      this.client = null;
      return {
        id: this.id,
        name: this.name,
        kind: this.kind,
        connected: false,
        available: true,
        canAct: false,
        detail: err instanceof Error ? err.message : "unreachable",
      };
    }
  }

  private async call(tool: string, args: Record<string, unknown>) {
    const c = await this.conn();
    const res = await c.callTool({ name: tool, arguments: args });
    const content = (res.content ?? []) as { type: string; text?: string }[];
    const text = content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
    if (res.isError) throw new ConnectorError(this.id, text || `${tool} failed`);
    return { text, structured: res.structuredContent };
  }

  async search(input: SearchInput, _ctx: ConnectorContext) {
    const { text, structured } = await this.call(this.cfg.searchTool, { [this.cfg.queryArg ?? "query"]: input.query });
    if (structured) {
      const items = extractEvidence(this.id, structured, input.limit ?? 8);
      if (items.length) return items;
    }
    try {
      const items = extractEvidence(this.id, JSON.parse(text), input.limit ?? 8);
      if (items.length) return items;
    } catch {
      // plain text result
    }
    return textEvidence(this.id, `${this.name}: ${input.query}`, text);
  }

  async execute(actionId: string, args: Record<string, unknown>) {
    const { text } = await this.call(actionId, args);
    return { ok: true, message: text.slice(0, 300) || "Done." };
  }
}
