"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Brain, FileText, Pencil } from "lucide-react";
import { explainError, explainFailure } from "@cortex/shared";
import { Problem } from "../problem";
import type { Turn } from "@/lib/use-agent";
import { cn } from "@/lib/ui";
import { ActionCard } from "./action-card";
import { AnswerActions, VersionSwitch } from "./answer-actions";
import { Answer, Cite } from "./answer";
import { MAX } from "./composer";
import { Readout } from "./readout";
import { Sources } from "./sources";

export function TurnView({
  turn,
  onDecide,
  onFollowup,
  onRetry,
  onVersion,
  onEdit,
  latest,
  chatId,
}: {
  turn: Turn;
  onDecide: (proposalId: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void>;
  onFollowup: (q: string) => void;
  /** Answers the question again in place, as a new version of this turn. */
  onRetry?: () => void;
  /** Shows another version (attempt) of this turn. */
  onVersion?: (version: number) => void;
  /** Asks this turn again with an edited question, as a new version; absent while an answer is running. */
  onEdit?: (question: string) => void;
  latest: boolean;
  /** The saved chat this turn belongs to; sharing needs it. */
  chatId?: string;
}) {
  const answerRef = useRef<HTMLDivElement>(null);
  // The sources sheet: null closed, "" open at the top, an evidence id open at that card (a marker was clicked).
  const [sheetAt, setSheetAt] = useState<string | null>(null);
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

  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.3, bounce: 0 }}>
      <Question question={turn.question} done={turn.done} onEdit={onEdit} />
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
        <div ref={answerRef}>
        <Answer
          text={turn.answer}
          claims={turn.claims}
          evidence={turn.evidence}
          verified={verified}
          streaming={!turn.done && turn.steps.synthesize.status === "active"}
          onJump={setSheetAt}
        />
        </div>
      ) : (
        !turn.done && !turn.error && <AnswerSkeleton />
      )}

      {turn.answer && (turn.evidence.length > 0 || (turn.done && !turn.error)) && (
        <div className="mt-1 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {turn.evidence.length > 0 && <Sources evidence={turn.evidence} citedIds={citedIds} query={turn.question} at={sheetAt} onAt={setSheetAt} />}
          {turn.done && !turn.error && (
            <AnswerActions turn={turn} chatId={chatId} answerRef={answerRef} onRetry={onRetry} onVersion={onVersion} className={turn.evidence.length ? "m-0" : "my-0"} />
          )}
        </div>
      )}

      {turn.error && (
        <div className="mb-5">
          <Problem problem={explainError(turn.error)} onRetry={onRetry} variant="card" />
          {/* A failed attempt can still step back to the answers before it. */}
          {turn.done && onVersion && <VersionSwitch turn={turn} onVersion={onVersion} className="-ml-1 mt-1.5" />}
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
                  return ev ? <Cite key={id} n={n} ev={ev} onJump={setSheetAt} /> : null;
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

const HEADING = "text-[30px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[38px]";

/** The question, with an Edit action on hover or focus (tap the question on touch) that turns it into an inline editor. */
function Question({ question, done, onEdit }: { question: string; done: boolean; onEdit?: (q: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  const open = () => {
    setDraft(question);
    setEditing(true);
    requestAnimationFrame(() => {
      const el = box.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };
  const close = () => {
    setEditing(false);
    requestAnimationFrame(() => editBtn.current?.focus());
  };
  const q = draft.trim();
  const canSend = !!onEdit && !!q && q !== question.trim();
  const send = () => {
    if (!canSend) return;
    setEditing(false);
    setShown(false);
    onEdit(q);
  };

  if (editing)
    return (
      <form
        className="-mx-3 mb-3 rounded-[14px] border border-accent/60 bg-surface px-3 pt-2 pb-2.5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={draft}
          maxLength={MAX}
          aria-label="Edit your question"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          className={cn(HEADING, "no-ring block w-full resize-none overflow-hidden bg-transparent outline-none focus-visible:outline-none")}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {draft.length > MAX * 0.9 && (
            <span className="mr-auto font-mono text-[12px] tabular-nums text-muted">
              {draft.length}/{MAX}
            </span>
          )}
          <button type="button" onClick={close} className="press h-8 rounded-[8px] px-3 text-[13px] text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            title={onEdit ? undefined : "Wait for the current answer to finish"}
            className="press h-8 rounded-[8px] bg-accent px-3 text-[13px] font-[500] text-on-ink hover:bg-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-line-strong disabled:text-muted"
          >
            Send
          </button>
        </div>
      </form>
    );

  return (
    <div className="group relative">
      {/* Touch has no hover: tapping the question reveals Edit. */}
      <h2 onClick={() => setShown((v) => !v)} className={cn(HEADING, "mb-3 text-balance pr-10")}>
        {question}
      </h2>
      {done && (
        <button
          ref={editBtn}
          type="button"
          onClick={open}
          disabled={!onEdit}
          aria-label="Edit question"
          title={onEdit ? "Edit question" : "Wait for the current answer to finish"}
          className={cn(
            "press absolute top-1 right-0 grid size-8 place-items-center rounded-[8px] text-muted hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent disabled:text-line-strong",
            "[@media(hover:hover)]:group-hover:opacity-100",
            shown ? "opacity-100" : "opacity-0",
          )}
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
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
