"use client";

import { langInfo, type VoiceGender, type VoiceLang } from "@/lib/voice";

// The audio side of voice mode, outside React: the mic with voice-activity detection (when a turn starts and ends),
// barge-in, and a playback queue that fetches each sentence's speech ahead of time. The interface listens to its events
// and reads levels() every frame for the orb.

const SR = 16_000; // what the speech-to-text engines want
const PREROLL_MS = 400; // audio kept from before speech was detected, so the first syllable isn't lost
const START_MS = 140; // this much voiced audio starts a turn
const BARGE_MS = 300; // over Cortex's own voice, a little longer, so a cough or an echo doesn't interrupt it
const END_SILENCE_MS = 1200; // a pause this long ends the turn: long enough for a breath or "umm", short enough to feel quick
const MIN_SPEECH_MS = 250;
const MAX_TURN_MS = 28_000; // the REST speech-to-text engines take ~30 s
const PREFETCH = 2; // sentences fetched ahead of the one playing

export interface EngineEvents {
  /** The user started talking (on its own, or over Cortex: then playback has already stopped). */
  onSpeechStart: (bargeIn: boolean) => void;
  /** A finished turn, as 16 kHz 16-bit WAV. */
  onUtterance: (wav: Blob) => void;
  /** A turn that turned out to be noise (too short): back to listening. */
  onDiscard: () => void;
  onSentence: (text: string) => void;
  /** Everything queued has been said. */
  onIdle: () => void;
  /** Sarvam couldn't speak: "exhausted" switches this session to the browser's voice. */
  onFallback: (why: "exhausted" | "transient") => void;
}

type Item = { text: string; lang: VoiceLang; gender: VoiceGender; audio?: Promise<AudioBuffer | "browser"> };

export class VoiceEngine {
  private ctx!: AudioContext;
  private stream!: MediaStream;
  private micAnalyser!: AnalyserNode;
  private outAnalyser!: AnalyserNode;
  private tap!: ScriptProcessorNode;
  private buf = new Float32Array(2048);
  // capture
  private preroll = new Float32Array((SR * PREROLL_MS) / 1000);
  private prerollAt = 0;
  private chunks: Float32Array[] = [];
  private active = false;
  private voicedRun = 0;
  private speechMs = 0;
  private silenceMs = 0;
  private turnMs = 0;
  private floor = 0.004;
  private held = false;
  /** False while an approval is waiting or the mic is muted: speech is ignored. */
  listening = true;
  // playback
  private queue: Item[] = [];
  private playing: { stop: () => void } | null = null;
  private fetches = new AbortController();
  private browserPlaying = false;
  private browserLevel = 0;
  lang: VoiceLang = "en";
  gender: VoiceGender = "female";

  /** Set by the voice interface once it is on screen (the engine itself is created inside the opening click). */
  on: EngineEvents = { onSpeechStart() {}, onUtterance() {}, onDiscard() {}, onSentence() {}, onIdle() {}, onFallback() {} };

