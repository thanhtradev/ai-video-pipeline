import React from 'react';
import { random } from 'remotion';

/**
 * Silhouette figure for the horror kit (style v2, D-111): a black shadow-puppet body with human
 * proportions, a rim light on one side and, at most, a pair of eyes. No face, no clothes, no rig.
 * World coordinates: feet at (x, y), an adult is about 600 tall at size 1.
 * No animated dashes anywhere (D-088).
 */
export type Pose = 'stand' | 'still' | 'walk' | 'sit' | 'crouch' | 'reach' | 'turnBack';
export type Eyes = 'none' | 'slits' | 'hollow' | 'glow';
export type Prop = 'none' | 'lamp' | 'phone';

export type FigureProps = {
  readonly x?: number;
  readonly y?: number;
  readonly size?: number;
  /** -1 left · 0 front · 1 right */
  readonly facing?: number;
  readonly pose?: Pose;
  /** frame, for breathing, sway and the walk cycle */
  readonly t?: number;
  readonly seed?: number;
  readonly eyes?: Eyes;
  readonly eyeColor?: string;
  /** 0…1 rim-light strength */
  readonly rim?: number;
  /** -1 light from the left · 1 from the right */
  readonly rimSide?: number;
  readonly rimColor?: string;
  /** 0…1 per-frame shiver of the whole body */
  readonly jitter?: number;
  /** arms reaching below the knees (the entity) */
  readonly longArms?: boolean;
  /** head tilt in degrees */
  readonly tilt?: number;
  /** taller and thinner than a person */
  readonly stretch?: number;
  /** torn paper-cut edges */
  readonly rough?: boolean;
  readonly prop?: Prop;
  readonly opacity?: number;
};

export const INK = '#07080c';
export const RIM_WARM = '#ffd9a8';
export const EYE_PALE = '#d9dde6';

const TAU = Math.PI * 2;

