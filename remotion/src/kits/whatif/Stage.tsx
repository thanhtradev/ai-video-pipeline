import React from 'react';
import { AbsoluteFill, Easing, interpolate, random } from 'remotion';
import { clamp, useFrameSpec, type FrameSpec } from './theme';

/** Camera: the world point (x,y) lands on the frame's ANCHOR on screen, zoom z. The world is drawn in a 1080×1920 frame (+ margins). */
export type Cam = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r?: number;
};
/** World centre of the wide shot (sets are drawn around x≈500, floor y≈1500). */
export const WORLD = { x: 500, y: 860 } as const;
export const WIDE: Cam = { x: WORLD.x, y: WORLD.y + 80, z: 1 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerpCam = (a: Cam, b: Cam, k: number): Cam => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  z: lerp(a.z, b.z, k),
  r: lerp(a.r ?? 0, b.r ?? 0, k),
});
const ease = Easing.inOut(Easing.cubic);

/**
 * Sequence of hard camera cuts: [{at, a, b?}] – within each segment the camera drifts slowly a → b (push-in).
 * Segments longer than 100 frames are auto-split into size changes (tighten 1.22×) so framing changes every 1–3 s.
 */
export type CamSeg = {
  readonly at: number;
  readonly a: Cam;
  readonly b?: Cam;
  readonly hold?: boolean;
};
export const cutCam = (f: number, segs: readonly CamSeg[], dur: number): Cam => {
  let i = 0;
  while (i + 1 < segs.length && f >= segs[i + 1].at) i++;
  const s = segs[i];
  const end = i + 1 < segs.length ? segs[i + 1].at : dur;
  const len = Math.max(1, end - s.at);
  const k = interpolate(f, [s.at, end], [0, 1], clamp);
  const c = s.b ? lerpCam(s.a, s.b, ease(k)) : s.a;
  if (s.hold || len <= 100) return c;
  const parts = Math.ceil(len / 80);
  const part = Math.min(parts - 1, Math.floor(((f - s.at) / len) * parts));
  return part % 2 === 1 ? { ...c, z: c.z * 1.22 } : c;
};
/** List of cut frames (to check pacing). */
export const camCutFrames = (segs: readonly CamSeg[], dur: number) => {
  const out: number[] = [];
  segs.forEach((s, i) => {
    out.push(s.at);
    const end = i + 1 < segs.length ? segs[i + 1].at : dur;
    const len = end - s.at;
    if (!s.hold && len > 100) {
      const parts = Math.ceil(len / 80);
      for (let k = 1; k < parts; k++) out.push(Math.round(s.at + (len * k) / parts));
    }
  });
  return out;
};

/** Handheld shake (smooth, by seed). */
export const handheld = (f: number, amp: number, seed = 1) => {
  const n = (k: number, sp: number) =>
    Math.sin(f * sp + random(`hh${seed}${k}`) * 6.28) * 0.6 +
    Math.sin(f * sp * 2.3 + random(`hj${seed}${k}`) * 6.28) * 0.4;
  return { x: n(1, 0.11) * amp, y: n(2, 0.09) * amp, r: n(3, 0.07) * amp * 0.03 };
};

const layerTransform = (frame: FrameSpec, cam: Cam, p: number, sx = 0, sy = 0, sr = 0) => {
  const { ANCHOR, CAM_K } = frame;
  const cx = WORLD.x + (cam.x - WORLD.x) * p;
  const cy = WORLD.y + 80 + (cam.y - WORLD.y - 80) * p;
  const z = (1 + (cam.z - 1) * p) * CAM_K;
  return `translate(${ANCHOR.x + sx * p} ${ANCHOR.y + sy * p}) rotate(${(cam.r ?? 0) + sr}) scale(${z}) translate(${-cx} ${-cy})`;
};