  /** Must run inside the click that opens voice mode: that gesture is what lets audio play on iOS and in Safari. */
  async start() {
    this.ctx = new AudioContext();
    void this.ctx.resume();
    const unlock = this.ctx.createBufferSource();
    unlock.buffer = this.ctx.createBuffer(1, 1, 22_050);
    unlock.connect(this.ctx.destination);
    unlock.start();
    if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("")); // unlocks the backup voice too
    this.outAnalyser = this.ctx.createAnalyser();
    this.outAnalyser.fftSize = 1024;
    this.outAnalyser.connect(this.ctx.destination);

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    src.connect(this.micAnalyser);
    // shortcut: ScriptProcessor is deprecated but runs everywhere without a module file; move to an AudioWorklet if it janks.
    this.tap = this.ctx.createScriptProcessor(2048, 1, 1);
    src.connect(this.tap);
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.tap.connect(sink).connect(this.ctx.destination); // keeps the processor running without playing the mic back
    this.tap.onaudioprocess = (e) => this.process(e.inputBuffer.getChannelData(0));
  }

  close() {
    this.stopSpeaking();
    this.tap?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
  }

  /** 0..1 levels of the mic and of Cortex's voice, for the orb. */
  levels() {
    const rms = (a?: AnalyserNode) => {
      if (!a) return 0;
      a.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < a.fftSize; i++) s += this.buf[i]! * this.buf[i]!;
      return Math.sqrt(s / a.fftSize);
    };
    const mic = this.listening ? Math.min(1, rms(this.micAnalyser) * 9) : 0;
    const out = this.browserPlaying ? this.browserLevel : Math.min(1, rms(this.outAnalyser) * 5);
    return { mic, out };
  }

  get speaking() {
    return !!this.playing || this.queue.length > 0;
  }

  // ---- capture and turn-taking ----

  private process(input: Float32Array) {
    const rate = this.ctx.sampleRate;
    const block = Math.floor((input.length * SR) / rate);
    const pcm = new Float32Array(block);
    // Averaging each window is a cheap low-pass, so downsampling doesn't fold hiss into the speech band.
    for (let i = 0; i < block; i++) {
      const from = Math.floor((i * rate) / SR);
      const to = Math.max(from + 1, Math.floor(((i + 1) * rate) / SR));
      let s = 0;
      for (let j = from; j < to; j++) s += input[j] ?? 0;
      pcm[i] = s / (to - from);
    }
    const ms = (input.length / rate) * 1000;
    let sum = 0;
    for (const x of input) sum += x * x;
    const level = Math.sqrt(sum / input.length);

    if (!this.active) for (const x of pcm) this.preroll[this.prerollAt++ % this.preroll.length] = x;
    if (!this.listening) return;

    const over = this.speaking;
    // Over our own voice the bar is higher, and rises with how loud the speaker is: echo cancellation removes most of it, not all.
    const out = over ? this.levels().out / 5 : 0;
    const threshold = over ? Math.max(0.04, this.floor * 4.5, out * 0.25) : Math.max(0.015, this.floor * 3);

    if (!this.active) {
      if (level < this.floor * 2) this.floor = Math.min(0.05, Math.max(0.002, this.floor * 0.95 + level * 0.05));
      this.voicedRun = level > threshold ? this.voicedRun + ms : Math.max(0, this.voicedRun - ms / 2);
      if (this.held || this.voicedRun >= (over ? BARGE_MS : START_MS)) this.begin(over);
      return;
    }

    this.chunks.push(pcm);
    this.turnMs += ms;
    if (level > threshold * 0.7) {
      this.speechMs += ms;
      this.silenceMs = 0;
    } else this.silenceMs += ms;
    if (this.held) return;
    if (this.silenceMs >= END_SILENCE_MS || this.turnMs >= MAX_TURN_MS) this.finish();
  }

  private begin(bargeIn: boolean) {
    if (bargeIn) this.stopSpeaking();
    this.active = true;
    this.speechMs = this.voicedRun;
    this.silenceMs = 0;
    this.turnMs = 0;
    this.voicedRun = 0;
    const n = this.preroll.length;
    const start = this.prerollAt % n;
    this.chunks = [Float32Array.from({ length: n }, (_, i) => this.preroll[(start + i) % n]!)];
    this.on.onSpeechStart(bargeIn);
  }

  /** Ends the turn now (the Send control, or releasing a hold). */
  finish() {
    if (!this.active) return;
    this.active = false;
    const keepSilence = Math.min(this.silenceMs, 300); // a little trailing silence helps the recognisers; more is wasted
    const all = this.chunks.flatMap((c) => [...c]);
    this.chunks = [];
    const trimmed = all.slice(0, Math.max(0, all.length - Math.round(((this.silenceMs - keepSilence) * SR) / 1000)));
    if (this.speechMs < MIN_SPEECH_MS) return this.on.onDiscard();
    this.on.onUtterance(toWav(trimmed));
  }

  /** Hold to talk: a turn starts at once and ends when the hold does, whatever the pauses. */
  hold(on: boolean) {
    this.held = on;
    if (on && !this.active && this.listening) this.begin(this.speaking);
    if (!on) this.finish();
  }

  /** Drops a turn in progress (muting, an approval opening). */
  cancelTurn() {
    this.active = false;
    this.held = false;
    this.chunks = [];
    this.voicedRun = 0;
  }

  get hearing() {
    return this.active;
  }

  /** Off while an approval waits or the mic is muted. */
  setListening(on: boolean) {
    this.listening = on;
    if (!on) this.cancelTurn();
  }

  /** The voice for the next sentences queued. */
  setVoice(lang: VoiceLang, gender: VoiceGender) {
    this.lang = lang;
    this.gender = gender;
  }

  setHandlers(on: EngineEvents) {
    this.on = on;
  }

  // ---- speech ----

  speak(text: string) {
    this.queue.push({ text, lang: this.lang, gender: this.gender });
    this.pump();
  }

  stopSpeaking() {
    this.fetches.abort();
    this.fetches = new AbortController();
    this.queue = [];
    const p = this.playing;
    this.playing = null;
    p?.stop();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  private pump() {
    for (const item of this.queue.slice(0, PREFETCH + 1)) item.audio ??= this.fetchSpeech(item);
    if (this.playing || !this.queue.length) return;
    const item = this.queue[0]!;
    const signal = this.fetches.signal;
    void item.audio!.then((audio) => {
      if (signal.aborted || this.queue[0] !== item || this.playing) return;
      this.queue.shift();
      this.on.onSentence(item.text);
      this.playing = audio === "browser" ? this.playBrowser(item) : this.playBuffer(audio);
    });
  }

  private next() {
    this.playing = null;
    if (this.queue.length) this.pump();
    else this.on.onIdle();
  }

  private playBuffer(audio: AudioBuffer) {
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.outAnalyser);
    const handle = { stop: () => ((src.onended = null), src.stop()) };
    src.onended = () => this.playing === handle && this.next();
    src.start();
    return handle;
  }

  /** The last resort, when neither Sarvam nor the server's free backup voices could speak. */
  private playBrowser(item: Item) {
    const u = new SpeechSynthesisUtterance(item.text);
    u.voice = browserVoice(item.lang, item.gender);
    u.lang = u.voice?.lang ?? langInfo(item.lang).bcp47;
    let ticker = 0;
    this.browserPlaying = true;
    const handle = {
      stop: () => {
        u.onend = null;
        clearInterval(ticker);
        this.browserPlaying = false;
        speechSynthesis.cancel();
      },
    };
    // No audio graph to measure here: a gentle synthetic level keeps the orb alive, nudged on each word.
    ticker = window.setInterval(() => (this.browserLevel = 0.25 + Math.random() * 0.3), 90);
    u.onboundary = () => (this.browserLevel = 0.7);
    u.onend = u.onerror = () => {
      clearInterval(ticker);
      this.browserLevel = 0;
      this.browserPlaying = false;
      if (this.playing === handle) this.next();
    };
    speechSynthesis.speak(u);
    return handle;
  }

  private async fetchSpeech(item: Item): Promise<AudioBuffer | "browser"> {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: item.text, lang: item.lang, gender: item.gender }),
        signal: this.fetches.signal,
      });
      if (res.ok) {
        if (res.headers.get("x-voice-backup") === "exhausted") this.on.onFallback("exhausted");
        return await this.ctx.decodeAudioData(await res.arrayBuffer());
      }
      const body = (await res.json().catch(() => ({}))) as { exhausted?: boolean };
      this.on.onFallback(body.exhausted ? "exhausted" : "transient");
    } catch (err) {
      if ((err as Error).name === "AbortError") return "browser"; // discarded anyway
      this.on.onFallback("transient");
    }
    return "browser";
  }

}

