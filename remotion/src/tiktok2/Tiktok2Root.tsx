import React from 'react';
import { Composition, Folder, Still } from 'remotion';
import { BOARD_PER, T2E1Board, Tiktok2Ep1 } from './ep1/Episode';
import { T2E1CharacterSheet, T2E1SetSheet } from './ep1/Sheets';
import { shotsOf, totalOf } from './ep1/time';
import { BOARD2_PER, T2E2Board, Tiktok2Ep2 } from './ep2/Episode';
import { SHOTS as SHOTS2, TOTAL as TOTAL2 } from './ep2/time';
import { BOARD3_PER, T2E3Board, Tiktok2Ep3 } from './ep3/Episode';
import { SHOTS as SHOTS3, TOTAL as TOTAL3 } from './ep3/time';
import { BOARD5_PER, T2E5Board, Tiktok2Ep5 } from './ep5/Episode';
import { SHOTS as SHOTS5, TOTAL as TOTAL5 } from './ep5/time';
import { TextBoundsQA } from './qa/TextBoundsQA';

/** Text-out-of-frame QA (scripts/tiktok2/check-text-bounds.mjs): samples every QA_EVERY frames of an episode. */
const QA_EVERY = 10;
const qa =
  (Ep: React.FC<Record<string, unknown>>, props: Record<string, unknown> = {}): React.FC =>
  () => (
    <TextBoundsQA every={QA_EVERY}>
      <Ep {...props} />
    </TextBoundsQA>
  );
const QA_N = (total: number) => Math.ceil(total / QA_EVERY);

/** TikTok 2 channel – 16:9, 1920×1080, 30 fps (the user switched from 9:16). */
export const Tiktok2Compositions: React.FC = () => (
  <Folder name="Tiktok2">
    <Composition
      id="Tiktok2Ep1"
      component={Tiktok2Ep1}
      durationInFrames={totalOf('vi')}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="Tiktok2Ep1En"
      component={Tiktok2Ep1}
      durationInFrames={totalOf('en')}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ lang: 'en' as const }}
    />
    <Composition
      id="Tiktok2Ep2"
      component={Tiktok2Ep2}
      durationInFrames={TOTAL2}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="T2E2Board"
      component={T2E2Board}
      durationInFrames={Math.ceil(SHOTS2.length / BOARD2_PER)}
      fps={30}
      width={1920}
      height={1500}
      defaultProps={{ pick: 0.55 }}
    />
    <Composition
      id="Tiktok2Ep3"
      component={Tiktok2Ep3}
      durationInFrames={TOTAL3}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="T2E3Board"
      component={T2E3Board}
      durationInFrames={Math.ceil(SHOTS3.length / BOARD3_PER)}
      fps={30}
      width={1920}
      height={1500}
      defaultProps={{ pick: 0.55 }}
    />
    <Composition
      id="Tiktok2Ep5"
      component={Tiktok2Ep5}
      durationInFrames={TOTAL5}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="T2E5Board"
      component={T2E5Board}
      durationInFrames={Math.ceil(SHOTS5.length / BOARD5_PER)}
      fps={30}
      width={1920}
      height={1500}
      defaultProps={{ pick: 0.55 }}
    />
    <Folder name="Tiktok2-QA">
      <Composition
        id="T2QA1"
        component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>)}
        durationInFrames={QA_N(totalOf('vi'))}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="T2QA1En"
        component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>, { lang: 'en' })}
        durationInFrames={QA_N(totalOf('en'))}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="T2QA2"
        component={qa(Tiktok2Ep2 as React.FC<Record<string, unknown>>)}
        durationInFrames={QA_N(TOTAL2)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="T2QA3"
        component={qa(Tiktok2Ep3 as React.FC<Record<string, unknown>>)}
        durationInFrames={QA_N(TOTAL3)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="T2QA5"
        component={qa(Tiktok2Ep5 as React.FC<Record<string, unknown>>)}
        durationInFrames={QA_N(TOTAL5)}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="Tiktok2Ep1-Sheets">
      <Composition
        id="T2E1Board"
        component={T2E1Board}
        durationInFrames={Math.ceil(shotsOf('vi').length / BOARD_PER)}
        fps={30}
        width={1920}
        height={1500}
        defaultProps={{ pick: 0.55 }}
      />
      <Composition
        id="T2E1BoardEn"
        component={T2E1Board}
        durationInFrames={Math.ceil(shotsOf('en').length / BOARD_PER)}
        fps={30}
        width={1920}
        height={1500}
        defaultProps={{ pick: 0.55, lang: 'en' as const }}
      />
      <Still id="T2E1CharacterSheet" component={T2E1CharacterSheet} width={1080} height={1920} />
      <Still
        id="T2E1SetLiving"
        component={T2E1SetSheet}
        width={1920}
        height={1080}
        defaultProps={{ which: 0 }}
      />
      <Still
        id="T2E1SetLantern"
        component={T2E1SetSheet}
        width={1920}
        height={1080}
        defaultProps={{ which: 1 }}
      />
    </Folder>
  </Folder>
);
