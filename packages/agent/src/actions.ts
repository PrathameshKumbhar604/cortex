import { randomUUID } from "node:crypto";
import type { ActionProposal } from "@cortex/shared";
import { describeError, type ConnectorRegistry } from "@cortex/connectors";

interface Stored {
  userId: string;
  proposal: ActionProposal;
  createdAt: number;
}

const TTL_MS = 30 * 60_000;

/**
 * Pending actions live server-side. The model can only *propose*; execution
 * requires an explicit approve call carrying the proposal id, once.
 */
export class ActionStore {
  private readonly items = new Map<string, Stored>();

  propose(
    userId: string,
    registry: ConnectorRegistry,
    raw: unknown,
  ): ActionProposal | { error: string } {
    const r = raw as { connector?: string; action?: string; title?: string; args?: Record<string, unknown> };
    const connector = r?.connector ? registry.get(r.connector) : undefined;
    if (!connector) return { error: `unknown connector ${r?.connector}` };
    const def = connector.actions.find((a) => a.id === r.action);
    if (!def) return { error: `${connector.name} cannot ${r.action}` };
    const args = r.args ?? {};
    const missing = def.params.filter((p) => p.required && (args[p.name] === undefined || args[p.name] === ""));
    if (missing.length) return { error: `missing ${missing.map((m) => m.name).join(", ")}` };

    this.gc();
    const proposal: ActionProposal = {
      id: randomUUID(),
      connectorId: connector.id,
      actionId: def.id,
      title: r.title?.slice(0, 80) || `${def.title} in ${connector.name}`,
      summary: def.preview(args),
      args,
      risk: def.risk,
      status: "pending",
    };
    this.items.set(proposal.id, { userId, proposal, createdAt: Date.now() });
    return proposal;
  }

  get(userId: string, id: string): ActionProposal | undefined {
    const s = this.items.get(id);
    return s && s.userId === userId ? s.proposal : undefined;
  }

  async decide(
    userId: string,
    id: string,
    decision: "approve" | "reject",
    registry: ConnectorRegistry,
    edits?: Record<string, unknown>,
  ): Promise<ActionProposal> {
    const s = this.items.get(id);
    if (!s || s.userId !== userId) throw new Error("This action expired. Ask again to get a fresh confirmation.");
    const p = s.proposal;
    if (p.status !== "pending") throw new Error(`This action was already ${p.status}.`);
    if (decision === "reject") {
      p.status = "rejected";
      return p;
    }
    const connector = registry.get(p.connectorId);
    if (!connector) {
      p.status = "failed";
      p.result = "That connector is no longer available.";
      return p;
    }
    p.status = "approved";
    const args = edits ? { ...p.args, ...edits } : p.args;
    try {
      const res = await connector.execute(p.actionId, args, { userId });
      p.status = res.ok ? "executed" : "failed";
      p.result = res.message + (res.url ? ` ${res.url}` : "");
    } catch (err) {
      p.status = "failed";
      p.result = `${connector.name} didn't accept it: ${describeError(err)}.`;
    }
    return p;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.items) if (now - v.createdAt > TTL_MS) this.items.delete(k);
  }
}
