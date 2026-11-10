import { AudioModule, createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";
import { getAuthToken } from "@/api/client";
import { API_URL } from "@/config";
import { langInfo, type VoiceGender, type VoiceLang } from "./personas";
import { createVad } from "./vad";
import { rms, SR, to16k, wavBytes } from "./wav";

// The audio side of voice mode on the phone, outside React (the web's engine.ts, rebuilt natively): live PCM from the
// mic with the same turn-taking, barge-in, and a playback queue that fetches each sentence's speech two ahead.

const PREROLL_MS = 400; // audio kept from before speech was detected, so the first syllable isn't lost
const PREFETCH = 2; // sentences fetched ahead of the one playing
const ECHO_TAIL_MS = 600; // after Cortex stops talking, the room still rings with it for a moment

export interface EngineEvents {
  onSpeechStart: (bargeIn: boolean) => void;
  /** A finished turn, as a 16 kHz WAV file on the phone. */
  onUtterance: (uri: string) => void;
  onDiscard: () => void;
  onSentence: (text: string) => void;
  onIdle: () => void;
  /** Sarvam couldn't speak: "exhausted" switches this session to the phone's own voice. */
  onFallback: (why: "exhausted" | "transient") => void;
}

type Audio = { uri: string } | "device";
type Item = { text: string; lang: VoiceLang; gender: VoiceGender; audio?: Promise<Audio> };

export class NativeVoiceEngine {
  private stream: InstanceType<typeof AudioModule.AudioStream> | null = null;
  private subs: { remove(): void }[] = [];
  private vad = createVad();
  private preroll = new Float32Array((SR * PREROLL_MS) / 1000);
  private prerollAt = 0;
  private chunks: Float32Array[] = [];
  private mic = 0;
  private quietUntil = 0;
  listening = true;
  // playback
  private queue: Item[] = [];
  private playing: { stop: () => void } | null = null;
  private fetches = new AbortController();
  private outLevel = 0;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private files: File[] = [];
  lang: VoiceLang = "en";
  gender: VoiceGender = "female";
  on: EngineEvents = { onSpeechStart() {}, onUtterance() {}, onDiscard() {}, onSentence() {}, onIdle() {}, onFallback() {} };

  /** Opens the mic; rejects when permission is refused. */
  async start() {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error("mic refused");
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
    const stream = new AudioModule.AudioStream({ sampleRate: SR, channels: 1, encoding: "float32" });
    this.subs.push(
      stream.addListener("audioStreamBuffer", (b) => this.process(new Float32Array(b.data), b.sampleRate, b.channels)),
    );
    await stream.start();
    this.stream = stream;
  }

  close() {
    this.stopSpeaking();
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    try {
      this.stream?.stop();
    } catch {}
    this.stream = null;
    for (const f of this.files) {
      try {
        f.delete();
      } catch {}
    }
    this.files = [];
  }

  /** 0..1 levels of the mic and of Cortex's voice, for the orb. */
  levels() {
    return { mic: this.listening ? Math.min(1, this.mic * 9) : 0, out: this.outLevel };
  }

  get speaking() {
    return !!this.playing || this.queue.length > 0;
  }
  get hearing() {
    return this.vad.active;
  }

  // ---- capture and turn-taking ----

  private process(raw: Float32Array, rate: number, channels: number) {
    const mono = channels > 1 ? raw.filter((_, i) => i % channels === 0) : raw;
    const pcm = to16k(mono, rate);
    const ms = (mono.length / rate) * 1000;
    const level = rms(mono);
    this.mic = level;
    // expo-audio's stream records the raw MIC source, with no echo cancellation: while Cortex talks (and just after),
    // its own voice from the speaker would read as the user starting a turn. So turn-taking waits; Interrupt cuts it off.
    if (this.speaking || Date.now() < this.quietUntil) return;
    if (!this.vad.active) for (const x of pcm) this.preroll[this.prerollAt++ % this.preroll.length] = x;
    if (!this.listening) return;
    if (this.vad.active) this.chunks.push(pcm);
    this.handle(this.vad.push(level, ms, this.speaking, this.outLevel));
  }

  private handle(e: ReturnType<typeof this.vad.push>) {
    if (e === "start" || e === "barge") {
      if (e === "barge") this.stopSpeaking();
      const n = this.preroll.length;
      const at = this.prerollAt % n;
      this.chunks = [Float32Array.from({ length: n }, (_, i) => this.preroll[(at + i) % n]!)];
      this.on.onSpeechStart(e === "barge");
    } else if (e === "discard") {
      this.chunks = [];
      this.on.onDiscard();
    } else if (e === "end") void this.emitTurn();
  }

  private async emitTurn() {
    const keep = Math.min(this.vad.silenceMs, 300); // a little trailing silence helps the recognisers; more is wasted
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) all.set(c, (o += c.length) - c.length);
    this.chunks = [];
    const trimmed = all.subarray(0, Math.max(0, total - Math.round(((this.vad.silenceMs - keep) * SR) / 1000)));
    const file = new File(Paths.cache, `turn-${Date.now()}.wav`);
    await file.write(wavBytes(trimmed));
    this.files.push(file);
    this.on.onUtterance(file.uri);
  }

  /** Ends the turn now (the Send control, or releasing a hold). */
  finish() {
    this.handle(this.vad.finish());
  }
  hold(on: boolean) {
    if (this.listening) this.handle(this.vad.hold(on, this.speaking));
  }
  cancelTurn() {
    this.vad.cancel();
    this.chunks = [];
  }
  setListening(on: boolean) {
    this.listening = on;
    if (!on) this.cancelTurn();
  }
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
    void Speech.stop();
    if (p) this.quietUntil = Date.now() + ECHO_TAIL_MS;
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
      this.playing = audio === "device" ? this.playDevice(item) : this.playFile(audio.uri);
    });
  }

  private next() {
    this.playing = null;
    if (this.queue.length) this.pump();
    else {
      this.quietUntil = Date.now() + ECHO_TAIL_MS;
      this.on.onIdle();
    }
  }

  /** No meter on the player: a gentle synthetic level keeps the orb alive while Cortex talks. */
  private pulse(on: boolean) {
    clearInterval(this.ticker);
    this.outLevel = 0;
    if (on) this.ticker = setInterval(() => (this.outLevel = 0.3 + Math.random() * 0.35), 90);
  }

  private playFile(uri: string) {
    const player: AudioPlayer = createAudioPlayer({ uri });
    this.pulse(true);
    let ended = false;
    let timed = false;
    // A clip that never loads or never reports its end must not leave voice mode stuck on "Speaking".
    let watchdog = setTimeout(() => end(true), 20_000);
    const end = (advance: boolean) => {
      if (ended) return;
      ended = true;
      clearTimeout(watchdog);
      sub.remove();
      this.pulse(false);
      try {
        player.pause();
      } catch {}
      player.release();
      if (advance && this.playing === handle) this.next();
    };
    const handle = { stop: () => end(false) };
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) return end(true);
      if (!timed && s.isLoaded && s.duration > 0) {
        timed = true;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => end(true), (s.duration + 2) * 1000);
      }
    });
    player.play();
    return handle;
  }

  /** The last resort, when neither Sarvam nor the server's free backup voices could speak: Android's own voice. */
  private playDevice(item: Item) {
    this.pulse(true);
    // The same guard as playFile: some Android voices never call onDone.
    const watchdog = setTimeout(() => done(), 4000 + item.text.split(/\s+/).length * 600);
    const handle = {
      stop: () => {
        clearTimeout(watchdog);
        this.pulse(false);
        void Speech.stop();
      },
    };
    const done = () => {
      clearTimeout(watchdog);
      this.pulse(false);
      if (this.playing === handle) this.next();
    };
    // Marathi voices are rare; Android's Hindi voice reads Devanagari Marathi far better than an English one.
    Speech.speak(item.text, { language: item.lang === "mr" ? "hi-IN" : langInfo(item.lang).bcp47, onDone: done, onError: done, onStopped: () => this.pulse(false) });
    return handle;
  }

  private async fetchSpeech(item: Item): Promise<Audio> {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/voice/tts`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: item.text, lang: item.lang, gender: item.gender }),
        signal: this.fetches.signal,
      });
      if (res.ok) {
        if (res.headers.get("x-voice-backup") === "exhausted") this.on.onFallback("exhausted");
        const type = res.headers.get("content-type") ?? "audio/mpeg";
        const file = new File(Paths.cache, `say-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${type.includes("wav") ? "wav" : type.includes("ogg") ? "ogg" : "mp3"}`);
        await file.write(new Uint8Array(await res.arrayBuffer()));
        this.files.push(file);
        return { uri: file.uri };
      }
      const body = (await res.json().catch(() => ({}))) as { exhausted?: boolean };
      this.on.onFallback(body.exhausted ? "exhausted" : "transient");
    } catch (err) {
      if ((err as Error).name === "AbortError") return "device"; // discarded anyway
      this.on.onFallback("transient");
    }
    return "device";
  }
}
