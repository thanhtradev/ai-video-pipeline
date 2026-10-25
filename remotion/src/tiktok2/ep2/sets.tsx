import React from 'react';
import { random } from 'remotion';
import {
  Bed,
  Door,
  Frame,
  GrilleWindow,
  Motorbike,
  PlasticChair,
  Plant,
  SoftShadow,
  Table,
  TileFloor,
  Wall,
  WallClock,
} from '../ep1/props';
import { alley, livingRoom, SetLayers } from '../ep1/sets';
import { C, FONT, shade } from '../ep1/theme';

/** EP2 sets (same world as EP1: floor y≈1450–1520, wide shot around x≈500). Each set has ONE warm light source. */

/** Alarm clock (shakes while ringing). */
export const AlarmClock: React.FC<{
  x: number;
  y: number;
  s?: number;
  f: number;
  ring?: boolean;
  time?: string;
}> = ({ x, y, s = 1, f, ring, time = '6:00' }) => {
  const j = ring ? Math.sin(f * 2.6) * 6 : 0;
  return (
    <g
      transform={`translate(${x + j},${y}) scale(${s}) rotate(${ring ? Math.sin(f * 1.9) * 4 : 0})`}
    >
      <SoftShadow x={0} y={4} rx={80} />
      <rect x={-80} y={-110} width={160} height={110} rx={26} fill="#c7614f" />
      <rect x={-62} y={-92} width={124} height={64} rx={10} fill="#1f2a26" />
      <text
        x={0}
        y={-45}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={44}
        fill="#9cf0a8"
      >
        {time}
      </text>
      {[-50, 50].map((dx) => (
        <circle key={dx} cx={dx} cy={-124} r={22} fill="#d9d2c2" />
      ))}
      {ring &&
        [0, 1, 2].map((k) => (
          <path
            key={k}
            d={`M${-120 - k * 22} ${-70 - k * 14} q-14 30 0 60 M${120 + k * 22} ${-70 - k * 14} q14 30 0 60`}
            stroke="#fff"
            strokeWidth={6}
            fill="none"
            opacity={(Math.sin(f * 0.8 - k) + 1) / 2}
          />
        ))}
    </g>
  );
};

/** Wooden wardrobe, door ajar (ajar 0…1) and shaking (shake). */
export const Wardrobe: React.FC<{
  x: number;
  y: number;
  f: number;
  ajar?: number;
  shake?: number;
}> = ({ x, y, f, ajar = 0, shake = 0 }) => {
  const j = shake ? Math.sin(f * 2.2) * shake * 4 : 0;
  return (
    <g transform={`translate(${x},${y})`}>
      <SoftShadow x={0} y={0} rx={240} />
      <rect x={-210} y={-900} width={420} height={900} rx={14} fill="#8a6a50" />
      <rect x={-196} y={-880} width={192} height={820} rx={8} fill="#7a5c45" />
      <g transform={`translate(${j},0)`}>
        <rect x={4} y={-880} width={192 - ajar * 120} height={820} rx={8} fill="#80614a" />
        <rect x={20} y={-520} width={10} height={90} rx={5} fill="#d6c79a" />
      </g>
      {ajar > 0 && (
        <rect x={196 - ajar * 120} y={-880} width={ajar * 120} height={820} fill="#2a2228" />
      )}
      {ajar > 0 &&
        [0, 1, 2].map((k) => (
          <circle
            key={k}
            cx={190 - ajar * 60 + k * 0}
            cy={-700 + k * 120}
            r={8}
            fill="#fbf8f1"
            opacity={0.7}
          />
        ))}
      <rect x={-24} y={-520} width={10} height={90} rx={5} fill="#d6c79a" />
    </g>
  );
};

