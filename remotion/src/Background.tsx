import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Palette } from './props';

// Slow drifting glows over a diagonal gradient; motion is a pure function of the frame.

export function Background({ palette }: { palette: Palette }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(160deg, ${palette.from} 0%, ${palette.to} 100%)` }}
    >
      <Glow
        color={palette.accent}
        size={900}
        x={180 + Math.sin(t / 3) * 120}
        y={380 + Math.cos(t / 4) * 90}
      />
      <Glow
        color={palette.accent}
        size={700}
        x={820 + Math.cos(t / 5) * 100}
        y={1500 + Math.sin(t / 3.5) * 120}
      />
    </AbsoluteFill>
  );
}

function Glow({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        opacity: 0.13,
        filter: 'blur(160px)',
      }}
    />
  );
}
