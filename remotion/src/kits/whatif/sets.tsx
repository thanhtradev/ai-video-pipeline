import React from 'react';
import { random } from 'remotion';
import {
  Altar,
  Banner,
  BangTree,
  Basin,
  Bed,
  Blackboard,
  Calendar,
  CarpLantern,
  CeilingFan,
  CrowdSil,
  Desk,
  Door,
  Frame,
  Fridge,
  GrilleWindow,
  KeoQuan,
  Lion,
  MaiVase,
  Motorbike,
  NightLamp,
  PlasticChair,
  Plant,
  SilkLantern,
  SoftShadow,
  StarLantern,
  StoneBench,
  StringLights,
  Table,
  TileFloor,
  Tray,
  TvCabinet,
  Wall,
  WallClock,
} from './props';
import { FONT, shade } from './theme';
import { tr } from './lang';

/**
 * A set = layers: far (farthest) · bg (background, blurred) · back (behind characters, sharp) · front (in front of characters, sharp) · fg (foreground, blurred).
 * World 1080×1920, floor usually at y≈1450–1520. Each set has ONE warm light source (glow).
 */
export type SetLayers = {
  far?: React.ReactNode;
  bg?: React.ReactNode;
  back?: React.ReactNode;
  front?: React.ReactNode;
  fg?: React.ReactNode;
  glow?: { x: number; y: number; r: number; color: string; a?: number };
  sky?: string;
};

export const FLOOR = 1500;

/** Vietnamese townhouse living room: grille window with afternoon sun, ceiling fan, tear-off calendar, fridge, dining table + plastic chairs. */
export const livingRoom = (
  f: number,
  o: {
    fridgeOpen?: number;
    lights?: (i: number) => boolean;
    table?: boolean;
    night?: boolean;
  } = {},
): SetLayers => ({
  sky: '#3a3340',
  far: (
    <g>
      <Wall y1={1380} top="#cbbda4" bottom="#b8a98f" skirt="#8d7c66" />
      <rect x={-1300} y={-600} width={3700} height={760} fill="#a99a84" />
      <rect x={-1300} y={150} width={3700} height={18} fill="#8d7c66" />
      <GrilleWindow
        x={40}
        y={430}
        w={330}
        h={470}
        sky={o.night ? '#3a4566' : '#f0dfb8'}
        night={o.night}
      />
      <Frame x={560} y={500} w={130} h={160} />
      <Frame x={720} y={470} w={90} h={110} tint="#9a8c7a" />
      <Calendar x={880} y={620} />
      <WallClock x={640} y={300} f={f} />
      {o.lights && (
        <>
          <StringLights x0={20} x1={400} y={410} sag={40} on={o.lights} n={14} />
          <StringLights x0={420} x1={1060} y={240} sag={70} on={(i) => o.lights!(i + 5)} n={18} />
        </>
      )}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} pattern color="#a8977f" />
      <CeilingFan x={520} y={200} s={0.9} f={f} />
      <TvCabinet x={300} y={1400} s={0.8} />
      <Fridge x={860} y={1420} s={1.0} open={o.fridgeOpen ?? 0} />
      <Plant x={60} y={1420} s={0.9} f={f} />
      {o.lights && <MaiVase x={560} y={1400} s={0.8} />}
    </g>
  ),
  back:
    o.table === false ? null : (
      <g>
        <PlasticChair x={240} y={1470} color="#a85d55" />
      </g>
    ),
  front:
    o.table === false ? null : (
      <g>
        <Table x={430} y={1215} w={560} h={295} color="#8f6c50" />
        <g transform="translate(600,1205)">
          <ellipse cx={0} cy={0} rx={50} ry={10} fill="#d9d2c2" />
          <path d="M-34 0 Q-38 -46 0 -50 Q38 -46 34 0 Z" fill="#cfc6b2" />
        </g>
      </g>
    ),
  fg: (
    <g>
      <Plant x={-80} y={2050} s={1.6} f={f} tone="#5f6d4a" />
    </g>
  ),
  glow: o.night
    ? { x: 300, y: 1200, r: 500, color: '#ffc070', a: 0.35 }
    : { x: 200, y: 650, r: 620, color: '#ffcf8a', a: 0.45 },
});

