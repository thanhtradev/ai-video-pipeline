import React from 'react';
import { AbsoluteFill, Folder, Still } from 'remotion';
import { You, Mom, Teacher } from '../../characters/chip-en/cast';
import { setLang } from '../whatif/lang';
import { SetStage } from '../whatif/SetStage';
import { WIDE } from '../whatif/Stage';
import type { CaptionLine } from '../whatif/timeline-types';
import { BigText, Captions } from '../whatif/ui';
import { EggCarton, IcedCoffee, Milkshake, SchoolBus, Teacup } from './props-intl';
import {
  bedroom,
  cafeteria,
  classroom,
  FLOOR,
  hallway,
  livingRoom,
  park,
  suburbStreet,
} from './sets-intl';
import { bedroomDay, dining, frontPorch, kitchen } from './sets-home-intl';
import { busStop, schoolFront } from './sets-school-intl';
import { CAPTION_SIZE } from './theme';
import type { SetLayers } from '../whatif/sets';

/**
 * Review stills of the "What if… (EN)" Western sets (D-092): one still per set with the hero,
 * an English caption at the kit's size, and a contact sheet of the new props.
 * `npx remotion still src/channels.ts EnSet-suburbStreet out.png`
 */
const SETS: Readonly<Record<string, (f: number) => SetLayers>> = {
  livingRoom: (f) => livingRoom(f),
  livingRoomNight: (f) => livingRoom(f, { night: true }),
  classroom: (f) => classroom(f),
  hallway: (f) => hallway(f, { open: 2 }),
  bedroom: (f) => bedroom(f, { warm: 1 }),
  cafeteria: (f) => cafeteria(f),
  suburbStreet: (f) => suburbStreet(f, { mailFlag: true }),
  suburbNight: (f) => suburbStreet(f, { night: true }),
  park: (f) => park(f, { goal: true, score: [12, 0] }),
  bedroomDay: (f) => bedroomDay(f, { ring: true, time: '6:00' }),
  kitchen: (f) => kitchen(f, { boil: 1 }),
  dining: (f) => dining(f),
  frontPorch: (f) => frontPorch(f, { mailFlag: true }),
  schoolFront: (f) => schoolFront(f, { bus: true, crowd: 8 }),
  busStop: (f) => busStop(f),
};

const LINE: CaptionLine = {
  from: 0,
  to: 60,
  words: [
    ['What', 'what', 0, 10],
    ['if', 'if', 10, 20],
    ['you', 'you', 20, 30],
    ['could', 'could', 30, 40],
    ['stop', 'stop', 40, 50],
    ['time?', 'time', 50, 60],
  ],
};

const SetSample: React.FC<{ set: string }> = ({ set }) => {
  setLang('en');
  const build = SETS[set] ?? SETS.livingRoom!;
  return (
    <AbsoluteFill>
      <SetStage
        set={build(0)}
        cam={WIDE}
        f={0}
        actors={
          <>
            <You x={420} y={FLOOR} t={0} />
            <Mom x={760} y={FLOOR} t={0} facing={-1} />
          </>
        }
      />
      <Captions speaking={() => LINE} size={CAPTION_SIZE} />
    </AbsoluteFill>
  );
};

const PropsSheet: React.FC = () => (
  <AbsoluteFill style={{ background: '#3a3340' }}>
    <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
      <rect width={1920} height={1080} fill="#cfc6b4" />
      <EggCarton x={260} y={420} s={1.2} />
      <Teacup x={600} y={420} s={1.5} />
      <Teacup x={820} y={420} s={1.5} tilt={0.6} />
      <Milkshake x={1080} y={420} s={1.3} />
      <IcedCoffee x={1320} y={420} s={1.3} />
      <IcedCoffee x={1620} y={420} s={1.3} spill={0.7} />
      <SchoolBus x={960} y={1000} s={0.9} />
    </svg>
    <BigText lines={['WHAT IF', 'YOU STOPPED TIME?']} from={-30} f={0} />
  </AbsoluteFill>
);

const TeacherSample: React.FC = () => (
  <AbsoluteFill>
    <SetStage
      set={classroom(0, { board: ['PROBLEM 3', 'PROBLEM 4'] })}
      cam={WIDE}
      f={0}
      actors={<Teacher x={500} y={FLOOR} t={0} />}
    />
  </AbsoluteFill>
);

export const WhatifEnCompositions: React.FC = () => (
  <Folder name="WhatifEn">
    {Object.keys(SETS).map((id) => (
      <Still
        key={id}
        id={`EnSet-${id}`}
        component={SetSample}
        width={1920}
        height={1080}
        defaultProps={{ set: id }}
      />
    ))}
    <Still id="EnProps" component={PropsSheet} width={1920} height={1080} />
    <Still id="EnTeacher" component={TeacherSample} width={1920} height={1080} />
  </Folder>
);
