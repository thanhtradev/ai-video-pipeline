import React from 'react';
import { AbsoluteFill, Composition, Folder, Still, useCurrentFrame } from 'remotion';
import { Ban, Me } from '../../characters/chip/cast';
import { ClockInsert, IncenseInsert, TeaCupInsert } from './inserts';
import { FocusState, rackFocus } from '../whatif/lens';
import { RailingFg } from './set-detail';
import { closeUpCam, OverShoulder, overShoulderCam } from './shots';
import * as plain from '../whatif/sets';
import * as cinematic from './sets';
import type { SetLayers } from '../whatif/sets';
import { SetStage } from '../whatif/SetStage';
import { Cam, CamSeg, cutCam, WIDE } from '../whatif/Stage';
import type { CaptionLine } from '../whatif/timeline-types';
import { TextBoundsQA } from '../whatif/qa/TextBoundsQA';
import { Captions } from '../whatif/ui';
import * as plainHome from '../whatif/sets-home';
import * as plainSchool from '../whatif/sets-school';
import * as home from './sets-home';
import * as school from './sets-school';

/**
 * Review samples of the cinematic look, before against after, on the same shot:
 * `npx remotion still src/channels.ts WhatifCine-livingRoom-after out.png`
 * `npx remotion render src/channels.ts WhatifCine-clip-after out.mp4`
 * `npx remotion render src/channels.ts WhatifCine-reel out.mp4` (every shot type and mood)
 */
type LookName = 'before' | 'after';
const LOOKS: readonly LookName[] = ['before', 'after'];
const SET_IDS = ['livingRoom', 'altarRoom', 'schoolYard'] as const;
type SetId = (typeof SET_IDS)[number];

const STILL_FRAME = 40;
const FPS = 30;
const SHOT_FRAMES = 80;
const CLIP_FRAMES = SHOT_FRAMES * SET_IDS.length;

const buildSet = (id: SetId, look: LookName, f: number): SetLayers =>
  look === 'after' ? cinematic[id](f) : plain[id](f);

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

const LINES: readonly CaptionLine[] = [
  caption(0, SHOT_FRAMES, ['Nếu', 'một', 'ngày', 'thời', 'gian', 'dừng', 'lại']),
  caption(SHOT_FRAMES, SHOT_FRAMES * 2, ['căn', 'nhà', 'này', 'sẽ', 'ra', 'sao?']),
  caption(SHOT_FRAMES * 2, CLIP_FRAMES, ['và', 'bạn', 'sẽ', 'làm', 'gì', 'đầu', 'tiên?']),
];

const speaking = (abs: number): CaptionLine | null =>
  LINES.find((line) => abs >= line.from && abs < line.to) ?? null;

const Cast: React.FC<{ f: number }> = ({ f }) => (
  <>
    <Ban x={300} y={1500} t={f} facing={1} />
    <Me x={720} y={1510} t={f} facing={-1} />
  </>
);

const SHOTS: Readonly<Record<SetId, readonly CamSeg[]>> = {
  livingRoom: [
    { at: 0, a: WIDE },
    { at: 42, a: { x: 360, y: 1130, z: 1.7 } },
  ],
  altarRoom: [
    { at: 0, a: WIDE },
    { at: 38, a: { x: 620, y: 1040, z: 1.45 }, b: { x: 620, y: 1040, z: 1.6 } },
  ],
  schoolYard: [
    { at: 0, a: WIDE },
    { at: 40, a: { x: 720, y: 1160, z: 1.65 } },
  ],
};

const Frame: React.FC<{ id: SetId; look: LookName; f: number; cam: Cam }> = ({
  id,
  look,
  f,
  cam,
}) => <SetStage set={buildSet(id, look, f)} cam={cam} f={f} actors={<Cast f={f} />} />;