/** Lower-secondary schoolyard: two-storey muted-yellow classroom block, almond tree, flagpole, stone benches. */
export const schoolYard = (f: number): SetLayers => ({
  sky: '#b9c3c8',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1200} fill="#c6ccc8" />
      <rect x={-1300} y={300} width={3700} height={1050} fill="#c9b98a" />
      <rect x={-1300} y={260} width={3700} height={50} fill="#a8584a" />
      {[0, 1].map((fl) => (
        <g key={fl}>
          <rect x={-1300} y={760 + fl * 480 - 470} width={3700} height={22} fill="#a99a6e" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i}>
              <rect x={-300 + i * 230} y={360 + fl * 480} width={26} height={380} fill="#d8cba0" />
              <rect
                x={-240 + i * 230}
                y={430 + fl * 480}
                width={120}
                height={240}
                rx={6}
                fill="#7b8a96"
              />
              <rect
                x={-230 + i * 230}
                y={440 + fl * 480}
                width={100}
                height={100}
                fill="#9eb0bc"
                opacity={0.6}
              />
            </g>
          ))}
          <g stroke="#8a7d5c" strokeWidth={5}>
            {Array.from({ length: 70 }, (_, i) => (
              <line
                key={i}
                x1={-600 + i * 34}
                y1={650 + fl * 480}
                x2={-600 + i * 34}
                y2={740 + fl * 480}
              />
            ))}
            <line x1={-1300} y1={650 + fl * 480} x2={2400} y2={650 + fl * 480} strokeWidth={10} />
          </g>
        </g>
      ))}
      <Banner
        x={540}
        y={330}
        text={tr('TRƯỜNG THCS HOA SEN', 'HOA SEN MIDDLE SCHOOL')}
        w={640}
        color="#5f6f8a"
      />
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1340} width={3700} height={1200} fill="#b4ab9c" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1={-1300}
          y1={1380 + i * i * 14}
          x2={2400}
          y2={1380 + i * i * 14}
          stroke="#00000014"
          strokeWidth={3}
        />
      ))}
      <g transform="translate(920,1360)">
        <rect x={-8} y={-900} width={16} height={900} fill="#9a9a9a" />
        <path
          d={`M8 -890 Q60 ${-880 + Math.sin(f / 8) * 10} 120 -870 L120 -790 Q60 ${-800 + Math.sin(f / 8) * 10} 8 -810 Z`}
          fill="#b04a3c"
        />
      </g>
      <BangTree x={-60} y={1380} s={1.1} f={f} />
      <ellipse cx={200} cy={1560} rx={420} ry={60} fill="#000" opacity={0.08} />
    </g>
  ),
  back: <StoneBench x={460} y={1500} s={1.05} />,
  fg: (
    <g>
      {Array.from({ length: 5 }, (_, i) => (
        <ellipse
          key={i}
          cx={-60 + i * 50}
          cy={180 + i * 40}
          rx={160}
          ry={60}
          fill={['#5f6d48', '#6c7a52'][i % 2]}
          transform={`rotate(${-20 + i * 8 + Math.sin(f / 40 + i) * 2})`}
        />
      ))}
    </g>
  ),
  glow: { x: 900, y: 200, r: 700, color: '#ffe2a8', a: 0.4 },
});

