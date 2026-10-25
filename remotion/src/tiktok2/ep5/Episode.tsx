import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { clamp, FONT } from '../ep1/theme';
import { Captions } from '../ep1/ui';
import { AudioLayer5 } from './audio';
import { ALL_CLAPS, clockSec, DAY_ONLY, daysAt, FREEZES, freezeAt, freezeK } from './freeze';
import { ClockHUD, FrozenDust, GradeCtx, Ripple, ShotDef } from './kit';
import { ACT123 } from './shots/act123';
import { ACT45 } from './shots/act45';
import { ACT67 } from './shots/act67';
import { ACT89 } from './shots/act89';
import { shot, SHOTS, speakingAt, TIMING } from './time';

/**
 * TikTok 2 · EP5 "Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày?" – ONE composition (Tiktok2Ep5), 16:9 1920×1080, 30 fps.
 * Every shot is a <Sequence> at an ABSOLUTE frame taken from data/timing.json (generated from the voice); time stops come from freeze.ts.
 */
export const DEFS5: Record<string, ShotDef> = { ...ACT123, ...ACT45, ...ACT67, ...ACT89 };

const ACT = (n: number) => TIMING.acts.find((a) => a.act === n)!;
/** Grade by act: 1–5 bright · 6 desaturates gradually to ~60% (except the orange hoodie) · 7 warm dinner light turning harsh · 8 frozen blue-grey city night · 9 early-morning hospital sun, full saturation. */
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
  if (abs >= a7.from && abs < a7.to) {
    const k = interpolate(abs, [a7.from, a7.to], [0, 1], clamp);
    return {
      ctx: {},
      overlay: `radial-gradient(ellipse at 50% 30%, rgba(255,190,100,${0.2 - 0.1 * k}), rgba(40,20,10,${0.1 + 0.25 * k}))`,
      filter: `contrast(${1 + 0.15 * k})`,
    };
  }
  if (abs >= a8.from && abs < a8.to)
    return {
      ctx: {},
      overlay: 'linear-gradient(rgba(20,30,60,0.12), rgba(10,15,40,0.2))',
      filter: undefined,
    };
  if (abs >= ACT(9).from)
    return { ctx: {}, overlay: undefined, filter: 'saturate(1.12) brightness(1.04)' };
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
export const ShotView5: React.FC<{ id: string }> = ({ id }) => {
  const C = DEFS5[id]?.C;
  return C ? <C /> : <Missing id={id} />;
};

/** 30-second clock + "+N NGÀY" counter + ripple + floating dust (from freeze.ts). */
const FreezeLayer: React.FC = () => {
  const abs = useCurrentFrame();
  const z = freezeAt(abs);
  const k = freezeK(abs);
  const lastClap = [...ALL_CLAPS].reverse().find((c) => abs >= c && abs < c + 16);
  const thaw = FREEZES.find((x) => x !== FREEZES[0] && abs >= x.to - 2 && abs < x.to + 14);
  let hud: React.ReactNode = null;
  if (z && z.hud) {
    const { d, pop } = daysAt(z.days, abs);
    const big = z.big ? interpolate(abs, z.big, [0, 1], clamp) : 0;
    hud = (
      <ClockHUD
        f={abs}
        sec={clockSec(z, abs)}
        show={interpolate(abs, [z.from + 4, z.from + 10], [0, 1], clamp)}
        days={d}
        dayPop={pop}
        big={big}
      />
    );
  } else {
    const o = DAY_ONLY.find((x) => abs >= x.from && abs < x.to);
    if (o) {
      const { d, pop } = daysAt(o.days, abs);
      hud = <ClockHUD f={abs} days={d} dayPop={pop} />;
    }
  }
  return (
    <>
      <FrozenDust k={k} f={abs} />
      {lastClap !== undefined && <Ripple f={abs} at={lastClap} />}
      {thaw && <Ripple f={abs} at={thaw.to - 2} reverse />}
      {hud}
    </>
  );
};

export const Tiktok2Ep5: React.FC = () => {
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
              <ShotView5 id={s.id} />
            </Sequence>
          ))}
          {g.overlay && (
            <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'soft-light' }} />
          )}
        </AbsoluteFill>
      </GradeCtx.Provider>
      <FreezeLayer />
      <Captions speaking={speakingAt} yAt={() => 886} size={50} />
      <AudioLayer5 defs={DEFS5} />
    </AbsoluteFill>
  );
};

/** EP5 review storyboard: each frame = one page of 3×4 shot images. */
export const BOARD5_PER = 12;
export const T2E5Board: React.FC<{ pick?: number }> = ({ pick = 0.55 }) => {
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD5_PER, page * BOARD5_PER + BOARD5_PER);
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
                  <ShotView5 id={s.id} />
                </Sequence>
              </GradeCtx.Provider>
              {g.overlay && (
                <AbsoluteFill style={{ background: g.overlay, mixBlendMode: 'soft-light' }} />
              )}
              <Sequence from={page - s.from - local} layout="none">
                <FreezeLayer />
              </Sequence>
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
