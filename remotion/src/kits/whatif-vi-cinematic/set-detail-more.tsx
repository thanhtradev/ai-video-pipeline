import React from 'react';
import { random } from 'remotion';

/** More hand-drawn details for the wide frame of the cinematic sets (world coordinates). No text. */

/** A window with a bright view, gradient glass and a simple frame. */
export const SideWindow: React.FC<{
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly sky?: string;
}> = ({ id, x, y, w, h, sky = '#fff6dc' }) => (
  <g transform={`translate(${x} ${y})`}>
    <defs>
      <linearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor={sky} />
      </linearGradient>
    </defs>
    <rect x={-16} y={-16} width={w + 32} height={h + 32} rx={6} fill="#7c6248" />
    <rect width={w} height={h} fill={`url(#${id})`} />
    <g stroke="#5f4b38" strokeWidth={9}>
      <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
      <line x1={0} y1={h * 0.42} x2={w} y2={h * 0.42} />
    </g>
    <rect x={-26} y={h + 12} width={w + 52} height={16} rx={4} fill="#8f7355" />
  </g>
);

/** A framed picture or chart, with no readable text. */
export const Poster: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly c: readonly [string, string];
}> = ({ x, y, w, h, c }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-8} y={-8} width={w + 16} height={h + 16} rx={4} fill="#5f4a38" />
    <rect width={w} height={h} fill={c[0]} />
    <rect x={w * 0.12} y={h * 0.1} width={w * 0.76} height={h * 0.34} fill={c[1]} opacity={0.75} />
    {[0.54, 0.65, 0.76, 0.87].map((row) => (
      <rect
        key={row}
        x={w * 0.12}
        y={h * row}
        width={w * (row > 0.8 ? 0.46 : 0.76)}
        height={h * 0.035}
        fill={c[1]}
        opacity={0.4}
      />
    ))}
  </g>
);

const BOOK_TONES = ['#c7b48d', '#8f7f73', '#a9604e', '#d8cdb2', '#6f7f78', '#7a6a8a'];

/** A wall shelf of books and boxes. */
export const WallShelf: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly tone?: string;
}> = ({ x, y, w, tone }) => (
  <g transform={`translate(${x} ${y})`}>
    {Array.from({ length: Math.floor(w / 34) }, (_, i) => {
      const height = 70 + random(`shelf${x}${i}`) * 50;
      return (
        <rect
          key={i}
          x={i * 34}
          y={-height}
          width={27}
          height={height}
          rx={3}
          fill={tone ?? BOOK_TONES[i % BOOK_TONES.length]}
        />
      );
    })}
    <rect x={-14} y={0} width={w + 20} height={14} rx={3} fill={tone ? '#241e2c' : '#5b4534'} />
  </g>
);

/** A metal filing cabinet. */
export const FilingCabinet: React.FC<{ readonly x: number; readonly y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-110} y={-500} width={220} height={500} rx={6} fill="#7f8a84" />
    {[0, 1, 2, 3].map((row) => (
      <g key={row} transform={`translate(0 ${-486 + row * 121})`}>
        <rect x={-96} y={0} width={192} height={108} rx={4} fill="#919c96" />
        <rect x={-34} y={46} width={68} height={12} rx={6} fill="#4f5853" />
      </g>
    ))}
    <rect x={-84} y={-560} width={72} height={60} rx={4} fill="#b4a182" />
    <rect x={-2} y={-540} width={84} height={40} rx={4} fill="#8a6f58" />
  </g>
);

/** A water cooler on its stand. */
export const WaterCooler: React.FC<{ readonly x: number; readonly y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-60} y={-290} width={120} height={290} rx={8} fill="#d6d3c8" />
    <rect x={-44} y={-210} width={88} height={70} rx={4} fill="#a7a59c" />
    <rect x={-16} y={-188} width={10} height={24} fill="#4f6f96" />
    <rect x={8} y={-188} width={10} height={24} fill="#a44a3d" />
    <path d="M-44 -290 L-40 -420 Q0 -448 40 -420 L44 -290 Z" fill="#a6cde0" opacity={0.85} />
    <ellipse cx={-10} cy={-380} rx={8} ry={34} fill="#eaf6fb" opacity={0.55} />
  </g>
);

/** A stack of plastic stools. */
export const StackedChairs: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly color: string;
}> = ({ x, y, color }) => (
  <g transform={`translate(${x} ${y})`} fill={color}>
    <rect x={-36} y={-70} width={8} height={70} />
    <rect x={28} y={-70} width={8} height={70} />
    {Array.from({ length: 6 }, (_, i) => (
      <rect
        key={i}
        x={-44}
        y={-82 - i * 19}
        width={88}
        height={13}
        rx={5}
        opacity={0.72 + i * 0.05}
      />
    ))}
  </g>
);

