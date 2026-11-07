// Turn-taking for voice mode, ported from the web engine (apps/web/src/components/voice/engine.ts): when a turn starts,
// when it ends, and when talking over Cortex interrupts it. Pure: levels in, events out, so it can be tested.

export const START_MS = 140; // this much voiced audio starts a turn
export const BARGE_MS = 300; // over Cortex's own voice, a little longer, so a cough or an echo doesn't interrupt it
export const END_SILENCE_MS = 1200; // long enough for a breath or "umm", short enough to feel quick
export const MIN_SPEECH_MS = 250;
export const MAX_TURN_MS = 28_000; // the REST speech-to-text engines take ~30 s

export type VadEvent = "start" | "barge" | "end" | "discard";

export function createVad() {
  let active = false;
  let voicedRun = 0;
  let speechMs = 0;
  let silenceMs = 0;
  let turnMs = 0;
  let floor = 0.004;
  let held = false;

  const begin = (barge: boolean): VadEvent => {
    active = true;
    speechMs = voicedRun;
    silenceMs = 0;
    turnMs = 0;
    voicedRun = 0;
    return barge ? "barge" : "start";
  };
  const finish = (): VadEvent | null => {
    if (!active) return null;
    active = false;
    return speechMs < MIN_SPEECH_MS ? "discard" : "end";
  };

  return {
    get active() {
      return active;
    },
    /** Milliseconds of trailing silence in the turn so far (the caller trims all but ~300ms of it). */
    get silenceMs() {
      return silenceMs;
    },
    /** One block of audio: its RMS level (0..1), its length, and whether Cortex is speaking right now. */
    push(level: number, ms: number, speaking: boolean, outLevel = 0): VadEvent | null {
      // Over our own voice the bar is higher, and rises with how loud the speaker is: echo cancellation removes most of it.
      const threshold = speaking ? Math.max(0.04, floor * 4.5, outLevel * 0.25) : Math.max(0.015, floor * 3);
      if (!active) {
        if (level < floor * 2) floor = Math.min(0.05, Math.max(0.002, floor * 0.95 + level * 0.05));
        voicedRun = level > threshold ? voicedRun + ms : Math.max(0, voicedRun - ms / 2);
        if (held || voicedRun >= (speaking ? BARGE_MS : START_MS)) return begin(speaking);
        return null;
      }
      turnMs += ms;
      if (level > threshold * 0.7) {
        speechMs += ms;
        silenceMs = 0;
      } else silenceMs += ms;
      if (held) return null;
      if (silenceMs >= END_SILENCE_MS || turnMs >= MAX_TURN_MS) return finish();
      return null;
    },
    /** Hold to talk: a turn starts at once and ends when the hold does, whatever the pauses. */
    hold(on: boolean, speaking: boolean): VadEvent | null {
      held = on;
      if (on && !active) return begin(speaking);
      if (!on) return finish();
      return null;
    },
    /** Drops a turn in progress (muting, an approval opening). */
    cancel() {
      active = false;
      held = false;
      voicedRun = 0;
    },
    /** Ends the turn now (the Send control). */
    finish,
  };
}
