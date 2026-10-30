"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowUp, Check, Lock, Quote, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui";
import { SourceMark } from "./ask/sources";
import { Wordmark } from "./shell";

const WORDS = ["inbox", "calendar", "docs", "team chat", "files"];
const QUESTION = "Is anything blocking the Orbit beta?";
const SCENES = ["Ask", "Cite", "Act"] as const;
const SCENE_MS = 3600;
// Where the app chips float around the card (percent of the stage), and how far each drifts with the pointer.
const CHIPS = [
  { id: "gmail", name: "Gmail", x: 2, y: 8, depth: 14, delay: 0 },
  { id: "calendar", name: "Calendar", x: 74, y: 2, depth: 10, delay: 0.6 },
  { id: "slack", name: "Slack", x: 84, y: 46, depth: 18, delay: 1.2 },
  { id: "github", name: "GitHub", x: 70, y: 88, depth: 12, delay: 0.3 },
  { id: "drive", name: "Drive", x: 0, y: 80, depth: 16, delay: 0.9 },
  { id: "notion", name: "Notion", x: -4, y: 44, depth: 8, delay: 1.5 },
] as const;
const SEARCHED = new Set(["gmail", "slack", "github"]);

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * The sign-in page's left half: Cortex shown, not described. A demo card loops through asking, citing and acting
 * (hover pauses it, the tabs jump), app chips float around it and light up as they are searched, and the stage tilts
 * gently with the pointer. Follows the theme; reduced motion keeps the scenes but drops typing, drift and tilt.
 */
