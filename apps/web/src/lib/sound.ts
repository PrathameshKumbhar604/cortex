"use client";

import { readSound } from "./settings";

/**
 * Subtle interface sounds, synthesised with Web Audio (no files to load). Quiet by design: each is a few soft
 * sine/triangle notes under 0.05 gain. Silent when switched off, when the tab is hidden, or before any user gesture.
 */
export type Cue = "send" | "answer" | "done" | "error";

const NOTES: Record<Cue, { f: number; at: number; len: number; type: OscillatorType }[]> = {
  send: [{ f: 880, at: 0, len: 0.06, type: "sine" }],
  answer: [
    { f: 659.25, at: 0, len: 0.16, type: "triangle" }, // E5
    { f: 987.77, at: 0.09, len: 0.22, type: "triangle" }, // B5
  ],
  done: [
    { f: 523.25, at: 0, len: 0.12, type: "triangle" }, // C5
    { f: 659.25, at: 0.07, len: 0.12, type: "triangle" }, // E5
    { f: 783.99, at: 0.14, len: 0.24, type: "triangle" }, // G5
  ],
  error: [
    { f: 392, at: 0, len: 0.14, type: "sine" }, // G4
    { f: 311.13, at: 0.1, len: 0.22, type: "sine" }, // E♭4
  ],
};
const GAIN = 0.045;

let ctx: AudioContext | null = null;

export function play(cue: Cue) {
  if (!readSound() || typeof window === "undefined" || document.hidden) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const n of NOTES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.f;
      // Fast attack, exponential release: a soft "tink" rather than a beep.
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(GAIN, t0 + n.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.len + 0.02);
    }
  } catch {
    // audio unavailable: sounds are optional
  }
}