/** Bedroom in the morning: early-sun window, bed, study desk, wardrobe, door. */
export const bedroomDay = (
  f: number,
  o: {
    ajar?: number;
    shake?: number;
    doorOpen?: number;
    ring?: boolean;
    time?: string;
    dark?: boolean;
  } = {},
): SetLayers => ({
  sky: o.dark ? '#1e1c2c' : '#3a3a44',
  far: (
    <g>
      <Wall
        y1={1450}
        top={o.dark ? '#3a3a5a' : '#bcc6c8'}
        bottom={o.dark ? '#2e2c46' : '#a9b4b6'}
        skirt={o.dark ? '#25233a' : '#8a8f8e'}
      />
      <GrilleWindow
        x={620}
        y={330}
        w={320}
        h={420}
        sky={o.dark ? '#3a4566' : '#fbe9c4'}
        night={o.dark}
      />
      <rect x={180} y={420} width={220} height={300} rx={6} fill={o.dark ? '#4a4660' : '#c98a6a'} />
      <rect x={200} y={440} width={180} height={140} fill={o.dark ? '#5a5470' : '#e8b35a'} />
      <text
        x={290}
        y={680}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={34}
        fill={o.dark ? '#8a86a0' : '#5a3a2a'}
      >
        CỐ LÊN!
      </text>
      <WallClock x={1080} y={360} f={f} />
      <rect x={1180} y={560} width={320} height={22} rx={6} fill="#8a6a50" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x={1190 + i * 36}
          y={460 + (i % 3) * 8}
          width={28}
          height={100 - (i % 3) * 8}
          fill={['#7a8fa8', '#c98a6a', '#8aa07a', '#b8a070'][i % 4]}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1450} color={o.dark ? '#3e3a50' : '#b49a80'} line="#00000022" />
      <Wardrobe x={-330} y={1440} f={f} ajar={o.ajar} shake={o.shake} />
      <Door x={1420} y={1440} w={240} h={640} color="#8a7a6a" open={o.doorOpen ?? 0} />
      <g transform="translate(1080,1440)">
        <SoftShadow x={0} y={0} rx={200} />
        <rect x={-190} y={-280} width={380} height={30} rx={8} fill="#9a7d5e" />
        <rect x={-180} y={-250} width={20} height={250} fill="#6a5440" />
        <rect x={160} y={-250} width={20} height={250} fill="#6a5440" />
        <rect x={-120} y={-420} width={200} height={130} rx={8} fill="#3a3f48" />
        <rect x={-108} y={-410} width={176} height={110} fill={o.dark ? '#5a8ac0' : '#7a8a9a'} />
        <rect x={110} y={-320} width={60} height={40} fill="#c9b994" />
      </g>
    </g>
  ),
  back: (
    <g>
      <Bed x={560} y={1580} s={1} blanket="#d08a5a" />
      <g transform="translate(-20,1440)">
        <rect x={-90} y={-200} width={180} height={200} rx={10} fill="#7a6250" />
        <AlarmClock x={0} y={-200} s={0.8} f={f} ring={o.ring} time={o.time} />
      </g>
    </g>
  ),
  fg: <Plant x={1700} y={2100} s={1.5} f={f} tone="#5f6d4a" />,
  glow: o.dark
    ? { x: 1000, y: 1000, r: 500, color: '#7ab0ff', a: 0.25 }
    : { x: 780, y: 520, r: 760, color: '#ffe2a8', a: 0.55 },
});

