import * as base from '../whatif/sets-school';
import type { SetLayers } from '../whatif/sets';
import { FinishLook } from './atmosphere';
import { cinematicSet, Mood, Shade, WallWear } from './look';
import { TreeLeaves, TreeShade } from './set-detail';
import {
  BenchWithBags,
  CeilingBulb,
  Clouds,
  ShopFront,
  UtilityPole,
  WaterShimmer,
  WillowFg,
} from './set-detail-more';
import { FallingLeaves } from './set-motion';

/** The school and street sets with the cinematic look; everything else is unchanged. */
export * from '../whatif/sets-school';

const MORNING: FinishLook = {
  top: 'rgba(255,196,112,0.5)',
  bottom: 'rgba(84,70,78,0.26)',
  edge: 0.5,
  grain: 0.03,
};
const GOLD: FinishLook = {
  top: 'rgba(255,164,84,0.58)',
  bottom: 'rgba(90,56,62,0.3)',
  edge: 0.52,
  grain: 0.03,
};

export const schoolGate = (
  f: number,
  o: NonNullable<Parameters<typeof base.schoolGate>[1]> & { mood?: Mood } = {},
): SetLayers =>
  cinematicSet(
    base.schoolGate(f, o),
    f,
    {
      id: 'Sg',
      interior: false,
      source: { x: 1400, y: 320, r: 1000, a: 0.42 },
      color: '#ffe2a8',
      finish: MORNING,
      falloff: 0.42,
      rays: [
        { top: [1060, 1480], bottom: [200, 880], y0: 250, y1: 1480, a: 0.42, rays: 4, soft: 15 },
      ],
      bokeh: [
        { x: 1240, y: 500, r: 70, color: '#fff0bd' },
        { x: 880, y: 720, r: 50, color: '#ffe8ad' },
        { x: 480, y: 620, r: 44, color: '#fff2c6' },
        { x: 160, y: 860, r: 42, color: '#ffe0a0' },
      ],
      dust: { color: '#fff7da' },
      far: (
        <WallWear
          id="cineSgWear"
          x={-640}
          y={330}
          w={2300}
          h={1000}
          n={16}
          color="#6b5730"
          a={0.18}
        />
      ),
      bg: (
        <g>
          <TreeShade f={f} />
          <TreeLeaves id="sg" x={-620} y={1260} s={0.95} f={f} />
          <FallingLeaves seed="sgLeaves" x={-580} y={500} w={1250} h={960} f={f} n={14} />
        </g>
      ),
    },
    o.mood,
  );

export const traffic = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.traffic(f),
    f,
    {
      id: 'Tf',
      interior: false,
      source: { x: 1300, y: 340, r: 1100, a: 0.42 },
      color: '#ffd8a0',
      finish: { ...MORNING, top: 'rgba(255,176,104,0.54)' },
      falloff: 0.38,
      rays: [
        { top: [1000, 1500], bottom: [200, 1000], y0: 280, y1: 1500, a: 0.36, rays: 4, soft: 18 },
      ],
      bokeh: [
        { x: -320, y: 1180, r: 44, color: '#fff0c2' },
        { x: 40, y: 1200, r: 50, color: '#ffe8a8' },
        { x: 420, y: 1170, r: 42, color: '#ffd688' },
        { x: 810, y: 1200, r: 52, color: '#fff0c2' },
        { x: 1160, y: 1170, r: 44, color: '#ffe8a8' },
        { x: 1250, y: 560, r: 74, color: '#ffe0ac' },
      ],
      dust: { color: '#ffe6bd', n: 42 },
      far: <UtilityPole x={1120} y={1320} />,
      bg: (
        <g>
          <ShopFront x={-430} y={1310} w={400} c="#7f8f7a" />
          <ShopFront x={40} y={1310} w={360} c="#a86a54" />
          <ShopFront x={1030} y={1310} w={380} c="#6f8499" />
          <Shade id="cineTfRoad" y0={1320} y1={1560} color="#ffbe80" a={0.16} />
        </g>
      ),
    },
    o.mood,
  );

export const busStation = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.busStation(f),
    f,
    {
      id: 'Bs',
      interior: false,
      source: { x: 1500, y: 340, r: 1200, a: 0.56 },
      color: '#ffc070',
      finish: GOLD,
      falloff: 0.42,
      rays: [
        { top: [1100, 1600], bottom: [-300, 820], y0: 320, y1: 1560, a: 0.6, rays: 7, soft: 10 },
      ],
      bokeh: [
        { x: 1340, y: 520, r: 90, color: '#ffd28e' },
        { x: 860, y: 660, r: 50, color: '#ffc070' },
        { x: 420, y: 800, r: 44, color: '#ffd28e' },
        { x: 40, y: 700, r: 38, color: '#ffb868' },
      ],
      dust: { color: '#ffdca8', n: 44 },
      far: (
        <g>
          <CeilingBulb x={-280} y={500} f={f} />
          <CeilingBulb x={360} y={500} f={f + 30} />
          <CeilingBulb x={1040} y={500} f={f + 60} />
        </g>
      ),
      bg: (
        <g>
          <BenchWithBags x={-300} y={1270} />
          <Shade id="cineBsFloor" y0={1150} y1={1500} color="#ffae66" a={0.2} />
        </g>
      ),
    },
    o.mood,
  );

export const lake = (f: number, o: { mood?: Mood } = {}): SetLayers =>
  cinematicSet(
    base.lake(f),
    f,
    {
      id: 'La',
      interior: false,
      source: { x: 500, y: 300, r: 1100, a: 0.26 },
      color: '#f0e8d8',
      finish: {
        top: 'rgba(182,198,208,0.42)',
        bottom: 'rgba(44,58,76,0.36)',
        edge: 0.48,
        grain: 0.03,
      },
      filter: 'saturate(0.86)',
      bokeh: [
        { x: 240, y: 960, r: 44, color: '#dfe6ea' },
        { x: 720, y: 1020, r: 52, color: '#eef2f2' },
        { x: 1160, y: 960, r: 44, color: '#d6e0e6' },
      ],
      dust: { color: '#eef2f2', n: 16 },
      far: <Clouds y={340} f={f} color="#eaeef0" />,
      bg: <WaterShimmer x0={-640} x1={1630} y0={1020} y1={1290} f={f} color="#eef4f6" />,
      fg: <WillowFg x={1680} f={f} />,
    },
    o.mood,
  );
