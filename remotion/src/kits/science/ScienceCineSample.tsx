import React from 'react';
import { AbsoluteFill, Composition, Folder, Still, useCurrentFrame } from 'remotion';
import { ChipScience, TiMo } from '../../characters/chip-science/cast';
import * as plainHome from '../whatif/sets-home';
import * as plain from '../whatif/sets';
import type { SetLayers } from '../whatif/sets';
import * as plainSchool from '../whatif/sets-school';
import { SetStage } from '../whatif/SetStage';
import { Cam, WIDE } from '../whatif/Stage';
import type { CaptionLine } from '../whatif/timeline-types';
import { Captions } from '../whatif/ui';
import { TextBoundsQA } from '../whatif/qa/TextBoundsQA';
import * as home from '../whatif-vi-cinematic/sets-home';
import * as school from '../whatif-vi-cinematic/sets-school';
import {
  BeakerInsert,
  ClockInsert,
  closeUpCam,
  FocusState,
  OverShoulder,
  overShoulderCam,
  rackFocus,
} from '../whatif-vi-cinematic/sets';
import * as cinematic from '../whatif-vi-cinematic/sets';

/**
 * Review samples of the cinematic look in the science kit's 9:16 frame (D-117):
 * `npx remotion still src/channels.ts SciCine-classroom-after out.png`
 * `npx remotion render src/channels.ts SciCine-reel out.mp4`
 */
type LookName = 'before' | 'after';
const LOOKS: readonly LookName[] = ['before', 'after'];
const FPS = 30;
const STILL_FRAME = 40;
const W = 1080;
const H = 1920;
const QA_EVERY = 10;
const HOST_COLOR = '#2fb3a5';

const SETS: Readonly<Record<string, Record<LookName, (f: number) => SetLayers>>> = {
  classroom: {
    before: (f) => plain.classroom(f),
    after: (f) => cinematic.classroom(f, { mood: 'clear' }),
  },
  teacherRoom: {
    before: (f) => plain.teacherRoom(f),
    after: (f) => cinematic.teacherRoom(f, { mood: 'clear' }),
  },
  kitchen: { before: (f) => plainHome.kitchen(f), after: (f) => home.kitchen(f) },
  bedroomDay: {
    before: (f) => plainHome.bedroomDay(f),
    after: (f) => home.bedroomDay(f, { mood: 'clear' }),
  },
  schoolYard: {
    before: (f) => plain.schoolYard(f),
    after: (f) => cinematic.schoolYard(f, { mood: 'clear' }),
  },
  lake: { before: (f) => plainSchool.lake(f), after: (f) => school.lake(f) },
};
const SET_NAMES = Object.keys(SETS);

const caption = (from: number, to: number, words: readonly string[]): CaptionLine => {
  const step = (to - from) / words.length;
  return {
    from,
    to,
    words: words.map((word, i) => [
      word,
      word.toLowerCase(),
      from + Math.round(i * step),
      from + Math.round((i + 1) * step),
    ]),
  };
};

const STILL_LINE = caption(0, 60, ['Chíp', 'ơi,', 'tại', 'sao', 'nước', 'sôi?']);

const Pair: React.FC<{ f: number }> = ({ f }) => (
  <>
    <ChipScience x={380} y={1500} t={f} facing={1} />
    <TiMo x={700} y={1510} t={f} facing={-1} />
  </>
);

const SetStill: React.FC<{ name: string; look: LookName }> = ({ name, look }) => {
  const set = SETS[name];
  if (!set) throw new Error(`unknown set ${name}`);
  return (
    <AbsoluteFill>
      <SetStage
        set={set[look](STILL_FRAME)}
        cam={{ ...WIDE, z: 1.1 }}
        f={STILL_FRAME}
        actors={<Pair f={STILL_FRAME} />}
      />
      <Captions speaking={() => STILL_LINE} />
    </AbsoluteFill>
  );
};

type ReelShot = {
  readonly frames: number;
  readonly words: readonly string[];
  readonly render: (f: number, local: number) => React.ReactNode;
};

const BOARD_SHARP: FocusState = { blurFar: 0, blurBg: 3, blurMid: 14 };
const FACE_SHARP: FocusState = { blurFar: 10, blurBg: 8, blurMid: 0 };
const stage = (set: SetLayers, cam: Cam, f: number, actors: React.ReactNode) => (
  <SetStage set={set} cam={cam} f={f} actors={actors} />
);

