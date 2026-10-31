/**
 * "Khoa học" kit theme: the whatif kit in the vertical 9:16 frame (D-080) with a cooler palette for
 * environments. Episode code that imports `kit/active/theme` sees this frame and this `C`; the
 * kit's own sets/props keep the whatif colours, and its Stage/UI follow the composition's frame.
 */
import { C as WHATIF, PORTRAIT } from '../whatif/theme';

export * from '../whatif/theme';

/** This kit's frame, for episode code (kit/active/theme). */
export const { W, H, ANCHOR, CAM_K, SAFE, PX } = PORTRAIT;

export const C = {
  ...WHATIF,
  wall: '#c3c7cf',
  wallShade: '#a8adb8',
  floor: '#9aa0ab',
  blueGray: '#6f8599',
  dustyPurple: '#7e7f9a',
  beige: '#cfd3d8',
  night: '#1f2436',
} as const;