const CineStill: React.FC<{ id: SetId; look: LookName }> = ({ id, look }) => (
  <AbsoluteFill>
    <Frame id={id} look={look} f={STILL_FRAME} cam={WIDE} />
    <Captions speaking={() => LINES[SET_IDS.indexOf(id)] ?? null} />
  </AbsoluteFill>
);

const CineClip: React.FC<{ look: LookName }> = ({ look }) => {
  const abs = useCurrentFrame();
  const shot = Math.min(Math.floor(abs / SHOT_FRAMES), SET_IDS.length - 1);
  const id = SET_IDS[shot] ?? 'livingRoom';
  const local = abs - shot * SHOT_FRAMES;
  return (
    <AbsoluteFill>
      <Frame id={id} look={look} f={abs} cam={cutCam(local, SHOTS[id], SHOT_FRAMES)} />
      <Captions speaking={speaking} />
    </AbsoluteFill>
  );
};

type ReelCtx = { readonly f: number; readonly local: number };
type ReelShot = {
  readonly id: string;
  readonly frames: number;
  readonly words: readonly string[];
  readonly render: (ctx: ReelCtx) => React.ReactNode;
};

const HERO_COLOR = '#ff7a1a';
const PHOTOS_SHARP: FocusState = { blurFar: 0, blurBg: 4, blurMid: 14 };
const FACE_SHARP: FocusState = { blurFar: 9, blurBg: 7, blurMid: 0 };

const REEL: readonly ReelShot[] = [
  {
    id: 'living-wide',
    frames: 78,
    words: ['Nếu', 'một', 'ngày', 'thời', 'gian', 'dừng', 'lại'],
    render: ({ f }) => (
      <SetStage set={cinematic.livingRoom(f)} cam={WIDE} f={f} actors={<Cast f={f} />} />
    ),
  },
  {
    id: 'living-close',
    frames: 66,
    words: ['bạn', 'sẽ', 'làm', 'gì?'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.livingRoom(f)}
        cam={closeUpCam(300, 1500)}
        f={f}
        actors={<Cast f={f} />}
      />
    ),
  },
  {
    id: 'living-ots',
    frames: 66,
    words: ['Mẹ', 'vẫn', 'đứng', 'đó'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.livingRoom(f)}
        cam={overShoulderCam(690, 1510)}
        f={f}
        actors={<Me x={720} y={1510} t={f} facing={-1} />}
        fg={<OverShoulder x={380} y={1500} color={HERO_COLOR} t={f} />}
      />
    ),
  },
  {
    id: 'living-rack',
    frames: 96,
    words: ['nhìn', 'những', 'tấm', 'ảnh', 'cũ'],
    render: ({ f, local }) => (
      <SetStage
        set={cinematic.livingRoom(f)}
        cam={{ x: 480, y: 850, z: 1.7 }}
        f={f}
        actors={<Ban x={300} y={1500} t={f} facing={1} look={{ x: 0.5, y: -0.4 }} />}
        {...rackFocus(local, [36, 66], PHOTOS_SHARP, FACE_SHARP)}
      />
    ),
  },
  {
    id: 'clock',
    frames: 54,
    words: ['Kim', 'đồng', 'hồ'],
    render: ({ f }) => <ClockInsert f={f} />,
  },
  {
    id: 'tea',
    frames: 54,
    words: ['chén', 'trà', 'còn', 'nóng'],
    render: ({ f }) => <TeaCupInsert f={f} />,
  },
  {
    id: 'living-rain',
    frames: 78,
    words: ['Đêm', 'đó', 'trời', 'mưa'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.livingRoom(f, { mood: 'rain' })}
        cam={WIDE}
        f={f}
        actors={<Cast f={f} />}
      />
    ),
  },
  {
    id: 'altar-wide',
    frames: 60,
    words: ['Trên', 'bàn', 'thờ'],
    render: ({ f }) => (
      <SetStage set={cinematic.altarRoom(f)} cam={WIDE} f={f} actors={<Cast f={f} />} />
    ),
  },
  {
    id: 'incense',
    frames: 60,
    words: ['nén', 'nhang', 'vẫn', 'cháy'],
    render: ({ f }) => <IncenseInsert f={f} />,
  },
  {
    id: 'altar-close',
    frames: 66,
    words: ['Không', 'ai', 'nói', 'gì'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.altarRoom(f)}
        cam={closeUpCam(720, 1510, 1.08, 2.4)}
        f={f}
        actors={<Cast f={f} />}
      />
    ),
  },
  {
    id: 'altar-high',
    frames: 60,
    words: ['chỉ', 'còn', 'lại', 'bạn'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.altarRoom(f)}
        cam={{ x: 500, y: 1180, z: 1.25, tilt: -9 }}
        f={f}
        actors={<Ban x={500} y={1500} t={f} />}
      />
    ),
  },
  {
    id: 'school-wide',
    frames: 72,
    words: ['Sáng', 'hôm', 'sau', 'ở', 'trường'],
    render: ({ f }) => (
      <SetStage set={cinematic.schoolYard(f)} cam={WIDE} f={f} actors={<Cast f={f} />} />
    ),
  },
  {
    id: 'school-low',
    frames: 60,
    words: ['mọi', 'thứ', 'thật', 'lớn'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.schoolYard(f)}
        cam={{ x: 560, y: 1080, z: 1.35, tilt: 9 }}
        f={f}
        actors={<Ban x={560} y={1500} t={f} look={{ x: 0, y: -0.8 }} />}
      />
    ),
  },
  {
    id: 'school-overcast',
    frames: 60,
    words: ['Trời', 'bỗng', 'tối', 'lại'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.schoolYard(f, { mood: 'overcast' })}
        cam={WIDE}
        f={f}
        actors={<Cast f={f} />}
      />
    ),
  },
  {
    id: 'school-leaves',
    frames: 66,
    words: ['lá', 'rơi', 'đầy', 'sân'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.schoolYard(f)}
        cam={closeUpCam(300, 1500, 1, 2.1)}
        f={f}
        actors={<Ban x={300} y={1500} t={f} facing={1} />}
      />
    ),
  },
  {
    id: 'school-rail',
    frames: 66,
    words: ['và', 'bạn', 'đứng', 'nhìn'],
    render: ({ f }) => (
      <SetStage
        set={cinematic.schoolYard(f)}
        cam={{ x: 640, y: 1150, z: 1.35 }}
        f={f}
        actors={<Ban x={640} y={1500} t={f} />}
        fg={<RailingFg y={1400} />}
      />
    ),
  },
];

