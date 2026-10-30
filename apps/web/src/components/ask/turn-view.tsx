"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Brain, FileText } from "lucide-react";
import { explainError, explainFailure } from "@cortex/shared";
import { Problem } from "../problem";
import type { Turn } from "@/lib/use-agent";
import { cn } from "@/lib/ui";
import { ActionCard } from "./action-card";
import { Answer, Cite } from "./answer";
import { Readout } from "./readout";
import { Sources } from "./sources";

export function TurnView({
  turn,
  onDecide,
  onFollowup,
  onRetry,
  latest,
}: {
  turn: Turn;
  onDecide: (proposalId: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void>;
  onFollowup: (q: string) => void;
  /** Asks the same question again (offered when part or all of the answer failed). */
  onRetry?: () => void;
  latest: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const verified = turn.groundedness != null || (turn.done && !turn.claims.length);
  const citedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of turn.answer.matchAll(/\[(\d+)\]/g)) {
      const e = turn.evidence[Number(m[1]) - 1];
      if (e) ids.add(e.id);
    }
    return ids;
  }, [turn.answer, turn.evidence]);
  const failures = turn.error ? turn.failures.filter((f) => f.source !== "llm") : turn.failures;
  const jump = (id: string) => document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <h2 className="mb-3 text-balance text-[30px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[38px]">{turn.question}</h2>
      {turn.attachments && turn.attachments.length > 0 && (
        <ul className="-mt-1 mb-3 flex flex-wrap gap-1.5" aria-label="Attached files">
          {turn.attachments.map((f) => (
            <li key={f.id}>
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-[8px] border border-line px-2 py-1 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">
                <FileText className="size-3.5" aria-hidden />
                {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      <Readout turn={turn} />

      {/* A source that failed is a calm note: the answer still used the others. (The model failing shows below instead.) */}
      {failures.length > 0 && (
        <ul className="mb-5 flex flex-col gap-1.5">
          {failures.map((f) => (
            <li key={f.source}>
              <Problem problem={explainFailure(f)} onRetry={onRetry} />
            </li>
          ))}
        </ul>
      )}

      {turn.answer ? (
        <Answer
          text={turn.answer}
          claims={turn.claims}
          evidence={turn.evidence}
          verified={verified}
          streaming={!turn.done && turn.steps.synthesize.status === "active"}
          onCite={setHovered}
          onJump={jump}
        />
      ) : (
        !turn.done && !turn.error && <AnswerSkeleton />
      )}

      {turn.error && (
        <div className="mb-5">
          <Problem problem={explainError(turn.error)} onRetry={onRetry} variant="card" />
        </div>
      )}

      {turn.conflicts.length > 0 && (
        <div className="my-5 flex flex-col border-y border-line border-t-ink">
          {turn.conflicts.map((c, i) => (
            <div key={i} className={cn("flex gap-4 py-3 text-[15px] leading-[1.55]", i > 0 && "border-t border-line")}>
              <span className="w-20 shrink-0 font-[600] text-risk">Conflict</span>
              <span className="text-ink">
                {c.summary}{" "}
                {c.evidenceIds.map((id) => {
                  const n = turn.evidence.findIndex((e) => e.id === id) + 1;
                  const ev = turn.evidence[n - 1];
                  return ev ? <Cite key={id} n={n} ev={ev} onCite={setHovered} onJump={jump} /> : null;
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      {verified && turn.missing.length > 0 && (
        <div className="mb-5 flex flex-col gap-1 text-[13.5px] leading-snug text-muted">
          {turn.missing.map((m, i) => (
            <p key={i}>Not in your sources: {m}</p>
          ))}
        </div>
      )}

      {turn.evidence.length > 0 && turn.answer && <Sources evidence={turn.evidence} citedIds={citedIds} hovered={hovered} />}

      {turn.actions.map((a) => (
        <ActionCard key={a.id} proposal={a} onDecide={(d, edits) => onDecide(a.id, d, edits)} />
      ))}

      {(turn.memoryWritten.length > 0 || turn.memoryUsed.length > 0) && turn.done && (
        <p className="readout mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <Brain className="size-3 text-accent" aria-hidden />
          {turn.memoryUsed.length > 0 && <span>Used {turn.memoryUsed.length} memor{turn.memoryUsed.length > 1 ? "ies" : "y"}</span>}
          {turn.memoryWritten.filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i).map((m) => (
            <motion.span
              key={m.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
              className="origin-left"
            >
              <Link href="/memory" className="normal-case tracking-normal text-accent-ink hover:underline">
                Learned: “{m.content}”
              </Link>
            </motion.span>
          ))}
        </p>
      )}

    </motion.article>
  );
}

function AnswerSkeleton() {
  return (
    <div aria-hidden className="mb-4 flex flex-col gap-2.5">
      {[92, 78, 85].map((w, i) => (
        <span key={i} className="h-3.5 animate-pulse rounded bg-shell" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
