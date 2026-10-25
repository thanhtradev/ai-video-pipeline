import React from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';
import { Character, CharacterProps } from '../ep1/Character';
import { C, clamp, FONT, HAND } from '../ep1/theme';
import { ShotH } from './time';

/**
 * EP3 "Quay lại 30 giây – 3 lần mỗi ngày" kit. Reuses the channel's Character/SetStage/Stage (src/tiktok2/ep1) and
 * EP2's Stage2/GradeCtx/actors (src/tiktok2/ep2/kit) to keep the style consistent.
 */
export { Co, Extra, GradeCtx, Me, Stage2, bodyCam, faceCam, headY } from '../ep2/kit';

type A = Omit<CharacterProps, 'hoodieColor'> & { readonly hoodieColor?: string };
/** You: ORANGE hoodie (no messy hair in EP3 – only Phong has spiky hair, to tell them apart). */
export const Ban: React.FC<A> = (p) => <Character seed={1} hoodieColor={C.orange} {...p} />;
/** Linh: muted dusty-pink hoodie, short ponytail, hair clip. */
export const Linh: React.FC<A> = (p) => (
  <Character
    seed={12}
    hoodieColor="#c99aa6"
    size={0.97}
    {...p}
    accessories={['ponytail', 'clip', ...(p.accessories ?? [])]}
  />
);
/** Phong: navy hoodie, spiky hair, a little taller than you. */
export const Phong: React.FC<A> = (p) => (
  <Character seed={13} hoodieColor="#3f4f72" size={1.08} hair {...p} />
);
/** Neighbourhood goalkeeper: grey hoodie, big gloves. */
export const Goalie: React.FC<A> = (p) => (
  <Character
    seed={14}
    hoodieColor="#8e8e94"
    size={1.0}
    {...p}
    accessories={['gloves', ...(p.accessories ?? [])]}
  />
);

// ───────── REWIND ─────────
/**
 * Rewind layer: the whole frame tints pale blue, blurred horizontal motion streaks, a faint clock hand spinning backwards in the centre.
 * k = progress 0…1 (≈1.2 s), snaps back to normal colour at k ≥ 1. The scene underneath moves people/objects backwards via `rewindTime`.
 */
