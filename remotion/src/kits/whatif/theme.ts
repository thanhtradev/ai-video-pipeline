/** TikTok 2 channel – palette & type. Environment + side characters: muted, desaturated. Main character: saturated ORANGE hoodie. */
export { FONT, HAND } from './fonts';

/** 16:9 frame (the user switched from 9:16 to 16:9). */
export const W = 1920;
export const H = 1080;
/** Screen point the camera centre lands on. */
export const ANCHOR = { x: 960, y: 540 } as const;
/** Global zoom: scenes are built in world coordinates (adult = 600 tall); the landscape frame sees wider. */
export const CAM_K = 0.85;
/** Text safe area (5% margins). */
export const SAFE = { left: W * 0.05, right: W * 0.95, bottom: H * 0.92 } as const;
/** Maps old portrait-design screen coordinates (1080×1920) to the landscape frame – for screen-placed text/effects. */
export const PX = (x: number, y: number) => ({ x: 960 + (x - 500) * 1.2, y: y * 0.5625 });

export const C = {
  ink: '#15121a',
  ink2: '#2a2530',
  rim: '#f3e2c2',
  white: '#ffffff',
  orange: '#ff7a1a',
  mom: '#b59ac2',
  bin: '#9cc6e4',
  huy: '#7b8a58',
  aodai: '#8797a6',
  principal: '#8e8e94',
  friendBeige: '#cbb699',
  friendGray: '#9a9aa2',
  friendPurple: '#8c7a9c',
  kidnap: '#45434a',
  // environment
  wall: '#cdbfa6',
  wallShade: '#b3a58e',
  floor: '#a99a86',
  wood: '#8a6a4f',
  woodDark: '#6b5140',
  blueGray: '#7d8b99',
  dustyPurple: '#8a7b92',
  olive: '#8a8a62',
  beige: '#d6c9b1',
  warm: '#ffcf8a',
  night: '#2a2840',
  red: '#c4553f',
  gold: '#e0b45a',
} as const;

export { clamp, desat, mix, shade } from '../../rig/palette';
