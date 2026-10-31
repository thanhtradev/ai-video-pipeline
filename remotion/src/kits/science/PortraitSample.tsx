import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ChipScience } from '../../characters/chip-science/cast';
import { classroom, FLOOR } from '../whatif/sets';
import { SetStage } from '../whatif/SetStage';
import { WIDE } from '../whatif/Stage';
import { BigText, Captions } from '../whatif/ui';
import type { CaptionLine } from '../whatif/timeline-types';

/**
 * The "Khoa học" kit in its 9:16 frame (D-080): a set, the host, big text and a caption, as the
 * shared Stage/UI place them in a 1080×1920 composition. Review still `SciPortraitSample`.
 */
const LINE: CaptionLine = {
  from: 0,
  to: 60,
  words: [
    ['Chíp', 'chip', 0, 10],
    ['ơi,', 'oi', 10, 20],
    ['tại', 'tai', 20, 30],
    ['sao', 'sao', 30, 40],
    ['nước', 'nuoc', 40, 50],
    ['sôi?', 'soi', 50, 60],
  ],
};

export const PortraitSample: React.FC = () => (
  <AbsoluteFill>
    <SetStage
      set={classroom(0)}
      cam={{ ...WIDE, z: 1.1 }}
      f={0}
      actors={<ChipScience x={500} y={FLOOR} t={0} eyes="wide" />}
    />
    <BigText lines={['TẠI SAO', 'NƯỚC SÔI?']} from={-30} f={0} />
    <Captions speaking={() => LINE} />
  </AbsoluteFill>
);
