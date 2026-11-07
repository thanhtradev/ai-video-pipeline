import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { Bloom, DustMotes, FilmFinish, FinishLook, Haze } from './atmosphere';
import { flicker } from './set-motion';

/**
 * Full-frame object close-ups, drawn with far more detail than the sets. They hold a beat of the
 * story for a moment. No digits or text. Coordinates are 1920×1080 screen pixels.
 */

const W = 1920;
const H = 1080;
const FPS = 30;

const InsertFrame: React.FC<{
  readonly background: string;
  readonly look: FinishLook;
  readonly f: number;
  readonly children: React.ReactNode;
}> = ({ background, look, f, children }) => (
  <AbsoluteFill style={{ background, overflow: 'hidden' }}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
      {children}
    </svg>
    <FilmFinish f={f} look={look} />
  </AbsoluteFill>
);

const WARM_LOOK: FinishLook = {
  top: 'rgba(255,186,104,0.42)',
  bottom: 'rgba(46,34,70,0.34)',
  edge: 0.74,
  grain: 0.035,
};

const CLOCK_X = 960;
const CLOCK_Y = 540;
const CLOCK_R = 410;
const TICKS = 60;

const hand = (deg: number, length: number, tail: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return {
    x1: CLOCK_X - Math.cos(a) * tail,
    y1: CLOCK_Y - Math.sin(a) * tail,
    x2: CLOCK_X + Math.cos(a) * length,
    y2: CLOCK_Y + Math.sin(a) * length,
  };
};

/** The wall clock, very close. The second hand ticks once a second with a small recoil. */
export const ClockInsert: React.FC<{ readonly f: number; readonly at?: number }> = ({
  f,
  at = 40,
}) => {
  const seconds = at + Math.floor(f / FPS);
  const sub = (f % FPS) / FPS;
  const recoil = sub < 0.12 ? Math.sin((sub / 0.12) * Math.PI) * 1.8 : 0;
  const secondDeg = seconds * 6 + recoil;
  const minuteDeg = 104 + seconds * 0.1;
  const hourDeg = 214 + seconds * 0.008;
  return (
    <InsertFrame background="#3b2d28" look={WARM_LOOK} f={f}>
      <defs>
        <radialGradient id="insClockFace" cx="38%" cy="30%" r="82%">
          <stop offset="0" stopColor="#fbf2dc" />
          <stop offset="0.72" stopColor="#e6d5b2" />
          <stop offset="1" stopColor="#b79f78" />
        </radialGradient>
        <linearGradient id="insClockRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a87e58" />
          <stop offset="0.5" stopColor="#6a4730" />
          <stop offset="1" stopColor="#35231a" />
        </linearGradient>
        <linearGradient id="insClockGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity={0.03} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
      </defs>
      {Array.from({ length: 16 }, (_, i) => (
        <ellipse
          key={i}
          cx={random(`insW${i}x`) * W}
          cy={random(`insW${i}y`) * H}
          rx={90 + random(`insW${i}r`) * 240}
          ry={60 + random(`insW${i}s`) * 160}
          fill="#1e1411"
          opacity={0.1}
          style={{ filter: 'blur(26px)' }}
        />
      ))}
      <ellipse
        cx={CLOCK_X + 44}
        cy={CLOCK_Y + 56}
        rx={CLOCK_R + 34}
        ry={CLOCK_R + 34}
        fill="#120b09"
        opacity={0.55}
        style={{ filter: 'blur(32px)' }}
      />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={CLOCK_R + 34} fill="url(#insClockRim)" />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={CLOCK_R + 6} fill="#2c1d15" />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={CLOCK_R} fill="url(#insClockFace)" />
      {Array.from({ length: TICKS }, (_, i) => {
        const major = i % 5 === 0;
        const a = (i * 6 * Math.PI) / 180;
        const outer = CLOCK_R - 22;
        const inner = outer - (major ? 62 : 22);
        return (
          <line
            key={i}
            x1={CLOCK_X + Math.cos(a) * inner}
            y1={CLOCK_Y + Math.sin(a) * inner}
            x2={CLOCK_X + Math.cos(a) * outer}
            y2={CLOCK_Y + Math.sin(a) * outer}
            stroke="#2f231a"
            strokeWidth={major ? 13 : 4}
            strokeLinecap="round"
          />
        );
      })}
      <g transform="translate(16 20)" opacity={0.26} style={{ filter: 'blur(9px)' }}>
        <line {...hand(hourDeg, 180, 34)} stroke="#000" strokeWidth={26} strokeLinecap="round" />
        <line {...hand(minuteDeg, 300, 40)} stroke="#000" strokeWidth={16} strokeLinecap="round" />
      </g>
      <line {...hand(hourDeg, 180, 34)} stroke="#241912" strokeWidth={24} strokeLinecap="round" />
      <line {...hand(minuteDeg, 300, 40)} stroke="#241912" strokeWidth={15} strokeLinecap="round" />
      <line {...hand(secondDeg, 340, 74)} stroke="#b83f2f" strokeWidth={6} strokeLinecap="round" />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={24} fill="#241912" />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={10} fill="#b83f2f" />
      <circle cx={CLOCK_X} cy={CLOCK_Y} r={CLOCK_R} fill="url(#insClockGlass)" />
      <Bloom id="insClockBloom" x={380} y={190} rx={760} ry={560} color="#ffd28e" a={0.28} f={f} />
    </InsertFrame>
  );
};

