import { interpolate } from 'remotion';
import { clamp } from '../../kits/whatif/theme';
import { at, L, shot } from './time';

/**
 * TIME STOPS (ABSOLUTE frames, anchored to spoken words). from = the clap, to = when time runs again.
 * clock = [frame, seconds left] (30-second clock; interpolated between keys; `cycle` = the clock restarts on every clap).
 * days = [frame, number of days] ("+N NGÀY" counter). Audio: from…to mutes the ambience, leaving a low hum + ticks (audio.tsx).
 */
export type Freeze = {
  readonly from: number;
  readonly to: number;
  readonly clock?: readonly (readonly [number, number])[];
  readonly claps?: readonly number[];
  readonly days: readonly (readonly [number, number])[];
  readonly big?: readonly [number, number];
  readonly hud?: boolean;
};

const s = (id: string) => shot(id);
const spread = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * i) / Math.max(1, n - 1)));

const hookClap = s('1.1').from + 14;
const c1 = at('L011', 'vỗ tay');
const cRules = at('L043', 'vỗ tay');
const cVy = [L('L071'), L('L074'), ...spread(L('L075') + 10, L('L077') - 8, 8)];
const cEgg = at('L082', 'vỗ tay');
const cBall = at('L090', 'vỗ tay');
const cBig = at('L159', 'vỗ tay');
const cRush = [
  L('L177'),
  L('L184'),
  L('L188'),
  L('L189'),
  L('L190'),
  ...spread(L('L191'), L('L207'), 12),
];

export const FREEZES: readonly Freeze[] = [
  {
    from: hookClap,
    to: s('1.1').to,
    clock: [
      [hookClap, 30],
      [s('1.1').to, 26],
    ],
    days: [[hookClap, 1]],
    hud: true,
  },
  {
    from: c1,
    to: L('L031'),
    clock: [
      [c1, 30],
      [L('L019'), 30],
      [L('L020'), 29],
      [L('L021'), 28],
      [L('L024'), 20],
      [L('L027'), 6],
      [L('L028'), 3],
      [L('L029'), 2],
      [L('L030'), 1],
      [L('L031'), 0],
    ],
    days: [[c1, 1]],
    hud: true,
  },
  {
    from: cRules,
    to: s('3.3').to,
    clock: [
      [cRules, 30],
      [s('3.3').to, 20],
    ],
    days: [[cRules, 1]],
    hud: true,
  },
  {
    from: cVy[0],
    to: L('L077'),
    claps: cVy,
    days: cVy.map((c, i) => [c, i + 1] as const),
    hud: true,
  },
  {
    from: cEgg,
    to: L('L084'),
    clock: [
      [cEgg, 30],
      [L('L084'), 1],
    ],
    days: [[cEgg, 1]],
    hud: true,
  },
  {
    from: cBall,
    to: L('L092'),
    clock: [
      [cBall, 30],
      [L('L092'), 0],
    ],
    days: [[cBall, 1]],
    hud: true,
  },
  {
    from: cBig,
    to: L('L174'),
    clock: [
      [cBig, 30],
      [L('L169'), 20],
      [L('L170'), 10],
      [L('L171'), 3],
      [L('L172'), 2],
      [L('L173'), 1],
      [L('L174'), 0],
    ],
    days: [[cBig, 1]],
    hud: true,
  },
  {
    from: cRush[0],
    to: L('L210'),
    claps: cRush,
    days: [
      [L('L177'), 2],
      [L('L184'), 3],
      [L('L188'), 4],
      [L('L189'), 5],
      [L('L190'), 6],
      [L('L191'), 10],
      [L('L192'), 20],
      [L('L197'), 40],
      [L('L201'), 50],
      [L('L204'), 60],
      [at('L207', 'vỗ tay'), 63],
    ],
    big: [L('L188'), L('L207')],
    hud: true,
  },
];
/** Day counter shown outside stops too (no clock). */
export const DAY_ONLY: readonly {
  from: number;
  to: number;
  days: readonly (readonly [number, number])[];
}[] = [
  { from: s('3.4').from, to: s('3.4').to, days: [[s('3.4').from + 20, 1]] },
  {
    from: L('L097'),
    to: s('5.5').to,
    days: Array.from({ length: 30 }, (_, i) => [L('L097') + Math.round(i * 2.2), i + 1] as const),
  },
  { from: L('L174'), to: L('L177'), days: [[L('L174'), 1]] },
];

export const freezeAt = (abs: number) => FREEZES.find((z) => abs >= z.from && abs < z.to) ?? null;
/** Freeze level 0…1 at an absolute frame (clap: ~10-frame transition; release: ~6-frame snap back). */
export const freezeK = (abs: number) => {
  for (const z of FREEZES) {
    if (abs >= z.from - 1 && abs < z.to + 8)
      return (
        interpolate(abs, [z.from, z.from + 10], [0, 1], clamp) *
        interpolate(abs, [z.to, z.to + 6], [1, 0], clamp)
      );
  }
  return 0;
};
export const clockSec = (z: Freeze, abs: number) => {
  if (z.claps) {
    const last = [...z.claps].reverse().find((c) => abs >= c) ?? z.from;
    const next = z.claps.find((c) => c > abs) ?? z.to;
    return interpolate(abs, [last, next], [30, Math.max(0, 30 - (next - last) / 4)], clamp);
  }
  const k = z.clock!;
  if (abs <= k[0][0]) return k[0][1];
  for (let i = 0; i + 1 < k.length; i++)
    if (abs <= k[i + 1][0]) return interpolate(abs, [k[i][0], k[i + 1][0]], [k[i][1], k[i + 1][1]]);
  return k[k.length - 1][1];
};
export const daysAt = (list: readonly (readonly [number, number])[], abs: number) => {
  let d = 0;
  let pop = -99;
  for (const [t, n] of list)
    if (abs >= t) {
      d = n;
      pop = t;
    }
  return { d, pop };
};
/** Every clap (to attach the clap + "whoosh" + "tick" sounds). */
export const ALL_CLAPS: readonly number[] = FREEZES.flatMap((z) => (z.claps ? z.claps : [z.from]));
