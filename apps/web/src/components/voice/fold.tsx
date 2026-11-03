"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Logo } from "../ask/sources";

export type FoldState = "starting" | "listening" | "hearing" | "thinking" | "speaking" | "paused";

// Cortex's mark is an open "C" folding in on itself. Voice mode draws it as three concentric open arcs and a centre
// point, stroked in the voice's colour, and moves it as ONE object: a single smoothed sound level drives a single
// spring; each arc sees the same signal a little later and a little weaker than the one inside it, so energy flows
// outward like a ripple. All arcs share one rotation, so the gaps stay lined up and the C stays a C.
const RINGS = [
  { r: 26, gap: 96, width: 3.6, opacity: 1 },
  { r: 38, gap: 82, width: 3, opacity: 0.62 },
  { r: 50, gap: 70, width: 2.4, opacity: 0.34 },
] as const;

/** The tuned constants (reported with the feature). */
export const FOLD = {
  attackMs: 50, // level envelope: rises fast…
  releaseMs: 250, // …falls gently
  rippleDelayMs: [0, 45, 90], // each arc hears the level this much later
  rippleGain: [1, 0.72, 0.5], // and this much weaker
  levelScale: 0.05, // full level grows the inner arc by 5 %
  spring: { responseS: 0.32, damping: 0.86 }, // one spring for every arc's scale (slightly under-damped)
  rotate: { thinkingDegPerS: 28, responseS: 0.9 }, // one shared, slow rotation while thinking; springs home after
  breathe: { periodS: 4.8, amount: 0.012 }, // listening at rest
  poses: { starting: 0.93, listening: 1, hearing: 1, thinking: 0.95, speaking: 1, paused: 0.97 } as Record<FoldState, number>,
  dim: { starting: 0.5, paused: 0.5 } as Partial<Record<FoldState, number>>,
};

/**
 * One rAF loop, transform and opacity only, written straight onto the arcs (no React renders per frame). A state change
 * only moves the spring's target, so it is always continuous and can be interrupted at any moment. Reduced motion:
 * the static mark, breathing in opacity alone.
 */
export function Fold({ state, levels, color, sources }: { state: FoldState; levels: () => { mic: number; out: number }; color: [string, string]; sources: { id: string; lit: boolean }[] }) {
  const rings = useRef<(SVGGElement | null)[]>([]);
  const dot = useRef<SVGCircleElement>(null);
  const stateRef = useRef(state);
  useEffect(() => void (stateRef.current = state), [state]);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trail: { t: number; v: number }[] = []; // the smoothed level over the last ~120 ms, for the ripple delays
    let env = 0;
    const scale = RINGS.map(() => ({ x: 0.93, v: 0 }));
    const dotS = { x: 1, v: 0 };
    const rot = { x: 0, v: 0, target: 0 };
    let opacity = 0.5;
    let raf = 0;
    let last = performance.now();
    const k = (response: number) => (2 * Math.PI / response) ** 2;
    const step = (s: { x: number; v: number }, target: number, response: number, damping: number, dt: number) => {
      const stiff = k(response);
      s.v += (-stiff * (s.x - target) - 2 * damping * Math.sqrt(stiff) * s.v) * dt;
      s.x += s.v * dt;
    };
    const levelAt = (now: number, delay: number) => {
      for (const p of trail) if (now - p.t >= delay) return p.v;
      return trail.at(-1)?.v ?? 0;
    };
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const { mic, out } = levels();
      const raw = st === "speaking" ? out : st === "listening" || st === "hearing" ? mic : 0;
      const tau = (raw > env ? FOLD.attackMs : FOLD.releaseMs) / 1000;
      env += (raw - env) * (1 - Math.exp(-dt / tau));
      trail.unshift({ t: now, v: env });
      while (trail.length > 2 && now - trail.at(-1)!.t > 150) trail.pop();

      const pose = FOLD.poses[st];
      const breathe = reduce || st !== "listening" ? 0 : Math.sin((now / 1000 / FOLD.breathe.periodS) * Math.PI * 2) * FOLD.breathe.amount;
      const targetOpacity = FOLD.dim[st] ?? 1;
      opacity += (targetOpacity - opacity) * (1 - Math.exp(-dt / 0.18));
      if (!reduce && st === "thinking") rot.target += FOLD.rotate.thinkingDegPerS * dt;
      else rot.target = Math.round(rot.x / 360) * 360; // home: the mark's own orientation, the shortest way round
      if (!reduce) step(rot, rot.target, FOLD.rotate.responseS, 1, dt);

      RINGS.forEach((ring, i) => {
        const lvl = reduce ? 0 : levelAt(now, FOLD.rippleDelayMs[i]!) * FOLD.rippleGain[i]!;
        const s = scale[i]!;
        if (reduce) s.x = 1;
        else step(s, pose + breathe + lvl * FOLD.levelScale, FOLD.spring.responseS, FOLD.spring.damping, dt);
        const el = rings.current[i];
        if (!el) return;
        el.style.transform = `rotate(${rot.x.toFixed(2)}deg) scale(${s.x.toFixed(4)})`;
        el.style.opacity = (ring.opacity * (reduce ? opacity * (0.85 + Math.sin(now / 1000 / FOLD.breathe.periodS * Math.PI * 2) * 0.15) : opacity)).toFixed(3);
      });
      if (!reduce) step(dotS, st === "thinking" ? 0.8 : 1 + env * 0.25, FOLD.spring.responseS, FOLD.spring.damping, dt);
      if (dot.current) {
        dot.current.style.transform = `scale(${dotS.x.toFixed(4)})`;
        dot.current.style.opacity = opacity.toFixed(3);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [levels]);

  return (
    <div className="fold relative aspect-square w-[min(58vw,220px)] lg:w-[300px]" style={{ color: `light-dark(${color[0]}, ${color[1]})` }} aria-hidden>
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full overflow-visible" fill="none" stroke="currentColor" strokeLinecap="round">
        {RINGS.map((ring, k) => (
          <g key={ring.r} ref={(el) => void (rings.current[k] = el)} className="fold-ring">
            {/* pathLength 360: the dash is the arc, rotated so its gap faces right, like the mark's opening */}
            <circle cx="60" cy="60" r={ring.r} pathLength={360} strokeWidth={ring.width} strokeDasharray={`${360 - ring.gap} 360`} transform={`rotate(${ring.gap / 2} 60 60)`} />
          </g>
        ))}
        <circle ref={dot} cx="60" cy="60" r="3.4" fill="currentColor" stroke="none" className="fold-ring" />
      </svg>
      {/* The apps being searched sit on the outer orbit and light up as their results come back. */}
      <AnimatePresence>
        {sources.map((src, i) => {
          const a = ((-90 + (i * 360) / Math.max(sources.length, 1)) * Math.PI) / 180;
          return (
            <motion.span
              key={src.id}
              className="absolute grid size-7 place-items-center rounded-full border border-line bg-surface"
              style={{ marginLeft: -14, marginTop: -14, left: `${50 + Math.cos(a) * 56}%`, top: `${50 + Math.sin(a) * 56}%` }}
              initial={{ opacity: 0, transform: "scale(0.6)" }}
              animate={{ opacity: src.lit ? 1 : 0.45, transform: src.lit ? "scale(1)" : "scale(0.86)" }}
              exit={{ opacity: 0, transform: "scale(0.8)", transition: { duration: 0.18 } }}
              transition={{ type: "spring", duration: 0.45, bounce: src.lit ? 0.3 : 0 }}
            >
              <Logo source={src.id} className="size-4" />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