/** Family meal tray (rice bowls, fish plate, sour-soup pot, chopsticks) placed on a table at (x,y). */
export const Meal: React.FC<{ x: number; y: number; f: number; cake?: boolean }> = ({
  x,
  y,
  f,
  cake,
}) => (
  <g transform={`translate(${x},${y})`}>
    <ellipse cx={0} cy={0} rx={250} ry={22} fill="#c9b08a" />
    <g transform="translate(-40,-4)">
      <path d="M-70 0 Q-74 -60 0 -64 Q74 -60 70 0 Z" fill="#b8806a" />
      <ellipse cx={0} cy={-62} rx={62} ry={12} fill="#e0a050" />
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          d={`M${-20 + k * 20} -70 C${-30 + k * 20} -110 ${-10 + k * 20} -130 ${-20 + k * 20 + Math.sin(f / 15 + k) * 10} -170`}
          stroke="#fff"
          strokeWidth={4}
          fill="none"
          opacity={0.3}
        />
      ))}
    </g>
    <g transform="translate(120,-6)">
      <ellipse rx={70} ry={14} fill="#e8e2d6" />
      <path d="M-50 -6 Q0 -34 50 -6 Q0 10 -50 -6 Z" fill="#c9884a" />
      <path d="M50 -6 L74 -20 L70 4 Z" fill="#c9884a" />
    </g>
    {[-200, -130, 190].map((dx, i) => (
      <g key={i} transform={`translate(${dx},-4)`}>
        <path d="M-26 0 Q-30 -30 0 -32 Q30 -30 26 0 Z" fill="#e6dccb" />
        <ellipse cx={0} cy={-30} rx={22} ry={6} fill="#fbf6ea" />
      </g>
    ))}
    <line x1={-170} y1={-10} x2={-100} y2={-30} stroke="#c9a46a" strokeWidth={5} />
    {cake && (
      <g transform="translate(0,-10)">
        <rect x={-80} y={-90} width={160} height={90} rx={14} fill="#f2e6d6" />
        <rect x={-80} y={-90} width={160} height={24} rx={10} fill="#e89aa8" />
        {[-40, 0, 40].map((dx) => (
          <g key={dx}>
            <rect x={dx - 4} y={-130} width={8} height={40} fill="#9cc6e4" />
            <ellipse cx={dx} cy={-138 + Math.sin(f / 4 + dx) * 2} rx={6} ry={10} fill="#ffd27a" />
          </g>
        ))}
      </g>
    )}
  </g>
);
/** Dining room: living room + meal tray on the table (warm light). */
export const dining = (f: number, o: { cake?: boolean; night?: boolean } = {}): SetLayers => {
  const base = livingRoom(f, { table: false, night: o.night });
  return {
    ...base,
    front: (
      <g>
        <Table x={500} y={1260} w={720} h={250} color="#8f6c50" />
        <Meal x={500} y={1252} f={f} cake={o.cake} />
      </g>
    ),
    glow: { x: 500, y: 700, r: 700, color: '#ffc070', a: 0.5 },
  };
};

/** Neighbourhood yard: alley houses behind, concrete ground, small goal, scoreboard. */
export const yardField = (f: number, o: { score?: [number, number] } = {}): SetLayers => {
  const a = alley(f);
  return {
    sky: a.sky,
    far: a.far,
    bg: (
      <g>
        <rect x={-1300} y={1250} width={3700} height={1300} fill="#a49a8c" />
        <rect x={-1300} y={1250} width={3700} height={20} fill="#8a8072" />
        {Array.from({ length: 10 }, (_, i) => (
          <line
            key={i}
            x1={-1300}
            y1={1300 + i * i * 12}
            x2={2400}
            y2={1300 + i * i * 12}
            stroke="#00000012"
            strokeWidth={3}
          />
        ))}
        {[-500, 1500].map((gx, i) => (
          <g key={i} transform={`translate(${gx},1420)`}>
            <rect
              x={-160}
              y={-260}
              width={320}
              height={260}
              fill="none"
              stroke="#e8e6dc"
              strokeWidth={14}
            />
            {Array.from({ length: 8 }, (_, k) => (
              <line
                key={k}
                x1={-160 + k * 46}
                y1={-260}
                x2={-160 + k * 46}
                y2={0}
                stroke="#e8e6dc"
                strokeWidth={2}
                opacity={0.5}
              />
            ))}
          </g>
        ))}
        <g transform="translate(500,1000)">
          <rect x={-160} y={-90} width={320} height={150} rx={10} fill="#3a3f48" />
          <rect x={-140} y={-70} width={120} height={110} rx={6} fill={C.orange} />
          <rect x={20} y={-70} width={120} height={110} rx={6} fill="#7a8270" />
          <text
            x={-80}
            y={20}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={80}
            fill="#fff"
          >
            {o.score?.[0] ?? 0}
          </text>
          <text
            x={80}
            y={20}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={80}
            fill="#fff"
          >
            {o.score?.[1] ?? 0}
          </text>
        </g>
      </g>
    ),
    fg: a.fg,
    glow: a.glow,
  };
};

