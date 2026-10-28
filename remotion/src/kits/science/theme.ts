/**
 * "Khoa học" kit theme: the whatif kit with a cooler palette for environments. Episode code that
 * imports `kit/active/theme` sees this `C`; the kit's own sets/props keep the whatif colours.
 * PR B refines the palette with the user; until then the overrides are deliberately small.
 */
import { C as WHATIF } from '../whatif/theme';

export * from '../whatif/theme';

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
