import React from 'react';
import { Html5Audio, interpolate, Sequence, staticFile } from 'remotion';
import { clamp } from '../ep1/theme';
import { Amb, Cue, ShotDef } from './kit';
import { at, L, line, LINES, SHOTS, TOTAL, VOICE } from './time';

/**
 * EP2 audio – every time is an ABSOLUTE frame. Voice: each sentence is its own <Html5Audio> cut from the source file with trimBefore/trimAfter
 * (= startFrom/endAt), no speed/pitch change. Same mix as the user-approved EP1: voice 1.0, SFX ×0.45, beds ×0.56;
 * under voice beds duck a further −12 dB, foley −15 dB; during holds beds/foley play at full level.
 */
export const SFX = (n: string) => `kênh tiktok 2/sfx/ep2/${n}.wav`;
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
  // the user asked to drop amb_bedroom_morning_loop entirely (heard as repeating hiss) – only room tone + quiet bed remain
  bedroom: [
    ['amb_room_tone_loop', 0.6],
    ['amb_quiet_loop', 0.4],
  ],
  rules: [
    ['amb_room_tone_loop', 0.5],
    ['amb_quiet_loop', 0.25],
  ],
  // the user asked to drop amb_class_loop entirely
  class: [
    ['amb_quiet_loop', 0.55],
    ['amb_room_tone_loop', 0.45],
  ],
  yard: [['amb_yard_loop', 0.55]],
  tet: [['amb_tet_loop', 0.55]],
  dinner: [
    ['amb_dinner_loop', 0.75],
    ['amb_room_tone_loop', 0.4],
  ],
  lot: [['amb_lot_loop', 0.6]],
  balcony: [
    ['amb_balcony_night_loop', 0.65],
    ['amb_room_tone_loop', 0.3],
  ],
  kitchen: [
    ['amb_kitchen_night_loop', 0.6],
    ['amb_room_tone_loop', 0.3],
  ],
  quiet: [
    ['amb_quiet_loop', 0.55],
    ['amb_room_tone_loop', 0.3],
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
  return runs
    .filter((r) => r.amb !== 'none')
    .flatMap((r) =>
      AMB[r.amb as Exclude<Amb, 'none'>].map(([src, vol]) => ({
        src,
        from: Math.max(0, r.from - 6),
        to: Math.min(TOTAL, r.to + 10),
        vol,
      })),
    );
};

export const AudioLayer2: React.FC<{ defs: Record<string, ShotDef> }> = ({ defs }) => {
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
