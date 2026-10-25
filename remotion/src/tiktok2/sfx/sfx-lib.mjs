// Shared sound-synthesis helpers for the generate-*.mjs scripts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const SR = 44100;

/** Deterministic PRNG: the same seed gives the same sound on every run. */
export const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Writes a mono 16-bit WAV, peak-normalised to `peak` (default -6 dBFS). */
export const writeWav = (path, samples, peak = 0.5) => {
  mkdirSync(dirname(path), { recursive: true });
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const gain = max > 0 ? peak / max : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) =>
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), 44 + i * 2),
  );
  writeFileSync(path, buf);
  console.log(`${path.split('/public/')[1] ?? path}: ${(samples.length / SR).toFixed(2)}s`);
};

/** RBJ biquad. The frequency can change over time with .set(f, q). */
export const biquad = (type, f, q) => {
  let b0, b1, b2, a0, a1, a2;
  const set = (freq, qq) => {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * qq);
    const c = Math.cos(w);
    if (type === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    [a0, a1, a2] = [1 + alpha, -2 * c, 1 - alpha];
  };
  set(f, q);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  const run = (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
  run.set = set;
  return run;
};

export const buffer = (seconds) => new Float32Array(Math.floor(seconds * SR));
export const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
