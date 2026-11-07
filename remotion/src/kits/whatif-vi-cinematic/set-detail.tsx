import React from 'react';
import { random } from 'remotion';

/** Small hand-drawn details for the cinematic sets (world coordinates). No text. */

const TILE_COLUMNS = 26;
const TILE_SPACING = 240;
const TILE_ROWS = 9;
const FLOOR_BOTTOM = 2000;

/** Floor tile joints in perspective, converging on a point above the floor. */
export const FloorTiles: React.FC<{
  readonly id: string;
  readonly y0: number;
  readonly vx: number;
  readonly color: string;
}> = ({ id, y0, vx, color }) => (
  <g stroke={color} strokeWidth={3} opacity={0.3}>
    <defs>
      <clipPath id={id}>
        <rect x={-1300} y={y0} width={3700} height={FLOOR_BOTTOM - y0} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id})`}>
      {Array.from({ length: TILE_COLUMNS }, (_, i) => {
        const x = vx + (i - TILE_COLUMNS / 2) * TILE_SPACING;
        return <line key={i} x1={vx + (x - vx) * 0.35} y1={y0} x2={x} y2={y0 + 320} />;
      })}
      {Array.from({ length: TILE_ROWS }, (_, i) => {
        const y = y0 + 12 + i * i * 7;
        return <line key={`row${i}`} x1={-1300} y1={y} x2={2400} y2={y} />;
      })}
    </g>
  </g>
);

/** A helmet on a wall hook above a low shoe rack, by the door of a Vietnamese home. */
export const HelmetAndShoes: React.FC<{ readonly x: number; readonly y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle cx={0} cy={-588} r={7} fill="#2c221d" />
    <path d="M-52 -530 A52 54 0 0 1 52 -530 Z" fill="#b5493d" />
    <rect x={-58} y={-534} width={116} height={12} rx={6} fill="#7f3128" />
    <path
      d="M-34 -522 Q-30 -486 0 -482 Q30 -486 34 -522"
      fill="none"
      stroke="#3a2e28"
      strokeWidth={4}
    />
    <rect x={-96} y={-130} width={192} height={10} fill="#5b4534" />
    <rect x={-96} y={-66} width={192} height={10} fill="#5b4534" />
    {[-92, 86].map((px) => (
      <rect key={px} x={px} y={-130} width={8} height={130} fill="#4c3929" />
    ))}
    {[-60, 0, 58].map((px, i) => (
      <g key={px} fill={['#55606a', '#8d6a56', '#c0b49c'][i]}>
        <ellipse cx={px} cy={-138} rx={26} ry={9} />
        <ellipse cx={px + 8} cy={-74} rx={24} ry={8} />
      </g>
    ))}
  </g>
);

const SMOKE_POINTS = 16;
const SMOKE_STRANDS = [
  { dx: -14, phase: 0, w: 18, a: 0.16 },
  { dx: 6, phase: 0.5, w: 26, a: 0.12 },
  { dx: 22, phase: 1, w: 14, a: 0.14 },
];
const SMOKE_RISE = 340;

/** Incense smoke spreading as it rises. Polylines, not animated dashes (D-088). */
export const RisingSmoke: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly f: number;
  readonly color: string;
}> = ({ x, y, f, color }) => (
  <g style={{ filter: 'blur(9px)' }} fill="none" stroke={color} strokeLinecap="round">
    {SMOKE_STRANDS.map((strand) => (
      <polyline
        key={strand.phase}
        strokeWidth={strand.w}
        opacity={strand.a}
        points={Array.from({ length: SMOKE_POINTS }, (_, i) => {
          const k = i / (SMOKE_POINTS - 1);
          const sway = Math.sin(k * 5 - f / 26 + strand.phase) * (4 + k * 30);
          return `${x + strand.dx * (1 + k) + sway},${y - k * SMOKE_RISE}`;
        }).join(' ')}
      />
    ))}
  </g>
);

const LEAF_COUNT = 90;

/** Leaf texture over a flat canopy shape: light from above, dark underneath. */
export const LeafClump: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly f: number;
}> = ({ id, x, y, rx, ry, f }) => (
  <g>
    {Array.from({ length: LEAF_COUNT }, (_, i) => {
      const angle = random(`${id}a${i}`) * Math.PI * 2;
      const radius = Math.sqrt(random(`${id}r${i}`));
      const ny = Math.sin(angle) * radius;
      const lit = (1 - ny) / 2;
      const tone = lit + (random(`${id}t${i}`) - 0.5) * 0.35;
      const fill = tone > 0.68 ? '#a9b36b' : tone > 0.42 ? '#7d8c52' : '#4d5b39';
      return (
        <ellipse
          key={i}
          cx={x + Math.cos(angle) * radius * rx + Math.sin(f / 34 + i) * 2.5}
          cy={y + ny * ry + Math.cos(f / 40 + i) * 1.5}
          rx={15 + random(`${id}w${i}`) * 20}
          ry={8 + random(`${id}h${i}`) * 9}
          fill={fill}
          opacity={0.72}
          transform={`rotate(${(random(`${id}o${i}`) - 0.5) * 70} ${x + Math.cos(angle) * radius * rx} ${y + ny * ry})`}
        />
      );
    })}
  </g>
);

/** Shaded side and bark lines for the schoolyard tree trunk. */
export const BarkShade: React.FC = () => (
  <g>
    <path
      d="M-104 1380 Q-93 1050 -71 764 L-46 764 Q-58 1050 -62 1380 Z"
      fill="#2f241c"
      opacity={0.5}
    />
    <g stroke="#2f241c" strokeWidth={4} opacity={0.42}>
      {Array.from({ length: 12 }, (_, i) => {
        const y = 820 + i * 46;
        const x = -68 + random(`bark${i}`) * 58;
        return <line key={i} x1={x} y1={y} x2={x + 4} y2={y + 26} />;
      })}
    </g>
  </g>
);

const WINDOW_COUNT = 9;

/** Sun glare moving slowly across the classroom window panes. */
export const WindowGlare: React.FC<{ readonly f: number }> = ({ f }) => (
  <g fill="#fff6d8">
    {[0, 1].flatMap((floor) =>
      Array.from({ length: WINDOW_COUNT }, (_, i) => {
        const x = -240 + i * 230;
        const y = 430 + floor * 480;
        const slide = Math.sin(f / 90 + i * 0.7) * 8;
        return (
          <polygon
            key={`${floor}-${i}`}
            points={`${x + 48 + slide},${y} ${x + 92 + slide},${y} ${x + 42 + slide},${y + 240} ${x - 2 + slide},${y + 240}`}
            opacity={0.1 + 0.26 * ((i + 1) / WINDOW_COUNT)}
          />
        );
      }),
    )}
  </g>
);

/** A row of potted shrubs along the building. */
export const PottedRow: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly n: number;
}> = ({ x, y, n }) => (
  <g>
    {Array.from({ length: n }, (_, i) => (
      <g key={i} transform={`translate(${x + i * 130} ${y})`}>
        <path d="M-30 -48 L30 -48 L22 0 L-22 0 Z" fill="#9a5a42" />
        {Array.from({ length: 9 }, (_, k) => (
          <ellipse
            key={k}
            cx={(random(`pot${i}x${k}`) - 0.5) * 72}
            cy={-74 - random(`pot${i}y${k}`) * 56}
            rx={22}
            ry={16}
            fill={k % 3 === 0 ? '#8a9a58' : '#5f6f43'}
          />
        ))}
      </g>
    ))}
  </g>
);

/** A railing close to the lens, for framing a yard shot. Pass it to the `fg` of `SetStage`. */
export const RailingFg: React.FC<{ readonly y: number }> = ({ y }) => (
  <g>
    <rect x={-1300} y={y} width={3800} height={46} rx={14} fill="#2c2a26" />
    <rect x={-1300} y={y + 150} width={3800} height={30} rx={10} fill="#2c2a26" />
    {Array.from({ length: 26 }, (_, i) => (
      <rect key={i} x={-1240 + i * 150} y={y + 30} width={24} height={640} fill="#26241f" />
    ))}
  </g>
);

export const STREET_HOUSES = [
  { dx: -0.06, top: 0.56, c: '#efdcb4', roof: '#d9a982' },
  { dx: 0.22, top: 0.42, c: '#e6d0a6', roof: '#cf9c78' },
  { dx: 0.52, top: 0.6, c: '#f2e0ba', roof: '#dcae88' },
  { dx: 0.76, top: 0.47, c: '#e2caa0', roof: '#cc9a76' },
];

/** Between the curtains of the living-room window: overexposed sky, hazy houses, wires, grille. */
export const StreetView: React.FC<{ x: number; y: number; w: number; h: number }> = ({
  x,
  y,
  w,
  h,
}) => (
  <g transform={`translate(${x} ${y})`}>
    <defs>
      <linearGradient id="cineStreetSky" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#fff0c8" />
      </linearGradient>
      <linearGradient id="cineStreetHaze" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0" stopColor="#fff6dc" stopOpacity={0.7} />
        <stop offset="1" stopColor="#fff6dc" stopOpacity={0.1} />
      </linearGradient>
    </defs>
    <rect width={w} height={h} fill="url(#cineStreetSky)" />
    {STREET_HOUSES.map((house) => {
      const left = house.dx * w;
      const width = w * 0.32;
      const top = house.top * h;
      return (
        <g key={house.dx}>
          <polygon
            points={`${left - 6},${top} ${left + width / 2},${top - h * 0.07} ${left + width + 6},${top}`}
            fill={house.roof}
          />
          <rect x={left} y={top} width={width} height={h - top} fill={house.c} />
          {[0.05, 0.2].map((row) => (
            <g key={row}>
              <rect
                x={left + width * 0.22}
                y={top + row * h}
                width={width * 0.56}
                height={h * 0.08}
                fill="#b89c78"
              />
              <rect
                x={left + width * 0.14}
                y={top + (row + 0.08) * h}
                width={width * 0.72}
                height={h * 0.012}
                fill="#7f6a50"
              />
            </g>
          ))}
        </g>
      );
    })}
    <rect width={w} height={h} fill="url(#cineStreetHaze)" />
    <path
      d={`M0 ${h * 0.14} Q${w * 0.5} ${h * 0.24} ${w} ${h * 0.11} M0 ${h * 0.2} Q${w * 0.5} ${h * 0.31} ${w} ${h * 0.17}`}
      stroke="#7a6a54"
      strokeWidth={4}
      fill="none"
    />
    <g stroke="#3f332c" strokeWidth={8} fill="none">
      {Array.from({ length: Math.ceil(w / 50) }, (_, i) => (
        <line key={i} x1={10 + i * 50} y1={0} x2={10 + i * 50} y2={h} />
      ))}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} />
      {[10, 110, 210].flatMap((cx) =>
        [h / 4, (h * 3) / 4].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={22} />),
      )}
    </g>
  </g>
);

/** Doorway to the back of the house, with a curtain. */
export const BackDoor: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <defs>
      <linearGradient id="cineDoorDark" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0" stopColor="#40342f" />
        <stop offset="1" stopColor="#1f1a1b" />
      </linearGradient>
    </defs>
    <rect x={-168} y={-880} width={336} height={880} fill="#5f4c3c" />
    <rect x={-140} y={-852} width={280} height={852} fill="url(#cineDoorDark)" />
    {Array.from({ length: 7 }, (_, i) => (
      <rect
        key={i}
        x={-140 + i * 40}
        y={-852}
        width={36}
        height={590 + (i % 3) * 18}
        rx={15}
        fill={i % 2 ? '#7f7490' : '#6e6480'}
      />
    ))}
    <rect x={-150} y={-864} width={300} height={16} fill="#3d3028" />
  </g>
);

/** Tall wooden cabinet with books and a radio on top. */
export const DisplayCabinet: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-190} y={-780} width={380} height={780} rx={8} fill="#6a4d38" />
    {[0, 1, 2].map((row) => (
      <g key={row} transform={`translate(0 ${-750 + row * 220})`}>
        <rect x={-164} y={0} width={328} height={196} fill="#35271f" />
        {Array.from({ length: 7 }, (_, i) => (
          <rect
            key={i}
            x={-150 + i * 44}
            y={row === 1 ? 104 : 40}
            width={32}
            height={row === 1 ? 92 : 156}
            rx={row === 1 ? 13 : 3}
            fill={['#c7b48d', '#8f7f73', '#a9604e', '#d8cdb2', '#6f7f78'][(i + row) % 5]}
          />
        ))}
      </g>
    ))}
    <rect x={-70} y={-850} width={140} height={70} rx={10} fill="#4e4340" />
    <circle cx={-30} cy={-815} r={22} fill="#2f2826" />
    <line x1={30} y1={-850} x2={70} y2={-920} stroke="#2f2826" strokeWidth={4} />
  </g>
);

/** Electricity meter and the cable running up the wall to it. */
export const WallMeter: React.FC = () => (
  <g>
    <path
      d="M-640 395 C-420 438 -300 395 -130 410 S-60 430 -40 500 L-40 1010"
      fill="none"
      stroke="#4c4038"
      strokeWidth={5}
    />
    <g transform="translate(-40 1010)">
      <rect x={-36} y={0} width={72} height={96} rx={6} fill="#dccfb6" />
      <rect x={-20} y={16} width={40} height={26} fill="#6f7a74" />
    </g>
  </g>
);

/** Afternoon sun through the grille, falling on the floor. */
export const FloorSun: React.FC = () => (
  <g>
    <polygon points="330,1400 660,1400 900,1590 500,1590" fill="#ffdc9a" opacity={0.62} />
    <g stroke="#5a4532" strokeWidth={11} opacity={0.42}>
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={365 + i * 55} y1={1400} x2={530 + i * 68} y2={1590} />
      ))}
      <line x1={420} y1={1480} x2={770} y2={1480} />
    </g>
  </g>
);

export const NIGHT_WINDOWS: readonly (readonly [number, number])[] = [
  [20, 0.68],
  [92, 0.53],
  [176, 0.72],
  [212, 0.58],
];

/** The street at night through the window, with a few lit rooms. */
export const NightView: React.FC<{ x: number; y: number; w: number; h: number }> = ({
  x,
  y,
  w,
  h,
}) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={w} height={h} fill="#26335e" />
    {STREET_HOUSES.map((house) => (
      <rect
        key={house.dx}
        x={house.dx * w}
        y={house.top * h}
        width={w * 0.32}
        height={h * (1 - house.top)}
        fill="#161d3b"
      />
    ))}
    {NIGHT_WINDOWS.map(([wx, wy]) => (
      <rect key={wx} x={wx} y={wy * h} width={34} height={40} fill="#ffc774" />
    ))}
    <g stroke="#10152c" strokeWidth={8} fill="none">
      {Array.from({ length: Math.ceil(w / 50) }, (_, i) => (
        <line key={i} x1={10 + i * 50} y1={0} x2={10 + i * 50} y2={h} />
      ))}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} />
    </g>
  </g>
);

/** Carved side panel for the altar room. */
export const CarvedPanel: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-190} y={-1130} width={380} height={1130} rx={8} fill="#3a2826" />
    {Array.from({ length: 4 }, (_, i) => (
      <g key={i} transform={`translate(0 ${-1060 + i * 260})`}>
        <rect x={-150} y={0} width={300} height={220} rx={10} fill="#4b3430" />
        <circle cx={0} cy={110} r={66} fill="none" stroke="#a07c46" strokeWidth={7} />
        <path
          d="M-46 110 Q0 50 46 110 Q0 170 -46 110 Z"
          fill="none"
          stroke="#a07c46"
          strokeWidth={5}
        />
      </g>
    ))}
  </g>
);

/** Hanging lantern with a warm heart. */
export const HangingLantern: React.FC<{ x: number; y: number; f: number; seed: number }> = ({
  x,
  y,
  f,
  seed,
}) => {
  const swing = Math.sin(f / 46 + seed) * 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing})`}>
      <line x1={0} y1={-500} x2={0} y2={0} stroke="#2a1d1d" strokeWidth={5} />
      <ellipse cx={0} cy={56} rx={62} ry={74} fill="#c2523a" />
      <ellipse cx={0} cy={56} rx={30} ry={70} fill="#f09a5c" opacity={0.8} />
      <rect x={-34} y={-20} width={68} height={16} rx={4} fill="#d6a84a" />
      <rect x={-34} y={118} width={68} height={16} rx={4} fill="#d6a84a" />
      <g stroke="#d6a84a" strokeWidth={3}>
        {[-14, 0, 14].map((dx) => (
          <line key={dx} x1={dx} y1={134} x2={dx} y2={190} />
        ))}
      </g>
    </g>
  );
};