const REEL_FRAMES = REEL.reduce((total, shot) => total + shot.frames, 0);

const CineReel: React.FC = () => {
  const abs = useCurrentFrame();
  let from = 0;
  for (const shot of REEL) {
    if (abs < from + shot.frames) {
      const line = caption(from, from + shot.frames, shot.words);
      return (
        <AbsoluteFill>
          {shot.render({ f: abs, local: abs - from })}
          <Captions speaking={() => line} />
        </AbsoluteFill>
      );
    }
    from += shot.frames;
  }
  return null;
};

const ALL_SETS: Readonly<
  Record<
    string,
    { readonly before: (f: number) => SetLayers; readonly after: (f: number) => SetLayers }
  >
> = {
  teacherRoom: { before: (f) => plain.teacherRoom(f), after: (f) => cinematic.teacherRoom(f) },
  bathroom: { before: (f) => plain.bathroom(f), after: (f) => cinematic.bathroom(f) },
  hallway: { before: (f) => plain.hallway(f), after: (f) => cinematic.hallway(f) },
  canteen: { before: (f) => plain.canteen(f), after: (f) => cinematic.canteen(f) },
  alley: { before: (f) => plain.alley(f), after: (f) => cinematic.alley(f) },
  classroom: { before: (f) => plain.classroom(f), after: (f) => cinematic.classroom(f) },
  bedroom: { before: (f) => plain.bedroom(f), after: (f) => cinematic.bedroom(f) },
  lanternStreet: {
    before: (f) => plain.lanternStreet(f),
    after: (f) => cinematic.lanternStreet(f),
  },
  minimal: { before: () => plain.minimal(), after: () => cinematic.minimal() },
  bedroomDay: { before: (f) => plainHome.bedroomDay(f), after: (f) => home.bedroomDay(f) },
  dining: { before: (f) => plainHome.dining(f), after: (f) => home.dining(f) },
  yardField: { before: (f) => plainHome.yardField(f), after: (f) => home.yardField(f) },
  lot: { before: (f) => plainHome.lot(f), after: (f) => home.lot(f) },
  balcony: { before: (f) => plainHome.balcony(f), after: (f) => home.balcony(f) },
  kitchen: { before: (f) => plainHome.kitchen(f), after: (f) => home.kitchen(f) },
  stairs: { before: (f) => plainHome.stairs(f), after: (f) => home.stairs(f) },
  schoolGate: { before: (f) => plainSchool.schoolGate(f), after: (f) => school.schoolGate(f) },
  traffic: { before: (f) => plainSchool.traffic(f), after: (f) => school.traffic(f) },
  busStation: { before: (f) => plainSchool.busStation(f), after: (f) => school.busStation(f) },
  lake: { before: (f) => plainSchool.lake(f), after: (f) => school.lake(f) },
};

