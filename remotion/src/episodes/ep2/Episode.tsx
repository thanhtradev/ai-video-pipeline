import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { clamp, FONT } from '../../kits/whatif/theme';
import { Captions } from '../../kits/whatif/ui';
import { AudioLayer2 } from './audio';
import { GradeCtx, ShotDef } from './kit';
import { ACT123 } from './shots/act123';
import { ACT45 } from './shots/act45';
import { ACT6 } from './shots/act6';
import { ACT78 } from './shots/act78';
import { line, shot, SHOTS, speakingAt, TIMING } from './time';

/**
 * TikTok 2 · EP2 "Nếu bạn nhân bản được chính mình?" – ONE composition (Tiktok2Ep2), 16:9 1920×1080, 30 fps.
 * Every shot is a <Sequence> at an ABSOLUTE frame taken from data/timing.json (generated from the voice).
 */
export const DEFS2: Record<string, ShotDef> = { ...ACT123, ...ACT45, ...ACT6, ...ACT78 };

const ACT = (n: number) => TIMING.acts.find((a) => a.act === n)!;
/** Grade by act: 1–5 normal bright · 6 desaturates gradually to ~60% (except the orange hoodie) · 7 blue night, warm street lights · 8 warm yellow kitchen. */
const grade = (abs: number) => {
  const a6 = ACT(6);
  const a7 = ACT(7);
  const a8 = ACT(8);
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
      ctx: {},
      overlay: 'linear-gradient(rgba(40,60,150,0.16), rgba(20,30,90,0.22))',
      filter: undefined,
    };
  if (abs >= a8.from)
    return {
      ctx: {},
      overlay: 'radial-gradient(ellipse at 50% 20%, rgba(255,190,110,0.14), rgba(255,150,60,0.05))',
      filter: 'saturate(1.08)',
    };
  return { ctx: {}, overlay: undefined, filter: 'brightness(1.02)' };
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
export const ShotView2: React.FC<{ id: string }> = ({ id }) => {
  const C = DEFS2[id]?.C;
  return C ? <C /> : <Missing id={id} />;
};

/** The line "Mẹ cứ già từ từ thôi. Con ở đây mà." keeps its caption through the hold. */
const STICKY = [line('L206'), line('L207')].map((l) => [l, line('L207').holdTo] as const);

export const Tiktok2Ep2: React.FC = () => {
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
              <ShotView2 id={s.id} />
            </Sequence>
          ))}
          {g.overlay && (
            <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'multiply' }} />
          )}
        </AbsoluteFill>
      </GradeCtx.Provider>
      <Captions speaking={speakingAt} yAt={() => 886} size={50} sticky={[STICKY[1]]} />
      <AudioLayer2 defs={DEFS2} />
    </AbsoluteFill>
  );
};

/** EP2 review storyboard: each frame = one page of 3×4 shot images. */
export const BOARD2_PER = 12;
export const T2E2Board: React.FC<{ pick?: number }> = ({ pick = 0.55 }) => {
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD2_PER, page * BOARD2_PER + BOARD2_PER);
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
                  <ShotView2 id={s.id} />
                </Sequence>
              </GradeCtx.Provider>
              {g.overlay && (
                <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'multiply' }} />
              )}
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