/** Ancestral altar on the full-moon day (light source: altar lamp). */
export const altarRoom = (
  f: number,
  o: { cakes?: number; extraIncense?: number } = {},
): SetLayers => ({
  sky: '#2c2228',
  far: (
    <g>
      <Wall y1={1500} top="#5c4440" bottom="#4a3634" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x={-600 + i * 300}
          y={-600}
          width={12}
          height={2100}
          fill="#3e2c2a"
          opacity={0.6}
        />
      ))}
      {[150, 930].map((x) => (
        <g key={x}>
          <rect x={x - 46} y={240} width={92} height={640} rx={8} fill="#8a3a32" />
          {Array.from({ length: 6 }, (_, k) => (
            <rect
              key={k}
              x={x - 20}
              y={290 + k * 96}
              width={40}
              height={50}
              rx={6}
              fill="#d6a84a"
              opacity={0.7}
            />
          ))}
        </g>
      ))}
      <Frame x={430} y={520} w={150} h={190} tint="#7a6a5a" />
      <Frame x={650} y={520} w={150} h={190} tint="#7a6a5a" />
      <rect x={300} y={300} width={480} height={70} rx={10} fill="#8a3a32" />
      <rect x={340} y={318} width={400} height={34} rx={6} fill="#d6a84a" opacity={0.6} />
    </g>
  ),
  bg: <TileFloor y0={1560} color="#5e4a40" line="#00000030" />,
  back: (
    <Altar x={540} y={1060} s={1} f={f} cakes={o.cakes ?? 9} extraIncense={o.extraIncense ?? 0} />
  ),
  fg: (
    <g>
      <path d="M1000 2100 Q980 1700 1060 1500 L1300 1500 L1300 2100 Z" fill="#8a6a4a" />
      {Array.from({ length: 7 }, (_, i) => (
        <circle
          key={i}
          cx={1040 + random(`cuc${i}`) * 200}
          cy={1380 + random(`cucy${i}`) * 160}
          r={34}
          fill="#d8b04a"
        />
      ))}
    </g>
  ),
  glow: { x: 540, y: 900, r: 650, color: '#ffb070', a: 0.5 },
});

/** Teachers' room: grey-blue walls, curtains, exam-paper desk, tea table. */
export const teacherRoom = (f: number, o: { roll?: number } = {}): SetLayers => ({
  sky: '#3a4040',
  far: (
    <g>
      <Wall y1={1400} top="#aab3a6" bottom="#98a194" skirt="#6f7a6c" />
      <g transform="translate(120,360)">
        <rect x={-20} y={-20} width={380} height={480} fill="#7a8274" />
        <rect width={340} height={440} fill="#f0e6c8" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={0} y={i * 37} width={340} height={22} fill="#d8d2c0" />
        ))}
      </g>
      <WallClock x={700} y={330} f={f} />
      <rect x={600} y={480} width={340} height={260} rx={8} fill="#8b6d50" />
      <rect x={620} y={500} width={300} height={220} fill="#c9b994" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x={640 + (i % 3) * 95}
          y={520 + Math.floor(i / 3) * 100}
          width={80}
          height={80}
          fill={['#e8e0cc', '#d6c4a0', '#efe7d6'][i % 3]}
          transform={`rotate(${(i - 2) * 3} ${680 + (i % 3) * 95} ${560 + Math.floor(i / 3) * 100})`}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1400} color="#9a9488" />
      <g transform="translate(950,1420)">
        <rect x={-120} y={-640} width={240} height={640} rx={10} fill="#7a6a5a" />
        {[0, 1, 2, 3].map((k) => (
          <g key={k}>
            <rect x={-104} y={-620 + k * 150} width={208} height={130} fill="#5f5246" />
            {Array.from({ length: 6 }, (_, j) => (
              <rect
                key={j}
                x={-96 + j * 34}
                y={-604 + k * 150}
                width={26}
                height={110}
                fill={['#8a8f9a', '#a08a6a', '#7a8a7a'][(j + k) % 3]}
              />
            ))}
          </g>
        ))}
      </g>
    </g>
  ),
  front: (
    <g>
      <Table x={420} y={1260} w={560} h={250} color="#7f6650" />
      {/* stack of exam papers + a long sheet rolling to the floor */}
      <g transform="translate(330,1250)">
        <rect x={-90} y={-24} width={180} height={22} fill="#e8e2d2" />
        <rect x={-84} y={-36} width={180} height={14} fill="#f0ebdd" transform="rotate(-3)" />
      </g>
      <g transform="translate(470,1240)">
        <rect x={-70} y={-12} width={140} height={14} fill="#f4efe4" />
        <text
          x={0}
          y={-22}
          textAnchor="middle"
          fontSize={20}
          fontWeight={800}
          fill="#6a5a4a"
          fontFamily={FONT}
        >
          {tr('ĐỀ KIỂM TRA NGỮ VĂN', 'LITERATURE EXAM')}
        </text>
        {(o.roll ?? 0) > 0 && (
          <path
            d={`M60 0 Q110 10 112 60 L112 ${60 + 240 * (o.roll ?? 0)} Q112 ${80 + 240 * (o.roll ?? 0)} 150 ${84 + 240 * (o.roll ?? 0)} L${150 + 280 * (o.roll ?? 0)} ${84 + 240 * (o.roll ?? 0)}`}
            stroke="#f4efe4"
            strokeWidth={70}
            fill="none"
          />
        )}
        {(o.roll ?? 0) > 0 &&
          Array.from({ length: Math.floor(10 * (o.roll ?? 0)) }, (_, i) => (
            <line
              key={i}
              x1={92}
              y1={70 + i * 24}
              x2={132}
              y2={70 + i * 24}
              stroke="#b5ad9a"
              strokeWidth={4}
            />
          ))}
      </g>
      {/* tea table */}
      <g transform="translate(860,1300)">
        <SoftShadow x={0} y={200} rx={130} />
        <rect x={-120} y={0} width={240} height={26} rx={8} fill="#6f5a48" />
        <rect x={-100} y={26} width={20} height={176} fill="#5a4838" />
        <rect x={80} y={26} width={20} height={176} fill="#5a4838" />
        {[-60, -20, 20].map((k) => (
          <path
            key={k}
            d={`M${k - 14} 0 L${k + 14} 0 L${k + 11} -24 L${k - 11} -24 Z`}
            fill="#e8e1d2"
          />
        ))}
      </g>
    </g>
  ),
  fg: <rect x={-300} y={1650} width={500} height={400} rx={40} fill="#5a4a3e" />,
  glow: { x: 280, y: 600, r: 600, color: '#fff0c8', a: 0.45 },
});

