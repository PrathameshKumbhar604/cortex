"use client";

import { ArrowUpRight } from "lucide-react";
import { sourceName, type Evidence } from "@cortex/shared";
import { cn, shortDate, sourceColor } from "@/lib/ui";

export function SourceMark({ source, className }: { source: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={{ background: sourceColor(source) }} />;
}

/** Evidence the answer cites, in a hairline grid. Hovering a citation lifts its row. */
export function Sources({ evidence, citedIds, hovered }: { evidence: Evidence[]; citedIds: Set<string>; hovered: string | null }) {
  const cited = evidence.filter((e) => citedIds.has(e.id));
  const rest = evidence.filter((e) => !citedIds.has(e.id));
  const items = cited.length ? cited : evidence.slice(0, 6);
  if (!items.length) return null;
  return (
    <section aria-label="Sources" className="mt-2">
      <div className="readout mb-2 flex items-center justify-between text-muted">
        <span>{cited.length ? `${cited.length} cited` : "Evidence"}</span>
        {rest.length > 0 && cited.length > 0 && <span>{rest.length} more searched</span>}
      </div>
      <ol className="grid grid-cols-1 gap-y-px border-y border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => {
          const n = evidence.indexOf(e) + 1;
          const dim = hovered && hovered !== e.id;
          return (
            <li
              key={e.id}
              id={`ev-${e.id}`}
              className={cn(
                "scroll-mt-24 bg-surface py-3 pr-4 transition-[opacity,background-color] duration-300",
                hovered === e.id && "bg-[#f4f5ff]",
                dim && "opacity-40",
              )}
            >
              <div className="readout mb-1 flex items-center gap-1.5 text-muted">
                <SourceMark source={e.source} />
                <span className="text-accent-ink">{n}</span>
                <span className="truncate">
                  {sourceName(e.source)}
                  {e.author ? ` · ${e.author.replace(/\s*<.*>/, "")}` : ""}
                  {e.timestamp ? ` · ${shortDate(e.timestamp)}` : ""}
                </span>
              </div>
              <p className="text-[13px] font-[550] leading-snug text-ink">{e.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.45] text-ink-2">{e.quote}</p>
              {e.url && (
                <a href={e.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-muted hover:text-accent-ink">
                  Open <ArrowUpRight className="size-3" aria-hidden />
                </a>
              )}
            </li>
          );
        })}
        {/* Fillers keep the hairline grid square when the last row is short. */}
        {Array.from({ length: (6 - (items.length % 6)) % 6 }, (_, i) => (
          <li
            key={`f${i}`}
            aria-hidden
            className={cn(
              "hidden bg-surface",
              i < (2 - (items.length % 2)) % 2 && "sm:block lg:hidden",
              i < (3 - (items.length % 3)) % 3 && "lg:block",
            )}
          />
        ))}
      </ol>
    </section>
  );
}
