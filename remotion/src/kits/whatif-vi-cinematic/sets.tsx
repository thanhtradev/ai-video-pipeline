import type { BokehLight } from '../whatif/lens';
import * as base from '../whatif/sets';
import type { SetLayers } from '../whatif/sets';
import type { SceneLight } from '../../rig/scene-light';
import { Bloom, DustMotes, FinishLook, Haze, LightShaft } from './atmosphere';
import { enrich, Falloff, Mood, Shade, WallWear } from './look';
import {
  BackDoor,
  BikeRow,
  CarvedPanel,
  DisplayCabinet,
  FloorSun,
  FloorTiles,
  HangingLantern,
  HelmetAndShoes,
  NightView,
  PottedRow,
  RisingSmoke,
  StreetView,
  TreeLeaves,
  TreeShade,
  WallMeter,
  WindowGlare,
} from './set-detail';
import {
  BreathingCurtain,
  FallingLeaves,
  FanShadow,
  flicker,
  PassingRider,
  RainOnGlass,
  RainStreaks,
} from './set-motion';

/**
 * The whatif sets with the cinematic look, under the same names as `kits/whatif/sets`, which they
 * wrap. Everything else in that module is re-exported unchanged.
 * A 16:9 wide shot sees world x ≈ -630…1630 and y ≈ 305…1575.
 */
export * from '../whatif/sets';
// Every kit offers the same kit/active/* modules, so this kit's own tools come through `sets`.
export * from '../whatif/lens';
export * from './atmosphere';
export * from './inserts';
export * from './look';
export * from './set-detail';
export * from './set-detail-more';
export * from './set-motion';
export * from './shots';
export {
  alley,
  bathroom,
  bedroom,
  canteen,
  classroom,
  hallway,
  lanternStreet,
  minimal,
  teacherRoom,
} from './sets-rooms';

const LIVING_FINISH: FinishLook = {
  top: 'rgba(255,186,104,0.5)',
  bottom: 'rgba(70,52,84,0.3)',
  edge: 0.58,
  grain: 0.035,
};

const LIVING_MOODS: Readonly<
  Record<
    Mood,
    {
      finish: FinishLook;
      light: SceneLight;
      filter?: string;
      reflection: number;
      /** colour of the sun through the window, when there is sun, and of its glow */
      sun?: string;
      sunGlow?: string;
    }
  >
> = {
  golden: {
    finish: LIVING_FINISH,
    light: { side: -1, color: '#ffc677', strength: 0.9, wallShadow: true },
    reflection: 0.12,
    sun: '#ffd28e',
    sunGlow: '#ffdf9e',
  },
  clear: {
    finish: {
      top: 'rgba(206,226,255,0.36)',
      bottom: 'rgba(40,56,86,0.3)',
      edge: 0.52,
      grain: 0.03,
    },
    light: { side: -1, color: '#e6f0ff', strength: 0.78, wallShadow: true },
    filter: 'saturate(0.92)',
    reflection: 0.12,
    sun: '#eaf3ff',
    sunGlow: '#f2f7ff',
  },
  night: {
    finish: { top: 'rgba(60,90,170,0.5)', bottom: 'rgba(20,24,70,0.5)', edge: 0.72, grain: 0.04 },
    light: { side: -1, color: '#8fb0ff', strength: 0.85, wallShadow: true },
    filter: 'brightness(0.5) saturate(0.72)',
    reflection: 0.2,
  },
  overcast: {
    finish: {
      top: 'rgba(170,190,205,0.42)',
      bottom: 'rgba(52,62,78,0.34)',
      edge: 0.5,
      grain: 0.035,
    },
    light: { side: -1, color: '#d6e2ec', strength: 0.5 },
    filter: 'saturate(0.68) brightness(0.86)',
    reflection: 0.1,
  },
  rain: {
    finish: { top: 'rgba(70,100,165,0.52)', bottom: 'rgba(20,26,66,0.5)', edge: 0.74, grain: 0.04 },
    light: { side: -1, color: '#9cb8f4', strength: 0.8, wallShadow: true },
    filter: 'brightness(0.52) saturate(0.72)',
    reflection: 0.22,
  },
};

const LIVING_BOKEH: readonly BokehLight[] = [
  { x: 170, y: 560, r: 62, color: '#ffe2a2' },
  { x: 270, y: 760, r: 48, color: '#fff0c4' },
  { x: 650, y: 840, r: 40, color: '#ffcf8e' },
  { x: 880, y: 650, r: 34, color: '#ffe6b6' },
  { x: 1240, y: 720, r: 54, color: '#ffc882' },
  { x: 1330, y: 960, r: 38, color: '#d8c8a4' },
];

