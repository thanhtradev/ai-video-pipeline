import type { SetLayers } from '../whatif/sets';
import {
  Bed,
  Desk,
  Door,
  FloorLamp,
  Frame,
  Fridge,
  Lockers,
  Mailbox,
  NightLamp,
  ParkBench,
  PicketFence,
  Plant,
  RoundTree,
  SashWindow,
  StreetLamp,
  SuburbHouse,
  Car,
  Table,
  TileFloor,
  TvCabinet,
  Wall,
  WallClock,
  Whiteboard,
} from './props-intl';
import { FONT, shade } from '../whatif/theme';

/**
 * Western sets of the "What if… (EN)" kit (D-092), with the same layer contract as the whatif
 * sets (far · bg · back · front · fg, one warm glow, floor at y≈1500). `kit/active/sets` is this
 * file: the neutral whatif sets are re-exported, the Vietnam-specific ones (altar room, alley,
 * lantern street, Vietnamese schoolyard) are replaced by international ones.
 */
export type { SetLayers } from '../whatif/sets';
export { FLOOR, bathroom, minimal, teacherRoom } from '../whatif/sets';

/** Suburban living room: sash window, sofa, floor lamp, framed photos, TV, coffee table. */
export const livingRoom = (
  f: number,
  o: { fridgeOpen?: number; table?: boolean; night?: boolean } = {},
): SetLayers => ({
  sky: '#3a3340',
  far: (
    <g>
      <Wall y1={1380} top="#cfc6b4" bottom="#bcb29e" skirt="#ece6da" />
      <SashWindow x={220} y={640} w={300} h={420} night={o.night} />
      <Frame x={600} y={540} w={130} h={160} />
      <Frame x={760} y={510} w={90} h={110} tint="#9a8c7a" />
      <WallClock x={680} y={330} f={f} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} color="#9c8a72" line="#00000014" />
      <TvCabinet x={420} y={1400} s={0.8} />
      <Fridge x={900} y={1420} s={0.95} open={o.fridgeOpen ?? 0} />
      <FloorLamp x={40} y={1420} s={0.9} lit={Boolean(o.night)} />
    </g>
  ),
  back: (
    <g>
      {/* sofa */}
      <rect x={-260} y={1250} width={420} height={110} rx={40} fill="#7d8b99" />
      <rect x={-280} y={1330} width={460} height={140} rx={30} fill={shade('#7d8b99', -0.08)} />
    </g>
  ),
  front:
    o.table === false ? null : (
      <g>
        <Table x={500} y={1300} w={380} h={190} color="#8f6c50" />
      </g>
    ),
  fg: <Plant x={-80} y={2050} s={1.6} f={f} tone="#5f6d4a" />,
  glow: o.night
    ? { x: 60, y: 900, r: 520, color: '#ffc070', a: 0.38 }
    : { x: 220, y: 640, r: 640, color: '#ffe2b0', a: 0.42 },
});

