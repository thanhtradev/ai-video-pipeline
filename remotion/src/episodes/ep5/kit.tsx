import React, { useContext } from 'react';
import { interpolate, random } from 'remotion';
import { Character, CharacterProps } from '../../rig/Character';
import { SetStage } from '../../kits/whatif/SetStage';
import { C, clamp, FONT } from '../../kits/whatif/theme';
import { GradeCtx, Side } from '../../kits/whatif/grade';
import { ShotH } from './time';

/**
 * EP5 "Dừng thời gian 30 giây – mỗi lần già thêm 1 ngày" kit. Reuses the rig, the whatif kit
 * and the chip cast to keep the style consistent. Standalone episode: its own characters (grandpa, Vy, Đạt, doctor).
 */
export { GradeCtx, bodyCam, faceCam, headY } from '../../kits/whatif/grade';
export { Ba, Co, Extra, Me } from '../../characters/chip/cast';

const FREEZE_FILTER = (k: number) =>
  `saturate(${1 - 0.85 * k}) sepia(${0.25 * k}) hue-rotate(${175 * k}deg) brightness(${1 - 0.12 * k})`;
/** EP5 stage: applies the freeze filter to the set + side characters. */
export const Stage5: React.FC<React.ComponentProps<typeof SetStage> & { frozen?: number }> = ({
  frozen = 0,
  ...p
}) => {
  const g = useContext(GradeCtx);
  const set = [g.set, frozen > 0 ? FREEZE_FILTER(frozen) : ''].join(' ').trim() || undefined;
  const side = [g.side, frozen > 0 ? FREEZE_FILTER(frozen) : ''].join(' ').trim() || undefined;
  return (
    <GradeCtx.Provider value={{ set, side }}>
      <SetStage {...p} setFilter={set} />
    </GradeCtx.Provider>
  );
};
/** Time of side people/objects: frozen when frozen ≥ 0.5 (holds the stopped frame). */
export const worldT = (f: number, freezeAt: number, unfreezeAt = Infinity) =>
  f < freezeAt ? f : f < unfreezeAt ? freezeAt : f - (unfreezeAt - freezeAt);
/** Freeze level 0…1 (~10-frame transition on the clap, ~6-frame snap back on release). */
export const frozenK = (f: number, freezeAt: number, unfreezeAt = Infinity) =>
  interpolate(f, [freezeAt, freezeAt + 10], [0, 1], clamp) *
  (Number.isFinite(unfreezeAt) ? interpolate(f, [unfreezeAt, unfreezeAt + 6], [1, 0], clamp) : 1);

type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
/** You – ORANGE hoodie. age 0…1: slightly taller, shorter sleeves, a few spiky hairs (light aging, increasing across the acts). */
export const Ban: React.FC<A & { age?: number }> = ({ age = 0, size = 1, ...p }) => (
  <Character
    seed={1}
    hoodieColor={C.orange}
    size={size * (1 + 0.06 * age)}
    sleeve={0.84 - 0.16 * age}
    hair={age >= 0.4}
    {...p}
  />
);
/** Grandpa, 81: faded brown check shirt over a grey hoodie, reading glasses, slightly stooped, walking stick. */
export const Ong: React.FC<A & { cane?: boolean }> = ({ cane = true, ...p }) => (
  <Side>
    <Character
      seed={21}
      hoodieColor="#8e9096"
      size={1.0}
      shirtColor="#9a7d62"
      lean={6}
      itemL={cane ? 'cane' : undefined}
      {...p}
      accessories={['shirt', 'glassesSquare', ...(p.accessories ?? [])]}
    />
  </Side>
);
/** Vy: muted mint hoodie, shoulder-length hair. */
export const Vy: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={22}
      hoodieColor="#8fb3a6"
      size={0.96}
      {...p}
      accessories={['bob', ...(p.accessories ?? [])]}
    />
  </Side>
);
/** Đạt: moss-green hoodie, spiky hair. */
export const Dat: React.FC<A> = (p) => (
  <Side>
    <Character seed={23} hoodieColor="#7b8a58" size={0.98} hair {...p} />
  </Side>
);
/** ER doctor: white coat over a medical-blue hoodie, stethoscope. */
export const BacSi: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={24}
      hoodieColor="#5f9a9a"
      size={1.04}
      shirtColor="#f2f0ea"
      {...p}
      accessories={['shirt', 'stetho', 'bun', ...(p.accessories ?? [])]}
    />
  </Side>
);

