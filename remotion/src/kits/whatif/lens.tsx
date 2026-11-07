import React from 'react';
import { interpolate, random } from 'remotion';

/** A bright point in the world, in the coordinates of the Stage's `bg` layer. */
export type BokehLight = {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
};

const BOKEH_ZOOM: readonly [number, number] = [1.25, 2.1];
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Bright points that open into soft round discs as the camera moves in. */
export const BokehLights: React.FC<{
  readonly lights: readonly BokehLight[];
  readonly z: number;
  readonly seed: number;
}> = ({ lights, z, seed }) => {
  const opening = interpolate(z, [...BOKEH_ZOOM], [0, 1], CLAMP);
  if (opening <= 0) return null;
  return (
    <g>
      {lights.map((light, i) => {
        const id = `bokeh${seed}-${i}`;
        return (
          <g key={id}>
            <defs>
              <radialGradient id={id}>
                <stop offset="0" stopColor={light.color} stopOpacity={0.3} />
                <stop offset="0.72" stopColor={light.color} stopOpacity={0.36} />
                <stop offset="0.9" stopColor={light.color} stopOpacity={0.42} />
                <stop offset="1" stopColor={light.color} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle
              cx={light.x}
              cy={light.y}
              r={light.r * (0.5 + 0.5 * opening)}
              fill={`url(#${id})`}
              opacity={0.8 * opening * (0.5 + 0.5 * random(`${id}o`))}
            />
          </g>
        );
      })}
    </g>
  );
};

export type FocusState = {
  readonly blurFar: number;
  readonly blurBg: number;
  readonly blurMid: number;
};

/** Slides focus from one state to another over a frame range. Pass the result to `SetStage`. */
export const rackFocus = (
  f: number,
  range: readonly [number, number],
  from: FocusState,
  to: FocusState,
): FocusState => {
  const at = (a: number, b: number): number => interpolate(f, [range[0], range[1]], [a, b], CLAMP);
  return {
    blurFar: at(from.blurFar, to.blurFar),
    blurBg: at(from.blurBg, to.blurBg),
    blurMid: at(from.blurMid, to.blurMid),
  };
};