/** High-school classroom: whiteboard, posters, clock, rows of desks. */
export const classroom = (f: number, o: { board?: string[] } = {}): SetLayers => ({
  sky: '#3e4440',
  far: (
    <g>
      <Wall y1={1300} top="#d9d3c2" bottom="#c6bfac" skirt="#8a8262" />
      <Whiteboard x={540} y={600} text={o.board ?? ['Monday', 'Homeroom']} />
      <WallClock x={1000} y={300} s={0.8} f={f} />
      {[
        [-380, 420, '#8797a6'],
        [-380, 700, '#c4a26a'],
      ].map(([x, y, c], i) => (
        <rect
          key={i}
          x={Number(x)}
          y={Number(y)}
          width={160}
          height={220}
          rx={6}
          fill={String(c)}
          opacity={0.75}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1300} color="#a8a08c" />
      <Desk x={300} y={1340} s={0.7} color="#8a7058" />
      <Desk x={760} y={1340} s={0.7} color="#8a7058" />
    </g>
  ),
  glow: { x: 980, y: 500, r: 700, color: '#fff0c8', a: 0.45 },
});

/** School hallway with lockers on both sides (one-point perspective); open = index of an open locker. */
export const hallway = (f: number, o: { open?: number; doorOpen?: number } = {}): SetLayers => {
  const vx = 600;
  const vy = 860;
  return {
    sky: '#40444a',
    far: (
      <g>
        <rect x={-1300} y={-600} width={3700} height={2400} fill="#b9b7a8" />
        <rect x={vx - 100} y={vy - 170} width={200} height={260} fill="#f2ecd4" />
        <path
          d={`M-1300 -600 L${vx - 100} ${vy - 170} L${vx - 100} ${vy + 90} L-1300 2200 Z`}
          fill="#c9c3ae"
        />
        <path
          d={`M2400 -600 L${vx + 100} ${vy - 170} L${vx + 100} ${vy + 90} L2400 2200 Z`}
          fill="#bfc4c2"
        />
        <path
          d={`M-1300 2200 L2400 2200 L${vx + 100} ${vy + 90} L${vx - 100} ${vy + 90} Z`}
          fill="#9c968a"
        />
        {[0.2, 0.35, 0.55, 0.75].map((k, i) => (
          <rect
            key={i}
            x={vx - 30 / k}
            y={vy - 170 - (vy + 600) * (1 - k) * 0.6}
            width={60 / k}
            height={12}
            fill="#fff8e0"
            opacity={0.8}
          />
        ))}
        {/* lockers fading into the distance on the right */}
        {Array.from({ length: 8 }, (_, i) => {
          const k = 0.25 + i * 0.09;
          const x = vx + 100 + (1700 - vx) * (1 - k) * 0.6;
          const hh = 260 + (1 - k) * 900;
          return (
            <rect
              key={i}
              x={x}
              y={vy + 90 - hh + (1 - k) * 200}
              width={30 + (1 - k) * 110}
              height={hh * 0.85}
              fill={i % 2 ? '#6f8599' : '#65798c'}
            />
          );
        })}
      </g>
    ),
    back: (
      <g>
        <Lockers x={-460} y={1500} n={4} open={o.open ?? -1} />
        <Door x={260} y={1500} w={240} h={600} color="#7b6a5a" open={o.doorOpen ?? 0} />
      </g>
    ),
    fg: <rect x={1000} y={-200} width={170} height={2400} fill="#6f8599" />,
    glow: { x: vx, y: vy - 40, r: 700, color: '#fff0c8', a: 0.42 },
  };
};

/** Bedroom at night: sash window with dark sky, bed, bedside lamp (warm light). warm 0…1. */
export const bedroom = (f: number, o: { warm?: number } = {}): SetLayers => {
  const w = o.warm ?? 0;
  return {
    sky: '#1e1c2c',
    far: (
      <g>
        <Wall y1={1450} top={shade('#3a3a5a', w * 0.15)} bottom={shade('#2e2c46', w * 0.1)} />
        <SashWindow x={770} y={500} w={280} h={380} night />
        <Frame x={260} y={560} w={150} h={190} tint="#5a5470" />
      </g>
    ),
    bg: <TileFloor y0={1450} color="#3e3a50" line="#00000030" />,
    back: (
      <g>
        <Bed x={560} y={1580} s={1} blanket="#6a7aa0" />
        <rect x={20} y={1360} width={180} height={200} rx={10} fill="#4e4458" />
        <NightLamp x={110} y={1360} s={1} />
      </g>
    ),
    glow: { x: 120, y: 1200, r: 650 + w * 200, color: '#ffc470', a: 0.45 + w * 0.2 },
  };
};

/** School cafeteria: menu board in English, long tables, trays. */
export const cafeteria = (f: number, o: { menu?: string[] } = {}): SetLayers => ({
  sky: '#3c3a36',
  far: (
    <g>
      <Wall y1={1380} top="#d0cab6" bottom="#bdb6a0" skirt="#7a7262" />
      <rect x={120} y={260} width={560} height={270} rx={12} fill="#4f5a50" />
      {(o.menu ?? ['PIZZA .......... $3', 'MAC & CHEESE ... $3', 'MILK ........... $1']).map(
        (t, i) => (
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
        ),
      )}
      <rect x={760} y={300} width={260} height={180} rx={10} fill="#e9e3d6" opacity={0.8} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1380} color="#b0a58f" pattern />
      <rect x={-200} y={1240} width={1500} height={60} rx={10} fill="#b7bdc2" />
      <rect x={-200} y={1300} width={1500} height={90} fill="#9aa0a6" />
    </g>
  ),
  front: (
    <g>
      <Table x={540} y={1430} w={760} h={200} color="#8a8a92" />
      {[300, 540, 780].map((tx) => (
        <rect key={tx} x={tx - 70} y={1404} width={140} height={22} rx={6} fill="#c9ced2" />
      ))}
    </g>
  ),
  glow: { x: 900, y: 500, r: 650, color: '#fff0c8', a: 0.4 },
});

/**
 * Suburban street: houses with lawns, picket fences, mailboxes, sidewalk, parked cars, street
 * lamps. night tints the windows warm; cars = false clears the street.
 */
export const suburbStreet = (
  f: number,
  o: { night?: boolean; cars?: boolean; mailFlag?: boolean } = {},
): SetLayers => ({
  sky: o.night ? '#28304a' : '#bcd3dc',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1700} fill={o.night ? '#28304a' : '#bcd3dc'} />
      <RoundTree x={-560} y={1060} s={0.8} f={f} tone="#7d8b6a" />
      <SuburbHouse x={-150} y={1080} s={0.85} wall="#c9c2b0" roof="#6d5f63" lit={o.night} />
      <SuburbHouse
        x={560}
        y={1080}
        s={0.85}
        wall="#b7c2c6"
        roof="#5f6470"
        door="#4f6a5a"
        lit={o.night}
      />
      <SuburbHouse x={1260} y={1080} s={0.85} wall="#d6c9b1" roof="#7a5e52" lit={o.night} />
      <RoundTree x={1620} y={1060} s={0.75} f={f} />
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1080} width={3700} height={140} fill="#8fa07a" />
      <PicketFence x0={-1300} x1={2400} y={1180} h={130} />
      <rect x={-1300} y={1220} width={3700} height={70} fill="#c9c3b6" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={-1300 + i * 190} y={1220} width={4} height={70} fill="#00000020" />
      ))}
      <rect x={-1300} y={1290} width={3700} height={1200} fill="#6f6e72" />
      <Mailbox x={200} y={1250} s={0.7} flag={o.mailFlag} />
      <StreetLamp x={980} y={1240} s={0.8} lit={o.night} />
    </g>
  ),
  back:
    o.cars === false ? null : (
      <g>
        <Car x={-380} y={1460} s={0.9} color="#a85d55" />
        <Car x={1460} y={1460} s={0.9} color="#7c8fa3" flip />
      </g>
    ),
  fg: <rect x={-1300} y={1800} width={3700} height={60} fill="#e9e3d6" opacity={0.6} />,
  glow: o.night
    ? { x: 980, y: 520, r: 520, color: '#ffcf8a', a: 0.4 }
    : { x: 900, y: 200, r: 800, color: '#fff2cf', a: 0.4 },
});

