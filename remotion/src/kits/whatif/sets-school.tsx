import React from 'react';
import { Banner, BangTree, Motorbike, SoftShadow, TileFloor } from './props';
import { alley, SetLayers } from './sets';
import { FONT } from './theme';

/** Falling leaf (forwards, or backwards up to the branch). */
export const Leaf: React.FC<{ x: number; y: number; r?: number; s?: number }> = ({
  x,
  y,
  r = 0,
  s = 1,
}) => (
  <path
    d="M0 0 C20 -26 52 -20 60 0 C52 20 20 26 0 0 Z"
    fill="#8a9a5c"
    transform={`translate(${x},${y}) rotate(${r}) scale(${s})`}
  />
);

/** EP3 sets (same world as EP1: floor y≈1450–1600, wide shot around x≈500). Each set has ONE warm light source. */

/** School gate in the morning: yellow classroom block, arched gate with name sign, almond tree, parked bicycles, falling leaves (leafT: leaf time – runs backwards on rewind). */
export const schoolGate = (f: number, o: { leafT?: number; warm?: number } = {}): SetLayers => {
  const lt = o.leafT ?? f;
  return {
    sky: '#c9d3d6',
    far: (
      <g>
        <rect x={-1300} y={-600} width={3700} height={1300} fill="#cfd8da" />
        <rect x={-1300} y={260} width={3700} height={960} fill="#cdb98a" />
        <rect x={-1300} y={230} width={3700} height={40} fill="#a8584a" />
        {Array.from({ length: 16 }, (_, i) => (
          <g key={i}>
            <rect x={-1250 + i * 240} y={340} width={130} height={200} rx={6} fill="#7b8a96" />
            <rect x={-1250 + i * 240} y={640} width={130} height={200} rx={6} fill="#7b8a96" />
          </g>
        ))}
        <rect x={-1300} y={560} width={3700} height={16} fill="#a99a6e" />
      </g>
    ),
    bg: (
      <g>
        <rect x={-1300} y={1200} width={3700} height={1400} fill="#b0a898" />
        {Array.from({ length: 10 }, (_, i) => (
          <line
            key={i}
            x1={-1300}
            y1={1240 + i * i * 14}
            x2={2400}
            y2={1240 + i * i * 14}
            stroke="#00000012"
            strokeWidth={3}
          />
        ))}
        {/* arched gate + name sign */}
        {[-80, 1080].map((x) => (
          <rect
            key={x}
            x={x - 50}
            y={500}
            width={100}
            height={760}
            rx={10}
            fill="#d8cba0"
            stroke="#a99a6e"
            strokeWidth={6}
          />
        ))}
        <path d="M-80 520 Q500 330 1080 520" stroke="#a8584a" strokeWidth={34} fill="none" />
        <Banner x={500} y={470} text="TRƯỜNG THCS HOA SEN" w={760} color="#5f6f8a" fs={46} />
        {/* open iron gate */}
        <g stroke="#4a5462" strokeWidth={8}>
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={-260 + i * 30} y1={900} x2={-260 + i * 30} y2={1260} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <line key={`r${i}`} x1={1110 + i * 30} y1={900} x2={1110 + i * 30} y2={1260} />
          ))}
        </g>
        <BangTree x={-620} y={1260} s={0.95} f={f} />
        {/* parked bicycles */}
        {[1380, 1520].map((x) => (
          <g key={x} transform={`translate(${x},1300)`}>
            <circle cx={-60} cy={-50} r={50} fill="none" stroke="#3a3f48" strokeWidth={8} />
            <circle cx={60} cy={-50} r={50} fill="none" stroke="#3a3f48" strokeWidth={8} />
            <path
              d="M-60 -50 L-10 -120 L60 -50 M-10 -120 L40 -120"
              stroke="#6a7f8a"
              strokeWidth={8}
              fill="none"
            />
          </g>
        ))}
        {/* falling almond leaves (rewind: fly back up to the branch) */}
        {Array.from({ length: 6 }, (_, i) => {
          const per = 120 + i * 17;
          const u = (((lt + i * 40) % per) + per) % per;
          return (
            <Leaf
              key={i}
              x={-760 + i * 90 + Math.sin(u / 14 + i) * 40}
              y={300 + u * 6}
              r={u * 4}
              s={0.9}
            />
          );
        })}
      </g>
    ),
    fg: (
      <g>
        <path d="M-900 -200 Q-300 100 -100 -100" stroke="#5a4a3a" strokeWidth={30} fill="none" />
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse
            key={i}
            cx={-700 + i * 120}
            cy={-60 + (i % 2) * 40}
            rx={140}
            ry={60}
            fill={['#6d7a52', '#7c8a5c'][i % 2]}
          />
        ))}
      </g>
    ),
    glow: { x: 1500, y: 100, r: 900, color: '#ffe2a8', a: 0.5 },
  };
};

