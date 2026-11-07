import React from 'react';
import { AbsoluteFill, random } from 'remotion';

/**
 * Cinematic atmosphere: light in the air and a whole-frame finish.
 * Output depends only on the frame and seeds. No text and no animated dashes (D-088).
 * Quality comes first here (owner's choice): beams use real blur although it renders slower.
 */

const BREATH_PERIOD = 70;
const BREATH_DEPTH = 0.14;
const RAY_FILL = 0.62;

const breath = (f: number, seed: number): number =>
  1 - BREATH_DEPTH + BREATH_DEPTH * Math.sin(f / BREATH_PERIOD + seed * 2.1);

const mix = (from: number, to: number, k: number): number => from + (to - from) * k;

/**
 * A beam of light from a top edge to a bottom edge, fading in and out along its length.
 * With `rays` above 1 it splits into separate rays, as sunlight does behind a window grille.
 */
export const LightShaft: React.FC<{
  readonly id: string;
  readonly top: readonly [number, number];
  readonly bottom: readonly [number, number];
  readonly y0: number;
  readonly y1: number;
  readonly color: string;
  readonly a: number;
  readonly f: number;
  readonly seed?: number;
  readonly rays?: number;
  readonly soft?: number;
}> = ({ id, top, bottom, y0, y1, color, a, f, seed = 1, rays = 1, soft = 18 }) => (
  <g style={{ filter: `blur(${soft}px)` }} opacity={a * breath(f, seed)}>
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={y0} x2={0} y2={y1}>
        <stop offset="0" stopColor={color} stopOpacity={0} />
        <stop offset="0.14" stopColor={color} stopOpacity={1} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
    {Array.from({ length: rays }, (_, i) => {
      const from = i / rays;
      const to = rays === 1 ? 1 : (i + RAY_FILL) / rays;
      const points = [
        [mix(top[0], top[1], from), y0],
        [mix(top[0], top[1], to), y0],
        [mix(bottom[0], bottom[1], to), y1],
        [mix(bottom[0], bottom[1], from), y1],
      ];
      return (
        <polygon
          key={i}
          points={points.map((point) => point.join(',')).join(' ')}
          fill={`url(#${id})`}
          opacity={rays === 1 ? 1 : 0.55 + 0.45 * random(`${id}ray${i}`)}
        />
      );
    })}
  </g>
);

/** The glow bright things throw into the air around them. */
export const Bloom: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly color: string;
  readonly a: number;
  readonly f: number;
  readonly seed?: number;
}> = ({ id, x, y, rx, ry, color, a, f, seed = 1 }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={1} />
        <stop offset="0.4" stopColor={color} stopOpacity={0.42} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${id})`} opacity={a * breath(f, seed)} />
  </g>
);

/** Soft bank of haze that drifts slowly from side to side. */
export const Haze: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
  readonly a: number;
  readonly f: number;
  readonly n?: number;
  readonly seed?: number;
}> = ({ id, x, y, w, h, color, a, f, n = 6, seed = 1 }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={1} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    {Array.from({ length: n }, (_, i) => {
      const px = random(`hz${seed}x${i}`);
      const py = random(`hz${seed}y${i}`);
      const drift = Math.sin(f / (90 + 50 * py) + px * 6.28) * 60;
      return (
        <ellipse
          key={i}
          cx={x + px * w + drift}
          cy={y + py * h}
          rx={w * (0.22 + 0.14 * py)}
          ry={h * (0.4 + 0.25 * px)}
          fill={`url(#${id})`}
          opacity={a * (0.65 + 0.35 * random(`hz${seed}o${i}`))}
        />
      );
    })}
  </g>
);

/** Slow dust specks. They fade at the edges of their box, so wrapping around never pops. */
export const DustMotes: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
  readonly f: number;
  readonly n?: number;
  readonly size?: number;
  readonly a?: number;
  readonly seed?: number;
}> = ({ id, x, y, w, h, color, f, n = 36, size = 5, a = 0.75, seed = 1 }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={1} />
        <stop offset="0.45" stopColor={color} stopOpacity={0.55} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    {Array.from({ length: n }, (_, i) => {
      const rx = random(`dm${seed}x${i}`);
      const ry = random(`dm${seed}y${i}`);
      const rs = random(`dm${seed}s${i}`);
      const nx = (rx + ((f * (0.0004 + rs * 0.0007)) % 1)) % 1;
      const ny = (ry + 1 - ((f * (0.0003 + rx * 0.0006)) % 1)) % 1;
      const edge = Math.sin(nx * Math.PI) * Math.sin(ny * Math.PI);
      const twinkle = 0.6 + 0.4 * Math.sin(f / (14 + rs * 22) + ry * 6.28);
      return (
        <circle
          key={i}
          cx={x + nx * w + Math.sin(f / 50 + i) * 8}
          cy={y + ny * h}
          r={size * (0.6 + rs * 1.5)}
          fill={`url(#${id})`}
          opacity={a * edge * twinkle}
        />
      );
    })}
  </g>
);

export type FinishLook = {
  /** soft-light colour at the top of the frame (highlights) */
  readonly top: string;
  /** soft-light colour at the bottom of the frame (shadows) */
  readonly bottom: string;
  /** darkness of the frame edges, 0–1 */
  readonly edge: number;
  /** film grain strength, 0 = none */
  readonly grain?: number;
};

const GRAIN_TILE = 256;
const GRAIN_SCALE = 2;
const GRAIN_MID = 128;
const GRAIN_RANGE = 100;
/** The grain moves every second frame, like film at 15 frames a second. */
const GRAIN_HOLD = 2;
const GRAIN_POSITIONS = 24;

let grainTileUrl: string | null = null;

/** A grey noise tile, drawn once per page from seeded values. */
const grainTile = (): string => {
  if (grainTileUrl) return grainTileUrl;
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('FilmGrain: no 2D canvas context');
  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let p = 0; p < GRAIN_TILE * GRAIN_TILE; p++) {
    const v = GRAIN_MID + (random(`grain${p}`) - 0.5) * GRAIN_RANGE * 2;
    image.data.set([v, v, v, 255], p * 4);
  }
  ctx.putImageData(image, 0, 0);
  grainTileUrl = canvas.toDataURL('image/png');
  return grainTileUrl;
};

/**
 * Light film grain: one noise tile at a seeded position. The shared `Grain` shows a regular dot grid
 * behind blurred areas because of its frequency (0.9). Keep it faint: grain costs file size.
 */
const FilmGrain: React.FC<{ readonly f: number; readonly a: number }> = ({ f, a }) => {
  const position = Math.floor(f / GRAIN_HOLD) % GRAIN_POSITIONS;
  const size = GRAIN_TILE * GRAIN_SCALE;
  const x = Math.floor(random(`grainX${position}`) * size);
  const y = Math.floor(random(`grainY${position}`) * size);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${grainTile()})`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: 'overlay',
        opacity: a,
      }}
    />
  );
};

/** Screen-space finish: a light colour grade, darker edges and faint grain. */
export const FilmFinish: React.FC<{ readonly f: number; readonly look: FinishLook }> = ({
  f,
  look,
}) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill
      style={{
        background: `linear-gradient(${look.top}, ${look.bottom})`,
        mixBlendMode: 'soft-light',
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 72% 72% at 50% 46%, rgba(0,0,0,0) 48%, rgba(6,4,12,${look.edge}) 100%)`,
      }}
    />
    {look.grain ? <FilmGrain f={f} a={look.grain} /> : null}
  </AbsoluteFill>
);