/** Bathroom in the morning: glazed tiles, ice-water basin on a stool. */
export const bathroom = (f: number, o: { splash?: number } = {}): SetLayers => ({
  sky: '#3a4448',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2100} fill="#b9c7c9" />
      {Array.from({ length: 34 }, (_, i) => (
        <line
          key={i}
          x1={-1300}
          y1={-600 + i * 70}
          x2={2400}
          y2={-600 + i * 70}
          stroke="#9aacaf"
          strokeWidth={3}
        />
      ))}
      {Array.from({ length: 34 }, (_, i) => (
        <line
          key={`v${i}`}
          x1={-600 + i * 70}
          y1={-600}
          x2={-600 + i * 70}
          y2={1500}
          stroke="#9aacaf"
          strokeWidth={3}
        />
      ))}
      <rect x={640} y={300} width={240} height={200} rx={8} fill="#f6f0d8" />
      <rect
        x={300}
        y={440}
        width={260}
        height={340}
        rx={120}
        fill="#d4dcdc"
        stroke="#8a9a9c"
        strokeWidth={10}
      />
      <rect x={300} y={820} width={260} height={24} rx={6} fill="#c9b9a2" />
      <path d="M340 820 L360 760 L380 820" fill="#7aa0b8" />
    </g>
  ),
  bg: <TileFloor y0={1450} color="#8fa0a2" line="#00000020" />,
  back: (
    <g>
      <g transform="translate(540,1480)">
        <SoftShadow x={0} y={0} rx={160} />
        <path d="M-120 -200 L120 -200 L130 0 L-130 0 Z" fill="#6a8aa0" />
        <rect x={-140} y={-220} width={280} height={30} rx={12} fill="#7a9ab0" />
      </g>
      <Basin x={540} y={1280} f={f} splash={o.splash ?? 0} />
      <Door x={40} y={1450} w={230} h={700} color="#8a7a6a" open={0.5} />
    </g>
  ),
  fg: <rect x={900} y={300} width={260} height={900} rx={60} fill="#c78a7a" />,
  glow: { x: 760, y: 400, r: 600, color: '#fff2cf', a: 0.5 },
});

