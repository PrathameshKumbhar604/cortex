"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RotateCw } from "lucide-react";
import { explainError, explainFailure, sourceName, type Evidence, type SourceFailure } from "@cortex/shared";
import { Problem } from "./problem";
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

const PICK = "cortex.briefSources";
const INTRO = "cortex.briefIntro";

function readPick(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(PICK) ?? "null");
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

export function BriefView() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [pick, setPick] = useState<string[] | null>(null);
  const [picked, setPicked] = useState(false); // the saved choice has been read; fetch only after, so it's never built twice
  const [available, setAvailable] = useState<{ id: string; name: string }[]>([]);
  const [intro, setIntro] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
    setPick(readPick());
    setPicked(true);
    try {
      setIntro(!localStorage.getItem(INTRO));
    } catch {}
    fetch("/api/connections")
      .then((r) => r.json())
      .then((d: { connectors: { id: string; name: string; connected: boolean }[] }) => setAvailable(d.connectors.filter((c) => c.connected && c.id !== "web")))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      setError(null);
      const q = new URLSearchParams();
      if (pick) q.set("sources", pick.join(","));
      if (refresh) q.set("refresh", "1");
      try {
        const res = await fetch(`/api/brief?${q}`);
        const body = (await res.json()) as { brief: Brief | null; generating: boolean; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Couldn't build the brief.");
        setBrief(body.brief);
        setGenerating(body.generating);
        if (body.error && !body.generating) setError(body.error);
      } catch (e) {
        setGenerating(false);
        setError(e instanceof Error ? e.message : "Couldn't build the brief.");
      }
    },
    [pick],
  );

  useEffect(() => {
    if (picked) void load();
  }, [load, picked]);
  // The brief builds on the server in the background; check back while it does (the page never waits on it).
  useEffect(() => {
    if (!generating || !picked) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [generating, picked, load]);

  const savePick = (ids: string[]) => {
    const next = ids.length && ids.length < available.length ? ids : null;
    try {
      if (next) localStorage.setItem(PICK, JSON.stringify(next));
      else localStorage.removeItem(PICK);
    } catch {}
    setPick(next);
    setGenerating(true);
  };
  const covered = available.filter((a) => !pick || pick.includes(a.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        {intro && (
          <div className="rise mb-10 flex flex-col gap-3 rounded-[14px] border border-line bg-shell p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[15px] font-[600] text-ink">Your Brief, in one glance</p>
              <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">
                Cortex reads your connected apps and pulls out what is at risk, where sources disagree, what is coming up and what changed, each
                with its sources. It refreshes in the background every few hours, so it is ready when you open it. Press Ask on any item to dig in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIntro(false);
                try {
                  localStorage.setItem(INTRO, "seen");
                } catch {}
              }}
              className="shrink-0 self-start rounded-[10px] bg-ink px-3 py-1.5 text-[13px] font-[550] text-on-ink hover:bg-ink-2"
            >
              Got it
            </button>
          </div>
        )}

        <div className="flex items-start justify-between gap-6">
          <h1 className="text-balance text-[32px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[40px]">
            {brief?.headline ?? (generating ? "Putting your brief together…" : "Your brief")}
          </h1>
          <button
            type="button"
            onClick={() => {
              setGenerating(true);
              void load(true);
            }}
            disabled={generating}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] text-muted hover:text-ink disabled:opacity-60"
          >
            <RotateCw className={cn("size-3", generating && "animate-spin")} aria-hidden /> {generating ? "Updating" : "Refresh"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {today && <span>{today}</span>}
          {available.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>Covers</span>
              {covered.map((c) => (
                <span key={c.id} className="flex items-center gap-1 text-ink-2">
                  <SourceMark source={c.id} />
                  {c.name}
                </span>
              ))}
              <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="text-accent-ink hover:underline">
                {editing ? "Done" : "Choose"}
              </button>
            </>
          )}
        </div>
        {editing && (
          <fieldset className="enter mt-3 flex flex-wrap gap-2">
            <legend className="sr-only">Sources the brief covers</legend>
            {available.map((c) => {
              const on = !pick || pick.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                    on ? "border-accent/50 bg-accent-wash text-ink" : "border-line text-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => {
                      const current = pick ?? available.map((a) => a.id);
                      const next = on ? current.filter((x) => x !== c.id) : [...current, c.id];
                      if (next.length) savePick(next); // at least one source stays on
                    }}
                  />
                  <SourceMark source={c.id} />
                  {c.name}
                </label>
              );
            })}
          </fieldset>
        )}

        {brief && brief.failures.length > 0 && (
          <ul className="mt-5 flex flex-col gap-1.5">
            {brief.failures.map((f) => (
              <li key={f.source}>
                <Problem problem={explainFailure(f)} onRetry={() => void load(true)} />
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mt-8">
            <Problem problem={explainError(error)} onRetry={() => { setGenerating(true); void load(true); }} variant="card" />
          </div>
        )}

        {!brief && generating && (
          <div className="mt-10">
            <p className="text-[14px] text-muted">
              This runs in the background and takes about half a minute. You can keep using Cortex; it will be here when you come back.
            </p>
            <div aria-hidden className="mt-6 flex flex-col gap-3">
              {[70, 88, 60, 80].map((w, i) => (
                <span key={i} className="h-4 animate-pulse rounded bg-shell" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        )}

        {brief && brief.cards.length === 0 && (
          <div className="mt-12 border-t border-line pt-8">
            {brief.sources === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-[17px] font-[500] text-ink">Connect an app to get your first brief</p>
                <p className="max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
                  The brief is built from your Gmail, Calendar, Drive, Notion, Slack, GitHub and uploaded files. Connect one, or switch to the sample
                  workspace to see what a brief looks like.
                </p>
                <Link href="/connections" className="mt-1 rounded-[10px] bg-ink px-3.5 py-2 text-[13.5px] font-[550] text-on-ink hover:bg-ink-2">
                  Connect an app
                </Link>
              </div>
            ) : (
              <p className="text-[15px] text-muted">Nothing notable in your sources this week.</p>
            )}
          </div>
        )}

        {brief &&
          SECTIONS.map(({ kind, label, note }) => {
            const cards = brief.cards.filter((c) => c.kind === kind);
            if (kind === "upcoming") cards.sort((a, b) => (a.when ?? "9").localeCompare(b.when ?? "9"));
            if (!cards.length) return null;
            return (
              <section key={kind} className="rise mt-12" aria-labelledby={`h-${kind}`}>
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
            Updated {new Date(brief.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} from {brief.sources} sources ·
            refreshes in the background every 3 hours
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