export const Figure: React.FC<FigureProps> = ({
  x = 0,
  y = 0,
  size = 1,
  facing = 0,
  pose = 'stand',
  t = 0,
  seed = 1,
  eyes = 'none',
  eyeColor = EYE_PALE,
  rim = 0.6,
  rimSide = 1,
  rimColor = RIM_WARM,
  jitter = 0,
  longArms = false,
  tilt = 0,
  stretch = 1,
  rough = false,
  prop = 'none',
  opacity = 1,
}) => {
  const uid = `fig${seed}`;
  const breath = Math.sin((t / 30) * TAU * 0.22 + seed) * 2;
  const sway = Math.sin((t / 30) * TAU * 0.11 + seed * 2) * 1.5;
  const jx = jitter ? (random(`jx${seed}-${t}`) - 0.5) * 8 * jitter : 0;
  const jy = jitter ? (random(`jy${seed}-${t}`) - 0.5) * 6 * jitter : 0;
  const fx = facing === 0 ? 1 : facing;
  const sitting = pose === 'sit' || pose === 'crouch';
  const hipY = pose === 'sit' ? -230 : pose === 'crouch' ? -180 : -300;
  const shoulderY = hipY - 170 * stretch;
  const headY = shoulderY - 80 * stretch + breath;
  const walk = pose === 'walk' ? Math.sin((t / 30) * TAU * 0.9 + seed) : 0;
  const legSwing = walk * 22;
  const armSwing = pose === 'walk' ? -walk * 18 : 0;
  const handY = longArms ? -40 : shoulderY + 210 * stretch;
  const reach = pose === 'reach';

  const limb = (d: string, w: number) => (
    <path
      d={d}
      stroke={INK}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
  const leg = (side: number, swing: number) =>
    sitting
      ? `M${side * 24} ${hipY} L${side * 24 + 70 * fx} ${hipY + 10} L${side * 24 + 70 * fx} 0`
      : `M${side * 24} ${hipY} Q${side * 24 + swing * 0.6} ${hipY / 2} ${side * 30 + swing} 0`;
  const arm = (side: number, swing: number) => {
    const sx = side * 56;
    if (reach)
      return `M${sx} ${shoulderY + 10} Q${sx + 60 * fx} ${shoulderY - 30} ${sx + 130 * fx} ${shoulderY - 70}`;
    return `M${sx} ${shoulderY + 10} Q${sx + side * 14 + swing * 0.5} ${(shoulderY + handY) / 2} ${sx + side * 10 + swing} ${handY}`;
  };
  const torso = `M-55 ${shoulderY} Q0 ${shoulderY - 18} 55 ${shoulderY} L46 ${hipY} Q0 ${hipY + 14} -46 ${hipY} Z`;
  const headRx = 42 * (stretch > 1 ? 0.92 : 1);
  const headRy = 52 * stretch;

  const body = (
    <g>
      {limb(leg(-1, -legSwing), 28)}
      {limb(leg(1, legSwing), 28)}
      <ellipse cx={-30 - legSwing} cy={2} rx={26} ry={9} fill={INK} />
      <ellipse cx={30 + legSwing} cy={2} rx={26} ry={9} fill={INK} />
      <path d={torso} fill={INK} />
      {limb(arm(-1, -armSwing), 22)}
      {limb(arm(1, armSwing), 22)}
      <rect x={-14} y={headY + headRy - 14} width={28} height={30} fill={INK} />
      <g transform={`rotate(${tilt} 0 ${headY + headRy})`}>
        <ellipse cx={0} cy={headY} rx={headRx} ry={headRy} fill={INK} />
        {pose !== 'turnBack' && eyes !== 'none' ? (
          <EyePair kind={eyes} color={eyeColor} y={headY - 6} fx={fx} uid={uid} />
        ) : null}
      </g>
    </g>
  );

  return (
    <g
      transform={`translate(${x + jx + sway},${y + jy}) scale(${size})`}
      opacity={opacity}
      filter={rough ? `url(#${uid}-rough)` : undefined}
    >
      <defs>
        <linearGradient id={`${uid}-rim`} x1={rimSide > 0 ? 0 : 1} x2={rimSide > 0 ? 1 : 0}>
          <stop offset="0.35" stopColor={rimColor} stopOpacity={0} />
          <stop offset="1" stopColor={rimColor} stopOpacity={rim} />
        </linearGradient>
        {rough ? (
          <filter id={`${uid}-rough`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} />
            <feDisplacementMap in="SourceGraphic" scale={6} />
          </filter>
        ) : null}
      </defs>
      {body}
      {/* rim light: the same body, stroked with the side gradient, clipped to its own shape */}
      {rim > 0 ? (
        <g
          stroke={`url(#${uid}-rim)`}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          style={{ mixBlendMode: 'screen' }}
        >
          <path d={torso} />
          <ellipse
            cx={0}
            cy={headY}
            rx={headRx - 1}
            ry={headRy - 1}
            transform={`rotate(${tilt} 0 ${headY + headRy})`}
          />
          <path d={arm(rimSide, armSwing * rimSide)} strokeWidth={2} />
          <path d={leg(rimSide, legSwing * rimSide)} strokeWidth={2} />
        </g>
      ) : null}
      {prop === 'lamp' ? <HandLamp x={fx * 70} y={handY} uid={uid} /> : null}
      {prop === 'phone' ? <HandPhone x={fx * 64} y={handY - 10} /> : null}
    </g>
  );
};

const EyePair: React.FC<{ kind: Eyes; color: string; y: number; fx: number; uid: string }> = ({
  kind,
  color,
  y,
  fx,
  uid,
}) => {
  const dx = 15;
  const ox = fx * 4;
  if (kind === 'slits')
    return (
      <g fill={color}>
        <rect x={-dx - 8 + ox} y={y} width={16} height={3} rx={1.5} />
        <rect x={dx - 8 + ox} y={y} width={16} height={3} rx={1.5} />
      </g>
    );
  if (kind === 'hollow')
    return (
      <g fill={color} opacity={0.92}>
        <ellipse cx={-dx + ox} cy={y} rx={6} ry={9} />
        <ellipse cx={dx + ox} cy={y} rx={6} ry={9} />
      </g>
    );
  return (
    <g>
      <defs>
        <filter id={`${uid}-eyeglow`} x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
      </defs>
      <g fill={color} opacity={0.55} filter={`url(#${uid}-eyeglow)`}>
        <circle cx={-dx + ox} cy={y} r={10} />
        <circle cx={dx + ox} cy={y} r={10} />
      </g>
      <g fill={color}>
        <ellipse cx={-dx + ox} cy={y} rx={5} ry={7} />
        <ellipse cx={dx + ox} cy={y} rx={5} ry={7} />
      </g>
    </g>
  );
};

/** Oil lamp hanging from a hand: the only warm thing on a silhouette. */
const HandLamp: React.FC<{ x: number; y: number; uid: string }> = ({ x, y, uid }) => (
  <g transform={`translate(${x},${y})`}>
    <defs>
      <radialGradient id={`${uid}-lamp`}>
        <stop offset="0" stopColor="#ffb86a" stopOpacity={0.5} />
        <stop offset="1" stopColor="#ffb86a" stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle cx={0} cy={50} r={110} fill={`url(#${uid}-lamp)`} style={{ mixBlendMode: 'screen' }} />
    <path d="M-12 0 Q0 -20 12 0" stroke="#3a2a14" strokeWidth={4} fill="none" />
    <rect x={-16} y={0} width={32} height={12} rx={4} fill="#2a1f10" />
    <path d="M-17 12 L17 12 L12 66 L-12 66 Z" fill="#ffe2a6" opacity={0.75} />
    <ellipse cx={0} cy={42} rx={5} ry={12} fill="#fff1c0" />
    <rect x={-22} y={66} width={44} height={16} rx={6} fill="#2a1f10" />
  </g>
);

/** Phone screen lighting a face from below. */
const HandPhone: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x},${y})`}>
    <rect x={-14} y={-50} width={30} height={60} rx={6} fill="#101218" />
    <rect x={-11} y={-46} width={24} height={50} rx={4} fill="#9fb8d8" opacity={0.85} />
    <ellipse
      cx={0}
      cy={-80}
      rx={90}
      ry={70}
      fill="#9fb8d8"
      opacity={0.12}
      style={{ mixBlendMode: 'screen' }}
    />
  </g>
);
