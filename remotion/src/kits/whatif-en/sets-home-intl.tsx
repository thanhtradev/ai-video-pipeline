import type { SetLayers } from '../whatif/sets';
import { AlarmClock, Wardrobe } from '../whatif/sets-home';
import {
  Bed,
  DailyCalendar,
  Door,
  FloorLamp,
  Fridge,
  Mailbox,
  PicketFence,
  Plant,
  PlatesMeal,
  Range,
  RoundTree,
  SashWindow,
  SoftShadow,
  Table,
  TileFloor,
  UpperCabinets,
  Wall,
  WallClock,
} from './props-intl';
import { FONT, shade } from '../whatif/theme';
import { livingRoom } from './sets-intl';

/**
 * Western home sets of the "What if… (EN)" kit (D-092): `kit/active/sets-home`. Same world as the
 * whatif home sets (floor y≈1450–1520, wide shot around x≈500), one warm light each.
 */
export { AlarmClock, PhoneScreen, Wardrobe, lot, stairs } from '../whatif/sets-home';

/** Bedroom in the morning: sunny sash window, bed, study desk with laptop, wardrobe, poster. */
export const bedroomDay = (
  f: number,
  o: {
    ajar?: number;
    shake?: number;
    doorOpen?: number;
    ring?: boolean;
    time?: string;
    dark?: boolean;
    poster?: string;
  } = {},
): SetLayers => ({
  sky: o.dark ? '#1e1c2c' : '#3a3a44',
  far: (
    <g>
      <Wall
        y1={1450}
        top={o.dark ? '#3a3a5a' : '#bcc6c8'}
        bottom={o.dark ? '#2e2c46' : '#a9b4b6'}
        skirt={o.dark ? '#25233a' : '#ece6da'}
      />
      <SashWindow x={780} y={560} w={320} h={420} night={o.dark} />
      <rect x={180} y={420} width={220} height={300} rx={6} fill={o.dark ? '#4a4660' : '#5f7186'} />
      <text
        x={290}
        y={600}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={40}
        fill={o.dark ? '#8a86a0' : '#f3e2c2'}
      >
        {o.poster ?? 'GO TEAM!'}
      </text>
      <WallClock x={1080} y={360} f={f} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1450} color={o.dark ? '#3e3a50' : '#a88f74'} line="#00000014" />
      <Wardrobe x={-330} y={1440} f={f} ajar={o.ajar} shake={o.shake} />
      <Door x={1420} y={1440} w={240} h={640} color="#ece6da" open={o.doorOpen ?? 0} />
      <g transform="translate(1080,1440)">
        <SoftShadow x={0} y={0} rx={200} />
        <rect x={-190} y={-280} width={380} height={30} rx={8} fill="#9a7d5e" />
        <rect x={-180} y={-250} width={20} height={250} fill="#6a5440" />
        <rect x={160} y={-250} width={20} height={250} fill="#6a5440" />
        <path d="M-120 -290 L60 -290 L80 -282 L-140 -282 Z" fill="#3a3f48" />
        <rect x={-110} y={-400} width={160} height={110} rx={6} fill="#3a3f48" />
        <rect x={-100} y={-392} width={140} height={94} fill={o.dark ? '#5a8ac0' : '#7a8a9a'} />
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

/** Kitchen: upper cabinets, range with a pot, sink under the window, fridge, daily calendar. */
export const kitchen = (
  f: number,
  o: { boil?: number; night?: boolean; day?: number; month?: number } = {},
): SetLayers => ({
  sky: o.night ? '#22202e' : '#3a3a44',
  far: (
    <g>
      <Wall
        y1={1420}
        top={o.night ? '#5a5668' : '#d9d1bd'}
        bottom={o.night ? '#4a4658' : '#c6bea8'}
      />
      {/* backsplash tiles */}
      <rect x={-1300} y={1000} width={3700} height={220} fill={o.night ? '#6a6878' : '#e9e3d6'} />
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={-1300 + i * 95} y={1000} width={3} height={220} fill="#00000014" />
      ))}
      <UpperCabinets x0={-300} x1={420} y={900} />
      <SashWindow x={640} y={760} w={280} h={300} night={o.night} />
      <UpperCabinets x0={860} x1={1400} y={900} />
      <DailyCalendar x={-420} y={760} day={o.day} month={o.month} />
    </g>
  ),
  bg: (
    <g>
      <TileFloor y0={1420} color="#a89880" pattern />
      {/* counter */}
      <rect x={-300} y={1210} width={1700} height={40} rx={8} fill="#b7aa94" />
      <rect x={-300} y={1250} width={1700} height={190} fill="#d9d1c2" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={-290 + i * 190} y={1262} width={176} height={168} rx={6} fill="#cfc6b4" />
      ))}
      {/* sink */}
      <rect x={540} y={1206} width={200} height={16} rx={6} fill="#9aa0a6" />
      <path
        d="M640 1206 L640 1140 Q640 1120 664 1120 L690 1120"
        stroke="#9aa0a6"
        strokeWidth={12}
        fill="none"
      />
      <Range x={160} y={1440} f={f} boil={o.boil ?? 0} />
      <Fridge x={1300} y={1440} s={1} />
    </g>
  ),
  glow: o.night
    ? { x: 640, y: 700, r: 560, color: '#ffc070', a: 0.4 }
    : { x: 640, y: 760, r: 700, color: '#ffe8bf', a: 0.45 },
});

