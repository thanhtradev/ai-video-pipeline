import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HAND } from '../../kits/whatif/theme';
import { Grain } from '../../kits/whatif/ui';
import { DamDong, Nguoi, No, Toi } from './cast';

/**
 * Review still of the "Bóng" cast (D-111): TÔI, NÓ near and far, two other people and a crowd on
 * the night background. `npx remotion still src/channels.ts HorrorCast out.png`
 */
export const HorrorCastSheet: React.FC = () => (
  <AbsoluteFill style={{ background: '#1c1e2a' }}>
    <svg viewBox="0 0 1920 1080" width={1920} height={1080}>
      <rect width={1920} height={1080} fill="#1c1e2a" />
      <radialGradient id="castGlow">
        <stop offset="0" stopColor="#ffb86a" stopOpacity={0.25} />
        <stop offset="1" stopColor="#ffb86a" stopOpacity={0} />
      </radialGradient>
      <circle cx={420} cy={520} r={700} fill="url(#castGlow)" />
      <rect y={760} width={1920} height={320} fill="#2a2c38" />
      <Toi x={300} y={760} t={7} rimSide={-1} />
      <Nguoi k={1} x={560} y={760} t={7} rimSide={-1} />
      <Nguoi k={2} x={760} y={760} t={7} facing={-1} rimSide={-1} />
      <No x={1150} y={760} t={7} />
      <No x={1420} y={760} t={7} far />
      <DamDong y={760} x0={1560} x1={1900} n={3} t={7} />
      {[
        [300, 'TÔI'],
        [560, 'Nguoi 1'],
        [760, 'Nguoi 2'],
        [1150, 'NÓ'],
        [1420, 'NÓ (far)'],
        [1730, 'DamDong'],
      ].map(([x, label]) => (
        <text
          key={String(label)}
          x={Number(x)}
          y={830}
          textAnchor="middle"
          fontFamily={HAND}
          fontSize={30}
          fill="#b9b4a8"
        >
          {label}
        </text>
      ))}
    </svg>
    <Grain f={3} a={0.22} />
  </AbsoluteFill>
);