export function SignInPromo() {
  const reduce = useReducedMotion();
  const [word, setWord] = useState(0);
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts the progress bar when a tab is clicked

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2400);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [scene, paused, tick]);

  // Pointer parallax: springs, so the stage eases toward the pointer instead of snapping to it (desktop only).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 120, damping: 18, mass: 0.6 });
  const tilt = useTransform([sx, sy], ([x, y]: number[]) => `perspective(1100px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`);
  const fine = useRef(false);
  useEffect(() => {
    fine.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  return (
    <aside
      className="promo-panel relative hidden overflow-hidden border-r border-line bg-shell px-12 py-11 lg:flex lg:flex-col lg:items-center xl:px-16"
      onPointerMove={(e) => {
        if (reduce || !fine.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <div aria-hidden className="promo-glow pointer-events-none absolute -top-48 -left-40 size-[620px] rounded-full" />
      <div aria-hidden className="promo-glow promo-glow-2 pointer-events-none absolute -right-52 -bottom-56 size-[560px] rounded-full" />
      <div aria-hidden className="promo-dots pointer-events-none absolute inset-0" />

      <div className="relative w-full max-w-[540px]">
        <Wordmark />
      </div>

      <div className="relative my-auto w-full max-w-[540px] pt-8">
        <h2 className="text-[42px] font-[250] leading-[1.06] tracking-[-0.04em] text-ink xl:text-[48px]">
          Answers from your
          <br />
          <span className="relative inline-grid align-baseline">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={WORDS[word]}
                className="col-start-1 row-start-1 whitespace-nowrap text-accent-ink"
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(45%)", filter: "blur(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0%)", filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-45%)", filter: "blur(6px)" }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
              >
                {WORDS[word]},
              </motion.span>
            </AnimatePresence>
          </span>
          <br />
          with receipts.
        </h2>

        <motion.div className="relative mt-10 h-[330px]" style={reduce ? undefined : { transform: tilt, transformStyle: "preserve-3d" }}>
          {CHIPS.map((c) => (
            <Chip key={c.id} chip={c} active={scene === 0 && SEARCHED.has(c.id)} sx={sx} sy={sy} reduce={!!reduce} />
          ))}

          <div
            className="absolute inset-x-[9%] top-[13%] rounded-[18px] border border-line bg-surface/95 shadow-[0_40px_80px_-36px_var(--promo-shadow)] backdrop-blur-md"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <div className="flex items-center gap-1.5 px-4 pt-3.5" role="tablist" aria-label="What Cortex does">
              {SCENES.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={scene === i}
                  onClick={() => {
                    setScene(i);
                    setTick((t) => t + 1);
                  }}
                  className="group flex flex-1 flex-col gap-1.5 text-left"
                >
                  <span className="relative h-[3px] overflow-hidden rounded-full bg-line">
                    <span
                      key={`${scene}-${tick}`}
                      className={cn("absolute inset-y-0 left-0 rounded-full bg-accent", i < scene ? "w-full" : i > scene ? "w-0" : "promo-progress w-full")}
                      style={i === scene ? ({ animationDuration: `${SCENE_MS}ms`, animationPlayState: paused ? "paused" : "running" } as React.CSSProperties) : undefined}
                    />
                  </span>
                  <span className={cn("readout transition-colors duration-200", scene === i ? "text-ink-2" : "text-hair group-hover:text-muted")}>{s}</span>
                </button>
              ))}
            </div>
            <div className="relative h-[212px] px-5 pt-3 pb-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={scene}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-6px)", filter: "blur(4px)", transition: { duration: 0.16 } }}
                  transition={{ duration: 0.32, ease: EASE_OUT }}
                >
                  {scene === 0 ? <AskScene reduce={!!reduce} /> : scene === 1 ? <CiteScene /> : <ActScene reduce={!!reduce} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <ul className="mt-9 grid grid-cols-3 gap-4 text-[13px] leading-snug text-muted">
          {[
            { icon: Quote, text: "Every claim links to its source" },
            { icon: Check, text: "Nothing is sent until you approve" },
            { icon: Lock, text: "Remembers priorities, never passwords" },
          ].map(({ icon: Icon, text }, i) => (
            <li key={text} className="rise flex flex-col gap-2" style={{ "--i": i + 3 } as React.CSSProperties}>
              <Icon className="size-4 text-accent-ink" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative flex w-full max-w-[540px] items-center gap-1.5 text-[12px] text-hair">
        <Sparkles className="size-3.5" aria-hidden /> Runs on free AI models. Your apps, files and memories stay yours.
      </p>
    </aside>
  );
}

type ChipSpec = (typeof CHIPS)[number];

function Chip({ chip, active, sx, sy, reduce }: { chip: ChipSpec; active: boolean; sx: ReturnType<typeof useSpring>; sy: ReturnType<typeof useSpring>; reduce: boolean }) {
  // Nearer chips (more depth) drift further against the pointer: a cheap, convincing sense of depth.
  const shift = useTransform([sx, sy], ([x, y]: number[]) => `translate(${(-x * chip.depth).toFixed(1)}px, ${(-y * chip.depth).toFixed(1)}px)`);
  return (
    <motion.div className="absolute z-10" style={{ left: `${chip.x}%`, top: `${chip.y}%`, transform: reduce ? undefined : shift }}>
      <span
        className={cn(
          "promo-float flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] whitespace-nowrap shadow-[0_8px_20px_-12px_var(--promo-shadow)] backdrop-blur-sm transition-[border-color,background-color,color,box-shadow] duration-300",
          active ? "border-accent/60 bg-accent-soft text-ink shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-line bg-surface/80 text-muted",
        )}
        style={{ animationDelay: `${chip.delay}s` }}
      >
        <SourceMark source={chip.id} className={cn("size-2 transition-transform duration-300", active && "scale-125")} />
        {chip.name}
      </span>
    </motion.div>
  );
}

function AskScene({ reduce }: { reduce: boolean }) {
  const [typed, setTyped] = useState(reduce ? QUESTION.length : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setTyped((n) => (n >= QUESTION.length ? n : n + 1)), 34);
    return () => clearInterval(t);
  }, [reduce]);
  const done = typed >= QUESTION.length;
  return (
    <div>
      <div className="rounded-[12px] border border-line-strong bg-shell px-3.5 py-3">
        <p className="min-h-[22px] text-[15px] text-ink">
          {QUESTION.slice(0, typed)}
          {!done && <span className="promo-caret ml-px inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-accent" />}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-md bg-surface px-2 py-0.5 text-[11.5px] text-ink-2">Deep</span>
          <span className={cn("grid size-7 place-items-center rounded-full transition-colors duration-200", done ? "bg-accent text-on-ink" : "bg-line-strong text-muted")}>
            <ArrowUp className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
      <p className={cn("readout mt-3.5 flex items-center gap-2 transition-opacity duration-300", done ? "opacity-100" : "opacity-0")}>
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
        <span className="text-accent-ink">Searching Gmail · Slack · GitHub</span>
      </p>
    </div>
  );
}

function CiteScene() {
  return (
    <div>
      <p className="text-[13px] font-[500] text-muted">{QUESTION}</p>
      <p className="mt-2 text-[15px] leading-[1.6] text-ink">
        <span className="promo-claim" style={{ "--d": "150ms" } as React.CSSProperties}>
          Demo Day moved to Nov 14
          <Cite source="slack" n={1} />
        </span>
        , <span className="promo-claim" style={{ "--d": "550ms" } as React.CSSProperties}>
          but the milestone still says Nov 12
          <Cite source="github" n={2} />
        </span>
        . <span className="promo-claim" style={{ "--d": "950ms" } as React.CSSProperties}>
          The Android login bug is still open
          <Cite source="gmail" n={3} />
        </span>
        .
      </p>
      <p className="readout mt-3 flex items-center gap-1.5 text-accent-ink">
        <svg viewBox="0 0 12 12" className="promo-tick size-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
        <span className="promo-fade">Verified 3/3 · 3 sources</span>
      </p>
    </div>
  );
}

function Cite({ source, n }: { source: string; n: number }) {
  return (
    <span className="promo-cite ml-[2px] inline-flex -translate-y-[0.35em] items-center gap-[3px] font-mono text-[11px] leading-none text-accent-ink">
      <SourceMark source={source} className="size-[5px]" />
      {n}
    </span>
  );
}

function ActScene({ reduce }: { reduce: boolean }) {
  // The approve button presses itself, then the card stamps "Done": the moment Cortex is built around.
  const [phase, setPhase] = useState<"ready" | "press" | "done">(reduce ? "done" : "ready");
  useEffect(() => {
    if (reduce) return;
    const a = setTimeout(() => setPhase("press"), 1300);
    const b = setTimeout(() => setPhase("done"), 1480);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [reduce]);
  return (
    <div className="rounded-[12px] border border-line-strong bg-shell p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-[550] text-ink">Email Priya the new demo date</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <SourceMark source="gmail" /> Gmail · {phase === "done" ? "Sent" : "Needs your approval"}
          </p>
        </div>
        <AnimatePresence>
          {phase === "done" && (
            <motion.span
              initial={{ opacity: 0, transform: "scale(0.8)", filter: "blur(3px)" }}
              animate={{ opacity: 1, transform: "scale(1)", filter: "blur(0px)" }}
              transition={{ type: "spring", duration: 0.45, bounce: 0.35 }}
              className="readout flex items-center gap-1 text-ok"
            >
              <Check className="size-3.5" aria-hidden /> Done
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-2.5 rounded-md bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-2">Hi Priya, Demo Day is now on Nov 14. The beta build ships the day before.</p>
      <div className="mt-2.5 flex justify-end gap-2">
        <span className="rounded-md border border-line-strong px-2.5 py-1 text-[12px] text-ink-2">Edit</span>
        <span
          className={cn(
            "rounded-md px-2.5 py-1 text-[12px] font-[550] transition-[scale,background-color,opacity] duration-150",
            phase === "press" && "scale-[0.95]",
            phase === "done" ? "bg-line-strong text-muted" : "bg-ink text-on-ink",
          )}
        >
          Approve & send
        </span>
      </div>
    </div>
  );
}
