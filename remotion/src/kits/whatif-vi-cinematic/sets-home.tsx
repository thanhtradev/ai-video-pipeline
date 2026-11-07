import * as base from '../whatif/sets-home';
import type { SetLayers } from '../whatif/sets';
import { FinishLook } from './atmosphere';
import { cinematicSet, Mood, Shade, WallWear } from './look';
import { BackDoor, DisplayCabinet, FloorTiles, HelmetAndShoes, WallMeter } from './set-detail';
import {
  Laundry,
  PendantLamp,
  Poster,
  ShopFront,
  SideWindow,
  UtilityPole,
  WallShelf,
} from './set-detail-more';
import { FallingLeaves, flicker } from './set-motion';

/** The home sets with the cinematic look; everything else in the module is unchanged. */
export * from '../whatif/sets-home';

const WARM_DAY: FinishLook = {
  top: 'rgba(255,190,110,0.46)',
  bottom: 'rgba(70,56,84,0.3)',
  edge: 0.56,
  grain: 0.035,
};
const NIGHT_INSIDE: FinishLook = {
  top: 'rgba(255,156,84,0.36)',
  bottom: 'rgba(26,22,66,0.44)',
  edge: 0.68,
  grain: 0.04,
};
const LOW_SUN: FinishLook = {
  top: 'rgba(255,170,92,0.56)',
  bottom: 'rgba(84,58,70,0.3)',
  edge: 0.52,
  grain: 0.03,
};

export const bedroomDay = (
  f: number,
  o: NonNullable<Parameters<typeof base.bedroomDay>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.bedroomDay(f, o),
    f,
    {
      id: 'Bd',
      interior: true,
      source: o.dark ? { x: 1000, y: 1000, r: 520, a: 0.24 } : { x: 780, y: 540, r: 700, a: 0.46 },
      color: o.dark ? '#7ab0ff' : '#ffe2a8',
      finish: o.dark ? NIGHT_INSIDE : WARM_DAY,
      falloff: 0.48,
      glass: { x: 610, y: 320, w: 330, h: 440 },
      rays: o.dark
        ? undefined
        : [{ top: [620, 930], bottom: [40, 680], y0: 340, y1: 1500, a: 0.58, rays: 5, soft: 9 }],
      bokeh: [
        { x: 760, y: 480, r: 66, color: o.dark ? '#7ab0ff' : '#ffe2a8' },
        { x: 400, y: 800, r: 44, color: '#ffe6b6' },
        { x: 1170, y: 720, r: 48, color: '#f0d6a0' },
        { x: 70, y: 660, r: 36, color: '#e8d6b0' },
      ],
      reflectionY: 1505,
      reflection: 0.08,
      far: (
        <WallWear
          id="cineBdWear"
          x={-640}
          y={330}
          w={2300}
          h={1100}
          n={16}
          color="#55607a"
          a={0.17}
        />
      ),
    },
    o.mood,
  );

export const dining = (
  f: number,
  o: NonNullable<Parameters<typeof base.dining>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.dining(f, o),
    f,
    {
      id: 'Di',
      interior: true,
      source: { x: 620, y: 860, r: 760, a: 0.52 * flicker(f, 6) },
      color: '#ffc070',
      finish: o.night ? NIGHT_INSIDE : { ...WARM_DAY, top: 'rgba(255,170,90,0.48)' },
      falloff: 0.64,
      bokeh: [
        { x: 620, y: 640, r: 72, color: '#ffc682' },
        { x: 260, y: 700, r: 46, color: '#fff0c4' },
        { x: 960, y: 900, r: 42, color: '#ffb868' },
        { x: 1320, y: 860, r: 50, color: '#ffb868' },
      ],
      reflectionY: 1505,
      reflection: 0.14,
      far: (
        <g>
          <WallWear
            id="cineDiWear"
            x={-640}
            y={330}
            w={2300}
            h={1050}
            n={20}
            color="#6e5a40"
            a={0.22}
          />
          <BackDoor x={-420} y={1380} />
          <WallMeter />
          <HelmetAndShoes x={-170} y={1380} />
          <Shade id="cineDiSkirt" y0={1380} y1={1160} a={0.32} />
        </g>
      ),
      bg: (
        <g>
          <FloorTiles id="cineDiTiles" y0={1385} vx={500} color="#2a1c12" />
          <DisplayCabinet x={1330} y={1400} />
        </g>
      ),
      behind: <PendantLamp x={620} y={620} f={f} />,
    },
    o.mood,
  );

export const yardField = (
  f: number,
  o: NonNullable<Parameters<typeof base.yardField>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.yardField(f, o),
    f,
    {
      id: 'Yf',
      interior: false,
      source: { x: 980, y: 300, r: 1000, a: 0.46 },
      color: '#ffc890',
      finish: LOW_SUN,
      falloff: 0.42,
      rays: [
        { top: [720, 1180], bottom: [60, 760], y0: 250, y1: 1500, a: 0.42, rays: 4, soft: 15 },
      ],
      bokeh: [
        { x: 960, y: 480, r: 72, color: '#ffd698' },
        { x: 520, y: 700, r: 46, color: '#ffc890' },
        { x: 1240, y: 800, r: 50, color: '#ffdfa8' },
        { x: 170, y: 780, r: 42, color: '#ffc27a' },
      ],
      far: (
        <g>
          <Laundry x0={-600} x1={-90} y={560} f={f} />
          <Laundry x0={1060} x1={1600} y={660} f={f + 50} />
        </g>
      ),
      bg: (
        <g>
          <Shade id="cineYfGround" y0={1340} y1={1560} color="#ffbf80" a={0.22} />
          <ShopFront x={1420} y={1340} w={380} c="#7f8f7a" />
        </g>
      ),
    },
    o.mood,
  );

