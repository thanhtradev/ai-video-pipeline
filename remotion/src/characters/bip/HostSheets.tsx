import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Eyes, Pose } from '../../rig/Character';
import { FONT } from '../../kits/whatif/theme';
import { HOSTS, HostDef, hostById } from './hosts';

/** Review sheets (Still) for the science-channel host candidates. 1920×1080. */
const BG = '#5a5262';
const INK = '#f5efe6';
const MUTED = '#cfc6d6';
const W = 1920;
const H = 1080;
/** frame offset so blink/breath are mid-cycle on the still */
const T0 = 40;

const Label: React.FC<{ x: number; y: number; title: string; sub?: string; size?: number }> = ({
  x,
  y,
  title,
  sub,
  size = 34,
}) => (
  <g fontFamily={FONT} textAnchor="middle">
    <text x={x} y={y} fontSize={size} fontWeight={800} fill={INK}>
      {title}
    </text>
    {sub && (
      <text x={x} y={y + size * 0.95} fontSize={size * 0.62} fontWeight={600} fill={MUTED}>
        {sub}
      </text>
    )}
  </g>
);

/** All candidates in a row, front view. */
export const SciHostContact: React.FC = () => {
  const f = useCurrentFrame() + T0;
  const n = HOSTS.length;
  const gap = W / n;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={W} height={H}>
        <Label x={W / 2} y={90} title="Kênh khoa học – ứng viên nhân vật chính" size={44} />
        {HOSTS.map((h, i) => {
          const x = gap * (i + 0.5);
          return (
            <g key={h.id}>
              <h.Host x={x} y={760} size={0.9 * (h.props.size ?? 1)} t={f} blink={false} />
              <Label x={x} y={830} title={`${h.id}. ${h.name}`} sub={wrap(h.tagline, 24)[0]} />
              <text
                x={x}
                y={830 + 34 * 0.95 + 26}
                fontFamily={FONT}
                fontSize={21}
                fontWeight={600}
                fill={MUTED}
                textAnchor="middle"
              >
                {wrap(h.tagline, 24)[1] ?? ''}
              </text>
              <rect x={x - 24} y={905} width={48} height={48} rx={10} fill={h.hoodie} />
              <text x={x} y={990} fontFamily={FONT} fontSize={20} fill={MUTED} textAnchor="middle">
                {h.hoodie}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** Greedy two-line wrap at about `max` characters. */
const wrap = (s: string, max: number): readonly string[] => {
  if (s.length <= max) return [s];
  const cut = s.lastIndexOf(' ', max);
  return cut <= 0 ? [s] : [s.slice(0, cut), s.slice(cut + 1)];
};

type Cell = {
  readonly label: string;
  readonly eyes?: Eyes;
  readonly pose?: Pose;
  readonly facing?: number;
  readonly back?: boolean;
};
const CELLS: readonly Cell[] = [
  { label: 'đứng', eyes: 'normal' },
  { label: 'chỉ', pose: 'point', facing: 1 },
  { label: 'vui', eyes: 'happy', pose: 'armsUp' },
  { label: 'sốc', eyes: 'wide', facing: -1 },
  { label: 'đi (lưng)', pose: 'walk', facing: 1, back: true },
];

/** One candidate: poses/expressions + a big head close-up. */
export const SciHostSheet: React.FC<{ id: number }> = ({ id }) => {
  const f = useCurrentFrame() + T0;
  const h = hostById(id);
  if (!h) return <AbsoluteFill style={{ background: BG }} />;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={W} height={H}>
        <Label x={W / 2 - 300} y={90} title={`${h.id}. ${h.name}`} sub={h.tagline} size={48} />
        {CELLS.map((c, i) => (
          <g key={c.label}>
            <h.Host
              x={150 + i * 240}
              y={700}
              size={0.72 * (h.props.size ?? 1)}
              t={f + i * 7}
              blink={false}
              {...cellProps(c)}
            />
            <Label x={150 + i * 240} y={760} title={c.label} size={28} />
          </g>
        ))}
        <CloseUp h={h} t={f} />
        <foreignObject x={80} y={820} width={1100} height={220}>
          <div
            style={{
              fontFamily: FONT,
              color: MUTED,
              fontSize: 26,
              lineHeight: 1.35,
              fontWeight: 600,
            }}
          >
            {h.name.toUpperCase()}: {h.look}
          </div>
        </foreignObject>
      </svg>
    </AbsoluteFill>
  );
};

const cellProps = (c: Cell) => ({
  ...(c.eyes ? { eyes: c.eyes } : {}),
  ...(c.pose ? { pose: c.pose } : {}),
  ...(c.facing !== undefined ? { facing: c.facing } : {}),
  ...(c.back ? { back: true } : {}),
});

/** Head close-up so the accessory reads: the head centre sits in the middle of the box. */
const CLOSEUP_SCALE = 1.6;
const CLOSEUP_BOX = { x: 1300, y: 120, w: 540, h: 620 } as const;
/** head centre is HEAD_Y (468) above the heels at size 1 */
const HEAD_CENTRE_ABOVE_HEELS = 468;
const CloseUp: React.FC<{ h: HostDef; t: number }> = ({ h, t }) => {
  const size = CLOSEUP_SCALE * (h.props.size ?? 1);
  const y = CLOSEUP_BOX.y + CLOSEUP_BOX.h / 2 + HEAD_CENTRE_ABOVE_HEELS * size;
  return (
    <g>
      <clipPath id="sci-closeup">
        <rect x={1300} y={120} width={540} height={620} rx={30} />
      </clipPath>
      <rect x={1300} y={120} width={540} height={620} rx={30} fill="#4b4453" />
      <g clipPath="url(#sci-closeup)">
        <h.Host x={1570} y={y} size={size} t={t} blink={false} shadow={false} />
      </g>
      <Label x={1570} y={800} title="cận mặt" size={28} />
    </g>
  );
};
