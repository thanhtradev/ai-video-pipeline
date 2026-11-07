import * as base from '../whatif/sets';
import type { SetLayers } from '../whatif/sets';
import { FinishLook } from './atmosphere';
import { cinematicSet, Mood, Shade, WallWear } from './look';
import { FloorTiles } from './set-detail';
import {
  CeilingBulb,
  DeskRowFg,
  FilingCabinet,
  HangingCloth,
  Laundry,
  Poster,
  ShopFront,
  SideWindow,
  StackedChairs,
  TallWardrobe,
  WaterCooler,
  WallShelf,
} from './set-detail-more';

/** The rooms and streets of `kits/whatif/sets` in short form. Re-exported by `./sets`. */

const INDOOR_DAY: FinishLook = {
  top: 'rgba(255,196,120,0.42)',
  bottom: 'rgba(66,56,82,0.3)',
  edge: 0.56,
  grain: 0.035,
};

export const teacherRoom = (
  f: number,
  o: NonNullable<Parameters<typeof base.teacherRoom>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.teacherRoom(f, o),
    f,
    {
      id: 'Tr',
      interior: true,
      source: { x: 280, y: 600, r: 620, a: 0.42 },
      color: '#fff0c8',
      finish: INDOOR_DAY,
      falloff: 0.56,
      glass: { x: 120, y: 360, w: 340, h: 440 },
      rays: [
        { top: [130, 450], bottom: [330, 1040], y0: 400, y1: 1500, a: 0.58, rays: 6, soft: 8 },
      ],
      bokeh: [
        { x: 200, y: 520, r: 60, color: '#fff0c8' },
        { x: 390, y: 700, r: 44, color: '#fff4d6' },
        { x: 760, y: 610, r: 38, color: '#e9dcb4' },
        { x: 1240, y: 700, r: 48, color: '#d9d2b6' },
      ],
      reflectionY: 1505,
      far: (
        <g>
          <WallWear
            id="cineTrWear"
            x={-640}
            y={330}
            w={2300}
            h={1060}
            n={18}
            color="#4f5a4c"
            a={0.2}
          />
          <Poster x={-300} y={560} w={230} h={300} c={['#e0d6b8', '#a4483c']} />
          <Poster x={-540} y={610} w={170} h={220} c={['#d6cfae', '#5f6f8a']} />
          <WallShelf x={1230} y={800} w={330} />
          <Poster x={1320} y={470} w={210} h={240} c={['#dcd6bc', '#7a8a6a']} />
          <Shade id="cineTrSkirt" y0={1400} y1={1190} a={0.34} />
        </g>
      ),
      bg: (
        <g>
          <FloorTiles id="cineTrTiles" y0={1400} vx={500} color="#2a2a22" />
          <FilingCabinet x={1320} y={1420} />
          <FilingCabinet x={-420} y={1420} />
          <WaterCooler x={-180} y={1420} />
        </g>
      ),
    },
    o.mood,
  );

export const bathroom = (
  f: number,
  o: NonNullable<Parameters<typeof base.bathroom>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.bathroom(f, o),
    f,
    {
      id: 'Ba',
      interior: true,
      source: { x: 760, y: 400, r: 620, a: 0.5 },
      color: '#fff2cf',
      finish: { ...INDOOR_DAY, bottom: 'rgba(40,66,84,0.32)' },
      falloff: 0.58,
      glass: { x: 640, y: 310, w: 240, h: 170 },
      rays: [{ top: [650, 880], bottom: [180, 820], y0: 330, y1: 1500, a: 0.6, rays: 3, soft: 14 }],
      bokeh: [
        { x: 720, y: 420, r: 62, color: '#fff2cf' },
        { x: 380, y: 620, r: 46, color: '#dcecef' },
        { x: 1000, y: 800, r: 40, color: '#e8f2f2' },
      ],
      reflectionY: 1505,
      reflection: 0.2,
      far: (
        <g>
          <WallWear
            id="cineBaWear"
            x={-640}
            y={330}
            w={2300}
            h={1150}
            n={18}
            color="#567074"
            a={0.2}
          />
          <HangingCloth x={1250} y={640} color="#d68a78" />
          <HangingCloth x={1370} y={640} color="#7f9db0" />
          <rect x={1200} y={626} width={260} height={10} rx={5} fill="#7f8a8c" />
          <g fill="#7f8a8c">
            <rect x={-400} y={470} width={14} height={470} />
            <path d="M-400 470 Q-400 430 -340 430 L-300 430 L-300 446 L-340 446 Q-386 446 -386 480 Z" />
            <ellipse cx={-296} cy={456} rx={50} ry={16} fill="#a6b0b2" />
          </g>
          <Shade id="cineBaSkirt" y0={1500} y1={1250} a={0.3} />
        </g>
      ),
    },
    o.mood,
  );

