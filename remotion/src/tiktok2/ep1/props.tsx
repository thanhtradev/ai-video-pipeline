import React from 'react';
import { random } from 'remotion';
import { C, FONT, shade } from './theme';

/** Props used in the sets (world coordinates, muted colours, rounded, soft shadows). */
type G = { readonly x?: number; readonly y?: number; readonly s?: number; readonly f?: number };
const tr = (x = 0, y = 0, s = 1) => `translate(${x},${y}) scale(${s})`;

export const SoftShadow: React.FC<{
  x: number;
  y: number;
  rx: number;
  ry?: number;
  a?: number;
}> = ({ x, y, rx, ry = rx * 0.16, a = 0.25 }) => (
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#000" opacity={a} style={{ filter: 'blur(6px)' }} />
);

/** Perspective tile floor (vanishing point vx,vy). */
export const TileFloor: React.FC<{
  y0: number;
  y1?: number;
  color?: string;
  line?: string;
  vx?: number;
  vy?: number;
  pattern?: boolean;
}> = ({
  y0,
  y1 = 2400,
  color = C.floor,
  line = '#00000022',
  vx = 540,
  vy = 700,
  pattern = false,
}) => {
  const rows: number[] = [];
  for (let k = 0, y = y0; y < y1 && k < 20; k++) {
    rows.push(y);
    y += 40 + k * k * 9;
  }
  return (
    <g>
      <rect x={-1300} y={y0} width={3700} height={y1 - y0} fill={color} />
      {pattern &&
        rows.slice(0, -1).map((y, i) => {
          const h = rows[i + 1] - y;
          return (
            <rect
              key={`p${i}`}
              x={-1300}
              y={y}
              width={3700}
              height={h}
              fill={i % 2 ? '#ffffff' : '#000000'}
              opacity={0.035}
            />
          );
        })}
      {rows.map((y, i) => (
        <line key={i} x1={-1300} y1={y} x2={2400} y2={y} stroke={line} strokeWidth={2} />
      ))}
      {Array.from({ length: 23 }, (_, i) => {
        const bx = -1600 + i * 190;
        const t = (y1 - y0) / Math.max(1, y0 - vy);
        return (
          <line
            key={`v${i}`}
            x1={vx + (bx - vx) * 0.02}
            y1={y0}
            x2={vx + (bx - vx) * (1 + t * 0.1)}
            y2={y1}
            stroke={line}
            strokeWidth={2}
          />
        );
      })}
      <rect x={-1300} y={y0} width={3700} height={60} fill="#000" opacity={0.08} />
    </g>
  );
};

