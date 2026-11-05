import React from 'react';
import { AbsoluteFill, Folder, Still } from 'remotion';
import { HorrorCastSheet } from '../../characters/bong/CastSheet';
import { Nguoi, No, Toi } from '../../characters/bong/cast';
import { SetStage } from '../whatif/SetStage';
import { WIDE } from '../whatif/Stage';
import type { SetLayers } from '../whatif/sets';
import {
  abandonedHouse,
  banyanShrine,
  bedroomNight,
  dormCorridor,
  FLOOR,
  hospitalHall,
  riceFieldNight,
  stairwell,
  villageNight,
} from './sets-horror';
import { POST } from './theme';
import { flickerGain, Glitch, HorrorPost, TitleCard } from './ui-horror';

/**
 * Review stills of the "Kinh dị" kit (style v2, D-111): one still per night set with TÔI and NÓ
 * through the post stack, the cast sheet, a glitch frame and the title card.
 * `npx remotion still src/channels.ts HorrorSet-villageNight out.png`
 */
const dim = (set: SetLayers, f: number): SetLayers =>
  set.glow ? { ...set, glow: { ...set.glow, a: (set.glow.a ?? 0.5) * 0.8 * flickerGain(f) } } : set;

const SETS: Readonly<Record<string, (f: number) => SetLayers>> = {
  villageNight: (f) => villageNight(f),
  abandonedHouse: (f) => abandonedHouse(f, { doorOpen: 0.3, peel: 0.5 }),
  dormCorridor: (f) => dormCorridor(f, { lastOpen: 0.25 }),
  riceFieldNight: (f) => riceFieldNight(f, { will: 3 }),
  banyanShrine: (f) => banyanShrine(f, { bucket: 0.5 }),
  hospitalHall: (f) => hospitalHall(f),
  bedroomNight: (f) => bedroomNight(f, { gap: 0.8 }),
  stairwell: (f) => stairwell(f, { bulb: 1 }),
};

const F = 9;

const SetSample: React.FC<{ set: string; glitch?: boolean }> = ({ set, glitch = false }) => {
  const build = SETS[set] ?? SETS.villageNight!;
  const shot = (
    <HorrorPost f={F}>
      <SetStage
        set={dim(build(F), F)}
        cam={WIDE}
        f={F}
        vignette={POST.vignette}
        actors={
          <>
            <No x={1480} y={FLOOR} t={F} />
            <Toi x={520} y={FLOOR} t={F} facing={1} />
            <Nguoi k={1} x={800} y={FLOOR} t={F} facing={-1} />
          </>
        }
      />
    </HorrorPost>
  );
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {glitch ? (
        <Glitch f={F} at={F - 2} frames={6}>
          {shot}
        </Glitch>
      ) : (
        shot
      )}
    </AbsoluteFill>
  );
};

const Title: React.FC = () => <TitleCard text="Phòng cuối dãy" f={40} />;

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
    <Still
      id="HorrorGlitch"
      component={SetSample}
      width={1920}
      height={1080}
      defaultProps={{ set: 'dormCorridor', glitch: true }}
    />
    <Still id="HorrorTitle" component={Title} width={1920} height={1080} />
    <Still id="HorrorCast" component={HorrorCastSheet} width={1920} height={1080} />
  </Folder>
);
