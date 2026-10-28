import { at, L, onLang, shot } from './time';

/**
 * BreathRing segments (ABSOLUTE frames, anchored to spoken words). keys = [frame, story seconds] – the ring counts story time,
 * after the last key it runs in real time. cap = breath capacity (the ring drains). Ticks/heartbeat come from the same data (audio.tsx).
 */
export type RingSeg = {
  readonly from: number;
  readonly to: number;
  readonly keys: readonly (readonly [number, number])[];
  readonly cap: number;
  readonly heart?: 'slow' | 'fast';
};

const s = (id: string) => shot(id);

const build = (): readonly RingSeg[] => [
  // Hook: breathe in → dissolve into an outline
  { from: s('1.1').from + 10, to: s('1.1').to, keys: [[s('1.1').from + 10, 0]], cap: 60 },
  // Living room: count 10 – 20 – 30 – 40 with the narration
  {
    from: at('L010', 'nín'),
    to: at('L026', 'thở'),
    keys: [
      [at('L010', 'nín'), 0],
      [L('L016'), 10],
      [L('L018'), 20],
      [L('L021'), 30],
      [L('L023'), 40],
    ],
    cap: 60,
  },
  // Rules: hold breath → vanish … breathe out → appear
  { from: at('L033', 'biến'), to: at('L036', 'thở'), keys: [[at('L033', 'biến'), 0]], cap: 60 },
  // Behind Huy
  { from: s('4.1').from + 4, to: L('L053'), keys: [[s('4.1').from + 4, 6]], cap: 60 },
  // Hide and seek
  { from: L('L072') + 8, to: L('L076'), keys: [[L('L072') + 8, 0]], cap: 60 },
  // Eating bánh bò on the full-moon day
  { from: at('L082', 'nín'), to: s('5.2').to, keys: [[at('L082', 'nín'), 0]], cap: 60 },
  // Teachers' room
  {
    from: s('5.4').from + 6,
    to: at('L095', 'thở'),
    keys: [
      [s('5.4').from + 6, 0],
      [L('L094'), 30],
      [at('L095', 'thở'), 52],
    ],
    cap: 60,
  },
  // Training: 0:40 → 1:00 → 1:30 → 2:00
  {
    from: L('L100'),
    to: s('5.7').to,
    keys: [
      [L('L100'), 0],
      [L('L100') + 12, 40],
      [L('L101'), 40],
      [L('L101') + 12, 60],
      [L('L102'), 60],
      [L('L102') + 12, 90],
      [L('L103'), 90],
      [L('L103') + 12, 120],
    ],
    cap: 180,
  },
  // Diving reflex: face in a basin of ice water
  {
    from: at('L108', 'úp'),
    to: s('5.8').to,
    keys: [[at('L108', 'úp'), 0]],
    cap: 180,
    heart: 'slow',
  },
  // Standing next to the ghost-hunting group
  {
    from: L('L123'),
    to: s('6.4').to,
    keys: [
      [L('L123'), 40],
      [L('L126'), 70],
    ],
    cap: 180,
  },
  // Break time, standing next to the friends
  {
    from: L('L132'),
    to: at('L136', 'thở'),
    keys: [
      [L('L132'), 20],
      [L('L134'), 45],
    ],
    cap: 180,
  },
  // Lunch alone · going home alone · three minutes on one breath
  {
    from: L('L141'),
    to: L('L145'),
    keys: [
      [L('L141'), 30],
      [L('L144'), 150],
      [L('L145'), 179],
    ],
    cap: 180,
  },
  { from: L('L146') + 6, to: s('7.6').to, keys: [[L('L146') + 6, 0]], cap: 180 },
  // Lantern-street climax: 1 min … 2 min (red, heartbeat) … 2.5 min … reappear
  {
    from: at('L179', 'nín'),
    to: L('L206'),
    keys: [
      [at('L179', 'nín'), 0],
      [L('L183'), 60],
      [L('L193'), 120],
      [L('L195'), 150],
      [L('L204'), 172],
    ],
    cap: 180,
    heart: 'fast',
  },
];
let cache: readonly RingSeg[] | null = null;
onLang(() => (cache = null));
/** Breath-ring segments of the current timeline (recomputed on language change). */
export const rings = () => (cache ??= build());

export const ringAt = (abs: number) => rings().find((r) => abs >= r.from && abs < r.to + 8) ?? null;
export const ringSecAt = (r: RingSeg, abs: number) => {
  const k = r.keys;
  if (abs <= k[0][0]) return k[0][1];
  for (let i = 0; i + 1 < k.length; i++)
    if (abs <= k[i + 1][0])
      return k[i][1] + ((abs - k[i][0]) / (k[i + 1][0] - k[i][0])) * (k[i + 1][1] - k[i][1]);
  return k[k.length - 1][1] + (abs - k[k.length - 1][0]) / 30;
};
