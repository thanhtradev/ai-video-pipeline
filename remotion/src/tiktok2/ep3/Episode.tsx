import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { clamp, FONT } from '../ep1/theme';
import { Captions } from '../ep1/ui';
import { AudioLayer3 } from './audio';
import { GradeCtx, ShotDef } from './kit';
import { ACT123 } from './shots/act123';
import { ACT45 } from './shots/act45';
import { ACT67 } from './shots/act67';
import { ACT89 } from './shots/act89';
import { shot, SHOTS, speakingAt, TIMING } from './time';

/**
 * TikTok 2 · EP3 "Nếu bạn quay lại được 30 giây — nhưng chỉ 3 lần mỗi ngày?" – ONE composition (Tiktok2Ep3), 16:9 1920×1080, 30 fps.
 * Every shot is a <Sequence> at an ABSOLUTE frame taken from data/timing.json (generated from the voice).
 */
export const DEFS3: Record<string, ShotDef> = { ...ACT123, ...ACT45, ...ACT67, ...ACT89 };

const ACT = (n: number) => TIMING.acts.find((a) => a.act === n)!;
/** Grade by act: 1–5 fresh early morning · 6 desaturates gradually to ~60% (except the orange hoodie) · 7 grey afternoon · 8 late-afternoon golden sun · 9 clear light, full saturation. */
const grade = (abs: number) => {
  const a6 = ACT(6);
  const a7 = ACT(7);
  const a8 = ACT(8);
  const a9 = ACT(9);
  if (abs >= a6.from && abs < a6.to) {
    const s = interpolate(abs, [a6.from, a6.to - 60], [1, 0.6], clamp);
    return {
      ctx: { set: `saturate(${s})`, side: `saturate(${s})` },
      overlay: undefined,
      filter: undefined,
    };
  }
  if (abs >= a7.from && abs < a7.to)
    return {
      ctx: { set: 'saturate(0.7) brightness(0.95)', side: 'saturate(0.75)' },
      overlay: 'linear-gradient(rgba(150,160,175,0.18), rgba(120,130,150,0.2))',
      filter: undefined,
    };
  if (abs >= a8.from && abs < a8.to)
    return {
      ctx: {},
      overlay: 'radial-gradient(ellipse at 70% 20%, rgba(255,190,100,0.22), rgba(255,150,60,0.08))',
      filter: 'saturate(1.05)',
    };
  if (abs >= a9.from)
    return { ctx: {}, overlay: undefined, filter: 'saturate(1.12) brightness(1.03)' };
  return { ctx: {}, overlay: undefined, filter: 'brightness(1.03)' };
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
export const ShotView3: React.FC<{ id: string }> = ({ id }) => {
  const C = DEFS3[id]?.C;
  return C ? <C /> : <Missing id={id} />;
};

export const Tiktok2Ep3: React.FC = () => {
  const abs = useCurrentFrame();
  const g = grade(abs);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <GradeCtx.Provider value={g.ctx}>
        <AbsoluteFill style={{ filter: g.filter }}>
          {SHOTS.map((s) => (
            <Sequence
              key={s.id}
              name={`${s.id} · ${s.moc}`}
              from={s.from}
              durationInFrames={s.to - s.from}
            >
              <ShotView3 id={s.id} />
            </Sequence>
          ))}
          {g.overlay && (
            <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'soft-light' }} />
          )}
        </AbsoluteFill>
      </GradeCtx.Provider>
      <Captions speaking={speakingAt} yAt={() => 886} size={50} />
      <AudioLayer3 defs={DEFS3} />
    </AbsoluteFill>
  );
};

/** EP3 review storyboard: each frame = one page of 3×4 shot images. */
export const BOARD3_PER = 12;
export const T2E3Board: React.FC<{ pick?: number }> = ({ pick = 0.55 }) => {
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD3_PER, page * BOARD3_PER + BOARD3_PER);
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
        const g = grade(s.from + local);
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
                filter: g.filter,
              }}
            >
              <GradeCtx.Provider value={g.ctx}>
                <Sequence from={page - local} layout="none">
                  <ShotView3 id={s.id} />
                </Sequence>
              </GradeCtx.Provider>
              {g.overlay && (
                <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'soft-light' }} />
              )}
            </div>
            <div
              style={{
                position: 'absolute',
                left: 6,
                bottom: 4,
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
