import React from 'react';
import { shade } from './palette';

/**
 * Science-channel accessories for the Character rig (lab coat, antenna, visor, helmet, goggles,
 * headphones). Each is drawn only when listed in `accessories`; the TikTok 2 look is unchanged.
 * Every group carries `data-acc` so tests and QA can find it.
 */
export const SCIENCE_ACCESSORIES = [
  'labCoat',
  'antenna',
  'visor',
  'helmet',
  'goggles',
  'headphones',
] as const;
export type ScienceAccessory = (typeof SCIENCE_ACCESSORIES)[number];

/** Geometry/time of the character the accessory is drawn on (local rig coordinates). */
export type AccessoryCtx = {
  /** head centre y (HEAD_Y + bob/sit offset) */
  readonly headY: number;
  readonly headR: number;
  readonly torsoTop: number;
  readonly hem: number;
  /** -1 left · 0 front · 1 right */
  readonly fx: number;
  readonly t: number;
  /** outline-only drawing (invisibility shimmer) */
  readonly line: boolean;
  readonly lw: number;
  readonly hoodUp: boolean;
  readonly back: boolean;
};

export const COAT = '#f1ede4';
const COAT_DARK = shade(COAT, -0.18);
const METAL = '#2f3340';
const METAL_LIGHT = '#6c7383';
const GLASS = '#9fe4ff';
const LENS = '#8fd6c4';
/** antenna light blinks about every 40 frames */
const ANTENNA_BLINK_PERIOD = 40;

const paint = (c: AccessoryCtx, fill: string) =>
  c.line ? { fill: 'none', stroke: '#fff', strokeWidth: c.lw } : { fill };
const stroke = (c: AccessoryCtx, colour: string, w: number) => ({
  fill: 'none',
  stroke: c.line ? '#fff' : colour,
  strokeWidth: c.line ? c.lw : w,
  strokeLinecap: 'round' as const,
});

/** Open white coat over the hoodie: two front panels with lapels. Drawn on the torso. */
export const LabCoat: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  const { torsoTop, hem } = c;
  const panel = (s: 1 | -1) =>
    `M${s * 78} ${torsoTop + 16} Q${s * 80} ${torsoTop - 2} ${s * 46} ${torsoTop - 8} L${s * 16} ${torsoTop - 8} L${s * 16} ${torsoTop + 40} L${s * 30} ${hem + 6} L${s * 92} ${hem + 6} Q${s * 98} ${hem - 24} ${s * 94} ${hem - 50} Z`;
  const lapel = (s: 1 | -1) =>
    `M${s * 46} ${torsoTop - 8} L${s * 16} ${torsoTop + 40} L${s * 16} ${torsoTop - 8} Z`;
  return (
    <g data-acc="labCoat">
      {([-1, 1] as const).map((s) => (
        <path key={s} d={panel(s)} {...paint(c, COAT)} />
      ))}
      {!c.line &&
        ([-1, 1] as const).map((s) => <path key={`l${s}`} d={lapel(s)} fill={COAT_DARK} />)}
      {!c.line && (
        <rect x={-66} y={hem - 90} width={30} height={34} rx={6} fill={COAT_DARK} opacity={0.5} />
      )}
    </g>
  );
};

/** Antenna on top of the head: a stalk and a ball whose light blinks. */
export const Antenna: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  const top = c.headY - c.headR;
  const x = c.fx * 18;
  const on = Math.sin((c.t / ANTENNA_BLINK_PERIOD) * Math.PI * 2) > 0.3;
  return (
    <g data-acc="antenna">
      <line x1={x} y1={top + 6} x2={x} y2={top - 54} {...stroke(c, METAL, 8)} />
      <circle cx={x} cy={top - 66} r={16} {...paint(c, METAL)} />
      {!c.line && <circle cx={x} cy={top - 66} r={9} fill={on ? '#ffd84d' : '#8a6b1f'} />}
      {!c.line && on && <circle cx={x} cy={top - 66} r={22} fill="#ffd84d" opacity={0.22} />}
    </g>
  );
};

/** Translucent visor band across the eyes. Drawn after the eyes. */
export const Visor: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  if (c.back) return null;
  const w = c.headR * 1.7;
  return (
    <g data-acc="visor">
      <rect
        x={c.fx * 30 - w / 2}
        y={c.headY - 28}
        width={w}
        height={68}
        rx={30}
        {...(c.line ? paint(c, '') : { fill: GLASS, opacity: 0.3 })}
      />
      <rect
        x={c.fx * 30 - w / 2}
        y={c.headY - 28}
        width={w}
        height={68}
        rx={30}
        {...stroke(c, '#d8f4ff', 4)}
      />
    </g>
  );
};

/** Clear space-helmet dome with a collar ring. Dome drawn after the eyes, collar before the head. */
export const HelmetCollar: React.FC<{ c: AccessoryCtx }> = ({ c }) => (
  <g data-acc="helmet">
    <ellipse cx={0} cy={c.torsoTop - 2} rx={94} ry={24} {...paint(c, '#cfd6e0')} />
  </g>
);
export const HelmetDome: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  const r = c.headR + 34;
  return (
    <g data-acc="helmet">
      <circle
        cx={0}
        cy={c.headY + 4}
        r={r}
        {...(c.line ? paint(c, '') : { fill: '#ffffff', opacity: 0.1 })}
      />
      <circle cx={0} cy={c.headY + 4} r={r} {...stroke(c, '#e8f2ff', 5)} opacity={0.85} />
      {!c.line && (
        <path
          d={`M${-r * 0.75} ${c.headY - r * 0.35} A${r} ${r} 0 0 1 ${-r * 0.2} ${c.headY - r * 0.92}`}
          {...stroke(c, '#ffffff', 7)}
          opacity={0.7}
        />
      )}
    </g>
  );
};

/** Safety goggles pushed up on the forehead: a band and two lenses. */
export const Goggles: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  const y = c.headY - c.headR * 0.62;
  const cx = c.fx * 26;
  return (
    <g data-acc="goggles">
      <path
        d={`M${-c.headR * 0.92} ${y + 10} Q0 ${y - 36} ${c.headR * 0.92} ${y + 10}`}
        {...stroke(c, '#3b3f47', 10)}
      />
      {([-1, 1] as const).map((s) => (
        <rect
          key={s}
          x={cx + s * 36 - 30}
          y={y - 28}
          width={60}
          height={42}
          rx={14}
          {...(c.line ? paint(c, '') : { fill: LENS, stroke: '#3b3f47', strokeWidth: 6 })}
        />
      ))}
      {!c.line && <ellipse cx={cx - 46} cy={y - 16} rx={10} ry={5} fill="#ffffff" opacity={0.6} />}
    </g>
  );
};

/** Headphones: a band over the head (or the hood) and two cups at the ears. */
export const Headphones: React.FC<{ c: AccessoryCtx }> = ({ c }) => {
  const r = c.headR + (c.hoodUp ? 30 : 10);
  const cy = c.headY + (c.hoodUp ? 6 : 0);
  return (
    <g data-acc="headphones">
      <path d={`M${-r} ${cy} A${r} ${r} 0 0 1 ${r} ${cy}`} {...stroke(c, METAL, 12)} />
      {([-1, 1] as const).map((s) => (
        <g key={s} transform={`translate(${s * r + c.fx * 8},${cy + 8})`}>
          <rect x={-22} y={-40} width={44} height={80} rx={20} {...paint(c, METAL)} />
          {!c.line && <rect x={-12} y={-28} width={24} height={56} rx={12} fill={METAL_LIGHT} />}
        </g>
      ))}
    </g>
  );
};