export const Wall: React.FC<{ y1: number; top: string; bottom: string; skirt?: string }> = ({
  y1,
  top,
  bottom,
  skirt,
}) => (
  <g>
    <defs>
      <linearGradient id={`wall${top}${bottom}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={top} />
        <stop offset="1" stopColor={bottom} />
      </linearGradient>
    </defs>
    <rect x={-1300} y={-600} width={3700} height={y1 + 600} fill={`url(#wall${top}${bottom})`} />
    {skirt && <rect x={-1300} y={y1 - 40} width={3700} height={40} fill={skirt} />}
  </g>
);

/** Decorative iron-grille window (Vietnamese townhouse) with afternoon sun. */
export const GrilleWindow: React.FC<
  G & { w?: number; h?: number; sky?: string; night?: boolean }
> = ({ x = 0, y = 0, w = 300, h = 420, sky = '#e9dcc0', night }) => (
  <g transform={tr(x, y)}>
    <rect x={-14} y={-14} width={w + 28} height={h + 28} rx={8} fill={shade(C.wood, -0.1)} />
    <rect width={w} height={h} fill={night ? '#3a4566' : sky} />
    {night && <circle cx={w * 0.7} cy={h * 0.3} r={34} fill="#efe6c8" opacity={0.85} />}
    {!night && <rect width={w} height={h} fill="url(#none)" />}
    <g stroke={night ? '#1f2233' : '#5a4a3e'} strokeWidth={6} fill="none" opacity={0.85}>
      {Array.from({ length: Math.floor(w / 50) + 1 }, (_, i) => (
        <line key={i} x1={i * 50} y1={0} x2={i * 50} y2={h} />
      ))}
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} />
      {Array.from({ length: Math.floor(w / 100) }, (_, i) => (
        <g key={`o${i}`}>
          <circle cx={50 + i * 100} cy={h / 4} r={22} />
          <circle cx={50 + i * 100} cy={(h * 3) / 4} r={22} />
        </g>
      ))}
    </g>
    <rect x={-30} y={-24} width={70} height={h + 60} rx={10} fill="#a89cb2" opacity={0.85} />
    <rect x={w - 40} y={-24} width={70} height={h + 60} rx={10} fill="#a89cb2" opacity={0.85} />
    <rect x={-20} y={h + 12} width={w + 40} height={18} rx={4} fill={shade(C.wood, 0.1)} />
  </g>
);

/** Spinning ceiling fan. */
export const CeilingFan: React.FC<G> = ({ x = 0, y = 0, s = 1, f = 0 }) => (
  <g transform={tr(x, y, s)}>
    <rect x={-5} y={-160} width={10} height={140} fill="#4e4652" />
    <ellipse cx={0} cy={-14} rx={46} ry={20} fill="#5e5662" />
    {[0, 1, 2].map((k) => {
      const a = ((f * 31 + k * 120) % 360) * (Math.PI / 180);
      const ex = Math.cos(a) * 250;
      const ey = Math.sin(a) * 34;
      return (
        <path
          key={k}
          d={`M0 -10 Q${ex * 0.5} ${ey * 0.5 - 18} ${ex} ${ey - 8} Q${ex * 0.55} ${ey * 0.5 + 8} 0 -4 Z`}
          fill="#6c6470"
          opacity={0.75}
        />
      );
    })}
  </g>
);

/** Tear-off wall calendar. */
export const Calendar: React.FC<G> = ({ x = 0, y = 0, s = 1 }) => (
  <g transform={tr(x, y, s)}>
    <rect x={-70} y={-110} width={140} height={60} rx={6} fill="#a8564a" />
    <rect x={-56} y={-50} width={112} height={120} rx={4} fill="#efe7d6" />
    <rect x={-40} y={-30} width={80} height={56} fill="#c25a48" opacity={0.85} rx={4} />
    <rect x={-40} y={36} width={80} height={10} fill="#8b8172" />
  </g>
);

export const Frame: React.FC<G & { w?: number; h?: number; tint?: string }> = ({
  x = 0,
  y = 0,
  w = 120,
  h = 150,
  tint = '#8f8574',
}) => (
  <g transform={tr(x, y)}>
    <rect x={-w / 2 - 10} y={-h / 2 - 10} width={w + 20} height={h + 20} rx={6} fill={C.woodDark} />
    <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={tint} />
    <circle cx={0} cy={-h * 0.1} r={w * 0.22} fill="#3a343c" />
    <path d={`M${-w * 0.35} ${h / 2} Q0 ${h * 0.05} ${w * 0.35} ${h / 2} Z`} fill="#3a343c" />
  </g>
);

export const WallClock: React.FC<G> = ({ x = 0, y = 0, s = 1, f = 0 }) => (
  <g transform={tr(x, y, s)}>
    <circle r={52} fill="#efe7d6" stroke={C.woodDark} strokeWidth={10} />
    <line
      x1={0}
      y1={0}
      x2={0}
      y2={-30}
      stroke="#333"
      strokeWidth={5}
      strokeLinecap="round"
      transform={`rotate(${f * 0.05})`}
    />
    <line x1={0} y1={0} x2={22} y2={0} stroke="#333" strokeWidth={6} strokeLinecap="round" />
    <line
      x1={0}
      y1={0}
      x2={0}
      y2={-40}
      stroke="#b2463a"
      strokeWidth={2}
      transform={`rotate(${f * 6})`}
    />
  </g>
);

/** Wooden table (dining / teacher's desk). */
export const Table: React.FC<G & { w?: number; h?: number; color?: string; cloth?: string }> = ({
  x = 0,
  y = 0,
  w = 520,
  h = 260,
  color = C.wood,
  cloth,
}) => (
  <g transform={tr(x, y)}>
    <SoftShadow x={0} y={h} rx={w * 0.55} a={0.3} />
    {[-1, 1].map((sd) => (
      <rect
        key={sd}
        x={sd * (w / 2 - 40) - 12}
        y={20}
        width={24}
        height={h - 20}
        rx={6}
        fill={shade(color, -0.25)}
      />
    ))}
    <rect
      x={-w / 2 + 50}
      y={h * 0.62}
      width={w - 100}
      height={14}
      rx={6}
      fill={shade(color, -0.3)}
    />
    <rect x={-w / 2} y={-8} width={w} height={36} rx={12} fill={color} />
    <rect x={-w / 2} y={-8} width={w} height={12} rx={6} fill={shade(color, 0.15)} />
    {cloth && (
      <path
        d={`M${-w / 2 + 20} -10 L${w / 2 - 20} -10 L${w / 2 - 6} 40 L${-w / 2 + 6} 40 Z`}
        fill={cloth}
        opacity={0.9}
      />
    )}
  </g>
);

/** Plastic chair (muted red/green) – Vietnamese street-eatery style. */
export const PlasticChair: React.FC<G & { color?: string; dx?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  color = '#b0605a',
  dx = 0,
}) => (
  <g transform={`${tr(x + dx, y, s)}`}>
    <SoftShadow x={0} y={0} rx={90} a={0.25} />
    <path
      d="M-70 -170 L70 -170 L80 0 L60 0 L50 -120 L-50 -120 L-60 0 L-80 0 Z"
      fill={shade(color, -0.12)}
    />
    <rect x={-78} y={-190} width={156} height={30} rx={12} fill={color} />
    <rect x={-70} y={-340} width={140} height={150} rx={22} fill={color} />
    <rect x={-50} y={-310} width={100} height={18} rx={9} fill={shade(color, -0.2)} />
    <rect x={-50} y={-270} width={100} height={18} rx={9} fill={shade(color, -0.2)} />
  </g>
);

