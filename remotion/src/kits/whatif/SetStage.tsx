import React from 'react';
import { SetLayers } from './sets';
import { Cam, Stage } from './Stage';

/**
 * Builds a shot from a set + characters: mid = back → behind → furniture in front (tables…) → actors → front.
 * Characters are drawn BEFORE furniture by default (an open-frame table drawn over a person makes them look transparent); only someone really behind a table uses `behind`.
 */
export const SetStage: React.FC<{
  readonly set: SetLayers;
  readonly cam: Cam;
  readonly f: number;
  readonly actors?: React.ReactNode;
  readonly behind?: React.ReactNode;
  readonly front?: React.ReactNode;
  readonly fg?: React.ReactNode;
  readonly shake?: number;
  readonly seed?: number;
  readonly blurBg?: number;
  readonly blurFg?: number;
  /** far-layer blur (Stage default); 0 = focus on the wall/board */
  readonly blurFar?: number;
  readonly vignette?: number;
  readonly children?: React.ReactNode;
  readonly noFg?: boolean;
  /** CSS filter for the set (not applied to actors) */
  readonly setFilter?: string;
}> = ({
  set,
  cam,
  f,
  actors,
  behind,
  front,
  fg,
  shake,
  seed,
  blurBg,
  blurFg,
  blurFar,
  vignette,
  children,
  noFg,
  setFilter,
}) => (
  <Stage
    cam={cam}
    f={f}
    seed={seed}
    shake={shake}
    sky={set.sky}
    far={set.far}
    bg={set.bg}
    glow={set.glow}
    blurBg={blurBg}
    blurFg={blurFg}
    blurFar={blurFar}
    vignette={vignette}
    layerFilter={setFilter}
    mid={
      <>
        <g style={setFilter ? { filter: setFilter } : undefined}>{set.back}</g>
        {behind}
        <g style={setFilter ? { filter: setFilter } : undefined}>{set.front}</g>
        {actors}
        {front}
      </>
    }
    fg={
      noFg ? (
        fg
      ) : (
        <>
          {set.fg}
          {fg}
        </>
      )
    }
  >
    {children}
  </Stage>
);
