// TikTok 2 · EP1 "Tàng hình khi nín thở": synthesized SFX, foley and ambience (no recorded samples,
// deterministic by seed). Library of synth functions reused by later episodes; run directly it writes
// EP1's sounds: node ep1-sfx.mjs <output dir> (mono 44.1 kHz WAV; *_loop.wav loop seamlessly).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { biquad, buffer, rng, SR, smoothstep, writeWav } from './sfx-lib.mjs';

const OUT = process.argv[2] ?? join(process.cwd(), 'sfx-out');
const out = (name, s, peak = 0.5) => writeWav(join(OUT, `${name}.wav`), s, peak);
const env = (t, a, d, dur) => smoothstep(t / a) * smoothstep((dur - t) / d);
const nz = (r) => r() * 2 - 1;
const TAU = 2 * Math.PI;

/** Adds `src` into `dst` at second `at` with gain `g`. */
const add = (dst, src, at = 0, g = 1) => {
  const o = Math.floor(at * SR);
  for (let i = 0; i < src.length && o + i < dst.length; i++)
    if (o + i >= 0) dst[o + i] += src[i] * g;
  return dst;
};
/** Simple reverb (4 combs + 1 allpass) for corridors, streets, rooms. */
const verb = (s, mix = 0.3, size = 1) => {
  const o = Float32Array.from(s);
  const combs = [1116, 1188, 1277, 1356].map((d) => ({
    d: Math.floor(d * size * (SR / 44100)),
    b: new Float32Array(Math.floor(d * size) + 1),
    i: 0,
  }));
  let lp = 0;
  for (let n = 0; n < s.length; n++) {
    let w = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      lp = y * 0.6 + lp * 0.4;
      c.b[c.i] = s[n] + lp * 0.78;
      c.i = (c.i + 1) % c.d;
      w += y;
    }
    o[n] = s[n] * (1 - mix) + (w / 4) * mix;
  }
  return o;
};
const filt = (s, type, f, q = 0.7) => {
  const b = biquad(type, f, q);
  return s.map((x) => b(x));
};
/** Seamless loop: renders `xf` seconds longer, then crossfades the tail into the head. */
const loopify = (make, dur, xf = 0.6) => {
  const s = make(dur + xf);
  const n = Math.floor(dur * SR);
  const x = Math.floor(xf * SR);
  const o = s.slice(0, n);
  for (let i = 0; i < x; i++) {
    const k = i / x;
    o[i] = s[i] * Math.sqrt(k) + s[n + i] * Math.sqrt(1 - k);
  }
  return o;
};

