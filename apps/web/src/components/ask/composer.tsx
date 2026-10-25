"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RunMode } from "@cortex/shared";
import { cn } from "@/lib/ui";

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  mode,
  onMode,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  mode: RunMode;
  onMode: (m: RunMode) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className="rounded-[14px] border border-line-strong bg-surface shadow-[0_8px_24px_-12px_rgba(14,17,22,0.14)] transition-colors focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgba(67,83,255,0.10),0_8px_24px_-12px_rgba(14,17,22,0.14)]"
    >
      <label htmlFor="ask" className="sr-only">
        Ask Cortex
      </label>
      <textarea
        id="ask"
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        maxLength={2000}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) onSubmit();
          }
        }}
        className="no-ring block w-full resize-none bg-transparent px-[18px] pt-4 pb-2 text-[15.5px] leading-relaxed text-ink outline-none placeholder:text-hair focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-3">
        <div role="radiogroup" aria-label="Depth" className="flex gap-0.5 rounded-lg bg-shell p-0.5">
          {(["fast", "deep"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              title={m === "fast" ? "Fast Mode: one pass, quickest answer" : "Deep: plans sub-questions and verifies every claim"}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
                mode === m ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(14,17,22,0.08)]" : "text-muted hover:text-ink",
              )}
            >
              {m === "fast" ? "Fast" : "Deep"}
            </button>
          ))}
        </div>
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stop" className="grid size-8 place-items-center rounded-full bg-ink text-white hover:bg-ink-2">
            <Square className="size-3 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Ask"
            disabled={!value.trim()}
            className="grid size-8 place-items-center rounded-full bg-accent text-white transition-opacity hover:bg-accent-ink disabled:bg-line-strong disabled:text-muted"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}