/** Parked bicycles along the classroom block. */
export const BikeRow: React.FC<{ x: number; y: number; n: number }> = ({ x, y, n }) => (
  <g>
    {Array.from({ length: n }, (_, i) => (
      <g key={i} transform={`translate(${x + i * 120} ${y})`} fill="none" strokeWidth={6}>
        <circle cx={-34} cy={-34} r={32} stroke="#3d4145" />
        <circle cx={44} cy={-34} r={32} stroke="#3d4145" />
        <path
          d="M-34 -34 L0 -82 L34 -82 L44 -34 M0 -82 L8 -34 L-34 -34"
          stroke={['#a85a4e', '#58768a', '#7f8f55'][i % 3]}
        />
        <path d="M-10 -92 L12 -92 M34 -82 L30 -104 L46 -108" stroke="#3d4145" />
      </g>
    ))}
  </g>
);

/** Shadow of the tree on the yard, with patches of sun moving through it. */
export const TreeShade: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <defs>
      <radialGradient id="cineSyShade">
        <stop offset="0.45" stopColor="#3a3024" stopOpacity={0.62} />
        <stop offset="1" stopColor="#3a3024" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="cineSySpot">
        <stop offset="0.3" stopColor="#ffeab0" stopOpacity={1} />
        <stop offset="1" stopColor="#ffeab0" stopOpacity={0} />
      </radialGradient>
    </defs>
    <ellipse cx={-90} cy={1470} rx={760} ry={170} fill="url(#cineSyShade)" />
    {Array.from({ length: 26 }, (_, i) => {
      const k = random(`ld${i}`);
      return (
        <ellipse
          key={i}
          cx={-620 + random(`ldx${i}`) * 1080 + Math.sin(f / 42 + i) * 10}
          cy={1385 + random(`ldy${i}`) * 170}
          rx={20 + k * 42}
          ry={6 + k * 11}
          fill="url(#cineSySpot)"
          opacity={0.4 + 0.3 * random(`ldo${i}`) + 0.1 * Math.sin(f / 30 + i)}
        />
      );
    })}
  </g>
);