// ───────── Channel signature ─────────
const inhale = (dur = 0.95, seed = 1) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 900, 0.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    bp.set(900 + 1600 * (t / dur), 0.9);
    s[i] = bp(nz(r)) * Math.pow(Math.min(1, t / (dur * 0.85)), 1.6) * smoothstep((dur - t) / 0.06);
  }
  return s;
};
const exhale = (dur = 0.7, seed = 2, f0 = 1300) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', f0, 0.8);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    bp.set(f0 - 700 * (t / dur), 0.8);
    s[i] = bp(nz(r)) * smoothstep(t / 0.03) * Math.exp(-t * 3.2);
  }
  return s;
};
/** Panting: soft, low breath (1.2 kHz low-pass, so it never hisses). */
const panting = (dur) => {
  const s = buffer(dur);
  for (let t = 0, k = 0; t < dur - 0.6; t += 0.82, k++) {
    add(s, inhale(0.38, 40 + k), t, 0.6);
    add(s, exhale(0.42, 60 + k, 700), t + 0.38, 1);
  }
  return filt(filt(s, 'lp', 1200), 'lp', 1200);
};
const whoosh = (dur = 0.6, seed = 3, lo = 400, hi = 2600) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', lo, 1.2);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const u = t / dur;
    bp.set(lo + (hi - lo) * Math.sin(Math.PI * u), 1.2);
    s[i] = bp(nz(r)) * Math.sin(Math.PI * u) ** 2;
  }
  return s;
};
const shimmer = (dur = 1.1, seed = 4) => {
  const r = rng(seed);
  const s = buffer(dur);
  // 1.6–4 kHz band, slower tremolo: a soft shimmer, not harsh
  const parts = Array.from({ length: 9 }, () => ({
    f: 1600 + r() * 2400,
    ph: r() * TAU,
    tr: 4 + r() * 5,
    at: r() * 0.35,
  }));
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const p of parts) {
      const u = t - p.at;
      if (u < 0) continue;
      v +=
        Math.sin(TAU * p.f * (1 + 0.08 * u) * u + p.ph) *
        (0.5 + 0.5 * Math.sin(TAU * p.tr * u)) *
        Math.exp(-u * 3.2);
    }
    s[i] = v * smoothstep(t / 0.02) * smoothstep((dur - t) / 0.2);
  }
  return verb(filt(s, 'lp', 5000), 0.35, 0.7);
};
const pop = (dur = 0.28, f1 = 950, f2 = 240, seed = 5, big = false) => {
  const r = rng(seed);
  const s = buffer(dur);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = f2 + (f1 - f2) * Math.exp(-t * 38);
    ph += f / SR;
    s[i] =
      Math.sin(TAU * ph) * Math.exp(-t * (big ? 9 : 16)) +
      (t < 0.006 ? nz(r) * 0.6 : 0) +
      (big ? nz(r) * Math.exp(-t * 30) * 0.4 : 0);
  }
  return big ? verb(s, 0.25) : s;
};
const tick = (hi = false) => {
  const s = buffer(0.07);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      (Math.sin(TAU * (hi ? 2600 : 1900) * t) + 0.5 * Math.sin(TAU * (hi ? 5200 : 3800) * t)) *
      Math.exp(-t * (hi ? 70 : 90));
  }
  return s;
};
const heartbeat = (period = 1.0, dur = 1.0) => {
  const s = buffer(dur);
  const beat = (a, g) => {
    for (let i = 0; i < SR * 0.22; i++) {
      const t = i / SR;
      const k = Math.floor((a + t) * SR);
      if (k < s.length)
        s[k] += Math.sin(TAU * (48 + 30 * Math.exp(-t * 30)) * t) * Math.exp(-t * 18) * g;
    }
  };
  for (let t = 0; t < dur - 0.05; t += period) {
    beat(t, 1);
    beat(t + 0.27, 0.7);
  }
  return filt(s, 'lp', 220);
};

