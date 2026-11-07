export const SR = 16_000; // what the speech-to-text engines want

/** Downsamples a block to 16 kHz by averaging each window (a cheap low-pass, as on the web). */
export function to16k(input: Float32Array, rate: number): Float32Array {
  if (rate === SR) return input;
  const n = Math.floor((input.length * SR) / rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * rate) / SR);
    const to = Math.max(from + 1, Math.floor(((i + 1) * rate) / SR));
    let s = 0;
    for (let j = from; j < to; j++) s += input[j] ?? 0;
    out[i] = s / (to - from);
  }
  return out;
}

export function rms(block: Float32Array): number {
  let s = 0;
  for (let i = 0; i < block.length; i++) s += block[i]! * block[i]!;
  return block.length ? Math.sqrt(s / block.length) : 0;
}

/** Mono 16 kHz floats as 16-bit PCM WAV bytes. */
export function wavBytes(pcm: ArrayLike<number>): Uint8Array {
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
  return new Uint8Array(b.buffer);
}
