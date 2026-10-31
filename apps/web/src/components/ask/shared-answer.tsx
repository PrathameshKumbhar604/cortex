"use client";

import { useMemo, useState } from "react";
import type { Evidence } from "@cortex/shared";
import type { SharedSource } from "@/lib/share";
import { Answer } from "./answer";
import { Sources } from "./sources";

function jump(id: string) {
  const el = document.getElementById(`ev-${id}`);
  el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el?.focus({ preventScroll: true });
}

/** A shared answer, rendered with the same answer and source components as the app, read-only. */
export function SharedAnswer({ answer, sources }: { answer: string; sources: SharedSource[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  // Sparse on purpose: citation [n] reads evidence[n - 1], and only cited sources were kept.
  const evidence = useMemo(() => {
    const ev: Evidence[] = [];
    for (const s of sources) ev[s.n - 1] = { id: `s${s.n}`, source: s.source as Evidence["source"], title: s.title, quote: s.quote, timestamp: s.date };
    return ev;
  }, [sources]);
  const cited = useMemo(() => new Set(sources.map((s) => `s${s.n}`)), [sources]);
  return (
    <>
      <Answer text={answer} claims={[]} evidence={evidence} verified streaming={false} onCite={setHovered} onJump={jump} />
      {sources.length > 0 && <Sources evidence={evidence} citedIds={cited} hovered={hovered} />}
    </>
  );
}
