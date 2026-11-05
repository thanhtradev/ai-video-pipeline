import React from 'react';
import { SoftShadow } from '../whatif/props';

/**
 * Night props of the "Kinh dị" kit (D-106): same drawing language as the whatif props (world
 * coordinates, rounded shapes, soft shadows) with one warm light each. Every whatif prop (altar,
 * grille window, plastic chair, lanterns…) is re-exported, so `kit/active/props` has both.
 */
export * from '../whatif/props';

type G = { readonly x?: number; readonly y?: number; readonly s?: number; readonly f?: number };
const at = (x = 0, y = 0, s = 1) => `translate(${x},${y}) scale(${s})`;
/** Slow flame flicker in 0.8…1 by frame; seeded so two flames never move together. */
const flicker = (f: number, seed = 0) =>
  0.9 + 0.1 * Math.sin(f * 0.9 + seed) * Math.sin(f * 0.37 + seed * 0.7);

const BRASS = '#b08a3e';
const BRASS_DARK = '#7a5d2a';
const FLAME = '#ffd36a';
const GLASS = '#ffe9b0';

/** Standing oil lamp (on a table or the floor), lit; `lit` 0 shows a cold lamp. */
export const OilLampProp: React.FC<G & { lit?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  lit = 1,
}) => {
  const k = flicker(f, 3) * lit;
  return (
    <g transform={at(x, y, s)}>
      <SoftShadow x={0} y={0} rx={40} />
      {lit > 0 ? <circle cx={0} cy={-70} r={120 * k} fill="#f0a856" opacity={0.16 * lit} /> : null}
      <rect x={-26} y={-30} width={52} height={30} rx={8} fill={BRASS} />
      <path d="M-20 -30 L20 -30 L14 -110 L-14 -110 Z" fill={GLASS} opacity={0.85} />
      {lit > 0 ? <ellipse cx={0} cy={-72} rx={6 * k} ry={14 * k} fill={FLAME} /> : null}
      <rect x={-16} y={-120} width={32} height={12} rx={5} fill={BRASS_DARK} />
      <path d="M-12 -120 Q0 -150 12 -120" stroke={BRASS_DARK} strokeWidth={5} fill="none" />
    </g>
  );
};

/** A single candle with a wax drip and its small halo. */
export const Candle: React.FC<G & { lit?: number; h?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  lit = 1,
  h = 70,
}) => {
  const k = flicker(f, 7) * lit;
  return (
    <g transform={at(x, y, s)}>
      {lit > 0 ? (
        <circle cx={0} cy={-h - 20} r={90 * k} fill="#f0a856" opacity={0.14 * lit} />
      ) : null}
      <rect x={-9} y={-h} width={18} height={h} rx={4} fill="#efe6d2" />
      <path d={`M6 ${-h + 10} q6 14 2 26`} stroke="#e3d8c0" strokeWidth={4} fill="none" />
      <line x1={0} y1={-h} x2={0} y2={-h - 10} stroke="#3a2a1a" strokeWidth={2} />
      {lit > 0 ? <ellipse cx={0} cy={-h - 20} rx={5 * k} ry={12 * k} fill={FLAME} /> : null}
    </g>
  );
};

/** Old banyan: wide trunk, hanging aerial roots, a dark canopy; the village shrine tree. */
export const BanyanTree: React.FC<G & { tone?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  tone = '#2b2f3a',
}) => (
  <g transform={at(x, y, s)}>
    <ellipse cx={0} cy={-620} rx={520} ry={260} fill={tone} />
    <ellipse cx={-260} cy={-520} rx={300} ry={170} fill={tone} />
    <ellipse cx={280} cy={-540} rx={320} ry={180} fill={tone} />
    <path d="M-90 0 Q-70 -300 -40 -520 L40 -520 Q70 -300 90 0 Z" fill="#3a3330" />
    <path d="M-150 0 Q-120 -120 -70 -220 L-30 -220 Q-60 -100 -60 0 Z" fill="#332c2a" />
    <path d="M150 0 Q120 -120 70 -220 L30 -220 Q60 -100 60 0 Z" fill="#332c2a" />
    {[-380, -300, -210, 180, 260, 350].map((rx, i) => (
      <path
        key={i}
        d={`M${rx} -480 Q${rx + Math.sin(f / 40 + i) * 6} -260 ${rx + 10} ${-80 + (i % 3) * 40}`}
        stroke="#3a3330"
        strokeWidth={6 + (i % 2) * 4}
        fill="none"
        strokeLinecap="round"
      />
    ))}
  </g>
);

