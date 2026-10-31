"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, RotateCw, Share } from "lucide-react";
import { sourceName } from "@cortex/shared";
import { snapshot, toMarkdown, type SharedSource } from "@/lib/share";
import { saveNow } from "@/lib/recent";
import { toast } from "@/lib/toast";
import type { Turn } from "@/lib/use-agent";
import { cn } from "@/lib/ui";
import { versionInfo } from "@/lib/versions";

const QUIET =
  "press inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";

const noop = () => () => {};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The rendered answer as plain HTML for rich paste: citations become "[n]", previews and code-copy bars go. */
function richHtml(el: HTMLElement | null, sources: SharedSource[]) {
  if (!el) return "";
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[role=tooltip], .terminal > div:first-child").forEach((n) => n.remove());
  copy.querySelectorAll<HTMLButtonElement>("button[aria-label^='Source ']").forEach((b) => b.replaceWith(`[${b.textContent}]`));
  copy.querySelectorAll("*").forEach((n) => {
    n.removeAttribute("class");
    n.removeAttribute("style");
    n.removeAttribute("id");
  });
  const list = sources.map((s) => `<li>[${s.n}] ${esc(s.title)} (${esc(sourceName(s.source))}${s.date ? `, ${s.date.slice(0, 10)}` : ""})</li>`).join("");
  return copy.innerHTML + (list ? `<p><strong>Sources</strong></p><ul>${list}</ul>` : "");
}

/** True for 1.5 s after `flash()`: a copy confirms itself in place, never with a toast. */
export function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, []);
  return [copied, flash];
}