const FEMALE = /female|zira|heera|swara|kalpana|aarohi|neerja|ananya|aditi|veena|lekha|kajal|samantha|karen|moira|tessa|google (हिन्दी|हिंदी|uk english female|us english)/i;
const MALE = /male|david|mark|ravi|hemant|madhur|prabhat|manohar|rishi|daniel|alex|fred|google uk english male/i;

/** The most natural voice the browser has for the language, of the chosen gender where the name tells. */
function browserVoice(lang: VoiceLang, gender: VoiceGender): SpeechSynthesisVoice | null {
  const tag = langInfo(lang).bcp47;
  // Marathi voices are rare in browsers; a Hindi voice reads Devanagari Marathi far better than an English one.
  const langs = lang === "mr" ? [tag, "mr", "hi-IN", "hi"] : [tag, lang];
  let best: SpeechSynthesisVoice | null = null;
  let top = -Infinity;
  for (const v of speechSynthesis.getVoices()) {
    const i = langs.findIndex((l) => v.lang.replace("_", "-").toLowerCase().startsWith(l.toLowerCase()));
    if (i < 0) continue;
    const score =
      (langs.length - i) * 4 +
      (/natural|neural|online|premium|enhanced/i.test(v.name) ? 3 : 0) +
      (/google/i.test(v.name) ? 2 : 0) +
      ((gender === "female" ? FEMALE : MALE).test(v.name) ? 3 : (gender === "female" ? MALE : FEMALE).test(v.name) ? -3 : 0);
    if (score > top) [best, top] = [v, score];
  }
  return best;
}

/** Mono 16 kHz floats as a 16-bit PCM WAV file. */
export function toWav(pcm: ArrayLike<number>): Blob {
  const n = pcm.length;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, SR, true);
  b.setUint32(28, SR * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i]!)) * 0x7fff, true);
  return new Blob([b.buffer], { type: "audio/wav" });
}