/** A bare bulb on its cord, with a soft glow. */
export const CeilingBulb: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly f: number;
}> = ({ x, y, f }) => {
  const swing = Math.sin(f / 52) * 1.4;
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing})`}>
      <line x1={0} y1={-200} x2={0} y2={0} stroke="#3a312c" strokeWidth={4} />
      <rect x={-8} y={-2} width={16} height={18} fill="#3a312c" />
      <circle cx={0} cy={32} r={20} fill="#fff4cf" />
    </g>
  );
};

/** A lamp hanging from the ceiling, with a metal shade. */
export const PendantLamp: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly f: number;
  readonly color?: string;
}> = ({ x, y, f, color = '#7a5c44' }) => {
  const swing = Math.sin(f / 60) * 1;
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing})`}>
      <line x1={0} y1={-300} x2={0} y2={-40} stroke="#2e2622" strokeWidth={5} />
      <path d="M-22 -44 L22 -44 L92 26 L-92 26 Z" fill={color} />
      <ellipse cx={0} cy={26} rx={92} ry={13} fill="#fff0c4" />
      <circle cx={0} cy={36} r={22} fill="#fff8df" />
    </g>
  );
};

/** A towel or cloth hanging from a rail. */
export const HangingCloth: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly color: string;
}> = ({ x, y, color }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-44 0 L44 0 L52 240 Q0 256 -52 240 Z" fill={color} />
    <path d="M-16 0 L-20 244" stroke="#00000022" strokeWidth={8} />
  </g>
);

/** A tall wardrobe. */
export const TallWardrobe: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly color: string;
}> = ({ x, y, color }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-170} y={-860} width={340} height={860} rx={8} fill={color} />
    <line x1={0} y1={-850} x2={0} y2={-10} stroke="#0000004d" strokeWidth={6} />
    <rect x={-26} y={-470} width={8} height={70} rx={4} fill="#00000066" />
    <rect x={18} y={-470} width={8} height={70} rx={4} fill="#00000066" />
  </g>
);

const CLOTHES = ['#d7ceb9', '#a95c4f', '#6f8a9f', '#c69f58', '#8a7a9f', '#e6dfd0'];

/** A washing line with clothes moving in the breeze. */
export const Laundry: React.FC<{
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
  readonly f: number;
}> = ({ x0, x1, y, f }) => {
  const count = Math.floor((x1 - x0) / 92);
  return (
    <g>
      <path
        d={`M${x0} ${y} Q${(x0 + x1) / 2} ${y + 34} ${x1} ${y}`}
        fill="none"
        stroke="#4c4038"
        strokeWidth={4}
      />
      {Array.from({ length: count }, (_, i) => {
        const k = (i + 0.5) / count;
        const px = x0 + (x1 - x0) * k;
        const py = y + 34 * 4 * k * (1 - k) * 0.5;
        const skew = Math.sin(f / 26 + i) * 4;
        return (
          <path
            key={i}
            d={`M${px - 30} ${py} L${px + 30} ${py} L${px + 36 + skew} ${py + 96} L${px - 26 + skew} ${py + 96} Z`}
            fill={CLOTHES[i % CLOTHES.length]}
          />
        );
      })}
    </g>
  );
};

/** A shop at street level: awning, dark interior, shutter. No sign text. */
export const ShopFront: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly c: string;
}> = ({ x, y, w, c }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-w / 2} y={-340} width={w} height={340} fill="#3f352f" />
    {Array.from({ length: 9 }, (_, i) => (
      <line
        key={i}
        x1={-w / 2}
        x2={w / 2}
        y1={-250 + i * 28}
        y2={-250 + i * 28}
        stroke="#574a42"
        strokeWidth={4}
      />
    ))}
    <rect x={-w / 2 + 34} y={-210} width={w * 0.34} height={210} fill="#ffcf8a" opacity={0.42} />
    <path
      d={`M${-w / 2 - 22} -292 L${w / 2 + 22} -292 L${w / 2} -372 L${-w / 2} -372 Z`}
      fill={c}
    />
    {Array.from({ length: Math.floor(w / 60) }, (_, i) => (
      <path
        key={i}
        d={`M${-w / 2 + i * 60} -372 L${-w / 2 + 30 + i * 60} -372 L${-w / 2 + 22 + i * 60} -292 L${-w / 2 - 6 + i * 60} -292 Z`}
        fill="#f0e6d2"
        opacity={0.55}
      />
    ))}
  </g>
);

/** Two rows of school desks close to the lens. Pass as `fg`, which blurs them. */
export const DeskRowFg: React.FC<{ readonly y: number }> = ({ y }) => (
  <g fill="#5f4a38">
    {[-520, -80, 1080, 1520].map((x) => (
      <g key={x}>
        <rect x={x - 180} y={y} width={360} height={36} rx={8} />
        <rect x={x - 150} y={y + 36} width={22} height={300} />
        <rect x={x + 128} y={y + 36} width={22} height={300} />
      </g>
    ))}
  </g>
);

