"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Check, Copy, Share } from "lucide-react";
import { sourceName } from "@cortex/shared";
import { snapshot, toMarkdown, type SharedSource } from "@/lib/share";
import { saveNow } from "@/lib/recent";
import { toast } from "@/lib/toast";
import type { Turn } from "@/lib/use-agent";
import { cn } from "@/lib/ui";

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

/** Quiet actions under a finished answer: copy it, or share a read-only link to it. */
export function AnswerActions({ turn, chatId, answerRef }: { turn: Turn; chatId?: string; answerRef: RefObject<HTMLDivElement | null> }) {
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Answer copied", { body: "As Markdown, with its sources." });
    } catch {
      toast("Couldn't copy", { body: "Your browser blocked the clipboard. Select the text and copy it instead.", tone: "warn" });
    }
  };

  return (
    <div className="-ml-2 mt-1 mb-4 flex items-center gap-0.5">
      <button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy answer"} className={QUIET}>
        {copied ? <Check className="size-3.5 text-accent" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        Copy
      </button>
      {chatId && <ShareButton chatId={chatId} turn={turn} />}
    </div>
  );
}

function ShareButton({ chatId, turn }: { chatId: string; turn: Turn }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        toast("Link copied", { body: "Anyone with it can view this answer." });
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
      toast("Link copied");
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
              <button type="button" onClick={copyLink} className="press h-8 shrink-0 rounded-[8px] bg-ink px-3 text-[12.5px] font-[550] text-surface hover:opacity-90">
                Copy
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
