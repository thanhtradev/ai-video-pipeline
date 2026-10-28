// TikTok 2 · EP5 "Dừng thời gian 30 giây": synthesized SFX, foley and ambience (deterministic by seed),
// reusing EP1's synth functions. Lessons: no birds, no broadband babble (heard as hiss), no pure high
// sines; distant voices low-passed. Run: node ep5-sfx.mjs <output dir> → <output dir>/*.wav
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { biquad, buffer, rng, SR, smoothstep, writeWav } from './sfx-lib.mjs';
import {
  add,
  babble,
  clink,
  creak,
  crinkle,
  filt,
  gen as ep1,
  heartbeat,
  hum,
  loopify,
  passby,
  pop,
  room,
  scrape,
  steps,
  thud,
  verb,
  whoosh,
} from './ep1-sfx.mjs';

const OUT = process.argv[2] ?? join(process.cwd(), 'sfx-out');
const out = (name, s, peak = 0.6) => writeWav(join(OUT, `${name}.wav`), s, peak);
const nz = (r) => r() * 2 - 1;
const TAU = 2 * Math.PI;
const env = (t, a, d, dur) => smoothstep(t / a) * smoothstep((dur - t) / d);
const soft = (s, f = 3500) => filt(filt(s, 'lp', f), 'lp', f);

/** Dry clap. */
const clap = () =>
  add(
    soft(filt(crinkle(0.12, 1, 0.6, 700), 'bp', 1400), 4000),
    thud(0.12, 180, 2, 0.3, 2500),
    0,
    0.5,
  );
/** Long low "whoosh" when the world freezes. */
const freezeWhoosh = () => {
  const dur = 1.4;
  const s = buffer(dur);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (180 * Math.pow(0.4, t / dur)) / SR;
    s[i] = Math.sin(TAU * ph) * env(t, 0.03, 0.6, dur) * 0.6;
  }
  return verb(add(s, soft(whoosh(1.0, 3, 200, 900), 1500), 0, 0.8), 0.4, 1.4);
};
/** Time release "pop": a short reverse suck. */
const thaw = () => verb(Float32Array.from(soft(whoosh(0.5, 4, 300, 1500), 2000)).reverse(), 0.2);
const dayTick = () => pop(0.18, 1400, 700, 5);
const clockTick = () => {
  const s = buffer(0.06);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      Math.sin(TAU * 1200 * t) * Math.exp(-t * 90) +
      Math.sin(TAU * 600 * t) * Math.exp(-t * 70) * 0.5;
  }
  return s;
};
const freezeHum = (d) => add(hum(d, 55, 6), filt(room(d, 7, 150, 1), 'lp', 150), 0, 0.5);
const breath = (dur = 0.9, seed = 8) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad('bp', 600, 0.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = bp(nz(r)) * Math.sin((Math.PI * t) / dur) ** 2;
  }
  return soft(s, 1500);
};
const breathLoop = (d) => {
  const s = buffer(d);
  for (let t = 0, k = 0; t < d - 0.5; t += 0.75, k++)
    add(s, breath(0.6, 20 + k), t, k % 2 ? 0.7 : 1);
  return s;
};
const chalk = () => soft(filt(crinkle(0.8, 9, 0.05, 1500), 'bp', 2200), 4000);
const tear = () => {
  const s = buffer(0.7);
  add(s, soft(crinkle(0.45, 10, 0.08, 900), 3200), 0, 1);
  add(s, thud(0.08, 300, 11, 0.4, 2000), 0.42, 0.5);
  return s;
};
const flutter = () => soft(filt(crinkle(1.2, 12, 0.01, 600), 'bp', 1200), 2500);
const eggPlace = () => clink(0.15, [1300, 2100], 13, 30);
const basketDrop = () =>
  add(
    thud(0.3, 120, 14, 0.5, 1500),
    creak(0.3, 15, 500).map((x) => x * 0.3),
    0.02,
    0.6,
  );
const kick = () => add(thud(0.3, 90, 16, 0.9, 2500), crinkle(0.06, 17, 0.2, 2000), 0, 0.5);
const hug = () =>
  soft(add(crinkle(0.3, 18, 0.03, 500), thud(0.2, 90, 19, 0.4, 900), 0.02, 0.8), 2000);
