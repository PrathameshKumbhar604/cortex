import { Composio } from "@composio/core";
import type { ConnectorStatus } from "@cortex/shared";
import { extractEvidence } from "../extract";
import { ConnectorError, type Connector, type ConnectorContext, type SearchInput } from "../types";
import type { ComposioToolkitSpec } from "./toolkits";

let shared: Composio | null = null;
function client(apiKey: string): Composio {
  shared ??= new Composio({ apiKey });
  return shared;
}

/** One class serves every Composio toolkit; behaviour comes from the spec. */
export class ComposioConnector implements Connector {
  readonly kind = "composio" as const;
  readonly id;
  readonly name;
  readonly describes;
  readonly impact;
  readonly actions;

  constructor(
    private readonly spec: ComposioToolkitSpec,
    private readonly apiKey: string,
  ) {
    this.id = spec.id;
    this.name = spec.name;
    this.describes = spec.describes;
    this.impact = spec.impact;
    this.actions = spec.actions;
  }

  async status(ctx: ConnectorContext): Promise<ConnectorStatus> {
    const res = await client(this.apiKey).connectedAccounts.list({
      userIds: [ctx.userId],
      toolkitSlugs: [this.spec.toolkit],
      statuses: ["ACTIVE"],
    });
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      connected: res.items.length > 0,
      available: true,
      canAct: this.actions.length > 0,
    };
  }

  async connect(ctx: ConnectorContext & { callbackUrl: string }) {
    const req = await client(this.apiKey).toolkits.authorize(ctx.userId, this.spec.toolkit);
    if (!req.redirectUrl) throw new ConnectorError(this.id, "Composio did not return an OAuth URL", false);
    return { redirectUrl: req.redirectUrl };
  }

  private async run(slug: string, args: Record<string, unknown>, ctx: ConnectorContext) {
    const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== ""));
    const res = await client(this.apiKey).tools.execute(
      slug,
      { userId: ctx.userId, arguments: clean, dangerouslySkipVersionCheck: true },
      { signal: ctx.signal },
    );
    if (!res.successful) throw new ConnectorError(this.id, res.error ?? `${slug} failed`);
    return res.data;
  }

  async search(input: SearchInput, ctx: ConnectorContext) {
    const data = await this.run(this.spec.search.slug, this.spec.search.toArgs(input), ctx);
    return extractEvidence(this.id, data, input.limit ?? 8);
  }

  async execute(actionId: string, args: Record<string, unknown>, ctx: ConnectorContext) {
    const action = this.spec.actions.find((a) => a.id === actionId);
    if (!action) throw new ConnectorError(this.id, `Unknown action ${actionId}`, false);
    const data = await this.run(action.slug, action.toArgs(args), ctx);
    const url = extractEvidence(this.id, data, 1)[0]?.url;
    return { ok: true, message: `${action.title} done in ${this.name}.`, url };
  }
}
