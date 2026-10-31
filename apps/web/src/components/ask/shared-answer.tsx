"use client";

import { useMemo, useState } from "react";
import type { SharedSource } from "@/lib/share";
import { Answer } from "./answer";
import { Sources, type SourceItem } from "./sources";

/** A shared answer, rendered with the same answer and source components as the app, read-only. */
export function SharedAnswer({ answer, sources }: { answer: string; sources: SharedSource[] }) {
  const [sheetAt, setSheetAt] = useState<string | null>(null);
  // Sparse on purpose: citation [n] reads evidence[n - 1], and only cited sources were kept.
  const evidence = useMemo(() => {
    const ev: SourceItem[] = [];
    for (const s of sources) ev[s.n - 1] = { id: `s${s.n}`, source: s.source as SourceItem["source"], title: s.title, quote: s.quote, timestamp: s.date, host: s.host };
    return ev;
  }, [sources]);
  const cited = useMemo(() => new Set(sources.map((s) => `s${s.n}`)), [sources]);
  return (
    <>
      <Answer text={answer} claims={[]} evidence={evidence} verified streaming={false} onJump={setSheetAt} />
      {sources.length > 0 && <Sources evidence={evidence} citedIds={cited} at={sheetAt} onAt={setSheetAt} className="mt-1" />}
    </>
  );
}
