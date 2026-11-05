/**
 * "Kinh dị" kit theme (D-106): the whatif drawing language in the 16:9 frame, at night. Episode
 * code that imports `kit/active/theme` sees this `C` (night palette) and the `GRADE` presets for
 * `GradeCtx`; shared Stage/UI follow the composition's frame as usual.
 */
import { C as WHATIF } from '../whatif/theme';

export * from '../whatif/theme';

export const C = {
  ...WHATIF,
  night: '#0f1220',
  dusk: '#2a2440',
  wall: '#3b3d4a',
  wallShade: '#2a2c38',
  floor: '#2b2a33',
  lampGlow: '#f0a856',
  moon: '#dde2ee',
  fog: '#8f97ad',
} as const;

/** Act grades for `GradeCtx` (set and side characters only; the hero is never graded). */
export const GRADE = {
  dusk: { set: 'saturate(0.8) brightness(0.9)', side: 'saturate(0.65) brightness(0.9)' },
  night: { set: 'saturate(0.6) brightness(0.72)', side: 'saturate(0.5) brightness(0.75)' },
  dread: {
    set: 'saturate(0.35) brightness(0.5) contrast(1.2)',
    side: 'saturate(0.3) brightness(0.55)',
  },
} as const;

/** Post stack levels chosen by the owner on the style-v2 samples (D-111). */
export const POST = { grain: 0.26, vignette: 0.7 } as const;
