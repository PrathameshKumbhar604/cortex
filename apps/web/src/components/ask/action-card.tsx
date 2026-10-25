"use client";

import { Check, CircleSlash, Loader2, PenLine, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { sourceName, type ActionProposal } from "@cortex/shared";
import { cn } from "@/lib/ui";
import { SourceMark } from "./sources";

const STAMP: Record<string, { label: string; icon: typeof Check; cls: string }> = {
  executed: { label: "Done", icon: Check, cls: "text-ok" },
  rejected: { label: "Declined", icon: CircleSlash, cls: "text-muted" },
  failed: { label: "Failed", icon: TriangleAlert, cls: "text-risk" },
};

/**
 * Nothing happens until the user approves. States stamp on and stay visible:
 * a declined or failed action is never silently removed.
 */
export function ActionCard({
  proposal,
  onDecide,
}: {
  proposal: ActionProposal;
  onDecide: (decision: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(proposal.args).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string])),
  );
  const pending = proposal.status === "pending" || proposal.status === "approved";
  const stamp = STAMP[proposal.status];
  const verb = proposal.risk === "high" ? "Approve & send" : "Approve";

  const decide = async (d: "approve" | "reject") => {
    setBusy(d);
    try {
      await onDecide(d, d === "approve" && editing ? draft : undefined);
    } finally {
      setBusy(null);
      setEditing(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("mt-5 rounded-[10px] border p-4", pending ? "border-line-strong bg-surface" : "border-line bg-shell")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-[550] text-ink">{proposal.title}</p>
          <p className="readout mt-1 flex items-center gap-1.5 text-muted">
            <SourceMark source={proposal.connectorId} />
            {sourceName(proposal.connectorId)}
            {pending && <span>· {proposal.risk === "high" ? "Acts on your behalf · needs your approval" : "Needs your approval"}</span>}
          </p>
        </div>
        {stamp && (
          <span className={cn("readout flex items-center gap-1", stamp.cls)}>
            <stamp.icon className="size-3.5" aria-hidden />
            {stamp.label}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          {Object.entries(draft).map(([k, v]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="readout text-muted">{k}</span>
              <textarea
                value={v}
                rows={k === "body" || k === "text" || k === "content" ? 4 : 1}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                className="resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none"
              />
            </label>
          ))}
        </div>
      ) : (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-shell px-3 py-2.5 font-sans text-[13.5px] leading-relaxed text-ink-2">
          {proposal.summary}
        </pre>
      )}

      {proposal.result && <p className={cn("mt-2 text-[13px]", proposal.status === "failed" ? "text-risk" : "text-muted")}>{proposal.result}</p>}

      {pending && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            disabled={!!busy || Object.keys(draft).length === 0}
            className="mr-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:text-ink disabled:opacity-40"
          >
            <PenLine className="size-3.5" aria-hidden /> {editing ? "Done editing" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => decide("reject")}
            disabled={!!busy}
            className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-shell disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("approve")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ink-2 disabled:opacity-60"
          >
            {busy === "approve" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {verb}
          </button>
        </div>
      )}
    </motion.div>
  );
}
