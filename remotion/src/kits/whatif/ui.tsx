import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C, clamp, FONT, useFrameSpec } from './theme';
import { tr } from './lang';
import { CaptionLine, CaptionWord } from './timeline-types';

const stroke = (w: number, c = '#15121a') => ({
  WebkitTextStroke: `${w}px ${c}`,
  paintOrder: 'stroke fill' as const,
});

/** "m:ss" */
export const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Breath ring (top left). sec = seconds of breath held (story time). cap = capacity (the ring drains).
 * Blue → yellow → red (red past 2 minutes or when nearly empty). show 0…1 (bouncy show/hide).
 */
export const BreathRing: React.FC<{
  sec: number;
  cap?: number;
  show: number;
  big?: boolean;
  x?: number;
  y?: number;
  f?: number;
}> = ({ sec, cap = 60, show, big, x, y, f = 0 }) => {
  const { W, H, CLOCK_Y } = useFrameSpec();
  if (show <= 0.001) return null;
  const k = Math.max(0, Math.min(1, 1 - sec / cap));
  const red = sec >= 120 || k < 0.2;
  const col = red ? '#ff4a3a' : k < 0.5 ? '#ffc83a' : '#4fd47a';
  const R = big ? 200 : 74;
  const cx = x ?? (big ? W / 2 : 130);
  const cy = y ?? (big ? CLOCK_Y : 140);
  const pulse = red ? 1 + Math.sin(f * 0.6) * 0.04 : 1;
  const sc = show * pulse;
  const circ = 2 * Math.PI * R;
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <g transform={`translate(${cx},${cy}) scale(${sc})`} opacity={Math.min(1, show * 1.4)}>
        <circle r={R + (big ? 30 : 16)} fill="#15121a" opacity={0.55} />
        <circle
          r={R}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.16}
          strokeWidth={big ? 30 : 15}
        />
        <circle
          r={R}
          fill="none"
          stroke={col}
          strokeWidth={big ? 30 : 15}
          strokeLinecap="round"
          strokeDasharray={`${circ * k} ${circ}`}
          transform="rotate(-90)"
          style={{ filter: `drop-shadow(0 0 ${big ? 18 : 8}px ${col})` }}
        />
        <text
          y={big ? 44 : 15}
          textAnchor="middle"
          fill="#fff"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={big ? 130 : 46}
        >
          {mmss(sec)}
        </text>
        {!big && (
          <text
            y={R + 46}
            textAnchor="middle"
            fill="#fff"
            opacity={0.85}
            fontFamily={FONT}
            fontWeight={800}
            fontSize={24}
            style={stroke(5)}
          >
            {tr('NÍN THỞ', 'BREATH HELD')}
          </text>
        )}
      </g>
    </svg>
  );
};
/** Ring visibility: bounces in at `a`, shrinks away at `b`. */
export const ringShow = (f: number, a: number, b = Infinity) =>
  interpolate(f, [a, a + 6, a + 10], [0, 1.15, 1], clamp) *
  (Number.isFinite(b) ? interpolate(f, [b, b + 7], [1, 0], clamp) : 1);