export const Stool: React.FC<G & { color?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  color = '#5e7b8e',
}) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={70} />
    <path
      d="M-60 -150 L60 -150 L72 0 L50 0 L40 -110 L-40 -110 L-50 0 L-72 0 Z"
      fill={shade(color, -0.15)}
    />
    <rect x={-70} y={-168} width={140} height={28} rx={12} fill={color} />
  </g>
);

/** Two-door fridge; open 0…1 opens the lower door with a light spill. */
export const Fridge: React.FC<G & { open?: number }> = ({ x = 0, y = 0, s = 1, open = 0 }) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={120} a={0.3} />
    <rect x={-100} y={-560} width={200} height={560} rx={22} fill="#a9b6bd" />
    <rect x={-100} y={-560} width={200} height={190} rx={22} fill="#b6c2c8" />
    <rect x={-92} y={-360} width={184} height={4} fill="#7f8c94" />
    <rect x={70} y={-500} width={10} height={90} rx={5} fill="#7f8c94" />
    <rect x={70} y={-330} width={10} height={130} rx={5} fill="#7f8c94" />
    {open > 0 && (
      <g>
        <rect x={-92} y={-352} width={184} height={344} rx={10} fill="#fff7dc" />
        {[-260, -170, -90].map((yy) => (
          <rect key={yy} x={-84} y={yy} width={168} height={6} fill="#d8d2bd" />
        ))}
        <rect x={-70} y={-250} width={40} height={50} rx={6} fill="#b8c88a" />
        <rect x={-10} y={-246} width={60} height={46} rx={20} fill="#d9a46a" />
        <rect x={-60} y={-150} width={110} height={40} rx={8} fill="#d58f7c" />
        <path
          d={`M-92 -352 L${-92 - 170 * open} -330 L${-92 - 170 * open} -20 L-92 -8 Z`}
          fill="#c1ccd2"
        />
      </g>
    )}
  </g>
);

export const TvCabinet: React.FC<G & { f?: number }> = ({ x = 0, y = 0, s = 1 }) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={200} />
    <rect x={-200} y={-150} width={400} height={150} rx={12} fill={C.woodDark} />
    <rect x={-185} y={-130} width={180} height={110} rx={8} fill={shade(C.woodDark, 0.1)} />
    <rect x={5} y={-130} width={180} height={110} rx={8} fill={shade(C.woodDark, 0.1)} />
    <rect x={-140} y={-370} width={280} height={200} rx={16} fill="#3a3a42" />
    <rect x={-124} y={-356} width={248} height={170} rx={10} fill="#556070" />
    <rect x={-30} y={-170} width={60} height={20} fill="#2c2c33" />
  </g>
);

/** Potted plant (zamioculcas). */
export const Plant: React.FC<G & { tone?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  tone = '#6f7d55',
}) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={80} />
    <path d="M-60 -120 L60 -120 L48 0 L-48 0 Z" fill="#9a7b66" />
    {Array.from({ length: 9 }, (_, i) => {
      const a = -150 + i * 15 + Math.sin(f / 40 + i) * 2;
      return (
        <g key={i} transform={`translate(0,-120) rotate(${a + 90})`}>
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-200 - (i % 3) * 40}
            stroke={shade(tone, -0.2)}
            strokeWidth={6}
          />
          {[0.4, 0.65, 0.9].map((k) => (
            <ellipse
              key={k}
              cx={(i % 2 ? 1 : -1) * 22}
              cy={-(200 + (i % 3) * 40) * k}
              rx={24}
              ry={12}
              fill={i % 2 ? tone : shade(tone, 0.1)}
            />
          ))}
        </g>
      );
    })}
  </g>
);

/** Tết string lights; on(i) decides which bulbs are lit. */
export const StringLights: React.FC<{
  x0: number;
  x1: number;
  y: number;
  sag?: number;
  on: (i: number) => boolean;
  n?: number;
}> = ({ x0, x1, y, sag = 60, on, n = 16 }) => (
  <g>
    <path
      d={`M${x0} ${y} Q${(x0 + x1) / 2} ${y + sag * 2} ${x1} ${y}`}
      stroke="#3b3a2e"
      strokeWidth={3}
      fill="none"
    />
    {Array.from({ length: n }, (_, i) => {
      const k = (i + 0.5) / n;
      const px = x0 + (x1 - x0) * k;
      const py = y + sag * 4 * k * (1 - k);
      const col = ['#ff5a4a', '#ffd35a', '#6ad08a', '#5ab0ff'][i % 4];
      const lit = on(i);
      return (
        <g key={i}>
          {lit && (
            <circle
              cx={px}
              cy={py + 12}
              r={22}
              fill={col}
              opacity={0.35}
              style={{ filter: 'blur(6px)' }}
            />
          )}
          <ellipse cx={px} cy={py + 12} rx={7} ry={11} fill={lit ? col : shade(col, -0.5)} />
        </g>
      );
    })}
  </g>
);

