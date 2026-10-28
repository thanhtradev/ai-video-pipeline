import React from 'react';
import { Html5Audio, interpolate, Sequence, staticFile } from 'remotion';
import { Amb, Cue, ShotDef } from './kit';
import { rings, ringSecAt } from './rings';
import { clamp } from '../../kits/whatif/theme';
import { at, L, LINES, onLang, shot, SHOTS, TOTAL, VOICE } from './time';

/**
 * EP1 audio – every time is an ABSOLUTE frame.
 * Voice: each sentence is its own <Html5Audio>, cut from the source file with trimBefore/trimAfter (= startFrom/endAt), NO speed/pitch change.
 * Mix: voice first (gain 1.0); SFX/foley −7 dB, beds −5 dB versus the first cut; under voice, beds duck a further −12 dB and foley −15 dB (5-frame ramp); during holds beds/foley play at full level.
 */
export const SFX = (n: string) => `reference-audio/sfx/ep1/${n}.wav`;
const VOICE_GAIN = 1.0;
/** Global gains (user: SFX too loud, voice louder) – SFX/foley −7 dB, beds −5 dB. */
const FX_GAIN = 0.45;
const BED_GAIN = 0.56;
const DUCK_BED = Math.pow(10, -12 / 20);
const DUCK_FX = Math.pow(10, -15 / 20);

// distance (frames) to the nearest sentence – computed once per timeline (recomputed on language change)
const buildNear = () => {
  const d = new Float32Array(TOTAL + 1).fill(9999);
  for (const l of LINES)
    for (let k = Math.max(0, l.from - 12); k < Math.min(TOTAL, l.to + 12); k++)
      d[k] = Math.min(d[k], k < l.from ? l.from - k : k >= l.to ? k - l.to + 1 : 0);
  return d;
};
let NEAR: Float32Array | null = null;
onLang(() => (NEAR = null));
/** Voice ducking factor at an absolute frame. */
export const duck = (abs: number, depth: number) => {
  const n = (NEAR ??= buildNear())[Math.max(0, Math.min(TOTAL, Math.round(abs)))];
  return interpolate(n, [0, 5], [depth, 1], clamp);
};

// ───────── Beds ─────────
const AMB: Record<Exclude<Amb, 'none' | 'lantern'>, readonly (readonly [string, number])[]> = {
  living: [['amb_living_loop', 0.62]],
  rules: [
    ['amb_room_tone_loop', 0.5],
    ['amb_quiet_loop', 0.25],
  ],
  yard: [['amb_yard_loop', 0.45]],
  altar: [['amb_quiet_loop', 0.6]],
  teacher: [
    ['amb_quiet_loop', 0.45],
    ['amb_class_loop', 0.12],
  ],
  bath: [
    ['amb_room_tone_loop', 0.4],
    ['amb_quiet_loop', 0.2],
  ],
  hall: [['amb_hall_loop', 0.45]],
  canteen: [['amb_canteen_loop', 0.42]],
  alley: [['amb_quiet_loop', 0.55]],
  class: [
    ['amb_class_loop', 0.65],
    ['amb_quiet_loop', 0.25],
  ],
  night: [
    ['amb_night_loop', 0.62],
    ['amb_room_tone_loop', 0.35],
  ],
  phone: [
    ['amb_hall_loop', 0.3],
    ['static_loop', 0.12],
  ],
};
type Bed = { src: string; from: number; to: number; vol: number; env?: (abs: number) => number };

/** Lantern street: street noise + lion-dance drums, muffled while suffocating, near silence before the scream, back on at reappearance, drums stop at 8.15. */
const lanternBeds = (from: number, to: number): Bed[] => {
  const s84 = shot('8.4');
  const s810 = shot('8.10').from;
  const s812 = shot('8.12').from;
  const shout = L('L206');
  const drumStop = at('L213', 'dừng');
  const s819 = shot('8.19').from;
  const choke = (abs: number) =>
    interpolate(abs, [s810 - 10, s810 + 20], [0, 1], clamp) * (abs < shout ? 1 : 0);
  const quiet = (abs: number) =>
    abs >= s812 && abs < shout ? interpolate(abs, [s812, s812 + 12], [1, 0.12], clamp) : 1;
  const dip = (abs: number) =>
    abs >= s84.from && abs < s84.to
      ? interpolate(abs, [s84.from, s84.from + 8, s84.to - 8, s84.to], [1, 0.35, 0.35, 1], clamp)
      : 1;
  const calm = (abs: number) => interpolate(abs, [s819, s819 + 40], [1, 0.55], clamp);
  const drumOn = (abs: number) => interpolate(abs, [drumStop, drumStop + 3], [1, 0], clamp);
  return [
    {
      src: 'amb_street_loop',
      from,
      to,
      vol: 0.55,
      env: (a) => (1 - choke(a)) * dip(a) * calm(a) * (a >= s812 && a < shout ? 0 : 1),
    },
    { src: 'amb_street_muffled_loop', from, to, vol: 0.6, env: (a) => choke(a) * quiet(a) },
    {
      src: 'lion_drum_loop',
      from,
      to: drumStop + 4,
      vol: 0.4,
      env: (a) => (1 - choke(a)) * dip(a) * drumOn(a) * (a >= s812 && a < shout ? 0 : 1),
    },
    {
      src: 'lion_drum_muffled_loop',
      from,
      to: drumStop + 4,
      vol: 0.45,
      env: (a) => choke(a) * quiet(a) * drumOn(a),
    },
  ];
};

