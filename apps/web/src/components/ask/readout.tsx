"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { sourceName, type StepId } from "@cortex/shared";
import type { Turn } from "@/lib/use-agent";
import { cn, seconds } from "@/lib/ui";
import { SourceMark } from "./sources";

const LABEL: Record<StepId, string> = {
  understand: "Checking sources",
  recall: "Recalling memory",
  plan: "Planning",
  search: "Searching",
  synthesize: "Writing",
  verify: "Verifying",
  remember: "Remembering",
};

/** One quiet line that narrates the agent; expands into the full trace. */
export function Readout({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const active = (Object.keys(turn.steps) as StepId[]).find((s) => turn.steps[s].status === "active");
  const searched = turn.tools.length;
  const found = turn.tools.reduce((n, t) => n + (t.count ?? 0), 0);
  const searchMs = turn.steps.search.ms;
  const verified = turn.groundedness != null;
  const supported = turn.claims.filter((c) => c.status === "supported").length;

  const parts: React.ReactNode[] = [<span key="m" className={turn.mode === "fast" ? "text-ink" : ""}>{turn.mode === "fast" ? "Fast" : "Deep"}</span>];
  if (turn.route?.route === "general") parts.push(<span key="r" className="text-ink-2">General knowledge · not from your sources</span>);
  else if (turn.route?.route === "web") parts.push(<span key="r">Web</span>);
  else if (turn.route?.sources.length) parts.push(<span key="r">{turn.route.sources.map(sourceName).join(" · ")}</span>);
  if (turn.plan && turn.mode === "deep") parts.push(<span key="p">Plan {turn.plan.subQuestions.length}</span>);
  if (searched) parts.push(<span key="s">Searched {searched}{searchMs ? ` · ${seconds(searchMs)}` : ""}</span>);
  if (found) parts.push(<span key="f">{found} found</span>);
  if (verified && turn.claims.length)
    parts.push(
      <span key="v" className="text-accent-ink">
        Verified {supported}/{turn.claims.length}
      </span>,
    );
  if (turn.usage) parts.push(<span key="t">{seconds(turn.usage.ms)}</span>);

  return (
    <div className="mb-7">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="readout group flex flex-wrap items-center gap-x-4 gap-y-1 text-left text-muted hover:text-ink-2"
      >
        {parts}
        {!turn.done && active && (
          <span className="flex items-center gap-1.5 text-accent-ink">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
            {LABEL[active]}
            {turn.steps[active].detail ? ` · ${turn.steps[active].detail}` : "…"}
          </span>
        )}
        <span className="flex items-center gap-1 text-hair group-hover:text-ink-2">
          Trace <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <Trace turn={turn} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Trace({ turn }: { turn: Turn }) {
  const steps = Object.entries(turn.steps) as [StepId, Turn["steps"][StepId]][];
  return (
    <div className="mt-3 grid gap-5 border-l border-line pl-4 text-[13px] text-ink-2 sm:grid-cols-[180px_1fr]">
      <ol className="flex flex-col gap-1.5">
        {steps.map(([id, s]) => (
          <li key={id} className="readout flex items-center justify-between gap-3">
            <span className={cn(s.status === "pending" && "text-hair", s.status === "skipped" && "text-hair line-through", s.status === "active" && "text-accent-ink")}>
              {LABEL[id]}
            </span>
            <span className="text-hair">{s.status === "done" ? seconds(s.ms) : s.status === "skipped" ? "skipped" : ""}</span>
          </li>
        ))}
      </ol>
      <div className="flex min-w-0 flex-col gap-4">
        {turn.plan && turn.plan.subQuestions.length > 0 && (
          <div>
            <p className="readout mb-1.5 text-muted">Plan</p>
            <ol className="flex flex-col gap-1">
              {turn.plan.subQuestions.map((q, i) => (
                <li key={q.id} className="flex gap-2">
                  <span className="readout text-hair">{i + 1}</span>
                  <span>
                    {q.question} <span className="text-hair">· {q.sources.map(sourceName).join(", ")}</span>
                  </span>
                </li>
              ))}
            </ol>
            {turn.plan.window?.label && <p className="readout mt-1.5 text-hair">Window · {turn.plan.window.label}</p>}
          </div>
        )}
        {turn.tools.length > 0 && (
          <div>
            <p className="readout mb-1.5 text-muted">Tool calls</p>
            <ul className="flex flex-col gap-1">
              {turn.tools.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <SourceMark source={t.source} />
                  <span className="w-28 shrink-0 truncate">{sourceName(t.source)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">"{t.query || "recent"}"</span>
                  <span className="readout shrink-0 text-hair">
                    {t.count == null ? "…" : `${t.count} · ${t.cached ? "cached" : seconds(t.ms)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turn.memoryUsed.length > 0 && (
          <div>
            <p className="readout mb-1.5 text-muted">Memory used</p>
            <ul className="flex flex-col gap-1">
              {turn.memoryUsed.map((m) => (
                <li key={m.id}>
                  {m.content} <span className="text-hair">· {m.kind}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turn.usage && (
          <p className="readout text-hair">
            {turn.usage.llmCalls} model call{turn.usage.llmCalls === 1 ? "" : "s"}
            {turn.usage.cachedCalls ? ` · ${turn.usage.cachedCalls} cached` : ""} · {turn.usage.toolCalls} searches
            {turn.usage.models.length ? ` · ${turn.usage.models.join(", ")}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
