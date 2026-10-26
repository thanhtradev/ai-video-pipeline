import React, { createContext, useContext } from 'react';
import { SetStage } from './SetStage';
import { Cam } from './Stage';

/**
 * Per-act colour grade (EP2 onwards): the set and the side characters take the act filter, the hero never does.
 * Camera helpers that frame a character by its feet position.
 */
export const GradeCtx = createContext<{ set?: string; side?: string }>({});
/** Set + side characters take the act colour filter; the hero hoodie is not filtered. */
export const Stage2: React.FC<React.ComponentProps<typeof SetStage>> = (p) => {
  const g = useContext(GradeCtx);
  return <SetStage {...p} setFilter={g.set} />;
};
export const Side: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const g = useContext(GradeCtx);
  return <g style={g.side ? { filter: g.side } : undefined}>{children}</g>;
};

export const headY = (feetY: number, size = 1) => feetY - 468 * size;
export const faceCam = (x: number, feetY: number, size = 1, z = 2.6, dy = 30): Cam => ({
  x,
  y: headY(feetY, size) + dy,
  z,
});
export const bodyCam = (x: number, feetY: number, size = 1, z = 1.5): Cam => ({
  x,
  y: feetY - 360 * size,
  z,
});
