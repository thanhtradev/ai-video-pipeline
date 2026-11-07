import React, { createContext } from 'react';

/** The light falling on the characters of a shot. Without it, characters draw exactly as before. */
export type SceneLight = {
  /** where the light comes from: -1 screen left, 1 screen right */
  readonly side: -1 | 1;
  readonly color: string;
  /** 0–1 */
  readonly strength: number;
  /** also throw a faint shadow on the wall behind */
  readonly wallShadow?: boolean;
};

export const SceneLightCtx = createContext<SceneLight | null>(null);

const SHADOW_INK = '#0b0710';
const FLOOR_SHEAR = 0.85;
const FLOOR_SQUASH = 0.2;
const WALL_OFFSET = 170;

/** Gradients for the light on the head and clothes. */
export const SceneLightDefs: React.FC<{
  readonly uid: string;
  readonly light: SceneLight;
}> = ({ uid, light }) => (
  <>
    <radialGradient id={`${uid}-headlit`} cx={`${50 - light.side * 15}%`} cy="55%" r="60%">
      <stop offset="0.88" stopColor={light.color} stopOpacity={0} />
      <stop offset="1" stopColor={light.color} stopOpacity={0.62 * light.strength} />
    </radialGradient>
    <linearGradient
      id={`${uid}-lit`}
      x1={light.side < 0 ? 0 : 1}
      y1="0"
      x2={light.side < 0 ? 1 : 0}
      y2="0"
    >
      <stop offset="0" stopColor={light.color} stopOpacity={0.45 * light.strength} />
      <stop offset="0.5" stopColor={light.color} stopOpacity={0} />
      <stop offset="0.5" stopColor={SHADOW_INK} stopOpacity={0} />
      <stop offset="1" stopColor={SHADOW_INK} stopOpacity={0.5 * light.strength} />
    </linearGradient>
  </>
);

/** Simple body shape for shadows, feet at the origin. */
const Silhouette: React.FC<{ readonly headY: number; readonly headR: number }> = ({
  headY,
  headR,
}) => (
  <>
    <circle cx={0} cy={headY} r={headR} />
    <ellipse cx={0} cy={-230} rx={92} ry={120} />
    <rect x={-46} y={-130} width={30} height={130} />
    <rect x={16} y={-130} width={30} height={130} />
  </>
);

/** A long soft shadow on the floor, pointing away from the light, and optionally one on the wall. */
export const CastShadow: React.FC<{
  readonly light: SceneLight;
  readonly headY: number;
  readonly headR: number;
  readonly opacity: number;
}> = ({ light, headY, headR, opacity }) => (
  <g fill={SHADOW_INK}>
    {light.wallShadow && (
      <g
        transform={`translate(${-light.side * WALL_OFFSET} -30) scale(1.08)`}
        opacity={0.16 * light.strength * opacity}
        style={{ filter: 'blur(20px)' }}
      >
        <Silhouette headY={headY} headR={headR} />
      </g>
    )}
    <g
      transform={`matrix(1 0 ${light.side * FLOOR_SHEAR} ${-FLOOR_SQUASH} 0 0)`}
      opacity={0.55 * light.strength * opacity}
      style={{ filter: 'blur(9px)' }}
    >
      <Silhouette headY={headY} headR={headR} />
    </g>
  </g>
);
