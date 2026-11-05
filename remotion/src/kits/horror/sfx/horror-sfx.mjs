// "Kinh dị" kit (D-106): synthesized horror SFX (no recorded samples, deterministic by seed), built
// on the whatif synth library. Events are short; the only loop is tied to walking on screen. No
// ambience beds and no room tone (D-069). Run directly it writes every sound:
// node horror-sfx.mjs <output dir>
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  add,
  creak,
  filt,
  flame,
  heartbeat,
  loopify,
  steps,
  thud,
  verb,
} from '../../whatif/sfx/ep1-sfx.mjs';
import { biquad, buffer, rng, SR, smoothstep, writeWav } from '../../whatif/sfx/sfx-lib.mjs';

const TAU = 2 * Math.PI;
const env = (t, a, d, dur) => smoothstep(t / a) * smoothstep((dur - t) / d);
const nz = (r) => r() * 2 - 1;

/** Slow wooden door: a long low creak with a little room around it. */
const doorCreak = () => verb(filt(creak(1.6, 21, 230), 'lp', 1800), 0.25, 1.4);
/** One floorboard giving way under a step. */
const floorboard = () => {
  const s = filt(creak(0.5, 22, 170), 'lp', 1500);
  return add(s, thud(0.18, 80, 23, 0.5, 900), 0.02, 0.5);
};
/** Slow footsteps on earth or tile, in a hall; a loop tied to walking on screen. */
const footstepsSlowLoop = () =>
  loopify(
    (d) => steps(d, 0.92, 24, { f: 900, low: 70, hard: 0.5, jitter: 0.06, verbMix: 0.35 }),
    3.7,
  );
/** A gust of wind through a gap: short band-limited noise swell, never a bed. */
const windGust = (dur = 1.8, seed = 25) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 420, 1.2);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const swell = Math.sin((t / dur) * Math.PI) ** 2;
    s[i] = bp(nz(r)) * swell * env(t, 0.3, 0.5, dur);
  }
  return filt(s, 'lp', 1100);
};
/** A whisper you cannot make out: shaped noise with a few breathy syllables, low-passed. */
const whisper = (dur = 1.1, seed = 26) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 1500, 2.5);
  const syll = [0.05, 0.3, 0.55, 0.8].map((at) => at + r() * 0.05);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let g = 0;
    for (const at of syll) g += Math.exp(-((t - at) ** 2) / 0.004);
    s[i] = bp(nz(r)) * Math.min(1, g) * env(t, 0.05, 0.15, dur);
  }
  return verb(filt(s, 'lp', 2400), 0.2, 0.8);
};
/** The lamp flame gutters once. */
const lampFlicker = () => filt(flame(0.5, 27), 'lp', 1500);
/** Slow heartbeat, four beats. */
const heartbeatSlow = () => heartbeat(1.3, 5.2);
/** A single drop of water in a basin, with a little echo. */
const waterDrip = (seed = 28) => {
  const s = buffer(0.5);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 1300 * Math.exp(-t * 18) + 500;
    s[i] = Math.sin(TAU * f * t) * Math.exp(-t * 22) * 0.8;
  }
  return verb(s, 0.45, 1.6 + (seed % 3) * 0.1);
};
/** A temple bell far away: two partials, long decay, low-passed. */
const bellFar = () => {
  const dur = 2.6;
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      (Math.sin(TAU * 523 * t) * 0.6 +
        Math.sin(TAU * 784 * t) * 0.3 +
        Math.sin(TAU * 1046 * t) * 0.1) *
      Math.exp(-t * 1.6);
  }
  return verb(filt(s, 'lp', 1200), 0.5, 1.8);
};
/** Low sting: a one-shot swell under two seconds (never a drone under a scene). */
const stingLow = () => {
  const dur = 1.8;
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const swell = Math.sin((t / dur) * Math.PI) ** 1.5;
    s[i] =
      (Math.sin(TAU * 55 * t) + 0.5 * Math.sin(TAU * 82.5 * t) + 0.25 * Math.sin(TAU * 110 * t)) *
      swell;
  }
  return filt(s, 'lp', 300);
};

/** Every horror sound by file name (`sfx/<name>.wav`). */
export const gen = {
  door_creak: doorCreak,
  floorboard,
  footsteps_slow_loop: footstepsSlowLoop,
  wind_gust: () => windGust(),
  whisper: () => whisper(),
  lamp_flicker: lampFlicker,
  heartbeat_slow: heartbeatSlow,
  water_drip: () => waterDrip(),
  bell_far: bellFar,
  sting_low: stingLow,
};

export {
  doorCreak,
  floorboard,
  footstepsSlowLoop,
  windGust,
  whisper,
  lampFlicker,
  heartbeatSlow,
  waterDrip,
  bellFar,
  stingLow,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] ?? join(process.cwd(), 'sfx-out');
  for (const [name, make] of Object.entries(gen)) {
    writeWav(join(outDir, `${name}.wav`), make(), name.includes('_loop') ? 0.45 : 0.6);
  }
}