/** School corridor (one-point perspective). doorOpen 0…1 for the first door. */
export const hallway = (
  f: number,
  o: { doorOpen?: number; chairOut?: number; dark?: number } = {},
): SetLayers => {
  const vx = 600;
  const vy = 880;
  return {
    sky: '#40444a',
    far: (
      <g>
        <rect x={-1300} y={-600} width={3700} height={2400} fill="#a9ab9c" />
        <rect x={vx - 90} y={vy - 160} width={180} height={240} fill="#f2ecd4" />
        <path
          d={`M-1300 -600 L${vx - 90} ${vy - 160} L${vx - 90} ${vy + 80} L-600 2200 Z`}
          fill="#c2b896"
        />
        <path
          d={`M2400 -600 L${vx + 90} ${vy - 160} L${vx + 90} ${vy + 80} L2400 2200 Z`}
          fill="#b7c2c6"
          opacity={0.9}
        />
        <path
          d={`M-1300 -600 L2400 -600 L${vx + 90} ${vy - 160} L${vx - 90} ${vy - 160} Z`}
          fill="#d5d1c0"
        />
        <path
          d={`M-1300 2200 L2400 2200 L${vx + 90} ${vy + 80} L${vx - 90} ${vy + 80} Z`}
          fill="#9c968a"
        />
        {[0.15, 0.3, 0.48, 0.7].map((k, i) => (
          <rect
            key={i}
            x={vx - (120 / k) * 0.25}
            y={vy - 160 - (vy + 600) * (1 - k) * 0.6}
            width={(240 / k) * 0.25}
            height={14}
            fill="#fff8e0"
            opacity={0.8}
          />
        ))}
        {/* classroom doors on the left */}
        {[0.25, 0.45, 0.7].map((k, i) => {
          const x = vx - 90 - (vx + 500) * (1 - k) * 0.9;
          const hh = 240 + (1 - k) * 900;
          return (
            <rect
              key={i}
              x={x}
              y={vy + 80 - hh * 0.92 + (1 - k) * 160}
              width={60 + (1 - k) * 160}
              height={hh * 0.8}
              fill={i === 2 ? '#4a4a50' : '#6f7f8e'}
            />
          );
        })}
        {/* railing on the right */}
        {Array.from({ length: 9 }, (_, i) => {
          const k = 0.2 + i * 0.1;
          const x = vx + 90 + (1680 - vx) * (1 - k) * 0.55;
          return (
            <rect
              key={i}
              x={x}
              y={vy + 40 - (1 - k) * 300}
              width={16 + (1 - k) * 30}
              height={60 + (1 - k) * 700}
              fill="#d9d2bc"
            />
          );
        })}
      </g>
    ),
    back: (
      <g>
        <Door x={130} y={1500} w={260} h={640} color="#6f7f8e" open={o.doorOpen ?? 0} />
        {(o.chairOut ?? -1) >= 0 && (
          <PlasticChair x={420 + (o.chairOut ?? 0) * 140} y={1520} s={0.9} color="#5e7b8e" />
        )}
      </g>
    ),
    fg: <rect x={980} y={-200} width={180} height={2400} fill="#cfc7ae" />,
    glow: { x: vx, y: vy - 40, r: 700, color: '#fff0c8', a: 0.45 },
  };
};

