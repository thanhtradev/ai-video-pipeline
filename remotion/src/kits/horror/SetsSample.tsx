import React from 'react';
import { AbsoluteFill, Folder, Still } from 'remotion';
import { HorrorCastSheet } from '../../characters/mun/CastSheet';
import { Ba, Mun, NguoiLa } from '../../characters/mun/cast';
import { SetStage } from '../whatif/SetStage';
import { WIDE } from '../whatif/Stage';
import type { CaptionLine } from '../whatif/timeline-types';
import { Captions } from '../whatif/ui';
import type { SetLayers } from '../whatif/sets';
import {
  abandonedHouse,
  banyanShrine,
  dormCorridor,
  FLOOR,
  hospitalHall,
  riceFieldNight,
  villageNight,
} from './sets-horror';

/**
 * Review stills of the "Kinh dị" night sets (D-106): one still per set with Mùn and the lamp, a
 * Vietnamese caption, and the cast sheet.
 * `npx remotion still src/channels.ts HorrorSet-villageNight out.png`
 */
const SETS: Readonly<Record<string, (f: number) => SetLayers>> = {
  villageNight: (f) => villageNight(f),
  abandonedHouse: (f) => abandonedHouse(f, { doorOpen: 0.4 }),
  dormCorridor: (f) => dormCorridor(f, { lastOpen: 0.5 }),
  riceFieldNight: (f) => riceFieldNight(f, { will: 3 }),
  banyanShrine: (f) => banyanShrine(f, { bucket: 0.5 }),
  hospitalHall: (f) => hospitalHall(f),
};

const LINE: CaptionLine = {
  from: 0,
  to: 60,
  words: [
    ['Đêm', 'đêm', 0, 10],
    ['đó,', 'đó', 10, 20],
    ['Mùn', 'mùn', 20, 30],
    ['nghe', 'nghe', 30, 40],
    ['ai', 'ai', 40, 50],
    ['gọi…', 'gọi', 50, 60],
  ],
};

const SetSample: React.FC<{ set: string }> = ({ set }) => {
  const build = SETS[set] ?? SETS.villageNight!;
  return (
    <AbsoluteFill>
      <SetStage
        set={build(0)}
        cam={WIDE}
        f={0}
        actors={
          <>
            <NguoiLa x={1500} y={FLOOR} t={0} />
            <Mun x={520} y={FLOOR} t={0} />
            <Ba x={860} y={FLOOR} t={0} facing={-1} />
          </>
        }
      />
      <Captions speaking={() => LINE} />
    </AbsoluteFill>
  );
};

export const HorrorCompositions: React.FC = () => (
  <Folder name="Horror">
    {Object.keys(SETS).map((id) => (
      <Still
        key={id}
        id={`HorrorSet-${id}`}
        component={SetSample}
        width={1920}
        height={1080}
        defaultProps={{ set: id }}
      />
    ))}
    <Still id="HorrorCast" component={HorrorCastSheet} width={1920} height={1080} />
  </Folder>
);
