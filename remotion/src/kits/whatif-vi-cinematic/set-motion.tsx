import React from 'react';
import { random } from 'remotion';

/** Small things that move in a set, so a held shot still feels alive. No text, no dashes (D-088). */

/** Candle-like flicker around 1, from two seeded sines. */
export const flicker = (f: number, seed: number): number =>
  1 +
  0.09 * Math.sin(f * 0.43 + random(`fl${seed}a`) * 6.28) +
  0.06 * Math.sin(f * 1.13 + random(`fl${seed}b`) * 6.28);

/** Translucent curtain panel whose edge breathes in a draught. */
export const BreathingCurtain: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly f: number;
  readonly dir: -1 | 1;
  readonly color?: string;
}> = ({ x, y, w, h, f, dir, color = '#c7bccf' }) => {
  const sway = Math.sin(f / 38) * 10 + Math.sin(f / 17) * 4;
  const edge = x + dir * w;
  return (
    <path
      d={`M${x} ${y} L${edge} ${y} C${edge + dir * sway} ${y + h * 0.35} ${edge - dir * sway} ${y + h * 0.7} ${edge + dir * sway * 1.4} ${y + h} L${x} ${y + h} Z`}
      fill={color}
      opacity={0.62}
    />
  );
};

const FAN_SPEED = 2.4;
const FAN_BLADES = 3;

/** Soft shadow of the ceiling fan sweeping over the wall. */
export const FanShadow: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly f: number;
  readonly a?: number;
}> = ({ x, y, f, a = 0.14 }) => (
  <g fill="#1c1216" opacity={a} style={{ filter: 'blur(14px)' }}>
    {Array.from({ length: FAN_BLADES }, (_, i) => {
      const deg = f * FAN_SPEED + (i * 360) / FAN_BLADES;
      return (
        <ellipse
          key={i}
          cx={x + 190}
          cy={y}
          rx={190}
          ry={34}
          transform={`rotate(${deg} ${x} ${y})`}
        />
      );
    })}
  </g>
);

const BIKE_PASS_FRAMES = 110;
const BIKE_EVERY_FRAMES = 240;

/** Now and then a rider passes outside, seen through the window only. */
export const PassingRider: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly f: number;
  readonly color?: string;
}> = ({ id, x, y, w, h, f, color = '#6f5d4a' }) => {
  const phase = f % BIKE_EVERY_FRAMES;
  if (phase > BIKE_PASS_FRAMES) return null;
  const px = x - 140 + ((w + 280) * phase) / BIKE_PASS_FRAMES;
  const ground = y + h - 8;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`} fill={color}>
        <circle cx={px - 44} cy={ground - 22} r={22} />
        <circle cx={px + 44} cy={ground - 22} r={22} />
        <rect x={px - 44} y={ground - 54} width={88} height={22} rx={10} />
        <ellipse cx={px - 6} cy={ground - 86} rx={22} ry={36} />
        <circle cx={px - 2} cy={ground - 134} r={18} />
      </g>
    </g>
  );
};

const LEAF_FALL_FRAMES = 300;

/** Leaves drifting down. Their tones suit the blur of the layer they are drawn on. */
export const FallingLeaves: React.FC<{
  readonly seed: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly f: number;
  readonly n?: number;
  readonly size?: number;
}> = ({ seed, x, y, w, h, f, n = 14, size = 1 }) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const k =
        ((f + random(`${seed}p${i}`) * LEAF_FALL_FRAMES) % LEAF_FALL_FRAMES) / LEAF_FALL_FRAMES;
      const swing = Math.sin(k * 9 + i) * 46;
      const px = x + random(`${seed}x${i}`) * w + swing - k * 90;
      const py = y + k * h;
      const fade = Math.min(1, k * 8, (1 - k) * 8);
      return (
        <ellipse
          key={i}
          cx={px}
          cy={py}
          rx={15 * size}
          ry={(5 + 4 * Math.abs(Math.sin(k * 14 + i))) * size}
          fill={['#a29a4f', '#7f8c48', '#b78a42'][i % 3]}
          opacity={0.92 * fade}
          transform={`rotate(${k * 520 + i * 40} ${px} ${py})`}
        />
      );
    })}
  </g>
);

const RAIN_FALL_FRAMES = 18;

/** Fine rain in the air. Drawn on an atmosphere layer, so it can only brighten. */
export const RainStreaks: React.FC<{
  readonly seed: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly f: number;
  readonly n?: number;
  readonly a?: number;
  readonly color?: string;
}> = ({ seed, x, y, w, h, f, n = 110, a = 0.34, color = '#cfdcf0' }) => (
  <g stroke={color} strokeLinecap="round">
    {Array.from({ length: n }, (_, i) => {
      const k =
        ((f + random(`${seed}p${i}`) * RAIN_FALL_FRAMES) % RAIN_FALL_FRAMES) / RAIN_FALL_FRAMES;
      const px = x + random(`${seed}x${i}`) * w - k * 24;
      const py = y + k * h;
      const len = 24 + random(`${seed}l${i}`) * 34;
      return (
        <line
          key={i}
          x1={px}
          y1={py}
          x2={px - len * 0.14}
          y2={py + len}
          strokeWidth={1.5 + random(`${seed}w${i}`) * 1.5}
          opacity={a * (0.4 + 0.6 * random(`${seed}o${i}`))}
        />
      );
    })}
  </g>
);

const DROP_FRAMES = 150;

/** Drops running down a window pane. */
export const RainOnGlass: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly f: number;
  readonly n?: number;
}> = ({ id, x, y, w, h, f, n = 26 }) => (
  <g>
    <defs>
      <clipPath id={id}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id})`}>
      {Array.from({ length: n }, (_, i) => {
        const speed = 0.6 + random(`${id}s${i}`);
        const k = ((f * speed + random(`${id}p${i}`) * DROP_FRAMES) % DROP_FRAMES) / DROP_FRAMES;
        const px = x + random(`${id}x${i}`) * w;
        const py = y + k * h;
        return (
          <g key={i}>
            <line
              x1={px}
              y1={py - 46}
              x2={px}
              y2={py}
              stroke="#b8c8e4"
              strokeWidth={2.5}
              opacity={0.34}
            />
            <circle cx={px} cy={py} r={4.5} fill="#dbe6f7" opacity={0.75} />
          </g>
        );
      })}
    </g>
  </g>
);