const TREE_REFERENCE = { x: -60, y: 1380, s: 1.1 };

/** Leaf texture and a shaded trunk for a `BangTree` drawn at this position and scale. */
export const TreeLeaves: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly s: number;
  readonly f: number;
}> = ({ id, x, y, s, f }) => {
  const k = s / TREE_REFERENCE.s;
  const at = (px: number, py: number) => ({
    x: x + (px - TREE_REFERENCE.x) * k,
    y: y + (py - TREE_REFERENCE.y) * k,
  });
  const clumps = [
    { ...at(-258, 687), rx: 286 * k, ry: 99 * k },
    { ...at(149, 698), rx: 275 * k, ry: 94 * k },
    { ...at(-258, 467), rx: 231 * k, ry: 88 * k },
    { ...at(149, 478), rx: 220 * k, ry: 82 * k },
    { ...at(-258, 269), rx: 176 * k, ry: 77 * k },
    { ...at(149, 280), rx: 165 * k, ry: 71 * k },
  ];
  return (
    <g>
      <g
        transform={`translate(${x} ${y}) scale(${k}) translate(${-TREE_REFERENCE.x} ${-TREE_REFERENCE.y})`}
      >
        <BarkShade />
      </g>
      {clumps.map((clump, i) => (
        <LeafClump key={i} id={`${id}${i}`} {...clump} f={f} />
      ))}
    </g>
  );
};
