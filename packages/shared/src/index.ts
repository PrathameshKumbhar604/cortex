export type SourceId =
  | "gmail"
  | "calendar"
  | "drive"
  | "notion"
  | "slack"
  | "github"
  | "web"
  | (string & {});

export type RunMode = "fast" | "deep";

export interface TimeWindow {
  since?: string; // ISO date
  until?: string; // ISO date
  label?: string; // "this quarter", "last 7 days"
}

export interface Evidence {
  id: string; // stable within a run, e.g. "e3"
  source: SourceId;
  title: string;
  quote: string;
  url?: string;
  author?: string;
  timestamp?: string; // ISO
  subQuestionId?: string;
}

export interface SubQuestion {
  id: string;
  question: string;
  sources: SourceId[];
  query: string;
}

export interface Plan {
  intent: "research" | "action" | "chat";
  rewritten: string;
  window?: TimeWindow;
  subQuestions: SubQuestion[];
}

export type ClaimStatus = "supported" | "partial" | "unsupported";

export interface Claim {
  text: string;
  evidenceIds: string[];
  status: ClaimStatus;
}

export interface Conflict {
  summary: string;
  evidenceIds: string[];
}

export type ActionRisk = "low" | "high";

export interface ActionProposal {
  id: string;
  connectorId: SourceId;
  actionId: string;
  title: string; // "Send email to advisor"
  summary: string; // human-readable preview of exactly what happens
  args: Record<string, unknown>;
  risk: ActionRisk;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  result?: string;
}

export type MemoryKind = "priority" | "preference" | "fact" | "person" | "decision";

export interface MemoryItem {
  id: string;
  userId: string;
  content: string;
  kind: MemoryKind;
  source: string; // "conversation" | "github:#42" ...
  reason: string; // why it was kept
  salience: number; // 0..1
  pinned: boolean;
  createdAt: string;
  expiresAt?: string | null;
  runId?: string | null;
}

export type ConnectorKind = "composio" | "mcp" | "firecrawl" | "demo";

export interface ConnectorStatus {
  id: SourceId;
  name: string;
  kind: ConnectorKind;
  connected: boolean;
  available: boolean; // configured on the server (keys present)
  canAct: boolean;
  detail?: string;
}

export interface SourceFailure {
  source: SourceId | "memory" | "llm";
  name: string;
  reason: string;
  impact: string;
}

export type StepId = "understand" | "recall" | "plan" | "search" | "synthesize" | "verify" | "remember";

export type AgentEvent =
  | { type: "run"; runId: string; mode: RunMode; threadId: string }
  | { type: "step"; step: StepId; status: "active" | "done" | "skipped"; detail?: string; ms?: number }
  | { type: "memory_used"; items: MemoryItem[] }
  | { type: "plan"; plan: Plan }
  | { type: "tool_call"; id: string; source: SourceId; query: string; subQuestionId?: string }
  | { type: "tool_result"; id: string; source: SourceId; count: number; cached: boolean; ms: number }
  | { type: "evidence"; items: Evidence[] }
  | { type: "source_error"; failure: SourceFailure }
  | { type: "token"; text: string }
  | { type: "answer"; markdown: string }
  | { type: "verdict"; claims: Claim[]; groundedness: number; conflicts: Conflict[]; missing: string[]; followups: string[] }
  | { type: "action_proposal"; proposal: ActionProposal }
  | { type: "memory_written"; items: MemoryItem[] }
  | { type: "usage"; llmCalls: number; cachedCalls: number; toolCalls: number; ms: number; models: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const SOURCE_NAMES: Record<string, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  drive: "Google Drive",
  notion: "Notion",
  slack: "Slack",
  github: "GitHub",
  web: "Web",
  memory: "Memory",
  llm: "Language model",
};

export function sourceName(id: string): string {
  return SOURCE_NAMES[id] ?? id;
}

/**
 * Splits answer markdown into claim-sized units (sentences and list items).
 * Shared by the verifier and the UI so both agree on what a "claim" is.
 */
export function claimUnits(markdown: string): string[] {
  return markdown.split("\n").flatMap(lineUnits);
}

export function lineUnits(line: string): string[] {
  const l = line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").replace(/^#+\s*/, "").trim();
  if (!l) return [];
  return l
    .split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}
