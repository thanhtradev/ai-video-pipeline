import React from 'react';
import type { SetLayers } from '../whatif/sets';
import {
  Altar,
  BanyanTree,
  Bed,
  Candle,
  CrowdSil,
  Desk,
  Door,
  GrilleWindow,
  Mirror,
  Moon,
  OilLampProp,
  PaperTalisman,
  PlasticChair,
  TileFloor,
  Wall,
  WellStone,
} from './props-horror';
import { C } from './theme';

/**
 * Night sets of the "Kinh dị" kit (D-106), with the whatif layer contract (far · bg · back · front ·
 * fg, one warm glow, floor at y≈1500). `kit/active/sets` is this file: every whatif set is
 * re-exported (the act grade darkens them), and these are the horror ones.
 */
export * from '../whatif/sets';

const FLOOR_Y = 1500;
const WORLD = { x: -1300, w: 3700 } as const;

/** Night sky with a few stars, no moon unless asked. */
const NightSky: React.FC<{ moon?: boolean; f: number }> = ({ moon, f }) => (
  <g>
    <rect x={WORLD.x} y={-800} width={WORLD.w} height={2300} fill={C.night} />
    {Array.from({ length: 24 }, (_, i) => (
      <circle
        key={i}
        cx={WORLD.x + ((i * 157) % WORLD.w)}
        cy={-600 + ((i * 97) % 900)}
        r={2 + (i % 3)}
        fill="#cfd4e4"
        opacity={0.35 + 0.3 * Math.abs(Math.sin(f / 50 + i))}
      />
    ))}
    {moon ? <Moon x={860} y={160} /> : null}
  </g>
);

/** Village lane at night: low houses, a bamboo hedge, Mùn's lamp is the only light. */
export const villageNight = (f: number, o: { moon?: boolean; crowd?: number } = {}): SetLayers => ({
  sky: C.night,
  far: (
    <g>
      <NightSky moon={o.moon ?? true} f={f} />
      {[
        [-900, 1000, 520],
        [-300, 960, 460],
        [300, 1020, 500],
        [900, 980, 540],
        [1500, 1010, 480],
      ].map(([x, y, w], i) => (
        <g key={i}>
          <path d={`M${x} ${y} L${x + w / 2} ${y - 160} L${x + w} ${y} Z`} fill="#1c1f2c" />
          <rect x={x + 20} y={y} width={w - 40} height={FLOOR_Y - y} fill="#232736" />
          <rect
            x={x + w / 2 - 50}
            y={y + 120}
            width={100}
            height={110}
            rx={6}
            fill={i === 2 ? '#5a4324' : '#161a26'}
          />
        </g>
      ))}
    </g>
  ),
  bg: (
    <g>
      <rect x={WORLD.x} y={FLOOR_Y - 60} width={WORLD.w} height={1200} fill="#1b1a22" />
      {Array.from({ length: 14 }, (_, i) => (
        <path
          key={i}
          d={`M${-1200 + i * 280} ${FLOOR_Y - 40} q10 -${220 + (i % 4) * 40} ${20 + Math.sin(f / 35 + i) * 8} -${420 + (i % 3) * 60}`}
          stroke="#2a2e3a"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {o.crowd ? <CrowdSil y={FLOOR_Y} x0={1200} x1={1800} n={o.crowd} seed="village" /> : null}
    </g>
  ),
  fg: <rect x={-260} y={-300} width={160} height={2600} fill="#111320" />,
  glow: { x: 520, y: 1180, r: 520, color: C.lampGlow, a: 0.45 },
});

/** Abandoned house: peeling wall, a dusty altar, a talisman on the door, one candle. */
export const abandonedHouse = (
  f: number,
  o: { doorOpen?: number; candle?: number; peel?: number } = {},
): SetLayers => ({
  sky: '#141828',
  far: (
    <g>
      <Wall y1={1380} top="#3b3d4a" bottom="#2a2c38" skirt="#20222c" />
      {[200, 760, 1180].map((x, i) => (
        <path
          key={i}
          d={`M${x} 300 q40 120 -20 260 q50 90 10 200`}
          stroke="#23252f"
          strokeWidth={6}
          fill="none"
        />
      ))}
      <GrilleWindow x={820} y={560} w={260} h={300} night />
      <Door x={180} y={1380} open={o.doorOpen ?? 0} color="#3a2e28" />
      <PaperTalisman x={300} y={900} peel={o.peel ?? 0.2} />
      <Altar x={1240} y={1380} s={0.85} cakes={0} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} color="#2b2a33" line="#00000030" />
      <PlasticChair x={620} y={1420} color="#4a4a52" />
      <Candle x={1240} y={1200} f={f} lit={o.candle ?? 1} />
    </g>
  ),
  fg: <rect x={-160} y={-300} width={140} height={2600} fill="#0f1220" />,
  glow: { x: 1240, y: 1100, r: 560, color: C.lampGlow, a: 0.4 },
});

/** Dormitory corridor at night: a row of doors, one at the end ajar, a dead fluorescent tube. */
export const dormCorridor = (
  f: number,
  o: { lastOpen?: number; lit?: number } = {},
): SetLayers => ({
  sky: '#141828',
  far: (
    <g>
      <Wall y1={1380} top="#343846" bottom="#262a36" skirt="#1c1f29" />
      {[-700, -300, 100, 500, 900, 1300].map((x, i) => (
        <Door
          key={i}
          x={x}
          y={1380}
          open={i === 5 ? (o.lastOpen ?? 0.3) : 0}
          color="#3b3330"
          w={170}
          h={360}
        />
      ))}
      <rect
        x={-800}
        y={180}
        width={2800}
        height={16}
        rx={8}
        fill={o.lit ? '#d8dcc8' : '#4a4e58'}
        opacity={o.lit ? 0.6 + 0.3 * Math.abs(Math.sin(f / 3)) : 1}
      />
    </g>
  ),
  bg: <TileFloor y0={1380} color="#2a2c36" line="#00000040" />,
  fg: <rect x={-200} y={-300} width={180} height={2600} fill="#0f1220" />,
  glow: { x: 520, y: 1180, r: 480, color: C.lampGlow, a: 0.4 },
});

/** Rice field under the moon: paddies, a dike path, a far hamlet; `will` draws wisps (ma trơi). */
export const riceFieldNight = (f: number, o: { will?: number } = {}): SetLayers => ({
  sky: C.night,
  far: (
    <g>
      <NightSky moon f={f} />
      <rect x={WORLD.x} y={900} width={WORLD.w} height={700} fill="#1a2030" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={WORLD.x} y={960 + i * 120} width={WORLD.w} height={6} fill="#232c40" />
      ))}
      <rect x={1500} y={820} width={400} height={90} fill="#161a26" />
    </g>
  ),
  bg: (
    <g>
      <rect x={WORLD.x} y={FLOOR_Y - 40} width={WORLD.w} height={1200} fill="#262a2e" />
      {Array.from({ length: o.will ?? 0 }, (_, i) => (
        <circle
          key={i}
          cx={-200 + i * 420 + Math.sin(f / 23 + i) * 30}
          cy={1180 + Math.cos(f / 31 + i * 2) * 40}
          r={14 + 6 * Math.abs(Math.sin(f / 7 + i))}
          fill="#9fe8c8"
          opacity={0.6}
        />
      ))}
    </g>
  ),
  fg: <path d={`M-300 2600 L-300 1300 q60 -40 120 0 L-180 2600 Z`} fill="#121620" />,
  glow: { x: 860, y: 160, r: 700, color: C.moon, a: 0.25 },
});

