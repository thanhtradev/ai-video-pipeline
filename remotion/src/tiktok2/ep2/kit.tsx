import React, { createContext, useContext } from 'react';
import { interpolate, random } from 'remotion';
import { Character, CharacterProps } from '../ep1/Character';
import { SetLayers } from '../ep1/sets';
import { SetStage } from '../ep1/SetStage';
import { Cam } from '../ep1/Stage';
import { C, clamp, FONT } from '../ep1/theme';
import { ShotH } from './time';

/**
 * EP2 "Nhân bản chính mình" kit – reuses EP1's Character/SetStage/Stage/props to keep the channel style.
 * You + clones: ORANGE hoodie, messy hair. Act 6 desaturates everything EXCEPT the orange hoodie (GradeCtx).
 */
export const GradeCtx = createContext<{ set?: string; side?: string }>({});
/** Set + side characters take the act colour filter; the orange hoodie is not filtered. */
export const Stage2: React.FC<React.ComponentProps<typeof SetStage>> = (p) => {
  const g = useContext(GradeCtx);
  return <SetStage {...p} setFilter={g.set} />;
};
export const Side: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const g = useContext(GradeCtx);
  return <g style={g.side ? { filter: g.side } : undefined}>{children}</g>;
};

type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
/** The original you. */
export const Ban: React.FC<A> = (p) => <Character seed={1} hoodieColor={C.orange} hair {...p} />;
/** Clone number k – identical to the original (only blink/breath timing differs). */
export const Clone: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Character seed={100 + k} hoodieColor={C.orange} hair {...p} />
);
export const Me: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={2}
      hoodieColor={C.mom}
      size={1.08}
      {...p}
      accessories={['bun', ...(p.accessories ?? [])]}
    />
  </Side>
);
export const Ba: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={8}
      hoodieColor="#8e9096"
      size={1.18}
      {...p}
      accessories={['shirt', ...(p.accessories ?? [])]}
      shirtColor="#a9c4dc"
    />
  </Side>
);
export const Co: React.FC<A> = (p) => (
  <Side>
    <Character
      seed={5}
      hoodieColor={C.aodai}
      size={1.05}
      {...p}
      accessories={['aodai', 'glassesRound', 'bun', ...(p.accessories ?? [])]}
    />
  </Side>
);
export const Extra: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Side>
    <Character
      seed={30 + k}
      hoodieColor={
        ['#7d7486', '#7a8270', '#8a7f70', '#6f7884', '#8a7684', '#6a6f62', '#857a6a', '#7a6a62'][
          k % 8
        ]
      }
      size={0.85 + ((k * 37) % 30) / 100}
      accessories={k % 3 === 0 ? ['hoodUp'] : []}
      {...p}
    />
  </Side>
);
/** Elderly relatives (muted colours, bun/glasses). */
export const Relative: React.FC<A & { k: number }> = ({ k, ...p }) => (
  <Side>
    <Character
      seed={60 + k}
      hoodieColor={['#8a6f62', '#6f7a6a', '#7a7090', '#8d8676', '#6a7280', '#90806a'][k % 6]}
      size={1.02}
      accessories={k % 2 ? ['bun', 'glassesRound'] : ['glassesSquare']}
      {...p}
    />
  </Side>
);

export const headY = (feetY: number, size = 1) => feetY - 468 * size;
export const faceCam = (x: number, feetY: number, size = 1, z = 2.6, dy = 30): Cam => ({
  x,
  y: headY(feetY, size) + dy,
  z,
});
export const bodyCam = (x: number, feetY: number, size = 1, z = 1.5): Cam => ({
  x,
  y: feetY - 360 * size,
  z,
});

// ───────── EP2-specific effects ─────────
/** Light ring spreading on the floor when a clone "pops" out (local frames from the pop). */
export const PopRing: React.FC<{ x: number; y: number; u: number; size?: number }> = ({
  x,
  y,
  u,
  size = 1,
}) => {
  if (u < 0 || u > 22) return null;
  const k = interpolate(u, [0, 22], [0, 1], clamp);
  return (
    <g opacity={1 - k}>
      <ellipse
        cx={x}
        cy={y}
        rx={60 + 220 * k * size}
        ry={(14 + 44 * k) * size}
        fill="none"
        stroke="#fff3d0"
        strokeWidth={8 * (1 - k) + 2}
      />
      <ellipse
        cx={x}
        cy={y}
        rx={40 + 120 * k * size}
        ry={(10 + 24 * k) * size}
        fill="#fff3d0"
        opacity={0.25}
      />
    </g>
  );
};
/** Clone pop factor (squash and stretch): hidden before `at`, 4-frame pop. */
export const popIn = (f: number, at: number) => ({
  opacity: f < at ? 0 : 1,
  squash: interpolate(f - at, [0, 2, 4, 7, 10], [-0.55, 0.45, -0.12, 0.04, 0], clamp),
  sparkle: interpolate(f - at, [0, 3, 12], [0, 0.8, 0], clamp),
});

