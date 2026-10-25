"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CloudOff, RotateCw } from "lucide-react";
import { sourceName, type Evidence, type SourceFailure } from "@cortex/shared";
import { cn, relativeDays, shortDate } from "@/lib/ui";
import { SourceMark } from "./ask/sources";

type Kind = "changed" | "risk" | "conflict" | "upcoming";
interface Card {
  kind: Kind;
  title: string;
  detail: string;
  when: string | null;
  evidence: Evidence[];
}
interface Brief {
  headline: string;
  cards: Card[];
  failures: SourceFailure[];
  generatedAt: string;
  sources: number;
}

const SECTIONS: { kind: Kind; label: string; note: string }[] = [
  { kind: "risk", label: "At risk", note: "Needs attention" },
  { kind: "conflict", label: "Conflicts", note: "Sources disagree" },
  { kind: "upcoming", label: "Upcoming", note: "Next three weeks, by date" },
  { kind: "changed", label: "Changed", note: "Last seven days" },
];

export function BriefView() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState("");
  useEffect(() => setToday(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brief");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't build the brief.");
      setBrief(body as Brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the brief.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-balance text-[32px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[40px]">
              {brief?.headline ?? (loading ? "Reading your sources…" : "Your brief")}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-muted hover:text-ink disabled:opacity-50"
          >
            <RotateCw className={cn("size-3", loading && "animate-spin")} aria-hidden /> Refresh
          </button>
        </div>
        {today && <p className="text-[12.5px] text-muted mt-3">{today}</p>}

        {brief?.failures.map((f) => (
          <p key={f.source} className="mt-5 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-[#7a3d00]">
            <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-[600]">{f.name} is unavailable</strong>: {f.reason}. {f.impact}
            </span>
          </p>
        ))}

        {error && (
          <p role="alert" className="mt-8 text-[15px] text-risk">
            {error}
          </p>
        )}

        {loading && !brief && (
          <div aria-hidden className="mt-10 flex flex-col gap-3">
            {[70, 88, 60, 80].map((w, i) => (
              <span key={i} className="h-4 animate-pulse rounded bg-shell" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {brief && brief.cards.length === 0 && !loading && (
          <div className="mt-12 border-t border-line pt-6 text-[15px] text-muted">
            {brief.sources === 0 ? (
              <>
                No sources are connected yet. <Link href="/connections" className="text-accent-ink underline">Connect an app</Link> or use the sample workspace.
              </>
            ) : (
              "Nothing notable in your sources this week."
            )}
          </div>
        )}

        {brief &&
          SECTIONS.map(({ kind, label, note }) => {
            const cards = brief.cards.filter((c) => c.kind === kind);
            if (kind === "upcoming") cards.sort((a, b) => (a.when ?? "9").localeCompare(b.when ?? "9"));
            if (!cards.length) return null;
            return (
              <section key={kind} className="mt-12" aria-labelledby={`h-${kind}`}>
                <div className="mb-1 flex items-baseline justify-between border-b border-ink pb-2">
                  <h2 id={`h-${kind}`} className={cn("text-[15px] font-[600]", kind === "risk" || kind === "conflict" ? "text-risk" : "text-ink")}>
                    {label}
                  </h2>
                  <span className="text-[12.5px] text-muted">{note}</span>
                </div>
                <ul>
                  {cards.map((c, i) => (
                    <BriefRow key={i} card={c} withDate={cards.some((x) => x.when)} />
                  ))}
                </ul>
              </section>
            );
          })}

        {brief && (
          <p className="readout mt-12 text-hair">
            Generated {new Date(brief.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} from {brief.sources} sources · cached
            20 min
          </p>
        )}
      </div>
    </div>
  );
}

function BriefRow({ card, withDate }: { card: Card; withDate: boolean }) {
  const [open, setOpen] = useState(false);
  const sources = [...new Set(card.evidence.map((e) => e.source))];
  return (
    <li className="border-b border-line">
      <div className={cn("grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4", withDate && "sm:grid-cols-[96px_1fr_auto]")}>
        {withDate && <span className="readout hidden pt-1 text-muted sm:block">{card.when ? shortDate(card.when) : ""}</span>}
        <div className="min-w-0">
          <p className="text-[15.5px] font-[500] leading-snug text-ink">{card.title}</p>
          {!sameText(card.detail, card.title) && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{card.detail}</p>}
          <div className="readout mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            {card.when && <span className="sm:hidden">{shortDate(card.when)}</span>}
            {card.when && <span>{relativeDays(card.when)}</span>}
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 hover:text-ink">
              {sources.map((s) => (
                <SourceMark key={s} source={s} />
              ))}
              {card.evidence.length} source{card.evidence.length > 1 ? "s" : ""}
            </button>
          </div>
          {open && (
            <ul className="mt-3 flex flex-col gap-2 border-l border-line pl-3">
              {card.evidence.map((e) => (
                <li key={e.id} className="text-[13px] leading-snug text-ink-2">
                  <span className="readout mr-1.5 text-muted">{sourceName(e.source)}</span>
                  {e.quote}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-muted hover:text-accent-ink" aria-label="Open source">
                      <ArrowUpRight className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href={`/?q=${encodeURIComponent(`Tell me more: ${card.title}`)}`}
          className="self-start rounded-md px-2 py-1 text-[13px] text-accent-ink hover:bg-accent-soft"
        >
          Ask
        </Link>
      </div>
    </li>
  );
}

function sameText(a: string, b: string) {
  const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !a.trim() || n(a).startsWith(n(b)) || n(b).startsWith(n(a));
}
