"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Brain, Calendar, ChevronRight, FileText, GitBranch, Globe, HardDrive, Hash, Mail, NotebookText, Paperclip, X, type LucideIcon } from "lucide-react";
import { sourceName, type Evidence } from "@cortex/shared";
import { cleanSnippet, faviconUrl, hostOf, plainText } from "@/lib/snippet";
import { cn, shortDate, sourceColor } from "@/lib/ui";

export function SourceMark({ source, className }: { source: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={{ background: sourceColor(source) }} />;
}

const ICON: Record<string, LucideIcon> = {
  gmail: Mail,
  calendar: Calendar,
  drive: HardDrive,
  notion: NotebookText,
  slack: Hash,
  github: GitBranch,
  web: Globe,
  memory: Brain,
  chat: Brain,
  files: Paperclip,
};

/** The app a source came from, as a small tinted tile: identity by shape, so the app colour never reads as an alert. */
export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const Icon = ICON[source] ?? FileText;
  return (
    <span
      aria-hidden
      className={cn("inline-grid size-[18px] shrink-0 place-items-center rounded-[5px]", className)}
      style={{ background: `color-mix(in srgb, ${sourceColor(source)} 13%, transparent)`, color: sourceColor(source) }}
    >
      <Icon className="size-[11px]" strokeWidth={2.2} />
    </span>
  );
}

/** Evidence as the sources UI reads it; a shared page has no links, only the site's domain. */
export type SourceItem = Evidence & { host?: string };

/** The site a web source came from ("granola.ai"); undefined for app items (mail, docs, chats). */
export const siteOf = (ev: SourceItem) => (ev.source === "web" ? (hostOf(ev.url) ?? ev.host) : undefined);

/** Each app's own logo, so connected apps show the mark people already know. Google's subdomains share one "G". */
const gstatic = (app: string) => `https://ssl.gstatic.com/images/branding/product/2x/${app}_2020q4_48dp.png`;
const APP_LOGO: Record<string, string> = {
  gmail: gstatic("gmail"),
  calendar: gstatic("calendar"),
  drive: gstatic("drive"),
  notion: faviconUrl("notion.so"),
  slack: faviconUrl("slack.com"),
  github: faviconUrl("github.com"),
};

/** An app's or site's real logo, or the app tile when there is none (or it fails to load). */
export function Logo({ source, src = APP_LOGO[source], className }: { source: string; src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <SourceIcon source={source} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 16px third-party icon; next/image would proxy every one
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn("size-[18px] shrink-0 rounded-[5px] bg-white object-contain p-px", className)}
    />
  );
}

/** A web source's favicon, or its app's logo. */
export function Favicon({ ev, className }: { ev: SourceItem; className?: string }) {
  const host = siteOf(ev);
  return <Logo source={ev.source} src={host ? faviconUrl(host) : APP_LOGO[ev.source]} className={className} />;
}

/**
 * The evidence behind an answer, folded into one quiet pill ("[icons] 4 sources"). It opens a sheet of source cards,
 * cited ones first and numbered like the markers in the text; what was searched but not cited stays folded away.
 * `at` is controlled: null closed, "" open at the top, an evidence id open and scrolled to that card.
 */
export function Sources({
  evidence,
  citedIds,
  query = "",
  at,
  onAt,
  className,
}: {
  evidence: SourceItem[];
  citedIds: Set<string>;
  query?: string;
  at: string | null;
  onAt: (at: string | null) => void;
  className?: string;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const items = evidence.filter(Boolean); // a shared answer's evidence is sparse
  const cited = items.filter((e) => citedIds.has(e.id));
  const main = cited.length ? cited : items;
  const rest = cited.length ? items.filter((e) => !citedIds.has(e.id)) : [];
  const faces = main.filter((e, i) => main.findIndex((x) => (siteOf(x) ?? x.source) === (siteOf(e) ?? e.source)) === i).slice(0, 3);

  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (at === null) return void (d.open && d.close());
    if (!d.open) d.showModal();
    if (!at) return;
    const card = d.querySelector<HTMLElement>(`[data-ev="${CSS.escape(at)}"]`);
    if (!card) return;
    const fold = card.closest("details");
    if (fold) fold.open = true;
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
    card.animate([{ backgroundColor: "var(--accent-soft)" }, { backgroundColor: "transparent" }], { duration: 1400, easing: "ease-out" });
  }, [at]);

  if (!main.length) return null;
  const card = (e: SourceItem) => <SourceCard key={e.id} ev={e} n={citedIds.has(e.id) ? evidence.indexOf(e) + 1 : undefined} query={query} />;

  return (
    <>
      <button
        type="button"
        onClick={() => onAt("")}
        aria-haspopup="dialog"
        className={cn(
          "press inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface pr-3 pl-1.5 text-[13px] text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
          className,
        )}
      >
        <span className="flex -space-x-1.5">
          {faces.map((e) => (
            <Favicon key={e.id} ev={e} className="size-5 rounded-full ring-2 ring-surface" />
          ))}
        </span>
        {main.length} source{main.length > 1 ? "s" : ""}
      </button>

      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        onClose={() => onAt(null)}
        onClick={(e) => e.target === e.currentTarget && sheet.current?.close()} // the backdrop
        className="sheet"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line py-2.5 pr-2.5 pl-5">
            <h2 id={titleId} className="text-[15px] font-[600] text-ink">
              Sources <span className="ml-1 font-[400] text-muted tabular-nums">{main.length}</span>
            </h2>
            <button type="button" onClick={() => sheet.current?.close()} aria-label="Close sources" className="press grid size-8 place-items-center rounded-[8px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2.5">
            <ol className="flex flex-col gap-0.5">{main.map(card)}</ol>
            {rest.length > 0 && (
              <details className="group/more mt-3 border-t border-line pt-2">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-[6px] px-2.5 py-1.5 text-[13px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 transition-transform duration-150 group-open/more:rotate-90" aria-hidden />
                  Also searched, not cited · {rest.length}
                </summary>
                <ol className="mt-1 flex flex-col gap-0.5">{rest.map(card)}</ol>
              </details>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function SourceCard({ ev, n, query }: { ev: SourceItem; n?: number; query: string }) {
  const site = siteOf(ev);
  const snippet = cleanSnippet(ev.quote, query, 220);
  const body = (
    <>
      <span className="flex items-center gap-2 text-[12.5px] text-muted">
        {n != null && (
          <span className="inline-grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent-wash px-[4px] font-mono text-[10.5px] font-medium leading-none text-ink-2 ring-1 ring-line-strong/70 ring-inset">{n}</span>
        )}
        <Favicon ev={ev} className="size-4" />
        <span className="min-w-0 truncate">{site ?? sourceName(ev.source)}</span>
        {!site && ev.timestamp && <span className="shrink-0 text-hair">· {shortDate(ev.timestamp)}</span>}
      </span>
      <span className="mt-1 line-clamp-2 block text-[14px] font-[550] leading-snug text-ink">{plainText(ev.title) || site || sourceName(ev.source)}</span>
      {snippet && <span className="mt-0.5 line-clamp-3 block text-[13px] leading-[1.5] text-ink-2">{snippet}</span>}
    </>
  );
  const box = "block rounded-[10px] px-2.5 py-2.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/50";
  return (
    <li data-ev={ev.id} tabIndex={-1} className="scroll-my-4 rounded-[10px] outline-none">
      {ev.url ? (
        <a href={ev.url} target="_blank" rel="noreferrer" className={cn(box, "hover:bg-hover")}>
          {body}
        </a>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}