/** Main road in a traffic jam: two rows of motorbikes, a narrow lane in the middle. */
export const traffic = (f: number): SetLayers => {
  const a = alley(f);
  return {
    sky: a.sky,
    far: a.far,
    bg: (
      <g>
        <rect x={-1300} y={1200} width={3700} height={1400} fill="#6f6a66" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x={-1200 + i * 300}
            y={1420}
            width={140}
            height={14}
            fill="#e8e2d0"
            opacity={0.6}
          />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <Motorbike
            key={`a${i}`}
            x={-1100 + i * 320 + Math.sin(f / 30 + i) * 6}
            y={1300}
            s={0.6}
            f={f + i * 5}
            running
            color={['#5a6470', '#8a5a50', '#6a7a5a', '#4a4a52'][i % 4]}
          />
        ))}
      </g>
    ),
    fg: (
      <g>
        {Array.from({ length: 7 }, (_, i) => (
          <Motorbike
            key={`b${i}`}
            x={-1000 + i * 460}
            y={1820}
            s={1.15}
            f={f + i * 3}
            running
            color={['#4a4a52', '#5a6470', '#8a5a50'][i % 3]}
          />
        ))}
      </g>
    ),
    glow: { x: 1300, y: 300, r: 900, color: '#ffd8a0', a: 0.35 },
  };
};

/** Coach: window (window 0…1 slides down), moves by dx. */
export const Coach: React.FC<{
  x: number;
  y: number;
  s?: number;
  f: number;
  window?: number;
  dx?: number;
  running?: boolean;
  inside?: React.ReactNode;
  armOut?: boolean;
}> = ({ x, y, s = 1, f, window = 0, dx = 0, running, inside, armOut }) => (
  <g transform={`translate(${x + dx},${y + (running ? Math.sin(f * 1.7) * 2 : 0)}) scale(${s})`}>
    <SoftShadow x={0} y={0} rx={900} a={0.35} />
    <rect x={-900} y={-640} width={1800} height={560} rx={60} fill="#e8e2d6" />
    <rect x={-900} y={-260} width={1800} height={60} fill="#c4553f" />
    <rect x={-900} y={-200} width={1800} height={22} fill="#3f6a8a" />
    {Array.from({ length: 6 }, (_, i) => {
      const wx = -820 + i * 270;
      const isPhong = i === 2;
      return (
        <g key={i}>
          <rect
            x={wx}
            y={-580}
            width={230}
            height={260}
            rx={16}
            fill={isPhong ? '#2a3240' : '#5a6f86'}
          />
          {isPhong && inside && (
            <g>
              <clipPath id="coachWin">
                <rect x={wx} y={-580} width={230} height={260} rx={16} />
              </clipPath>
              <g clipPath="url(#coachWin)">{inside}</g>
            </g>
          )}
          {isPhong && armOut && window >= 1 && (
            <g>
              <path
                d={`M${wx + 150} -360 Q${wx + 260} -380 ${wx + 330} -470`}
                stroke="#3f4f72"
                strokeWidth={34}
                fill="none"
                strokeLinecap="round"
              />
              <circle cx={wx + 340} cy={-480} r={20} fill="#15121a" />
            </g>
          )}
          {(!isPhong || window < 1) && (
            <rect
              x={wx}
              y={-580}
              width={230}
              height={260 * (isPhong ? 1 - window : 1)}
              rx={16}
              fill="#8fb0c8"
              opacity={isPhong ? 0.45 : 0.55}
            />
          )}
          <path
            d={`M${wx + 20} ${-560} L${wx + 80} ${-560} L${wx + 30} ${-420} Z`}
            fill="#fff"
            opacity={0.2}
          />
        </g>
      );
    })}
    <rect x={720} y={-580} width={150} height={500} rx={12} fill="#4a5462" />
    {[-620, 620].map((wx) => (
      <g key={wx}>
        <circle cx={wx} cy={-80} r={90} fill="#222026" />
        <circle
          cx={wx}
          cy={-80}
          r={40}
          fill="#77737a"
          transform={`rotate(${running ? f * 12 : 0} ${wx} -80)`}
        />
      </g>
    ))}
    <text x={-300} y={-640 - 20} fontFamily={FONT} fontWeight={800} fontSize={44} fill="#5a4a3a">
      SÀI GÒN – HÀ NỘI
    </text>
  </g>
);

