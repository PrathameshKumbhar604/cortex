"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STOP_FOLLOWING = 160; // px from the end: the reader has scrolled up to read
const RESUME_FOLLOWING = 40; // back at the end: follow the answer again (hysteresis, so a nudge doesn't flip it)

/**
 * Scrolling for a chat thread. While an answer streams, the view follows it, unless the reader scrolls up, in which
 * case it stays put and offers "Jump to latest". Previous/next move between questions (buttons, Alt+↑ / Alt+↓).
 */
export function useThreadScroll() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [pos, setPos] = useState({ away: false, canPrev: false, canNext: false });

  const turnTops = useCallback(() => {
    const el = scroller.current!;
    const base = el.getBoundingClientRect().top - el.scrollTop;
    return [...content.current!.querySelectorAll<HTMLElement>("[data-turn]")].map((t) => t.getBoundingClientRect().top - base);
  }, []);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el || !content.current) return;
    const toEnd = el.scrollHeight - el.scrollTop - el.clientHeight;
    const tops = turnTops();
    setPos({ away: toEnd > STOP_FOLLOWING, canPrev: tops.some((t) => t < el.scrollTop - 30), canNext: toEnd > 8 && tops.some((t) => t > el.scrollTop + 30) });
    return toEnd;
  }, [turnTops]);

  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const onScroll = () => {
      const toEnd = measure() ?? 0;
      if (toEnd < RESUME_FOLLOWING) following.current = true;
      else if (toEnd > STOP_FOLLOWING) following.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) following.current = false; // reading back stops the follow at once, before any threshold
    };
    // The last answer grows as it streams: keep its end in view while following.
    const ro = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
      measure();
    });
    ro.observe(inner);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);

  const scrollTo = useCallback((top: number) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const toLatest = useCallback(() => {
    following.current = true;
    scrollTo(scroller.current?.scrollHeight ?? 0);
  }, [scrollTo]);

  /** Moves to the previous or next question in the thread; past the last one, to the end. */
  const step = useCallback(
    (dir: -1 | 1) => {
      const el = scroller.current;
      if (!el) return;
      const tops = turnTops();
      const target = dir < 0 ? tops.filter((t) => t < el.scrollTop - 30).at(-1) : tops.find((t) => t > el.scrollTop + 30);
      if (dir < 0) following.current = false;
      if (target === undefined) return dir > 0 ? toLatest() : undefined;
      scrollTo(Math.max(0, target - 24));
    },
    [turnTops, scrollTo, toLatest],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const t = e.target as HTMLElement;
      // Alt+↑/↓ also moves the caret in a text field: only take it over when the field is empty.
      if ((t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) && t.value) return;
      e.preventDefault();
      step(e.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  /** A new question, or a thread being opened: follow from the end again. */
  const follow = useCallback(() => {
    following.current = true;
  }, []);

  return { scroller, content, ...pos, step, toLatest, follow };
}
