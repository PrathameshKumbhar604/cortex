"use client";

import Link from "next/link";
import { CloudOff, Info, RotateCw } from "lucide-react";
import type { Explained } from "@cortex/shared";
import { cn } from "@/lib/ui";

/**
 * Shows an explained problem the same way everywhere: a calm title, one sentence, one action, and the technical
 * reason folded away under "Details". `note` for a part that's missing (the rest still works), `card` when nothing came back.
 */
export function Problem({ problem, onRetry, variant = "note" }: { problem: Explained; onRetry?: () => void; variant?: "note" | "card" }) {
  const Icon = variant === "card" ? CloudOff : Info;
  const action = problem.action;
  return (
    <div role={variant === "card" ? "alert" : undefined} className={cn("flex items-start gap-2.5 rounded-[10px] border border-line text-ink-2", variant === "card" ? "bg-surface px-4 py-3.5" : "bg-shell px-3 py-2.5")}>
      <Icon className={cn("mt-0.5 shrink-0 text-muted", variant === "card" ? "size-4" : "size-3.5")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("font-[550] text-ink", variant === "card" ? "text-[14.5px]" : "text-[13.5px]")}>{problem.title}</p>
        <p className={cn("mt-0.5 leading-snug text-muted", variant === "card" ? "text-[14px]" : "text-[13px]")}>{problem.body}</p>
        {(action || problem.detail) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {action?.kind === "retry" && onRetry && (
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-[550] text-accent-ink hover:underline">
                <RotateCw className="size-3.5" aria-hidden /> Try again
              </button>
            )}
            {action?.kind === "link" && (
              <Link href={action.href} className="font-[550] text-accent-ink hover:underline">
                {action.label}
              </Link>
            )}
            {problem.detail && (
              <details className="group text-muted">
                <summary className="cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Details</span>
                  <span className="hidden group-open:inline">Hide details</span>
                </summary>
                <code className="mt-1.5 block max-w-full overflow-x-auto rounded-md bg-hover px-2 py-1.5 font-mono text-[11.5px] break-words whitespace-pre-wrap text-ink-2">
                  {problem.detail}
                </code>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