/** Round stone well with a wooden crossbar; `bucket` hangs a bucket at that height (0…1). */
export const WellStone: React.FC<G & { bucket?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  bucket = 0,
}) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={130} />
    <ellipse cx={0} cy={-90} rx={120} ry={34} fill="#1a1c26" />
    <path d="M-120 -90 L-120 0 Q0 40 120 0 L120 -90 Q0 -50 -120 -90 Z" fill="#6f6b66" />
    <path d="M-120 -90 Q0 -130 120 -90 Q0 -50 -120 -90 Z" fill="#8a857e" />
    <rect x={-104} y={-320} width={12} height={240} fill="#5a4a3a" />
    <rect x={92} y={-320} width={12} height={240} fill="#5a4a3a" />
    <rect x={-116} y={-330} width={232} height={14} rx={6} fill="#5a4a3a" />
    <line x1={0} y1={-323} x2={0} y2={-323 + 230 * bucket} stroke="#8a7a60" strokeWidth={3} />
    <rect x={-22} y={-100 + 230 * bucket - 20} width={44} height={36} rx={6} fill="#5a4a3a" />
  </g>
);

/** Yellow paper talisman with red strokes, pinned or pasted on a door; `peel` lifts a corner. */
export const PaperTalisman: React.FC<G & { peel?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  peel = 0,
}) => (
  <g transform={at(x, y, s)}>
    <path
      d={`M-28 -80 L28 -80 L28 ${80 - 30 * peel} Q${28 - 30 * peel} ${80 - 10 * peel} ${-28 + 20 * peel} 80 L-28 80 Z`}
      fill="#e8c95a"
      stroke="#c9a63a"
      strokeWidth={2}
    />
    {[-52, -24, 4, 32].map((yy, i) => (
      <path
        key={i}
        d={`M-14 ${yy} q14 ${i % 2 ? 10 : -10} 28 0`}
        stroke="#b4302a"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
    ))}
    <circle cx={0} cy={60} r={6} fill="#b4302a" />
  </g>
);

/** Old wall mirror with a dark frame; the glass shows a dim night tint, nothing else. */
export const Mirror: React.FC<G & { w?: number; h?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  w = 180,
  h = 260,
}) => (
  <g transform={at(x, y, s)}>
    <rect x={-w / 2 - 12} y={-h - 12} width={w + 24} height={h + 24} rx={14} fill="#4a3a2e" />
    <rect x={-w / 2} y={-h} width={w} height={h} rx={8} fill="#232736" />
    <path
      d={`M${-w / 2 + 14} ${-h + 20} L${-w / 2 + 40} ${-h + 20} L${-w / 2 + 14} ${-h + 80} Z`}
      fill="#3a4056"
      opacity={0.6}
    />
  </g>
);

/** Old tabletop radio with a glowing dial. */
export const OldRadio: React.FC<G & { on?: number }> = ({ x = 0, y = 0, s = 1, f = 0, on = 1 }) => (
  <g transform={at(x, y, s)}>
    <SoftShadow x={0} y={0} rx={80} />
    <rect x={-70} y={-90} width={140} height={90} rx={14} fill="#6a4a36" />
    <rect x={-56} y={-74} width={60} height={50} rx={8} fill="#3a2a22" />
    {[0, 1, 2, 3].map((i) => (
      <line
        key={i}
        x1={-50}
        y1={-66 + i * 12}
        x2={0}
        y2={-66 + i * 12}
        stroke="#5a4538"
        strokeWidth={3}
      />
    ))}
    <rect
      x={14}
      y={-72}
      width={44}
      height={16}
      rx={4}
      fill={on ? '#e8b55a' : '#5a4a3a'}
      opacity={on ? 0.9 - 0.1 * Math.abs(Math.sin(f / 9)) : 1}
    />
    <circle cx={36} cy={-34} r={12} fill="#2a1e18" />
    <line x1={-30} y1={-90} x2={-10} y2={-130} stroke="#9a9a9a" strokeWidth={3} />
  </g>
);

/** Moon with a soft halo, drawn on the far layer. */
export const Moon: React.FC<G & { phase?: number }> = ({ x = 0, y = 0, s = 1, phase = 1 }) => (
  <g transform={at(x, y, s)}>
    <circle r={220} fill="#dde2ee" opacity={0.08} />
    <circle r={150} fill="#dde2ee" opacity={0.1} />
    <circle r={90} fill="#dde2ee" />
    {phase < 1 ? <circle cx={-60 * (1 - phase)} r={88} fill="#141828" /> : null}
  </g>
);