export const hallway = (
  f: number,
  o: NonNullable<Parameters<typeof base.hallway>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.hallway(f, o),
    f,
    {
      id: 'Ha',
      interior: true,
      source: { x: 600, y: 840, r: 640, a: 0.58 },
      color: '#fff0c8',
      finish: INDOOR_DAY,
      falloff: 0.46,
      rays: [
        { top: [1050, 1500], bottom: [520, 760], y0: 500, y1: 1540, a: 0.28, rays: 4, soft: 16 },
      ],
      bokeh: [
        { x: 600, y: 830, r: 74, color: '#fff4d2' },
        { x: 870, y: 640, r: 44, color: '#fff0c8' },
        { x: 1100, y: 760, r: 40, color: '#e6e8e4' },
        { x: 330, y: 700, r: 38, color: '#e6e2c6' },
      ],
      reflectionY: 1505,
      reflection: 0.22,
    },
    o.mood,
  );

export const canteen = (
  f: number,
  o: NonNullable<Parameters<typeof base.canteen>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.canteen(f, o),
    f,
    {
      id: 'Ca',
      interior: true,
      source: { x: 1270, y: 640, r: 760, a: 0.44 },
      color: '#ffe2a0',
      finish: INDOOR_DAY,
      falloff: 0.5,
      glass: { x: 1110, y: 400, w: 330, h: 520 },
      rays: [
        { top: [1120, 1430], bottom: [380, 1000], y0: 430, y1: 1540, a: 0.56, rays: 6, soft: 9 },
      ],
      bokeh: [
        { x: 1240, y: 600, r: 66, color: '#ffe8b0' },
        { x: 800, y: 900, r: 44, color: '#ffe2a0' },
        { x: 240, y: 880, r: 44, color: '#ffd889' },
        { x: 560, y: 950, r: 36, color: '#fff0cc' },
      ],
      reflectionY: 1505,
      far: (
        <g>
          <WallWear
            id="cineCaWear"
            x={-640}
            y={330}
            w={2300}
            h={1050}
            n={18}
            color="#5f5640"
            a={0.2}
          />
          <SideWindow id="cineCaWin" x={1110} y={400} w={330} h={520} />
          <SideWindow id="cineCaWin2" x={-520} y={400} w={280} h={520} sky="#efe5c6" />
          <CeilingBulb x={120} y={400} f={f} />
          <CeilingBulb x={900} y={390} f={f + 40} />
          <Shade id="cineCaSkirt" y0={1400} y1={1180} a={0.34} />
        </g>
      ),
      bg: (
        <g>
          <FloorTiles id="cineCaTiles" y0={1400} vx={500} color="#2a2418" />
          <StackedChairs x={-120} y={1450} color="#a85d55" />
          <StackedChairs x={-30} y={1450} color="#5f7f96" />
          <WaterCooler x={1140} y={1430} />
        </g>
      ),
    },
    o.mood,
  );

export const alley = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.alley(f),
    f,
    {
      id: 'Al',
      interior: false,
      source: { x: 980, y: 300, r: 980, a: 0.48 },
      color: '#ffc890',
      finish: { ...INDOOR_DAY, top: 'rgba(255,170,96,0.56)', edge: 0.5 },
      falloff: 0.46,
      rays: [
        { top: [760, 1200], bottom: [80, 780], y0: 250, y1: 1500, a: 0.42, rays: 4, soft: 15 },
        { top: [1240, 1480], bottom: [860, 1300], y0: 250, y1: 1500, a: 0.26, rays: 2, soft: 20 },
      ],
      bokeh: [
        { x: 960, y: 460, r: 74, color: '#ffd698' },
        { x: 540, y: 640, r: 46, color: '#ffc890' },
        { x: 1240, y: 760, r: 52, color: '#ffe0ac' },
        { x: 190, y: 800, r: 42, color: '#ffc27a' },
        { x: 720, y: 920, r: 36, color: '#ffdfa8' },
      ],
      dust: { color: '#ffe6bd' },
      far: (
        <g>
          <Laundry x0={-610} x1={-120} y={560} f={f} />
          <Laundry x0={1020} x1={1590} y={700} f={f + 50} />
        </g>
      ),
      bg: (
        <g>
          <ShopFront x={-420} y={1340} w={430} c="#7f8f7a" />
          <ShopFront x={1320} y={1340} w={460} c="#a86a54" />
          <Shade id="cineAlGround" y0={1340} y1={1520} color="#ffbf80" a={0.2} />
        </g>
      ),
    },
    o.mood,
  );

