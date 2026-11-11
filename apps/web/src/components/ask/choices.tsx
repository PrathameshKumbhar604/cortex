"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * Cortex's question back about an action, as a pick-one list: each likely answer is one click (or its number key),
 * and the last row takes the user's own answer. Dismissed, the composer below still works as usual.
 */
export function Choices({ question, options, onPick }: { question: string; options: string[]; onPick: (answer: string) => void }) {
  const [other, setOther] = useState("");
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]");
      if (e.key === "Escape" && !typing) return setOpen(false);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        onPick(options[n - 1]!);
      } else if (n === options.length + 1) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, options, onPick]);

  if (!open) return null;
  const num = "grid size-5 shrink-0 place-items-center rounded-[5px] border border-line font-mono text-[11px] tabular-nums text-muted";
  const row = "press flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[14px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink focus-visible:outline-none";

  return (
    <section role="group" aria-labelledby={titleId} className="rise mb-2.5 rounded-[12px] border border-line-strong bg-surface p-1.5 shadow-[0_4px_16px_-8px_rgb(14_17_22/0.18)]">
      <header className="flex items-start justify-between gap-3 py-1.5 pr-0.5 pl-2.5">
        <h2 id={titleId} className="text-[14px] font-[600] leading-snug text-ink">
          {question}
        </h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss choices" className="press grid size-7 shrink-0 place-items-center rounded-[7px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
          <X className="size-3.5" aria-hidden />
        </button>
      </header>
      <ol className="flex flex-col">
        {options.map((o, i) => (
          <li key={o}>
            <button ref={i === 0 ? first : undefined} type="button" onClick={() => onPick(o)} className={row}>
              <span aria-hidden className={num}>{i + 1}</span>
              {o}
            </button>
          </li>
        ))}
        <li>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (other.trim()) onPick(other.trim());
            }}
            className={cn(row, "cursor-text py-1.5 pr-1.5 focus-within:bg-hover")}
            onClick={() => input.current?.focus()}
          >
            <span aria-hidden className={num}>{options.length + 1}</span>
            <input
              ref={input}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setOther(""), input.current?.blur())}
              placeholder="Something else…"
              aria-label="Type your own answer"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
            />
            <button type="submit" disabled={!other.trim()} aria-label="Send answer" className="press grid size-7 shrink-0 place-items-center rounded-[7px] bg-ink text-on-ink transition-opacity disabled:opacity-0">
              <ArrowUp className="size-3.5" aria-hidden />
            </button>
          </form>
        </li>
      </ol>
    </section>
  );
}