const SetStill: React.FC<{ name: string; look: LookName }> = ({ name, look }) => {
  const set = ALL_SETS[name];
  if (!set) throw new Error(`unknown set ${name}`);
  return (
    <SetStage
      set={set[look](STILL_FRAME)}
      cam={WIDE}
      f={STILL_FRAME}
      actors={<Cast f={STILL_FRAME} />}
    />
  );
};

const QA_EVERY = 10;
const ALL_SET_NAMES = Object.keys(ALL_SETS);

/** One wide shot of each set for `QA_EVERY` frames, so the text QA samples every set once. */
const AllSets: React.FC = () => {
  const abs = useCurrentFrame();
  const name = ALL_SET_NAMES[Math.floor(abs / QA_EVERY)];
  if (!name) return null;
  return <SetStill name={name} look="after" />;
};

const ReelQA: React.FC = () => (
  <TextBoundsQA every={QA_EVERY}>
    <CineReel />
  </TextBoundsQA>
);

const SetsQA: React.FC = () => (
  <TextBoundsQA every={QA_EVERY}>
    <AllSets />
  </TextBoundsQA>
);

export const WhatifCinematicCompositions: React.FC = () => (
  <Folder name="WhatifCinematic">
    {SET_IDS.flatMap((id) =>
      LOOKS.map((look) => (
        <Still
          key={`${id}-${look}`}
          id={`WhatifCine-${id}-${look}`}
          component={CineStill}
          width={1920}
          height={1080}
          defaultProps={{ id, look }}
        />
      )),
    )}
    {LOOKS.map((look) => (
      <Composition
        key={look}
        id={`WhatifCine-clip-${look}`}
        component={CineClip}
        durationInFrames={CLIP_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ look }}
      />
    ))}
    {Object.keys(ALL_SETS).flatMap((name) =>
      LOOKS.map((look) => (
        <Still
          key={`${name}-${look}`}
          id={`WhatifCine-${name}-${look}`}
          component={SetStill}
          width={1920}
          height={1080}
          defaultProps={{ name, look }}
        />
      )),
    )}
    <Composition
      id="WhatifCine-reel-qa"
      component={ReelQA}
      durationInFrames={Math.ceil(REEL_FRAMES / QA_EVERY)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="WhatifCine-sets-qa"
      component={SetsQA}
      durationInFrames={ALL_SET_NAMES.length}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="WhatifCine-reel"
      component={CineReel}
      durationInFrames={REEL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </Folder>
);