/** Apricot-blossom branch in a vase. */
export const MaiVase: React.FC<G> = ({ x = 0, y = 0, s = 1 }) => (
  <g transform={tr(x, y, s)}>
    <path d="M-40 -150 Q-60 -60 -34 0 L34 0 Q60 -60 40 -150 Z" fill="#8d6f8a" />
    <g stroke="#5a4232" strokeWidth={7} fill="none" strokeLinecap="round">
      <path d="M0 -150 Q-30 -280 -120 -380" />
      <path d="M0 -150 Q40 -300 110 -420" />
      <path d="M-50 -260 Q-10 -330 -20 -420" />
    </g>
    {Array.from({ length: 22 }, (_, i) => (
      <circle
        key={i}
        cx={-120 + random(`mai${i}`) * 240}
        cy={-220 - random(`maiy${i}`) * 200}
        r={9}
        fill="#e3be52"
      />
    ))}
  </g>
);

/** Ancestral altar: wooden cabinet, incense bowl, altar lamp, five-fruit tray, plate of bánh bò (cakes = number left), sweet soup. */
export const Altar: React.FC<G & { cakes?: number; f?: number; extraIncense?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  cakes = 9,
  f = 0,
  extraIncense = 0,
}) => {
  const cakePos = [
    [-40, 0],
    [0, 0],
    [40, 0],
    [-20, -22],
    [20, -22],
    [-60, -6],
    [60, -6],
    [0, -42],
    [-40, -38],
  ].slice(0, cakes);
  return (
    <g transform={tr(x, y, s)}>
      {/* altar cabinet */}
      <rect x={-360} y={0} width={720} height={520} rx={10} fill="#6a3f34" />
      <rect x={-340} y={40} width={330} height={200} rx={8} fill="#5a352c" />
      <rect x={10} y={40} width={330} height={200} rx={8} fill="#5a352c" />
      <rect x={-380} y={-20} width={760} height={40} rx={8} fill="#7c4a3c" />
      <path d="M-380 -20 Q-400 -60 -360 -60 L360 -60 Q400 -60 380 -20 Z" fill="#8a5644" />
      {/* incense bowl + incense */}
      <g transform="translate(0,-60)">
        <path d="M-70 0 Q-80 -70 -50 -80 L50 -80 Q80 -70 70 0 Z" fill="#b89a5a" />
        <ellipse cx={0} cy={-80} rx={52} ry={12} fill="#8f7a52" />
        {Array.from({ length: 3 + extraIncense }, (_, i) => {
          const dx = (i - (2 + extraIncense) / 2) * 14;
          return (
            <g key={i}>
              <line x1={dx} y1={-80} x2={dx * 1.3} y2={-230} stroke="#a85a3a" strokeWidth={4} />
              <circle cx={dx * 1.3} cy={-232} r={4} fill="#ff8a4a" />
              <path
                d={`M${dx * 1.3} -236 C${dx * 1.3 + 20 * Math.sin(f / 20 + i)} -300 ${dx * 1.3 - 30 * Math.sin(f / 26 + i)} -360 ${dx * 1.3 + 25 * Math.sin(f / 18 + i)} -460`}
                stroke="#e8e2d8"
                strokeWidth={5}
                fill="none"
                opacity={0.35}
                style={{ filter: 'blur(3px)' }}
              />
            </g>
          );
        })}
      </g>
      {/* altar lamp */}
      {[-250, 250].map((dx) => (
        <g key={dx} transform={`translate(${dx},-60)`}>
          <rect x={-22} y={-120} width={44} height={120} rx={10} fill="#a8443a" />
          <ellipse cx={0} cy={-120} rx={26} ry={10} fill="#c45a48" />
          <circle
            cx={0}
            cy={-140}
            r={60}
            fill="#ffb070"
            opacity={0.25}
            style={{ filter: 'blur(12px)' }}
          />
          <ellipse cx={0} cy={-136} rx={8} ry={14} fill="#ffd37a" />
        </g>
      ))}
      {/* five-fruit tray */}
      <g transform="translate(-150,-60)">
        <ellipse cx={0} cy={0} rx={90} ry={16} fill="#b38a4e" />
        <circle cx={0} cy={-60} r={52} fill="#a9b56a" />
        <circle cx={-50} cy={-30} r={30} fill="#d9934a" />
        <circle cx={50} cy={-30} r={30} fill="#d9934a" />
        <path d="M-70 -50 Q-90 -120 -40 -110 Q-30 -70 -70 -50" fill="#d8c06a" />
        <circle cx={18} cy={-14} r={22} fill="#b4524a" />
      </g>
      {/* plate of bánh bò */}
      <g transform="translate(150,-60)">
        <ellipse cx={0} cy={0} rx={96} ry={18} fill="#e8e2d6" />
        <ellipse cx={0} cy={-4} rx={80} ry={12} fill="#d6cfc1" />
        {cakePos.map(([cx, cy], i) => (
          <g key={i} transform={`translate(${cx},${cy - 16})`}>
            <ellipse rx={26} ry={16} fill="#f2ead8" />
            <ellipse cy={-6} rx={22} ry={9} fill="#fbf6ea" />
            {[-8, 0, 8].map((k) => (
              <circle key={k} cx={k} cy={-4} r={2} fill="#d9cdb2" />
            ))}
          </g>
        ))}
      </g>
      {/* sweet soup */}
      {[300, 340].map((dx) => (
        <g key={dx} transform={`translate(${dx},-60)`}>
          <path d="M-22 0 Q-26 -26 -16 -30 L16 -30 Q26 -26 22 0 Z" fill="#e6dccb" />
          <ellipse cx={0} cy={-30} rx={17} ry={5} fill="#a98a5a" />
        </g>
      ))}
    </g>
  );
};