/** City park: lawn, trees, bench, path, a small soccer goal (goal = true). */
export const park = (
  f: number,
  o: { goal?: boolean; score?: [number, number] } = {},
): SetLayers => ({
  sky: '#c3d6dc',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={1700} fill="#c3d6dc" />
      {[-700, -200, 400, 1000, 1600].map((tx, i) => (
        <RoundTree
          key={tx}
          x={tx}
          y={1100}
          s={0.7 + (i % 2) * 0.15}
          f={f}
          tone={i % 2 ? '#6f7d55' : '#7d8b6a'}
        />
      ))}
    </g>
  ),
  bg: (
    <g>
      <rect x={-1300} y={1100} width={3700} height={1400} fill="#8fa07a" />
      <path d="M-1300 1500 Q300 1300 2400 1420 L2400 1480 Q300 1370 -1300 1580 Z" fill="#cfc3a6" />
      <ParkBench x={-160} y={1300} s={0.9} />
      {o.score && (
        <g>
          <rect x={780} y={1000} width={260} height={130} rx={10} fill="#3a3a42" />
          <text
            x={910}
            y={1090}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={72}
            fill="#ffd894"
          >
            {`${o.score[0]} – ${o.score[1]}`}
          </text>
        </g>
      )}
    </g>
  ),
  back: o.goal ? (
    <g>
      <rect x={700} y={1150} width={360} height={14} fill="#ece6da" />
      <rect x={700} y={1150} width={14} height={300} fill="#ece6da" />
      <rect x={1046} y={1150} width={14} height={300} fill="#ece6da" />
      <rect x={714} y={1164} width={332} height={286} fill="#ffffff" opacity={0.15} />
    </g>
  ) : null,
  fg: <Plant x={-60} y={2100} s={1.7} f={f} tone="#5f6d4a" />,
  glow: { x: 900, y: 200, r: 820, color: '#fff2cf', a: 0.42 },
});
