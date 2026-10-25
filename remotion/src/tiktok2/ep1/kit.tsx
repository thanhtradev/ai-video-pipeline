import React from 'react';
import { interpolate } from 'remotion';
import { Character, CharacterProps } from './Character';
import { Cam } from './Stage';
import { C, clamp } from './theme';
import { ShotH } from './time';

/** EP1 shot-building kit: pre-cast actors, face-tracking camera, audio cues. */
type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
export const Ban: React.FC<A> = (p) => <Character seed={1} hoodieColor={C.orange} {...p} />;
export const Me: React.FC<A> = (p) => (
  <Character
    seed={2}
    hoodieColor={C.mom}
    size={1.08}
    {...p}
    accessories={['bun', ...(p.accessories ?? [])]}
  />
);
export const Bin: React.FC<A> = (p) => (
  <Character seed={3} hoodieColor={C.bin} size={0.58} {...p} />
);
export const Huy: React.FC<A> = (p) => (
  <Character
    seed={4}
    hoodieColor={C.huy}
    {...p}
    accessories={['hoodUp', ...(p.accessories ?? [])]}
  />
);
export const CoGiao: React.FC<A> = (p) => (
  <Character
    seed={5}
    hoodieColor={C.aodai}
    size={1.05}
    {...p}
    accessories={['aodai', 'glassesRound', 'bun', ...(p.accessories ?? [])]}
  />
);
export const Thay: React.FC<A> = (p) => (
  <Character
    seed={6}
    hoodieColor={C.principal}
    size={1.1}
    {...p}
    accessories={['glassesSquare', ...(p.accessories ?? [])]}
  />
);
export const KeBatCoc: React.FC<A> = (p) => (
  <Character
    seed={7}
    hoodieColor={C.kidnap}
    size={1.12}
    eyes="half"
    {...p}
    accessories={['cap', ...(p.accessories ?? [])]}
  />
);
export const Friend: React.FC<A & { k: 0 | 1 | 2 }> = ({ k, ...p }) => (
  <Character
    seed={10 + k}
    hoodieColor={[C.friendBeige, C.friendGray, C.friendPurple][k]}
    size={[0.98, 1.02, 0.95][k]}
    {...p}
    accessories={k === 1 ? ['hoodUp'] : []}
  />
);
/** Muted crowd person. */
export const Extra: React.FC<A & { k: number }> = ({ k, ...p }) => (
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
);

/** Character head position (heels at feetY, size). */
export const headY = (feetY: number, size = 1) => feetY - 468 * size;
/** Camera on the face: z ≈ 2.6 close-up, 4 extreme close-up. */
export const faceCam = (x: number, feetY: number, size = 1, z = 2.6, dy = 30): Cam => ({
  x,
  y: headY(feetY, size) + dy,
  z,
});
/** Medium camera (waist level). */
export const bodyCam = (x: number, feetY: number, size = 1, z = 1.5): Cam => ({
  x,
  y: feetY - 360 * size,
  z,
});

/** BreathRing seconds from keys [local frame, story seconds]; after the last key it runs in real time. */
export const ringSec = (f: number, keys: readonly (readonly [number, number])[]) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    if (f <= keys[i + 1][0])
      return interpolate(f, [keys[i][0], keys[i + 1][0]], [keys[i][1], keys[i + 1][1]]);
  }
  const [lf, ls] = keys[keys.length - 1];
  return ls + (f - lf) / 30;
};

/** Audio cue (LOCAL frame in the shot; Episode converts to absolute). */
export type Cue = {
  readonly src: string;
  readonly at: number;
  readonly vol?: number;
  readonly dur?: number;
  readonly loop?: boolean;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly noDuck?: boolean;
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
/** BreathRing tick every (real-time) second from a → b; when red (from `red`) louder and accelerating. */
export const ticks = (a: number, b: number, red = Infinity, base = 0.45): Cue[] => {
  const out: Cue[] = [];
  let t = a;
  while (t < b) {
    const isRed = t >= red;
    out.push(hit(isRed ? 'tick_hi' : 'tick', t, isRed ? base * 1.6 : base));
    const k = isRed ? Math.max(0, Math.min(1, (t - red) / 150)) : 0;
    t += isRed ? Math.round(18 - 8 * k) : 30;
  }
  return out;
};

/** Shot definition: picture component + audio cues + bed. */
export type Amb =
  | 'living'
  | 'rules'
  | 'yard'
  | 'altar'
  | 'teacher'
  | 'bath'
  | 'hall'
  | 'canteen'
  | 'alley'
  | 'class'
  | 'night'
  | 'phone'
  | 'lantern'
  | 'none';
export type ShotDef = {
  readonly C: React.FC;
  readonly fx?: (h: ShotH) => Cue[];
  readonly amb: Amb;
  /** caption position (px from the top) when it must avoid the main detail */
  readonly capY?: number;
};
export { clamp };