/** Bus station in golden afternoon light: canopy, timetable board, ticket booth, other coaches in the distance. */
export const busStation = (f: number): SetLayers => ({
  sky: '#e8b880',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1800} fill="#f0c890" />
      <circle cx={1500} cy={300} r={160} fill="#fff0c0" opacity={0.95} />
      <rect x={-1300} y={-100} width={3700} height={120} fill="#8a6a4a" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={-1250 + i * 270} y={20} width={24} height={900} fill="#9a7a5a" />
      ))}
      <rect x={-200} y={140} width={520} height={160} rx={10} fill="#2a2630" />
      <text
        x={60}
        y={250}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={86}
        fill="#ffb84a"
      >
        BẾN XE · 16:58
      </text>
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1150} color="#b8a07a" line="#00000018" />
      <g transform="translate(-900,1150) scale(0.5)">
        <rect x={-900} y={-640} width={1800} height={560} rx={60} fill="#d8d2c6" />
        <rect x={-900} y={-260} width={1800} height={60} fill="#5a7a9a" />
      </g>
      <g transform="translate(1700,1150)">
        <rect x={-180} y={-420} width={360} height={420} rx={12} fill="#7a6a5a" />
        <rect x={-150} y={-380} width={300} height={140} fill="#e8d8b0" />
        <text
          x={0}
          y={-290}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={44}
          fill="#5a3a2a"
        >
          QUẦY VÉ
        </text>
      </g>
    </g>
  ),
  glow: { x: 1500, y: 300, r: 1100, color: '#ffc070', a: 0.55 },
});

/** Hoàn Kiếm Lake under a cold grey sky (the photo Phong sends). */
export const lake = (f: number): SetLayers => ({
  sky: '#b8c0c8',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1500} fill="#c3cad0" />
      <rect x={-1300} y={900} width={3700} height={900} fill="#8a9aa4" />
      {Array.from({ length: 14 }, (_, i) => (
        <ellipse
          key={i}
          cx={-1200 + i * 270}
          cy={880}
          rx={180}
          ry={70}
          fill="#6f7d62"
          opacity={0.8}
        />
      ))}
      {/* distant Turtle Tower */}
      <g transform="translate(1200,960)">
        <rect x={-50} y={-120} width={100} height={110} fill="#b7aa8a" />
        <rect x={-36} y={-180} width={72} height={60} fill="#b7aa8a" />
        <path d="M-46 -180 L0 -230 L46 -180 Z" fill="#9a8a6a" />
      </g>
      {/* red Thê Húc bridge */}
      <path d="M-900 1040 Q-500 920 -100 1040" stroke="#c4473a" strokeWidth={34} fill="none" />
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={i}
          x1={-860 + i * 150}
          y1={1000 - Math.sin((i / 5) * Math.PI) * 80}
          x2={-860 + i * 150}
          y2={1100}
          stroke="#a43a2f"
          strokeWidth={14}
        />
      ))}
    </g>
  ),
  bg: <rect x={-1300} y={1300} width={3700} height={1300} fill="#8a8a84" />,
  glow: { x: 500, y: 200, r: 900, color: '#f0e8d8', a: 0.3 },
});

/** Standing mirror (practising the greeting last night). */
export const Mirror: React.FC<{ x: number; y: number; children?: React.ReactNode }> = ({
  x,
  y,
  children,
}) => (
  <g transform={`translate(${x},${y})`}>
    <rect x={-190} y={-760} width={380} height={760} rx={30} fill="#6b5140" />
    <rect x={-165} y={-735} width={330} height={710} rx={20} fill="#a8bcc8" />
    <g clipPath="url(#mirrorClip)">{children}</g>
    <path d="M-120 -700 L-40 -700 L-140 -460 Z" fill="#fff" opacity={0.25} />
  </g>
);