export const classroom = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.classroom(f),
    f,
    {
      id: 'Cl',
      interior: true,
      source: { x: 1320, y: 620, r: 740, a: 0.46 },
      color: '#fff0c8',
      finish: INDOOR_DAY,
      falloff: 0.5,
      glass: { x: 1170, y: 400, w: 330, h: 500 },
      rays: [
        { top: [1180, 1490], bottom: [430, 1060], y0: 420, y1: 1500, a: 0.58, rays: 6, soft: 9 },
      ],
      bokeh: [
        { x: 1270, y: 560, r: 68, color: '#fff0c8' },
        { x: 900, y: 780, r: 42, color: '#fff4d2' },
        { x: 240, y: 720, r: 46, color: '#e6dfbf' },
        { x: 560, y: 930, r: 34, color: '#fff0c8' },
      ],
      reflectionY: 1505,
      reflection: 0.08,
      far: (
        <g>
          <WallWear
            id="cineClWear"
            x={-640}
            y={330}
            w={2300}
            h={960}
            n={18}
            color="#6d6544"
            a={0.2}
          />
          <SideWindow id="cineClWin" x={1170} y={400} w={330} h={500} />
          <Poster x={-380} y={470} w={190} h={250} c={['#e6dfc4', '#a4483c']} />
          <Poster x={-120} y={500} w={140} h={190} c={['#e6dfc4', '#5f7f96']} />
          <WallShelf x={-430} y={860} w={420} />
          <Shade id="cineClSkirt" y0={1300} y1={1120} a={0.32} />
        </g>
      ),
      bg: <FloorTiles id="cineClTiles" y0={1310} vx={500} color="#2a2a1e" />,
      fg: <DeskRowFg y={1640} />,
    },
    o.mood,
  );

export const bedroom = (
  f: number,
  o: NonNullable<Parameters<typeof base.bedroom>[1]> & { mood?: Mood } = {},
): SetLayers => {
  const warm = o.warm ?? 0;
  return cinematicSet(
    base.bedroom(f, o),
    f,
    {
      id: 'Be',
      interior: true,
      source: { x: 120, y: 1160, r: 640, a: 0.42 + warm * 0.18 },
      color: '#ffc470',
      finish: {
        top: 'rgba(60,76,150,0.4)',
        bottom: 'rgba(24,20,62,0.42)',
        edge: 0.68,
        grain: 0.04,
      },
      glass: { x: 640, y: 320, w: 240, h: 300 },
      rays: [
        { top: [670, 870], bottom: [260, 900], y0: 340, y1: 1500, a: 0.14, rays: 4, soft: 12 },
      ],
      bokeh: [
        { x: 110, y: 1130, r: 74, color: '#ffc470' },
        { x: 760, y: 440, r: 54, color: '#8fa8ef' },
        { x: 360, y: 960, r: 38, color: '#ffb864' },
        { x: 1160, y: 800, r: 42, color: '#6f88d8' },
      ],
      reflectionY: 1505,
      reflection: 0.14,
      dust: { color: '#ffd9a0', n: 22 },
      far: (
        <g>
          <TallWardrobe x={-390} y={1500} color="#32293f" />
          <Poster x={1270} y={520} w={230} h={280} c={['#454063', '#7a6890']} />
          <WallShelf x={1100} y={920} w={380} tone="#2e2838" />
        </g>
      ),
    },
    o.mood,
  );
};

export const lanternStreet = (
  f: number,
  o: NonNullable<Parameters<typeof base.lanternStreet>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.lanternStreet(f, o),
    f,
    {
      id: 'Ls',
      interior: false,
      source: { x: 540, y: 620, r: 980, a: 0.36 },
      color: '#ffb060',
      finish: {
        top: 'rgba(255,146,76,0.42)',
        bottom: 'rgba(30,20,70,0.42)',
        edge: 0.6,
        grain: 0.04,
      },
      bokeh: [
        { x: -300, y: 500, r: 72, color: '#ffb35f' },
        { x: 40, y: 640, r: 56, color: '#ff8a4a' },
        { x: 330, y: 470, r: 68, color: '#ffd678' },
        { x: 640, y: 620, r: 54, color: '#ff6e4a' },
        { x: 930, y: 480, r: 70, color: '#ffc05f' },
        { x: 1200, y: 640, r: 58, color: '#ff8a4a' },
        { x: 1450, y: 510, r: 64, color: '#ffd678' },
      ],
      dust: { color: '#ffc58a', n: 40 },
    },
    o.mood,
  );

/** The muted rule backdrop, with only light and dust added. */
export const minimal = (top?: string, bottom?: string): SetLayers =>
  cinematicSet(base.minimal(top, bottom), 0, {
    id: 'Mi',
    interior: false,
    source: { x: 500, y: 700, r: 760, a: 0.2 },
    color: '#ffd8a0',
    finish: {
      top: 'rgba(255,190,130,0.28)',
      bottom: 'rgba(30,26,70,0.36)',
      edge: 0.62,
      grain: 0.035,
    },
    dust: { color: '#ffe0b4', n: 22 },
  });