/** Lanterns: star lantern, carp lantern, spinning lantern, round silk lantern. */
export const StarLantern: React.FC<G & { color?: string; lit?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  color = '#e04a3a',
  lit = 1,
}) => (
  <g transform={`${tr(x, y, s)} rotate(${Math.sin(f / 22 + x) * 5})`}>
    <line x1={0} y1={-200} x2={0} y2={-52} stroke="#4a3a2a" strokeWidth={3} />
    {lit > 0 && (
      <circle r={110} fill="#ffb060" opacity={0.28 * lit} style={{ filter: 'blur(14px)' }} />
    )}
    <path
      d="M0 -55 L16 -18 L56 -16 L24 9 L36 50 L0 27 L-36 50 L-24 9 L-56 -16 L-16 -18 Z"
      fill={color}
      stroke="#ffd27a"
      strokeWidth={3}
    />
    <circle r={16} fill="#ffe7a0" opacity={0.6 * lit} />
    <path d="M-10 50 L-14 90 M10 50 L14 90" stroke="#e8c45a" strokeWidth={3} />
  </g>
);
export const CarpLantern: React.FC<G & { color?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  color = '#e0763a',
}) => (
  <g transform={`${tr(x, y, s)} rotate(${Math.sin(f / 26 + y) * 4})`}>
    <line x1={0} y1={-180} x2={0} y2={-48} stroke="#4a3a2a" strokeWidth={3} />
    <circle r={120} fill="#ffb060" opacity={0.22} style={{ filter: 'blur(16px)' }} />
    <path d="M-80 0 Q-40 -60 40 -40 Q80 -30 100 0 Q80 30 40 40 Q-40 60 -80 0 Z" fill={color} />
    <path d="M-80 0 L-130 -40 L-120 0 L-130 40 Z" fill={shade(color, 0.2)} />
    <circle cx={70} cy={-8} r={7} fill="#2a1a12" />
    {[-30, 0, 30].map((k) => (
      <path
        key={k}
        d={`M${k} -30 Q${k + 14} 0 ${k} 30`}
        stroke="#ffd27a"
        strokeWidth={3}
        fill="none"
        opacity={0.7}
      />
    ))}
  </g>
);
export const KeoQuan: React.FC<G> = ({ x = 0, y = 0, s = 1, f = 0 }) => (
  <g transform={tr(x, y, s)}>
    <line x1={0} y1={-200} x2={0} y2={-80} stroke="#4a3a2a" strokeWidth={3} />
    <circle r={120} fill="#ffc070" opacity={0.25} style={{ filter: 'blur(16px)' }} />
    <rect x={-70} y={-80} width={140} height={160} rx={14} fill="#f3d9a2" />
    <rect x={-78} y={-90} width={156} height={16} rx={6} fill="#b2463a" />
    <rect x={-78} y={74} width={156} height={16} rx={6} fill="#b2463a" />
    {/* spinning silhouettes */}
    <g opacity={0.55}>
      {[0, 1, 2].map((k) => {
        const px = (((f * 2 + k * 70) % 210) - 105) * 0.66;
        return (
          <g key={k} transform={`translate(${px},10)`}>
            <circle cx={0} cy={-26} r={12} fill="#5a3a2a" />
            <path d="M-10 -12 L10 -12 L14 26 L-14 26 Z" fill="#5a3a2a" />
            <line x1={-14} y1={-4} x2={-26} y2={-24} stroke="#5a3a2a" strokeWidth={5} />
          </g>
        );
      })}
    </g>
  </g>
);
export const SilkLantern: React.FC<G & { color?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  color = '#c9483a',
}) => (
  <g transform={`${tr(x, y, s)} rotate(${Math.sin(f / 30 + x * 0.01) * 4})`}>
    <line x1={0} y1={-120} x2={0} y2={-56} stroke="#4a3a2a" strokeWidth={3} />
    <circle r={80} fill="#ffb060" opacity={0.25} style={{ filter: 'blur(12px)' }} />
    <ellipse rx={48} ry={58} fill={color} />
    <rect x={-22} y={-64} width={44} height={12} rx={4} fill="#c9a24a" />
    <rect x={-22} y={52} width={44} height={12} rx={4} fill="#c9a24a" />
    <path d="M0 64 L0 100" stroke="#e8c45a" strokeWidth={4} />
  </g>
);