/** Canteen: glass bread counter, long tables, stainless trays. */
export const canteen = (
  f: number,
  o: { breadGone?: boolean; empty?: boolean } = {},
): SetLayers => ({
  sky: '#3c3a36',
  far: (
    <g>
      <Wall y1={1380} top="#c7c0a8" bottom="#b4ac94" skirt="#7a7262" />
      <rect x={120} y={260} width={520} height={260} rx={12} fill="#4f5a50" />
      {tr(
        ['BÁNH MÌ ........ 15K', 'XÔI ................ 12K', 'NƯỚC MÍA ....... 8K'],
        ['SANDWICH ....... 15K', 'STICKY RICE .... 12K', 'SUGARCANE ...... 8K'],
      ).map((t, i) => (
        <text
          key={i}
          x={150}
          y={330 + i * 70}
          fontSize={40}
          fill="#efe8d0"
          fontFamily={FONT}
          fontWeight={600}
        >
          {t}
        </text>
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <rect key={i} x={-200 + i * 380} y={120} width={240} height={20} rx={6} fill="#fffbe8" />
      ))}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} color="#a39c8c" />
      <g transform="translate(560,1400)">
        <rect x={-460} y={-330} width={920} height={330} rx={12} fill="#8a7a62" />
        <rect
          x={-440}
          y={-520}
          width={880}
          height={200}
          rx={10}
          fill="#c9d6d8"
          opacity={0.6}
          stroke="#9aa6a8"
          strokeWidth={6}
        />
        {Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d={`M${-400 + i * 120} -340 Q${-380 + i * 120} -400 ${-320 + i * 120} -400 Q${-280 + i * 120} -400 ${-300 + i * 120} -340 Z`}
            fill="#d6a462"
          />
        ))}
      </g>
    </g>
  ),
  front: (
    <g>
      <g transform="translate(520,1640)">
        <SoftShadow x={0} y={60} rx={480} />
        <rect x={-460} y={-60} width={920} height={40} rx={12} fill="#b7aa92" />
        <rect x={-440} y={-20} width={20} height={150} fill="#7a6e5c" />
        <rect x={420} y={-20} width={20} height={150} fill="#7a6e5c" />
        {!o.empty && <Tray x={-250} y={-60} bread={!o.breadGone} />}
        {!o.empty && <Tray x={250} y={-60} bread />}
      </g>
    </g>
  ),
  glow: { x: 560, y: 1000, r: 600, color: '#ffe2a0', a: 0.35 },
});

