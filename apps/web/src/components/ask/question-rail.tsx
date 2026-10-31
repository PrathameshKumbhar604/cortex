"use client";

import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/ui";

/**
 * A slim rail of tick marks on the thread's right edge, one per question. The question in view is the long, dark
 * tick; hovering or focusing a tick shows its question; clicking jumps there. Alt+↑ / Alt+↓ do the same from the
 * keyboard (useThreadScroll). Hidden at phone width, where there is no room beside the text.
 */
export function QuestionRail({
  questions,
  scroller,
  content,
  onJump,
}: {
  questions: string[];
  scroller: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  onJump: (i: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const n = questions.length;

  useEffect(() => {
    const root = scroller.current;
    const inner = content.current;
    if (!root || !inner || n < 2) return;
    const sections = [...inner.querySelectorAll<HTMLElement>("[data-turn]")];
    const seen = new Set<number>();
    const atEnd = () => root.scrollHeight - root.scrollTop - root.clientHeight < 8;
    const pick = () => setCurrent(atEnd() ? sections.length - 1 : seen.size ? Math.min(...seen) : 0);
    // The question whose section crosses a line 35% down the view is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = sections.indexOf(e.target as HTMLElement);
          if (e.isIntersecting) seen.add(i);
          else seen.delete(i);
        }
        pick();
      },
      { root, rootMargin: "-35% 0px -64% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    // A short last answer never reaches that line: at the very end, it is the current one.
    const onScroll = () => atEnd() && pick();
    const ro = new ResizeObserver(() => setOverflows(root.scrollHeight > root.clientHeight + 1));
    ro.observe(inner);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      ro.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [scroller, content, n]);

  if (n < 2 || (n < 3 && !overflows)) return null;

  return (
    <nav
      aria-label="Questions in this chat"
      className="absolute top-1/2 right-1 z-20 hidden max-h-[70%] -translate-y-1/2 flex-col sm:flex md:right-3"
    >
      {questions.map((q, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          aria-current={i === current ? "location" : undefined}
          aria-label={`Question ${i + 1}: ${q}`}
          className="group relative flex min-h-[6px] max-h-4 flex-1 basis-4 items-center justify-end px-1.5 outline-none"
        >
          <span
            aria-hidden
            className={cn(
              "h-[2px] rounded-full transition-[width,background-color] duration-150 ease-out",
              i === current ? "w-4 bg-ink" : "w-2.5 bg-line-strong group-hover:w-4 group-hover:bg-ink-2 group-focus-visible:w-4 group-focus-visible:bg-ink-2",
            )}
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 right-full mr-1 w-max max-w-[min(280px,50vw)] -translate-y-1/2 origin-right rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-left text-[12.5px] leading-snug text-ink-2 shadow-[0_8px_24px_-12px_rgb(14_17_22/0.3)]",
              "invisible scale-[0.97] opacity-0 transition-[opacity,scale,visibility] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-focus-visible:visible group-focus-visible:scale-100 group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:visible [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:opacity-100",
            )}
          >
            <span className="line-clamp-2">{q}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