/** Lion-dance lion (head + cloth body). still = frozen. */
export const Lion: React.FC<G & { still?: boolean }> = ({ x = 0, y = 0, s = 1, f = 0, still }) => {
  const b = still ? 0 : Math.sin(f / 4) * 14;
  return (
    <g transform={tr(x, y, s)}>
      <path
        d={`M-40 -120 Q-200 ${-140 + b} -340 -80 L-330 -20 Q-200 -60 -40 -40 Z`}
        fill="#c8a24a"
      />
      {[-120, -200, -280].map((k) => (
        <path key={k} d={`M${k} -110 L${k - 20} -40`} stroke="#b2463a" strokeWidth={10} />
      ))}
      <g transform={`translate(0,${-170 + b}) rotate(${still ? 0 : Math.sin(f / 6) * 8})`}>
        {/* red–yellow fringe mane */}
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <ellipse
              key={i}
              cx={Math.cos(a) * 128}
              cy={Math.sin(a) * 118}
              rx={34}
              ry={22}
              fill={i % 2 ? '#c4473a' : '#e0b04a'}
              transform={`rotate(${(a * 180) / Math.PI} ${Math.cos(a) * 128} ${Math.sin(a) * 118})`}
            />
          );
        })}
        <path
          d="M-110 -60 Q-120 -120 -60 -130 L60 -130 Q120 -120 110 -60 L118 60 Q100 120 0 124 Q-100 120 -118 60 Z"
          fill="#e2b13e"
        />
        <path d="M-80 -130 Q0 -200 80 -130 Z" fill="#c4473a" />
        <path d="M-12 -150 L0 -200 L12 -150 Z" fill="#f2ead0" />
        <path
          d="M-90 -60 Q-40 -96 -10 -60 M10 -60 Q40 -96 90 -60"
          stroke="#2a1a12"
          strokeWidth={10}
          fill="none"
        />
        <ellipse cx={-46} cy={-30} rx={28} ry={still ? 30 : 24} fill="#fff" />
        <ellipse cx={46} cy={-30} rx={28} ry={still ? 30 : 24} fill="#fff" />
        <circle cx={-46} cy={-26} r={12} fill="#222" />
        <circle cx={46} cy={-26} r={12} fill="#222" />
        <ellipse cx={0} cy={18} rx={26} ry={18} fill="#c4473a" />
        <path d={`M-70 52 Q0 ${still ? 70 : 104} 70 52 Z`} fill="#7a1f1a" />
        <path d="M-56 54 L56 54" stroke="#fff" strokeWidth={8} />
        <path
          d="M-100 80 Q-60 150 0 160 Q60 150 100 80"
          stroke="#f2ead0"
          strokeWidth={18}
          fill="none"
        />
      </g>
      {[-60, -240].map((k) => (
        <g key={k}>
          <line x1={k} y1={-30} x2={k - 6} y2={60} stroke={C.ink} strokeWidth={14} />
          <line x1={k + 30} y1={-30} x2={k + 36} y2={60} stroke={C.ink} strokeWidth={14} />
        </g>
      ))}
    </g>
  );
};

export const Motorbike: React.FC<
  G & { flip?: boolean; f?: number; running?: boolean; color?: string }
> = ({ x = 0, y = 0, s = 1, flip, f = 0, running, color = '#5a6470' }) => (
  <g
    transform={`${tr(x, y, s)} scale(${flip ? -1 : 1},1) translate(0,${running ? Math.sin(f * 2.1) * 1.5 : 0})`}
  >
    <SoftShadow x={0} y={0} rx={200} a={0.3} />
    {[-140, 140].map((wx) => (
      <g key={wx}>
        <circle cx={wx} cy={-56} r={56} fill="#222026" />
        <circle cx={wx} cy={-56} r={26} fill="#77737a" />
      </g>
    ))}
    <path
      d="M-170 -110 Q-150 -190 -40 -180 L60 -180 Q120 -160 150 -110 L100 -80 L-130 -80 Z"
      fill={color}
    />
    <rect x={-120} y={-215} width={170} height={36} rx={18} fill="#2c2a30" />
    <path d="M110 -150 L150 -270" stroke="#3a3a40" strokeWidth={12} />
    <line
      x1={130}
      y1={-270}
      x2={190}
      y2={-280}
      stroke="#3a3a40"
      strokeWidth={10}
      strokeLinecap="round"
    />
    <circle cx={175} cy={-230} r={20} fill="#efe6c0" />
    {running && (
      <circle
        cx={-200}
        cy={-70}
        r={30 + Math.sin(f) * 6}
        fill="#d8d4cc"
        opacity={0.25}
        style={{ filter: 'blur(8px)' }}
      />
    )}
  </g>
);

