import React from 'react';
import { random } from 'remotion';
import { Bed, Door, Motorbike, SoftShadow, TileFloor } from '../../kits/whatif/props';
import { alley, livingRoom, SetLayers } from '../../kits/whatif/sets';
import { FONT, shade } from '../../kits/whatif/theme';
import { dining } from '../../kits/whatif/sets-home';
import { TearCalendar, Wheelchair } from './kit';

/** EP5 sets (same world as EP1: floor y≈1450–1600, wide shot around x≈500). Each set has ONE warm light source. */

/** Tube house in the morning: living room + tear-off wall calendar + old wheelchair in the corner (an old object). */
export const home = (
  f: number,
  o: { tear?: number; day?: number; chair?: boolean } = {},
): SetLayers => {
  const b = livingRoom(f, { table: false });
  return {
    ...b,
    back: (
      <g>
        {b.back}
        <TearCalendar x={250} y={760} s={0.9} day={o.day ?? 18} tear={o.tear ?? 0} />
        {o.chair !== false && <Wheelchair x={-180} y={1440} s={0.85} />}
      </g>
    ),
  };
};
/** Evening meal tray (warm yellow light) + calendar + wheelchair in the corner. */
export const dinner = (f: number, o: { chair?: boolean } = {}): SetLayers => {
  const b = dining(f, { night: true });
  return {
    ...b,
    back: (
      <g>
        {b.back}
        <TearCalendar x={250} y={760} s={0.9} day={22} />
        {o.chair !== false && <Wheelchair x={-260} y={1440} s={0.85} />}
      </g>
    ),
  };
};

/** Alley night market: stalls, string bulbs, push carts. */
export const nightMarket = (f: number): SetLayers => {
  const a = alley(f);
  return {
    sky: '#1e1c2c',
    far: (
      <g>
        <rect x={-1300} y={-600} width={3700} height={2000} fill="#262438" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x={-1300 + i * 320}
            y={300 - (i % 3) * 60}
            width={290}
            height={1100}
            fill={['#34304a', '#2e2a42', '#3a3450'][i % 3]}
          />
        ))}
      </g>
    ),
    bg: (
      <g>
        <rect x={-1300} y={1250} width={3700} height={1300} fill="#3a3640" />
        <path d="M-1300 700 Q500 820 2400 700" stroke="#1a1820" strokeWidth={3} fill="none" />
        {Array.from({ length: 22 }, (_, i) => {
          const x = -1250 + i * 170;
          const k = (x + 1300) / 3700;
          return (
            <circle key={i} cx={x} cy={700 + 4 * k * (1 - k) * 120 + 20} r={14} fill="#ffd27a" />
          );
        })}
        {[-900, -300, 900, 1500].map((x, i) => (
          <g key={x} transform={`translate(${x},1300)`}>
            <path
              d="M-220 -380 L220 -380 L260 -300 L-260 -300 Z"
              fill={['#a4483c', '#4a6a8a', '#8a6a3a', '#6a7a4a'][i]}
            />
            <rect x={-200} y={-300} width={400} height={300} fill="#6a5a4a" />
            {Array.from({ length: 6 }, (_, k) => (
              <circle
                key={k}
                cx={-150 + k * 60}
                cy={-320}
                r={24}
                fill={['#e0a050', '#c9483a', '#8aa05a'][k % 3]}
              />
            ))}
          </g>
        ))}
      </g>
    ),
    fg: a.fg,
    glow: { x: 500, y: 700, r: 900, color: '#ffc070', a: 0.45 },
  };
};