/** Empty lot on a Sunday afternoon (Dad teaches bike riding). */
export const lot = (f: number): SetLayers => ({
  sky: '#d9b9a0',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1700} fill="#e0c0a0" />
      <circle cx={1300} cy={420} r={130} fill="#ffe6b8" opacity={0.9} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x={-1300 + i * 320}
          y={820 - (i % 3) * 70}
          width={260}
          height={400}
          fill={['#a99a8a', '#9d8f84', '#b3a392'][i % 3]}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1180} width={3700} height={1400} fill="#b0926e" />
      {Array.from({ length: 40 }, (_, i) => (
        <path
          key={i}
          d={`M${-1200 + random(`gr${i}`) * 3400} ${1220 + random(`gy${i}`) * 500} l-10 -30 m10 30 l4 -36 m-4 36 l14 -28`}
          stroke="#7a8a52"
          strokeWidth={5}
        />
      ))}
      <path
        d="M-1300 1500 Q500 1380 2400 1520"
        stroke="#9a7a5a"
        strokeWidth={60}
        fill="none"
        opacity={0.6}
      />
    </g>
  ),
  glow: { x: 1300, y: 420, r: 900, color: '#ffc890', a: 0.5 },
});

/** Balcony at night: railing, plastic chair, distant city lights, warmly lit sliding glass door. */
export const balcony = (f: number, o: { chair?: boolean; doorOpen?: number } = {}): SetLayers => ({
  sky: '#141a30',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2200} fill="#1a2240" />
      {Array.from({ length: 40 }, (_, i) => (
        <circle
          key={`s${i}`}
          cx={-1200 + random(`st${i}`) * 3400}
          cy={-400 + random(`sy${i}`) * 700}
          r={2 + random(`sr${i}`) * 2}
          fill="#fff"
          opacity={0.4 + 0.3 * Math.sin(f / 20 + i)}
        />
      ))}
      {Array.from({ length: 22 }, (_, i) => {
        const x = -1300 + i * 170;
        const h = 300 + random(`bh${i}`) * 500;
        return (
          <g key={i}>
            <rect
              x={x}
              y={1150 - h}
              width={150}
              height={h + 400}
              fill={['#232a48', '#283052', '#1e2540'][i % 3]}
            />
            {Array.from({ length: 10 }, (_, k) => (
              <rect
                key={k}
                x={x + 18 + (k % 3) * 42}
                y={1180 - h + Math.floor(k / 3) * 70}
                width={26}
                height={34}
                fill="#ffc870"
                opacity={random(`w${i}${k}`) > 0.45 ? 0.75 : 0.08}
              />
            ))}
          </g>
        );
      })}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1480} width={3700} height={1200} fill="#3a3646" />
      {/* sliding glass door on the left, warm light inside */}
      <rect x={-760} y={500} width={560} height={990} fill="#2a2632" />
      <rect x={-740} y={520} width={520} height={960} fill="#ffcf8a" opacity={0.55} />
      <rect
        x={-740 + (o.doorOpen ?? 0) * 260}
        y={520}
        width={260}
        height={960}
        fill="#8aa0b8"
        opacity={0.35}
        stroke="#6a6878"
        strokeWidth={8}
      />
      <Plant x={-140} y={1500} s={0.9} f={f} />
    </g>
  ),
  back: (
    <g>
      {/* lan can */}
      <rect x={-1300} y={1180} width={3700} height={22} rx={8} fill="#6a6878" />
      {Array.from({ length: 70 }, (_, i) => (
        <rect key={i} x={-1300 + i * 54} y={1200} width={10} height={290} fill="#5a5868" />
      ))}
      <rect x={-1300} y={1470} width={3700} height={20} fill="#5a5868" />
      {o.chair !== false && <PlasticChair x={560} y={1560} s={1} color="#4f7aa0" />}
    </g>
  ),
  glow: { x: -480, y: 1000, r: 700, color: '#ffc070', a: 0.4 },
});

