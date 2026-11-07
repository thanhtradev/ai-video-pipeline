import React from 'react';
import { random } from 'remotion';
import type { SceneLight } from '../../rig/scene-light';
import type { BokehLight } from '../whatif/lens';
import type { SetLayers } from '../whatif/sets';
import { Bloom, DustMotes, FilmFinish, FinishLook, Haze, LightShaft } from './atmosphere';
import { RainOnGlass, RainStreaks } from './set-motion';

/** The light and weather of a shot. */
export type Mood = 'golden' | 'night' | 'overcast' | 'rain';

/** What the cinematic look adds on top of a base set. See `cinematicSet` for the short form. */
export type Look = {
  readonly far?: React.ReactNode;
  readonly bg?: React.ReactNode;
  readonly fg?: React.ReactNode;
  readonly behind?: React.ReactNode;
  readonly over?: React.ReactNode;
  readonly finish: FinishLook;
  readonly light: SceneLight;
  readonly bokeh?: readonly BokehLight[];
  readonly reflection?: { y: number; a: number };
  readonly filter?: string;
};

/** Less depth blur than the Stage defaults (7 and 5), so the added detail stays readable. */
export const BLUR_FAR = 3.5;
export const BLUR_BG = 2.6;
/** Background blur at zoom 3: wide shots stay readable, close-ups melt the background. */
export const FOCUS_GAIN = 5;

export const enrich = (set: SetLayers, f: number, look: Look): SetLayers => ({
  ...set,
  far: (
    <>
      {set.far}
      {look.far}
    </>
  ),
  bg: (
    <>
      {set.bg}
      {look.bg}
    </>
  ),
  fg: (
    <>
      {set.fg}
      {look.fg}
    </>
  ),
  atmos: {
    behind: look.behind,
    over: look.over,
    finish: <FilmFinish f={f} look={look.finish} />,
    blurFar: BLUR_FAR,
    blurBg: BLUR_BG,
    focusGain: FOCUS_GAIN,
    light: look.light,
    bokeh: look.bokeh,
    reflection: look.reflection,
    filter: look.filter,
  },
});

export const WORLD_LEFT = -1300;
export const WORLD_W = 3700;
export const DARK = '#1c1216';

/** Vertical shade: `a` at y0 fading to nothing at y1. */
export const Shade: React.FC<{
  id: string;
  y0: number;
  y1: number;
  color?: string;
  a: number;
}> = ({ id, y0, y1, color = DARK, a }) => (
  <g>
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={y0} x2={0} y2={y1}>
        <stop offset="0" stopColor={color} stopOpacity={a} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
    <rect
      x={WORLD_LEFT}
      y={Math.min(y0, y1)}
      width={WORLD_W}
      height={Math.abs(y1 - y0)}
      fill={`url(#${id})`}
    />
  </g>
);

/** Darkens everything further from a light source; `inner` stays untouched. */
export const Falloff: React.FC<{
  id: string;
  cx: number;
  cy: number;
  r: number;
  a: number;
  inner?: number;
  color?: string;
}> = ({ id, cx, cy, r, a, inner = 0.3, color = DARK }) => (
  <g>
    <defs>
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
        <stop offset={inner} stopColor={color} stopOpacity={0} />
        <stop offset="1" stopColor={color} stopOpacity={a} />
      </radialGradient>
    </defs>
    <rect x={WORLD_LEFT} y={-600} width={WORLD_W} height={2800} fill={`url(#${id})`} />
  </g>
);

/** Soft damp patches on a wall. */
export const WallWear: React.FC<{
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  color: string;
  a: number;
}> = ({ id, x, y, w, h, n, color, a }) => (
  <g>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={1} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    {Array.from({ length: n }, (_, i) => {
      const k = random(`${id}k${i}`);
      return (
        <ellipse
          key={i}
          cx={x + random(`${id}x${i}`) * w}
          cy={y + random(`${id}y${i}`) * h}
          rx={60 + k * 190}
          ry={40 + random(`${id}r${i}`) * 150}
          fill={`url(#${id})`}
          opacity={a * (0.4 + 0.6 * k)}
        />
      );
    })}
  </g>
);

export type Ray = {
  readonly top: readonly [number, number];
  readonly bottom: readonly [number, number];
  readonly y0: number;
  readonly y1: number;
  readonly a: number;
  readonly rays?: number;
  readonly soft?: number;
};

/** One set in short form: where its light is, and what it adds. Coordinates are world coordinates. */
export type SetSpec = {
  /** unique, used in gradient ids */
  readonly id: string;
  readonly interior: boolean;
  /** main light: drives the glow and which side of the characters is lit */
  readonly source: {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly a: number;
  };
  readonly color: string;
  readonly finish: FinishLook;
  /** extra darkening away from the light, 0–1 */
  readonly falloff?: number;
  readonly filter?: string;
  readonly rays?: readonly Ray[];
  readonly bokeh?: readonly BokehLight[];
  /** floor line for floor reflections (interiors) */
  readonly reflectionY?: number;
  readonly reflection?: number;
  /** window pane that shows rain */
  readonly glass?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly dust?: { readonly color: string; readonly n?: number };
  readonly far?: React.ReactNode;
  readonly bg?: React.ReactNode;
  readonly fg?: React.ReactNode;
  readonly behind?: React.ReactNode;
  readonly over?: React.ReactNode;
};