/** Alley home in the afternoon: shopfronts, balconies, tangled power lines, parked motorbikes. */
export const alley = (f: number): SetLayers => ({
  sky: '#d9b9a0',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1600} fill="#d8b49c" />
      <circle cx={760} cy={300} r={110} fill="#ffe0b0" opacity={0.9} />
      {[
        [-300, 200, '#b9a48c'],
        [80, 120, '#a7998a'],
        [420, 260, '#bfa892'],
        [760, 160, '#a39488'],
        [1100, 220, '#b5a08a'],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <rect x={x as number} y={y as number} width={330} height={1400} fill={c as string} />
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect
                x={(x as number) + 50}
                y={(y as number) + 80 + k * 300}
                width={230}
                height={150}
                rx={6}
                fill="#7a7a86"
                opacity={0.7}
              />
              <rect
                x={(x as number) + 30}
                y={(y as number) + 240 + k * 300}
                width={270}
                height={14}
                fill="#5a5a60"
              />
            </g>
          ))}
        </g>
      ))}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1350} width={3700} height={1200} fill="#9a8f84" />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M-1300 ${300 + i * 26} Q540 ${420 + i * 30 + Math.sin(f / 30 + i) * 4} 2400 ${280 + i * 22}`}
          stroke="#2a2630"
          strokeWidth={3}
          fill="none"
        />
      ))}
      <rect x={180} y={-100} width={30} height={1480} fill="#7a7470" />
      <Motorbike x={820} y={1420} s={0.75} color="#8a5a50" />
      <Plant x={60} y={1380} s={0.8} f={f} />
    </g>
  ),
  fg: <rect x={-160} y={-300} width={140} height={2600} fill="#6a625c" />,
  glow: { x: 760, y: 300, r: 800, color: '#ffc890', a: 0.5 },
});

/** Classroom in the morning. */
export const classroom = (f: number): SetLayers => ({
  sky: '#3e4440',
  far: (
    <g>
      <Wall y1={1300} top="#d6cfae" bottom="#c4bc9a" skirt="#8a8262" />
      <Blackboard
        x={540}
        y={560}
        s={1}
        text={tr(['Thứ Hai, ngày …', 'Điểm danh'], ['Monday …', 'Attendance'])}
      />
      <text
        x={540}
        y={250}
        textAnchor="middle"
        fontSize={44}
        fontWeight={800}
        fill="#a4483c"
        fontFamily={FONT}
      >
        {tr('TIÊN HỌC LỄ – HẬU HỌC VĂN', 'MANNERS FIRST – THEN KNOWLEDGE')}
      </text>
      <CeilingFan x={240} y={120} s={0.6} f={f} />
      <CeilingFan x={840} y={120} s={0.6} f={f + 7} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1300} color="#a8a08c" />
      <Desk x={300} y={1340} s={0.7} color="#8a7058" />
    </g>
  ),
  glow: { x: 980, y: 500, r: 700, color: '#fff0c8', a: 0.45 },
});

/** Bedroom at night (yellow night lamp = warm light). warm: 0 = cold (C7), 1 = warm (C9). */
export const bedroom = (f: number, o: { warm?: number } = {}): SetLayers => {
  const w = o.warm ?? 0;
  return {
    sky: '#1e1c2c',
    far: (
      <g>
        <Wall y1={1450} top={shade('#3a3a5a', w * 0.15)} bottom={shade('#2e2c46', w * 0.1)} />
        <GrilleWindow x={620} y={300} w={300} h={380} night />
        <rect x={120} y={380} width={200} height={280} rx={6} fill="#5a5470" />
        <rect x={140} y={400} width={160} height={110} fill="#7a6a8a" />
        <circle cx={220} cy={600} r={30} fill="#8a7a6a" />
      </g>
    ),
    bg: (
      <g>
        <TileFloor y0={1450} color="#3e3a50" line="#00000030" />
      </g>
    ),
    back: (
      <g>
        <Bed x={560} y={1580} s={1} blanket="#6a7aa0" />
        <NightLamp x={110} y={1360} s={1} />
        <rect x={20} y={1360} width={180} height={200} rx={10} fill="#4e4458" />
      </g>
    ),
    glow: { x: 120, y: 1200, r: 650 + w * 200, color: '#ffc470', a: 0.45 + w * 0.2 },
  };
};

/** Lương Nhữ Học lantern street on the full-moon night: packed with lanterns, stalls, crowd, lion dance in the distance. */
export const lanternStreet = (
  f: number,
  o: {
    lionStill?: boolean;
    crowd?: number;
    lookAway?: number;
    bike?: boolean;
    bikeRunning?: boolean;
    police?: number;
  } = {},
): SetLayers => {
  const crowd = o.crowd ?? 1;
  return {
    sky: '#1c1828',
    far: (
      <g>
        <rect x={-1300} y={-600} width={3700} height={2600} fill="#241f34" />
        {[-1080, -740, -400, -60, 300, 640, 980, 1320, 1660, 2000].map((x, i) => (
          <g key={i}>
            <rect
              x={x}
              y={100 + (i % 2) * 80}
              width={330}
              height={1400}
              fill={['#3a3048', '#342c40', '#3e3450'][i % 3]}
            />
            {[0, 1, 2].map((k) => (
              <rect
                key={k}
                x={x + 60}
                y={200 + (i % 2) * 80 + k * 260}
                width={210}
                height={150}
                fill="#e8a860"
                opacity={0.25 + 0.15 * ((i + k) % 2)}
              />
            ))}
            <rect
              x={x + 20}
              y={880}
              width={290}
              height={60}
              rx={6}
              fill={['#a4483c', '#4a6a8a', '#8a6a3a'][i % 3]}
              opacity={0.8}
            />
          </g>
        ))}
        {o.bike !== false && (
          <Motorbike x={540} y={1170} s={0.42} f={f} running={o.bikeRunning} color="#4a4a52" />
        )}
        <CrowdSil
          y={1180}
          x0={-1000}
          x1={2000}
          n={Math.round(46 * crowd)}
          seed="far"
          s={0.34}
          f={f}
          moveDir={0.3}
        />
      </g>
    ),
    bg: (
      <g>
        <rect x={-1300} y={1150} width={3700} height={1400} fill="#3a3240" />
        {Array.from({ length: 4 }, (_, r) => (
          <path
            key={r}
            d={`M-1300 ${180 + r * 150} Q540 ${300 + r * 160} 2400 ${170 + r * 150}`}
            stroke="#1a1620"
            strokeWidth={3}
            fill="none"
          />
        ))}
        {Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 13 }, (_, i) => {
            const x = -1040 + i * 270 + (r % 2) * 130;
            const k = (x + 600) / 2280;
            const y = 180 + r * 150 + 4 * k * (1 - k) * 120 + 60;
            const kind = (i + r) % 4;
            const s = 0.5 + r * 0.08;
            return kind === 0 ? (
              <StarLantern
                key={`${r}${i}`}
                x={x}
                y={y + 50}
                s={s}
                f={f}
                color={['#e04a3a', '#e0a03a', '#d0503a'][i % 3]}
              />
            ) : kind === 1 ? (
              <SilkLantern
                key={`${r}${i}`}
                x={x}
                y={y + 30}
                s={s}
                f={f}
                color={['#c9483a', '#d08a3a', '#a84a6a'][i % 3]}
              />
            ) : kind === 2 ? (
              <CarpLantern key={`${r}${i}`} x={x} y={y + 40} s={s * 0.8} f={f} />
            ) : (
              <SilkLantern key={`${r}${i}`} x={x} y={y + 30} s={s} f={f} color="#e0b04a" />
            );
          }),
        )}
        {/* lantern stalls on both sides */}
        {[-380, 1340].map((x, i) => (
          <g key={x} transform={`translate(${x},1300)`}>
            <rect x={-200} y={-80} width={400} height={80} fill="#5a4a3a" />
            {Array.from({ length: 6 }, (_, k) => (
              <StarLantern
                key={k}
                x={-160 + k * 64}
                y={-110 - (k % 2) * 50}
                s={0.32}
                f={f + k * 10}
                color={['#e04a3a', '#e0a03a'][k % 2]}
              />
            ))}
            {i === 1 && <KeoQuan x={-120} y={-300} s={0.7} f={f} />}
          </g>
        ))}
        <Lion x={720} y={1290} s={0.55} f={f} still={o.lionStill} />
        <CrowdSil
          y={1360}
          x0={-1000}
          x1={2000}
          n={Math.round(34 * crowd)}
          seed="mid"
          s={0.55}
          f={f}
          moveDir={-0.5}
          lookAway={o.lookAway}
        />
      </g>
    ),
    fg: (
      <g>
        <StarLantern x={-40} y={260} s={1.6} f={f} />
        <CarpLantern x={1080} y={380} s={1.4} f={f} color="#d8603a" />
        {(o.police ?? 0) > 0 && (
          <g style={{ mixBlendMode: 'screen' }}>
            <circle
              cx={-260}
              cy={1100}
              r={520}
              fill={Math.floor(f / 8) % 2 ? '#3a6aff' : '#ff3a3a'}
              opacity={0.35 * (o.police ?? 0)}
              style={{ filter: 'blur(60px)' }}
            />
            <circle
              cx={1300}
              cy={1000}
              r={480}
              fill={Math.floor(f / 8) % 2 ? '#ff3a3a' : '#3a6aff'}
              opacity={0.3 * (o.police ?? 0)}
              style={{ filter: 'blur(60px)' }}
            />
          </g>
        )}
      </g>
    ),
    glow: { x: 540, y: 600, r: 900, color: '#ffb060', a: 0.4 },
  };
};

/** Minimal muted backdrop (rules) – far layer. */
export const minimal = (top = '#4a4058', bottom = '#2c2636'): SetLayers => ({
  sky: bottom,
  far: (
    <g>
      <defs>
        <linearGradient id={`min${top}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x={-1300} y={-600} width={3700} height={3200} fill={`url(#min${top})`} />
      {Array.from({ length: 12 }, (_, i) => (
        <circle
          key={i}
          cx={random(`mn${i}`) * 1200 - 60}
          cy={random(`mny${i}`) * 1900}
          r={40 + random(`mnr${i}`) * 120}
          fill="#fff"
          opacity={0.04}
        />
      ))}
    </g>
  ),
  bg: <ellipse cx={500} cy={1500} rx={520} ry={70} fill="#000" opacity={0.25} />,
  glow: { x: 500, y: 700, r: 650, color: '#ffd8a0', a: 0.3 },
});