/** Dining room: the living room with the family dinner on plates (lasagna or pancakes). */
export const dining = (
  f: number,
  o: { food?: 'lasagna' | 'pancakes'; night?: boolean } = {},
): SetLayers => {
  const base = livingRoom(f, { night: o.night, table: false });
  return {
    ...base,
    front: (
      <g>
        <Table x={520} y={1230} w={620} h={280} color="#8f6c50" cloth="#e9e3d6" />
        <PlatesMeal x={520} y={1222} food={o.food ?? 'lasagna'} />
      </g>
    ),
    glow: { x: 520, y: 900, r: 620, color: '#ffc880', a: 0.45 },
  };
};

/** Front porch and yard of the hero's house: steps, door, mailbox, picket fence, lawn. */
export const frontPorch = (
  f: number,
  o: { night?: boolean; doorOpen?: number; mailFlag?: boolean } = {},
): SetLayers => ({
  sky: o.night ? '#28304a' : '#bcd3dc',
  far: (
    <g>
      <rect x={-1300} y={-600} width={3700} height={2000} fill={o.night ? '#28304a' : '#bcd3dc'} />
      <RoundTree x={1350} y={1250} s={0.9} f={f} />
    </g>
  ),
  bg: (
    <g>
      {/* house front, close */}
      <rect x={-500} y={-200} width={1500} height={1460} fill="#c9c2b0" />
      {Array.from({ length: 36 }, (_, i) => (
        <rect
          key={i}
          x={-500}
          y={-180 + i * 40}
          width={1500}
          height={3}
          fill={shade('#c9c2b0', -0.1)}
        />
      ))}
      <SashWindow x={-180} y={760} w={260} h={340} night={o.night} />
      <Door x={480} y={1260} w={240} h={560} color="#7b4a42" open={o.doorOpen ?? 0} />
      <rect x={-520} y={600} width={1540} height={30} fill="#6d5f63" />
      {[-450, 950].map((px) => (
        <rect key={px} x={px} y={630} width={24} height={630} fill="#ece6da" />
      ))}
      <rect x={-520} y={1260} width={1540} height={50} fill="#9a8f80" />
      <rect x={300} y={1310} width={360} height={60} fill="#8a8072" />
      <rect x={260} y={1370} width={440} height={60} fill="#7c7366" />
      <FloorLamp x={860} y={1260} s={0.6} lit={Boolean(o.night)} />
    </g>
  ),
  back: (
    <g>
      <rect x={-1300} y={1430} width={3700} height={1000} fill="#8fa07a" />
      <PicketFence x0={-1300} x1={160} y={1560} h={150} />
      <PicketFence x0={800} x1={2400} y={1560} h={150} />
      <Mailbox x={1100} y={1570} s={0.8} flag={o.mailFlag} />
    </g>
  ),
  glow: o.night
    ? { x: 860, y: 900, r: 480, color: '#ffcf8a', a: 0.45 }
    : { x: 1200, y: 200, r: 820, color: '#fff2cf', a: 0.42 },
});