export const RewindFX: React.FC<{
  f: number;
  from: number;
  dur?: number;
  children: React.ReactNode;
}> = ({ f, from, dur = 36, children }) => {
  const u = f - from;
  const on = u >= 0 && u < dur;
  const k = interpolate(u, [0, 4, dur - 5, dur], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          filter: on
            ? `saturate(${1 - 0.45 * k}) hue-rotate(${-12 * k}deg) brightness(${1 + 0.06 * k})`
            : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
      {on && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <AbsoluteFill
            style={{ background: 'rgba(120,170,255,0.32)', mixBlendMode: 'screen', opacity: k }}
          />
          <svg width={1920} height={1080} style={{ position: 'absolute', opacity: k }}>
            {Array.from({ length: 26 }, (_, i) => {
              const y = random(`rw${i}`) * 1080;
              const len = 200 + random(`rl${i}`) * 600;
              const x =
                1920 -
                (((u * (60 + random(`rv${i}`) * 80) + random(`rx${i}`) * 2400) % 2600) - 300);
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={len}
                  height={2 + random(`rh${i}`) * 4}
                  rx={2}
                  fill="#eaf2ff"
                  opacity={0.25 + random(`ro${i}`) * 0.35}
                />
              );
            })}
            <g transform="translate(960,500)" opacity={0.45}>
              <circle r={210} fill="none" stroke="#eaf2ff" strokeWidth={8} />
              {Array.from({ length: 12 }, (_, i) => (
                <line
                  key={i}
                  x1={0}
                  y1={-190}
                  x2={0}
                  y2={-170}
                  stroke="#eaf2ff"
                  strokeWidth={6}
                  transform={`rotate(${i * 30})`}
                />
              ))}
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-170}
                stroke="#eaf2ff"
                strokeWidth={10}
                strokeLinecap="round"
                transform={`rotate(${-u * 28})`}
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={-110}
                stroke="#eaf2ff"
                strokeWidth={14}
                strokeLinecap="round"
                transform={`rotate(${-u * 6})`}
              />
              <path
                d="M-240 -60 A250 250 0 0 1 -60 -240"
                stroke="#eaf2ff"
                strokeWidth={10}
                fill="none"
              />
              <path
                d="M-60 -240 l-10 34 l36 -14 Z"
                fill="#eaf2ff"
                transform="rotate(-80 -60 -240)"
              />
            </g>
          </svg>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
/** "World" time during a rewind: inside the rewind window side people/objects run backwards fast (the main character does NOT). */
export const rewindTime = (f: number, from: number, dur = 36, speed = 5) =>
  f < from ? f : f < from + dur ? from - (f - from) * speed : from - dur * speed + (f - from - dur);

/** Fist extreme close-up: three light rings shrink on a 3–2–1 beat (rings=false: no rings – out of turns). */
export const FistECU: React.FC<{
  f: number;
  at: number;
  rings?: boolean;
  release?: number;
  shake?: number;
}> = ({ f, at, rings = true, release, shake = 0 }) => {
  const u = f - at;
  const beat = 10;
  const open = release !== undefined && f >= release;
  const j = shake ? Math.sin(f * 2.4) * shake * 6 : 0;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <g transform={`translate(${960 + j},${560})`}>
        <path
          d="M-900 520 Q-450 380 -120 60"
          stroke={C.orange}
          strokeWidth={240}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M-900 520 Q-450 380 -120 60"
          stroke={C.ink}
          strokeWidth={10}
          fill="none"
          opacity={0.12}
        />
        {open ? (
          <g>
            <ellipse
              cx={20}
              cy={-10}
              rx={200}
              ry={150}
              fill={C.ink}
              stroke={C.rim}
              strokeWidth={6}
            />
            <ellipse
              cx={170}
              cy={-130}
              rx={60}
              ry={90}
              fill={C.ink}
              stroke={C.rim}
              strokeWidth={5}
              transform="rotate(40 170 -130)"
            />
          </g>
        ) : (
          <g>
            <circle r={170} fill={C.ink} stroke={C.rim} strokeWidth={6} />
            {[-90, -30, 30, 90].map((x) => (
              <ellipse
                key={x}
                cx={x}
                cy={-120}
                rx={40}
                ry={30}
                fill="#221d28"
                stroke="#3a3440"
                strokeWidth={3}
              />
            ))}
            <ellipse cx={-60} cy={-50} rx={46} ry={26} fill="#3a3440" opacity={0.5} />
          </g>
        )}
        {rings &&
          [0, 1, 2].map((i) => {
            const t0 = i * beat;
            const k = interpolate(u - t0, [0, beat], [1, 0], clamp);
            if (u < t0 || u > t0 + beat + 2 || open) return null;
            return (
              <circle
                key={i}
                r={190 + 220 * k}
                fill="none"
                stroke="#ffd27a"
                strokeWidth={10 * k + 2}
                opacity={0.4 + 0.6 * (1 - k)}
                style={{ filter: 'drop-shadow(0 0 14px #ffc870)' }}
              />
            );
          })}
        {rings && u >= 0 && u < beat * 3 + 2 && !open && (
          <text
            x={0}
            y={-260}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={110}
            fill="#fff"
            stroke="#15121a"
            strokeWidth={12}
            paintOrder="stroke"
          >
            {3 - Math.min(2, Math.floor(u / beat))}
          </text>
        )}
      </g>
    </svg>
  );
};

/** Three rewind dots top left: `used` dots filled orange; `pop` = frame the last dot fills (bounce); shake = shakes when out of turns. */
export const RewindCounter: React.FC<{
  used: number;
  f: number;
  pop?: number;
  shake?: number;
  show?: number;
}> = ({ used, f, pop = -99, shake = 0, show = 1 }) => {
  if (show <= 0) return null;
  const j = shake ? Math.sin(f * 2.6) * shake * 4 : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 60 + j,
        top: 54,
        display: 'flex',
        gap: 20,
        opacity: show,
        padding: '14px 20px',
        borderRadius: 40,
        background: 'rgba(21,18,26,0.55)',
      }}
    >
      {[0, 1, 2].map((i) => {
        const filled = i < used;
        const s =
          filled && i === used - 1 ? interpolate(f - pop, [0, 4, 9], [1.6, 0.9, 1], clamp) : 1;
        return (
          <div
            key={i}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              border: `5px solid ${filled ? C.orange : '#f3e2c2'}`,
              background: filled ? C.orange : 'rgba(255,255,255,0.08)',
              transform: `scale(${s})`,
              boxShadow: filled ? '0 0 14px rgba(255,122,26,0.7)' : undefined,
            }}
          />
        );
      })}
    </div>
  );
};