/** Bus (standing still in the road). */
export const Bus: React.FC<{ x: number; y: number; s?: number; flip?: boolean }> = ({
  x,
  y,
  s = 1,
  flip,
}) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -s : s},${s})`}>
    <SoftShadow x={0} y={0} rx={700} a={0.35} />
    <rect x={-700} y={-560} width={1400} height={480} rx={50} fill="#4f8a6a" />
    <rect x={-700} y={-300} width={1400} height={40} fill="#e8d870" />
    {Array.from({ length: 6 }, (_, i) => (
      <rect
        key={i}
        x={-640 + i * 210}
        y={-520}
        width={180}
        height={190}
        rx={14}
        fill="#a8c4d0"
        opacity={0.8}
      />
    ))}
    <rect x={560} y={-520} width={110} height={440} rx={12} fill="#3a5a4a" />
    <text x={-300} y={-160} fontFamily={FONT} fontWeight={800} fontSize={64} fill="#f2ead0">
      SỐ 19
    </text>
    {[-460, 460].map((wx) => (
      <g key={wx}>
        <circle cx={wx} cy={-70} r={80} fill="#222026" />
        <circle cx={wx} cy={-70} r={34} fill="#77737a" />
      </g>
    ))}
  </g>
);
/** Main road at night: motorbikes + buses. */
export const mainRoad = (f: number, o: { buses?: boolean } = {}): SetLayers => ({
  sky: '#161a2a',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1900} fill="#1e2236" />
      {Array.from({ length: 20 }, (_, i) => (
        <g key={i}>
          <rect
            x={-1300 + i * 190}
            y={200 + (i % 4) * 60}
            width={170}
            height={1100}
            fill={['#2a2e46', '#262a40', '#30344e'][i % 3]}
          />
          {Array.from({ length: 8 }, (_, k) => (
            <rect
              key={k}
              x={-1280 + i * 190 + (k % 2) * 70}
              y={260 + (i % 4) * 60 + Math.floor(k / 2) * 110}
              width={50}
              height={60}
              fill="#ffc870"
              opacity={random(`mw${i}${k}`) > 0.5 ? 0.6 : 0.08}
            />
          ))}
        </g>
      ))}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1150} width={3700} height={1400} fill="#3a3a42" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect
          key={i}
          x={-1250 + i * 280}
          y={1380}
          width={150}
          height={12}
          fill="#e8e2d0"
          opacity={0.6}
        />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <Motorbike
          key={i}
          x={-1150 + i * 400}
          y={1250}
          s={0.55}
          f={f}
          color={['#5a6470', '#8a5a50', '#6a7a5a'][i % 3]}
        />
      ))}
      {o.buses !== false && <Bus x={-500} y={1300} s={0.7} />}
      {o.buses !== false && <Bus x={1500} y={1300} s={0.7} flip />}
    </g>
  ),
  glow: { x: 500, y: 300, r: 900, color: '#ffc070', a: 0.3 },
});
/** Bridge: uphill slope, railing, street lights. */
export const bridge = (f: number): SetLayers => ({
  sky: '#141828',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2200} fill="#1a1e30" />
      <rect x={-1300} y={1100} width={3700} height={700} fill="#20283e" />
      {Array.from({ length: 30 }, (_, i) => (
        <rect
          key={i}
          x={-1300 + i * 130}
          y={1120 + (i % 3) * 30}
          width={60}
          height={6}
          fill="#ffc870"
          opacity={0.35}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <path d="M-1300 1700 L2400 1100 L2400 2500 L-1300 2500 Z" fill="#4a4a52" />
      <path d="M-1300 1520 L2400 920" stroke="#8a8a94" strokeWidth={16} />
      {Array.from({ length: 24 }, (_, i) => {
        const x = -1250 + i * 160;
        const y = 1520 - ((x + 1300) / 3700) * 600;
        return <line key={i} x1={x} y1={y} x2={x} y2={y + 160} stroke="#7a7a84" strokeWidth={8} />;
      })}
      {[-600, 400, 1400].map((x) => {
        const y = 1520 - ((x + 1300) / 3700) * 600;
        return (
          <g key={x}>
            <line x1={x} y1={y} x2={x} y2={y - 520} stroke="#6a6a74" strokeWidth={14} />
            <circle cx={x + 40} cy={y - 520} r={26} fill="#ffe0a0" />
            <circle
              cx={x + 40}
              cy={y - 520}
              r={140}
              fill="#ffc870"
              opacity={0.18}
              style={{ filter: 'blur(20px)' }}
            />
          </g>
        );
      })}
    </g>
  ),
  glow: { x: 400, y: 900, r: 800, color: '#ffc870', a: 0.3 },
});
/** Hospital emergency entrance: glowing red "CẤP CỨU" sign. */
export const erGate = (f: number, o: { glow?: number; sign?: boolean } = {}): SetLayers => ({
  sky: '#161a2a',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2200} fill="#1e2236" />
      <rect x={-400} y={200} width={1800} height={1100} fill="#c8ccd0" />
      {Array.from({ length: 24 }, (_, i) => (
        <rect
          key={i}
          x={-360 + (i % 8) * 220}
          y={260 + Math.floor(i / 8) * 180}
          width={160}
          height={110}
          fill="#8aa0b8"
          opacity={0.8}
        />
      ))}
      {o.sign !== false && <ErSign glow={o.glow} />}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1300} width={3700} height={1300} fill="#4a4a52" />
      <rect x={250} y={960} width={500} height={340} fill="#a8c4d0" opacity={0.7} />
      <line x1={500} y1={960} x2={500} y2={1300} stroke="#6a7a84" strokeWidth={8} />
    </g>
  ),
  glow: { x: 500, y: 840, r: 700, color: '#ff8a6a', a: 0.35 },
});
/** Glowing red "CẤP CỨU" sign (can be drawn separately on a layer not colour-filtered while frozen). */
export const ErSign: React.FC<{ glow?: number }> = ({ glow = 1 }) => (
  <g>
    <rect
      x={180}
      y={740}
      width={640}
      height={200}
      rx={20}
      fill="#ff4a3a"
      opacity={0.35 * glow}
      style={{ filter: 'blur(30px)' }}
    />
    <rect x={200} y={760} width={600} height={160} rx={16} fill="#c4302a" />
    <text
      x={500}
      y={870}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={110}
      fill="#fff"
    >
      CẤP CỨU
    </text>
  </g>
);
/** Emergency corridor: pale green walls, ceiling lights, double ER doors, wall clock. */
export const erHall = (f: number, o: { doors?: number; time?: string } = {}): SetLayers => ({
  sky: '#2a3036',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2200} fill="#c6d4d4" />
      <rect x={-1300} y={1050} width={3700} height={400} fill="#a9bcbc" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={-1100 + i * 600} y={120} width={360} height={30} rx={10} fill="#fffbe8" />
      ))}
      <g transform="translate(1200,560)">
        <circle r={90} fill="#efe7d6" stroke="#4a5462" strokeWidth={14} />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-55}
          stroke="#333"
          strokeWidth={9}
          strokeLinecap="round"
          transform={`rotate(${(o.time ? Number(o.time.split(':')[1]) : 0) * 6})`}
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-38}
          stroke="#333"
          strokeWidth={12}
          strokeLinecap="round"
          transform="rotate(255)"
        />
      </g>
      <text x={-300} y={420} fontFamily={FONT} fontWeight={800} fontSize={60} fill="#3a6a6a">
        KHOA CẤP CỨU
      </text>
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1450} color="#b8c2c0" line="#00000018" />
      <g transform="translate(-300,1450)">
        <rect x={-260} y={-680} width={520} height={680} fill="#6a7a84" />
        {[-1, 1].map((sd) => (
          <rect
            key={sd}
            x={sd < 0 ? -250 + 0 : 0}
            y={-670}
            width={250 * (1 - (o.doors ?? 0))}
            height={670}
            fill="#a8c4d0"
            stroke="#5a6a74"
            strokeWidth={8}
            transform={sd > 0 ? `translate(${250 * (o.doors ?? 0)},0)` : undefined}
          />
        ))}
        <rect x={-120} y={-760} width={240} height={60} rx={10} fill="#c4302a" />
        <text
          x={0}
          y={-718}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={36}
          fill="#fff"
        >
          PHÒNG CẤP CỨU
        </text>
      </g>
    </g>
  ),
  glow: { x: 500, y: 200, r: 900, color: '#fff4d8', a: 0.35 },
});
/** Hospital room in the morning: bed, pillow, monitor, sunny window, plastic chair. */
export const ward = (f: number, o: { calendar?: number; tear?: number } = {}): SetLayers => ({
  sky: '#d8dcd4',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2100} fill="#dfe4dc" />
      <rect x={-1300} y={1100} width={3700} height={350} fill="#c8d0c4" />
      <rect
        x={760}
        y={260}
        width={460}
        height={540}
        rx={10}
        fill="#fff4d0"
        stroke="#a8b0a4"
        strokeWidth={16}
      />
      <line x1={990} y1={260} x2={990} y2={800} stroke="#a8b0a4" strokeWidth={10} />
      <circle cx={1100} cy={360} r={50} fill="#fffbe8" opacity={0.9} />
      {o.calendar !== undefined && (
        <TearCalendar x={-140} y={600} s={0.75} day={5} tear={o.tear ?? 0} />
      )}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1450} color="#c4cac0" line="#00000014" />
      <g transform="translate(-520,1300)">
        <rect x={-70} y={-360} width={140} height={360} rx={10} fill="#8a949c" />
        <rect x={-60} y={-340} width={120} height={90} rx={8} fill="#1f2a26" />
        <path
          d={`M-50 -295 l20 0 l8 -24 l10 40 l8 -16 l${54} 0`}
          stroke="#7af0a0"
          strokeWidth={4}
          fill="none"
          transform={`translate(${-((f * 3) % 40)},0)`}
        />
      </g>
    </g>
  ),
  back: <Bed x={300} y={1600} s={1} blanket="#a8bcd0" />,
  glow: { x: 990, y: 520, r: 900, color: '#fff0c8', a: 0.55 },
});
export { Door, shade };
