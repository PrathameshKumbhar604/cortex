"use client";

import { ArrowUpRight, Brain, Calendar, ChevronRight, FileText, GitBranch, Globe, HardDrive, Hash, Mail, NotebookText, Paperclip, type LucideIcon } from "lucide-react";
import { sourceName, type Evidence } from "@cortex/shared";
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

/**
 * The evidence behind an answer, grouped by app and numbered exactly like the markers in the text.
 * What was searched but not cited stays folded away until asked for.
 */
export function Sources({ evidence, citedIds, hovered }: { evidence: Evidence[]; citedIds: Set<string>; hovered: string | null }) {
  const cited = evidence.filter((e) => citedIds.has(e.id));
  const shown = cited.length ? cited : evidence.slice(0, 6);
  const rest = evidence.filter((e) => !shown.includes(e));
  if (!shown.length) return null;
  const apps = [...new Set(shown.map((e) => e.source))];
  const row = (e: Evidence, i: number) => <SourceRow key={e.id} ev={e} n={evidence.indexOf(e) + 1} i={i} active={hovered === e.id} />;

  return (
    <section aria-label="Sources" className="mt-2 border-t border-line pt-4">
      <h3 className="readout mb-2 flex items-center gap-2 text-muted">
        {cited.length ? `${cited.length} source${cited.length > 1 ? "s" : ""} cited` : "Evidence"}
        <span className="flex -space-x-1">
          {apps.map((s) => (
            <SourceIcon key={s} source={s} className="ring-2 ring-surface" />
          ))}
        </span>
      </h3>

      {apps.map((s) => {
        const items = shown.filter((e) => e.source === s);
        return (
          <div key={s} className="mt-1">
            {apps.length > 1 && (
              <p className="readout flex items-center gap-1.5 pt-2 pb-0.5 text-muted">
                {sourceName(s)} <span className="text-hair">{items.length}</span>
              </p>
            )}
            <ol className="-mx-2 flex flex-col">{items.map(row)}</ol>
          </div>
        );
      })}

      {rest.length > 0 && (
        <details className="group/more mt-3">
          <summary className="readout -mx-2 flex w-fit cursor-pointer list-none items-center gap-1 rounded-[6px] px-2 py-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3 transition-transform duration-150 group-open/more:rotate-90" aria-hidden />
            {cited.length ? "Also searched, not cited" : "More evidence"} · {rest.length}
          </summary>
          <ol className="-mx-2 mt-1 flex flex-col">{rest.map(row)}</ol>
        </details>
      )}
    </section>
  );
}

function SourceRow({ ev, n, i, active }: { ev: Evidence; n: number; i: number; active: boolean }) {
  const author = ev.author?.replace(/\s*<.*>/, "");
  return (
    <li
      id={`ev-${ev.id}`}
      tabIndex={-1}
      style={{ "--i": i } as React.CSSProperties}
      className={cn(
        "rise group/row flex scroll-mt-24 items-start gap-3 rounded-[8px] px-2 py-2 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/50",
        active && "bg-accent-wash",
      )}
    >
      <span className={cn("mt-px inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1 font-mono text-[10.5px] font-medium leading-none ring-1 ring-inset", active ? "bg-accent-soft text-accent-ink ring-transparent" : "bg-accent-wash text-ink-2 ring-line-strong/70")}>
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-[13.5px] font-[550] leading-snug text-ink">{ev.title}</span>
          {ev.timestamp && <span className="readout shrink-0 text-muted">{shortDate(ev.timestamp)}</span>}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[13px] leading-[1.45] text-ink-2">
          {author && <span className="text-muted">{author} · </span>}
          {ev.quote}
        </p>
      </div>
      {ev.url && (
        <a
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source ${n} in ${sourceName(ev.source)}`}
          className="grid size-7 shrink-0 place-items-center rounded-[6px] text-muted hover:bg-shell hover:text-accent-ink"
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      )}
    </li>
  );
}