const NIGHT_BOKEH: readonly BokehLight[] = [
  { x: 150, y: 590, r: 60, color: '#7ea2ff' },
  { x: 300, y: 820, r: 44, color: '#ffc77e' },
  { x: 640, y: 720, r: 38, color: '#6c8cef' },
  { x: 1250, y: 760, r: 56, color: '#ffb369' },
];

export const livingRoom = (
  f: number,
  o: NonNullable<Parameters<typeof base.livingRoom>[1]> & { mood?: Mood } = {},
): SetLayers => {
  const { mood = 'golden', ...baseOptions } = o;
  const dark = mood === 'night' || mood === 'rain' || !!baseOptions.night;
  const config = LIVING_MOODS[mood];
  return enrich(base.livingRoom(f, { ...baseOptions, night: dark }), f, {
    far: (
      <g>
        <WallWear
          id="cineLrWear"
          x={-640}
          y={330}
          w={2300}
          h={1050}
          n={22}
          color="#6e5a40"
          a={0.22}
        />
        <BackDoor x={-420} y={1380} />
        <WallMeter />
        <HelmetAndShoes x={-170} y={1380} />
        <FanShadow x={520} y={520} f={f} />
        <Shade id="cineLrSkirt" y0={1380} y1={1160} a={0.34} />
        <Falloff id="cineLrFall" cx={205} cy={660} r={1500} a={0.62} inner={0.22} />
        {dark ? (
          <NightView x={80} y={430} w={250} h={470} />
        ) : (
          <>
            <StreetView x={80} y={430} w={250} h={470} />
            <PassingRider id="cineLrRider" x={80} y={430} w={250} h={470} f={f} />
          </>
        )}
        {mood === 'rain' && <RainOnGlass id="cineLrGlass" x={80} y={430} w={250} h={470} f={f} />}
        <BreathingCurtain x={10} y={406} w={78} h={530} f={f} dir={1} />
        <BreathingCurtain x={400} y={406} w={78} h={530} f={f + 30} dir={-1} />
      </g>
    ),
    bg: (
      <g>
        <FloorTiles id="cineLrTiles" y0={1385} vx={500} color="#2a1c12" />
        <DisplayCabinet x={1330} y={1400} />
        <Shade id="cineLrFloor" y0={1385} y1={1500} color="#2a1a12" a={0.26} />
        <Falloff id="cineLrFloorFall" cx={560} cy={1500} r={1250} a={0.5} inner={0.35} />
        {mood === 'golden' && <FloorSun />}
      </g>
    ),
    fg: (
      <g>
        <rect x={1560} y={160} width={600} height={1900} fill="#231b18" />
        <rect x={1532} y={160} width={34} height={1900} fill="#3f3128" />
      </g>
    ),
    behind: (
      <g>
        {config.sun && (
          <>
            <Bloom
              id="cineLrBloom"
              x={205}
              y={660}
              rx={520}
              ry={520}
              color={config.sunGlow ?? config.sun}
              a={0.5}
              f={f}
            />
            <LightShaft
              id="cineLrSun"
              top={[90, 320]}
              bottom={[340, 960]}
              y0={450}
              y1={1540}
              color={config.sun}
              a={0.8}
              f={f}
              rays={5}
              soft={9}
            />
          </>
        )}
        {dark && (
          <Bloom id="cineLrMoon" x={205} y={660} rx={420} ry={460} color="#5f7fdc" a={0.5} f={f} />
        )}
        {mood === 'overcast' && (
          <Bloom id="cineLrGrey" x={205} y={660} rx={460} ry={460} color="#dbe4ea" a={0.36} f={f} />
        )}
        <Haze id="cineLrHaze" x={-300} y={560} w={1500} h={640} color="#ffcf9c" a={0.1} f={f} />
      </g>
    ),
    over: (
      <g>
        <DustMotes id="cineLrDust" x={90} y={480} w={830} h={980} color="#fff0cc" f={f} n={40} />
        <DustMotes
          id="cineLrBokehDust"
          x={0}
          y={500}
          w={1100}
          h={900}
          color="#ffe9bd"
          f={f}
          n={9}
          size={15}
          a={0.2}
          seed={2}
        />
      </g>
    ),
    finish: config.finish,
    light: config.light,
    filter: config.filter,
    bokeh: dark ? NIGHT_BOKEH : LIVING_BOKEH,
    reflection: { y: 1505, a: config.reflection },
  });
};

const ALTAR_FINISH: FinishLook = {
  top: 'rgba(255,150,80,0.46)',
  bottom: 'rgba(36,26,70,0.36)',
  edge: 0.66,
  grain: 0.04,
};

