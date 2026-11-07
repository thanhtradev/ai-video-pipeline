import React from 'react';
import { SceneLightCtx } from '../../rig/scene-light';
import { SetLayers } from './sets';
import { Cam, Stage } from './Stage';

const REFLECTION_BLUR = 7;

const SetFilter: React.FC<{ readonly filter?: string; readonly children: React.ReactNode }> = ({
  filter,
  children,
}) => <g style={filter ? { filter } : undefined}>{children}</g>;

/** The actors flipped about a floor line, faint and blurred, with no scene light of their own. */
const FloorReflection: React.FC<{
  readonly y: number;
  readonly a: number;
  readonly children: React.ReactNode;
}> = ({ y, a, children }) => (
  <SceneLightCtx.Provider value={null}>
    <g
      transform={`translate(0 ${2 * y}) scale(1 -1)`}
      opacity={a}
      style={{ filter: `blur(${REFLECTION_BLUR}px)` }}
    >
      {children}
    </g>
  </SceneLightCtx.Provider>
);

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
  /** blur of the character layer, for rack focus */
  readonly blurMid?: number;
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
  blurMid,
}) => (
  <SceneLightCtx.Provider value={set.atmos?.light ?? null}>
    <Stage
      cam={cam}
      f={f}
      seed={seed}
      shake={shake}
      sky={set.sky}
      far={set.far}
      bg={set.bg}
      glow={set.glow}
      blurBg={blurBg ?? set.atmos?.blurBg}
      blurFg={blurFg}
      blurFar={blurFar ?? set.atmos?.blurFar}
      vignette={vignette}
      layerFilter={setFilter ?? set.atmos?.filter}
      blurMid={blurMid}
      focusGain={set.atmos?.focusGain}
      bokeh={set.atmos?.bokeh}
      atmosBehind={set.atmos?.behind}
      atmosOver={set.atmos?.over}
      finish={set.atmos?.finish}
      mid={
        <>
          {set.atmos?.reflection && actors && (
            <FloorReflection y={set.atmos.reflection.y} a={set.atmos.reflection.a}>
              {actors}
            </FloorReflection>
          )}
          <SetFilter filter={setFilter ?? set.atmos?.filter}>{set.back}</SetFilter>
          {behind}
          <SetFilter filter={setFilter ?? set.atmos?.filter}>{set.front}</SetFilter>
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
  </SceneLightCtx.Provider>
);