/** Kitchen at night: glazed tiles, sink, running tap (water 0…1), dish rack, warm pendant lamp. */
export const kitchen = (f: number, o: { water?: number } = {}): SetLayers => ({
  sky: '#2a2228',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2200} fill="#cdbf9e" />
      {Array.from({ length: 30 }, (_, i) => (
        <line
          key={i}
          x1={-1300}
          y1={700 + i * 60}
          x2={2400}
          y2={700 + i * 60}
          stroke="#b9ab8a"
          strokeWidth={3}
        />
      ))}
      {Array.from({ length: 64 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={-1300 + i * 60}
          y1={700}
          x2={-1300 + i * 60}
          y2={1200}
          stroke="#b9ab8a"
          strokeWidth={3}
        />
      ))}
      <rect
        x={-200}
        y={240}
        width={360}
        height={300}
        rx={8}
        fill="#1e2234"
        stroke="#8a7a62"
        strokeWidth={14}
      />
      <rect x={600} y={260} width={520} height={260} rx={10} fill="#9a7d5e" />
      <rect x={620} y={280} width={480} height={220} fill="#8a6d50" />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1500} color="#9a8a72" />
      <g transform="translate(1500,1500)">
        <rect x={-120} y={-600} width={240} height={600} rx={20} fill="#a9b6bd" />
        <rect x={-110} y={-400} width={220} height={4} fill="#7f8c94" />
      </g>
    </g>
  ),
  back: (
    <g>
      {/* counter + sink */}
      <rect x={-700} y={1180} width={2000} height={330} fill="#8f7a62" />
      <rect x={-720} y={1160} width={2040} height={36} rx={8} fill="#d6ccb8" />
      <rect x={260} y={1150} width={440} height={30} rx={10} fill="#a8b0b6" />
      <path
        d="M470 1150 L470 1010 Q470 980 500 980 L560 980"
        stroke="#b8c0c6"
        strokeWidth={16}
        fill="none"
        strokeLinecap="round"
      />
      {(o.water ?? 0) > 0 && (
        <rect
          x={548}
          y={990}
          width={14}
          height={160}
          fill="#bfe6ff"
          opacity={0.75 * (o.water ?? 0)}
        />
      )}
      {/* dish rack */}
      <g transform="translate(900,1160)">
        <rect x={-110} y={-20} width={220} height={20} fill="#9aa2a8" />
        {[-70, -30, 10, 50].map((dx) => (
          <ellipse
            key={dx}
            cx={dx}
            cy={-70}
            rx={14}
            ry={56}
            fill="#efe8da"
            stroke="#cfc6b6"
            strokeWidth={3}
          />
        ))}
      </g>
    </g>
  ),
  fg: (
    <g>
      <line x1={500} y1={-600} x2={500} y2={130} stroke="#3a3238" strokeWidth={6} />
      <path d="M380 130 L620 130 L560 60 L440 60 Z" fill="#e8b35a" />
      <circle cx={500} cy={160} r={34} fill="#fff1c8" />
    </g>
  ),
  glow: { x: 500, y: 260, r: 900, color: '#ffc070', a: 0.6 },
});

/** Stairs down to the kitchen, lit from below by the kitchen lamp. */
export const stairs = (f: number): SetLayers => ({
  sky: '#1e1a22',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2600} fill="#2e2a36" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={-300 + i * 140}
          y={400 + i * 110}
          width={1600}
          height={110}
          fill={shade('#5a4a40', i * 0.04)}
        />
      ))}
      <line x1={-300} y1={300} x2={1100} y2={1400} stroke="#8a6a50" strokeWidth={16} />
    </g>
  ),
  bg: <rect x={-1300} y={1500} width={3700} height={1200} fill="#3a3238" />,
  glow: { x: 1300, y: 1600, r: 900, color: '#ffc070', a: 0.55 },
});

/** Hand/phone held (extreme close-up of the screen). */
export const PhoneScreen: React.FC<{
  x: number;
  y: number;
  s?: number;
  children: React.ReactNode;
  glow?: string;
}> = ({ x, y, s = 1, children, glow = '#7ab0ff' }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <ellipse
      cx={0}
      cy={0}
      rx={420}
      ry={520}
      fill={glow}
      opacity={0.12}
      style={{ filter: 'blur(40px)' }}
    />
    <rect x={-210} y={-400} width={420} height={800} rx={50} fill="#1b1a20" />
    <rect x={-190} y={-380} width={380} height={760} rx={36} fill="#e9e4dc" />
    <g>{children}</g>
  </g>
);
export { Frame, Motorbike };
