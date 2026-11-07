import { rms, SR, to16k, wavBytes } from "./wav";

describe("wav", () => {
  it("writes a valid 16 kHz mono header", () => {
    const b = wavBytes(new Float32Array(160));
    const v = new DataView(b.buffer);
    expect(String.fromCharCode(...b.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...b.slice(8, 12))).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(SR);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(320);
    expect(b.length).toBe(44 + 320);
  });
  it("clips samples to 16-bit range", () => {
    const v = new DataView(wavBytes([2, -2]).buffer);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32767);
  });
  it("downsamples 48k to 16k", () => expect(to16k(new Float32Array(4800).fill(0.5), 48_000)).toHaveLength(1600));
  it("rms of a constant", () => expect(rms(new Float32Array(10).fill(0.5))).toBeCloseTo(0.5));
});
