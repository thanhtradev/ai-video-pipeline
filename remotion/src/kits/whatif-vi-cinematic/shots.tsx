import React from 'react';
import { Character } from '../../rig/Character';
import { faceCam } from '../whatif/grade';
import type { Cam } from '../whatif/Stage';

/** Framings for the cinematic look. The focus curve, bokeh and light come from the set. */

const CLOSE_UP_ZOOM = 2.6;
const OVER_SHOULDER_ZOOM = 1.9;
const SHOULDER_DROP = 150;
const SHOULDER_SIZE = 1.45;

/** A face close-up. */
export const closeUpCam = (x: number, feetY: number, size = 1, z = CLOSE_UP_ZOOM): Cam =>
  faceCam(x, feetY, size, z);

/** Frames the person being looked at, for use with `OverShoulder` on the fg layer. */
export const overShoulderCam = (x: number, feetY: number): Cam => ({
  x,
  y: feetY - 430,
  z: OVER_SHOULDER_ZOOM,
});

/** The back of a nearer person in the foreground. Pass it to the `fg` of `SetStage`. */
export const OverShoulder: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly t: number;
}> = ({ x, y, color, t }) => (
  <Character
    x={x}
    y={y + SHOULDER_DROP}
    size={SHOULDER_SIZE}
    hoodieColor={color}
    back
    blink={false}
    shadow={false}
    t={t}
    seed={40}
  />
);
