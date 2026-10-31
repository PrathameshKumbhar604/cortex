"use client";

import { ArrowUp, FileText, Loader2, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RunMode } from "@cortex/shared";
import { motion } from "motion/react";
import { formatSize } from "@/lib/files";
import { cn } from "@/lib/ui";
import { toast } from "@/lib/toast";
import { useMic } from "./mic";

export const MAX = 2000; // /api/ask's limit

export interface PendingFile {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  id?: string;
  error?: string;
}

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
  attachments = [],
  onAttach,
  onRemove,
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
  attachments?: PendingFile[];
  onAttach?: (files: File[]) => void;
  onRemove?: (key: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = attachments.some((a) => a.status === "uploading");
  const sendNext = useRef(false);
  const mic = useMic(
    (text) => {
      const next = value.trim() ? `${value.trim()} ${text}` : text;
      if (next.length > MAX) toast("Transcript trimmed to fit", { body: "Messages hold up to 2,000 characters." });
      onChange(next.slice(0, MAX));
      ref.current?.focus();
    },
    (transcript) => {
      sendNext.current = true;
      const ask = "Turn this voice note transcript into clean notes (a short summary, key points, and action items), using only the transcript below:";
      const cut = "\n\n(The recording ran longer; this is the first part.)";
      const room = MAX - ask.length - 2;
      onChange(`${ask}\n\n${transcript.length > room ? transcript.slice(0, room - cut.length) + cut : transcript}`);
    },
  );
  // Send once the parent has re-rendered with the notes prompt, so onSubmit sees the new value.
  useEffect(() => {
    if (!sendNext.current) return;
    sendNext.current = false;
    if (!busy && !uploading) onSubmit();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
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
        if (!busy && !uploading) onSubmit();
      }}
      onDragOver={(e) => {
        if (!onAttach || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!onAttach || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        onAttach([...e.dataTransfer.files]);
      }}
      className={cn("rounded-[14px] border bg-surface shadow-[0_8px_24px_-12px_rgba(14,17,22,0.14)] transition-colors focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent),0_8px_24px_-12px_rgba(14,17,22,0.14)]", dragging ? "border-accent bg-accent-wash" : "border-line-strong")}
    >
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attached files">
          {attachments.map((a) => (
            <li
              key={a.key}
              title={a.error}
              className={cn(
                "enter flex max-w-[240px] items-center gap-1.5 rounded-[8px] border py-1 pr-1 pl-2 text-[12.5px]",
                a.status === "error" ? "border-risk/40 bg-risk-soft text-risk" : "border-line bg-shell text-ink-2",
              )}
            >
              {a.status === "uploading" ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : <FileText className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{a.name}</span>
              <span className="shrink-0 text-hair">{a.status === "error" ? "failed" : formatSize(a.size)}</span>
              <button type="button" onClick={() => onRemove?.(a.key)} aria-label={`Remove ${a.name}`} className="grid size-5 shrink-0 place-items-center rounded-[5px] hover:bg-hover">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mic.panel}
      <label htmlFor="ask" className="sr-only">
        Ask Cortex
      </label>
      <textarea
        id="ask"
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        maxLength={MAX}
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
        <div className="flex items-center gap-1.5">
        {onAttach && (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onAttach([...e.target.files]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              aria-label="Attach files (up to 10 MB each)"
              title="Attach files (up to 10 MB each)"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
            >
              <Paperclip className="size-4" aria-hidden />
            </button>
          </>
        )}
        {mic.button}
        <DepthSwitch mode={mode} onMode={onMode} />
        </div>
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stop" className="grid size-8 place-items-center rounded-full bg-ink text-on-ink hover:bg-ink-2">
            <Square className="size-3 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Ask"
            disabled={!value.trim() || uploading}
            className="grid size-8 place-items-center rounded-full bg-accent text-on-ink transition-opacity hover:bg-accent-ink disabled:bg-line-strong disabled:text-muted"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

const DEPTH = {
  fast: { label: "Fast", tip: "One pass for the quickest answer." },
  deep: { label: "Deep", tip: "Plans sub-questions, searches your apps in parallel and verifies every claim. Slower." },
} as const;

/** Fast/Deep switch. Its description shows on hover, keyboard focus, or a long press on touch. */
function DepthSwitch({ mode, onMode }: { mode: RunMode; onMode: (m: RunMode) => void }) {
  const [tip, setTip] = useState<RunMode | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  useEffect(() => {
    if (!tip) return;
    const hide = (e: KeyboardEvent) => e.key === "Escape" && setTip(null);
    document.addEventListener("keydown", hide);
    return () => document.removeEventListener("keydown", hide);
  }, [tip]);

  return (
    <div className="relative">
      <div role="radiogroup" aria-label="Depth" className="flex gap-0.5 rounded-lg bg-shell p-0.5">
        {(["fast", "deep"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            aria-describedby={`depth-tip-${m}`}
            onClick={() => onMode(m)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setTip(m)}
            onPointerLeave={() => setTip(null)}
            onFocus={(e) => e.currentTarget.matches(":focus-visible") && setTip(m)}
            onBlur={() => setTip(null)}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              endPress();
              press.current = setTimeout(() => setTip(m), 400);
            }}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onContextMenu={(e) => e.preventDefault()} // a long press shows the tip, not the browser menu
            className={cn("relative rounded-md px-2.5 py-1 text-[12.5px] transition-colors select-none [-webkit-touch-callout:none]", mode === m ? "font-medium text-ink" : "text-muted hover:text-ink")}
          >
            {mode === m && (
              <motion.span
                layoutId="depth-pill"
                className="absolute inset-0 rounded-md bg-surface shadow-[0_1px_2px_rgba(14,17,22,0.08)]"
                transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              />
            )}
            <span className="relative">{DEPTH[m].label}</span>
            <span id={`depth-tip-${m}`} hidden>
              {DEPTH[m].tip}
            </span>
          </button>
        ))}
      </div>
      {tip && (
        <div
          role="tooltip"
          className="enter pointer-events-none absolute left-0 bottom-full z-20 mb-2 w-[min(240px,calc(100vw-48px))] rounded-[10px] border border-line bg-surface px-3 py-2 text-[12.5px] leading-snug text-ink-2 shadow-[0_12px_32px_-16px_rgb(14_17_22/0.3)]"
        >
          <span className="font-[550] text-ink">{DEPTH[tip].label}.</span> {DEPTH[tip].tip}
        </div>
      )}
    </div>
  );
}
