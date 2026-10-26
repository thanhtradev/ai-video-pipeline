// Compositions of one episode workspace (prepared by the worker; do not edit). The agent writes
// src/episode/Episode.tsx; the worker renders the storyboard and the text-bounds QA from it.
// Board and QA last as long as the episode: Remotion drops any <Sequence> that starts after the
// composition ends, so a shorter composition would freeze late shots into an empty frame. Only
// their first pages / samples are rendered (frame i = board page i, or QA sample i × QA_EVERY).
import React from 'react';
import { AbsoluteFill, Composition, Freeze, useCurrentFrame } from 'remotion';
import { FONT } from '../kit/active/theme';
import { TextBoundsQA } from '../kit/active/qa';
import { Episode } from './episode/Episode';
import { SHOTS, TOTAL } from './time';

const W = 1920;
const H = 1080;
/** Storyboard: 12 shots per page (3 × 4), each frozen at `pick` of its length. */
export const BOARD_PER = 12;
const TILE_SCALE = 0.325;
/** Text-bounds QA samples every QA_EVERY frames of the episode. */
export const QA_EVERY = 10;

const EpisodeBoard: React.FC<{ pick: number }> = ({ pick }) => {
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD_PER, page * BOARD_PER + BOARD_PER);
  return (
    <AbsoluteFill
      style={{
        background: '#1a1820',
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
        gap: 12,
        alignContent: 'flex-start',
      }}
    >
      {list.map((s) => {
        const at = s.from + Math.round((s.to - s.from) * pick);
        return (
          <div
            key={s.id}
            style={{
              width: W * TILE_SCALE,
              height: H * TILE_SCALE,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: W,
                height: H,
                transform: `scale(${TILE_SCALE})`,
                transformOrigin: '0 0',
                position: 'absolute',
              }}
            >
              <Freeze frame={at}>
                <Episode />
              </Freeze>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 6,
                bottom: 4,
                color: '#fff',
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 26,
                textShadow: '0 2px 4px #000',
              }}
            >
              {s.id} · {s.start.toFixed(1)}s
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const EpisodeQA: React.FC = () => (
  <TextBoundsQA every={QA_EVERY}>
    <Episode />
  </TextBoundsQA>
);

export const EpisodeRoot: React.FC = () => (
  <>
    <Composition
      id="Episode"
      component={Episode}
      durationInFrames={TOTAL}
      fps={30}
      width={W}
      height={H}
    />
    <Composition
      id="EpisodeBoard"
      component={EpisodeBoard}
      durationInFrames={TOTAL}
      fps={30}
      width={W}
      height={1500}
      defaultProps={{ pick: 0.55 }}
    />
    <Composition
      id="EpisodeQA"
      component={EpisodeQA}
      durationInFrames={TOTAL}
      fps={30}
      width={W}
      height={H}
    />
  </>
);