/** Hand-drawn notebook: three circles per page; `filled` circles shaded; flip 0…1 turns to a new page. */
export const Notebook: React.FC<{
  f: number;
  filled: number;
  fillAt?: number[];
  flip?: number;
  prevFilled?: number;
  label?: string;
}> = ({ f, filled, fillAt = [], flip = 0, prevFilled = 0, label = 'THỨ ...' }) => {
  const page = (n: number, lbl: string, offset = 0) => (
    <g transform={`translate(${offset},0)`}>
      <rect x={-330} y={-230} width={660} height={460} rx={14} fill="#f6f0e2" />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1={-300}
          y1={-150 + i * 50}
          x2={300}
          y2={-150 + i * 50}
          stroke="#cfd8e6"
          strokeWidth={3}
        />
      ))}
      <line x1={-260} y1={-230} x2={-260} y2={230} stroke="#e8a0a0" strokeWidth={3} />
      <text x={-230} y={-170} fontFamily={HAND} fontSize={48} fill="#4a4652">
        {lbl}
      </text>
      {[0, 1, 2].map((i) => {
        const k =
          i < n
            ? fillAt[i] !== undefined
              ? interpolate(f - fillAt[i], [0, 10], [0, 1], clamp)
              : 1
            : 0;
        return (
          <g key={i} transform={`translate(${-150 + i * 150},40)`}>
            <path
              d="M-52 4 C-50 -50 50 -56 54 -2 C56 52 -48 56 -52 4 Z"
              fill="none"
              stroke="#4a4652"
              strokeWidth={6}
            />
            {k > 0 && (
              <path
                d="M-40 4 C-38 -38 38 -42 42 -2 C44 40 -36 42 -40 4 Z"
                fill={C.orange}
                opacity={0.9}
                transform={`scale(${k})`}
              />
            )}
          </g>
        );
      })}
    </g>
  );
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <g transform="translate(960,520) rotate(-3)">
        <rect x={-360} y={-260} width={720} height={520} rx={20} fill="#6f5a48" />
        {flip > 0 && page(prevFilled, 'hôm qua', -700 * flip)}
        <g opacity={flip > 0 ? flip : 1}>{page(filled, label)}</g>
        {[-200, -60, 80, 220].map((x) => (
          <circle key={x} cx={x} cy={-250} r={14} fill="#2a2630" />
        ))}
      </g>
    </svg>
  );
};

/** Wall clock / time close-up. */
export const BigClock: React.FC<{ time: string; f: number; sub?: string }> = ({ time, f, sub }) => {
  const [h, m] = time.split(':').map(Number);
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <g transform={`translate(960,500) scale(${1 + f * 0.0015})`}>
        <circle r={300} fill="#efe7d6" stroke="#6b5140" strokeWidth={28} />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={-270}
            x2={0}
            y2={-240}
            stroke="#4a4652"
            strokeWidth={10}
            transform={`rotate(${i * 30})`}
          />
        ))}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-150}
          stroke="#333"
          strokeWidth={18}
          strokeLinecap="round"
          transform={`rotate(${(h % 12) * 30 + m * 0.5})`}
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-230}
          stroke="#333"
          strokeWidth={12}
          strokeLinecap="round"
          transform={`rotate(${m * 6})`}
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-250}
          stroke="#b2463a"
          strokeWidth={5}
          transform={`rotate(${f * 6})`}
        />
        <text
          y={420}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={90}
          fill="#fff"
          stroke="#15121a"
          strokeWidth={10}
          paintOrder="stroke"
        >
          {sub ?? time}
        </text>
      </g>
    </svg>
  );
};

/** Falling leaf (forwards, or backwards up to the branch). */
export const Leaf: React.FC<{ x: number; y: number; r?: number; s?: number }> = ({
  x,
  y,
  r = 0,
  s = 1,
}) => (
  <path
    d="M0 0 C20 -26 52 -20 60 0 C52 20 20 26 0 0 Z"
    fill="#8a9a5c"
    transform={`translate(${x},${y}) rotate(${r}) scale(${s})`}
  />
);

/** Audio cue (local frame). */
export type Cue = {
  readonly src: string;
  readonly at: number;
  readonly vol?: number;
  readonly dur?: number;
  readonly loop?: boolean;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
};
export const hit = (src: string, at: number, vol = 0.7, dur?: number): Cue => ({
  src,
  at,
  vol,
  dur,
});
export const loopFor = (src: string, at: number, end: number, vol = 0.5, fade = 8): Cue => ({
  src,
  at,
  vol,
  dur: Math.max(1, Math.round(end - at)),
  loop: true,
  fadeIn: fade,
  fadeOut: fade,
});
/** 3–2–1 (tick ×3) then rewind. */
export const countRewind = (fist: number, rew: number, vol = 0.8): Cue[] => [
  hit('tick', fist, vol * 0.7),
  hit('tick', fist + 10, vol * 0.7),
  hit('tick', fist + 20, vol * 0.7),
  hit('rewind', rew, vol),
];
/** Rewind + dot-fill pop. */
export const rewindDot = (rew: number, dot: number, vol = 0.8): Cue[] => [
  hit('rewind', rew, vol),
  hit('dot_bup', dot, vol * 0.8),
];

export type Amb =
  | 'gate'
  | 'class'
  | 'yard'
  | 'bedroom'
  | 'rules'
  | 'street'
  | 'station'
  | 'night'
  | 'canteen'
  | 'quiet'
  | 'none';
export type ShotDef = {
  readonly C: React.FC;
  readonly fx?: (h: ShotH) => Cue[];
  readonly amb: Amb;
};
export { clamp };