export const altarRoom = (f: number, o: Parameters<typeof base.altarRoom>[1] = {}): SetLayers =>
  enrich(base.altarRoom(f, o), f, {
    far: (
      <g>
        <WallWear
          id="cineArWear"
          x={-640}
          y={300}
          w={2300}
          h={1200}
          n={16}
          color="#1f1414"
          a={0.3}
        />
        <CarvedPanel x={-340} y={1500} />
        <CarvedPanel x={1410} y={1500} />
        <Falloff id="cineArFall" cx={540} cy={860} r={1250} a={0.5} inner={0.3} color="#100a0d" />
        <Shade id="cineArCeil" y0={150} y1={700} color="#100a0d" a={0.68} />
        <Shade id="cineArSkirt" y0={1500} y1={1300} color="#100a0d" a={0.4} />
        <Bloom id="cineArHaloL" x={-70} y={566} rx={250} ry={250} color="#ff8a4a" a={0.5} f={f} />
        <Bloom id="cineArHaloR" x={1150} y={566} rx={250} ry={250} color="#ff8a4a" a={0.5} f={f} />
        <HangingLantern x={-70} y={510} f={f} seed={1} />
        <HangingLantern x={1150} y={510} f={f} seed={2} />
      </g>
    ),
    bg: (
      <g>
        <FloorTiles id="cineArTiles" y0={1560} vx={540} color="#120a08" />
        <Bloom id="cineArPool" x={540} y={1610} rx={1000} ry={150} color="#ffb878" a={0.42} f={f} />
      </g>
    ),
    behind: (
      <g>
        <Haze id="cineArHaze" x={120} y={330} w={850} h={720} color="#ffb479" a={0.2} f={f} n={8} />
        <Bloom
          id="cineArCandleL"
          x={276}
          y={834}
          rx={230}
          ry={230}
          color="#ffc27a"
          a={0.55 * flicker(f, 1)}
          f={f}
        />
        <Bloom
          id="cineArCandleR"
          x={782}
          y={834}
          rx={230}
          ry={230}
          color="#ffc27a"
          a={0.55 * flicker(f, 2)}
          f={f}
          seed={3}
        />
        <RisingSmoke x={540} y={650} f={f} color="#ffdcb4" />
        <LightShaft
          id="cineArBeam"
          top={[360, 720]}
          bottom={[120, 960]}
          y0={1000}
          y1={1570}
          color="#ffb070"
          a={0.3}
          f={f}
        />
      </g>
    ),
    over: (
      <DustMotes
        id="cineArDust"
        x={80}
        y={420}
        w={960}
        h={1030}
        color="#ffd09c"
        f={f}
        n={32}
        size={4}
        a={0.7}
      />
    ),
    finish: ALTAR_FINISH,
    light: { side: 1, color: '#ffae66', strength: 0.95 },
    reflection: { y: 1505, a: 0.14 },
    bokeh: [
      { x: -70, y: 620, r: 72, color: '#ff7f46' },
      { x: 1150, y: 620, r: 72, color: '#ff7f46' },
      { x: 276, y: 860, r: 58, color: '#ffc27a' },
      { x: 782, y: 860, r: 58, color: '#ffc27a' },
      { x: 150, y: 480, r: 40, color: '#d6a84a' },
      { x: 930, y: 460, r: 44, color: '#d6a84a' },
      { x: 150, y: 720, r: 36, color: '#d6a84a' },
      { x: 930, y: 760, r: 38, color: '#d6a84a' },
    ],
  });

const SCHOOL_FINISH: FinishLook = {
  top: 'rgba(255,190,104,0.55)',
  bottom: 'rgba(92,70,70,0.26)',
  edge: 0.5,
  grain: 0.03,
};

const FG_LEAVES = [
  { x: 1500, y: 300, rx: 210, ry: 66, r: -14 },
  { x: 1680, y: 380, rx: 240, ry: 74, r: 12 },
  { x: 1560, y: 215, rx: 240, ry: 72, r: 8 },
  { x: 1720, y: 520, rx: 190, ry: 60, r: -20 },
];

const SCHOOL_MOODS: Readonly<
  Record<Mood, { finish: FinishLook; light: SceneLight; filter?: string; sunny: boolean }>