/** The copy icon morphs into a check (and back), and screen readers hear "Copied" once. */
export function CopyGlyph({ copied, tick = "text-accent" }: { copied: boolean; tick?: string }) {
  const morph = "absolute inset-0 size-3.5 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
  return (
    <span className="relative inline-block size-3.5 shrink-0">
      <Copy aria-hidden className={cn(morph, copied ? "scale-50 opacity-0 blur-[2px]" : "scale-100 opacity-100")} />
      <Check aria-hidden className={cn(morph, tick, copied ? "scale-100 opacity-100" : "scale-50 opacity-0 blur-[2px]")} />
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}

/** "‹ 2/3 ›": steps between the attempts at a regenerated turn. Renders nothing for a turn answered once. */
export function VersionSwitch({ turn, onVersion, className }: { turn: Turn; onVersion: (version: number) => void; className?: string }) {
  const { count, index } = versionInfo(turn);
  if (count < 2) return null;
  const btn =
    "press grid size-7 place-items-center rounded-[7px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:text-line-strong";
  return (
    <div role="group" aria-label="Answer versions" className={cn("flex items-center", className)}>
      <button type="button" onClick={() => onVersion(index - 1)} disabled={index === 0} aria-label="Previous version" className={btn}>
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
      <span aria-live="polite" className="min-w-[3ch] text-center font-mono text-[12px] tabular-nums text-muted">
        <span aria-hidden>
          {index + 1}/{count}
        </span>
        <span className="sr-only">
          Version {index + 1} of {count}
        </span>
      </span>
      <button type="button" onClick={() => onVersion(index + 1)} disabled={index === count - 1} aria-label="Next version" className={btn}>
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Quiet actions under a finished answer: switch versions, copy it, share a read-only link to it, or answer again. */
export function AnswerActions({
  turn,
  chatId,
  answerRef,
  onRetry,
  onVersion,
  className,
}: {
  turn: Turn;
  chatId?: string;
  className?: string;
  answerRef: RefObject<HTMLDivElement | null>;
  /** Answers again as a new version; absent while another answer is running. */
  onRetry?: () => void;
  onVersion?: (version: number) => void;
}) {
  const [copied, flash] = useCopied();

  const copy = async () => {
    const snap = snapshot(turn);
    const md = toMarkdown(snap.answer, snap.sources);
    const html = richHtml(answerRef.current, snap.sources);
    try {
      try {
        if (!html || typeof ClipboardItem === "undefined") throw new Error("plain text only");
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([md], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
      } catch {
        await navigator.clipboard.writeText(md);
      }
      flash();
    } catch {
      toast("Couldn't copy", { body: "Your browser blocked the clipboard. Select the text and copy it instead.", tone: "warn" });
    }
  };

  return (
    <div className={cn("-ml-2 mt-1 mb-4 flex items-center gap-0.5", className)}>
      {onVersion && <VersionSwitch turn={turn} onVersion={onVersion} className="mr-1" />}
      <button type="button" onClick={copy} aria-label="Copy answer" className={QUIET}>
        <CopyGlyph copied={copied} />
        {copied ? "Copied" : "Copy"}
      </button>
      {chatId && <ShareButton chatId={chatId} turn={turn} />}
      <button type="button" onClick={onRetry} disabled={!onRetry} aria-label="Answer again" title="Answer again (keeps this answer as a version)" className={cn(QUIET, "disabled:opacity-40")}>
        <RotateCw className="size-3.5" aria-hidden />
        Retry
      </button>
    </div>
  );
}

function ShareButton({ chatId, turn }: { chatId: string; turn: Turn }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, flash] = useCopied();
  const box = useRef<HTMLDivElement>(null);
  // The system share sheet on phones and tablets; desktops copy the link instead. False on the server.
  const canShare = useSyncExternalStore(noop, () => "share" in navigator && matchMedia("(pointer: coarse)").matches, () => false);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = async () => {
    setBusy(true);
    try {
      await saveNow(chatId); // the link is made from the server's copy of this chat
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, turnId: turn.id }) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't make a link right now.");
      setUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        flash();
      } catch {
        // the clipboard can refuse after the wait; the link is on screen to copy
      }
    } catch (e) {
      toast("Couldn't share", { body: e instanceof Error ? e.message : undefined, tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      flash();
    } catch {
      toast("Couldn't copy", { body: "Select the link and copy it instead.", tone: "warn" });
    }
  };

  const revoke = async () => {
    if (!url) return;
    setBusy(true);
    const res = await fetch(`/api/share/${encodeURIComponent(url.split("/s/")[1] ?? "")}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok || res?.status === 404) {
      setUrl(null);
      setOpen(false);
      toast("Link turned off", { body: "Anyone who opens it now sees that it isn't available." });
    } else toast("Couldn't turn the link off", { body: "Try again in a moment.", tone: "warn" });
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={cn(QUIET, open && "bg-hover text-ink")}>
        <Share className="size-3.5" aria-hidden />
        Share
      </button>
      <div
        role="dialog"
        aria-label="Share this answer"
        data-open={open || undefined}
        inert={!open}
        className={cn(
          "absolute top-full left-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] origin-top-left rounded-[12px] border border-line-strong bg-surface p-3.5 shadow-[0_12px_32px_-16px_rgb(14_17_22/0.3)]",
          "invisible scale-[0.97] opacity-0 transition-[opacity,scale,visibility] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:visible data-open:scale-100 data-open:opacity-100",
        )}
      >
        <p className="text-[13.5px] font-[550] text-ink">{url ? "Public link" : "Share a read-only link"}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          Anyone with the link can see this question, the answer and the cited snippets. Your other chats and connected apps stay private.
        </p>
        {url ? (
          <>
            <div className="mt-3 flex items-center gap-1.5">
              <input
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 min-w-0 flex-1 rounded-[8px] border border-line bg-shell px-2.5 font-mono text-[12px] text-ink-2 outline-none focus-visible:border-accent"
              />
              <button type="button" onClick={copyLink} aria-label="Copy link" className="press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-ink px-3 text-[12.5px] font-[550] text-surface hover:opacity-90">
                <CopyGlyph copied={copied} tick="text-surface" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <button type="button" onClick={revoke} disabled={busy} className="press -ml-1.5 rounded-[6px] px-1.5 py-1 text-[12.5px] text-risk hover:bg-hover disabled:opacity-50">
                Turn off link
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => navigator.share({ title: turn.question, url }).catch(() => {})}
                  className="press rounded-[6px] px-1.5 py-1 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink"
                >
                  Share…
                </button>
              )}
            </div>
          </>
        ) : (
          <button type="button" onClick={create} disabled={busy} className="press mt-3 h-8 w-full rounded-[8px] bg-ink text-[12.5px] font-[550] text-surface hover:opacity-90 disabled:opacity-60">
            {busy ? "Making link…" : "Create link"}
          </button>
        )}
      </div>
    </div>
  );
}
