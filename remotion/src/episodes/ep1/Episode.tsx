import React, { useEffect } from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { AudioLayer } from './audio';
import { ShotDef } from './kit';
import { ringAt, ringSecAt } from './rings';
import { ACT12 } from './shots/act12';
import { ACT34 } from './shots/act34';
import { ACT56 } from './shots/act56';
import { ACT7 } from './shots/act7';
import { ACT8 } from './shots/act8';
import { ACT9 } from './shots/act9';
import { clamp, FONT } from '../../kits/whatif/theme';
import { Lang, setLang, shot, SHOTS, speakingAt, TIMING, tr } from './time';
import { BreathRing, Captions, ringShow } from '../../kits/whatif/ui';

/**
 * TikTok 2 · EP1 "Nếu bạn tàng hình được — nhưng chỉ khi nín thở?" – ONE composition (Tiktok2Ep1), 16:9 1920×1080, 30 fps.
 * Every shot is a <Sequence> at an ABSOLUTE frame taken from data/timing.json (generated from the voice).
 */
export const DEFS: Record<string, ShotDef> = {
  ...ACT12,
  ...ACT34,
  ...ACT56,
  ...ACT7,
  ...ACT8,
  ...ACT9,
};

const Missing: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill
    style={{
      background: '#333',
      color: '#fff',
      fontFamily: FONT,
      fontSize: 80,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    shot {id}
  </AbsoluteFill>
);

const ACT = (n: number) => TIMING.acts.find((a) => a.act === n)!;
/** Grade by act: 1–6 normal · 7 desaturates gradually to ~60% · 8 warm lantern light · 9 full saturation. */
const grade = (abs: number) => {
  const a7 = ACT(7);
  const a8 = ACT(8);
  if (abs >= a7.from && abs < a7.to)
    return {
      filter: `saturate(${interpolate(abs, [a7.from, a7.to - 60], [1, 0.6], clamp)})`,
      warm: 0,
    };
  if (abs >= a8.from && abs < a8.to)
    return {
      filter: `saturate(${interpolate(abs, [a8.from, a8.from + 30], [0.6, 1.05], clamp)})`,
      warm: 1,
    };
  if (abs >= ACT(9).from) return { filter: 'saturate(1.14) brightness(1.02)', warm: 0 };
  return { filter: undefined, warm: 0 };
};

export const ShotView: React.FC<{ id: string }> = ({ id }) => {
  const C = DEFS[id]?.C;
  return C ? <C /> : <Missing id={id} />;
};

const RingLayer: React.FC = () => {
  const abs = useCurrentFrame();
  const r = ringAt(abs);
  if (!r) return null;
  return (
    <BreathRing sec={ringSecAt(r, abs)} cap={r.cap} show={ringShow(abs, r.from, r.to)} f={abs} />
  );
};

/** English version (same picture/effects, English voice + text): Tiktok2Ep1En. */
export const Tiktok2Ep1: React.FC<{ lang?: Lang }> = ({ lang = 'vi' }) => {
  setLang(lang);
  useEffect(() => () => setLang('vi'), []); // leaving the EN version in Studio → switch the other episodes back to Vietnamese
  const abs = useCurrentFrame();
  const g = grade(abs);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ filter: g.filter }}>
        {SHOTS.map((s) => (
          <Sequence
            key={s.id}
            name={`${s.id} · ${s.moc}`}
            from={s.from}
            durationInFrames={s.to - s.from}
          >
            <ShotView id={s.id} />
          </Sequence>
        ))}
        {g.warm > 0 && (
          <AbsoluteFill
            style={{
              background:
                'radial-gradient(ellipse at 50% 30%, rgba(255,170,80,0.16), rgba(255,120,40,0.06))',
              mixBlendMode: 'soft-light',
            }}
          />
        )}
      </AbsoluteFill>
      <RingLayer />
      <Captions
        speaking={speakingAt}
        yAt={(a) => DEFS[SHOTS.find((s) => a >= s.from && a < s.to)?.id ?? '']?.capY ?? 950}
        size={tr(50, 40)}
      />
      <AudioLayer defs={DEFS} />
    </AbsoluteFill>
  );
};

/** Review storyboard: each frame = one page of 3×4 shot images (taken at `pick` of the shot length). */
export const BOARD_PER = 12;
export const T2E1Board: React.FC<{ pick?: number; lang?: Lang }> = ({
  pick = 0.55,
  lang = 'vi',
}) => {
  setLang(lang);
  useEffect(() => () => setLang('vi'), []);
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD_PER, page * BOARD_PER + BOARD_PER);
  return (
    <AbsoluteFill
      style={{
        background: '#1a1820',
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
        gap: 12,
        alignContent: 'flex-start',
      }}
    >
      {list.map((s) => {
        const local = Math.round((s.to - s.from) * pick);
        return (
          <div
            key={s.id}
            style={{
              width: 624,
              height: 351,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 1920,
                height: 1080,
                transform: 'scale(0.325)',
                transformOrigin: '0 0',
                position: 'absolute',
              }}
            >
              <Sequence from={page - local} layout="none">
                <ShotView id={s.id} />
              </Sequence>
              <Sequence from={page - s.from - local} layout="none">
                <RingLayer />
              </Sequence>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 6,
                top: 4,
                color: '#fff',
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 26,
                textShadow: '0 2px 4px #000',
              }}
            >
              {s.id} · {shot(s.id).start.toFixed(1)}s
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