export type StageProps = {
  readonly cam: Cam;
  readonly bg?: React.ReactNode;
  readonly mid?: React.ReactNode;
  readonly fg?: React.ReactNode;
  /** farthest background (sky, distant wall) – least parallax */
  readonly far?: React.ReactNode;
  readonly blurBg?: number;
  readonly blurFg?: number;
  readonly blurFar?: number;
  readonly shake?: number;
  readonly f?: number;
  readonly seed?: number;
  /** the single warm light source (world coordinates) */
  readonly glow?: { x: number; y: number; r: number; color: string; a?: number };
  readonly vignette?: number;
  readonly sky?: string;
  readonly children?: React.ReactNode;
  /** CSS filter for the far/bg/fg set layers (e.g. desaturation by act) */
  readonly layerFilter?: string;
};

const Layer: React.FC<{ t: string; blur: number; children: React.ReactNode; extra?: string }> = ({
  t,
  blur,
  children,
  extra,
}) => {
  const { W, H } = useFrameSpec();
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        position: 'absolute',
        inset: 0,
        filter: [blur > 0.3 ? `blur(${blur}px)` : '', extra ?? ''].join(' ').trim() || undefined,
        overflow: 'visible',
      }}
    >
      <g transform={t}>{children}</g>
    </svg>
  );
};

/** 3-layer stage: far/bg (blurred, slow drift) · mid (characters – sharp) · fg (blurred, fast drift). */
export const Stage: React.FC<StageProps> = ({
  cam,
  far,
  bg,
  mid,
  fg,
  blurBg = 5,
  blurFg = 9,
  blurFar = 7,
  shake = 0,
  f = 0,
  seed = 1,
  glow,
  vignette = 0.42,
  sky = '#2a2733',
  children,
  layerFilter,
}) => {
  const frame = useFrameSpec();
  const hh = shake ? handheld(f, shake, seed) : { x: 0, y: 0, r: 0 };
  // background blur increases slightly in close-ups (depth of field)
  const zb = interpolate(cam.z, [1, 3], [1, 1.6], clamp);
  return (
    <AbsoluteFill style={{ background: sky, overflow: 'hidden' }}>
      {far && (
        <Layer
          t={layerTransform(frame, cam, 0.45, hh.x, hh.y, hh.r)}
          blur={blurFar * zb}
          extra={layerFilter}
        >
          {far}
        </Layer>
      )}
      {bg && (
        <Layer
          t={layerTransform(frame, cam, 0.78, hh.x, hh.y, hh.r)}
          blur={blurBg * zb}
          extra={layerFilter}
        >
          {bg}
        </Layer>
      )}
      {glow && (
        <Layer t={layerTransform(frame, cam, 0.9, hh.x, hh.y, hh.r)} blur={0}>
          <defs>
            <radialGradient id={`glow${seed}`}>
              <stop offset="0" stopColor={glow.color} stopOpacity={glow.a ?? 0.55} />
              <stop offset="1" stopColor={glow.color} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle
            cx={glow.x}
            cy={glow.y}
            r={glow.r}
            fill={`url(#glow${seed})`}
            style={{ mixBlendMode: 'screen' }}
          />
        </Layer>
      )}
      {mid && (
        <Layer t={layerTransform(frame, cam, 1, hh.x, hh.y, hh.r)} blur={0}>
          {mid}
        </Layer>
      )}
      {fg && (
        <Layer
          t={layerTransform(frame, cam, 1.3, hh.x, hh.y, hh.r)}
          blur={blurFg * zb}
          extra={layerFilter}
        >
          {fg}
        </Layer>
      )}
      {children}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 60% at 46% 45%, rgba(0,0,0,0) 55%, rgba(10,6,14,${vignette}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

/** Flat muted backdrop (for rule / info graphics). */
export const Backdrop: React.FC<{ top: string; bottom: string; f: number; dots?: string }> = ({
  top,
  bottom,
  f,
  dots = '#ffffff',
}) => {
  const { W, H } = useFrameSpec();
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${top}, ${bottom})` }}>
      <svg width={W} height={H} style={{ position: 'absolute', filter: 'blur(10px)' }}>
        {Array.from({ length: 14 }, (_, i) => (
          <circle
            key={i}
            cx={((random(`bd${i}`) * W + f * (0.3 + random(`bv${i}`) * 0.4)) % (W + 200)) - 100}
            cy={random(`by${i}`) * H}
            r={30 + random(`br${i}`) * 90}
            fill={dots}
            opacity={0.05 + random(`bo${i}`) * 0.06}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};