/** Banyan shrine: the old tree, a small shrine with incense, a stone well beside the lane. */
export const banyanShrine = (
  f: number,
  o: { bucket?: number; incense?: number } = {},
): SetLayers => ({
  sky: C.night,
  far: (
    <g>
      <NightSky moon f={f} />
      <BanyanTree x={520} y={FLOOR_Y - 20} f={f} />
    </g>
  ),
  bg: (
    <g>
      <rect x={WORLD.x} y={FLOOR_Y - 60} width={WORLD.w} height={1200} fill="#1b1a22" />
      <Altar x={880} y={1480} s={0.6} cakes={0} extraIncense={o.incense ?? 1} />
      <WellStone x={120} y={1480} s={0.9} bucket={o.bucket ?? 0} />
    </g>
  ),
  fg: <rect x={-260} y={-300} width={150} height={2600} fill="#0f1220" />,
  glow: { x: 880, y: 1300, r: 460, color: C.lampGlow, a: 0.4 },
});

/** Old hospital hall: long bench, a wheelchair silhouette, a mirror, one flickering tube. */
export const hospitalHall = (f: number, o: { flicker?: number } = {}): SetLayers => ({
  sky: '#141828',
  far: (
    <g>
      <Wall y1={1380} top="#3a4248" bottom="#2a3036" skirt="#20262b" />
      {[-500, 300, 1100].map((x, i) => (
        <Door key={i} x={x} y={1380} color="#4a5258" w={190} h={380} />
      ))}
      <Mirror x={760} y={1000} />
      <rect
        x={-600}
        y={160}
        width={2600}
        height={14}
        rx={7}
        fill="#d8e2dc"
        opacity={0.25 + (o.flicker ?? 0.5) * Math.abs(Math.sin(f / 2.3)) * 0.5}
      />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} color="#2c3238" line="#00000040" />
      <Desk x={-100} y={1420} color="#3f4a50" />
      <Bed x={1300} y={1430} blanket="#4a5560" />
      <OilLampProp x={560} y={1430} f={f} lit={0} />
    </g>
  ),
  fg: <rect x={-200} y={-300} width={180} height={2600} fill="#0f1220" />,
  glow: { x: 700, y: 160, r: 520, color: '#d8e2dc', a: 0.18 },
});