const MOODS: Readonly<
  Record<Mood, { finish: FinishLook; color: string; strength: number; filter?: string }>
> = {
  golden: {
    finish: {
      top: 'rgba(255,186,104,0.5)',
      bottom: 'rgba(84,62,76,0.28)',
      edge: 0.56,
      grain: 0.035,
    },
    color: '#ffc677',
    strength: 0.9,
  },
  night: {
    finish: { top: 'rgba(60,90,170,0.5)', bottom: 'rgba(20,24,70,0.5)', edge: 0.72, grain: 0.04 },
    color: '#8fb0ff',
    strength: 0.8,
    filter: 'brightness(0.5) saturate(0.72)',
  },
  overcast: {
    finish: {
      top: 'rgba(172,192,205,0.45)',
      bottom: 'rgba(52,63,79,0.35)',
      edge: 0.48,
      grain: 0.03,
    },
    color: '#dbe5ec',
    strength: 0.45,
    filter: 'saturate(0.65) brightness(0.85)',
  },
  rain: {
    finish: { top: 'rgba(92,120,170,0.5)', bottom: 'rgba(28,36,70,0.48)', edge: 0.64, grain: 0.04 },
    color: '#a9c1ea',
    strength: 0.55,
    filter: 'saturate(0.58) brightness(0.62)',
  },
};

const WIDE_LEFT = -640;
const WIDE_W = 2280;
const WIDE_TOP = 300;
const WIDE_H = 1280;

/**
 * Builds a cinematic set from its short form. Without a `mood` the set keeps its own light; a mood
 * changes the colours and the filter and turns off direct sun rays.
 */
export const cinematicSet = (base: SetLayers, f: number, spec: SetSpec, mood?: Mood): SetLayers => {
  const moodLook = mood ? MOODS[mood] : undefined;
  const color = moodLook?.color ?? spec.color;
  const { id, source } = spec;
  const dustColor = moodLook ? moodLook.color : (spec.dust?.color ?? spec.color);
  const showRays = !mood || mood === 'golden';
  return enrich(base, f, {
    far: (
      <g>
        {spec.far}
        {spec.falloff ? (
          <Falloff
            id={`cine${id}Fall`}
            cx={source.x}
            cy={source.y}
            r={1600}
            a={spec.falloff}
            inner={0.22}
          />
        ) : null}
        {mood === 'rain' && spec.glass ? (
          <RainOnGlass id={`cine${id}Glass`} {...spec.glass} f={f} />
        ) : null}
      </g>
    ),
    bg: spec.bg,
    fg: spec.fg,
    behind: (
      <g>
        <Bloom
          id={`cine${id}Bloom`}
          x={source.x}
          y={source.y}
          rx={source.r}
          ry={source.r}
          color={color}
          a={source.a * (showRays ? 1 : 0.6)}
          f={f}
        />
        {showRays
          ? spec.rays?.map((ray, i) => (
              <LightShaft
                key={i}
                id={`cine${id}Ray${i}`}
                top={ray.top}
                bottom={ray.bottom}
                y0={ray.y0}
                y1={ray.y1}
                color={color}
                a={ray.a}
                f={f}
                seed={i + 1}
                rays={ray.rays}
                soft={ray.soft}
              />
            ))
          : null}
        <Haze
          id={`cine${id}Haze`}
          x={WIDE_LEFT + 200}
          y={760}
          w={WIDE_W - 400}
          h={620}
          color={color}
          a={0.07}
          f={f}
        />
        {spec.behind}
      </g>
    ),
    over: (
      <g>
        {mood === 'rain' && !spec.interior ? (
          <RainStreaks
            seed={`rain${id}`}
            x={WIDE_LEFT}
            y={WIDE_TOP - 60}
            w={WIDE_W}
            h={WIDE_H}
            f={f}
          />
        ) : (
          <DustMotes
            id={`cine${id}Dust`}
            x={WIDE_LEFT + 300}
            y={WIDE_TOP + 160}
            w={WIDE_W - 600}
            h={WIDE_H - 200}
            color={dustColor}
            f={f}
            n={spec.dust?.n ?? 34}
            size={4}
            a={0.62}
          />
        )}
        {spec.over}
      </g>
    ),
    finish: moodLook?.finish ?? spec.finish,
    light: {
      side: source.x < WORLD_CENTRE ? -1 : 1,
      color,
      strength: moodLook?.strength ?? 0.88,
      wallShadow: spec.interior,
    },
    filter: moodLook?.filter ?? spec.filter,
    bokeh: spec.bokeh,
    reflection: spec.reflectionY ? { y: spec.reflectionY, a: spec.reflection ?? 0.12 } : undefined,
  });
};

const WORLD_CENTRE = 500;
