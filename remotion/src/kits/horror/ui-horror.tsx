import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { useFrameSpec } from '../whatif/theme';
import { HAND } from '../whatif/theme';
import { Grain } from '../whatif/ui';
import { POST } from './theme';

/**
 * Screen-level pieces of the "Kinh dị" kit (style v2, D-111): the typewriter title card, the
 * black-out beat, the glitch when NÓ appears, and the post stack (grain + vignette + flicker).
 * No animated dashes anywhere (D-088).
 */
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Characters typed per frame by the title card. */
export const TYPE_RATE = 0.55;
/** Frames the cursor stays on each blink phase. */
const CURSOR_BLINK = 16;

/** How many characters of `text` are typed at frame `f` (from the card's own start). */
export const typedChars = (text: string, f: number): number =>
  Math.max(0, Math.min(text.length, Math.floor(f * TYPE_RATE)));

/**
 * Title card: typewriter text on black, a blinking block cursor, nothing else. Used once at the
 * start (the episode title) and once at the end (the closing line). `f` counts from its own start.
 */
export const TitleCard: React.FC<{
  readonly text: string;
  readonly f: number;
  readonly size?: number;
  readonly y?: number;
  readonly fadeOutFrom?: number;
}> = ({ text, f, size = 54, y, fadeOutFrom }) => {
  const { W, H } = useFrameSpec();
  const shown = text.slice(0, typedChars(text, f));
  const cursorOn = Math.floor(f / CURSOR_BLINK) % 2 === 0;
  const opacity =
    fadeOutFrom === undefined ? 1 : interpolate(f, [fadeOutFrom, fadeOutFrom + 20], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: '#000', opacity }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <text
          x={W / 2}
          y={y ?? H * 0.52}
          textAnchor="middle"
          fontFamily={HAND}
          fontSize={size}
          fill="#cfc8b8"
          letterSpacing={2}
        >
          {shown}
          {cursorOn ? <tspan opacity={0.8}>▌</tspan> : null}
        </text>
      </svg>
      <Grain f={f} a={POST.grain * 0.8} />
    </AbsoluteFill>
  );
};

/** Black-out beat: full black with optional fades (frames). Only sound plays under it. */
export const Blackout: React.FC<{
  readonly f: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly dur: number;
}> = ({ f, fadeIn = 0, fadeOut = 0, dur }) => {
  const a = Math.min(
    fadeIn > 0 ? interpolate(f, [0, fadeIn], [0, 1], clamp) : 1,
    fadeOut > 0 ? interpolate(f, [dur - fadeOut, dur], [1, 0], clamp) : 1,
  );
  return <AbsoluteFill style={{ background: '#000', opacity: a, pointerEvents: 'none' }} />;
};

/**
 * Glitch: for `frames` frames from `at`, the children are drawn three times with the colour
 * channels split and a few horizontal slices shifted; outside that window they are drawn once.
 */
export const Glitch: React.FC<{
  readonly f: number;
  readonly at: number;
  readonly frames?: number;
  readonly seed?: number;
  readonly children: React.ReactNode;
}> = ({ f, at, frames = 6, seed = 1, children }) => {
  const k = f - at;
  if (k < 0 || k >= frames) return <>{children}</>;
  const r = (i: number) => random(`gl${seed}-${f}-${i}`);
  const dx = 4 + r(0) * 6;
  const slices = Array.from({ length: 3 }, (_, i) => ({
    top: r(10 + i) * 100,
    h: 3 + r(20 + i) * 9,
    shift: (r(30 + i) - 0.5) * 40,
  }));
  const channel = (filter: string, x: number) => (
    <AbsoluteFill style={{ filter, transform: `translateX(${x}px)`, mixBlendMode: 'screen' }}>
      {children}
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {channel('url(#glitch-r)', -dx)}
      {channel('url(#glitch-g)', 0)}
      {channel('url(#glitch-b)', dx)}
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="glitch-r">
          <feColorMatrix values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <filter id="glitch-g">
          <feColorMatrix values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <filter id="glitch-b">
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
      </svg>
      {slices.map((s, i) => (
        <AbsoluteFill
          key={i}
          style={{
            clipPath: `inset(${s.top}% 0 ${Math.max(0, 100 - s.top - s.h)}% 0)`,
            transform: `translateX(${s.shift}px)`,
          }}
        >
          {children}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/** Slow lamp flicker in 0.8…1 for frame f: multiply a set's `glow.a` by it. */
export const flickerGain = (f: number, seed = 0): number =>
  0.9 + 0.1 * Math.sin(f * 1.7 + seed) * Math.sin(f * 0.43 + seed);

/**
 * Post stack over a shot: film grain and a heavier vignette than the Stage's own. Wrap the
 * SetStage of every shot in it (the Stage vignette is set through `POST.vignette`).
 */
export const HorrorPost: React.FC<{ readonly f: number; readonly children: React.ReactNode }> = ({
  f,
  children,
}) => (
  <AbsoluteFill>
    {children}
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 58% at 50% 46%, rgba(0,0,0,0) 50%, rgba(4,3,8,${POST.vignette}) 100%)`,
        pointerEvents: 'none',
      }}
    />
    <Grain f={f} a={POST.grain} />
  </AbsoluteFill>
);