// ───────── Effects ─────────
/** Extreme close-up of two hands clapping; at = contact frame. */
export const ClapECU: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  const u = f - at;
  const gap =
    u < 0 ? interpolate(u, [-12, 0], [260, 0], clamp) : interpolate(u, [0, 4], [0, 16], clamp);
  const flash = interpolate(u, [0, 2, 10], [0, 1, 0], clamp);
  const hand = (s: number) => (
    <g transform={`translate(${960 + s * (100 + gap / 2)},560) scale(${s},1)`}>
      <path
        d="M-900 500 Q-500 380 -160 40"
        stroke={C.orange}
        strokeWidth={220}
        fill="none"
        strokeLinecap="round"
        transform="scale(-1,1)"
      />
      <ellipse cx={0} cy={0} rx={110} ry={180} fill={C.ink} stroke={C.rim} strokeWidth={6} />
      <ellipse cx={-30} cy={-60} rx={34} ry={60} fill="#3a3440" opacity={0.5} />
    </g>
  );
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      {hand(-1)}
      {hand(1)}
      {flash > 0 && (
        <g transform="translate(960,520)" opacity={flash}>
          {Array.from({ length: 10 }, (_, i) => (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={Math.cos((i / 10) * Math.PI * 2) * 300 * (0.4 + flash)}
              y2={Math.sin((i / 10) * Math.PI * 2) * 300 * (0.4 + flash)}
              stroke="#fff"
              strokeWidth={12}
              strokeLinecap="round"
            />
          ))}
        </g>
      )}
    </svg>
  );
};
/** Round ripple spreading out (clap, ~10 frames) or shrinking back (release, reverse). */
export const Ripple: React.FC<{
  f: number;
  at: number;
  reverse?: boolean;
  x?: number;
  y?: number;
}> = ({ f, at, reverse, x = 960, y = 520 }) => {
  const u = f - at;
  if (u < 0 || u > 14) return null;
  const k = reverse ? 1 - u / 14 : u / 14;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', pointerEvents: 'none' }}>
      {[0, 0.12, 0.24].map((d, i) => {
        const kk = Math.max(0, k - d);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={60 + 1400 * kk}
            fill="none"
            stroke="#dfeaff"
            strokeWidth={14 * (1 - kk) + 2}
            opacity={0.7 * (1 - kk)}
          />
        );
      })}
    </svg>
  );
};
/** Small dust specks hanging all over the frame (while frozen). */
export const FrozenDust: React.FC<{ k: number; f: number; seed?: number }> = ({
  k,
  f,
  seed = 1,
}) =>
  k > 0 ? (
    <svg width={1920} height={1080} style={{ position: 'absolute', pointerEvents: 'none' }}>
      {Array.from({ length: 70 }, (_, i) => (
        <circle
          key={i}
          cx={random(`fd${seed}${i}`) * 1920 + Math.sin(f / 90 + i) * 4}
          cy={random(`fe${seed}${i}`) * 1080}
          r={1.5 + random(`ff${seed}${i}`) * 3}
          fill="#f0f4ff"
          opacity={k * (0.3 + random(`fg${seed}${i}`) * 0.4)}
        />
      ))}
    </svg>
  ) : null;

/** 30-second countdown ring (top left) + "+N NGÀY" counter right below (bounces on increase). big: the counter grows (climax). */
export const ClockHUD: React.FC<{
  f: number;
  sec?: number;
  show?: number;
  days: number;
  dayPop?: number;
  big?: number;
}> = ({ f, sec, show = 1, days, dayPop = -99, big = 0 }) => {
  if (show <= 0) return null;
  const red = sec !== undefined && sec <= 5;
  const k = sec !== undefined ? Math.max(0, Math.min(1, sec / 30)) : 0;
  const R = 62;
  const circ = 2 * Math.PI * R;
  const pop = interpolate(f - dayPop, [0, 4, 10], [1.5, 0.9, 1], clamp);
  const ds = 1 + big * 0.8;
  return (
    <div style={{ position: 'absolute', left: 56, top: 44, opacity: show }}>
      {sec !== undefined && (
        <svg width={160} height={160} viewBox="-80 -80 160 160">
          <circle r={74} fill="#15121a" opacity={0.6} />
          <circle r={R} fill="none" stroke="#fff" strokeOpacity={0.15} strokeWidth={12} />
          <circle
            r={R}
            fill="none"
            stroke={red ? '#ff4a3a' : '#dfeaff'}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${circ * k} ${circ}`}
            transform="rotate(-90)"
          />
          <text
            y={18}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={54}
            fill={red ? '#ff7a6a' : '#fff'}
          >
            {Math.ceil(sec)}
          </text>
        </svg>
      )}
      {days > 0 && (
        <div
          style={{
            marginTop: 6,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 46 * ds,
            color: C.orange,
            WebkitTextStroke: `${7 * ds}px #15121a`,
            paintOrder: 'stroke fill',
            transform: `scale(${pop})`,
            transformOrigin: '0 50%',
            whiteSpace: 'nowrap',
          }}
        >
          +{days} NGÀY
        </div>
      )}
    </div>
  );
};

