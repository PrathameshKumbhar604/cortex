"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageSquareText, Search, Sparkles } from "lucide-react";
import { keywordSearch, mergeHits, type ChatHit, type Part, type SemanticMatch } from "@/lib/chat-search";
import { onRecent, readThreads, type SavedThread } from "@/lib/recent";
import { cn } from "@/lib/ui";

const OPEN = "cortex:chat-search";
export const openChatSearch = () => window.dispatchEvent(new Event(OPEN));

/** After opening a chat, bring the matching question into view once the thread has rendered. */
function scrollToTurn(id: string, turn: number) {
  const until = Date.now() + 2500;
  const tick = () => {
    const turns = document.querySelectorAll<HTMLElement>("main [data-turn]");
    if (new URLSearchParams(location.search).get("t") === id && turns.length > turn) {
      // A moment later than the thread's own "scroll to the end" on load.
      setTimeout(() => turns[turn]?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 120);
    } else if (Date.now() < until) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function Marked({ parts }: { parts: Part[] }) {
  return parts.map((p, i) => (p.hit ? <mark key={i} className="rounded-[3px] bg-accent-soft px-px text-ink">{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>));
}

/**
 * Ctrl/Cmd+K (or the sidebar's Search): find a chat by its words, as you type, and by meaning ("that invoice question"),
 * which the server answers a moment later. No open/close animation: it is a keyboard tool used many times a day.
 */
export function ChatSearch() {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [chats, setChats] = useState<SavedThread[]>([]);
  const [semantic, setSemantic] = useState<{ q: string; matches: SemanticMatch[]; available: boolean } | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const show = () => {
      setQ("");
      setSemantic(null);
      setActive(0);
      setChats(readThreads());
      setOpen(true);
      if (!ref.current?.open) ref.current?.showModal();
      input.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close();
        else show();
      }
    };
    window.addEventListener(OPEN, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    if (open) return onRecent(() => setChats(readThreads()));
  }, [open]);

  // Meaning search waits for a pause in typing; a newer query cancels the older request.
  const query = q.trim();
  useEffect(() => {
    if (!open || query.length < 3) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/chats/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: query, ids: chats.map((c) => c.id) }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : { matches: [], available: false }))
        .then((d: { matches: SemanticMatch[]; available: boolean }) => setSemantic({ q: query, ...d }))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, query, chats]);

  const keyword = useMemo(() => keywordSearch(chats, query), [chats, query]);
  const fresh = semantic?.q === query ? semantic : null;
  const hits: ChatHit[] = query
    ? mergeHits(keyword, fresh?.matches ?? [], chats)
    : chats.slice(0, 8).map((c) => ({ id: c.id, kind: "keyword", turn: 0, title: [{ text: c.title, hit: false }], snippet: [], score: 0 }));
  const waiting = query.length >= 3 && !fresh;
  const sel = Math.min(active, hits.length - 1);

  useEffect(() => {
    setActive(0);
  }, [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = (h: ChatHit | undefined) => {
    if (!h) return;
    ref.current?.close();
    router.push(`/?t=${h.id}`);
    scrollToTurn(h.id, h.turn);
  };

  return (
    <dialog
      ref={ref}
      aria-label="Search chats"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === ref.current && ref.current.close()} // a click on the backdrop
      className="m-auto mt-[12vh] w-[min(600px,calc(100vw-32px))] max-w-none overflow-hidden rounded-[16px] border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_-24px_rgb(14_17_22/0.45)] backdrop:bg-[rgb(8_10_14/0.4)]"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (hits.length) setActive((sel + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              go(hits[sel]);
            }
          }}
          role="combobox"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-activedescendant={hits.length ? `${id}-${sel}` : undefined}
          aria-autocomplete="list"
          placeholder="Search your chats by words or meaning…"
          className="no-ring h-13 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-hair"
        />
        <kbd className="hidden rounded-[6px] border border-line px-1.5 text-[11px] leading-[18px] text-muted sm:block">Esc</kbd>
      </div>

      <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Chats" className="max-h-[min(420px,60dvh)] overflow-y-auto p-1.5">
        {hits.map((h, i) => {
          const header = !query ? i === 0 && "Recent" : (i === 0 || hits[i - 1]!.kind !== h.kind) && (h.kind === "keyword" ? "Matching words" : "Related by meaning");
          const Icon = h.kind === "semantic" ? Sparkles : MessageSquareText;
          return (
            <Fragment key={`${h.kind}-${h.id}`}>
              {header && (
                <li role="presentation" className="readout px-2.5 pt-2 pb-1 text-hair">
                  {header}
                </li>
              )}
              <li
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === sel}
                onPointerMove={() => i !== sel && setActive(i)}
                onClick={() => go(h)}
                className={cn("flex cursor-pointer gap-2.5 rounded-[10px] px-2.5 py-2", i === sel && "bg-hover")}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", h.kind === "semantic" ? "text-accent" : "text-muted")} strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-[550] text-ink">
                    <Marked parts={h.title} />
                  </span>
                  {h.snippet.length > 0 && (
                    <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-[1.45] text-muted">
                      <Marked parts={h.snippet} />
                    </span>
                  )}
                </span>
                {h.kind === "semantic" && <span className="sr-only">, related by meaning</span>}
              </li>
            </Fragment>
          );
        })}
        {!hits.length && (
          <li role="presentation" className="px-3 py-8 text-center text-[13px] text-muted">
            {!chats.length ? "No chats yet. Ask something and it will show up here." : waiting ? "Looking for chats with a similar meaning…" : `No chats match “${query}”.`}
          </li>
        )}
      </ul>

      <div aria-live="polite" className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11.5px] text-muted">
        <span className="hidden sm:inline">↑↓ to move · Enter to open</span>
        <span className="ml-auto">
          {waiting && hits.length > 0 ? "Searching by meaning…" : fresh && !fresh.available ? "Meaning search is unavailable right now" : ""}
        </span>
      </div>
    </dialog>
  );
}
