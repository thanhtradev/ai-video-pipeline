/** TikTok 2 channel – palette & type. Environment + side characters: muted, desaturated. Main character: saturated ORANGE hoodie. */
import { createContext, useContext } from 'react';
import { useVideoConfig } from 'remotion';

export { FONT, HAND } from './fonts';

/**
 * Screen geometry of a frame. The world (sets, characters) is drawn in portrait-design coordinates
 * (1080×1920, floor y≈1500); a frame says how the camera and screen-placed text map onto it.
 * Kits pick one (catalog.json `frame`, D-080); shared components read it with `useFrameSpec()`.
 */
export type FrameSpec = {
  readonly W: number;
  readonly H: number;
  /** Screen point the camera centre lands on. */
  readonly ANCHOR: { readonly x: number; readonly y: number };
  /** Global zoom: scenes are built in world coordinates (adult = 600 tall). */
  readonly CAM_K: number;
  /** Text safe area. */
  readonly SAFE: { readonly left: number; readonly right: number; readonly bottom: number };
  /** Maps portrait-design screen coordinates (1080×1920) to this frame – for screen-placed text/effects. */
  readonly PX: (x: number, y: number) => { x: number; y: number };
  /** Default caption line centre (y) and font size. */
  readonly CAPTION_Y: number;
  readonly CAPTION_SIZE: number;
  /** Default centre (y) of the big countdown clock. */
  readonly CLOCK_Y: number;
  /** Default `PortraitBox` scale: portrait-design graphics fitted into the frame. */
  readonly PORTRAIT_SCALE: number;
};

/** 16:9 frame (the user switched from 9:16 to 16:9 on 2026-10-24): the landscape frame sees wider. */
export const LANDSCAPE: FrameSpec = {
  W: 1920,
  H: 1080,
  ANCHOR: { x: 960, y: 540 },
  CAM_K: 0.85,
  // 5% margins
  SAFE: { left: 1920 * 0.05, right: 1920 * 0.95, bottom: 1080 * 0.92 },
  PX: (x, y) => ({ x: 960 + (x - 500) * 1.2, y: y * 0.5625 }),
  CAPTION_Y: 950,
  CAPTION_SIZE: 50,
  CLOCK_Y: 470,
  PORTRAIT_SCALE: 0.5625,
};

/** 9:16 frame (D-080, the science kit): the world's own design frame; TikTok/Shorts UI covers the bottom fifth. */
export const PORTRAIT: FrameSpec = {
  W: 1080,
  H: 1920,
  ANCHOR: { x: 540, y: 960 },
  CAM_K: 1,
  SAFE: { left: 1080 * 0.06, right: 1080 * 0.94, bottom: 1920 * 0.8 },
  PX: (x, y) => ({ x, y }),
  CAPTION_Y: 1380,
  CAPTION_SIZE: 64,
  CLOCK_Y: 700,
  PORTRAIT_SCALE: 1,
};

/** The spec of a composition size: portrait when taller than wide. */
export const frameSpec = (width: number, height: number): FrameSpec =>
  height > width ? PORTRAIT : LANDSCAPE;

/**
 * Overrides the composition's frame for the episode drawn inside, e.g. scaled tiles on a
 * storyboard page whose own size is neither frame.
 */
export const FrameSpecContext = createContext<FrameSpec | null>(null);

/** The spec of the current episode frame, for components shared by kits with different frames. */
export const useFrameSpec = (): FrameSpec => {
  const override = useContext(FrameSpecContext);
  const { width, height } = useVideoConfig();
  return override ?? frameSpec(width, height);
};

/** This kit's frame, for episode code (kit/active/theme). */
export const { W, H, ANCHOR, CAM_K, SAFE, PX } = LANDSCAPE;

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