const cheer = () => {
  const s = soft(babble(2.2, 10, 20, { lp: 1800, rate: 3, verbMix: 0.4 }), 1800);
  for (let i = 0; i < s.length; i++) s[i] *= env(i / SR, 0.2, 0.8, 2.2);
  return s;
};
const shutter = () => add(clink(0.05, [2400], 21, 80), thud(0.06, 400, 22, 0.4, 2500), 0.06, 0.6);
const chuckle = () => {
  const s = buffer(1);
  for (let k = 0; k < 4; k++) {
    const b = buffer(0.14);
    const bp = biquad('bp', 500, 3);
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      ph += 140 / SR;
      b[i] = bp(2 * (ph % 1) - 1) * Math.sin((Math.PI * i) / b.length);
    }
    add(s, b, 0.05 + k * 0.17, 1 - k * 0.15);
  }
  return soft(s, 2000);
};
const pencil = () => {
  const s = buffer(2);
  for (let t = 0.05, k = 0; t < 1.9; t += 0.16, k++)
    add(s, soft(crinkle(0.08, 30 + k, 0.2, 1000), 3000), t, 0.8);
  return s;
};
const glassBreak = () =>
  add(
    soft(clink(0.8, [1800, 2700, 3600], 23, 7), 5000),
    soft(crinkle(0.5, 24, 0.05, 1500), 4500),
    0.02,
    0.5,
  );
const bowlDrop = () =>
  add(
    add(buffer(1.2), clink(0.9, [900, 1500, 2300], 25, 6), 0, 0.8),
    thud(0.3, 140, 26, 0.6, 1500),
    0,
    0.8,
  );
const chairScrape = () => scrape(0.6, 27, 500);
const phoneDial = () => {
  const s = buffer(1.2);
  [
    [697, 1209],
    [697, 1209],
    [770, 1336],
  ].forEach(([a, b], k) => {
    for (let i = 0; i < SR * 0.12; i++) {
      const t = i / SR;
      const kk = Math.floor((0.1 + k * 0.3 + t) * SR);
      if (kk < s.length) s[kk] += (Math.sin(TAU * a * t) + Math.sin(TAU * b * t)) * 0.4;
    }
  });
  return s;
};
const wheel = (d, f0, seed) => {
  const r = rng(seed);
  const s = buffer(d);
  const lp = biquad('lp', f0, 0.7);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = lp(nz(r)) * (0.7 + 0.3 * Math.sin(TAU * 2.2 * t)) + (r() < 0.0006 ? 0.8 : 0);
  }
  return soft(s, 1200);
};
const horn = () => {
  const s = buffer(0.6);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      (Math.sin(TAU * 420 * t) + 0.6 * Math.sin(TAU * 530 * t)) *
      env(t, 0.02, 0.08, 0.45) *
      (t < 0.45 ? 1 : 0);
  }
  return filt(s, 'lp', 2000);
};
const streetBurst = (d) => {
  const s = add(
    add(passby(2.5, 31), passby(3, 32), 1, 0.8),
    filt(room(d, 33, 200, 1), 'lp', 200),
    0,
    0.7,
  );
  [0.3, 1.8].forEach((t) => add(s, horn(), t, 0.6));
  return s;
};
const doorSwing = () =>
  add(
    creak(0.6, 34, 300).map((x) => x * 0.5),
    whoosh(0.4, 35, 300, 900),
    0,
    0.6,
  );
const doorClose = () => add(thud(0.4, 80, 36, 0.6, 900), clink(0.2, [700], 37, 20), 0.02, 0.3);
const monitorBeep = (d) => {
  const s = buffer(d);
  for (let t = 0.1; t < d - 0.2; t += 1.0) {
    for (let i = 0; i < SR * 0.12; i++) {
      const u = i / SR;
      const k = Math.floor((t + u) * SR);
      if (k < s.length) s[k] += Math.sin(TAU * 880 * u) * env(u, 0.005, 0.04, 0.12) * 0.6;
    }
  }
  return s;
};
const nailTap = () =>
  add(
    add(buffer(0.8), thud(0.1, 300, 38, 0.3, 2500), 0, 1),
    thud(0.1, 320, 39, 0.3, 2500),
    0.3,
    0.9,
  );