> = {
  golden: {
    finish: SCHOOL_FINISH,
    light: { side: 1, color: '#ffd68e', strength: 0.88 },
    sunny: true,
  },
  clear: {
    finish: {
      top: 'rgba(206,226,255,0.4)',
      bottom: 'rgba(40,58,86,0.28)',
      edge: 0.46,
      grain: 0.03,
    },
    light: { side: 1, color: '#e6f0ff', strength: 0.8 },
    filter: 'saturate(0.94)',
    sunny: true,
  },
  night: {
    finish: { top: 'rgba(60,90,170,0.52)', bottom: 'rgba(16,22,64,0.52)', edge: 0.74, grain: 0.04 },
    light: { side: 1, color: '#9cb8f4', strength: 0.7 },
    filter: 'brightness(0.46) saturate(0.7)',
    sunny: false,
  },
  overcast: {
    finish: {
      top: 'rgba(174,194,206,0.48)',
      bottom: 'rgba(52,64,80,0.36)',
      edge: 0.46,
      grain: 0.03,
    },
    light: { side: 1, color: '#dde6ec', strength: 0.42 },
    filter: 'saturate(0.62) brightness(0.84)',
    sunny: false,
  },
  rain: {
    finish: {
      top: 'rgba(120,145,175,0.5)',
      bottom: 'rgba(36,46,70,0.44)',
      edge: 0.54,
      grain: 0.035,
    },
    light: { side: 1, color: '#c7d6e6', strength: 0.4 },
    filter: 'saturate(0.55) brightness(0.68)',
    sunny: false,
  },
};

const SCHOOL_BOKEH: readonly BokehLight[] = [
  { x: 300, y: 620, r: 58, color: '#fff0bd' },
  { x: 610, y: 560, r: 44, color: '#ffe8ad' },
  { x: 880, y: 720, r: 54, color: '#fff2c6' },
  { x: 1130, y: 590, r: 64, color: '#ffe8ad' },
  { x: 1320, y: 870, r: 42, color: '#fff0bd' },
  { x: 440, y: 950, r: 38, color: '#ffe0a0' },
];

export const schoolYard = (f: number, o: { mood?: Mood } = {}): SetLayers => {
  const mood = o.mood ?? 'golden';
  const config = SCHOOL_MOODS[mood];
  return enrich(base.schoolYard(f), f, {
    far: (
      <g>
        <WallWear
          id="cineSyWear"
          x={-640}
          y={330}
          w={2300}
          h={1000}
          n={20}
          color="#6b5730"
          a={0.2}
        />
        <WindowGlare f={f} />
        <Shade id="cineSyEave" y0={395} y1={530} a={0.42} />
        <Shade id="cineSyEave2" y0={790} y1={900} a={0.42} />
        <Shade id="cineSySkirt" y0={1345} y1={1190} a={0.34} />
        <Falloff id="cineSyFall" cx={1120} cy={420} r={1700} a={0.5} inner={0.28} color="#2a1c1c" />
      </g>
    ),
    bg: (
      <g>
        <Shade id="cineSyGround" y0={1340} y1={1520} color="#ffcf8c" a={0.32} />
        {config.sunny && <TreeShade f={f} />}
        <PottedRow x={420} y={1352} n={5} />
        <BikeRow x={1020} y={1380} n={5} />
        <TreeLeaves id="lc" x={-60} y={1380} s={1.1} f={f} />
        <FallingLeaves seed="syFar" x={-520} y={520} w={1250} h={930} f={f} n={16} />
      </g>
    ),
    fg: (
      <g>
        {FG_LEAVES.map((leaf, i) => (
          <ellipse
            key={i}
            cx={leaf.x}
            cy={leaf.y}
            rx={leaf.rx}
            ry={leaf.ry}
            fill={['#3f4c30', '#4b5a39'][i % 2]}
            transform={`rotate(${leaf.r + Math.sin(f / 36 + i) * 2} ${leaf.x} ${leaf.y})`}
          />
        ))}
      </g>
    ),
    behind: (
      <g>
        {config.sunny && (
          <>
            <Bloom
              id="cineSyBloom"
              x={1240}
              y={300}
              rx={900}
              ry={560}
              color="#ffe8a8"
              a={0.42}
              f={f}
            />
            <LightShaft
              id="cineSySunA"
              top={[880, 1260]}
              bottom={[330, 900]}
              y0={250}
              y1={1450}
              color="#fff0bb"
              a={0.46}
              f={f}
              rays={4}
              soft={16}
            />
            <LightShaft
              id="cineSySunB"
              top={[1290, 1480]}
              bottom={[960, 1400]}
              y0={250}
              y1={1450}
              color="#fff0bb"
              a={0.3}
              f={f}
              seed={2}
              rays={2}
              soft={20}
            />
          </>
        )}
        <Haze id="cineSyHaze" x={-400} y={1000} w={1900} h={360} color="#fff3cd" a={0.06} f={f} />
      </g>
    ),
    over:
      mood === 'rain' ? (
        <RainStreaks seed="syRain" x={-650} y={250} w={2350} h={1400} f={f} />
      ) : (
        <DustMotes
          id="cineSyDust"
          x={100}
          y={480}
          w={1100}
          h={950}
          color="#fff7da"
          f={f}
          n={34}
          size={4}
          a={0.65}
        />
      ),
    finish: config.finish,
    light: config.light,
    filter: config.filter,
    bokeh: config.sunny ? SCHOOL_BOKEH : undefined,
  });
};