const buildBeds = (defs: Record<string, ShotDef>): Bed[] => {
  const runs: { amb: Amb; from: number; to: number }[] = [];
  for (const s of SHOTS) {
    const amb = defs[s.id]?.amb ?? 'none';
    const last = runs[runs.length - 1];
    if (last && last.amb === amb) last.to = s.to;
    else runs.push({ amb, from: s.from, to: s.to });
  }
  const beds: Bed[] = [];
  for (const r of runs) {
    if (r.amb === 'none') continue;
    // overlap 10 frames into the next segment so cuts have no dead air
    const a = Math.max(0, r.from - 6);
    const b = Math.min(TOTAL, r.to + 10);
    if (r.amb === 'lantern') beds.push(...lanternBeds(a, b));
    else for (const [src, vol] of AMB[r.amb]) beds.push({ src, from: a, to: b, vol });
  }
  return beds;
};

// ───────── BreathRing ticks + heartbeat ─────────
const ringCues = (): (Cue & { abs: true })[] => {
  const out: (Cue & { abs: true })[] = [];
  for (const r of rings()) {
    let red = Infinity;
    for (let a = r.from; a < r.to; a++) {
      const sec = ringSecAt(r, a);
      if (sec >= 120 || 1 - sec / r.cap < 0.2) {
        red = a;
        break;
      }
    }
    let t = r.from + 15;
    while (t < r.to) {
      const isRed = t >= red;
      out.push({ src: isRed ? 'tick_hi' : 'tick', at: t, vol: isRed ? 0.75 : 0.42, abs: true });
      const k = isRed ? Math.min(1, (t - red) / 240) : 0;
      t += isRed ? Math.round(20 - 9 * k) : 30;
    }
    if (r.heart === 'fast' && red < r.to)
      out.push({
        src: 'heartbeat_loop',
        at: red,
        dur: r.to - red,
        loop: true,
        vol: 0.85,
        fadeIn: 20,
        fadeOut: 4,
        abs: true,
      });
    if (r.heart === 'slow')
      out.push({
        src: 'heartbeat_slow_loop',
        at: r.from,
        dur: r.to - r.from,
        loop: true,
        vol: 0.75,
        fadeIn: 20,
        fadeOut: 12,
        abs: true,
      });
  }
  return out;
};

export const AudioLayer: React.FC<{ defs: Record<string, ShotDef> }> = ({ defs }) => {
  const beds = buildBeds(defs);
  const cues: { c: Cue; abs: number }[] = [];
  for (const s of SHOTS) {
    const fx = defs[s.id]?.fx;
    if (!fx) continue;
    const h = {
      id: s.id,
      dur: s.to - s.from,
      from: s.from,
      L: (l: string) => L(l) - s.from,
      E: (l: string) => LINES.find((x) => x.id === l)!.to - s.from,
      at: (l: string, w: string, n = 1, e: 'start' | 'end' = 'start') => at(l, w, n, e) - s.from,
      H: (l: string) => LINES.find((x) => x.id === l)!.holdFrom - s.from,
      HE: (l: string) => LINES.find((x) => x.id === l)!.holdTo - s.from,
    };
    for (const c of fx(h)) cues.push({ c, abs: s.from + c.at });
  }
  for (const c of ringCues()) cues.push({ c, abs: c.at });
  return (
    <>
      {LINES.map((l) => (
        <Sequence
          key={l.id}
          name={`🗣 ${l.id} ${l.text.slice(0, 24)}`}
          from={l.from}
          durationInFrames={l.to - l.from}
          layout="none"
        >
          <Html5Audio
            src={staticFile(VOICE)}
            trimBefore={l.src[0]}
            trimAfter={l.src[1]}
            volume={VOICE_GAIN}
          />
        </Sequence>
      ))}
      {beds.map((b, i) => (
        <Sequence
          key={`bed${i}`}
          name={`🌫 ${b.src}`}
          from={b.from}
          durationInFrames={Math.max(1, b.to - b.from)}
          layout="none"
        >
          <Html5Audio
            src={staticFile(SFX(b.src))}
            loop
            volume={(f) =>
              BED_GAIN *
              b.vol *
              duck(b.from + f, DUCK_BED) *
              interpolate(f, [0, 12], [0, 1], clamp) *
              interpolate(f, [b.to - b.from - 12, b.to - b.from], [1, 0], clamp) *
              (b.env ? b.env(b.from + f) : 1)
            }
          />
        </Sequence>
      ))}
      {cues
        .filter(({ abs }) => abs >= 0 && abs < TOTAL)
        .map(({ c, abs }, i) => (
          <Sequence
            key={`fx${i}`}
            name={`🔊 ${c.src}`}
            from={Math.round(abs)}
            durationInFrames={c.dur ?? 150}
            layout="none"
          >
            <Html5Audio
              src={staticFile(SFX(c.src))}
              loop={c.loop}
              volume={(f) =>
                FX_GAIN *
                (c.vol ?? 0.7) *
                (c.noDuck ? 1 : duck(abs + f, DUCK_FX)) *
                (c.fadeIn ? interpolate(f, [0, c.fadeIn], [0, 1], clamp) : 1) *
                (c.fadeOut && c.dur ? interpolate(f, [c.dur - c.fadeOut, c.dur], [1, 0], clamp) : 1)
              }
            />
          </Sequence>
        ))}
    </>
  );
};