const gen = {
  clap: () => clap(),
  freeze_whoosh: () => freezeWhoosh(),
  thaw: () => thaw(),
  day_tick: () => dayTick(),
  clock_tick: () => clockTick(),
  freeze_hum_loop: () => loopify((d) => freezeHum(d), 4),
  breath: () => breath(),
  breath_loop: () => loopify((d) => breathLoop(d), 3),
  steps_tile_loop: ep1.steps_tile_loop,
  steps_run_loop: () =>
    loopify((d) => steps(d, 0.2, 40, { f: 1400, low: 100, hard: 0.7, jitter: 0.04 }), 2, 0.05),
  page_flip: () => soft(filt(whoosh(0.45, 41, 700, 2200), 'hp', 400), 3000),
  chalk: () => chalk(),
  whoosh_ui: ep1.whoosh_ui,
  whoosh: ep1.whoosh,
  buzz: ep1.buzz,
  startle: ep1.startle,
  cloth: ep1.cloth,
  paper: () => soft(ep1.paper(), 3000),
  ting: ep1.ting,
  chair_lift: () => add(scrape(0.3, 42, 400), thud(0.2, 120, 43, 0.3, 1200), 0.25, 0.5),
  paper_flutter: () => flutter(),
  heartbeat_loop: () => heartbeat(1.0, 1.0),
  calendar_tear: () => tear(),
  basket_drop: () => basketDrop(),
  egg_place: () => eggPlace(),
  ball_kick: () => kick(),
  ball_hug: () => hug(),
  cheer: () => cheer(),
  camera_shutter: () => shutter(),
  grandpa_chuckle: () => chuckle(),
  pencil_marks: () => pencil(),
  glass_break: () => glassBreak(),
  bowl_drop: () => bowlDrop(),
  chair_scrape: () => chairScrape(),
  phone_dial: () => phoneDial(),
  wheel_tile: () => loopify((d) => wheel(d, 500, 44), 2),
  wheel_road: () => loopify((d) => wheel(d, 300, 45), 2),
  wheel_hospital: () => loopify((d) => wheel(d, 700, 46), 2),
  horn: () => horn(),
  street_burst: () => loopify((d) => streetBurst(d), 3),
  door_swing: () => doorSwing(),
  door_close_heavy: () => doorClose(),
  monitor_beep: () => loopify((d) => monitorBeep(d), 3, 0.05),
  nail_tap: () => nailTap(),
  // ambience (no birds; distant voices low-passed)
  amb_class_soft_loop: () =>
    loopify(
      (d) =>
        add(
          soft(babble(d, 6, 50, { lp: 1200, rate: 4, verbMix: 0.4 }), 1100).map((x) => x * 0.5),
          room(d, 51, 260, 1),
          0,
          0.8,
        ),
      10,
    ),
  amb_home_loop: () =>
    loopify(
      (d) => add(add(room(d, 52, 260, 1), passby(4, 53), 3, 0.35), hum(d, 98, 54), 0, 0.03),
      10,
    ),
  amb_yard_soft_loop: () =>
    loopify(
      (d) =>
        add(
          soft(babble(d, 10, 55, { lp: 1400, rate: 5, verbMix: 0.4 }), 1300),
          room(d, 56, 300, 1),
          0,
          0.6,
        ),
      10,
    ),
  amb_alley_loop: () =>
    loopify(
      (d) =>
        add(
          add(add(room(d, 57, 280, 1), passby(3, 58), 2, 0.6), passby(3.5, 59), 6, 0.5),
          soft(babble(d, 4, 60, { lp: 1000, rate: 4, verbMix: 0.5 }), 900),
          0,
          0.3,
        ),
      10,
    ),
  amb_dinner_loop: () =>
    loopify((d) => {
      const s = add(
        room(d, 61, 300, 1),
        (() => {
          const r = rng(62);
          const b = buffer(d);
          const bp = biquad('bp', 380, 0.8);
          for (let i = 0; i < b.length; i++)
            b[i] = bp(nz(r)) * (0.7 + 0.3 * Math.sin((TAU * 3.2 * i) / SR));
          return b;
        })(),
        0,
        0.5,
      );
      [1.5, 4.2, 7.1].forEach((t, k) =>
        add(
          s,
          add(
            clink(0.25, [2300, 3600], 63 + k, 25),
            clink(0.25, [2500, 3800], 66 + k, 25),
            0.12,
            0.7,
          ),
          t,
          0.3,
        ),
      );
      return s;
    }, 9),
  amb_street_night_loop: () => loopify((d) => streetBurst(d).map((x) => x * 0.6), 6),
  amb_er_loop: () =>
    loopify(
      (d) =>
        add(
          add(
            room(d, 70, 300, 1),
            soft(babble(d, 5, 71, { lp: 1000, rate: 4, verbMix: 0.6 }), 900),
            0,
            0.35,
          ),
          hum(d, 60, 72),
          0,
          0.05,
        ),
      10,
    ),
  amb_ward_loop: () => loopify((d) => add(room(d, 73, 220, 1), passby(4, 74), 4, 0.15), 10),
  amb_room_tone_loop: ep1.amb_room_tone_loop,
  amb_quiet_loop: ep1.amb_quiet_loop,
};

for (const [name, make] of Object.entries(gen))
  out(name, make(), name.includes('_loop') ? 0.45 : 0.6);