export const lot = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.lot(f),
    f,
    {
      id: 'Lo',
      interior: false,
      source: { x: 1300, y: 420, r: 1100, a: 0.6 },
      color: '#ffc890',
      finish: LOW_SUN,
      falloff: 0.4,
      rays: [
        { top: [1050, 1500], bottom: [120, 980], y0: 320, y1: 1540, a: 0.46, rays: 5, soft: 14 },
      ],
      bokeh: [
        { x: 1240, y: 480, r: 86, color: '#ffe0ac' },
        { x: 860, y: 760, r: 48, color: '#ffc890' },
        { x: 390, y: 880, r: 40, color: '#ffd698' },
      ],
      far: <UtilityPole x={-180} y={1320} />,
      bg: (
        <g>
          <Shade id="cineLoGround" y0={1300} y1={1560} color="#ffb678" a={0.25} />
          <FallingLeaves
            seed="loLeaves"
            x={-500}
            y={700}
            w={1800}
            h={800}
            f={f}
            n={10}
            size={0.8}
          />
        </g>
      ),
    },
    o.mood,
  );

export const balcony = (
  f: number,
  o: NonNullable<Parameters<typeof base.balcony>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.balcony(f, o),
    f,
    {
      id: 'Bl',
      interior: false,
      source: { x: -440, y: 1000, r: 760, a: 0.4 },
      color: '#ffc070',
      finish: {
        top: 'rgba(52,76,160,0.48)',
        bottom: 'rgba(36,24,66,0.42)',
        edge: 0.64,
        grain: 0.04,
      },
      bokeh: [
        { x: 200, y: 700, r: 54, color: '#ffc774' },
        { x: 470, y: 560, r: 44, color: '#ffd98a' },
        { x: 700, y: 760, r: 62, color: '#ff9c58' },
        { x: 960, y: 540, r: 48, color: '#ffd98a' },
        { x: 1210, y: 720, r: 60, color: '#ffc774' },
        { x: 1430, y: 590, r: 42, color: '#8fb0ff' },
        { x: 40, y: 500, r: 40, color: '#8fb0ff' },
      ],
      dust: { color: '#ffd9a0', n: 18 },
      far: <Laundry x0={40} x1={560} y={520} f={f} />,
    },
    o.mood,
  );

export const kitchen = (
  f: number,
  o: NonNullable<Parameters<typeof base.kitchen>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.kitchen(f, o),
    f,
    {
      id: 'Ki',
      interior: true,
      source: { x: 500, y: 680, r: 860, a: 0.54 },
      color: '#ffc070',
      finish: NIGHT_INSIDE,
      falloff: 0.66,
      glass: { x: -490, y: 500, w: 300, h: 380 },
      rays: [{ top: [420, 580], bottom: [40, 960], y0: 620, y1: 1520, a: 0.42, soft: 22 }],
      bokeh: [
        { x: 500, y: 620, r: 74, color: '#ffd28e' },
        { x: 760, y: 860, r: 42, color: '#ffc070' },
        { x: 170, y: 860, r: 46, color: '#ffb868' },
        { x: -340, y: 680, r: 54, color: '#6f88d8' },
      ],
      reflectionY: 1505,
      reflection: 0.14,
      far: (
        <g>
          <WallWear
            id="cineKiWear"
            x={-640}
            y={330}
            w={2300}
            h={1050}
            n={18}
            color="#5a4530"
            a={0.22}
          />
          <SideWindow id="cineKiWin" x={-490} y={500} w={300} h={380} sky="#27345e" />
          <rect x={-490} y={500} width={300} height={380} fill="#1f2b52" opacity={0.74} />
          <WallShelf x={1090} y={680} w={420} />
          <Poster x={1190} y={780} w={170} h={200} c={['#e2d6b8', '#a4483c']} />
        </g>
      ),
      behind: <PendantLamp x={500} y={590} f={f} />,
    },
    o.mood,
  );

export const stairs = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.stairs(f),
    f,
    {
      id: 'St',
      interior: true,
      source: { x: 1240, y: 1260, r: 1000, a: 0.56 * flicker(f, 7) },
      color: '#ffc070',
      finish: NIGHT_INSIDE,
      rays: [
        { top: [1020, 1540], bottom: [560, 1180], y0: 1500, y1: 620, a: 0.3, rays: 3, soft: 26 },
      ],
      bokeh: [
        { x: 1240, y: 1120, r: 80, color: '#ffc682' },
        { x: 980, y: 800, r: 48, color: '#ffb868' },
        { x: 560, y: 1000, r: 36, color: '#d0964e' },
      ],
      dust: { color: '#ffd09c', n: 26 },
      far: (
        <g>
          <Poster x={-120} y={540} w={170} h={210} c={['#7a6a5e', '#3f3540']} />
          <Poster x={130} y={420} w={130} h={170} c={['#7a6a5e', '#3f3540']} />
          <Poster x={-420} y={700} w={200} h={250} c={['#6a5b50', '#332b36']} />
        </g>
      ),
    },
    o.mood,
  );