const REEL: readonly ReelShot[] = [
  {
    frames: 72,
    words: ['Tại', 'sao', 'nước', 'lại', 'sôi?'],
    render: (f) =>
      stage(cinematic.classroom(f, { mood: 'clear' }), { ...WIDE, z: 1.1 }, f, <Pair f={f} />),
  },
  {
    frames: 66,
    words: ['Hãy', 'cùng', 'Chíp', 'thử', 'xem!'],
    render: (f) =>
      stage(
        cinematic.classroom(f, { mood: 'clear' }),
        closeUpCam(380, 1500),
        f,
        <ChipScience x={380} y={1500} t={f} facing={1} eyes="wide" />,
      ),
  },
  {
    frames: 66,
    words: ['Đun', 'nóng', 'cốc', 'nước'],
    render: (f) => <BeakerInsert f={f} />,
  },
  {
    frames: 90,
    words: ['nhìn', 'kỹ', 'bảng', 'này'],
    render: (f, local) => (
      <SetStage
        set={cinematic.classroom(f, { mood: 'clear' })}
        cam={{ x: 520, y: 900, z: 1.5 }}
        f={f}
        actors={<ChipScience x={420} y={1500} t={f} facing={1} look={{ x: 0.4, y: -0.6 }} />}
        {...rackFocus(local, [34, 64], BOARD_SHARP, FACE_SHARP)}
      />
    ),
  },
  {
    frames: 66,
    words: ['Tí', 'Mô', 'hỏi', 'lại'],
    render: (f) => (
      <SetStage
        set={cinematic.classroom(f, { mood: 'clear' })}
        cam={overShoulderCam(720, 1510)}
        f={f}
        actors={<TiMo x={720} y={1510} t={f} facing={-1} />}
        fg={<OverShoulder x={470} y={1500} color={HOST_COLOR} t={f} />}
      />
    ),
  },
  {
    frames: 66,
    words: ['Ở', 'nhà', 'buổi', 'tối'],
    render: (f) => stage(home.kitchen(f), { ...WIDE, z: 1.1 }, f, <Pair f={f} />),
  },
  { frames: 50, words: ['mất', 'bao', 'lâu?'], render: (f) => <ClockInsert f={f} /> },
  {
    frames: 66,
    words: ['Ngoài', 'trời', 'mưa', 'to'],
    render: (f) =>
      stage(school.schoolGate(f, { mood: 'rain' }), { ...WIDE, z: 1.1 }, f, <Pair f={f} />),
  },
  {
    frames: 60,
    words: ['mây', 'thật', 'cao'],
    render: (f) =>
      stage(
        cinematic.schoolYard(f, { mood: 'clear' }),
        { x: 520, y: 1080, z: 1.3, tilt: 9 },
        f,
        <ChipScience x={520} y={1500} t={f} look={{ x: 0, y: -0.8 }} />,
      ),
  },
  {
    frames: 66,
    words: ['Hồ', 'nước', 'bốc', 'hơi'],
    render: (f) => stage(school.lake(f), closeUpCam(380, 1500, 1, 2.2), f, <Pair f={f} />),
  },
];
const REEL_FRAMES = REEL.reduce((sum, shot) => sum + shot.frames, 0);

const Reel: React.FC = () => {
  const abs = useCurrentFrame();
  let from = 0;
  for (const shot of REEL) {
    if (abs < from + shot.frames) {
      const line = caption(from, from + shot.frames, shot.words);
      return (
        <AbsoluteFill>
          {shot.render(abs, abs - from)}
          <Captions speaking={() => line} />
        </AbsoluteFill>
      );
    }
    from += shot.frames;
  }
  return null;
};

const ReelQA: React.FC = () => (
  <TextBoundsQA every={QA_EVERY}>
    <Reel />
  </TextBoundsQA>
);

export const ScienceCinematicCompositions: React.FC = () => (
  <Folder name="ScienceCinematic">
    {SET_NAMES.flatMap((name) =>
      LOOKS.map((look) => (
        <Still
          key={`${name}-${look}`}
          id={`SciCine-${name}-${look}`}
          component={SetStill}
          width={W}
          height={H}
          defaultProps={{ name, look }}
        />
      )),
    )}
    <Composition
      id="SciCine-reel"
      component={Reel}
      durationInFrames={REEL_FRAMES}
      fps={FPS}
      width={W}
      height={H}
    />
    <Composition
      id="SciCine-reel-qa"
      component={ReelQA}
      durationInFrames={Math.ceil(REEL_FRAMES / QA_EVERY)}
      fps={FPS}
      width={W}
      height={H}
    />
  </Folder>
);
