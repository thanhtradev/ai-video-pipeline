import React from 'react';
import { Html5Audio, interpolate, Sequence, staticFile } from 'remotion';
import { clamp } from '../../kits/whatif/theme';
import { Cue, ShotDef } from './kit';
import { FREEZES } from './freeze';
import { at, L, line, LINES, SHOTS, TOTAL, VOICE } from './time';

/**
 * EP5 audio – every time is an ABSOLUTE frame. Voice: each sentence is its own <Html5Audio> cut from the source file with trimBefore/trimAfter
 * (= startFrom/endAt), no speed/pitch change. Voice 1.0, SFX ×0.45, foley ducked −15 dB under the voice and at full
 * level during holds. No ambience beds or room tone: they were filtered noise heard as constant hiss (2026-10-29).
 */
export const SFX = (n: string) => `reference-audio/sfx/ep5/${n}.wav`;
const VOICE_GAIN = 1.0;
const FX_GAIN = 0.45;
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

export const AudioLayer5: React.FC<{ defs: Record<string, ShotDef> }> = ({ defs }) => {
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