/** A wooden utility pole with wires running off both sides. */
export const UtilityPole: React.FC<{ readonly x: number; readonly y: number }> = ({ x, y }) => (
  <g>
    <rect x={x - 13} y={y - 1000} width={26} height={1000} fill="#5a4a3e" />
    <rect x={x - 90} y={y - 940} width={180} height={14} fill="#4a3c32" />
    <g fill="none" stroke="#3f352d" strokeWidth={4}>
      <path d={`M-800 ${y - 860} Q${(x - 800) / 2} ${y - 760} ${x - 86} ${y - 930}`} />
      <path d={`M${x + 86} ${y - 930} Q${(x + 1800) / 2} ${y - 790} 1800 ${y - 880}`} />
      <path d={`M-800 ${y - 800} Q${(x - 800) / 2} ${y - 700} ${x - 40} ${y - 925}`} />
      <path d={`M${x + 40} ${y - 925} Q${(x + 1800) / 2} ${y - 730} 1800 ${y - 810}`} />
    </g>
  </g>
);

/** A waiting bench with a suitcase and a bag on it. */
export const BenchWithBags: React.FC<{ readonly x: number; readonly y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-190} y={-98} width={380} height={18} rx={6} fill="#5f6f7a" />
    <rect x={-190} y={-170} width={380} height={14} rx={6} fill="#5f6f7a" />
    <rect x={-170} y={-170} width={12} height={170} fill="#39434a" />
    <rect x={158} y={-170} width={12} height={170} fill="#39434a" />
    <rect x={-120} y={-196} width={100} height={98} rx={12} fill="#a85a4e" />
    <rect
      x={-92}
      y={-214}
      width={44}
      height={22}
      rx={8}
      fill="none"
      stroke="#6d3a33"
      strokeWidth={7}
    />
    <rect x={208} y={-150} width={86} height={150} rx={12} fill="#55697a" />
    <rect x={240} y={-186} width={20} height={36} fill="#39434a" />
  </g>
);

/** Soft banks of cloud. */
export const Clouds: React.FC<{
  readonly y: number;
  readonly f: number;
  readonly color: string;
}> = ({ y, f, color }) => (
  <g fill={color} style={{ filter: 'blur(24px)' }}>
    {Array.from({ length: 12 }, (_, i) => (
      <ellipse
        key={i}
        cx={-700 + i * 220 + random(`cloud${i}x`) * 80 + f * 0.05}
        cy={y + random(`cloud${i}y`) * 140}
        rx={170 + random(`cloud${i}r`) * 150}
        ry={40 + random(`cloud${i}s`) * 34}
        opacity={0.42 + random(`cloud${i}o`) * 0.34}
      />
    ))}
  </g>
);

const SHIMMER_COUNT = 90;

/** Light moving on still water. */
export const WaterShimmer: React.FC<{
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly f: number;
  readonly color: string;
}> = ({ x0, x1, y0, y1, f, color }) => (
  <g fill={color}>
    {Array.from({ length: SHIMMER_COUNT }, (_, i) => {
      const depth = random(`wtr${i}d`);
      const width = 20 + depth * 74;
      return (
        <rect
          key={i}
          x={x0 + random(`wtr${i}x`) * (x1 - x0) + Math.sin(f / 30 + i) * 14}
          y={y0 + depth * (y1 - y0)}
          width={width}
          height={2 + depth * 4}
          rx={2}
          opacity={0.1 + 0.28 * Math.abs(Math.sin(f / 22 + i * 1.7))}
        />
      );
    })}
  </g>
);

/** A weeping tree close to the lens, with moving strands. Pass as `fg`. */
export const WillowFg: React.FC<{ readonly x: number; readonly f: number }> = ({ x, f }) => (
  <g fill="none" stroke="#4d5f3d" strokeLinecap="round">
    <path d={`M${x + 220} 120 Q${x + 60} 240 ${x - 240} 300`} stroke="#3a3128" strokeWidth={26} />
    {Array.from({ length: 16 }, (_, i) => {
      const start = x - 220 + i * 28;
      const length = 420 + random(`wil${i}`) * 520;
      const sway = Math.sin(f / 34 + i * 0.7) * (14 + i);
      return (
        <path
          key={i}
          d={`M${start} ${250 + i * 2} Q${start - 16 + sway / 2} ${250 + length / 2} ${start + sway} ${250 + length}`}
          strokeWidth={12}
          stroke={i % 3 === 0 ? '#71814f' : '#4d5f3d'}
        />
      );
    })}
  </g>
);