/** Plastic basin + ice water. */
export const Basin: React.FC<G & { f?: number; splash?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  f = 0,
  splash = 0,
}) => (
  <g transform={tr(x, y, s)}>
    <path d="M-170 -100 L170 -100 L130 0 L-130 0 Z" fill="#b97a8a" />
    <ellipse cx={0} cy={-100} rx={170} ry={30} fill="#c98a98" />
    <ellipse cx={0} cy={-98} rx={150} ry={22} fill="#9cc0cc" />
    {[-70, -20, 40, 80].map((k, i) => (
      <rect
        key={k}
        x={k}
        y={-110 + Math.sin(f / 10 + i) * 2}
        width={30}
        height={22}
        rx={5}
        fill="#e6f2f5"
        opacity={0.9}
        transform={`rotate(${i * 20} ${k} -100)`}
      />
    ))}
    {splash > 0 &&
      Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI - Math.PI;
        const r = 120 * splash + 40;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * r}
            cy={-110 + Math.sin(a) * r * 0.8}
            r={10 * (1 - splash) + 3}
            fill="#cfe6ee"
            opacity={1 - splash}
          />
        );
      })}
  </g>
);

/** Stainless canteen tray with bread. */
export const Tray: React.FC<G & { bread?: boolean }> = ({ x = 0, y = 0, s = 1, bread = true }) => (
  <g transform={tr(x, y, s)}>
    <rect x={-110} y={-16} width={220} height={26} rx={10} fill="#b9bec4" />
    <rect x={-100} y={-24} width={200} height={14} rx={6} fill="#cfd4d9" />
    {bread && <path d="M-70 -24 Q-60 -64 0 -66 Q60 -64 70 -24 Z" fill="#d6a462" />}
    {bread &&
      [-30, 0, 30].map((k) => (
        <path key={k} d={`M${k - 10} -50 L${k + 10} -40`} stroke="#b8833f" strokeWidth={4} />
      ))}
  </g>
);

/** Schoolyard stone bench. */
export const StoneBench: React.FC<G> = ({ x = 0, y = 0, s = 1 }) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={260} />
    <rect x={-200} y={-120} width={50} height={120} rx={10} fill="#8f8a84" />
    <rect x={150} y={-120} width={50} height={120} rx={10} fill="#8f8a84" />
    <rect x={-250} y={-150} width={500} height={44} rx={14} fill="#a8a29a" />
    <rect x={-250} y={-150} width={500} height={14} rx={7} fill="#bdb7ae" />
  </g>
);

/** Wide-canopy Indian almond tree. */
export const BangTree: React.FC<G & { f?: number }> = ({ x = 0, y = 0, s = 1, f = 0 }) => (
  <g transform={tr(x, y, s)}>
    <path d="M-40 0 Q-30 -300 -10 -560 L30 -560 Q40 -300 50 0 Z" fill="#6e5a4a" />
    {[-560, -760, -940].map((ly, k) => (
      <g key={ly} transform={`translate(0,${ly}) rotate(${Math.sin(f / 50 + k) * 1.2})`}>
        <path d="M0 0 L-380 -40 M0 0 L380 -30" stroke="#6e5a4a" strokeWidth={22 - k * 5} />
        <ellipse
          cx={-180}
          cy={-70}
          rx={260 - k * 50}
          ry={90 - k * 10}
          fill={['#6d7a52', '#7c8a5c', '#8a9862'][k]}
        />
        <ellipse
          cx={190}
          cy={-60}
          rx={250 - k * 50}
          ry={85 - k * 10}
          fill={['#64714c', '#768458', '#86945e'][k]}
        />
      </g>
    ))}
  </g>
);

/** Classroom / wooden door; open 0…1. */
export const Door: React.FC<G & { open?: number; color?: string; w?: number; h?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  open = 0,
  color = '#6f7f8e',
  w = 200,
  h = 420,
}) => (
  <g transform={tr(x, y, s)}>
    <rect x={-w / 2 - 14} y={-h - 14} width={w + 28} height={h + 14} fill={shade(color, -0.35)} />
    <rect x={-w / 2} y={-h} width={w} height={h} fill="#2b2a30" />
    <path
      d={`M${-w / 2} ${-h} L${-w / 2 + w * (1 - open * 0.75)} ${-h + open * 20} L${-w / 2 + w * (1 - open * 0.75)} ${-open * 20} L${-w / 2} 0 Z`}
      fill={color}
    />
    <circle cx={-w / 2 + w * (1 - open * 0.75) - 20} cy={-h / 2} r={8} fill="#d6c79a" />
  </g>
);