/** Snapping hand (extreme close-up): round mitten + thumb, white flash on the "snap". */
export const SnapHand: React.FC<{
  x: number;
  y: number;
  f: number;
  at: number;
  s?: number;
  sleeve?: string;
}> = ({ x, y, f, at, s = 1, sleeve = C.orange }) => {
  const u = f - at;
  const closed = u < 0;
  const flash = interpolate(u, [0, 2, 10], [0, 1, 0], clamp);
  return (
    <g transform={`translate(${x},${y}) scale(${s}) rotate(${u >= 0 && u < 4 ? -8 : 0})`}>
      <path
        d="M-420 380 Q-200 260 -40 60"
        stroke={sleeve}
        strokeWidth={170}
        fill="none"
        strokeLinecap="round"
      />
      <circle r={110} fill={C.ink} stroke={C.rim} strokeWidth={5} />
      <ellipse
        cx={closed ? 70 : 96}
        cy={closed ? -80 : -40}
        rx={44}
        ry={70}
        fill={C.ink}
        stroke={C.rim}
        strokeWidth={4}
        transform={`rotate(${closed ? 30 : 70})`}
      />
      <circle cx={-30} cy={-40} r={28} fill="#3a3440" opacity={0.5} />
      {flash > 0 && (
        <g transform="translate(90,-130)" opacity={flash}>
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={Math.cos((i / 8) * Math.PI * 2) * 120 * (0.5 + flash)}
              y2={Math.sin((i / 8) * Math.PI * 2) * 120 * (0.5 + flash)}
              stroke="#fff"
              strokeWidth={10}
              strokeLinecap="round"
            />
          ))}
          <circle r={36} fill="#fff" />
        </g>
      )}
    </g>
  );
};

/** Clone counter top left: "x1, x2…" bounces on every change. */
export const ClonerCounter: React.FC<{
  n: number;
  f: number;
  changedAt: number;
  show?: number;
}> = ({ n, f, changedAt, show = 1 }) => {
  if (show <= 0 || n <= 0) return null;
  const s = interpolate(f - changedAt, [0, 4, 9], [1.45, 0.92, 1], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        top: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: show,
        transform: `scale(${s})`,
        transformOrigin: '30% 50%',
      }}
    >
      <svg width={80} height={80} viewBox="-40 -40 80 80">
        <circle r={34} fill="#15121a" stroke={C.rim} strokeWidth={3} />
        <circle cx={-9} cy={-4} r={6} fill="#fbf8f1" />
        <circle cx={9} cy={-4} r={6} fill="#fbf8f1" />
        <path d="M-30 20 Q0 48 30 20" fill={C.orange} />
      </svg>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 72,
          color: '#fff',
          WebkitTextStroke: '10px #15121a',
          paintOrder: 'stroke fill',
          textShadow: '0 6px 0 rgba(0,0,0,0.35)',
        }}
      >
        x{n}
      </div>
    </div>
  );
};

/** Midnight dissolve: warm light particles rise like lamp dust (k 0→1 over ~2 s). from = "hands" only from the hands. */
export const Dust: React.FC<{
  x: number;
  y: number;
  size?: number;
  k: number;
  f: number;
  seed?: number;
  hands?: boolean;
  n?: number;
}> = ({ x, y, size = 1, k, f, seed = 1, hands = false, n = 60 }) => {
  if (k <= 0) return null;
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      {Array.from({ length: n }, (_, i) => {
        const r1 = random(`d${seed}${i}`);
        const r2 = random(`e${seed}${i}`);
        const start = (hands ? 0 : r2 * 0.6) as number;
        const u = Math.max(0, (k - start) / (1 - start + 0.001));
        if (u <= 0) return null;
        const bx = hands ? (r1 > 0.5 ? 1 : -1) * 90 + (r2 - 0.5) * 50 : (r1 - 0.5) * 230;
        const by = hands ? -180 + (r2 - 0.5) * 60 : -40 - r2 * 560;
        const px = x + (bx + Math.sin(f / 12 + i) * 30 * u) * size;
        const py = y + (by - u * (260 + r1 * 420)) * size;
        const rr = (4 + r1 * 7) * size * (1 - u * 0.5);
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={rr}
            fill={i % 3 ? '#ffd894' : '#fff3d0'}
            opacity={(1 - u) * 0.95}
            style={{ filter: 'blur(1px)' }}
          />
        );
      })}
      <ellipse
        cx={x}
        cy={y - 300 * size}
        rx={200 * size}
        ry={320 * size}
        fill="#ffc870"
        opacity={0.18 * Math.sin(Math.min(1, k) * Math.PI)}
        style={{ filter: 'blur(30px)' }}
      />
    </g>
  );
};

/** Flashback frame: warm yellow tone, vignette blur. */
export const FlashTone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        filter: 'sepia(0.45) saturate(1.2) brightness(1.06)',
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(255,210,140,0) 45%, rgba(255,200,120,0.75) 100%)',
        backdropFilter: 'blur(0px)',
      }}
    />
  </div>
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
/** snap + pop (pitch rises with the clone number). */
export const snapPop = (at: number, k = 1, vol = 0.8): Cue[] => [
  hit('snap', at - 3, vol),
  hit(`pop_${Math.min(6, Math.max(1, k))}`, at, vol),
];

export type Amb =
  | 'bedroom'
  | 'rules'
  | 'class'
  | 'yard'
  | 'tet'
  | 'dinner'
  | 'lot'
  | 'balcony'
  | 'kitchen'
  | 'quiet'
  | 'none';
export type ShotDef = {
  readonly C: React.FC;
  readonly fx?: (h: ShotH) => Cue[];
  readonly amb: Amb;
};
export type { SetLayers };
export { clamp };