/** Big bold bouncing text (TEXT). */
export const BigText: React.FC<{
  lines: readonly string[];
  from: number;
  f: number;
  y?: number;
  size?: number;
  color?: string;
  accent?: number[];
  out?: number;
  tilt?: number;
}> = ({
  lines,
  from,
  f,
  y = 480,
  size = 96,
  color = '#ffffff',
  accent = [],
  out = Infinity,
  tilt = -2,
}) => {
  const { fps } = useVideoConfig();
  const { SAFE, PX } = useFrameSpec();
  if (f < from || f > out + 8) return null;
  const s = spring({ frame: f - from, fps, config: { damping: 9, stiffness: 160, mass: 0.7 } });
  const o = Number.isFinite(out) ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: SAFE.left + 160,
          width: SAFE.right - SAFE.left - 320,
          top: PX(0, y).y - 60,
          textAlign: 'center',
          transform: `scale(${0.4 + 0.6 * s}) rotate(${tilt}deg)`,
          opacity: o * Math.min(1, s * 2),
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: size * 0.8,
              lineHeight: 1.08,
              color: accent.includes(i) ? C.orange : color,
              textShadow: '0 8px 0 rgba(0,0,0,0.35)',
              ...stroke(size * 0.1),
              transform: `translateY(${Math.sin((f - from) / 12 + i) * 3}px)`,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Free-placed effect text (PHÙ, BẮT CÓC!…). */
export const Pow: React.FC<{
  text: string;
  x: number;
  y: number;
  from: number;
  f: number;
  size?: number;
  color?: string;
  rot?: number;
  out?: number;
}> = ({ text, x, y, from, f, size = 140, color = '#ffffff', rot = -6, out = Infinity }) => {
  const { fps } = useVideoConfig();
  const { PX } = useFrameSpec();
  if (f < from || f > out + 6) return null;
  const s = spring({ frame: f - from, fps, config: { damping: 7, stiffness: 220, mass: 0.6 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: PX(x, y).x,
        top: PX(x, y).y,
        transform: `translate(-50%,-50%) scale(${s}) rotate(${rot}deg)`,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size * 0.75,
        color,
        whiteSpace: 'nowrap',
        opacity: Number.isFinite(out) ? interpolate(f, [out, out + 6], [1, 0], clamp) : 1,
        textShadow: '0 10px 0 rgba(0,0,0,0.35)',
        ...stroke(size * 0.1),
      }}
    >
      {text}
    </div>
  );
};

/** TikTok-style captions: 2–4 word chunks, white text with black outline, the spoken word in ORANGE, ~62% of height; hidden in holds/silence. */
type Chunk = { words: readonly CaptionWord[]; from: number; to: number };
// keyed by the sentence object (not its id): episodes / language versions share the ids L001…
const CHUNKS = new WeakMap<object, Chunk[]>();
const chunksOf = (l: CaptionLine): Chunk[] => {
  const hit = CHUNKS.get(l);
  if (hit) return hit;
  const out: Chunk[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (cur.length)
      out.push({ words: cur, from: cur[0][2] as number, to: cur[cur.length - 1][3] as number });
    cur = [];
  };
  l.words.forEach((w, i) => {
    cur.push(w);
    const txt = w[0] as string;
    const left = l.words.length - i - 1;
    const punct = /[,.:;!?…—"”]$/.test(txt);
    if (
      (cur.length >= 3 && left !== 1) ||
      cur.length >= 4 ||
      (punct && cur.length >= 2) ||
      (punct && left === 0)
    )
      flush();
  });
  flush();
  // merge a single trailing word into the previous chunk
  for (let i = out.length - 1; i > 0; i--) {
    if (out[i].words.length === 1 && out[i - 1].words.length < 4) {
      out[i - 1] = {
        words: [...out[i - 1].words, ...out[i].words],
        from: out[i - 1].from,
        to: out[i].to,
      };
      out.splice(i, 1);
    }
  }
  CHUNKS.set(l, out);
  return out;
};

export const Captions: React.FC<{
  hide?: (abs: number) => boolean;
  yAt?: (abs: number) => number;
  /** sentence spoken at a frame (the episode's `speakingAt`) */
  speaking: (abs: number) => CaptionLine | null;
  /** font size (px; default per frame) */
  size?: number;
  /** keep a sentence's caption into the hold: [sentence, until absolute frame] */
  sticky?: readonly (readonly [CaptionLine, number])[];
}> = ({ hide, yAt, speaking, size: sizeProp, sticky = [] }) => {
  const abs = useCurrentFrame();
  const { SAFE, CAPTION_Y, CAPTION_SIZE } = useFrameSpec();
  const size = sizeProp ?? CAPTION_SIZE;
  const l = speaking(abs) ?? sticky.find(([sl, until]) => abs >= sl.to && abs < until)?.[0] ?? null;
  if (!l || hide?.(abs)) return null;
  const chunks = chunksOf(l);
  const c =
    chunks.find((k, i) => abs < (chunks[i + 1]?.from ?? Infinity)) ?? chunks[chunks.length - 1];
  const t = abs - Math.max(c.from, l.from);
  const pop = interpolate(t, [0, 3, 6], [0.82, 1.06, 1], clamp);
  const y = yAt?.(abs) ?? CAPTION_Y;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          width: SAFE.right - SAFE.left,
          top: y,
          transform: `translateY(-50%) scale(${pop})`,
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        {c.words.map((w, i) => {
          const active =
            abs >= (w[2] as number) && abs < ((c.words[i + 1]?.[2] as number) ?? Infinity);
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: size,
                color: active ? C.orange : '#ffffff',
                margin: `0 ${size * 0.16}px`,
                display: 'inline-block',
                textShadow: '0 4px 0 rgba(0,0,0,0.4)',
                ...stroke(size * 0.16),
              }}
            >
              {String(w[0])
                .replace(/[—"“”]/g, '')
                .toUpperCase()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Round icon popping up (rules). */
export const IconBubble: React.FC<{
  x: number;
  y: number;
  from: number;
  f: number;
  children: React.ReactNode;
  color?: string;
  r?: number;
}> = ({ x, y, from, f, children, color = '#3a3346', r = 90 }) => {
  const { fps } = useVideoConfig();
  if (f < from) return null;
  const s = spring({ frame: f - from, fps, config: { damping: 10, stiffness: 170 } });
  return (
    <g transform={`translate(${x},${y + Math.sin((f - from) / 14) * 6}) scale(${s})`}>
      <circle r={r + 8} fill="#000" opacity={0.18} transform="translate(0,10)" />
      <circle r={r} fill={color} stroke="#f3e2c2" strokeWidth={5} />
      {children}
    </g>
  );
};

/** Speech bubble (can be struck through). */
export const SpeechBubble: React.FC<{
  x: number;
  y: number;
  s?: number;
  crossed?: number;
  text?: string;
}> = ({ x, y, s = 1, crossed = 0, text = '...' }) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path
      d="M-170 -110 Q-170 -160 -120 -160 L120 -160 Q170 -160 170 -110 L170 10 Q170 60 120 60 L-20 60 L-80 120 L-70 60 L-120 60 Q-170 60 -170 10 Z"
      fill="#f6f1e6"
    />
    <text
      x={0}
      y={-30}
      textAnchor="middle"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={90}
      fill="#3a3346"
    >
      {text}
    </text>
    {crossed > 0 && (
      <g stroke="#ff4a3a" strokeWidth={26} strokeLinecap="round">
        <line
          x1={-150}
          y1={-150}
          x2={-150 + 300 * Math.min(1, crossed * 2)}
          y2={-150 + 200 * Math.min(1, crossed * 2)}
        />
        {crossed > 0.5 && (
          <line
            x1={150}
            y1={-150}
            x2={150 - 300 * Math.min(1, (crossed - 0.5) * 2)}
            y2={-150 + 200 * Math.min(1, (crossed - 0.5) * 2)}
          />
        )}
      </g>
    )}
  </g>
);

/** Simple lungs + rising CO2 bubbles + warning light. */
export const Lungs: React.FC<{ f: number; level: number; alarm: number }> = ({
  f,
  level,
  alarm,
}) => {
  const blink = alarm > 0 && Math.floor(f / 6) % 2 === 0;
  return (
    <g>
      <defs>
        <clipPath id="lungclip">
          <path d="M-30 -300 Q-60 -330 -150 -260 Q-260 -150 -250 60 Q-240 170 -120 160 Q-40 150 -30 40 Z M30 -300 Q60 -330 150 -260 Q260 -150 250 60 Q240 170 120 160 Q40 150 30 40 Z" />
        </clipPath>
      </defs>
      <path
        d="M0 -420 L0 -300 M0 -300 L-60 -250 M0 -300 L60 -250"
        stroke="#d89a9a"
        strokeWidth={26}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M-30 -300 Q-60 -330 -150 -260 Q-260 -150 -250 60 Q-240 170 -120 160 Q-40 150 -30 40 Z M30 -300 Q60 -330 150 -260 Q260 -150 250 60 Q240 170 120 160 Q40 150 30 40 Z"
        fill="#e2a7a4"
      />
      <g clipPath="url(#lungclip)">
        <rect
          x={-300}
          y={160 - 480 * level}
          width={600}
          height={480 * level}
          fill="#8a6fa8"
          opacity={0.75}
        />
        {Array.from({ length: 26 }, (_, i) => {
          const bx = -230 + random(`co${i}`) * 460;
          const sp = 1 + random(`cs${i}`) * 2;
          const by = 160 - ((f * sp + random(`cy${i}`) * 400) % 480) * level;
          return (
            <circle
              key={i}
              cx={bx + Math.sin(f / 9 + i) * 8}
              cy={by}
              r={8 + random(`cr${i}`) * 12}
              fill="#d9cdf0"
              opacity={0.7}
            />
          );
        })}
      </g>
      <text
        x={0}
        y={-60}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={70}
        fill="#fff"
        opacity={level > 0.15 ? 1 : 0}
        style={stroke(10, '#3a2a4a')}
      >
        CO₂
      </text>
      {alarm > 0 && (
        <g transform="translate(250,-330)">
          <circle r={70} fill={blink ? '#ff4a3a' : '#5a2a2a'} />
          {blink && (
            <circle r={150} fill="#ff4a3a" opacity={0.3} style={{ filter: 'blur(18px)' }} />
          )}
          <text
            y={26}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight={800}
            fontSize={80}
            fill="#fff"
          >
            !
          </text>
        </g>
      )}
    </g>
  );
};

/** Horizontal comparison bar. */
export const Bar: React.FC<{
  x: number;
  y: number;
  w: number;
  k: number;
  color: string;
  label: string;
  value: string;
  h?: number;
}> = ({ x, y, w, k, color, label, value, h = 90 }) => (
  <g transform={`translate(${x},${y})`}>
    <text y={-24} fontFamily={FONT} fontWeight={800} fontSize={46} fill="#fff" style={stroke(8)}>
      {label}
    </text>
    <rect width={w} height={h} rx={h / 2} fill="#ffffff" opacity={0.12} />
    <rect width={Math.max(h, w * k)} height={h} rx={h / 2} fill={color} />
    <text
      x={Math.max(h, w * k) - 24}
      y={h / 2 + 22}
      textAnchor="end"
      fontFamily={FONT}
      fontWeight={800}
      fontSize={58}
      fill="#fff"
      style={stroke(8)}
    >
      {value}
    </text>
  </g>
);

/** Portrait phone frame (secret clip / group chat) – no real app logos. */
export const PhoneFrame: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  rot?: number;
  children: React.ReactNode;
}> = ({ x, y, w = 760, h = 1360, rot = 0, children }) => (
  <div
    style={{
      position: 'absolute',
      left: x - w / 2,
      top: y - h / 2,
      width: w,
      height: h,
      borderRadius: 70,
      background: '#1b1a20',
      padding: 22,
      boxShadow: '0 40px 80px rgba(0,0,0,0.45)',
      transform: `rotate(${rot}deg)`,
    }}
  >
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 52,
        overflow: 'hidden',
        background: '#222',
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: 'absolute',
        top: 34,
        left: w / 2 - 70,
        width: 140,
        height: 34,
        borderRadius: 20,
        background: '#1b1a20',
      }}
    />
  </div>
);

/** Film grain for phone clips. */
export const Grain: React.FC<{ f: number; a?: number }> = ({ f, a = 0.18 }) => (
  <svg
    width="100%"
    height="100%"
    style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: a }}
  >
    <filter id={`grain${f % 7}`}>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 50} />
    </filter>
    <rect width="100%" height="100%" filter={`url(#grain${f % 7})`} />
  </svg>
);

export const BIG_TEXT_STYLE = stroke;

/** Container for graphics designed for the portrait screen (1080×1920), scaled into the centre of the frame (1:1 in a portrait frame). */
export const PortraitBox: React.FC<{
  children: React.ReactNode;
  s?: number;
  dy?: number;
  dx?: number;
}> = ({ children, s: scale, dy = 0, dx = 0 }) => {
  const { W, H, PORTRAIT_SCALE } = useFrameSpec();
  const s = scale ?? PORTRAIT_SCALE;
  return (
    <div
      style={{
        position: 'absolute',
        left: (W - 1080 * s) / 2 + dx,
        top: (H - 1920 * s) / 2 + dy,
        width: 1080,
        height: 1920,
        transform: `scale(${s})`,
        transformOrigin: '0 0',
      }}
    >
      {children}
    </div>
  );
};