/** Muted crowd: n people of varied sizes (simplified shapes – for the far layer). */
export const CrowdSil: React.FC<{
  y: number;
  x0: number;
  x1: number;
  n: number;
  seed: string;
  s?: number;
  f?: number;
  tone?: string;
  moveDir?: number;
  lookAway?: number;
}> = ({ y, x0, x1, n, seed, s = 1, f = 0, tone, moveDir = 0, lookAway = 0 }) => {
  const cols = ['#7d7486', '#7a8270', '#8a7f70', '#6f7884', '#8a7684', '#6a6f62', '#857a6a'];
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const r = random(`${seed}${i}`);
        const span = x1 - x0;
        const px =
          x0 + ((((r * span + f * moveDir * (0.6 + random(`${seed}v${i}`))) % span) + span) % span);
        const sc = s * (0.75 + random(`${seed}s${i}`) * 0.45);
        const col = tone ?? cols[Math.floor(random(`${seed}c${i}`) * cols.length)];
        const bob = Math.sin(f / 5 + i) * 4;
        const eyeDx = lookAway ? (random(`${seed}l${i}`) > 0.5 ? 1 : -1) * 30 * lookAway : 0;
        return (
          <g
            key={i}
            transform={`translate(${px},${y + (random(`${seed}y${i}`) - 0.5) * 30}) scale(${sc})`}
          >
            <path
              d="M-70 -330 Q-80 -350 -50 -356 L50 -356 Q80 -350 70 -330 L84 -150 L-84 -150 Z"
              fill={col}
            />
            <line x1={-24} y1={-150} x2={-26} y2={0} stroke={C.ink} strokeWidth={15} />
            <line x1={24} y1={-150} x2={26} y2={0} stroke={C.ink} strokeWidth={15} />
            <circle cx={0} cy={-468 + bob} r={128} fill="#16131a" />
            <path
              d={`M-90 ${-560 + bob} A128 128 0 0 1 20 ${-596 + bob}`}
              stroke={C.rim}
              strokeWidth={5}
              fill="none"
              opacity={0.6}
            />
            {lookAway < 1 && (
              <g fill="#f6f1e6" opacity={1 - lookAway * 0.0}>
                <ellipse cx={-36 + eyeDx} cy={-464 + bob} rx={18} ry={26} />
                <ellipse cx={36 + eyeDx} cy={-464 + bob} rx={18} ry={26} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

export const Blackboard: React.FC<G & { text?: string[] }> = ({
  x = 0,
  y = 0,
  s = 1,
  text = [],
}) => (
  <g transform={tr(x, y, s)}>
    <rect x={-420} y={-200} width={840} height={400} rx={10} fill="#6b5a46" />
    <rect x={-400} y={-182} width={800} height={364} fill="#3d5246" />
    {text.map((tx, i) => (
      <text
        key={i}
        x={-360}
        y={-110 + i * 80}
        fill="#e8e6dc"
        fontSize={52}
        fontFamily={FONT}
        opacity={0.85}
      >
        {tx}
      </text>
    ))}
    <rect x={-380} y={182} width={760} height={14} fill="#8a7a62" />
  </g>
);

export const Desk: React.FC<G & { color?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  color = '#9a7d5e',
}) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={170} />
    <rect x={-160} y={-230} width={320} height={34} rx={8} fill={color} />
    <rect x={-150} y={-196} width={300} height={70} fill={shade(color, -0.25)} />
    <rect x={-150} y={-200} width={20} height={200} fill={shade(color, -0.3)} />
    <rect x={130} y={-200} width={20} height={200} fill={shade(color, -0.3)} />
  </g>
);

/** Bed + blanket + pillow. */
export const Bed: React.FC<G & { blanket?: string }> = ({
  x = 0,
  y = 0,
  s = 1,
  blanket = '#7f8fb0',
}) => (
  <g transform={tr(x, y, s)}>
    <SoftShadow x={0} y={0} rx={460} />
    <rect x={-460} y={-420} width={60} height={420} rx={14} fill="#6b5446" />
    <rect x={-440} y={-200} width={900} height={110} rx={20} fill="#7a604e" />
    <rect x={-430} y={-250} width={880} height={70} rx={24} fill="#e3dccd" />
    <ellipse cx={-320} cy={-270} rx={100} ry={40} fill="#efe8da" />
  </g>
);

export const NightLamp: React.FC<G> = ({ x = 0, y = 0, s = 1 }) => (
  <g transform={tr(x, y, s)}>
    <circle
      cx={0}
      cy={-110}
      r={200}
      fill="#ffc470"
      opacity={0.3}
      style={{ filter: 'blur(30px)' }}
    />
    <rect x={-80} y={-60} width={160} height={60} rx={8} fill="#5a4636" />
    <rect x={-8} y={-110} width={16} height={60} fill="#3a2e26" />
    <path d="M-50 -110 L50 -110 L36 -170 L-36 -170 Z" fill="#ffd894" />
  </g>
);

export const Banner: React.FC<G & { text: string; w?: number; color?: string; fs?: number }> = ({
  x = 0,
  y = 0,
  s = 1,
  text,
  w = 600,
  color = '#a4483c',
  fs = 40,
}) => (
  <g transform={tr(x, y, s)}>
    <rect x={-w / 2} y={-40} width={w} height={80} rx={8} fill={color} />
    <text
      x={0}
      y={14}
      textAnchor="middle"
      fill="#f2e6c4"
      fontSize={fs}
      fontWeight={800}
      fontFamily={FONT}
    >
      {text}
    </text>
  </g>
);
