import React from 'react';
import { Html5Audio, interpolate, Sequence, staticFile } from 'remotion';
import { clamp } from '../../kits/whatif/theme';
import { Amb, Cue, ShotDef } from './kit';
import { FREEZES, freezeK } from './freeze';
import { at, L, line, LINES, SHOTS, TOTAL, VOICE } from './time';

/**
 * EP5 audio – every time is an ABSOLUTE frame. Voice: each sentence is its own <Html5Audio> cut from the source file with trimBefore/trimAfter
 * (= startFrom/endAt), no speed/pitch change. Same mix as the user-approved EP1: voice 1.0, SFX ×0.45, beds ×0.56;
 * under voice beds duck a further −12 dB, foley −15 dB; during holds beds/foley play at full level.
 */
export const SFX = (n: string) => `reference-audio/sfx/ep5/${n}.wav`;
const VOICE_GAIN = 1.0;
const FX_GAIN = 0.45;
const BED_GAIN = 0.56;
const DUCK_BED = Math.pow(10, -12 / 20);
const DUCK_FX = Math.pow(10, -15 / 20);

const NEAR = (() => {
  const d = new Float32Array(TOTAL + 1).fill(9999);
  for (const l of LINES)
    for (let k = Math.max(0, l.from - 12); k < Math.min(TOTAL, l.to + 12); k++)
      d[k] = Math.min(d[k], k < l.from ? l.from - k : k >= l.to ? k - l.to + 1 : 0);
  return d;
})();
const duck = (abs: number, depth: number) =>
  interpolate(NEAR[Math.max(0, Math.min(TOTAL, Math.round(abs)))], [0, 5], [depth, 1], clamp);

const AMB: Record<Exclude<Amb, 'none'>, readonly (readonly [string, number])[]> = {
  class: [
    ['amb_class_soft_loop', 0.6],
    ['amb_room_tone_loop', 0.35],
  ],
  home: [
    ['amb_home_loop', 0.65],
    ['amb_room_tone_loop', 0.3],
  ],
  yard: [
    ['amb_yard_soft_loop', 0.6],
    ['amb_room_tone_loop', 0.3],
  ],
  alley: [['amb_alley_loop', 0.65]],
  dinner: [
    ['amb_dinner_loop', 0.65],
    ['amb_room_tone_loop', 0.3],
  ],
  street: [
    ['amb_street_night_loop', 0.6],
    ['amb_room_tone_loop', 0.3],
  ],
  er: [
    ['amb_er_loop', 0.65],
    ['amb_room_tone_loop', 0.3],
  ],
  ward: [
    ['amb_ward_loop', 0.65],
    ['amb_room_tone_loop', 0.35],
  ],
  rules: [
    ['amb_room_tone_loop', 0.5],
    ['amb_quiet_loop', 0.25],
  ],
  quiet: [
    ['amb_quiet_loop', 0.55],
    ['amb_room_tone_loop', 0.35],
  ],
};
type Bed = { src: string; from: number; to: number; vol: number };
const buildBeds = (defs: Record<string, ShotDef>): Bed[] => {
  const runs: { amb: Amb; from: number; to: number }[] = [];
  for (const s of SHOTS) {
    const amb = defs[s.id]?.amb ?? 'none';
    const last = runs[runs.length - 1];
    if (last && last.amb === amb) last.to = s.to;
    else runs.push({ amb, from: s.from, to: s.to });
  }
  // Each bed run is split around the time stops (beds are off during a stop): one <Audio> spanning a long zero-volume stretch
  // is rendered silent by Remotion for the rest of its length (seen at 3.4–3.6 and 8.14–8.18).
  const pieces = (from: number, to: number) => {
    const out: { from: number; to: number }[] = [];
    let a = from;
    for (const z of FREEZES) {
      if (z.to <= a || z.from >= to) continue;
      if (z.from + 10 > a) out.push({ from: a, to: z.from + 10 });
      a = Math.max(a, z.to - 2);
    }
    if (to > a) out.push({ from: a, to });
    return out.filter((p) => p.to - p.from > 4);
  };
  return runs
    .filter((r) => r.amb !== 'none')
    .flatMap((r) =>
      pieces(Math.max(0, r.from - 6), Math.min(TOTAL, r.to + 10)).flatMap((p) =>
        AMB[r.amb as Exclude<Amb, 'none'>].map(([src, vol]) => ({ src, ...p, vol })),
      ),
    );
};

export const AudioLayer5: React.FC<{ defs: Record<string, ShotDef> }> = ({ defs }) => {
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
      E: (l: string) => line(l).to - s.from,
      at: (l: string, w: string, n = 1, e: 'start' | 'end' = 'start') => at(l, w, n, e) - s.from,
      H: (l: string) => line(l).holdFrom - s.from,
      HE: (l: string) => line(l).holdTo - s.from,
    };
    for (const c of fx(h)) cues.push({ c, abs: s.from + c.at });
  }
  // Time stops: claps + "whoosh" + "tick" and the per-second clock ticks are pre-mixed into freeze_stem.wav
  // (scripts/tiktok2/ep5/bake-freeze-stem.ts, same ALL_CLAPS/clockSec times) – ~500 separate <Audio> filled the disk while rendering.
  // Only these remain here: a low hum during a stop; on release the world sound comes back.
  for (const z of FREEZES) {
    cues.push({
      c: {
        src: 'freeze_hum_loop',
        at: 0,
        vol: 0.5,
        dur: z.to - z.from,
        loop: true,
        fadeIn: 10,
        fadeOut: 4,
      },
      abs: z.from,
    });
    if (z !== FREEZES[0]) cues.push({ c: { src: 'thaw', at: 0, vol: 0.6 }, abs: z.to - 2 });
  }
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
      <Sequence
        name="🔊 freeze_stem (vỗ tay + tích tắc)"
        from={0}
        durationInFrames={TOTAL}
        layout="none"
      >
        <Html5Audio src={staticFile(SFX('freeze_stem'))} volume={(f) => duck(f, DUCK_FX)} />
      </Sequence>
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
              (1 - freezeK(b.from + f)) *
              BED_GAIN *
              b.vol *
              duck(b.from + f, DUCK_BED) *
              interpolate(f, [0, 12], [0, 1], clamp) *
              interpolate(f, [b.to - b.from - 12, b.to - b.from], [1, 0], clamp)
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
                duck(abs + f, DUCK_FX) *
                (c.fadeIn ? interpolate(f, [0, c.fadeIn], [0, 1], clamp) : 1) *
                (c.fadeOut && c.dur ? interpolate(f, [c.dur - c.fadeOut, c.dur], [1, 0], clamp) : 1)
              }
            />
          </Sequence>
        ))}
    </>
  );
};