/** Tear-off wall calendar; tear 0…1: the top sheet tearing off and flying away. */
export const TearCalendar: React.FC<{
  x: number;
  y: number;
  s?: number;
  day?: number;
  tear?: number;
}> = ({ x, y, s = 1, day = 18, tear = 0 }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-110} y={-170} width={220} height={70} rx={8} fill="#b2463a" />
    <rect x={-96} y={-104} width={192} height={230} rx={4} fill="#efe7d6" />
    {[0, 1, 2].map((k) => (
      <rect key={k} x={-96} y={120 + k * 4} width={192} height={4} fill="#d8cfbd" />
    ))}
    <text
      x={0}
      y={60}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={120}
      fill="#c4473a"
    >
      {day}
    </text>
    {tear > 0 && (
      <g
        transform={`translate(${tear * 260},${-tear * 120 + tear * tear * 300}) rotate(${tear * 70})`}
        opacity={1 - Math.max(0, tear - 0.7) / 0.3}
      >
        <rect x={-96} y={-104} width={192} height={230} rx={4} fill="#f6efe0" />
        <text
          x={0}
          y={60}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={120}
          fill="#c4473a"
        >
          {day - 1}
        </text>
      </g>
    )}
  </g>
);

/** Wheelchair (push handles at the back, on the left when facing=1). */
export const Wheelchair: React.FC<{
  x: number;
  y: number;
  s?: number;
  f?: number;
  rolling?: boolean;
  flip?: boolean;
}> = ({ x, y, s = 1, f = 0, rolling, flip }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -s : s},${s})`}>
    <ellipse cx={0} cy={4} rx={150} ry={20} fill="#000" opacity={0.25} />
    <circle cx={-30} cy={-110} r={110} fill="none" stroke="#3a3f48" strokeWidth={14} />
    {[0, 1, 2, 3].map((k) => (
      <line
        key={k}
        x1={-30}
        y1={-110}
        x2={-30 + Math.cos((rolling ? f / 6 : 0) + (k * Math.PI) / 2) * 100}
        y2={-110 + Math.sin((rolling ? f / 6 : 0) + (k * Math.PI) / 2) * 100}
        stroke="#6a7078"
        strokeWidth={5}
      />
    ))}
    <circle cx={110} cy={-24} r={24} fill="#2a2a30" />
    <rect x={-80} y={-200} width={190} height={22} rx={8} fill="#5a6470" />
    <path
      d="M-80 -200 L-110 -380 L-150 -390"
      stroke="#4a5462"
      strokeWidth={14}
      fill="none"
      strokeLinecap="round"
    />
    <rect x={-110} y={-370} width={30} height={170} fill="#5a6470" opacity={0.8} />
    <path d="M100 -180 L130 -40" stroke="#4a5462" strokeWidth={10} />
  </g>
);

/** Audio cue (local frame). */
export type Cue = {
  readonly src: string;
  readonly at: number;
  readonly vol?: number;
  readonly dur?: number;
  readonly loop?: boolean;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
};
export const hit = (src: string, at: number, vol = 0.7, dur?: number): Cue => ({
  src,
  at,
  vol,
  dur,
});
export const loopFor = (src: string, at: number, end: number, vol = 0.5, fade = 8): Cue => ({
  src,
  at,
  vol,
  dur: Math.max(1, Math.round(end - at)),
  loop: true,
  fadeIn: fade,
  fadeOut: fade,
});
/** Clap → freeze: dry clap + low "whoosh" + counter "tick". */
export const clapFreeze = (at: number, vol = 0.8): Cue[] => [
  hit('clap', at, vol),
  hit('freeze_whoosh', at + 1, vol * 0.8),
  hit('day_tick', at + 8, vol * 0.6),
];

export type ShotDef = {
  readonly C: React.FC;
  readonly fx?: (h: ShotH) => Cue[];
};
export { clamp };
