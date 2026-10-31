import type { ActionRisk, ConnectorKind, ConnectorStatus, Evidence, SourceId } from "@cortex/shared";

export interface SearchInput {
  query: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface ConnectorContext {
  userId: string;
  signal?: AbortSignal;
}

/** Evidence before the agent assigns run-scoped ids. */
export type RawEvidence = Omit<Evidence, "id" | "subQuestionId">;

export interface ActionParam {
  name: string;
  type: "string" | "string[]" | "number" | "boolean";
  description: string;
  required?: boolean;
}

export interface ActionDef {
  id: string; // "send_email"
  title: string; // "Send email"
  description: string; // shown to the planner
  risk: ActionRisk;
  params: ActionParam[];
  /** Exact, human-readable preview shown on the confirmation card. */
  preview(args: Record<string, unknown>): string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  url?: string;
}

/**
 * Every data source implements this. Adding a connector = implementing this
 * interface and registering it; the agent never knows which backend it talks to.
 */
export interface Connector {
  id: SourceId;
  name: string;
  kind: ConnectorKind;
  /** One line telling the planner what lives in this source. */
  describes: string;
  /** Why losing this source matters, used in "X is down" messages. */
  impact: string;
  actions: ActionDef[];
  status(ctx: ConnectorContext): Promise<ConnectorStatus>;
  search(input: SearchInput, ctx: ConnectorContext): Promise<RawEvidence[]>;
  execute(actionId: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<ActionResult>;
  /** Starts OAuth; returns the URL the browser should open. */
  connect?(ctx: ConnectorContext & { callbackUrl: string }): Promise<{ redirectUrl: string }>;
  /** Removes this user's own connection to the app (never anyone else's). */
  disconnect?(ctx: ConnectorContext): Promise<void>;
}

export class ConnectorError extends Error {
  constructor(
    public readonly connectorId: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
  }
}