// ───────── Foley ─────────
const crinkle = (dur, seed, dens = 0.002, f = 2600) => {
  const r = rng(seed);
  const s = buffer(dur);
  const hp = biquad('hp', f, 0.7);
  let a = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    if (r() < dens) a = 0.4 + r() * 0.8;
    a *= 0.9992;
    s[i] = hp(nz(r)) * a * env(t, 0.03, 0.12, dur);
  }
  return s;
};
const thud = (dur = 0.3, f = 110, seed = 6, nzAmt = 0.6, lpF = 1800) => {
  const r = rng(seed);
  const s = buffer(dur);
  const lp = biquad('lp', lpF, 0.7);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = Math.sin(TAU * f * t) * Math.exp(-t * 22) + lp(nz(r)) * Math.exp(-t * 60) * nzAmt;
  }
  return s;
};
const clink = (dur = 0.6, freqs = [2800, 4150, 5900], seed = 7, damp = 9) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      freqs.reduce(
        (v, f, k) => v + Math.sin(TAU * f * t + k) * Math.exp(-t * damp * (1 + k * 0.5)),
        0,
      ) + (t < 0.003 ? nz(r) : 0);
  }
  return s;
};
const scrape = (dur = 0.7, seed = 8, f = 600) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', f, 3);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const stick = 0.5 + 0.5 * Math.sin(TAU * (28 + 10 * Math.sin(t * 7)) * t);
    s[i] = bp(nz(r)) * stick * env(t, 0.04, 0.12, dur);
  }
  return s;
};
const steps = (
  dur,
  pace,
  seed,
  { f = 1400, low = 90, hard = 1, jitter = 0.04, verbMix = 0 } = {},
) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let t = 0.04, k = 0; t < dur - 0.1; t += pace + (r() - 0.5) * jitter, k++) {
    const g = 0.75 + r() * 0.3;
    add(s, thud(0.12, low, seed + k, 0.4, f), t, g * 0.6);
    add(s, crinkle(0.05, seed + 100 + k, 0.05, f * 1.5), t + 0.005, g * hard * 0.6);
  }
  return verbMix ? verb(s, verbMix, 1.3) : s;
};
const creak = (dur = 1.3, seed = 9, f0 = 320) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 900, 4);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = f0 + 160 * Math.sin(t * 2.3) + 30 * Math.sin(t * 17);
    ph += f / SR;
    const saw = 2 * (ph % 1) - 1;
    const slip = r() < 0.004 ? 1.5 : 1;
    s[i] = bp(saw * slip) * env(t, 0.08, 0.25, dur);
  }
  return s;
};
const hum = (dur, f = 60, seed = 10) => {
  const r = rng(seed);
  const s = buffer(dur);
  const lp = biquad('lp', 300, 0.7);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      Math.sin(TAU * f * t) * 0.5 +
      Math.sin(TAU * f * 2 * t) * 0.3 +
      Math.sin(TAU * f * 3 * t) * 0.12 +
      lp(nz(r)) * 0.15;
  }
  return s;
};
const bubbles = (dur = 1.5, seed = 11, rate = 14) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let k = 0; k < dur * rate; k++) {
    const at = r() * (dur - 0.1);
    const f = 380 + r() * 900;
    const b = buffer(0.07);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = Math.sin(TAU * f * (1 + 6 * t) * t) * Math.exp(-t * 60);
    }
    add(s, b, at, 0.4 + r() * 0.6);
  }
  return s;
};
const splash = (dur = 1.3, seed = 12) => {
  const r = rng(seed);
  const s = buffer(dur);
  const lp = biquad('lp', 4000, 0.7);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    lp.set(5000 * Math.exp(-t * 3) + 400, 0.7);
    s[i] = lp(nz(r)) * Math.exp(-t * 4) * smoothstep(t / 0.01);
  }
  return add(s, bubbles(1.2, seed + 1, 18), 0.15, 0.5);
};
const liquid = (dur = 2, seed = 13) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 700, 6);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    if (i % 400 === 0) bp.set(600 + 500 * (t / dur) + r() * 300, 6);
    s[i] = bp(nz(r)) * env(t, 0.15, 0.3, dur);
  }
  return s;
};
const flame = (dur = 0.9, seed = 14) => {
  const s = buffer(dur);
  add(s, crinkle(0.1, seed, 0.03, 3000), 0, 1);
  add(s, clink(0.05, [3400], seed, 60), 0.09, 0.6);
  const r = rng(seed + 1);
  const lp = biquad('lp', 900, 0.7);
  for (let i = Math.floor(0.12 * SR); i < s.length; i++) {
    const t = i / SR - 0.12;
    s[i] += lp(nz(r)) * Math.exp(-t * 3) * 0.8;
  }
  return s;
};
const engine = (dur, seed = 15, start = true) => {
  const r = rng(seed);
  const s = buffer(dur);
  const lp = biquad('lp', 500, 1);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const crank = start && t < 0.6;
    const rpm = crank
      ? 9 + 6 * Math.sin(t * 40)
      : start && t < 1.4
        ? 22 + 30 * Math.exp(-(t - 0.6) * 3) * Math.sin(Math.PI * Math.min(1, (t - 0.6) / 0.4)) + 8
        : 24 + 2 * Math.sin(t * 3);
    ph += rpm / SR;
    const pulse = Math.exp(-((ph % 1) * 9));
    s[i] = lp(pulse * (crank ? 0.4 : 1) + nz(r) * 0.15) * env(t, 0.02, 0.3, dur);
  }
  return s;
};
const siren = (dur) => {
  const s = buffer(dur);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (700 + 220 * Math.sin((TAU * t) / 2)) / SR;
    s[i] = (Math.sin(TAU * ph) + 0.3 * Math.sin(TAU * 2 * ph)) * 0.6;
  }
  return verb(filt(s, 'lp', 1800), 0.5, 1.4);
};
/** Murmur: several synthetic "voices" (sawtooth through 2 formants that change per syllable). */
const babble = (dur, voices, seed, { lp = 2600, rate = 4.5, verbMix = 0.3 } = {}) => {
  const r = rng(seed);
  const s = buffer(dur);
  const F = [
    [700, 1200],
    [400, 2200],
    [300, 900],
    [600, 1700],
    [500, 1000],
    [350, 2600],
  ];
  for (let v = 0; v < voices; v++) {
    const f0 = 110 + r() * 160;
    const g = 0.4 + r() * 0.6;
    const b1 = biquad('bp', 600, 5);
    const b2 = biquad('bp', 1500, 6);
    let ph = 0;
    let sylEnd = 0,
      sylStart = 0,
      on = true;
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      if (t >= sylEnd) {
        on = r() > 0.25;
        sylStart = t;
        sylEnd = t + (0.6 + r() * 0.8) / rate;
        const ff = F[Math.floor(r() * F.length)];
        b1.set(ff[0], 5);
        b2.set(ff[1], 6);
      }
      ph += (f0 * (1 + 0.1 * Math.sin(t * 3 + v))) / SR;
      const src = 2 * (ph % 1) - 1;
      const u = (t - sylStart) / (sylEnd - sylStart);
      s[i] += (on ? Math.sin(Math.PI * u) : 0) * (b1(src) + 0.6 * b2(src)) * g;
    }
  }
  return verb(filt(s, 'lp', lp), verbMix, 1.2);
};
const room = (dur, seed, lpF = 400, g = 1) => {
  const r = rng(seed);
  const s = buffer(dur);
  const lp = biquad('lp', lpF, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = lp(nz(r)) * g;
  return s;
};
const passby = (dur, seed) => {
  const s = engine(dur, seed, false);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] *= Math.exp(-(((t - dur / 2) / (dur / 4)) ** 2));
  }
  return filt(s, 'lp', 700);
};
const birds = (dur, seed, n = 6) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let k = 0; k < n; k++) {
    const at = r() * (dur - 0.6);
    const f = 2800 + r() * 2000;
    const b = buffer(0.5);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const u = (t * 9) % 1;
      b[i] =
        Math.sin(TAU * f * (1 + 0.2 * Math.sin(TAU * 18 * t)) * t) *
        Math.sin(Math.PI * u) *
        (t < 0.45 ? 1 : 0);
    }
    add(s, b, at, 0.2 + r() * 0.2);
  }
  return s;
};
/** Distant crickets: soft band-passed noise (no pure sine: 4–5 kHz sines sound like a shrill "eee"), quiet chirping. */
const crickets = (dur, seed = 16) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let c = 0; c < 3; c++) {
    const bp = biquad('bp', 3300 + r() * 500, 6);
    const per = 0.9 + r() * 0.7;
    const g = 0.4 + r() * 0.5;
    const off = r() * per;
    for (let i = 0; i < s.length; i++) {
      const t = i / SR + off;
      const u = t % per;
      const chirp =
        u < 0.24 ? Math.sin((Math.PI * u) / 0.24) * (0.6 + 0.4 * Math.sin(TAU * 24 * u)) : 0;
      s[i] += bp(nz(r)) * chirp * g;
    }
  }
  return verb(filt(s, 'lp', 4200), 0.35, 1.5);
};
const drum = (low = true, seed = 17) => {
  const r = rng(seed);
  const s = buffer(low ? 0.5 : 0.25);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = low
      ? Math.sin(TAU * (70 + 40 * Math.exp(-t * 25)) * t) * Math.exp(-t * 7) +
        nz(r) * Math.exp(-t * 40) * 0.3
      : nz(r) * Math.exp(-t * 30) * 0.5 + Math.sin(TAU * 420 * t) * Math.exp(-t * 35) * 0.5;
  }
  return s;
};
const cymbal = (seed) => filt(crinkle(0.45, seed, 0.2, 5000), 'hp', 4000);
/** Lion-dance drum: "tùng tùng – tùng cắc – xèng" repeating every 2 s. */
const lionDrum = (dur) => {
  const s = buffer(dur);
  const bar = 2.0;
  for (let b = 0; b * bar < dur; b++) {
    const o = b * bar;
    [0, 0.25, 0.5, 1.0, 1.25].forEach((t, k) => add(s, drum(true, 30 + k + b), o + t, 1));
    [0.75, 1.5, 1.75].forEach((t, k) => add(s, drum(false, 50 + k + b), o + t, 0.7));
    [0.5, 1.5].forEach((t, k) => add(s, cymbal(70 + k + b), o + t, 0.5));
  }
  return verb(s, 0.35, 1.4);
};