const STEAM_POINTS = 18;
const STEAM_RISE = 520;
const STEAM_STRANDS = [
  { dx: -46, phase: 0, w: 34, a: 0.26 },
  { dx: 6, phase: 1.5, w: 48, a: 0.2 },
  { dx: 54, phase: 3, w: 30, a: 0.24 },
];

/** Steam from a cup, as blurred polylines. */
const Steam: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly f: number;
}> = ({ x, y, f }) => (
  <g fill="none" stroke="#fff2dc" strokeLinecap="round" style={{ filter: 'blur(16px)' }}>
    {STEAM_STRANDS.map((strand) => (
      <polyline
        key={strand.phase}
        strokeWidth={strand.w}
        opacity={strand.a}
        points={Array.from({ length: STEAM_POINTS }, (_, i) => {
          const k = i / (STEAM_POINTS - 1);
          const sway = Math.sin(k * 6 - f / 16 + strand.phase) * (10 + k * 66);
          return `${x + strand.dx * (1 + k * 0.7) + sway},${y - k * STEAM_RISE}`;
        }).join(' ')}
      />
    ))}
  </g>
);

/** A steaming tea cup on a wooden table in window light. */
export const TeaCupInsert: React.FC<{ readonly f: number }> = ({ f }) => (
  <InsertFrame background="#4c3a2c" look={WARM_LOOK} f={f}>
    <defs>
      <linearGradient id="insTable" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6f4f38" />
        <stop offset="1" stopColor="#3b271b" />
      </linearGradient>
      <linearGradient id="insCup" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff8e8" />
        <stop offset="0.55" stopColor="#e3d6bf" />
        <stop offset="1" stopColor="#8f7d68" />
      </linearGradient>
      <radialGradient id="insTea" cx="42%" cy="42%" r="66%">
        <stop offset="0" stopColor="#c58432" />
        <stop offset="1" stopColor="#6e3f14" />
      </radialGradient>
    </defs>
    <g style={{ filter: 'blur(58px)' }}>
      <rect x={200} y={0} width={420} height={520} fill="#ffe7b0" opacity={0.75} />
      <rect x={1260} y={110} width={320} height={420} fill="#2f241d" opacity={0.6} />
    </g>
    <rect x={0} y={640} width={W} height={H - 640} fill="url(#insTable)" />
    {Array.from({ length: 12 }, (_, i) => (
      <path
        key={i}
        d={`M0 ${668 + i * 36} C520 ${650 + i * 38} 1300 ${694 + i * 35} ${W} ${664 + i * 37}`}
        stroke="#2c1c12"
        strokeWidth={2 + (i % 3)}
        fill="none"
        opacity={0.34}
      />
    ))}
    <polygon points="0,700 740,650 1320,1080 0,1080" fill="#ffd28e" opacity={0.18} />
    <ellipse
      cx={1120}
      cy={930}
      rx={430}
      ry={72}
      fill="#120b07"
      opacity={0.56}
      style={{ filter: 'blur(18px)' }}
    />
    <ellipse cx={960} cy={900} rx={390} ry={78} fill="#cfc2aa" />
    <ellipse cx={960} cy={890} rx={372} ry={68} fill="#efe6d4" />
    <ellipse cx={960} cy={886} rx={235} ry={40} fill="#c4b59c" />
    <path d="M700 500 C700 760 780 880 960 880 C1140 880 1220 760 1220 500 Z" fill="url(#insCup)" />
    <path
      d="M1214 568 C1340 548 1370 700 1192 744"
      fill="none"
      stroke="#b5a48c"
      strokeWidth={36}
      strokeLinecap="round"
    />
    <path
      d="M1214 568 C1340 548 1370 700 1192 744"
      fill="none"
      stroke="#eadfc9"
      strokeWidth={16}
      strokeLinecap="round"
      transform="translate(-3 -6)"
    />
    <ellipse cx={960} cy={500} rx={260} ry={54} fill="#f7efdf" />
    <ellipse cx={960} cy={504} rx={236} ry={43} fill="url(#insTea)" />
    <ellipse cx={870} cy={492} rx={70} ry={10} fill="#ffe0a6" opacity={0.58} />
    <path
      d="M744 548 C756 680 806 790 868 836"
      stroke="#fff"
      strokeWidth={22}
      fill="none"
      opacity={0.45}
      strokeLinecap="round"
    />
    <Steam x={960} y={480} f={f} />
    <DustMotes
      id="insTeaDust"
      x={120}
      y={60}
      w={1300}
      h={700}
      color="#fff0cc"
      f={f}
      n={28}
      size={6}
      a={0.55}
    />
  </InsertFrame>
);

