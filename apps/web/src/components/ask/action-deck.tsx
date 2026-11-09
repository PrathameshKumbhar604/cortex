"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { ActionProposal } from "@cortex/shared";
import { cn } from "@/lib/ui";
import { ActionCard } from "./action-card";

const SETTLED = new Set(["executed", "rejected"]);
const LINGER_MS = 1200; // long enough to see the Done / Declined stamp spring in

/**
 * The approval cards for one answer. Several at once sit in a swipeable carousel, one card each; a card leaves once
 * it is done or declined (after its stamp shows), a failed one stays so the reason can be read. A quiet line counts
 * what was decided. One card on its own looks exactly as before.
 */
export function ActionDeck({ actions, onDecide }: { actions: ActionProposal[]; onDecide: (id: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void> }) {
  const reduce = useReducedMotion();
  // Decided before this deck was on screen (an old chat): gone at once. Decided here: gone after the stamp.
  const [gone, setGone] = useState(() => new Set(actions.filter((a) => SETTLED.has(a.status)).map((a) => a.id)));
  useEffect(() => {
    const fresh = actions.filter((a) => SETTLED.has(a.status) && !gone.has(a.id));
    if (!fresh.length) return;
    const t = setTimeout(() => setGone((g) => new Set([...g, ...fresh.map((a) => a.id)])), LINGER_MS);
    return () => clearTimeout(t);
  }, [actions, gone]);

  const shown = actions.filter((a) => !gone.has(a.id));
  const done = actions.filter((a) => a.status === "executed").length;
  const declined = actions.filter((a) => a.status === "rejected").length;
  const tally = [done && `${done} done`, declined && `${declined} declined`].filter(Boolean).join(" · ");

  return (
    <div>
      {shown.length > 1 ? (
        <Carousel actions={shown} onDecide={onDecide} />
      ) : (
        <AnimatePresence initial={false}>
          {shown.map((a) => (
            <motion.div key={a.id} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}>
              <ActionCard proposal={a} onDecide={(d, e) => onDecide(a.id, d, e)} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      {tally && actions.length > shown.length && (
        <p className="readout mt-3 flex items-center gap-1.5 text-muted" aria-live="polite">
          <Check className="size-3.5 text-ok" aria-hidden /> {tally}
        </p>
      )}
    </div>
  );
}

function Carousel({ actions, onDecide }: { actions: ActionProposal[]; onDecide: (id: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<void> }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const count = actions.length;
  const index = Math.min(at, count - 1);

  // Which card is in view, from the scroll position (cards are equal width and snap).
  const onScroll = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    setAt(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
  };
  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[Math.max(0, Math.min(count - 1, i))] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: reduce ? "auto" : "smooth" });
  };
  // A card leaving can pull the view past the end; keep the counter honest.
  useEffect(() => onScroll(), [count]);

  const btn = "press grid size-8 place-items-center rounded-[8px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:text-line-strong";
  return (
    <section aria-roledescription="carousel" aria-label="Actions waiting for your approval" className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="readout text-muted" aria-live="polite">
          Needs your approval · {index + 1} of {count}
        </p>
        <div className="flex items-center">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous action" className={btn}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label="Next action" className={btn}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div
        ref={track}
        onScroll={onScroll}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <AnimatePresence initial={false}>
          {actions.map((a, i) => (
            <motion.div
              key={a.id}
              layout={!reduce}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${a.title}`}
              // The next card peeks in, so it's clear there is more to swipe to.
              className={cn("w-[88%] shrink-0 snap-start [&>div]:mt-0", count === 1 && "w-full")}
            >
              <ActionCard proposal={a} onDecide={(d, e) => onDecide(a.id, d, e)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-1 flex justify-center gap-1.5" aria-hidden>
        {actions.map((a, i) => (
          <span key={a.id} className={cn("size-1.5 rounded-full transition-colors duration-200", i === index ? "bg-accent" : "bg-line-strong")} />
        ))}
      </div>
    </section>
  );
}