const gen = {
  // Channel signature
  inhale: () => add(add(buffer(1.1), inhale(), 0, 1), whoosh(0.45, 21, 600, 3200), 0.55, 0.35),
  exhale: () => exhale(),
  phu: () => exhale(0.75, 22, 1500),
  panting_loop: () => loopify(panting, 3.28, 0.2),
  shimmer: () => shimmer(),
  sparkle: () => shimmer(0.6, 23),
  pop: () => pop(),
  pop_big: () => pop(0.7, 700, 120, 24, true),
  tick: () => tick(false),
  tick_hi: () => tick(true),
  heartbeat_loop: () => heartbeat(1.0, 1.0),
  heartbeat_slow_loop: () => heartbeat(1.35, 1.35),
  heartbeat_fast_loop: () => heartbeat(0.62, 0.62),
  // Foley
  paper: () => crinkle(0.8, 30, 0.004),
  paper_slap: () => add(thud(0.3, 140, 31, 1.0, 3500), crinkle(0.2, 32, 0.02), 0, 0.5),
  paper_roll: () => add(crinkle(1.8, 33, 0.006, 2000), thud(0.2, 90, 34), 1.5, 0.6),
  chair: () => add(scrape(0.7, 35, 520), thud(0.2, 100, 36), 0.62, 0.5),
  chair_long: () => scrape(1.2, 37, 460),
  fridge_open: () =>
    add(
      add(buffer(1.6), thud(0.25, 70, 38, 0.8, 900), 0, 1),
      filt(hum(1.4, 60), 'lp', 250),
      0.15,
      0.25,
    ),
  fridge_hum_loop: () => loopify((d) => hum(d, 58, 39), 4),
  steps_tile_loop: () => loopify((d) => steps(d, 0.52, 40, { f: 1600 }), 4.16, 0.05),
  steps_small_loop: () =>
    loopify((d) => steps(d, 0.34, 41, { f: 2200, low: 140, hard: 0.6 }), 2.72, 0.05),
  steps_hall_loop: () => loopify((d) => steps(d, 0.5, 42, { f: 1500, verbMix: 0.35 }), 4, 0.05),
  steps_sidewalk_loop: () => loopify((d) => steps(d, 0.5, 43, { f: 2800, hard: 1.4 }), 4, 0.05),
  steps_rush_loop: () =>
    loopify(
      (d) =>
        add(
          steps(d, 0.21, 44, { f: 1800, jitter: 0.1 }),
          steps(d, 0.27, 45, { f: 2400, jitter: 0.1 }),
          0.1,
          0.8,
        ),
      3,
      0.05,
    ),
  slipper_run_loop: () =>
    loopify((d) => steps(d, 0.17, 46, { f: 2600, low: 160, hard: 1.6, jitter: 0.03 }), 2.04, 0.05),
  clatter: () => {
    const s = buffer(1.1);
    [0, 0.12, 0.27, 0.45].forEach((t, k) =>
      add(s, clink(0.5, [1800 + k * 400, 2900 + k * 300, 4700], 47 + k, 12), t, 0.7 - k * 0.12),
    );
    return add(s, thud(0.3, 120, 51), 0.05, 0.8);
  },
  startle: () => whoosh(0.35, 52, 800, 3800),
  whoosh: () => whoosh(0.6, 53),
  whoosh_ui: () => add(whoosh(0.35, 54, 1200, 4200), clink(0.2, [1320, 2640], 55, 20), 0.12, 0.3),
  buzz: () => {
    const s = buffer(0.55);
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      s[i] =
        (Math.sign(Math.sin(TAU * 110 * t)) * 0.6 + Math.sign(Math.sin(TAU * 165 * t)) * 0.4) *
        env(t, 0.01, 0.08, 0.55);
    }
    return filt(s, 'lp', 1400);
  },
  bubbles: () => bubbles(1.5, 56),
  beep: () => {
    const s = buffer(0.5);
    for (let i = 0; i < s.length; i++) {
      const t = i / SR;
      s[i] = Math.sin(TAU * 1050 * t) * (t % 0.25 < 0.12 ? 1 : 0) * smoothstep((t % 0.25) / 0.005);
    }
    return s;
  },
  bag_drop: () => add(crinkle(0.6, 57, 0.01, 1800), thud(0.25, 95, 58, 0.5, 1200), 0.02, 0.9),
  cloth: () => filt(crinkle(0.5, 59, 0.02, 600), 'lp', 3000),
  hug: () =>
    add(filt(crinkle(0.8, 60, 0.015, 500), 'lp', 2500), thud(0.2, 80, 61, 0.2, 600), 0.05, 0.6),
  chew: () => {
    const s = buffer(1.3);
    for (let k = 0; k < 4; k++)
      add(s, filt(crinkle(0.12, 62 + k, 0.05, 300), 'lp', 1100), 0.05 + k * 0.3, 0.8);
    return s;
  },
  lighter: () => flame(),
  tea_pour: () => liquid(2.2, 66),
  cup: () => clink(0.7, [2750, 4100, 5900], 67, 7),
  dishes: () => add(clink(0.5, [3100, 4600], 68, 10), clink(0.5, [2600, 3900], 69, 10), 0.18, 0.8),
  door_creak: () => creak(1.4, 70, 300),
  door_open: () =>
    add(add(buffer(1.1), clink(0.08, [2400], 71, 60), 0, 0.8), creak(0.9, 72, 380), 0.08, 0.7),
  ting: () => clink(0.5, [1760, 3520, 5280], 73, 6),
  static_loop: () => loopify((d) => add(crinkle(d, 74, 0.01, 3000), hum(d, 50, 75), 0, 0.15), 2),
  glitch: () => filt(crinkle(0.3, 76, 0.2, 1500), 'bp', 2500),
  blanket: () => filt(crinkle(1.2, 77, 0.006, 300), 'lp', 2500),
  water: () => splash(),
  lantern_swing: () =>
    add(
      creak(1.6, 78, 520).map((x) => x * 0.4),
      crinkle(1.6, 79, 0.002, 3000),
      0,
      0.5,
    ),
  shove: () =>
    add(
      add(crinkle(1, 80, 0.01, 600), thud(0.3, 90, 81, 0.6), 0.1, 1),
      thud(0.3, 75, 82, 0.6),
      0.45,
      0.9,
    ),
  moto_start: () => engine(3.2, 83, true),
  moto_idle_loop: () => loopify((d) => engine(d, 84, false), 2),
  siren_loop: () => loopify(siren, 4),
  shouts: () => {
    const s = babble(2.4, 10, 85, { lp: 3400, rate: 3, verbMix: 0.4 });
    for (let i = 0; i < s.length; i++)
      s[i] *= smoothstep(i / SR / 0.5) * smoothstep((2.4 - i / SR) / 0.6);
    return s;
  },
  thump_heavy: () => thud(0.6, 50, 86, 0.6, 600),
  // Ambience (loops)
  amb_living_loop: () =>
    loopify((d) => {
      const s = room(d, 90, 350, 0.6);
      const r = rng(91);
      const fan = buffer(d);
      const bp = biquad('bp', 380, 0.8);
      for (let i = 0; i < fan.length; i++)
        fan[i] = bp(nz(r)) * (0.7 + 0.3 * Math.sin((TAU * 3.2 * i) / SR));
      add(s, fan, 0, 0.8);
      add(s, hum(d, 98, 92), 0, 0.05);
      add(s, passby(3.5, 93), 1.5, 0.7);
      add(s, passby(3.0, 94), 6.5, 0.4);
      return s;
    }, 10),
  amb_yard_loop: () =>
    loopify(
      (d) =>
        add(
          add(babble(d, 14, 100, { lp: 2400, rate: 5, verbMix: 0.45 }), birds(d, 101, 7), 0, 1),
          room(d, 102, 300),
          0,
          0.3,
        ),
      10,
    ),
  amb_canteen_loop: () =>
    loopify((d) => {
      const s = babble(d, 16, 110, { lp: 2200, rate: 5, verbMix: 0.5 });
      const r = rng(111);
      for (let k = 0; k < 9; k++)
        add(
          s,
          clink(0.4, [2600 + r() * 1500, 4300 + r() * 900], 112 + k, 14),
          r() * (d - 0.5),
          0.12,
        );
      return s;
    }, 10),
  amb_class_loop: () =>
    loopify(
      (d) =>
        add(
          add(
            babble(d, 5, 120, { lp: 1800, rate: 4, verbMix: 0.4 }).map((x) => x * 0.5),
            birds(d, 121, 4),
            0,
            1,
          ),
          room(d, 122, 300),
          0,
          0.4,
        ),
      10,
    ),
  amb_hall_loop: () =>
    loopify(
      (d) =>
        add(babble(d, 10, 130, { lp: 2000, rate: 5, verbMix: 0.65 }), room(d, 131, 250), 0, 0.4),
      10,
    ),
  amb_night_loop: () =>
    loopify(
      (d) => add(add(room(d, 141, 220), crickets(d, 140), 0, 0.35), passby(4, 142), 3, 0.2),
      8,
    ),
  amb_quiet_loop: () => loopify((d) => add(room(d, 150, 300), passby(4, 151), 2, 0.3), 8),
  amb_street_loop: () =>
    loopify(
      (d) =>
        add(
          add(babble(d, 26, 160, { lp: 2800, rate: 5, verbMix: 0.5 }), passby(3, 161), 2, 0.6),
          room(d, 162, 300),
          0,
          0.5,
        ),
      10,
    ),
  amb_street_muffled_loop: () =>
    loopify(
      (d) =>
        filt(filt(babble(d, 26, 160, { lp: 2800, rate: 5, verbMix: 0.5 }), 'lp', 380), 'lp', 380),
      10,
    ),
  lion_drum_loop: () => loopify(lionDrum, 8, 0.05),
  lion_drum_muffled_loop: () =>
    loopify((d) => filt(filt(lionDrum(d), 'lp', 260), 'lp', 260), 8, 0.05),
  amb_room_tone_loop: () => loopify((d) => room(d, 170, 250), 6),
};

/** Reused by later episodes (import { gen, … } from "./ep1-sfx.mjs"). */
export {
  add,
  babble,
  birds,
  bubbles,
  clink,
  creak,
  crickets,
  crinkle,
  engine,
  exhale,
  filt,
  flame,
  gen,
  heartbeat,
  hum,
  inhale,
  liquid,
  loopify,
  passby,
  pop,
  room,
  scrape,
  shimmer,
  splash,
  steps,
  thud,
  tick,
  verb,
  whoosh,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(3);
  for (const [name, make] of Object.entries(gen)) {
    if (only.length && !only.includes(name)) continue;
    out(name, make(), name.includes('_loop') ? 0.45 : 0.6);
  }
}
