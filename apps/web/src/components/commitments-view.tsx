"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, RotateCw } from "lucide-react";
import { explainError, explainFailure, sourceName, type Evidence, type SourceFailure } from "@cortex/shared";
import { Problem } from "./problem";
import { cn, relativeDays, shortDate } from "@/lib/ui";
import { SourceMark } from "./ask/sources";

type Status = "overdue" | "at_risk" | "open" | "kept";
interface Commitment {
  owner: string;
  mine: boolean;
  to: string | null;
  what: string;
  due: string | null;
  status: Status;
  reason: string;
  promise: Evidence[];
  proof: Evidence[];
}
interface Radar {
  commitments: Commitment[];
  failures: SourceFailure[];
  generatedAt: string;
  sources: number;
}

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  overdue: { label: "Overdue", dot: "bg-risk", text: "text-risk" },
  at_risk: { label: "At risk", dot: "bg-warn", text: "text-warn-ink" },
  open: { label: "Open", dot: "bg-hair", text: "text-ink-2" },
  kept: { label: "Kept", dot: "bg-ok", text: "text-ok" },
};
const FILTERS = [
  { id: "mine", label: "You promised" },
  { id: "others", label: "Others promised" },
  { id: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

export function CommitmentsView() {
  const [radar, setRadar] = useState<Radar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/commitments");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't check your commitments.");
      setRadar(body as Radar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check your commitments.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const all = radar?.commitments ?? [];
  const shown = all.filter((c) => filter === "all" || (filter === "mine") === c.mine);
  const count = (s: Status) => shown.filter((c) => c.status === s).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <p className="readout flex items-center gap-2 text-muted">
          <span className="rounded-full border border-accent/40 bg-accent-wash px-2 py-px text-accent-ink">Experimental</span>
          Commitments radar
        </p>
        <div className="mt-3 flex items-start justify-between gap-6">
          <h1 className="text-balance text-[32px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[40px]">
            {loading && !radar ? "Reading your threads for promises…" : "Promises made, and whether they were kept"}
          </h1>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-muted hover:text-ink disabled:opacity-60"
          >
            <RotateCw className={cn("size-3", loading && "animate-spin")} aria-hidden /> {loading ? "Checking" : "Re-check"}
          </button>
        </div>
        <p className="mt-3 max-w-[64ch] text-[14.5px] leading-relaxed text-ink-2">
          Cortex finds the promises in your mail, chat, docs and issues, then checks the other apps for proof each one was kept. Every verdict
          shows the message where it was promised and the evidence it was judged on.
        </p>

        {radar && radar.failures.length > 0 && (
          <ul className="mt-5 flex flex-col gap-1.5">
            {radar.failures.map((f) => (
              <li key={f.source}>
                <Problem problem={explainFailure(f)} onRetry={() => void load()} />
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="mt-8">
            <Problem problem={explainError(error)} onRetry={() => void load()} variant="card" />
          </div>
        )}

        {loading && !radar && (
          <div aria-hidden className="mt-10 flex flex-col gap-3">
            {[72, 90, 64, 84].map((w, i) => (
              <span key={i} className="h-4 animate-pulse rounded bg-shell" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {radar && all.length === 0 && !error && (
          <div className="mt-12 flex flex-col items-start gap-3 border-t border-line pt-8">
            {radar.sources === 0 ? (
              <>
                <p className="text-[17px] font-[500] text-ink">Connect an app to find your commitments</p>
                <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
                  Commitments come from Gmail, Slack, GitHub, Notion, Calendar and your files. Connect one, or switch to the sample workspace.
                </p>
                <Link href="/connections" className="mt-1 rounded-[10px] bg-ink px-3.5 py-2 text-[13.5px] font-[550] text-on-ink hover:bg-ink-2">
                  Connect an app
                </Link>
              </>
            ) : (
              <p className="text-[15px] text-muted">No promises found in the last 30 days of your sources.</p>
            )}
          </div>
        )}

        {all.length > 0 && (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <div role="radiogroup" aria-label="Whose commitments" className="flex rounded-[10px] border border-line p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "rounded-[8px] px-3 py-1 text-[13px] transition-colors",
                      filter === f.id ? "bg-pressed font-[550] text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="readout flex flex-wrap gap-x-3 text-muted" aria-live="polite">
                {(Object.keys(STATUS) as Status[]).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-1.5 rounded-full", STATUS[s].dot)} />
                    {count(s)} {STATUS[s].label.toLowerCase()}
                  </span>
                ))}
              </p>
            </div>
            <ul className="mt-4 border-t border-ink">
              {shown.map((c, i) => (
                <Row key={`${filter}-${c.what}`} c={c} i={i} />
              ))}
              {shown.length === 0 && <li className="py-6 text-[14px] text-muted">Nothing here.</li>}
            </ul>
          </>
        )}

        {radar && (
          <p className="readout mt-12 text-hair">
            Checked {new Date(radar.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} across {radar.sources} sources ·
            the model proposes, Cortex only marks a promise kept when another source shows it done
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ c, i }: { c: Commitment; i: number }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[c.status];
  const sources = [...new Set([...c.promise, ...c.proof].map((e) => e.source))];
  return (
    <li className="rise border-b border-line" style={{ "--i": i } as React.CSSProperties}>
      <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4 sm:grid-cols-[92px_1fr_auto]">
        <span className={cn("readout flex items-center gap-1.5 self-start pt-1 max-sm:col-span-2", s.text)}>
          <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
          {s.label}
        </span>
        <div className="min-w-0">
          <p className="text-[15.5px] font-[500] leading-snug text-ink">{c.what}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-muted">
            <span className={cn(c.mine && "font-[550] text-ink-2")}>{c.owner}</span>
            {c.to && (
              <>
                <ArrowRight className="size-3" aria-label="to" />
                <span>{c.to}</span>
              </>
            )}
            {c.due && (
              <span>
                · due {shortDate(c.due)} ({relativeDays(c.due)})
              </span>
            )}
          </p>
          {c.reason && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{c.reason}</p>}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="readout mt-2 flex items-center gap-1.5 text-muted hover:text-ink"
          >
            {sources.map((x) => (
              <SourceMark key={x} source={x} />
            ))}
            {open ? "Hide evidence" : `Evidence: ${c.promise.length} promise, ${c.proof.length} proof`}
          </button>
          {open && (
            <div className="enter mt-3 flex flex-col gap-3 border-l border-line pl-3">
              <Quotes label="Promised in" items={c.promise} />
              {c.proof.length > 0 ? <Quotes label="Checked against" items={c.proof} /> : <p className="text-[13px] text-muted">No other source mentions it yet.</p>}
            </div>
          )}
        </div>
        <Link
          href={`/?q=${encodeURIComponent(`What's the status of: ${c.what}`)}`}
          className="self-start rounded-md px-2 py-1 text-[13px] text-accent-ink hover:bg-accent-soft"
        >
          Ask
        </Link>
      </div>
    </li>
  );
}

function Quotes({ label, items }: { label: string; items: Evidence[] }) {
  return (
    <div>
      <p className="readout mb-1 text-hair">{label}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((e) => (
          <li key={e.id} className="text-[13px] leading-snug text-ink-2">
            <span className="readout mr-1.5 text-muted">
              {sourceName(e.source)}
              {e.timestamp ? ` · ${shortDate(e.timestamp)}` : ""}
            </span>
            {e.quote}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-muted hover:text-accent-ink" aria-label={`Open ${e.title}`}>
                <ArrowUpRight className="size-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