const STICK_XS = [800, 960, 1120];
const STICK_TOP = 300;

/** Glowing incense tips, ash and thick smoke in the dark. */
export const IncenseInsert: React.FC<{ readonly f: number }> = ({ f }) => (
  <InsertFrame
    background="#160d10"
    look={{ top: 'rgba(255,140,70,0.34)', bottom: 'rgba(24,14,50,0.42)', edge: 0.72, grain: 0.04 }}
    f={f}
  >
    <defs>
      <linearGradient id="insStick" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#b6543a" />
        <stop offset="0.5" stopColor="#7d2f22" />
        <stop offset="1" stopColor="#40150f" />
      </linearGradient>
      <radialGradient id="insEmber">
        <stop offset="0" stopColor="#fff2b4" />
        <stop offset="0.35" stopColor="#ff8a33" />
        <stop offset="1" stopColor="#c02f12" stopOpacity={0} />
      </radialGradient>
      <linearGradient id="insBowl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d6ae58" />
        <stop offset="0.5" stopColor="#9b7433" />
        <stop offset="1" stopColor="#4d3616" />
      </linearGradient>
    </defs>
    <g style={{ filter: 'blur(38px)' }}>
      <circle cx={330} cy={420} r={95} fill="#ff9c4d" opacity={0.42 * flicker(f, 1)} />
      <circle cx={1620} cy={500} r={120} fill="#ffae62" opacity={0.36 * flicker(f, 2)} />
      <rect x={420} y={0} width={110} height={1080} fill="#7a3129" opacity={0.3} />
      <rect x={1420} y={0} width={110} height={1080} fill="#7a3129" opacity={0.3} />
    </g>
    <Haze id="insIncHaze" x={400} y={30} w={1120} h={380} color="#ffbe86" a={0.11} f={f} n={8} />
    {STICK_XS.map((x, i) => (
      <g key={x}>
        <rect
          x={x - 9}
          y={STICK_TOP + 30 + i * 22}
          width={18}
          height={1000}
          fill="url(#insStick)"
        />
        <rect x={x - 9} y={STICK_TOP + i * 22} width={18} height={36} fill="#8b8077" />
        <circle cx={x} cy={STICK_TOP + i * 22} r={44 * flicker(f, i + 3)} fill="url(#insEmber)" />
        <circle cx={x} cy={STICK_TOP + i * 22} r={8} fill="#fff6c8" />
      </g>
    ))}
    <g fill="none" stroke="#f2d9c4" strokeLinecap="round">
      {STICK_XS.map((x, i) => (
        <polyline
          key={x}
          strokeWidth={5}
          opacity={0.62}
          points={Array.from({ length: 22 }, (_, p) => {
            const k = p / 21;
            const sway = Math.sin(k * 8 - f / 14 + i * 1.7) * (3 + k * 62);
            return `${x + sway},${STICK_TOP + i * 22 - 8 - k * 380}`;
          }).join(' ')}
          style={{ filter: 'blur(2.5px)' }}
        />
      ))}
    </g>
    <g fill="none" stroke="#e6c8b2" strokeLinecap="round" style={{ filter: 'blur(16px)' }}>
      {STICK_XS.map((x, i) => (
        <polyline
          key={x}
          strokeWidth={30}
          opacity={0.13}
          points={Array.from({ length: 14 }, (_, p) => {
            const k = p / 13;
            const sway = Math.sin(k * 6 - f / 18 + i) * (14 + k * 110);
            return `${x + sway},${STICK_TOP + i * 22 - k * 380}`;
          }).join(' ')}
        />
      ))}
    </g>
    <ellipse cx={960} cy={1055} rx={620} ry={124} fill="url(#insBowl)" />
    <ellipse cx={960} cy={1000} rx={500} ry={62} fill="#b7aca0" />
    {Array.from({ length: 70 }, (_, i) => (
      <circle
        key={i}
        cx={520 + random(`insAsh${i}x`) * 880}
        cy={964 + random(`insAsh${i}y`) * 72}
        r={2 + random(`insAsh${i}r`) * 5}
        fill={i % 3 ? '#8d8279' : '#d1c8bc'}
      />
    ))}
    <DustMotes
      id="insIncDust"
      x={200}
      y={80}
      w={1500}
      h={800}
      color="#ffd09c"
      f={f}
      n={22}
      size={6}
      a={0.5}
    />
  </InsertFrame>
);
